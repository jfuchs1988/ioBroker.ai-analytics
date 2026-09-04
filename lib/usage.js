'use strict';

const USAGE_STATE = 'usage.today';
const HISTORY_STATE = 'usage.history';
const TODAY_SUMMARY_STATE = 'usage.todaySummary';
const MAX_HISTORY_DAYS = 365;
const usageUpdateQueues = new WeakMap();

function todayString() {
    return new Date().toISOString().slice(0, 10);
}

function pricesFromConfig(config) {
    const c = config || {};
    return {
        chatIn: Number(c.chatPricePerMillionInputTokens) || 0,
        chatOut: Number(c.chatPricePerMillionOutputTokens) || 0,
        onboardingIn: Number(c.onboardingPricePerMillionInputTokens) || 0,
        onboardingOut: Number(c.onboardingPricePerMillionOutputTokens) || 0,
    };
}

function formatTodaySummary(todayEntry, dailyTokenBudget, prices) {
    const format = new Intl.NumberFormat('de-DE');
    const p = prices || {};
    const chat = (todayEntry && todayEntry.chat) || { inputTokens: 0, outputTokens: 0 };
    const onboarding = (todayEntry && todayEntry.onboarding) || { inputTokens: 0, outputTokens: 0 };
    const chatTokens = (chat.inputTokens || 0) + (chat.outputTokens || 0);
    const onboardingTokens = (onboarding.inputTokens || 0) + (onboarding.outputTokens || 0);
    const chatCost = ((chat.inputTokens || 0) * (Number(p.chatIn) || 0) + (chat.outputTokens || 0) * (Number(p.chatOut) || 0)) / 1000000;
    const onboardingCost =
        ((onboarding.inputTokens || 0) * (Number(p.onboardingIn) || 0) + (onboarding.outputTokens || 0) * (Number(p.onboardingOut) || 0)) / 1000000;
    const budget = Number(dailyTokenBudget) || 0;
    const totalLine =
        budget > 0
            ? `${format.format(chatTokens + onboardingTokens)} / ${format.format(budget)} Tokens heute`
            : `${format.format(chatTokens + onboardingTokens)} Tokens heute (kein Limit)`;
    return (
        `${totalLine} · Chat: ${format.format(chatTokens)} Tokens · Kosten: ${chatCost.toFixed(4)}` +
        ` · Onboarding: ${format.format(onboardingTokens)} Tokens · Kosten: ${onboardingCost.toFixed(4)}`
    );
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
    await adapter.setObjectNotExistsAsync(TODAY_SUMMARY_STATE, {
        type: 'state',
        common: { name: 'Token usage today (human readable)', type: 'string', role: 'text', read: true, write: false },
        native: {},
    });
}

async function getTodayUsage(adapter) {
    const state = await adapter.getStateAsync(USAGE_STATE);
    const today = todayString();
    if (!state || !state.val) {
        return { date: today, tokensToday: 0 };
    }
    let stored;
    try {
        stored = JSON.parse(state.val);
    } catch (_error) {
        return { date: today, tokensToday: 0 };
    }
    if (
        !stored ||
        stored.date !== today ||
        typeof stored.tokensToday !== 'number' ||
        !Number.isFinite(stored.tokensToday) ||
        stored.tokensToday < 0
    ) {
        return { date: today, tokensToday: 0 };
    }
    return { ...stored, tokensToday: Math.floor(stored.tokensToday) };
}

async function getUsageHistory(adapter) {
    const state = await adapter.getStateAsync(HISTORY_STATE);
    if (!state || !state.val) {
        return [];
    }
    try {
        const parsed = JSON.parse(state.val);
        return Array.isArray(parsed)
            ? parsed.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.date === 'string')
            : [];
    } catch (error) {
        return [];
    }
}

function emptyPurposeTotals() {
    return { inputTokens: 0, outputTokens: 0 };
}

function providerTokenCount(value, field) {
    if (value === undefined || value === null) return 0;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new TypeError(`${field} muss eine endliche, nicht-negative Zahl sein.`);
    }
    return Math.floor(value);
}

