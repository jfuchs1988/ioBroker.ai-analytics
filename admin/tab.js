// admin/tab.js
let socket;
let namespace;

const SENDTO_TIMEOUT_MS = 12000;
const BRIDGE_POLL_INTERVAL_MS = 400;
const BRIDGE_TIMEOUT_FAST_MS = 60000;
const BRIDGE_TIMEOUT_SLOW_MS = 300000;
const SLOW_COMMANDS = ['chatQuestion', 'runDiscoveryNow', 'runProactiveCheckNow'];
const BUDGET_REFRESH_INTERVAL_MS = 20000;

function formatMessageLine(entry) {
    return `[${entry.role}] ${entry.text}`;
}

function resolveNamespaceFromQuery(searchString) {
    const params = new URLSearchParams(searchString || '');
    const instance = params.get('instance') || params.get('i') || '0';
    return `ai-analytics.${instance}`;
}

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];

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

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.value = entry.description || '';
    const descCell = document.createElement('td');
    descCell.appendChild(descInput);
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

    const valueKindSelect = document.createElement('select');
    const unclassifiedOption = document.createElement('option');
    unclassifiedOption.value = '';
    unclassifiedOption.textContent = '– nicht klassifiziert –';
    if (!entry.valueKind) unclassifiedOption.selected = true;
    valueKindSelect.appendChild(unclassifiedOption);
    VALUE_KINDS.forEach((kind) => {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = kind;
        if (kind === entry.valueKind) option.selected = true;
        valueKindSelect.appendChild(option);
    });
    const valueKindCell = document.createElement('td');
    valueKindCell.appendChild(valueKindSelect);
    row.appendChild(valueKindCell);

    const unitCell = document.createElement('td');
    unitCell.textContent = entry.unit || '';
    row.appendChild(unitCell);

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
    saveButton.addEventListener('click', async () => {
        try {
            await callAdapter('updateCatalogEntryAdmin', {
                sourceId: entry.sourceId,
                category: categorySelect.value,
                room: roomInput.value,
                description: descInput.value,
                ...(valueKindSelect.value ? { valueKind: valueKindSelect.value } : {}),
            });
            loadDevices();
        } catch (error) {
            showDevicesError(error.message);
        }
    });
    actionsCell.appendChild(saveButton);

    const toggleButton = document.createElement('button');
    toggleButton.textContent = entry.ignored ? 'Aktivieren' : 'Ignorieren';
    toggleButton.addEventListener('click', async () => {
        try {
            await callAdapter('updateCatalogEntryAdmin', { sourceId: entry.sourceId, ignored: !entry.ignored });
            loadDevices();
        } catch (error) {
            showDevicesError(error.message);
        }
    });
    actionsCell.appendChild(toggleButton);

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Entfernen';
    removeButton.addEventListener('click', async () => {
        try {
            await callAdapter('removeCatalogEntry', { sourceId: entry.sourceId });
            loadDevices();
        } catch (error) {
            showDevicesError(error.message);
        }
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

async function loadDevices() {
    try {
        const response = await callAdapter('listCatalogEntries', {});
        allDeviceEntries = (response && response.entries) || [];
        renderDevicesTable();
    } catch (error) {
        allDeviceEntries = [];
        renderDevicesTable();
        showDevicesError(error.message);
    }
}

async function triggerRescan() {
    const status = document.getElementById('devices-status');
    status.textContent = 'Re-Scan laeuft... (Klassifikation kann bei vielen neuen Objekten einige Minuten dauern)';
    try {
        const response = await callAdapter('runDiscoveryNow', {});
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
    } catch (error) {
        showDevicesError(error.message);
    }
}

async function triggerProactiveCheck() {
    const status = document.getElementById('devices-status');
    status.textContent = 'Pruefung wird gestartet...';
    try {
        const response = await callAdapter('runProactiveCheckNow', {});
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
    } catch (error) {
        showDevicesError(error.message);
    }
}

function renderBudgetChart(rangeEntries) {
    const container = document.getElementById('budget-chart');
    const emptyMsg = document.getElementById('budget-chart-empty');
    if (!container) return;
    container.innerHTML = '';
    if (!rangeEntries || !rangeEntries.length) {
        container.hidden = true;
        if (emptyMsg) emptyMsg.hidden = false;
        return;
    }
    container.hidden = false;
    if (emptyMsg) emptyMsg.hidden = true;
    const totals = rangeEntries.map(sumDailyTokens);
    const max = Math.max(1, ...totals);
    rangeEntries.forEach((entry, index) => {
        const bar = document.createElement('div');
        bar.className = 'budget-bar';
        bar.style.height = `${Math.max(2, Math.round((totals[index] / max) * 100))}%`;
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
    const btn30 = document.getElementById('budget-range-30');
    if (btn30) btn30.classList.add('active');
    const btnAll = document.getElementById('budget-range-all');
    if (btnAll) btnAll.classList.remove('active');
    renderBudgetExtras();
}

function showBudgetRangeAll() {
    budgetRangeDays = null;
    const btnAll = document.getElementById('budget-range-all');
    if (btnAll) btnAll.classList.add('active');
    const btn30 = document.getElementById('budget-range-30');
    if (btn30) btn30.classList.remove('active');
    renderBudgetExtras();
}

function toggleBudgetDetails() {
    const details = document.getElementById('budget-details');
    if (!details) return;
    details.hidden = !details.hidden;
    if (!details.hidden) renderBudgetExtras();
}

function loadBudget() {
    const display = document.getElementById('budget-summary-bar');
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
                    chatIn: Number(native.chatPricePerMillionInputTokens) || 0,
                    chatOut: Number(native.chatPricePerMillionOutputTokens) || 0,
                    onboardingIn: Number(native.onboardingPricePerMillionInputTokens) || 0,
                    onboardingOut: Number(native.onboardingPricePerMillionOutputTokens) || 0,
                };
                renderBudgetExtras();
            });
        });
    });
}

