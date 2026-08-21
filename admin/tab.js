// admin/tab.js
let socket;
let namespace;

function formatMessageLine(entry) {
    return `[${entry.role}] ${entry.text}`;
}

function renderHistory(history) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    (history || []).forEach((entry) => {
        const line = document.createElement('div');
        line.textContent = formatMessageLine(entry);
        container.appendChild(line);
    });
    container.scrollTop = container.scrollHeight;
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

    socket.emit('sendTo', namespace, 'chatQuestion', { text }, (response) => {
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

function init(socketInstance, adapterNamespace) {
    socket = socketInstance;
    namespace = adapterNamespace;
    loadHistory();
    document.getElementById('chat-send').addEventListener('click', sendQuestion);
    document.getElementById('chat-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') sendQuestion();
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        if (typeof io !== 'undefined' && typeof adapterNamespace !== 'undefined') {
            init(io.connect(), adapterNamespace);
        }
    });
}

if (typeof module !== 'undefined') {
    module.exports = { formatMessageLine };
}
