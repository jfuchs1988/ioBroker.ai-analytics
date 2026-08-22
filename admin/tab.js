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

function formatBudgetLine(usage, dailyTokenBudget) {
    const tokensToday = (usage && usage.tokensToday) || 0;
    const budget = Number(dailyTokenBudget) || 0;
    if (budget <= 0) {
        return `Heute genutzt: ${tokensToday} Tokens (kein Limit)`;
    }
    return `Heute genutzt: ${tokensToday} / ${budget} Tokens`;
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
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined') {
    module.exports = { formatMessageLine, resolveNamespaceFromQuery, filterEntries, formatBudgetLine, CATEGORIES };
}