function loadHistory() {
    socket.emit('getState', `${namespace}.chat.history`, (err, state) => {
        if (err || !state || !state.val) return;
        try {
            renderHistory(JSON.parse(state.val));
        } catch (parseError) {
            console.error(`[ai-analytics tab] chat.history nicht lesbar: ${parseError.message}`);
        }
    });
}

function appendChatError(message) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const line = document.createElement('div');
    line.className = 'chat-message chat-message-assistant';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = `[Fehler] ${message}`;
    line.appendChild(bubble);
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
}

/**
 * `chatQuestion` liefert bei Erfolg die getrimmte Chat-History direkt als Array
 * (Rueckgabewert von appendChatMessage in lib/chatLog.js), nicht als {history: [...]}.
 */
function extractChatHistory(response) {
    if (Array.isArray(response)) return response;
    if (response && Array.isArray(response.history)) return response.history;
    return null;
}

async function sendQuestion() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    setLoading(true);

    try {
        const response = await callAdapter('chatQuestion', { text });
        const history = extractChatHistory(response);
        if (history) {
            renderHistory(history);
        } else if (response && response.error) {
            appendChatError(response.error);
        }
        loadBudget();
    } catch (error) {
        appendChatError(error.message);
    } finally {
        setLoading(false);
    }
}

function resolveConnection() {
    console.log('[ai-analytics tab] Versuche Verbindung herzustellen...');
    const parentWindow = window.parent && window.parent !== window ? window.parent : null;
    if (parentWindow && parentWindow.socket && typeof parentWindow.socket.emit === 'function') {
        console.log('[ai-analytics tab] Verwende socket vom Elternfenster (parent.socket).');
        return parentWindow.socket;
    }
    if (parentWindow && parentWindow.socketIo) {
        // React-Admin exponiert die Connection-Instanz als window.socketIo; der rohen
        // socket.io-Client darunter ist .socket (mit emit), nicht die Connection selbst.
        const rawSocket = parentWindow.socketIo.socket;
        if (rawSocket && typeof rawSocket.emit === 'function') {
            console.log('[ai-analytics tab] Verwende raw socket vom Elternfenster (parent.socketIo.socket).');
            return rawSocket;
        }
    }
    if (typeof io !== 'undefined') {
        console.log('[ai-analytics tab] Verwende eigenes io.connect() (same-origin).');
        return io.connect();
    }
    return null;
}

