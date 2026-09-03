'use strict';

const MIN_DELTAS_FOR_PATTERN = 4; // = 5 Rohpunkte
const CV_CONTINUOUS_THRESHOLD = 0.5;

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

module.exports = { computeWritable, computeDeltas, detectWritePattern };
