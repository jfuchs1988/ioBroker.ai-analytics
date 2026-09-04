// lib/tools.js
'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
const { getHistory, compareTimeframes } = require('./dataAccess');
const { getLocalDayBoundaries, getLocalTimeZone } = require('./promptContext');
const { isHistoryAvailable } = require('./historyHealth');

const MAX_PERIODS_PER_CALL = 16;
const MAX_BATCH_ENTRIES = 50;
const MAX_SOURCE_ID_LENGTH = 512;
const MAX_TEXT_LENGTH = 1000;
const MAX_TIME_RANGE_MS = 10 * 366 * 24 * 3600 * 1000;
const AGGREGATES = ['average', 'minmax', 'onchange', 'none'];
const WRITE_TOOL_NAMES = new Set(['updateCatalogEntry', 'updateCatalogEntries']);

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function assertObject(value, label, allowedKeys) {
    if (!isPlainObject(value)) throw new Error(`${label} muss ein Objekt sein.`);
    const unknown = Object.keys(value).find((key) => !allowedKeys.includes(key));
    if (unknown) throw new Error(`Unbekanntes Feld in ${label}: ${unknown}`);
}

function assertOwn(value, keys, label) {
    if (keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} enthaelt nicht alle Pflichtfelder.`);
}

function assertString(value, label, { required = true, maxLength = MAX_TEXT_LENGTH } = {}) {
    if (value === undefined && !required) return;
    if (typeof value !== 'string' || (required && !value.trim()) || value.length > maxLength) {
        throw new Error(`${label} muss eine gueltige Zeichenkette sein.`);
    }
}

function assertTimestampRange(start, end, label) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > MAX_TIME_RANGE_MS) {
        throw new Error(`${label} muss einen gueltigen, geordneten Zeitraum enthalten.`);
    }
}

function validatePeriod(period, label) {
    assertObject(period, label, ['start', 'end', 'dayOffset']);
    const hasOffset = Object.hasOwn(period, 'dayOffset');
    const hasRange = Object.hasOwn(period, 'start') || Object.hasOwn(period, 'end');
    if (hasOffset === hasRange) throw new Error(`${label} muss entweder dayOffset oder start/end enthalten.`);
    if (hasOffset) {
        if (!Number.isSafeInteger(period.dayOffset) || period.dayOffset < -3660 || period.dayOffset > 3660) {
            throw new Error(`${label}.dayOffset ist ungueltig.`);
        }
        return;
    }
    assertTimestampRange(period.start, period.end, label);
}

function validateInput(name, input) {
    if (name === 'listCatalog') {
        const value = input === undefined ? {} : input;
        assertObject(value, name, ['category', 'needsReviewOnly']);
        if (Object.hasOwn(value, 'category') && (typeof value.category !== 'string' || !CATEGORIES.includes(value.category))) {
            throw new Error('Ungueltige Kategorie.');
        }
        if (Object.hasOwn(value, 'needsReviewOnly') && typeof value.needsReviewOnly !== 'boolean') {
            throw new Error('needsReviewOnly muss boolean sein.');
        }
        return value;
    }

    if (name === 'getHistory') {
        assertObject(input, name, ['sourceId', 'start', 'end', 'aggregate']);
        assertOwn(input, ['sourceId', 'start', 'end'], name);
        assertString(input.sourceId, 'sourceId', { maxLength: MAX_SOURCE_ID_LENGTH });
        assertTimestampRange(input.start, input.end, name);
        if (input.aggregate !== undefined && !AGGREGATES.includes(input.aggregate)) throw new Error('Ungueltiges Aggregat.');
        return input;
    }

    if (name === 'compareTimeframes') {
        assertObject(input, name, ['sourceId', 'periodA', 'periodB']);
        assertOwn(input, ['sourceId', 'periodA', 'periodB'], name);
        assertString(input.sourceId, 'sourceId', { maxLength: MAX_SOURCE_ID_LENGTH });
        assertObject(input.periodA, 'periodA', ['start', 'end']);
        assertObject(input.periodB, 'periodB', ['start', 'end']);
        assertOwn(input.periodA, ['start', 'end'], 'periodA');
        assertOwn(input.periodB, ['start', 'end'], 'periodB');
        assertTimestampRange(input.periodA.start, input.periodA.end, 'periodA');
        assertTimestampRange(input.periodB.start, input.periodB.end, 'periodB');
        return input;
    }

    if (name === 'getPeriodTotal' || name === 'comparePeriods') {
        assertObject(input, name, ['sourceId', 'periods', 'baselineIndex']);
        assertOwn(input, ['sourceId', 'periods'], name);
        assertString(input.sourceId, 'sourceId', { maxLength: MAX_SOURCE_ID_LENGTH });
        if (!Array.isArray(input.periods) || input.periods.length === 0 || input.periods.length > MAX_PERIODS_PER_CALL) {
            throw new Error(`periods muss 1 bis ${MAX_PERIODS_PER_CALL} Eintraege enthalten.`);
        }
        input.periods.forEach((period, index) => validatePeriod(period, `periods[${index}]`));
        if (name === 'getPeriodTotal' && input.baselineIndex !== undefined) throw new Error('baselineIndex ist hier nicht erlaubt.');
        if (input.baselineIndex !== undefined && (!Number.isSafeInteger(input.baselineIndex) || input.baselineIndex < 0 || input.baselineIndex >= input.periods.length)) {
            throw new Error('Ungueltiger baselineIndex.');
        }
        return input;
    }

    if (name === 'updateCatalogEntry') {
        assertObject(input, name, ['sourceId', 'description', 'category', 'room']);
        assertOwn(input, ['sourceId', 'description', 'category'], name);
        assertString(input.sourceId, 'sourceId', { maxLength: MAX_SOURCE_ID_LENGTH });
        assertString(input.description, 'description');
        if (!CATEGORIES.includes(input.category)) throw new Error('Ungueltige Kategorie.');
        assertString(input.room, 'room', { required: false });
        return input;
    }

    if (name === 'updateCatalogEntries') {
        assertObject(input, name, ['entries']);
        assertOwn(input, ['entries'], name);
        if (!Array.isArray(input.entries) || input.entries.length === 0 || input.entries.length > MAX_BATCH_ENTRIES) {
            throw new Error(`entries muss 1 bis ${MAX_BATCH_ENTRIES} Eintraege enthalten.`);
        }
        const ids = new Set();
        input.entries.forEach((entry, index) => {
            assertObject(entry, `entries[${index}]`, ['sourceId', 'description', 'category', 'room']);
            assertOwn(entry, ['sourceId'], `entries[${index}]`);
            assertString(entry.sourceId, 'sourceId', { maxLength: MAX_SOURCE_ID_LENGTH });
            if (ids.has(entry.sourceId)) throw new Error(`Doppelte sourceId: ${entry.sourceId}`);
            ids.add(entry.sourceId);
            assertString(entry.description, 'description', { required: false });
            assertString(entry.room, 'room', { required: false });
            if (entry.category !== undefined && !CATEGORIES.includes(entry.category)) throw new Error('Ungueltige Kategorie.');
        });
        return input;
    }

    throw new Error(`Unbekanntes Werkzeug: ${name}`);
}

function buildTools(adapter, { readOnly = false } = {}) {
    const definitions = [
        {
            name: 'listCatalog',
            description: 'Listet alle bekannten, katalogisierten Objekte mit Beschreibung, Kategorie und Einheit auf.',
            inputSchema: {
                type: 'object',
                properties: {
                    category: { type: 'string', enum: CATEGORIES, description: 'Optionaler Filter nach Kategorie' },
                    needsReviewOnly: {
                        type: 'boolean',
                        description: 'Falls true: nur Objekte, die noch eine Rueckfrage vom Nutzer brauchen (needsReview)',
                    },
                },
                additionalProperties: false,
            },
        },
        {
            name: 'getHistory',
            description: 'Ruft historische Werte fuer ein Objekt in einem Zeitraum ab.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    start: { type: 'integer', description: 'Startzeit als Unix-Millisekunden' },
                    end: { type: 'integer', description: 'Endzeit als Unix-Millisekunden' },
                    aggregate: { type: 'string', enum: ['average', 'minmax', 'onchange', 'none'] },
                },
                required: ['sourceId', 'start', 'end'],
                additionalProperties: false,
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
                        properties: { start: { type: 'integer' }, end: { type: 'integer' } },
                        required: ['start', 'end'],
                        additionalProperties: false,
                    },
                    periodB: {
                        type: 'object',
                        properties: { start: { type: 'integer' }, end: { type: 'integer' } },
                        required: ['start', 'end'],
                        additionalProperties: false,
                    },
                },
                required: ['sourceId', 'periodA', 'periodB'],
                additionalProperties: false,
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
                        minItems: 1,
                        maxItems: MAX_PERIODS_PER_CALL,
                        items: {
                            type: 'object',
                            properties: {
                                start: { type: 'integer' },
                                end: { type: 'integer' },
                                dayOffset: { type: 'integer' },
                            },
                            additionalProperties: false,
                        },
                    },
                },
                required: ['sourceId', 'periods'],
                additionalProperties: false,
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
                        minItems: 1,
                        maxItems: MAX_PERIODS_PER_CALL,
                        items: {
                            type: 'object',
                            properties: {
                                start: { type: 'integer' },
                                end: { type: 'integer' },
                                dayOffset: { type: 'integer' },
                            },
                            additionalProperties: false,
                        },
                    },
                    baselineIndex: { type: 'integer' },
                },
                required: ['sourceId', 'periods'],
                additionalProperties: false,
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
                additionalProperties: false,
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
                        minItems: 1,
                        maxItems: MAX_BATCH_ENTRIES,
                        items: {
                            type: 'object',
                            properties: {
                                sourceId: { type: 'string' },
                                description: { type: 'string' },
                                category: { type: 'string', enum: CATEGORIES },
                                room: { type: 'string' },
                            },
                            required: ['sourceId'],
                            additionalProperties: false,
                        },
                    },
                },
                required: ['entries'],
                additionalProperties: false,
            },
        },
    ];

    async function findCatalogEntry(sourceId, requireReadable = false) {
        const entries = await getAllCatalogEntries(adapter);
        const entry = entries.find((candidate) => candidate.sourceId === sourceId);
        if (!entry) {
            throw new Error(`Unbekanntes Objekt: ${sourceId}`);
        }
        if (requireReadable && (entry.active === false || entry.ignored === true)) {
            throw new Error(`Objekt ist fuer Abfragen nicht verfuegbar: ${sourceId}`);
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
        if (readOnly && WRITE_TOOL_NAMES.has(name)) throw new Error(`Werkzeug ist im Nur-Lese-Modus nicht verfuegbar: ${name}`);
        input = validateInput(name, input);
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
            const entry = await findCatalogEntry(input.sourceId, true);
            const history = await getHistory(adapter, entry.historyInstance, input.sourceId, input.start, input.end, input.aggregate);
            return { description: entry.description, room: entry.room, unit: entry.unit, history };
        }

        if (name === 'compareTimeframes') {
            const entry = await findCatalogEntry(input.sourceId, true);
            const comparison = await compareTimeframes(adapter, entry.historyInstance, input.sourceId, input.periodA, input.periodB);
            return { description: entry.description, room: entry.room, unit: entry.unit, ...comparison };
        }

        if (name === 'getPeriodTotal' || name === 'comparePeriods') {
            const entry = await findCatalogEntry(input.sourceId, true);
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
                    writePattern: entry.writePattern || 'unknown',
                    updateFrequency: entry.updateFrequency || 'unknown',
                    dataCompleteness: entry.dataCompleteness || 'unknown',
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
                writePattern: entry.writePattern || 'unknown',
                updateFrequency: entry.updateFrequency || 'unknown',
                dataCompleteness: entry.dataCompleteness || 'unknown',
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

    return { definitions: readOnly ? definitions.filter((definition) => !WRITE_TOOL_NAMES.has(definition.name)) : definitions, execute };
}

module.exports = { buildTools, MAX_PERIODS_PER_CALL, MAX_BATCH_ENTRIES, MAX_TIME_RANGE_MS };
