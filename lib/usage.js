'use strict';

const USAGE_STATE = 'usage.today';

function todayString() {
    return new Date().toISOString().slice(0, 10);
}

async function ensureUsageState(adapter) {
    await adapter.setObjectNotExistsAsync(USAGE_STATE, {
        type: 'state',
        common: { name: 'Token usage today', type: 'string', role: 'json', read: true, write: false },
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

async function recordUsage(adapter, usage) {
    const current = await getTodayUsage(adapter);
    const added = (usage.inputTokens || 0) + (usage.outputTokens || 0);
    const updated = { date: current.date, tokensToday: current.tokensToday + added };
    await adapter.setStateAsync(USAGE_STATE, { val: JSON.stringify(updated), ack: true });
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

module.exports = { ensureUsageState, recordUsage, getTodayUsage, isBudgetExceeded, USAGE_STATE };