function emitSendTo(command, message, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Keine Antwort auf '${command}' nach ${timeoutMs} ms`));
        }, timeoutMs);
        try {
            socket.emit('sendTo', namespace, command, message, (response) => {
                clearTimeout(timer);
                resolve(response);
            });
        } catch (error) {
            clearTimeout(timer);
            reject(error);
        }
    });
}

function bridgeEmitRequest(requestId, command, message) {
    return new Promise((resolve, reject) => {
        try {
            socket.emit(
                'setState',
                `${namespace}.admin.bridge`,
                { val: JSON.stringify({ id: requestId, command, message }), ack: false },
                (err) => {
                    if (err) {
                        reject(new Error(`Bridge-Zugriff verweigert: ${typeof err === 'string' ? err : JSON.stringify(err)}`));
                    } else {
                        resolve();
                    }
                }
            );
        } catch (error) {
            reject(error);
        }
    });
}

function bridgeReadState() {
    return new Promise((resolve) => {
        try {
            socket.emit('getState', `${namespace}.admin.bridge`, (err, state) => {
                resolve(err ? null : state);
            });
        } catch (error) {
            resolve(null);
        }
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wertet einen gelesenen Bridge-State als Antwort auf `requestId` aus, oder null,
 * wenn der State (noch) keine solche Antwort enthaelt.
 *
 * Der Bridge-State wird sowohl fuer die Anfrage (vom Tab geschrieben, ack:false) als
 * auch fuer die Antwort (vom Adapter geschrieben, ack:true) verwendet. Beide haben
 * dieselbe `id`, aber nur die Antwort hat `ok`/`result`/`error`. Ohne den ack-Check
 * liest die erste Polling-Runde fast immer die eigene, gerade erst geschriebene
 * Anfrage zurueck (id passt, `ok` ist undefined -> faelschlich als Fehlschlag gewertet).
 */
function parseBridgeResponse(state, requestId) {
    if (!state || state.ack !== true || typeof state.val !== 'string') return null;
    let parsed;
    try {
        parsed = JSON.parse(state.val);
    } catch (parseError) {
        return null;
    }
    if (!parsed || parsed.id !== requestId) return null;
    return parsed;
}

let bridgeQueue = Promise.resolve();

/**
 * Ein Befehl ueber den State-Bridge-Kanal. Anfragen werden serialisiert, damit sich
 * Request/Response-Austausch an dem einen Bridge-State nicht ueberlappen.
 * Liefert das Ergebnisobjekt oder wirft bei {ok:false} bzw. Zeitueberschreitung.
 */
function bridgeCall(command, message, timeoutMs) {
    const run = bridgeQueue.then(async () => {
        const requestId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await bridgeEmitRequest(requestId, command, message);

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const state = await bridgeReadState();
            const parsed = parseBridgeResponse(state, requestId);
            if (parsed) {
                if (parsed.ok) {
                    return parsed.result;
                }
                throw new Error(parsed.error || 'Unbekannter Fehler (State-Bridge)');
            }
            await sleep(BRIDGE_POLL_INTERVAL_MS);
        }
        throw new Error(`Keine Antwort auf '${command}' über die State-Bridge nach ${timeoutMs} ms`);
    });
    bridgeQueue = run.catch(() => {});
    return run;
}

/**
 * Zentraler Transport fuer alle Adapter-Befehle:
 * 1. sendTo (idiomatisch, schnell) — mit kurzem Timeout.
 * 2. Bei Ausbleiben: State-Bridge (getState/setState sind im Legacy-Tab bewusst
 *    funktionsfaehig; sendTo dort nachweislich nicht).
 * Langlaufende Befehle (LLM-Latenz!) gehen direkt per Bridge, damit kein Doppel-Aufruf
 * entsteht, wenn sendTo spaet statt nie antwortet.
 */
async function callAdapter(command, message) {
    if (!socket) {
        throw new Error('Keine Verbindung zu ioBroker.');
    }

    const bridgeTimeoutMs = SLOW_COMMANDS.includes(command) ? BRIDGE_TIMEOUT_SLOW_MS : BRIDGE_TIMEOUT_FAST_MS;

    if (!SLOW_COMMANDS.includes(command)) {
        try {
            const response = await emitSendTo(command, message, SENDTO_TIMEOUT_MS);
            console.log(`[ai-analytics tab] '${command}' über sendTo beantwortet.`);
            return response;
        } catch (error) {
            console.log(`[ai-analytics tab] '${command}' über sendTo fehlgeschlagen (${error.message}), Fallback auf State-Bridge.`);
        }
    }

    console.log(`[ai-analytics tab] '${command}' über State-Bridge.`);
    return bridgeCall(command, message, bridgeTimeoutMs);
}

function init() {
    namespace = resolveNamespaceFromQuery(window.location.search);
    socket = resolveConnection();

    if (!socket) {
        showConnectionError('Verbindung zu ioBroker konnte nicht hergestellt werden.');
        return;
    }

    loadHistory();
    loadBudget();
    document.getElementById('chat-send').addEventListener('click', sendQuestion);
    document.getElementById('chat-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') sendQuestion();
    });
    document.getElementById('budget-details-toggle').addEventListener('click', toggleBudgetDetails);
    document.getElementById('budget-range-30').addEventListener('click', showBudgetRange30);
    document.getElementById('budget-range-all').addEventListener('click', showBudgetRangeAll);
    setInterval(loadBudget, BUDGET_REFRESH_INTERVAL_MS);
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
        parseBridgeResponse,
        extractChatHistory,
    };
}
