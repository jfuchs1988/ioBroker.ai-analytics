// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
// lib/providers/index.js
'use strict';

const { createAnthropicProvider, listAnthropicModels } = require('./anthropic');
const { createOpenAiCompatibleProvider, listOpenAiCompatibleModels } = require('./openaiCompatible');

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
            const error = new Error('Provider request aborted.');
            error.name = 'AbortError';
            error.retryable = false;
            reject(error);
            return;
        }
        let onAbort;
        const timer = setTimeout(() => {
            if (signal && onAbort) signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        if (signal) {
            onAbort = () => {
                clearTimeout(timer);
                const error = new Error('Provider request aborted.');
                error.name = 'AbortError';
                error.retryable = false;
                reject(error);
            };
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

function withRetry(provider) {
    return {
        async chat(params) {
            let lastError;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    return await provider.chat(params);
                } catch (error) {
                    lastError = error;
                    if (!error || error.retryable !== true) throw error;
                    if (attempt < MAX_ATTEMPTS) {
                        const retryAfterMs = Number.isFinite(error && error.retryAfterMs) ? error.retryAfterMs : 0;
                        await delay(Math.max(BASE_DELAY_MS * attempt, retryAfterMs), params && params.signal);
                    }
                }
            }
            throw lastError;
        },
    };
}

function createProvider(config) {
    switch (config.type) {
        case 'anthropic':
            return withRetry(createAnthropicProvider(config));
        case 'openai':
        case 'openrouter':
        case 'local':
            return withRetry(createOpenAiCompatibleProvider(config));
        default:
            throw new Error(`Unknown provider type: ${config.type}`);
    }
}

async function listModels(config) {
    switch (config.type) {
        case 'anthropic':
            return listAnthropicModels(config);
        case 'openai':
        case 'openrouter':
        case 'local':
            return listOpenAiCompatibleModels(config);
        default:
            throw new Error(`Unknown provider type: ${config.type}`);
    }
}

module.exports = { createProvider, listModels, withRetry };
