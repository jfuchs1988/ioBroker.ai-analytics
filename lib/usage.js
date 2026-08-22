'use strict';

const USAGE_STATE = 'usage.today';
const HISTORY_STATE = 'usage.history';

function todayString() {
    return new Date().toISOString().slice(0, 10);
}

async function ensureUsageState(adapter) {
    await adapter.setObjectNotExistsAsync(USAGE_STATE, {
        type: 'state',
        common: { name: 'Token usage today', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(HISTORY_STATE, {
        type: 'state',
        common: { name: 'Token usage history (per day)', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
}

async function getTodayUsage(adapter) {
    const state = await adapter.getStateAsync(USAGE_STATE);
    const today = todayString();
    if (!state || !state.val) {
        return { date: today, tokensToday: 0 };
    }
    const stored = JSON.parse(state.val);
    if (stored.date !== today) {
        return { date: today, tokensToday: 0 };
    }
    return stored;
}

async function getUsageHistory(adapter) {
    const state = await adapter.getStateAsync(HISTORY_STATE);
    if (!state || !state.val) {
        return [];
    }
    try {
        const parsed = JSON.parse(state.val);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function emptyPurposeTotals() {
    return { inputTokens: 0, outputTokens: 0 };
}

async function recordHistoryEntry(adapter, usage, purpose) {
    const today = todayString();
    const history = await getUsageHistory(adapter);
    let entry = history.find((item) => item.date === today);
    if (!entry) {
        entry = { date: today, chat: emptyPurposeTotals(), onboarding: emptyPurposeTotals() };
        history.push(entry);
    }
    if (!entry[purpose]) {
        entry[purpose] = emptyPurposeTotals();
    }
    entry[purpose].inputTokens += usage.inputTokens || 0;
    entry[purpose].outputTokens += usage.outputTokens || 0;
    await adapter.setStateAsync(HISTORY_STATE, { val: JSON.stringify(history), ack: true });
}

async function recordUsage(adapter, usage, purpose = 'chat') {
    const current = await getTodayUsage(adapter);
    const added = (usage.inputTokens || 0) + (usage.outputTokens || 0);
    const updated = { date: current.date, tokensToday: current.tokensToday + added };
    await adapter.setStateAsync(USAGE_STATE, { val: JSON.stringify(updated), ack: true });
    await recordHistoryEntry(adapter, usage, purpose);
    return updated;
}

async function isBudgetExceeded(adapter) {
    const budget = Number(adapter.config && adapter.config.dailyTokenBudget);
    if (!budget || budget <= 0) {
        return false;
    }
    const current = await getTodayUsage(adapter);
    return current.tokensToday >= budget;
}

module.exports = {
    ensureUsageState,
    recordUsage,
    getTodayUsage,
    getUsageHistory,
    isBudgetExceeded,
    USAGE_STATE,
    HISTORY_STATE,
};
