'use strict';

const TOKEN_LIMIT_DEFAULTS = Object.freeze({
    maxInputTokens: 100000,
    maxOutputTokens: 4096,
    contextWindowTokens: 128000,
});

const TOKEN_LIMIT_BOUNDS = Object.freeze({
    maxInputTokens: { min: 1000, max: 1000000 },
    maxOutputTokens: { min: 256, max: 128000 },
    contextWindowTokens: { min: 4096, max: 2000000 },
});

function getTokenLimits(config = {}, role) {
    const limits = {};
    for (const [key, fallback] of Object.entries(TOKEN_LIMIT_DEFAULTS)) {
        const bounds = TOKEN_LIMIT_BOUNDS[key];
        const configKey = `${role}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        const value = Number(config[configKey]);
        limits[key] = Number.isSafeInteger(value) ? Math.min(bounds.max, Math.max(bounds.min, value)) : fallback;
    }
    return limits;
}

function estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
}

function estimateRequestTokens({ system, messages, tools }) {
    return estimateTokens(system || '') + estimateTokens(JSON.stringify(messages)) + estimateTokens(JSON.stringify(tools || []));
}

module.exports = { TOKEN_LIMIT_DEFAULTS, TOKEN_LIMIT_BOUNDS, getTokenLimits, estimateTokens, estimateRequestTokens };
