'use strict';

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

module.exports = { VALUE_KINDS, classifyFromMetadata, detectPatternFromSamples };
