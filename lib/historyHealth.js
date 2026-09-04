'use strict';

const STATE_ID = 'historyHealth';
const FAILURE_THRESHOLD = 3;
const RETRY_DELAYS_MS = [12 * 3600 * 1000, 24 * 3600 * 1000, 48 * 3600 * 1000];
const healthUpdateQueues = new WeakMap();

function emptyHealth() {
    return { instances: {} };
}

async function ensureHealthState(adapter) {
    if (!adapter || !adapter.setObjectNotExistsAsync) return;
    await adapter.setObjectNotExistsAsync(STATE_ID, {
        type: 'state',
        common: { name: 'History health', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
}

async function readHealth(adapter) {
    if (!adapter || !adapter.getStateAsync) return emptyHealth();
    const state = await adapter.getStateAsync(STATE_ID);
    if (!state || !state.val) return emptyHealth();
    try {
        const parsed = JSON.parse(state.val);
        return parsed && parsed.instances ? parsed : emptyHealth();
    } catch (_error) {
        return emptyHealth();
    }
}

async function writeHealth(adapter, health) {
    if (!adapter || !adapter.setStateAsync) return;
    await adapter.setStateAsync(STATE_ID, { val: JSON.stringify(health), ack: true });
}

function serializeHealthUpdate(adapter, operation) {
    if (!adapter || (typeof adapter !== 'object' && typeof adapter !== 'function')) return operation();
    const previous = healthUpdateQueues.get(adapter) || Promise.resolve();
    const update = previous.catch(() => {}).then(operation);
    healthUpdateQueues.set(adapter, update);
    return update.finally(() => {
        if (healthUpdateQueues.get(adapter) === update) healthUpdateQueues.delete(adapter);
    });
}

async function recordHistorySuccessUnlocked(adapter, historyInstance) {
    const health = await readHealth(adapter);
    if (health.instances[historyInstance]) {
        delete health.instances[historyInstance];
        await writeHealth(adapter, health);
    }
}

function recordHistorySuccess(adapter, historyInstance) {
    return serializeHealthUpdate(adapter, () => recordHistorySuccessUnlocked(adapter, historyInstance));
}

async function recordHistoryFailureUnlocked(adapter, historyInstance, error) {
    const health = await readHealth(adapter);
    const previous = health.instances[historyInstance] || {
        consecutiveFailures: 0,
        retryIndex: 0,
        reported: false,
        exhausted: false,
    };
    const now = Date.now();
    const current = {
        ...previous,
        consecutiveFailures: previous.consecutiveFailures + 1,
        lastFailureAt: new Date(now).toISOString(),
        lastError: error && error.message ? error.message : String(error),
    };
    const shouldReport = current.consecutiveFailures >= FAILURE_THRESHOLD && !current.reported;
    current.reported = previous.reported || shouldReport;

    if (current.consecutiveFailures >= FAILURE_THRESHOLD) {
        const delayIndex = Math.min(current.retryIndex, RETRY_DELAYS_MS.length - 1);
        current.nextRetryAt = new Date(now + RETRY_DELAYS_MS[delayIndex]).toISOString();
        current.retryIndex += 1;
        current.exhausted = false;
    } else {
        current.nextRetryAt = null;
    }

    health.instances[historyInstance] = current;
    await writeHealth(adapter, health);
    return { shouldReport, exhausted: current.exhausted };
}

function recordHistoryFailure(adapter, historyInstance, error) {
    return serializeHealthUpdate(adapter, () => recordHistoryFailureUnlocked(adapter, historyInstance, error));
}

async function isHistoryAvailable(adapter, historyInstance) {
    const health = await readHealth(adapter);
    const status = health.instances[historyInstance];
    if (!status) return true;
    return !status.nextRetryAt || Date.now() >= Date.parse(status.nextRetryAt);
}

async function consumeFailureReportsUnlocked(adapter) {
    const health = await readHealth(adapter);
    const reports = Object.entries(health.instances)
        .filter(([, status]) => status.reported && !status.reportDelivered)
        .map(([historyInstance, status]) => ({ historyInstance, error: status.lastError }));
    if (!reports.length) return [];
    for (const report of reports) health.instances[report.historyInstance].reportDelivered = true;
    await writeHealth(adapter, health);
    return reports;
}

function consumeFailureReports(adapter) {
    return serializeHealthUpdate(adapter, () => consumeFailureReportsUnlocked(adapter));
}

module.exports = {
    STATE_ID,
    FAILURE_THRESHOLD,
    RETRY_DELAYS_MS,
    ensureHealthState,
    recordHistorySuccess,
    recordHistoryFailure,
    isHistoryAvailable,
    consumeFailureReports,
};
