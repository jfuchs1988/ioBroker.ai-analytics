// lib/tools.js
'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
const { getHistory, compareTimeframes } = require('./dataAccess');
const { getLocalDayBoundaries, getLocalTimeZone } = require('./promptContext');
const { isHistoryAvailable } = require('./historyHealth');

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
            name: 'getPeriodTotal',
            description:
                'Berechnet fuer ein katalogisiertes Objekt den korrekten Wert je Zeitraum passend zur Auspraegung (valueKind). ' +
                'Zeitraeume koennen statt start/end auch dayOffset (0=heute, -1=gestern, lokale Zeitzone) verwenden.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    periods: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                start: { type: 'number' },
                                end: { type: 'number' },
                                dayOffset: { type: 'number' },
                            },
                        },
                    },
                },
                required: ['sourceId', 'periods'],
            },
        },
        {
            name: 'comparePeriods',
            description:
                'Vergleicht mehrere Zeitraeume typ-bewusst und liefert Differenz und Prozent relativ zum Basiszeitraum. ' +
                'Zeitraeume koennen wie bei getPeriodTotal per dayOffset angegeben werden.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    periods: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                start: { type: 'number' },
                                end: { type: 'number' },
                                dayOffset: { type: 'number' },
                            },
                        },
                    },
                    baselineIndex: { type: 'number' },
                },
                required: ['sourceId', 'periods'],
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
        {
            name: 'updateCatalogEntries',
            description:
                'Speichert mehrere ausdruecklich vom Nutzer erklaerte oder korrigierte Katalogzuordnungen. ' +
                'Nur bestehende Katalogeintraege duerfen geaendert werden; vor dem Schreiben werden alle IDs validiert.',
            inputSchema: {
                type: 'object',
                properties: {
                    entries: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                sourceId: { type: 'string' },
                                description: { type: 'string' },
                                category: { type: 'string', enum: CATEGORIES },
                                room: { type: 'string' },
                            },
                            required: ['sourceId'],
                        },
                    },
                },
                required: ['entries'],
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

    function resolvePeriod(period) {
        if (typeof period.dayOffset === 'number') {
            const target = Date.now() + period.dayOffset * 24 * 3600 * 1000;
            return getLocalDayBoundaries(target, getLocalTimeZone());
        }
        return { start: period.start, end: period.end };
    }

    async function computePeriodValue(entry, period) {
        const { historyInstance, sourceId } = entry;
        const kind = entry.valueKind || 'gauge';

        if (kind === 'boolean_state') {
            const points = await getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'onchange');
            let onDurationMs = 0;
            let lastTs = period.start;
            let lastVal = false;
            for (const point of points) {
                if (lastVal) onDurationMs += point.ts - lastTs;
                lastTs = point.ts;
                lastVal = !!point.val;
            }
            if (lastVal) onDurationMs += period.end - lastTs;
            return { onDurationMs, switchCount: points.length };
        }

        if (kind === 'daily_reset_counter') {
            const points = await getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'minmax');
            const total = points.reduce((max, point) => (Number.isFinite(point.val) && point.val > max ? point.val : max), 0);
            return { total };
        }

        if (kind === 'cumulative_total') {
            const [beforePoints, periodPoints] = await Promise.all([
                getHistory(adapter, historyInstance, sourceId, period.start - 24 * 3600 * 1000, period.start, 'minmax'),
                getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'minmax'),
            ]);
            const startVal = beforePoints.length ? beforePoints[beforePoints.length - 1].val : 0;
            const endVal = periodPoints.length ? periodPoints[periodPoints.length - 1].val : startVal;
            return { total: endVal - startVal };
        }

        if (kind === 'event_count') {
            const points = await getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'total');
            const total = points.reduce((sum, point) => sum + (Number.isFinite(point.val) ? point.val : 0), 0);
            return { total };
        }

        const points = await getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'average');
        const values = points.map((point) => point.val).filter((value) => Number.isFinite(value));
        const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        return { avg, min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
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
            const available = [];
            for (const entry of filtered) {
                if (entry.active !== false && !entry.needsReview && !entry.ignored && (await isHistoryAvailable(adapter, entry.historyInstance))) {
                    available.push(entry);
                }
            }
            return available;
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

        if (name === 'getPeriodTotal' || name === 'comparePeriods') {
            const entry = await findCatalogEntry(input.sourceId);
            const values = [];
            for (const rawPeriod of input.periods) {
                const period = resolvePeriod(rawPeriod);
                values.push({ start: period.start, end: period.end, ...(await computePeriodValue(entry, period)) });
            }

            if (name === 'getPeriodTotal') {
                return {
                    description: entry.description,
                    room: entry.room,
                    unit: entry.unit,
                    valueKind: entry.valueKind || 'gauge',
                    valueKindUnknown: !entry.valueKind,
                    periods: values,
                };
            }

            const baselineIndex = Number.isInteger(input.baselineIndex) ? input.baselineIndex : 0;
            const baseline = values[baselineIndex];
            if (!baseline) throw new Error(`Ungueltiger baselineIndex: ${baselineIndex}`);
            const numericValue = (value) => (value.total !== undefined ? value.total : value.avg);
            const baselineValue = numericValue(baseline);
            const periods = values.map((value) => {
                const currentValue = numericValue(value);
                const deltaTotal = currentValue - baselineValue;
                return {
                    ...value,
                    deltaTotal,
                    deltaPercent: baselineValue !== 0 ? (deltaTotal / baselineValue) * 100 : 0,
                };
            });
            return {
                description: entry.description,
                room: entry.room,
                unit: entry.unit,
                valueKind: entry.valueKind || 'gauge',
                valueKindUnknown: !entry.valueKind,
                periods,
            };
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

        if (name === 'updateCatalogEntries') {
            if (!input || !Array.isArray(input.entries) || input.entries.length === 0) {
                throw new Error('Mindestens ein Katalogeintrag muss angegeben werden.');
            }

            const entries = await getAllCatalogEntries(adapter);
            const byId = new Map(entries.map((entry) => [entry.sourceId, entry]));
            const changes = input.entries.map((change) => {
                const entry = byId.get(change && change.sourceId);
                if (!entry) throw new Error(`Unbekanntes Objekt: ${change && change.sourceId}`);
                if (!['description', 'category', 'room'].some((field) => change[field] !== undefined)) {
                    throw new Error(`Keine Aenderung fuer Objekt ${change.sourceId} angegeben.`);
                }
                if (change.category !== undefined && !CATEGORIES.includes(change.category)) {
                    throw new Error(`Unknown category: ${change.category}`);
                }
                return { entry, change };
            });

            const confirmedAt = new Date().toISOString();
            const updated = changes.map(({ entry, change }) => ({
                ...entry,
                ...(change.description !== undefined ? { description: change.description } : {}),
                ...(change.category !== undefined ? { category: change.category } : {}),
                ...(change.room !== undefined ? { room: change.room } : {}),
                needsReview: false,
                confidence: 'high',
                classificationSource: 'user',
                userConfirmedAt: confirmedAt,
                lastSeen: confirmedAt,
            }));
            for (const entry of updated) await setCatalogEntry(adapter, entry);
            return { updated };
        }

        throw new Error(`Unbekanntes Werkzeug: ${name}`);
    }

    return { definitions, execute };
}

module.exports = { buildTools };
