// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
'use strict';

const CHAT_STATE = 'info.chatProviderReachable';
const ONBOARDING_STATE = 'info.onboardingProviderReachable';
const DEFAULT_TIMEOUT_MS = 15000;

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

const TIMED_OUT = Symbol('timedOut');

/**
 * Einmalige Erreichbarkeitspruefung eines Providers.
 * Der Aufruf ist zeitlich begrenzt, damit ein Endpunkt, der die Verbindung annimmt
 * aber nie antwortet, `onReady` nicht unbegrenzt blockiert. Ein Timeout wird wie
 * jeder andere Fehlschlag behandelt.
 *
 * @param {{chat: Function}} provider
 * @param {number} [timeoutMs] Obergrenze in Millisekunden (Default 15000).
 */
async function checkProviderReachable(provider, timeoutMs = DEFAULT_TIMEOUT_MS) {
    let timer = null;
    let timedOut = false;
    const controller = new AbortController();
    try {
        const timeoutPromise = new Promise((resolve) => {
            timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
                resolve(TIMED_OUT);
            }, timeoutMs);
        });

        const outcome = await Promise.race([
            provider.chat({
                system: 'Antworte ausschließlich mit dem Wort OK.',
                messages: [{ role: 'user', content: 'OK?' }],
                tools: [],
                signal: controller.signal,
            }),
            timeoutPromise,
        ]);

        if (outcome === TIMED_OUT) {
            return { reachable: false, error: `Zeitüberschreitung nach ${timeoutMs} ms` };
        }
        return { reachable: true };
    } catch (error) {
        if (timedOut) return { reachable: false, error: `Zeitüberschreitung nach ${timeoutMs} ms` };
        return { reachable: false, error: error && error.message ? error.message : String(error) };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

module.exports = {
    checkProviderReachable,
    ensureReachabilityStates,
    CHAT_STATE,
    ONBOARDING_STATE,
    DEFAULT_TIMEOUT_MS,
};
