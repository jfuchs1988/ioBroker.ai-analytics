'use strict';

const CHAT_STATE = 'info.chatProviderReachable';
const ONBOARDING_STATE = 'info.onboardingProviderReachable';

async function ensureReachabilityStates(adapter) {
    await adapter.setObjectNotExistsAsync(CHAT_STATE, {
        type: 'state',
        common: {
            name: 'Chat/Pruefungs-Modell erreichbar',
            type: 'boolean',
            role: 'indicator.reachable',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(ONBOARDING_STATE, {
        type: 'state',
        common: {
            name: 'Onboarding-Modell erreichbar',
            type: 'boolean',
            role: 'indicator.reachable',
            read: true,
            write: false,
        },
        native: {},
    });
}

async function checkProviderReachable(provider) {
    try {
        await provider.chat({
            system: 'Antworte ausschließlich mit dem Wort OK.',
            messages: [{ role: 'user', content: 'OK?' }],
            tools: [],
        });
        return { reachable: true };
    } catch (error) {
        return { reachable: false, error: error.message };
    }
}

module.exports = { checkProviderReachable, ensureReachabilityStates, CHAT_STATE, ONBOARDING_STATE };
