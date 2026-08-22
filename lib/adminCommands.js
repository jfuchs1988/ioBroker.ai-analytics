'use strict';

const { getAllCatalogEntries, setCatalogEntry, removeCatalogEntry: deleteCatalogEntry } = require('./catalog');

async function findEntry(adapter, sourceId) {
    const entries = await getAllCatalogEntries(adapter);
    return entries.find((entry) => entry.sourceId === sourceId);
}

async function listCatalogEntries(adapter) {
    const entries = await getAllCatalogEntries(adapter);
    return { entries };
}

async function updateCatalogEntryAdmin(adapter, { sourceId, category, room, ignored } = {}) {
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

    const summary = await adapter.syncCatalog();

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(
            `Admin: manueller Re-Scan beendet: ${summary.newCount} neu, ${summary.reactivatedCount} reaktiviert`
        );
    }

    return summary;
}

function runProactiveCheckNow(adapter) {
    if (adapter.log && adapter.log.silly) {
        adapter.log.silly('Admin: manuelle proaktive Pruefung ausgeloest');
    }

    adapter.runProactiveCheck().catch((error) => {
        if (adapter.log) {
            adapter.log.error(`Manuelle proaktive Pruefung fehlgeschlagen: ${error.message}`);
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
