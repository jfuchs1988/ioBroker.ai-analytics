'use strict';

const { getAllCatalogEntries } = require('./catalog');
const { getHistory, compareTimeframes } = require('./dataAccess');

function buildTools(adapter) {
    const definitions = [
        {
            name: 'listCatalog',
            description: 'Listet alle bekannten, katalogisierten Objekte mit Beschreibung, Kategorie und Einheit auf.',
            inputSchema: {
                type: 'object',
                properties: {
                    category: { type: 'string', description: 'Optionaler Filter nach Kategorie' },
                },
            },
        },
        {
            name: 'getHistory',
            description: 'Ruft historische Werte fuer ein Objekt in einem Zeitraum ab.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    start: { type: 'number', description: 'Startzeit als Unix-Millisekunden' },
                    end: { type: 'number', description: 'Endzeit als Unix-Millisekunden' },
                    aggregate: { type: 'string', enum: ['average', 'minmax', 'onchange', 'none'] },
                },
                required: ['sourceId', 'start', 'end'],
            },
        },
        {
            name: 'compareTimeframes',
            description: 'Vergleicht Summe und Durchschnitt eines Objekts zwischen zwei Zeitraeumen.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    periodA: {
                        type: 'object',
                        properties: { start: { type: 'number' }, end: { type: 'number' } },
                        required: ['start', 'end'],
                    },
                    periodB: {
                        type: 'object',
                        properties: { start: { type: 'number' }, end: { type: 'number' } },
                        required: ['start', 'end'],
                    },
                },
                required: ['sourceId', 'periodA', 'periodB'],
            },
        },
    ];

    async function findCatalogEntry(sourceId) {
        const entries = await getAllCatalogEntries(adapter);
        const entry = entries.find((candidate) => candidate.sourceId === sourceId);
        if (!entry) {
            throw new Error(`Unbekanntes Objekt: ${sourceId}`);
        }
        return entry;
    }

    async function execute(name, input) {
        if (name === 'listCatalog') {
            const entries = await getAllCatalogEntries(adapter);
            const filtered = input && input.category
                ? entries.filter((entry) => entry.category === input.category)
                : entries;
            return filtered.filter((entry) => entry.active !== false && !entry.needsReview);
        }

        if (name === 'getHistory') {
            const entry = await findCatalogEntry(input.sourceId);
            return getHistory(adapter, entry.historyInstance, input.sourceId, input.start, input.end, input.aggregate);
        }

        if (name === 'compareTimeframes') {
            const entry = await findCatalogEntry(input.sourceId);
            return compareTimeframes(adapter, entry.historyInstance, input.sourceId, input.periodA, input.periodB);
        }

        throw new Error(`Unbekanntes Werkzeug: ${name}`);
    }

    return { definitions, execute };
}

module.exports = { buildTools };
