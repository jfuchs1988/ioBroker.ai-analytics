// admin/tab.js
let socket;
let namespace;

function formatMessageLine(entry) {
    return `[${entry.role}] ${entry.text}`;
}

function resolveNamespaceFromQuery(searchString) {
    const params = new URLSearchParams(searchString || '');
    const instance = params.get('instance') || params.get('i') || '0';
    return `ai-analytics.${instance}`;
}

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];

function filterEntries(entries, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
        const haystack = [
            entry.sourceId,
            entry.description,
            entry.category,
            entry.room,
            entry.needsReview ? 'needsreview' : '',
            entry.active === false ? 'inactive' : 'active',
            entry.ignored ? 'ignored' : '',
        ]
            .join(' ')
            .toLowerCase();
        return haystack.includes(q);
    });
}

function formatBudgetLine(usage, dailyTokenBudget, today = new Date().toISOString().slice(0, 10)) {
    const isStale = !!(usage && usage.date && usage.date !== today);
    const tokensToday = isStale ? 0 : (usage && usage.tokensToday) || 0;
    const budget = Number(dailyTokenBudget) || 0;
    if (budget <= 0) {
        return `Heute genutzt: ${tokensToday} Tokens (kein Limit)`;
    }
    return `Heute genutzt: ${tokensToday} / ${budget} Tokens`;
}

function computeRangeHistory(history, days) {
    const sorted = [...(history || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!days) return sorted;
    return sorted.slice(-days);
}

function computeCost(rangeEntries, prices) {
    const p = prices || {};
    let chatCost = 0;
    let onboardingCost = 0;
    (rangeEntries || []).forEach((entry) => {
        const chat = entry.chat || { inputTokens: 0, outputTokens: 0 };
        const onboarding = entry.onboarding || { inputTokens: 0, outputTokens: 0 };
        chatCost += ((chat.inputTokens || 0) * (p.chatIn || 0)) / 1000000 + ((chat.outputTokens || 0) * (p.chatOut || 0)) / 1000000;
        onboardingCost +=
            ((onboarding.inputTokens || 0) * (p.onboardingIn || 0)) / 1000000 +
            ((onboarding.outputTokens || 0) * (p.onboardingOut || 0)) / 1000000;
    });
    return { chatCost, onboardingCost, totalCost: chatCost + onboardingCost };
}

function sumDailyTokens(entry) {
    const chat = entry.chat || { inputTokens: 0, outputTokens: 0 };
    const onboarding = entry.onboarding || { inputTokens: 0, outputTokens: 0 };
    return (chat.inputTokens || 0) + (chat.outputTokens || 0) + (onboarding.inputTokens || 0) + (onboarding.outputTokens || 0);
}

function recommendLimits(rangeEntries) {
    const entries = rangeEntries || [];
    if (entries.length < 3) return null;
    const maxDaily = Math.max(...entries.map(sumDailyTokens));
    const dailyTokens = Math.ceil(maxDaily * 1.2);
    const hourlyTokens = Math.ceil(dailyTokens / 24);
    return { dailyTokens, hourlyTokens };
}

function formatCostLine(cost) {
    const format = (n) => n.toFixed(4);
    return `Kosten im Zeitraum: ${format(cost.totalCost)} (Chat: ${format(cost.chatCost)}, Onboarding: ${format(cost.onboardingCost)})`;
}

function formatRecommendationLine(recommendation) {
    if (!recommendation) {
        return 'Noch nicht genug Daten fuer eine Empfehlung.';
    }
    return `Empfehlung (basierend auf bisherigem Verbrauch, kein hartes Limit): ${recommendation.dailyTokens} Tokens/Tag, ${recommendation.hourlyTokens} Tokens/Stunde`;
}

function renderHistory(history) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    (history || []).forEach((entry) => {
        const line = document.createElement('div');
        line.className = `chat-message chat-message-${entry.role}`;
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = entry.text;
        const time = document.createElement('div');
        time.className = 'chat-timestamp';
        time.textContent = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
        line.appendChild(bubble);
        line.appendChild(time);
        container.appendChild(line);
    });
    container.scrollTop = container.scrollHeight;
}

function showConnectionError(message) {
    const container = document.getElementById('chat-messages');
    if (container) {
        container.textContent = message;
    }
    console.error(`[ai-analytics tab] ${message}`);
}

function setLoading(isLoading) {
    const button = document.getElementById('chat-send');
    if (button) {
        button.disabled = isLoading;
        button.textContent = isLoading ? '...' : 'Senden';
    }
}

let allDeviceEntries = [];
let budgetHistory = [];
let budgetPrices = { chatIn: 0, chatOut: 0, onboardingIn: 0, onboardingOut: 0 };
let budgetRangeDays = 30;

function showDevicesError(message) {
    const status = document.getElementById('devices-status');
    if (status) status.textContent = `[Fehler] ${message}`;
}

