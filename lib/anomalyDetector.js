// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
'use strict';

const { getHistory } = require('./dataAccess');

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

    const baselineMedian = median(baseline);
    const currentMedian = median(current);
    const mad = medianAbsoluteDeviation(baseline);
    const iqr = interquartileRange(baseline);
    const scale = Math.max(mad * MAD_TO_SIGMA, iqr / 1.349, Math.abs(baselineMedian) * 0.01, MIN_SCALE);
    const robustZ = Math.abs(currentMedian - baselineMedian) / scale;
    const relativeChange = Math.abs(baselineMedian) >= MIN_SCALE
        ? (currentMedian - baselineMedian) / Math.abs(baselineMedian)
        : null;

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

function isEligibleCatalogEntry(entry) {
    return Boolean(entry && entry.active !== false && !entry.ignored && entry.valueKind === 'gauge');
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

async function findAnomalyCandidates(adapter, entries, now = Date.now(), onProgress) {
    const eligible = (entries || []).filter(isEligibleCatalogEntry);
    const currentStart = now - DAY_MS;
    const baselineStart = now - 8 * DAY_MS;
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
            const [currentPoints, baselinePoints] = await Promise.all([
                getHistory(adapter, entry.historyInstance, entry.sourceId, currentStart, now, 'average'),
                getHistory(adapter, entry.historyInstance, entry.sourceId, baselineStart, currentStart, 'average'),
            ]);
            const evidence = detectSeriesAnomaly({
                currentValues: currentPoints.map(point => point && point.val),
                baselineValues: baselinePoints.map(point => point && point.val),
                dataCompleteness: entry.dataCompleteness,
            });
            if (evidence) candidates.push({ sourceId: entry.sourceId, description: entry.description, room: entry.room, unit: entry.unit, ...evidence });
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

module.exports = { median, medianAbsoluteDeviation, detectSeriesAnomaly, isEligibleCatalogEntry, findAnomalyCandidates };
