'use strict';

const CHAT_HISTORY_STATE = 'chat.history';
const MAX_MESSAGES = 200;

async function ensureChatHistoryState(adapter) {
    await adapter.setObjectNotExistsAsync(CHAT_HISTORY_STATE, {
        type: 'state',
        common: { name: 'Chat History', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
}

async function appendChatMessage(adapter, role, text) {
    const state = await adapter.getStateAsync(CHAT_HISTORY_STATE);
    const history = state && state.val ? JSON.parse(state.val) : [];
    history.push({ role, text, timestamp: Date.now() });
    const trimmed = history.slice(-MAX_MESSAGES);
    await adapter.setStateAsync(CHAT_HISTORY_STATE, { val: JSON.stringify(trimmed), ack: true });
    return trimmed;
}

async function getRecentChatHistory(adapter, limit) {
    const state = await adapter.getStateAsync(CHAT_HISTORY_STATE);
    const history = state && state.val ? JSON.parse(state.val) : [];
    return history.slice(-limit);
}

module.exports = { ensureChatHistoryState, appendChatMessage, getRecentChatHistory, CHAT_HISTORY_STATE };
