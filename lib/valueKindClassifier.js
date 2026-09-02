'use strict';

const { getHistory } = require('./dataAccess');

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LOOKBACK_STEPS_MS = [48 * HOUR_MS, 7 * DAY_MS, 30 * DAY_MS, 365 * DAY_MS];
const CUMULATIVE_MIN_SPAN_MS = 5 * DAY_MS;

const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];

const DAILY_HINTS = ['heute', 'today', 'daily', 'tages'];
const TOTAL_HINTS = ['gesamt', 'total', 'lifetime'];

/**
 * Stufe 1 der Klassifizierung: rein aus ioBroker-Objekt-Metadaten, ohne History-Abruf.
 * Boolean-Typ ist eindeutig (confidence high); alles andere ist ein Verdacht (confidence
 * low), den Stufe 2 (Datenprobe, siehe classifyValueKind) bestaetigen oder verwerfen kann.
 */
function classifyFromMetadata(obj) {
    const common = (obj && obj.common) || {};
    const id = (obj && obj.id) || '';
    const name = common.name || '';
    const role = common.role || '';
    const haystack = `${id} ${name} ${role}`.toLowerCase();

    if (common.type === 'boolean') {
        return { valueKind: 'boolean_state', valueKindConfidence: 'high', valueKindSource: 'metadata' };
    }

    if (DAILY_HINTS.some((hint) => haystack.includes(hint))) {
        return { valueKind: 'daily_reset_counter', valueKindConfidence: 'low', valueKindSource: 'metadata' };
    }

    if (TOTAL_HINTS.some((hint) => haystack.includes(hint))) {
        return { valueKind: 'cumulative_total', valueKindConfidence: 'low', valueKindSource: 'metadata' };
    }

    return { valueKind: 'gauge', valueKindConfidence: 'low', valueKindSource: 'metadata' };
}

function getSampleAggregate(historyInstance) {
    if (typeof historyInstance === 'string' && /^influxdb\.\d+$/.test(historyInstance)) {
        return 'average';
    }
    return 'none';
}

const RESET_DROP_RATIO = 0.5;

/**
 * Stufe 2 (Rohdaten-Analyse) der Klassifizierung: erkennt das Verhalten einer Zeitreihe.
 * Reset-Erkennung ist wertbasiert (Abfall auf < RESET_DROP_RATIO des bisherigen Maximums),
 * nicht zeitbasiert — funktioniert damit unabhaengig davon, ob der Reset exakt um Mitternacht
 * liegt.
 */
function detectPatternFromSamples(points) {
    const validPoints = (points || []).filter((point) => point && typeof point.val === 'number' && Number.isFinite(point.val));
    if (validPoints.length < 3) {
        return null;
    }

    const distinctValues = new Set(validPoints.map((point) => point.val));
    if (distinctValues.size <= 2 && [...distinctValues].every((value) => value === 0 || value === 1)) {
        return 'boolean_state';
    }

    let runningMax = validPoints[0].val;
    let sawReset = false;
    let sawPlainDecrease = false;

    for (let i = 1; i < validPoints.length; i++) {
        const curr = validPoints[i].val;
        if (curr < runningMax) {
            if (runningMax > 0 && curr <= runningMax * RESET_DROP_RATIO) {
                sawReset = true;
                runningMax = curr;
                continue;
            }
            sawPlainDecrease = true;
        }
        runningMax = Math.max(runningMax, curr);
    }

    if (sawPlainDecrease) {
        return 'gauge';
    }
    if (sawReset) {
        return 'daily_reset_counter';
    }
    return 'monotonic_no_reset';
}

/**
 * Vollstaendige Klassifizierung: Stufe 1 (Metadaten) zuerst; bei boolean_state (sicher)
 * sofort fertig, sonst Stufe 2 mit eskalierendem Lookback (48h -> 7d -> 30d -> 365d) bis
 * ein eindeutiges Muster erkannt wird oder alle Stufen erschoepft sind (dann bleibt der
 * Metadaten-Verdacht mit confidence low stehen).
 */
async function classifyValueKind(adapter, obj, historyInstance) {
    const metadataGuess = classifyFromMetadata(obj);
    if (metadataGuess.valueKind === 'boolean_state' && metadataGuess.valueKindConfidence === 'high') {
        return metadataGuess;
    }

    const sampleAggregate = getSampleAggregate(historyInstance);

    const sourceId = obj && obj.id;
    const now = Date.now();

    for (const lookbackMs of LOOKBACK_STEPS_MS) {
        const points = await getHistory(adapter, historyInstance, sourceId, now - lookbackMs, now, sampleAggregate);
        const signal = detectPatternFromSamples(points);

        if (signal === 'boolean_state' || signal === 'gauge' || signal === 'daily_reset_counter') {
            return { valueKind: signal, valueKindConfidence: 'high', valueKindSource: 'sampled' };
        }
        if (signal === 'monotonic_no_reset' && lookbackMs >= CUMULATIVE_MIN_SPAN_MS) {
            return { valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' };
        }
    }

    return metadataGuess;
}

module.exports = { VALUE_KINDS, classifyFromMetadata, detectPatternFromSamples, classifyValueKind };
