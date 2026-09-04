// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
'use strict';

const { getHistory } = require('./dataAccess');
const { computePeriodValue, resolvePeriod } = require('./periodValue');

const MIN_POINTS = 3;
const ROBUST_Z_THRESHOLD = 3.5;
const RELATIVE_CHANGE_THRESHOLD = 0.5;
const MAD_TO_SIGMA = 1.4826;
const MIN_SCALE = 1e-9;
const DAY_MS = 24 * 3600 * 1000;

function finiteValues(values) {
    return (values || []).filter(Number.isFinite);
}

function median(values) {
    const sorted = finiteValues(values).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function medianAbsoluteDeviation(values) {
    const clean = finiteValues(values);
    const center = median(clean);
    if (center === null) return null;
    return median(clean.map(value => Math.abs(value - center)));
}

function interquartileRange(values) {
    const sorted = finiteValues(values).slice().sort((a, b) => a - b);
    if (sorted.length < 2) return 0;
    const middle = Math.floor(sorted.length / 2);
    const lower = sorted.slice(0, middle);
    const upper = sorted.slice(sorted.length % 2 ? middle + 1 : middle);
    return median(upper) - median(lower);
}

function robustDeviation(currentMedian, baselineValues) {
    const baseline = finiteValues(baselineValues);
    const baselineMedian = median(baseline);
    const mad = medianAbsoluteDeviation(baseline);
    const iqr = interquartileRange(baseline);
    const scale = Math.max(mad * MAD_TO_SIGMA, iqr / 1.349, Math.abs(baselineMedian) * 0.01, MIN_SCALE);
    const robustZ = Math.abs(currentMedian - baselineMedian) / scale;
    const relativeChange = Math.abs(baselineMedian) >= MIN_SCALE
        ? (currentMedian - baselineMedian) / Math.abs(baselineMedian)
        : null;
    return { baselineMedian, robustZ, relativeChange };
}

function detectSeriesAnomaly({ currentValues, baselineValues, dataCompleteness = 'unknown' } = {}) {
    const current = finiteValues(currentValues);
    const baseline = finiteValues(baselineValues);
    const currentCount = current.length;
    const baselineCount = baseline.length;

    if (dataCompleteness === 'gaps' || dataCompleteness === 'stale' || !currentCount) {
        if (baselineCount < MIN_POINTS) return null;
        return {
            reason: 'missing_data',
            baselineMedian: median(baseline),
            currentMedian: currentCount ? median(current) : null,
            robustZ: null,
            relativeChange: null,
            currentCount,
            baselineCount,
            dataCompleteness,
        };
    }

    if (currentCount < MIN_POINTS || baselineCount < MIN_POINTS) return null;

    const currentMedian = median(current);
    const { baselineMedian, robustZ, relativeChange } = robustDeviation(currentMedian, baseline);

    if (robustZ < ROBUST_Z_THRESHOLD && (relativeChange === null || Math.abs(relativeChange) < RELATIVE_CHANGE_THRESHOLD)) {
        return null;
    }

    return {
        reason: 'deviation',
        baselineMedian,
        currentMedian,
        robustZ,
        relativeChange,
        currentCount,
        baselineCount,
        dataCompleteness,
    };
}

function detectDailyAggregateAnomaly({ currentValue, baselineValues, dataCompleteness = 'unknown' } = {}) {
    const baseline = finiteValues(baselineValues);
    const baselineCount = baseline.length;
    const hasCurrentValue = Number.isFinite(currentValue);
    const currentCount = hasCurrentValue ? 1 : 0;

    if (dataCompleteness === 'gaps' || dataCompleteness === 'stale' || !hasCurrentValue) {
        if (baselineCount < MIN_POINTS) return null;
        return {
            reason: 'missing_data',
            baselineMedian: median(baseline),
            currentValue: hasCurrentValue ? currentValue : null,
            robustZ: null,
            relativeChange: null,
            currentCount,
            baselineCount,
            dataCompleteness,
        };
    }

    if (baselineCount < MIN_POINTS) return null;

    const { baselineMedian, robustZ, relativeChange } = robustDeviation(currentValue, baseline);

    if (robustZ < ROBUST_Z_THRESHOLD && (relativeChange === null || Math.abs(relativeChange) < RELATIVE_CHANGE_THRESHOLD)) {
        return null;
    }

    return {
        reason: 'deviation',
        baselineMedian,
        currentValue,
        robustZ,
        relativeChange,
        currentCount,
        baselineCount,
        dataCompleteness,
    };
}

const DAILY_KINDS = new Set(['daily_reset_counter', 'cumulative_total', 'event_count', 'boolean_state']);

function isEligibleCatalogEntry(entry) {
    return Boolean(
        entry &&
        entry.active !== false &&
        !entry.ignored &&
        (entry.valueKind === 'gauge' || DAILY_KINDS.has(entry.valueKind))
    );
}

async function reportProgress(adapter, onProgress, progress) {
    if (!onProgress) return;
    try {
        await onProgress(progress);
    } catch (error) {
        if (adapter.log && adapter.log.warn) {
            adapter.log.warn(`Fortschritt der Anomalievoranalyse konnte nicht geschrieben werden: ${error.message}`);
        }
    }
}

async function findGaugeCandidate(adapter, entry, now) {
    const currentStart = now - DAY_MS;
    const baselineStart = now - 8 * DAY_MS;
    const [currentPoints, baselinePoints] = await Promise.all([
        getHistory(adapter, entry.historyInstance, entry.sourceId, currentStart, now, 'average'),
        getHistory(adapter, entry.historyInstance, entry.sourceId, baselineStart, currentStart, 'average'),
    ]);
    const evidence = detectSeriesAnomaly({
        currentValues: currentPoints.map(point => point && point.val),
        baselineValues: baselinePoints.map(point => point && point.val),
        dataCompleteness: entry.dataCompleteness,
    });
    if (!evidence) return null;
    return { sourceId: entry.sourceId, description: entry.description, room: entry.room, unit: entry.unit, valueKind: 'gauge', ...evidence };
}

const BASELINE_DAY_OFFSETS = [-8, -7, -6, -5, -4, -3, -2];
const CURRENT_DAY_OFFSET = -1;

function metricFromPeriodValue(kind, periodValue) {
    return kind === 'boolean_state' ? periodValue.onDurationMs : periodValue.total;
}

async function findDailyCandidate(adapter, entry, now) {
    const kind = entry.valueKind;
    const baselineValues = [];
    for (const dayOffset of BASELINE_DAY_OFFSETS) {
        const period = resolvePeriod({ dayOffset }, now);
        const periodValue = await computePeriodValue(adapter, entry, period);
        baselineValues.push(metricFromPeriodValue(kind, periodValue));
    }
    const currentPeriod = resolvePeriod({ dayOffset: CURRENT_DAY_OFFSET }, now);
    const currentPeriodValue = await computePeriodValue(adapter, entry, currentPeriod);
    const currentValue = metricFromPeriodValue(kind, currentPeriodValue);

    const evidence = detectDailyAggregateAnomaly({ currentValue, baselineValues, dataCompleteness: entry.dataCompleteness });
    if (!evidence) return null;

    const { currentValue: rawCurrentValue, baselineMedian, ...rest } = evidence;
    const fieldName = kind === 'boolean_state' ? 'OnDurationMs' : 'Total';
    return {
        sourceId: entry.sourceId,
        description: entry.description,
        room: entry.room,
        unit: entry.unit,
        valueKind: kind,
        [`current${fieldName}`]: rawCurrentValue,
        [`baselineMedian${fieldName}`]: baselineMedian,
        ...rest,
    };
}

async function findAnomalyCandidates(adapter, entries, now = Date.now(), onProgress) {
    const eligible = (entries || []).filter(isEligibleCatalogEntry);
    const candidates = [];
    let failedCount = 0;

    for (let index = 0; index < eligible.length; index++) {
        const entry = eligible[index];
        await reportProgress(adapter, onProgress, {
            processed: index,
            total: eligible.length,
            currentSourceId: entry.sourceId,
            message: `Statistische Voranalyse ${index}/${eligible.length}...`,
        });
        try {
            const evidence = entry.valueKind === 'gauge'
                ? await findGaugeCandidate(adapter, entry, now)
                : await findDailyCandidate(adapter, entry, now);
            if (evidence) candidates.push(evidence);
        } catch (error) {
            failedCount++;
            if (adapter.log && adapter.log.warn) {
                adapter.log.warn(`Anomalievoranalyse fuer ${entry.sourceId} fehlgeschlagen: ${error.message}`);
            }
        }
        await reportProgress(adapter, onProgress, {
            processed: index + 1,
            total: eligible.length,
            currentSourceId: entry.sourceId,
            message: `Statistische Voranalyse ${index + 1}/${eligible.length}...`,
        });
    }

    Object.defineProperty(candidates, 'failedCount', { value: failedCount, enumerable: false });
    return candidates;
}

module.exports = {
    median,
    medianAbsoluteDeviation,
    detectSeriesAnomaly,
    detectDailyAggregateAnomaly,
    isEligibleCatalogEntry,
    findAnomalyCandidates,
    findGaugeCandidate,
    findDailyCandidate,
};
