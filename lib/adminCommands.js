'use strict';

const { getAllCatalogEntries, setCatalogEntry, removeCatalogEntry: deleteCatalogEntry, CATEGORIES } = require('./catalog');
const { checkProviderReachable, CHAT_STATE, ONBOARDING_STATE } = require('./providerHealthCheck');
const { listModels } = require('./providers');
const { resetUsage: resetUsageState } = require('./usage');

const VALUE_KINDS = new Set(['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count']);
const DERIVED_METRIC_ROLES = new Set(['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption']);
const MAX_DERIVED_METRIC_GROUP_ID_LENGTH = 128;
const HVAC_ROLES = new Set(['window', 'heating']);
const UPDATE_FREQUENCIES = new Set(['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven']);
const DATA_COMPLETENESS = new Set(['unknown', 'complete', 'gaps', 'stale']);
const MAX_SOURCE_ID_LENGTH = 512;
const MAX_ROOM_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const catalogMutationQueues = new WeakMap();

function serializeCatalogMutation(adapter, operation) {
    const previous = catalogMutationQueues.get(adapter) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    catalogMutationQueues.set(adapter, next);
    return next.finally(() => {
        if (catalogMutationQueues.get(adapter) === next) catalogMutationQueues.delete(adapter);
    });
}

function validateStringField(message, field, maxLength) {
    if (message[field] !== undefined && (typeof message[field] !== 'string' || message[field].length > maxLength)) {
        throw new Error(`${field} muss ein String mit maximal ${maxLength} Zeichen sein.`);
    }
}

function validateCatalogUpdate(message = {}) {
    if (typeof message.sourceId !== 'string' || !message.sourceId.trim() || message.sourceId.length > MAX_SOURCE_ID_LENGTH) {
        throw new Error(`sourceId muss ein nicht-leerer String mit maximal ${MAX_SOURCE_ID_LENGTH} Zeichen sein.`);
    }
    validateStringField(message, 'room', MAX_ROOM_LENGTH);
    validateStringField(message, 'description', MAX_DESCRIPTION_LENGTH);
    if (message.category !== undefined && !CATEGORIES.includes(message.category)) throw new Error('category ist ungültig.');
    if (message.valueKind !== undefined && !VALUE_KINDS.has(message.valueKind)) throw new Error('valueKind ist ungültig.');
    if (message.ignored !== undefined && typeof message.ignored !== 'boolean') throw new Error('ignored muss ein Boolean sein.');
    if (message.updateFrequency !== undefined && !UPDATE_FREQUENCIES.has(message.updateFrequency)) throw new Error('updateFrequency ist ungültig.');
    if (message.dataCompleteness !== undefined && !DATA_COMPLETENESS.has(message.dataCompleteness)) throw new Error('dataCompleteness ist ungültig.');
    const hasDerivedMetricRole = message.derivedMetricRole !== undefined;
    const hasDerivedMetricGroupId = message.derivedMetricGroupId !== undefined;
    if (hasDerivedMetricRole !== hasDerivedMetricGroupId) {
        throw new Error('derivedMetricRole und derivedMetricGroupId müssen zusammen gesetzt sein.');
    }
    if (hasDerivedMetricRole && !DERIVED_METRIC_ROLES.has(message.derivedMetricRole)) throw new Error('derivedMetricRole ist ungültig.');
    if (hasDerivedMetricGroupId) validateStringField(message, 'derivedMetricGroupId', MAX_DERIVED_METRIC_GROUP_ID_LENGTH);
    if (message.hvacRole !== undefined && !HVAC_ROLES.has(message.hvacRole)) throw new Error('hvacRole ist ungültig.');
    return message;
}

async function listProviderModels(adapter, { providerType, apiKey, baseUrl } = {}) {
    try {
        const models = await listModels({ type: providerType, apiKey, baseUrl });
        return models
            .map((model) => ({
                value: model.id,
                label: `${model.name}${model.isFree ? ' (kostenlos)' : ''}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    } catch (_error) {
        if (adapter.log && adapter.log.warn) {
            adapter.log.warn(`Modellliste für Provider '${providerType || 'unbekannt'}' konnte nicht geladen werden.`);
        }
        return [];
    }
}

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

async function resetUsage(adapter) {
    await resetUsageState(adapter);
    return { reset: true };
}

async function updateCatalogEntryAdmin(
    adapter,
    message = {},
) {
    return serializeCatalogMutation(adapter, () => updateCatalogEntryAdminUnlocked(adapter, message));
}

async function updateCatalogEntryAdminUnlocked(
    adapter,
    { sourceId, category, room, description, valueKind, ignored, updateFrequency, dataCompleteness, derivedMetricRole, derivedMetricGroupId, hvacRole } = {},
) {
    validateCatalogUpdate({ sourceId, category, room, description, valueKind, ignored, updateFrequency, dataCompleteness, derivedMetricRole, derivedMetricGroupId, hvacRole });
    const entry = await findEntry(adapter, sourceId);
    if (!entry) {
        return { error: `Unbekanntes Objekt: ${sourceId}` };
    }
    if (hvacRole !== undefined) {
        const targetValueKind = valueKind !== undefined ? valueKind : entry.valueKind;
        if (targetValueKind !== 'boolean_state') {
            throw new Error('hvacRole ist nur fuer valueKind boolean_state gueltig.');
        }
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
    if (updateFrequency !== undefined) {
        updated.updateFrequency = updateFrequency;
    }
    if (dataCompleteness !== undefined) {
        updated.dataCompleteness = dataCompleteness;
    }
    if (derivedMetricRole !== undefined) {
        updated.derivedMetricRole = derivedMetricRole;
    }
    if (derivedMetricGroupId !== undefined) {
        updated.derivedMetricGroupId = derivedMetricGroupId;
    }
    if (hvacRole !== undefined) {
        updated.hvacRole = hvacRole;
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
    return serializeCatalogMutation(adapter, () => removeCatalogEntryUnlocked(adapter, { sourceId }));
}

async function removeCatalogEntryUnlocked(adapter, { sourceId } = {}) {
    if (typeof sourceId !== 'string' || !sourceId.trim() || sourceId.length > MAX_SOURCE_ID_LENGTH) {
        throw new Error(`sourceId muss ein nicht-leerer String mit maximal ${MAX_SOURCE_ID_LENGTH} Zeichen sein.`);
    }
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

/**
 * Leichtgewichtiger Sync ohne Klassifikation: aktualisiert nur aktiv/inaktiv-Status
 * bestehender Katalogeintraege und registriert neu gefundene Objekte, ohne das
 * Onboarding-Modell (und damit Tokens) fuer deren Klassifikation zu verbrauchen.
 */
async function runDiscoveryOnly(adapter) {
    if (adapter.log && adapter.log.silly) {
        adapter.log.silly('Admin: manueller Sync (nur Updates, ohne Klassifikation) gestartet');
    }

    const summary = await adapter.syncCatalog({ skipClassification: true });

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(`Admin: Sync (nur Updates) beendet: ${summary.reactivatedCount} reaktiviert`);
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
    listProviderModels,
    listCatalogEntries,
    resetUsage,
    updateCatalogEntryAdmin,
    removeCatalogEntry,
    runDiscoveryNow,
    runDiscoveryOnly,
    runProactiveCheckNow,
    validateCatalogUpdate,
};
