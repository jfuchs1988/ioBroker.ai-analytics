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

module.exports = { VALUE_KINDS, classifyFromMetadata };
