'use strict';

const { getHistory } = require('./dataAccess');

const MIN_DELTAS_FOR_PATTERN = 4; // = 5 Rohpunkte
const CV_CONTINUOUS_THRESHOLD = 0.5;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const LOOKBACK_STEPS_MS = [DAY_MS, 3 * DAY_MS, 7 * DAY_MS];

const GAP_MULTIPLIER = 5;
const STALE_MULTIPLIER = 3;
const STALE_MIN_FLOOR_MS = DAY_MS;

function computeWritable(obj) {
    return Boolean(obj && obj.common && obj.common.write);
}

function computeDeltas(points) {
    const valid = (points || [])
        .filter((point) => point && Number.isFinite(point.ts))
        .slice()
        .sort((a, b) => a.ts - b.ts);

    const deltas = [];
    for (let i = 1; i < valid.length; i++) {
        deltas.push(valid[i].ts - valid[i - 1].ts);
    }
    return deltas;
}

function coefficientOfVariation(numbers) {
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    if (mean === 0) return 0;
    const variance = numbers.reduce((sum, n) => sum + (n - mean) ** 2, 0) / numbers.length;
    return Math.sqrt(variance) / mean;
}

/**
 * Ordnet ein Objekt anhand der Regelmaessigkeit seiner Schreibabstaende einem
 * Schreibmuster zu. Ein niedriger Variationskoeffizient bedeutet festen Takt
 * ("continuous") — UNABHAENGIG davon, ob sich der Wert dabei aendert (viele
 * ioBroker-Objekte schreiben denselben Wert alle paar Sekunden erneut). Ein
 * hoher Variationskoeffizient bedeutet ereignisgetriebenes Schreiben
 * ("on_change").
 */
function detectWritePattern(deltasMs) {
    if (!deltasMs || deltasMs.length < MIN_DELTAS_FOR_PATTERN) {
        return 'unknown';
    }
    const cv = coefficientOfVariation(deltasMs);
    return cv < CV_CONTINUOUS_THRESHOLD ? 'continuous' : 'on_change';
}

function median(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Bucketed die Update-Frequenz. Bei on_change gibt es keinen sinnvollen
 * festen Takt — dort wird bewusst nur "event_driven" ausgewiesen statt einer
 * Ereignisraten-Berechnung (siehe Spec, Nicht-Ziele dieser Iteration).
 */
function bucketUpdateFrequency(writePattern, medianDeltaMs) {
    if (writePattern === 'on_change') return 'event_driven';
    if (writePattern !== 'continuous' || !Number.isFinite(medianDeltaMs)) return 'unknown';
    if (medianDeltaMs < 2 * MINUTE_MS) return 'seconds';
    if (medianDeltaMs < 2 * HOUR_MS) return 'minutes';
    if (medianDeltaMs < 2 * DAY_MS) return 'hourly';
    if (medianDeltaMs < 14 * DAY_MS) return 'daily';
    return 'weekly_or_slower';
}

/**
 * Bewertet Datenvollstaendigkeit unterschiedlich je nach Schreibmuster:
 * - continuous: erwarteter Abstand = medianDeltaMs. Eine Innere Luecke ODER die
 *   Zeit seit dem letzten Punkt bis "now", die GAP_MULTIPLIER-fach ueber dem
 *   Median liegt, gilt als Luecke.
 * - on_change: es gibt keinen festen erwarteten Abstand. Massstab ist die
 *   groesste HISTORISCH beobachtete Luecke dieses Objekts selbst — ist die
 *   aktuelle Stille STALE_MULTIPLIER-fach darueber (mit einer Mindestschwelle
 *   STALE_MIN_FLOOR_MS, damit Objekte mit nur wenigen historischen Ereignissen
 *   nicht sofort als "stale" gelten), ist das ein Verdacht auf eine tote Quelle
 *   statt eines normalerweise stabilen Werts.
 */
function detectDataCompleteness({ writePattern, deltasMs, medianDeltaMs, lastPointTs, now }) {
    if (writePattern === 'unknown' || !deltasMs || deltasMs.length === 0) {
        return 'unknown';
    }

    const sinceLastMs = now - lastPointTs;

    if (writePattern === 'continuous') {
        const threshold = medianDeltaMs * GAP_MULTIPLIER;
        const largestInteriorGap = Math.max(...deltasMs);
        return largestInteriorGap > threshold || sinceLastMs > threshold ? 'gaps' : 'complete';
    }

    const maxHistoricalGapMs = Math.max(...deltasMs);
    const threshold = Math.max(maxHistoricalGapMs * STALE_MULTIPLIER, STALE_MIN_FLOOR_MS);
    return sinceLastMs > threshold ? 'stale' : 'complete';
}

/**
 * Vollstaendige Klassifizierung: writable ist sofort aus Metadaten bekannt.
 * Die uebrigen drei Felder brauchen eine Datenprobe mit eskalierendem Lookback
 * (24h -> 3d -> 7d), bis genug Punkte fuer ein eindeutiges Schreibmuster da
 * sind; bleibt es bis zur letzten Stufe unklar, bleiben alle drei "unknown".
 */
async function classifyDataQuality(adapter, obj, historyInstance) {
    const writable = computeWritable(obj);
    const sourceId = obj && obj.id;
    const now = Date.now();

    for (const lookbackMs of LOOKBACK_STEPS_MS) {
        const points = await getHistory(adapter, historyInstance, sourceId, now - lookbackMs, now, 'none');
        const deltas = computeDeltas(points);
        const writePattern = detectWritePattern(deltas);

        if (writePattern !== 'unknown') {
            const medianDeltaMs = median(deltas);
            const sortedPoints = (points || []).slice().sort((a, b) => a.ts - b.ts);
            const lastPointTs = sortedPoints[sortedPoints.length - 1].ts;
            const updateFrequency = bucketUpdateFrequency(writePattern, medianDeltaMs);
            const dataCompleteness = detectDataCompleteness({ writePattern, deltasMs: deltas, medianDeltaMs, lastPointTs, now });
            return { writable, writePattern, updateFrequency, dataCompleteness };
        }
    }

    return { writable, writePattern: 'unknown', updateFrequency: 'unknown', dataCompleteness: 'unknown' };
}

module.exports = {
    computeWritable,
    computeDeltas,
    detectWritePattern,
    median,
    bucketUpdateFrequency,
    detectDataCompleteness,
    classifyDataQuality,
};