function renderDeviceRow(entry) {
    const row = document.createElement('tr');
    const classes = [];
    if (entry.active === false) classes.push('device-inactive');
    if (entry.ignored) classes.push('device-ignored');
    row.className = classes.join(' ');

    const idCell = document.createElement('td');
    idCell.textContent = entry.sourceId;
    row.appendChild(idCell);

    const descCell = document.createElement('td');
    descCell.textContent = entry.description || '';
    row.appendChild(descCell);

    const categorySelect = document.createElement('select');
    CATEGORIES.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        if (category === entry.category) option.selected = true;
        categorySelect.appendChild(option);
    });
    const categoryCell = document.createElement('td');
    categoryCell.appendChild(categorySelect);
    row.appendChild(categoryCell);

    const roomInput = document.createElement('input');
    roomInput.type = 'text';
    roomInput.value = entry.room || '';
    const roomCell = document.createElement('td');
    roomCell.appendChild(roomInput);
    row.appendChild(roomCell);

    const statusCell = document.createElement('td');
    const statusParts = [];
    if (entry.active === false) statusParts.push('inaktiv');
    if (entry.ignored) statusParts.push('ignoriert');
    if (entry.needsReview) statusParts.push('needsReview');
    statusCell.textContent = statusParts.join(', ') || 'aktiv';
    row.appendChild(statusCell);

    const actionsCell = document.createElement('td');

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Speichern';
    saveButton.addEventListener('click', () => {
        socket.emit(
            'sendTo',
            namespace,
            'updateCatalogEntryAdmin',
            { sourceId: entry.sourceId, category: categorySelect.value, room: roomInput.value },
            (response) => {
                if (response && response.error) {
                    showDevicesError(response.error);
                } else {
                    loadDevices();
                }
            }
        );
    });
    actionsCell.appendChild(saveButton);

    const toggleButton = document.createElement('button');
    toggleButton.textContent = entry.ignored ? 'Aktivieren' : 'Ignorieren';
    toggleButton.addEventListener('click', () => {
        socket.emit(
            'sendTo',
            namespace,
            'updateCatalogEntryAdmin',
            { sourceId: entry.sourceId, ignored: !entry.ignored },
            (response) => {
                if (response && response.error) {
                    showDevicesError(response.error);
                } else {
                    loadDevices();
                }
            }
        );
    });
    actionsCell.appendChild(toggleButton);

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Entfernen';
    removeButton.addEventListener('click', () => {
        socket.emit('sendTo', namespace, 'removeCatalogEntry', { sourceId: entry.sourceId }, (response) => {
            if (response && response.error) {
                showDevicesError(response.error);
            } else {
                loadDevices();
            }
        });
    });
    actionsCell.appendChild(removeButton);

    row.appendChild(actionsCell);

    return row;
}

function renderDevicesTable() {
    const filterInput = document.getElementById('devices-filter');
    const visible = filterEntries(allDeviceEntries, filterInput ? filterInput.value : '');
    const tbody = document.getElementById('devices-tbody');
    tbody.innerHTML = '';
    visible.forEach((entry) => tbody.appendChild(renderDeviceRow(entry)));
}

function loadDevices() {
    socket.emit('sendTo', namespace, 'listCatalogEntries', {}, (response) => {
        allDeviceEntries = (response && response.entries) || [];
        renderDevicesTable();
    });
}

function triggerRescan() {
    const status = document.getElementById('devices-status');
    status.textContent = 'Re-Scan laeuft...';
    socket.emit('sendTo', namespace, 'runDiscoveryNow', {}, (response) => {
        if (!response) {
            showDevicesError('Keine Antwort vom Adapter erhalten.');
            return;
        }
        if (response.error) {
            showDevicesError(response.error);
            return;
        }
        if (response.skipped) {
            const reason = response.skipReason || 'Onboarding-Modell nicht erreichbar.';
            status.textContent = `Re-Scan uebersprungen: ${reason} (${response.reactivatedCount} reaktiviert).`;
        } else {
            status.textContent = `Re-Scan fertig: ${response.newCount} neu, ${response.reactivatedCount} reaktiviert.`;
        }
        loadDevices();
    });
}

function triggerProactiveCheck() {
    const status = document.getElementById('devices-status');
    status.textContent = 'Pruefung wird gestartet...';
    socket.emit('sendTo', namespace, 'runProactiveCheckNow', {}, (response) => {
        if (!response) {
            showDevicesError('Keine Antwort vom Adapter erhalten.');
            return;
        }
        if (response.error) {
            showDevicesError(response.error);
            return;
        }
        if (!response.triggered) {
            status.textContent = `Pruefung uebersprungen: ${response.reason || 'Chat-Modell nicht erreichbar.'}`;
            return;
        }
        status.textContent = 'Pruefung gestartet, Ergebnis erscheint im Chat.';
    });
}

function renderBudgetChart(rangeEntries) {
    const container = document.getElementById('budget-chart');
    if (!container) return;
    container.innerHTML = '';
    const totals = rangeEntries.map(sumDailyTokens);
    const max = Math.max(1, ...totals);
    rangeEntries.forEach((entry, index) => {
        const bar = document.createElement('div');
        bar.className = 'budget-bar';
        bar.style.height = `${Math.round((totals[index] / max) * 100)}%`;
        bar.title = `${entry.date}: ${totals[index]} Tokens`;
        container.appendChild(bar);
    });
}

