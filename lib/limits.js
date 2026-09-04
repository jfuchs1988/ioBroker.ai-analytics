'use strict';

const LIMIT_DEFAULTS = Object.freeze({
    maxAgentIterations: 8,
    maxToolCalls: 32,
    maxPeriodsPerRequest: 256,
    maxPeriodsPerToolCall: 72,
});

const LIMIT_BOUNDS = Object.freeze({
    maxAgentIterations: { min: 1, max: 32 },
    maxToolCalls: { min: 1, max: 128 },
    maxPeriodsPerRequest: { min: 1, max: 1024 },
    maxPeriodsPerToolCall: { min: 1, max: 120 },
});

function getLimits(config = {}) {
    const limits = {};
    for (const [key, fallback] of Object.entries(LIMIT_DEFAULTS)) {
        const bounds = LIMIT_BOUNDS[key];
        const value = Number(config[key]);
        limits[key] = Number.isSafeInteger(value) ? Math.min(bounds.max, Math.max(bounds.min, value)) : fallback;
    }
    return limits;
}

module.exports = { LIMIT_DEFAULTS, LIMIT_BOUNDS, getLimits };