function storedTokenCount(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

async function recordHistoryEntry(adapter, usage, purpose) {
    const today = todayString();
    const history = await getUsageHistory(adapter);
    let entry = history.find((item) => item.date === today);
    if (!entry) {
        entry = { date: today, chat: emptyPurposeTotals(), onboarding: emptyPurposeTotals() };
        history.push(entry);
    }
    if (!entry[purpose] || typeof entry[purpose] !== 'object' || Array.isArray(entry[purpose])) {
        entry[purpose] = emptyPurposeTotals();
    }
    entry[purpose].inputTokens = storedTokenCount(entry[purpose].inputTokens) + usage.inputTokens;
    entry[purpose].outputTokens = storedTokenCount(entry[purpose].outputTokens) + usage.outputTokens;
    await adapter.setStateAsync(HISTORY_STATE, { val: JSON.stringify(history.slice(-MAX_HISTORY_DAYS)), ack: true });
    return entry;
}

async function recordUsageUnlocked(adapter, usage, purpose) {
    if (!usage || typeof usage !== 'object') throw new TypeError('Usage-Objekt erforderlich.');
    const normalizedUsage = {
        inputTokens: providerTokenCount(usage.inputTokens, 'inputTokens'),
        outputTokens: providerTokenCount(usage.outputTokens, 'outputTokens'),
    };
    const current = await getTodayUsage(adapter);
    const added = normalizedUsage.inputTokens + normalizedUsage.outputTokens;
    const updated = { date: current.date, tokensToday: current.tokensToday + added };
    await adapter.setStateAsync(USAGE_STATE, { val: JSON.stringify(updated), ack: true });
    const todayEntry = await recordHistoryEntry(adapter, normalizedUsage, purpose);
    await adapter.setStateAsync(TODAY_SUMMARY_STATE, {
        val: formatTodaySummary(todayEntry, adapter.config && adapter.config.dailyTokenBudget, pricesFromConfig(adapter.config)),
        ack: true,
    });
    return updated;
}

async function resetUsageUnlocked(adapter) {
    const emptyToday = { date: todayString(), tokensToday: 0 };
    await adapter.setStateAsync(USAGE_STATE, { val: JSON.stringify(emptyToday), ack: true });
    await adapter.setStateAsync(HISTORY_STATE, { val: JSON.stringify([]), ack: true });
    await adapter.setStateAsync(TODAY_SUMMARY_STATE, {
        val: formatTodaySummary(null, adapter.config && adapter.config.dailyTokenBudget, pricesFromConfig(adapter.config)),
        ack: true,
    });
    return emptyToday;
}

function recordUsage(adapter, usage, purpose = 'chat') {
    if (!adapter || (typeof adapter !== 'object' && typeof adapter !== 'function')) {
        return Promise.reject(new TypeError('Adapter erforderlich.'));
    }
    const previous = usageUpdateQueues.get(adapter) || Promise.resolve();
    const update = previous.catch(() => {}).then(() => recordUsageUnlocked(adapter, usage, purpose));
    usageUpdateQueues.set(adapter, update);
    return update.finally(() => {
        if (usageUpdateQueues.get(adapter) === update) usageUpdateQueues.delete(adapter);
    });
}

function resetUsage(adapter) {
    const previous = usageUpdateQueues.get(adapter) || Promise.resolve();
    const update = previous.catch(() => {}).then(() => resetUsageUnlocked(adapter));
    usageUpdateQueues.set(adapter, update);
    return update.finally(() => {
        if (usageUpdateQueues.get(adapter) === update) usageUpdateQueues.delete(adapter);
    });
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
    resetUsage,
    getTodayUsage,
    getUsageHistory,
    isBudgetExceeded,
    formatTodaySummary,
    USAGE_STATE,
    HISTORY_STATE,
    TODAY_SUMMARY_STATE,
    MAX_HISTORY_DAYS,
};