function renderBudgetExtras() {
    const rangeEntries = computeRangeHistory(budgetHistory, budgetRangeDays);
    renderBudgetChart(rangeEntries);
    const cost = computeCost(rangeEntries, budgetPrices);
    const costLine = document.getElementById('budget-cost-line');
    if (costLine) costLine.textContent = formatCostLine(cost);
    const recLine = document.getElementById('budget-recommendation-line');
    if (recLine) recLine.textContent = formatRecommendationLine(recommendLimits(rangeEntries));
}

function showBudgetRange30() {
    budgetRangeDays = 30;
    document.getElementById('budget-range-30').classList.add('active');
    document.getElementById('budget-range-all').classList.remove('active');
    renderBudgetExtras();
}

function showBudgetRangeAll() {
    budgetRangeDays = null;
    document.getElementById('budget-range-all').classList.add('active');
    document.getElementById('budget-range-30').classList.remove('active');
    renderBudgetExtras();
}

function loadBudget() {
    const display = document.getElementById('budget-display');
    socket.emit('getState', `${namespace}.usage.today`, (usageErr, usageState) => {
        let usage = { tokensToday: 0 };
        if (!usageErr && usageState && usageState.val) {
            try {
                usage = JSON.parse(usageState.val);
            } catch (parseError) {
                usage = { tokensToday: 0 };
            }
        }
        socket.emit('getState', `${namespace}.usage.history`, (historyErr, historyState) => {
            let history = [];
            if (!historyErr && historyState && historyState.val) {
                try {
                    const parsed = JSON.parse(historyState.val);
                    history = Array.isArray(parsed) ? parsed : [];
                } catch (parseError) {
                    history = [];
                }
            }
            budgetHistory = history;
            socket.emit('getObject', `system.adapter.${namespace}`, (objErr, instanceObj) => {
                const native = !objErr && instanceObj && instanceObj.native ? instanceObj.native : {};
                display.textContent = formatBudgetLine(usage, native.dailyTokenBudget);
                budgetPrices = {
                    chatIn: native.chatPricePerMillionInputTokens || 0,
                    chatOut: native.chatPricePerMillionOutputTokens || 0,
                    onboardingIn: native.onboardingPricePerMillionInputTokens || 0,
                    onboardingOut: native.onboardingPricePerMillionOutputTokens || 0,
                };
                renderBudgetExtras();
            });
        });
    });
}

function showSection(section) {
    ['chat', 'devices', 'budget'].forEach((name) => {
        const el = document.getElementById(`section-${name}`);
        if (el) el.hidden = name !== section;
    });
    document.querySelectorAll('.nav-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.section === section);
    });
    if (section === 'devices') loadDevices();
    if (section === 'budget') loadBudget();
}

function loadHistory() {
    socket.emit('getState', `${namespace}.chat.history`, (err, state) => {
        if (!err && state && state.val) {
            renderHistory(JSON.parse(state.val));
        }
    });
}

function sendQuestion() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    setLoading(true);

    socket.emit('sendTo', namespace, 'chatQuestion', { text }, (response) => {
        setLoading(false);
        if (response && response.history) {
            renderHistory(response.history);
        } else if (response && response.error) {
            const container = document.getElementById('chat-messages');
            const line = document.createElement('div');
            line.textContent = `[Fehler] ${response.error}`;
            container.appendChild(line);
        }
    });
}

function resolveConnection() {
    console.log('[ai-analytics tab] Versuche Verbindung herzustellen...');
    if (window.parent && window.parent !== window && window.parent.socket) {
        console.log('[ai-analytics tab] Verwende socket vom Elternfenster (parent.socket).');
        return window.parent.socket;
    }
    if (typeof io !== 'undefined') {
        console.log('[ai-analytics tab] Verwende eigenes io.connect() (same-origin).');
        return io.connect();
    }
    return null;
}

function init() {
    namespace = resolveNamespaceFromQuery(window.location.search);
    socket = resolveConnection();

    if (!socket) {
        showConnectionError('Verbindung zu ioBroker konnte nicht hergestellt werden.');
        return;
    }

    loadHistory();
    document.getElementById('chat-send').addEventListener('click', sendQuestion);
    document.getElementById('chat-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') sendQuestion();
    });
    document.querySelectorAll('.nav-btn').forEach((button) => {
        button.addEventListener('click', () => showSection(button.dataset.section));
    });
    document.getElementById('devices-rescan').addEventListener('click', triggerRescan);
    document.getElementById('devices-check-now').addEventListener('click', triggerProactiveCheck);
    document.getElementById('devices-filter').addEventListener('input', renderDevicesTable);
    document.getElementById('budget-range-30').addEventListener('click', showBudgetRange30);
    document.getElementById('budget-range-all').addEventListener('click', showBudgetRangeAll);
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined') {
    module.exports = {
        formatMessageLine,
        resolveNamespaceFromQuery,
        filterEntries,
        formatBudgetLine,
        computeRangeHistory,
        computeCost,
        recommendLimits,
        formatCostLine,
        formatRecommendationLine,
        CATEGORIES,
    };
}
