// lib/providers/index.js
'use strict';

const { createAnthropicProvider } = require('./anthropic');
const { createOpenAiCompatibleProvider } = require('./openaiCompatible');

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
                    if (attempt < MAX_ATTEMPTS) {
                        await delay(BASE_DELAY_MS * attempt);
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

module.exports = { createProvider, withRetry };
