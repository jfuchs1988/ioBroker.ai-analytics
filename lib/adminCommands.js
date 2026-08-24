'use strict';

const { getAllCatalogEntries, setCatalogEntry, removeCatalogEntry: deleteCatalogEntry } = require('./catalog');
const { checkProviderReachable, CHAT_STATE, ONBOARDING_STATE } = require('./providerHealthCheck');

/**
 * Erneute Erreichbarkeitspruefung als Wiederherstellungspfad fuer einen beim Adapterstart
 * fehlgeschlagenen Self-Check. Bewusst NUR hier, also ausschliesslich durch einen Klick im
 * Admin ausgeloest — kein periodisches Nachpruefen (Non-Goal der Spec).
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function ensureProviderReachable(adapter, { flag, providerKey, stateId, label }) {
    if (adapter[flag]) {
        return { ok: true };
    }

    const provider = adapter[providerKey];
    if (!provider) {
        // Die Provider-Konstruktion selbst ist fehlgeschlagen — es gibt nichts, was man nachpruefen koennte.
        return {
            ok: false,
            reason: `${label} konnte nicht initialisiert werden. Bitte Konfiguration korrigieren und den Adapter neu starten.`,
        };
    }

    if (adapter.log && adapter.log.info) {
        adapter.log.info(`Admin: ${label} wird erneut auf Erreichbarkeit geprueft.`);
    }

    const result = await checkProviderReachable(provider);
    adapter[flag] = result.reachable;

    if (typeof adapter.setStateAsync === 'function') {
        try {
            await adapter.setStateAsync(stateId, { val: result.reachable, ack: true });
        } catch (error) {
            if (adapter.log && adapter.log.warn) {
                adapter.log.warn(`Konnte ${stateId} nicht schreiben: ${error && error.message ? error.message : String(error)}`);
            }
        }
    }

    if (!result.reachable) {
        return { ok: false, reason: `${label} nicht erreichbar: ${result.error}` };
    }
    return { ok: true };
}

async function findEntry(adapter, sourceId) {
    const entries = await getAllCatalogEntries(adapter);
    return entries.find((entry) => entry.sourceId === sourceId);
}

async function listCatalogEntries(adapter) {
    const entries = await getAllCatalogEntries(adapter);
    return { entries };
}

async function updateCatalogEntryAdmin(adapter, { sourceId, category, room, description, valueKind, ignored } = {}) {
    const entry = await findEntry(adapter, sourceId);
    if (!entry) {
        return { error: `Unbekanntes Objekt: ${sourceId}` };
    }

    const updated = { ...entry };
    if (category !== undefined) {
        updated.category = category;
        updated.needsReview = false;
    }
    if (room !== undefined) {
        updated.room = room;
    }
    if (description !== undefined) {
        updated.description = description;
    }
    if (valueKind !== undefined) {
        updated.valueKind = valueKind;
        updated.valueKindConfidence = 'high';
        updated.valueKindSource = 'manual';
    }
    if (ignored !== undefined) {
        updated.ignored = ignored;
    }
    updated.lastSeen = new Date().toISOString();

    await setCatalogEntry(adapter, updated);

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(
            `Admin: Katalogeintrag aktualisiert: ${sourceId} -> category=${updated.category}, room=${updated.room}, ignored=${updated.ignored}`
        );
    }

    return { entry: updated };
}

async function removeCatalogEntry(adapter, { sourceId } = {}) {
    const entry = await findEntry(adapter, sourceId);
    if (!entry) {
        return { error: `Unbekanntes Objekt: ${sourceId}` };
    }

    await deleteCatalogEntry(adapter, sourceId);

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(`Admin: Katalogeintrag entfernt: ${sourceId}`);
    }

    return { removed: true };
}

async function runDiscoveryNow(adapter) {
    if (adapter.log && adapter.log.silly) {
        adapter.log.silly('Admin: manueller Re-Scan gestartet');
    }

    // Discovery/Reaktivierung laufen unabhaengig vom Onboarding-Modell; nur die Klassifikation
    // braucht den Provider. Deshalb hier nur nachpruefen, nicht abbrechen.
    const health = await ensureProviderReachable(adapter, {
        flag: 'onboardingProviderOk',
        providerKey: 'onboardingProvider',
        stateId: ONBOARDING_STATE,
        label: 'Onboarding-Modell',
    });

    const summary = await adapter.syncCatalog();

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(
            `Admin: manueller Re-Scan beendet: ${summary.newCount} neu, ${summary.reactivatedCount} reaktiviert`
        );
    }

    if (summary.skipped && !health.ok) {
        return { ...summary, skipReason: health.reason };
    }
    return summary;
}

async function runProactiveCheckNow(adapter) {
    if (adapter.log && adapter.log.silly) {
        adapter.log.silly('Admin: manuelle proaktive Pruefung ausgeloest');
    }

    const health = await ensureProviderReachable(adapter, {
        flag: 'chatProviderOk',
        providerKey: 'chatProvider',
        stateId: CHAT_STATE,
        label: 'Chat/Pruefungs-Modell',
    });

    if (!health.ok) {
        if (adapter.log && adapter.log.warn) {
            adapter.log.warn(`Admin: manuelle proaktive Pruefung nicht gestartet: ${health.reason}`);
        }
        return { triggered: false, reason: health.reason };
    }

    adapter.runProactiveCheck().catch((error) => {
        if (adapter.log) {
            adapter.log.error(`Manuelle proaktive Pruefung fehlgeschlagen: ${error && error.message ? error.message : String(error)}`);
        }
    });

    return { triggered: true };
}

module.exports = {
    listCatalogEntries,
    updateCatalogEntryAdmin,
    removeCatalogEntry,
    runDiscoveryNow,
    runProactiveCheckNow,
};
