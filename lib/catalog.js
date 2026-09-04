'use strict';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const DERIVED_METRIC_ROLES = new Set(['pv_generation', 'grid_feed_in']);
const MAX_DERIVED_METRIC_GROUP_ID_LENGTH = 128;
const HVAC_ROLES = new Set(['window', 'heating']);
const MAX_SOURCE_ID_LENGTH = 512;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ROOM_LENGTH = 256;
const MAX_UNIT_LENGTH = 64;
const MAX_ENTRY_BYTES = 32 * 1024;
const HISTORY_INSTANCE_PATTERN = /^(influxdb|history|sql)\.\d+$/;

function hasControlCharacter(value) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    });
}

function validateString(value, name, maxLength, required = false) {
    if (value === undefined && !required) return;
    if (typeof value !== 'string' || (required && !value.trim()) || value.length > maxLength || hasControlCharacter(value)) {
        throw new TypeError(`Ungueltiges Feld ${name}.`);
    }
}

function validateCatalogEntry(entry, expectedSourceId) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new TypeError('Katalogeintrag muss ein Objekt sein.');
    }
    validateString(entry.sourceId, 'sourceId', MAX_SOURCE_ID_LENGTH, true);
    if (expectedSourceId !== undefined && entry.sourceId !== expectedSourceId) {
        throw new Error(`Katalogeintrag enthaelt eine abweichende sourceId: ${entry.sourceId}`);
    }
    if (!CATEGORIES.includes(entry.category)) {
        throw new Error(`Unknown category: ${entry.category}`);
    }
    validateString(entry.description, 'description', MAX_DESCRIPTION_LENGTH);
    validateString(entry.room, 'room', MAX_ROOM_LENGTH);
    validateString(entry.unit, 'unit', MAX_UNIT_LENGTH);
    if (entry.historyInstance !== undefined && (typeof entry.historyInstance !== 'string' || !HISTORY_INSTANCE_PATTERN.test(entry.historyInstance))) {
        throw new TypeError(`Ungueltige History-Instanz: ${entry.historyInstance}`);
    }
    for (const field of ['active', 'ignored', 'needsReview', 'writable']) {
        if (entry[field] !== undefined && typeof entry[field] !== 'boolean') {
            throw new TypeError(`Ungueltiges Feld ${field}.`);
        }
    }
    const hasDerivedMetricRole = entry.derivedMetricRole !== undefined;
    const hasDerivedMetricGroupId = entry.derivedMetricGroupId !== undefined;
    if (hasDerivedMetricRole !== hasDerivedMetricGroupId) {
        throw new Error('derivedMetricRole und derivedMetricGroupId muessen zusammen gesetzt sein.');
    }
    if (hasDerivedMetricRole && !DERIVED_METRIC_ROLES.has(entry.derivedMetricRole)) {
        throw new Error(`Unbekannte derivedMetricRole: ${entry.derivedMetricRole}`);
    }
    if (hasDerivedMetricGroupId) {
        validateString(entry.derivedMetricGroupId, 'derivedMetricGroupId', MAX_DERIVED_METRIC_GROUP_ID_LENGTH, true);
    }
    if (entry.hvacRole !== undefined) {
        if (!HVAC_ROLES.has(entry.hvacRole)) {
            throw new Error(`Unbekannte hvacRole: ${entry.hvacRole}`);
        }
        if (entry.valueKind !== 'boolean_state') {
            throw new Error('hvacRole ist nur fuer valueKind boolean_state gueltig.');
        }
    }
    const serialized = JSON.stringify(entry);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_ENTRY_BYTES) {
        throw new RangeError('Katalogeintrag ist zu gross.');
    }
    return entry;
}

function warnInvalidEntry(adapter, id, error) {
    if (adapter.log && adapter.log.warn) {
        adapter.log.warn(`Ungueltiger Katalogeintrag ${id} uebersprungen: ${error.message}`);
    }
}

function catalogStateId(sourceId) {
    return `catalog.${sourceId}`;
}

async function getCatalogEntry(adapter, sourceId) {
    const state = await adapter.getStateAsync(catalogStateId(sourceId));
    if (!state || state.val == null) return null;
    try {
        return validateCatalogEntry(JSON.parse(state.val), sourceId);
    } catch (error) {
        warnInvalidEntry(adapter, catalogStateId(sourceId), error);
        return null;
    }
}

async function getAllCatalogEntries(adapter) {
    const states = await adapter.getStatesAsync(`${adapter.namespace}.catalog.*`);
    const entries = [];
    for (const fullId of Object.keys(states || {})) {
        const state = states[fullId];
        if (state && state.val != null) {
            try {
                const sourceId = fullId.slice(`${adapter.namespace}.catalog.`.length);
                entries.push(validateCatalogEntry(JSON.parse(state.val), sourceId));
            } catch (error) {
                warnInvalidEntry(adapter, fullId, error);
            }
        }
    }
    return entries;
}

async function setCatalogEntry(adapter, entry) {
    validateCatalogEntry(entry);

    const id = catalogStateId(entry.sourceId);
    await adapter.setObjectNotExistsAsync(id, {
        type: 'state',
        common: {
            name: `Catalog: ${entry.sourceId}`,
            type: 'string',
            role: 'json',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(id, { val: JSON.stringify(entry), ack: true });
}

async function markInactive(adapter, sourceId) {
    const entry = await getCatalogEntry(adapter, sourceId);
    if (!entry) return;
    entry.active = false;
    await setCatalogEntry(adapter, entry);
}

async function removeCatalogEntry(adapter, sourceId) {
    const id = catalogStateId(sourceId);
    await adapter.delStateAsync(id).catch(() => {});
    await adapter.delObjectAsync(id);
}

module.exports = {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    removeCatalogEntry,
    catalogStateId,
    CATEGORIES,
    DERIVED_METRIC_ROLES,
    HVAC_ROLES,
    validateCatalogEntry,
};
