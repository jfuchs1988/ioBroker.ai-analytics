// lib/tools.js
'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
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
                    needsReviewOnly: {
                        type: 'boolean',
                        description: 'Falls true: nur Objekte, die noch eine Rueckfrage vom Nutzer brauchen (needsReview)',
                    },
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
        {
            name: 'updateCatalogEntry',
            description:
                'Aktualisiert einen Katalogeintrag, NACHDEM der Nutzer im Chat geklaert hat, wofuer ein unsicheres ' +
                '(needsReview) Objekt steht. Funktioniert NUR fuer Objekte, die aktuell needsReview=true sind.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: CATEGORIES },
                    room: { type: 'string' },
                },
                required: ['sourceId', 'description', 'category'],
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

            if (input && input.needsReviewOnly) {
                return filtered.filter((entry) => entry.needsReview && !entry.ignored);
            }
            return filtered.filter((entry) => entry.active !== false && !entry.needsReview && !entry.ignored);
        }

        if (name === 'getHistory') {
            const entry = await findCatalogEntry(input.sourceId);
            const history = await getHistory(adapter, entry.historyInstance, input.sourceId, input.start, input.end, input.aggregate);
            return { description: entry.description, room: entry.room, unit: entry.unit, history };
        }

        if (name === 'compareTimeframes') {
            const entry = await findCatalogEntry(input.sourceId);
            const comparison = await compareTimeframes(adapter, entry.historyInstance, input.sourceId, input.periodA, input.periodB);
            return { description: entry.description, room: entry.room, unit: entry.unit, ...comparison };
        }

        if (name === 'updateCatalogEntry') {
            const entry = await findCatalogEntry(input.sourceId);
            if (entry.needsReview !== true) {
                throw new Error(
                    `Objekt ${input.sourceId} ist nicht als needsReview markiert und kann daher nicht ueber dieses Werkzeug geaendert werden.`
                );
            }
            const updated = {
                ...entry,
                description: input.description,
                category: input.category,
                room: input.room || entry.room,
                needsReview: false,
                confidence: 'high',
                lastSeen: new Date().toISOString(),
            };
            await setCatalogEntry(adapter, updated);
            return updated;
        }

        throw new Error(`Unbekanntes Werkzeug: ${name}`);
    }

    return { definitions, execute };
}

module.exports = { buildTools };
