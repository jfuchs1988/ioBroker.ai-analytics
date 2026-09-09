// lib/periodValue.js
'use strict';

const { getHistory } = require('./dataAccess');
const { getLocalTimeZone, getLocalDayBoundaries } = require('./promptContext');
const MAX_HISTORY_RANGE_MS = 10 * 366 * 24 * 3600 * 1000;

function booleanValue(value) {
    if (typeof value === 'string') return !['', '0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
    return value === true || value === 1;
}

function maxValue(point) {
    const value = Number(point && (point.max !== undefined ? point.max : point.val));
    return Number.isFinite(value) ? value : null;
}

function resolvePeriod(period, now = Date.now()) {
    if (typeof period.dayOffset === 'number') {
        const target = now + period.dayOffset * 24 * 3600 * 1000;
        return getLocalDayBoundaries(target, getLocalTimeZone());
    }
    return { start: period.start, end: period.end };
}

async function computePeriodValue(adapter, entry, period) {
    const { historyInstance, sourceId } = entry;
    const kind = entry.valueKind || 'gauge';

    if (kind === 'boolean_state') {
        const lookback = Math.min(MAX_HISTORY_RANGE_MS, Math.max(0, MAX_HISTORY_RANGE_MS - (period.end - period.start)));
        const points = await getHistory(adapter, historyInstance, sourceId, period.start - lookback, period.end, 'onchange');
        if (points.truncated === true) throw new Error('Boolean-History ist wegen des Rohdatenlimits unvollständig.');
        let onDurationMs = 0;
        let lastTs = period.start;
        let lastVal = false;
        let switchCount = 0;
        for (const point of points) {
            if (point.ts < period.start) {
                lastVal = booleanValue(point.val);
                continue;
            }
            switchCount++;
            if (lastVal) onDurationMs += point.ts - lastTs;
            lastTs = point.ts;
            lastVal = booleanValue(point.val);
        }
        if (lastVal) onDurationMs += period.end - lastTs;
        return { onDurationMs, switchCount };
    }

    if (kind === 'daily_reset_counter') {
        const points = await getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'minmax');
        const dailyMaximums = new Map();
        for (const point of points) {
            const value = maxValue(point);
            if (value === null) continue;
            const day = Number.isFinite(point.ts) ? new Date(point.ts).toISOString().slice(0, 10) : 'period';
            dailyMaximums.set(day, Math.max(dailyMaximums.get(day) || 0, value));
        }
        const total = [...dailyMaximums.values()].reduce((sum, value) => sum + value, 0);
        return { total };
    }

    if (kind === 'cumulative_total') {
        const [beforePoints, periodPoints] = await Promise.all([
            getHistory(adapter, historyInstance, sourceId, period.start - 24 * 3600 * 1000, period.start, 'minmax'),
            getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'minmax'),
        ]);
        let previous = beforePoints.length ? (maxValue(beforePoints[beforePoints.length - 1]) ?? 0) : 0;
        let total = 0;
        for (const point of periodPoints) {
            const current = maxValue(point);
            if (current === null) continue;
            total += current >= previous ? current - previous : current;
            previous = current;
        }
        return { total };
    }

    if (kind === 'event_count') {
        const points = await getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'total');
        const total = points.reduce((sum, point) => sum + (Number.isFinite(point.val) ? point.val : 0), 0);
        return { total };
    }

    const points = (await getHistory(adapter, historyInstance, sourceId, period.start, period.end, 'average'))
        .filter(point => Number.isFinite(point.ts) && Number.isFinite(point.val) && point.ts < period.end)
        .sort((a, b) => a.ts - b.ts);
    const values = points.map(point => point.val);
    let weightedSum = 0;
    let weightedDuration = 0;
    points.forEach((point, index) => {
        const start = Math.max(period.start, point.ts);
        const end = Math.min(period.end, points[index + 1] ? points[index + 1].ts : period.end);
        if (end > start) {
            weightedSum += point.val * (end - start);
            weightedDuration += end - start;
        }
    });
    const avg = weightedDuration ? weightedSum / weightedDuration : values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return { avg, min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
}

module.exports = { resolvePeriod, computePeriodValue };
