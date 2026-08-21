'use strict';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];

function catalogStateId(sourceId) {
    return `catalog.${sourceId}`;
}

async function getCatalogEntry(adapter, sourceId) {
    const state = await adapter.getStateAsync(catalogStateId(sourceId));
    if (!state || state.val == null) return null;
    return JSON.parse(state.val);
}

async function getAllCatalogEntries(adapter) {
    const states = await adapter.getStatesAsync(`${adapter.namespace}.catalog.*`);
    const entries = [];
    for (const fullId of Object.keys(states)) {
        const state = states[fullId];
        if (state && state.val != null) {
            entries.push(JSON.parse(state.val));
        }
    }
    return entries;
}

async function setCatalogEntry(adapter, entry) {
    if (!CATEGORIES.includes(entry.category)) {
        throw new Error(`Unknown category: ${entry.category}`);
    }

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

module.exports = {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    catalogStateId,
    CATEGORIES,
};
