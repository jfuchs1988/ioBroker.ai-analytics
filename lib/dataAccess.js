'use strict';

const MAX_INTERVAL_COUNT = 500;
const DEFAULT_RAW_COUNT = 2000;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_HISTORY_RANGE_MS = 10 * 366 * DAY_MS;
const MAX_SOURCE_ID_LENGTH = 512;
const MAX_DATE_MS = 8.64e15;
const HISTORY_INSTANCE_PATTERN = /^(influxdb|history|sql)\.\d+$/;
const ALLOWED_AGGREGATES = new Set(['average', 'min', 'max', 'minmax', 'total', 'count', 'percentile', 'integral', 'none', 'onchange']);
const { recordHistorySuccess, recordHistoryFailure, isHistoryAvailable } = require('./historyHealth');

function hasControlCharacter(value) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    });
}

function validateHistoryRequest(adapter, historyInstance, sourceId, start, end, aggregate) {
    if (!adapter || typeof adapter.sendToAsync !== 'function') {
        throw new TypeError('Adapter mit sendToAsync erforderlich.');
    }
    if (typeof historyInstance !== 'string' || !HISTORY_INSTANCE_PATTERN.test(historyInstance)) {
        throw new TypeError(`Ungueltige History-Instanz: ${historyInstance}`);
    }
    if (
        typeof sourceId !== 'string' ||
        !sourceId.trim() ||
        sourceId.length > MAX_SOURCE_ID_LENGTH ||
        hasControlCharacter(sourceId)
    ) {
        throw new TypeError('Ungueltige sourceId.');
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isInteger(start) || !Number.isInteger(end)) {
        throw new TypeError('Start und Ende muessen endliche Unix-Millisekunden sein.');
    }
    if (Math.abs(start) > MAX_DATE_MS || Math.abs(end) > MAX_DATE_MS || start >= end) {
        throw new RangeError('Ungueltiger History-Zeitraum.');
    }
    if (end - start > MAX_HISTORY_RANGE_MS) {
        throw new RangeError('History-Zeitraum ist groesser als zehn Jahre.');
    }
    if (!ALLOWED_AGGREGATES.has(aggregate)) {
        throw new TypeError(`Ungueltiges History-Aggregat: ${aggregate}`);
    }
}

/**
 * Berechnet eine sinnvolle Anzahl Aggregations-Intervalle (Buckets) fuer einen Zeitraum,
 * damit die History-Instanz serverseitig aggregiert statt uns auf ihren eigenen
 * (unbekannten) Default-Bucketing zu verlassen. Stuendliche Buckets bis 3 Tage, taegliche
 * Buckets bis 90 Tage, sonst woechentliche Buckets — gedeckelt auf MAX_INTERVAL_COUNT,
 * damit die Antwort immer kompakt bleibt (nie "Megadaten" an das Modell).
 */
function computeIntervalCount(start, end) {
    const durationMs = Math.max(0, end - start);
    let bucketMs;
    if (durationMs <= 3 * DAY_MS) {
        bucketMs = HOUR_MS;
    } else if (durationMs <= 90 * DAY_MS) {
        bucketMs = DAY_MS;
    } else {
        bucketMs = 7 * DAY_MS;
    }
    const count = Math.ceil(durationMs / bucketMs) || 1;
    return Math.min(MAX_INTERVAL_COUNT, Math.max(1, count));
}

async function getHistory(adapter, historyInstance, sourceId, start, end, aggregate = 'average') {
    validateHistoryRequest(adapter, historyInstance, sourceId, start, end, aggregate);
    if (!(await isHistoryAvailable(adapter, historyInstance))) {
        throw new Error(`History-Instanz ${historyInstance} ist nach wiederholten Fehlern voruebergehend pausiert.`);
    }
    const isRaw = aggregate === 'none' || aggregate === 'onchange';
    const count = isRaw ? DEFAULT_RAW_COUNT : computeIntervalCount(start, end);

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(
            `dataAccess: getHistory an ${historyInstance}: sourceId=${sourceId}, start=${start} (${new Date(start).toISOString()}), end=${end} (${new Date(end).toISOString()}), aggregate=${aggregate}, count=${count}`
        );
    }

    let response;
    try {
        response = await adapter.sendToAsync(historyInstance, 'getHistory', {
            id: sourceId,
            options: { start, end, aggregate, count },
        });
    } catch (error) {
        await recordHistoryFailure(adapter, historyInstance, error);
        throw error;
    }

    if (!response || !Array.isArray(response.result)) {
        const error = new Error(`No history data returned for ${sourceId} from ${historyInstance}`);
        await recordHistoryFailure(adapter, historyInstance, error);
        throw error;
    }
    await recordHistorySuccess(adapter, historyInstance);

    if (isRaw && response.result.length >= count && adapter.log && adapter.log.warn) {
        adapter.log.warn(
            `dataAccess: getHistory fuer ${sourceId} (${historyInstance}) hat moeglicherweise das count-Limit (${count}) erreicht - Ergebnis koennte unvollstaendig sein (aggregate=${aggregate}, Zeitraum ${new Date(start).toISOString()} - ${new Date(end).toISOString()}).`
        );
    }

    return response.result;
}

async function compareTimeframes(adapter, historyInstance, sourceId, periodA, periodB, aggregate = 'average') {
    const [dataA, dataB] = await Promise.all([
        getHistory(adapter, historyInstance, sourceId, periodA.start, periodA.end, aggregate),
        getHistory(adapter, historyInstance, sourceId, periodB.start, periodB.end, aggregate),
    ]);

    const validPoints = (points) => points.filter((point) => Number.isFinite(point.val));
    const sum = (points) => validPoints(points).reduce((total, point) => total + point.val, 0);
    const avg = (points) => {
        const valid = validPoints(points);
        return valid.length ? sum(valid) / valid.length : 0;
    };

    return {
        periodA: { start: periodA.start, end: periodA.end, sum: sum(dataA), avg: avg(dataA), count: dataA.length },
        periodB: { start: periodB.start, end: periodB.end, sum: sum(dataB), avg: avg(dataB), count: dataB.length },
        deltaSum: sum(dataB) - sum(dataA),
        deltaAvg: avg(dataB) - avg(dataA),
    };
}

module.exports = { getHistory, compareTimeframes, computeIntervalCount, validateHistoryRequest, ALLOWED_AGGREGATES, MAX_HISTORY_RANGE_MS };
