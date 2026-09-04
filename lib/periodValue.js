// lib/periodValue.js
'use strict';

const { getHistory } = require('./dataAccess');
const { getLocalTimeZone, getLocalDayBoundaries } = require('./promptContext');

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

module.exports = { resolvePeriod, computePeriodValue };
