'use strict';

const CHAT_HISTORY_STATE = 'chat.history';
const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 256 * 1024;
const appendQueues = new WeakMap();

async function ensureChatHistoryState(adapter) {
    await adapter.setObjectNotExistsAsync(CHAT_HISTORY_STATE, {
        type: 'state',
        common: { name: 'Chat History', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
}

function parseHistory(state) {
    if (!state || typeof state.val !== 'string' || !state.val) return [];
    try {
        const parsed = JSON.parse(state.val);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

async function appendChatMessageUnlocked(adapter, role, text, metadata = undefined) {
    if (!['user', 'assistant'].includes(role)) throw new TypeError('Ungueltige Chat-Rolle.');
    if (typeof text !== 'string' || text.length > MAX_MESSAGE_LENGTH) throw new TypeError('Ungueltige Chat-Nachricht.');
    const state = await adapter.getStateAsync(CHAT_HISTORY_STATE);
    const history = parseHistory(state);
    const entry = { role, text, timestamp: Date.now() };
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        if (metadata.usage) entry.usage = metadata.usage;
        if (Number.isFinite(metadata.cost)) entry.cost = metadata.cost;
    }
    history.push(entry);
    const trimmed = history.slice(-MAX_MESSAGES);
    await adapter.setStateAsync(CHAT_HISTORY_STATE, { val: JSON.stringify(trimmed), ack: true });
    return trimmed;
}

function appendChatMessage(adapter, role, text, metadata) {
    const previous = appendQueues.get(adapter) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => appendChatMessageUnlocked(adapter, role, text, metadata));
    appendQueues.set(adapter, next);
    return next.finally(() => {
        if (appendQueues.get(adapter) === next) appendQueues.delete(adapter);
    });
}

async function getRecentChatHistory(adapter, limit) {
    const state = await adapter.getStateAsync(CHAT_HISTORY_STATE);
    const history = parseHistory(state);
    const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, MAX_MESSAGES) : MAX_MESSAGES;
    return history.slice(-safeLimit);
}

module.exports = { ensureChatHistoryState, appendChatMessage, getRecentChatHistory, CHAT_HISTORY_STATE };
