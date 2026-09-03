# Katalog-Datenqualität — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder katalogisierte Datenpunkt bekommt automatisch berechnete Datenqualitäts-Felder (`writable`, `writePattern`, `updateFrequency`, `dataCompleteness`), damit der Chat-Agent und das Geräte-Tab wissen, ob ein Objekt schreibbar ist, wie regelmäßig es Werte liefert und ob seine History-Daten vollständig sind — inklusive korrekter Unterscheidung zwischen kontinuierlich schreibenden und on-change schreibenden Objekten bei der Lückenerkennung.

**Architecture:** Neues Modul `lib/dataQualityClassifier.js` kapselt die Klassifizierung als reine, testbare Funktionen (Schreibmuster-Erkennung aus Zeit-Deltas, Frequenz-Bucketing, Vollständigkeits-Bewertung) plus eine async Orchestrierungsfunktion mit eskalierendem History-Lookback (24h → 3d → 7d), analog zu `lib/valueKindClassifier.js`. `lib/onboarding.js` ruft sie für neu entdeckte Objekte auf; `main.js`s `syncCatalog()` ruft sie zusätzlich für bestehende Objekte ohne (oder mit `unknown`) `writePattern` auf, gedeckelt und nur bei aktiviertem Admin-Schalter. `lib/tools.js` gibt die drei berechneten Felder in `getPeriodTotal`/`comparePeriods` zurück. Das Geräte-Tab (`src-admin/src/Components.jsx`) bekommt drei neue, rein lesende Spalten und CSV-Export-Unterstützung.

**Tech Stack:** Node.js (CommonJS, kein Build-Schritt — [ADR-0009](../adr/0009-reines-javascript-kein-typescript.md)), Mocha/Chai/Sinon/Proxyquire für Unit-Tests.

**Spec:** [docs/specs/2026-09-03-katalog-datenqualitaet.md](../specs/2026-09-03-katalog-datenqualitaet.md)

## Global Constraints

- `npm test` (= `test:unit` + `test:adapter`) muss vor jedem Commit grün sein.
- Neue `lib/*`-Module bekommen eigene Unit-Tests mit gemockter Adapter-API (kein echter DB-/LLM-/Socket-Zugriff in Tests).
- Kein TypeScript, kein Build-Schritt, reines CommonJS ([ADR-0009](../adr/0009-reines-javascript-kein-typescript.md)).
- Alle Tasks laufen auf dem bereits angelegten Branch `feature/katalog-datenqualitaet` (ein Branch pro Task-Ablauf, siehe `AGENTS.md` — kein Branch pro Plan-Task mehr, das ältere Muster aus ADR-0019 ist historisch). Jeder Task endet trotzdem mit einem eigenen, thematisch geschlossenen Commit.
- `main.js` bekommt laut etabliertem Präzedenzfall (siehe `valueKind`-Backfill) **keine** neuen Tests für reine Verdrahtung — die eigentliche Logik ist im `lib/*`-Modul getestet.
- Reine History-Abrufe zur Mustererkennung zählen **nicht** gegen `dailyTokenBudget` — kein LLM-Aufruf in diesem Klassifizierer.
- Commit-Nachrichten erklären das Warum, mit `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383`.
- Alle vier neuen Felder sind rein berechnet — kein manuelles Override im Geräte-Tab, kein CSV-Import-Support dafür (siehe Spec, Nicht-Ziele).

---

## Task 1: `lib/dataQualityClassifier.js` — Schreibbarkeit + Schreibmuster-Erkennung

**Files:**
- Create: `lib/dataQualityClassifier.js`
- Create: `test/unit/dataQualityClassifier.test.js`

**Interfaces:**
- Produces: `computeWritable(obj) => boolean`; `computeDeltas(points) => number[]` (sortiert nach `ts`, Millisekunden-Abstände zwischen aufeinanderfolgenden Punkten); `detectWritePattern(deltasMs) => 'continuous' | 'on_change' | 'unknown'`. Wird von Task 2 (Bucketing/Vollständigkeit) und Task 3 (Orchestrierung) konsumiert.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Neue Datei `test/unit/dataQualityClassifier.test.js`:

```js
const { expect } = require('chai');
const { computeWritable, computeDeltas, detectWritePattern } = require('../../lib/dataQualityClassifier');

describe('computeWritable', () => {
    it('returns true when common.write is true', () => {
        expect(computeWritable({ common: { write: true } })).to.equal(true);
    });

    it('returns false when common.write is false or missing', () => {
        expect(computeWritable({ common: { write: false } })).to.equal(false);
        expect(computeWritable({ common: {} })).to.equal(false);
        expect(computeWritable({})).to.equal(false);
        expect(computeWritable(null)).to.equal(false);
    });
});

describe('computeDeltas', () => {
    it('returns the millisecond gaps between consecutive points, sorted by ts', () => {
        const points = [{ ts: 100, val: 1 }, { ts: 10, val: 0 }, { ts: 250, val: 1 }];
        expect(computeDeltas(points)).to.deep.equal([90, 150]);
    });

    it('returns an empty array for fewer than two points', () => {
        expect(computeDeltas([{ ts: 1, val: 0 }])).to.deep.equal([]);
        expect(computeDeltas([])).to.deep.equal([]);
    });

    it('ignores points without a finite ts', () => {
        const points = [{ ts: 10, val: 0 }, { ts: null, val: 1 }, { ts: 40, val: 1 }];
        expect(computeDeltas(points)).to.deep.equal([30]);
    });
});

describe('detectWritePattern', () => {
    it('returns unknown when there are fewer than 4 deltas (5 points)', () => {
        expect(detectWritePattern([1000, 1000, 1000])).to.equal('unknown');
        expect(detectWritePattern([])).to.equal('unknown');
    });

    it('detects continuous for a regular cadence (low coefficient of variation)', () => {
        // Same delta every time, e.g. a sensor writing every 10s regardless of value change.
        expect(detectWritePattern([10000, 10000, 10000, 10000, 10000])).to.equal('continuous');
    });

    it('detects continuous even with small jitter around a regular cadence', () => {
        expect(detectWritePattern([9800, 10200, 9900, 10100, 10000])).to.equal('continuous');
    });

    it('detects on_change for highly irregular deltas (event-driven)', () => {
        expect(detectWritePattern([2000, 900000, 15000, 3600000, 45000])).to.equal('on_change');
    });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/dataQualityClassifier.test.js`
Expected: FAIL — `Cannot find module '../../lib/dataQualityClassifier'`

- [ ] **Step 3: Implementierung**

Neue Datei `lib/dataQualityClassifier.js`:

```js
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
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/dataQualityClassifier.test.js`
Expected: PASS (alle 11 Tests)

- [ ] **Step 5: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/dataQualityClassifier.js test/unit/dataQualityClassifier.test.js
git commit -m "$(cat <<'EOF'
feat: add writable + write-pattern detection to dataQualityClassifier

First piece of the new lib/dataQualityClassifier.js module (see
docs/specs/2026-09-03-katalog-datenqualitaet.md): writable comes
directly from common.write; write pattern (continuous vs. on_change)
is derived from the coefficient of variation of inter-sample time
deltas, so an object that rewrites the same value every few seconds is
correctly classified as continuous, not on_change.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
```

---

## Task 2: `lib/dataQualityClassifier.js` — Update-Frequenz-Bucketing + Datenvollständigkeit

**Files:**
- Modify: `lib/dataQualityClassifier.js`
- Test: `test/unit/dataQualityClassifier.test.js`

**Interfaces:**
- Consumes: nichts Neues von anderen Tasks.
- Produces: `median(numbers) => number`; `bucketUpdateFrequency(writePattern, medianDeltaMs) => 'seconds' | 'minutes' | 'hourly' | 'daily' | 'weekly_or_slower' | 'event_driven' | 'unknown'`; `detectDataCompleteness({writePattern, deltasMs, medianDeltaMs, lastPointTs, now}) => 'complete' | 'gaps' | 'stale' | 'unknown'`. Wird von Task 3 (Orchestrierung) konsumiert.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

In `test/unit/dataQualityClassifier.test.js`, Import erweitern:

```js
const {
    computeWritable,
    computeDeltas,
    detectWritePattern,
    median,
    bucketUpdateFrequency,
    detectDataCompleteness,
} = require('../../lib/dataQualityClassifier');
```

Neue `describe`-Blöcke am Dateiende:

```js
describe('median', () => {
    it('returns the middle value for an odd-length array', () => {
        expect(median([5, 1, 3])).to.equal(3);
    });

    it('averages the two middle values for an even-length array', () => {
        expect(median([10, 20, 30, 40])).to.equal(25);
    });
});

describe('bucketUpdateFrequency', () => {
    it('returns event_driven for on_change regardless of median', () => {
        expect(bucketUpdateFrequency('on_change', 5000)).to.equal('event_driven');
    });

    it('returns unknown for writePattern unknown', () => {
        expect(bucketUpdateFrequency('unknown', 5000)).to.equal('unknown');
    });

    it('buckets a continuous pattern by median delta', () => {
        const MIN = 60 * 1000;
        const HOUR = 3600 * 1000;
        const DAY = 24 * HOUR;
        expect(bucketUpdateFrequency('continuous', 10 * 1000)).to.equal('seconds');
        expect(bucketUpdateFrequency('continuous', 30 * MIN)).to.equal('minutes');
        expect(bucketUpdateFrequency('continuous', 12 * HOUR)).to.equal('hourly');
        expect(bucketUpdateFrequency('continuous', 5 * DAY)).to.equal('daily');
        expect(bucketUpdateFrequency('continuous', 30 * DAY)).to.equal('weekly_or_slower');
    });
});

describe('detectDataCompleteness', () => {
    const HOUR = 3600 * 1000;
    const DAY = 24 * HOUR;

    it('returns unknown when writePattern is unknown', () => {
        const result = detectDataCompleteness({ writePattern: 'unknown', deltasMs: [], medianDeltaMs: 0, lastPointTs: 0, now: 0 });
        expect(result).to.equal('unknown');
    });

    it('continuous: returns complete when no gap exceeds the multiplier and the tail is fresh', () => {
        const now = 100000;
        const result = detectDataCompleteness({
            writePattern: 'continuous',
            deltasMs: [10000, 10000, 9000, 11000],
            medianDeltaMs: 10000,
            lastPointTs: now - 5000,
            now,
        });
        expect(result).to.equal('complete');
    });

    it('continuous: returns gaps when an interior gap exceeds 5x the median', () => {
        const now = 100000;
        const result = detectDataCompleteness({
            writePattern: 'continuous',
            deltasMs: [10000, 60000, 9000, 11000], // 60000 = 6x median
            medianDeltaMs: 10000,
            lastPointTs: now - 5000,
            now,
        });
        expect(result).to.equal('gaps');
    });

    it('continuous: returns gaps when the tail (now - lastPointTs) exceeds 5x the median', () => {
        const now = 200000;
        const result = detectDataCompleteness({
            writePattern: 'continuous',
            deltasMs: [10000, 10000, 9000, 11000],
            medianDeltaMs: 10000,
            lastPointTs: now - 60000, // 60000 = 6x median, source has gone quiet
            now,
        });
        expect(result).to.equal('gaps');
    });

    it('on_change: returns complete when the current silence is within the historical max gap * 3', () => {
        const now = 10 * DAY;
        const result = detectDataCompleteness({
            writePattern: 'on_change',
            deltasMs: [DAY, 2 * DAY, 3 * DAY], // max historical gap = 3 days
            medianDeltaMs: 2 * DAY,
            lastPointTs: now - 5 * DAY, // within 3 * 3 days = 9 days
            now,
        });
        expect(result).to.equal('complete');
    });

    it('on_change: returns stale when the current silence exceeds the historical max gap * 3', () => {
        const now = 20 * DAY;
        const result = detectDataCompleteness({
            writePattern: 'on_change',
            deltasMs: [DAY, 2 * DAY, 3 * DAY], // max historical gap = 3 days, threshold = 9 days
            medianDeltaMs: 2 * DAY,
            lastPointTs: now - 10 * DAY,
            now,
        });
        expect(result).to.equal('stale');
    });

    it('on_change: applies the 24h floor so an object with only a couple of events is not immediately stale', () => {
        const now = 2 * DAY;
        // Historical max gap is tiny (1 minute), naive 3x would flag anything past 3 minutes as stale.
        const result = detectDataCompleteness({
            writePattern: 'on_change',
            deltasMs: [60 * 1000, 45 * 1000, 50 * 1000],
            medianDeltaMs: 50 * 1000,
            lastPointTs: now - (23 * HOUR), // within the 24h floor
            now,
        });
        expect(result).to.equal('complete');
    });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/dataQualityClassifier.test.js`
Expected: FAIL — `median is not a function`

- [ ] **Step 3: Implementierung**

In `lib/dataQualityClassifier.js`, Konstanten am Dateianfang (nach den bestehenden) ergänzen:

```js
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const GAP_MULTIPLIER = 5;
const STALE_MULTIPLIER = 3;
const STALE_MIN_FLOOR_MS = DAY_MS;
```

Neue Funktionen nach `detectWritePattern` einfügen:

```js
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
```

`module.exports` erweitern:

```js
module.exports = {
    computeWritable,
    computeDeltas,
    detectWritePattern,
    median,
    bucketUpdateFrequency,
    detectDataCompleteness,
};
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/dataQualityClassifier.test.js`
Expected: PASS (alle Tests in der Datei)

- [ ] **Step 5: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/dataQualityClassifier.js test/unit/dataQualityClassifier.test.js
git commit -m "$(cat <<'EOF'
feat: add update-frequency bucketing and pattern-aware completeness check

Continuous objects get their expected cadence from the median delta and
are flagged 'gaps' when an interior gap or the current silence exceeds
5x that median. On-change objects have no fixed cadence, so their own
historical max gap (with a 24h floor) is the yardstick instead — only
silence well beyond that is flagged 'stale', so a window contact that's
been closed for weeks is correctly reported as complete, not lacking data.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
```

---

## Task 3: `lib/dataQualityClassifier.js` — Orchestrierung mit eskalierendem Lookback

**Files:**
- Modify: `lib/dataQualityClassifier.js`
- Test: `test/unit/dataQualityClassifier.test.js`

**Interfaces:**
- Consumes: `getHistory(adapter, historyInstance, sourceId, start, end, aggregate) => Promise<Array<{ts, val}>>` aus `lib/dataAccess.js`; alle Funktionen aus Task 1/2 (selbes Modul).
- Produces: `classifyDataQuality(adapter, obj, historyInstance) => Promise<{writable, writePattern, updateFrequency, dataCompleteness}>`. Wird von Task 4 (`onboarding.js`) und Task 5 (`main.js` Backfill) konsumiert.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

In `test/unit/dataQualityClassifier.test.js`, Imports ergänzen:

```js
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadClassifierWithStubs({ getHistory }) {
    return proxyquire('../../lib/dataQualityClassifier', {
        './dataAccess': { getHistory },
    });
}
```

Neuer `describe`-Block am Dateiende:

```js
describe('classifyDataQuality', () => {
    const obj = { id: 'shelly.0.power', common: { write: false } };

    it('confirms continuous from the first (24h) sample window and returns writable from metadata', async () => {
        const now = Date.now();
        const points = [
            { ts: now - 40000, val: 5 }, { ts: now - 30000, val: 5 }, { ts: now - 20000, val: 5 },
            { ts: now - 10000, val: 5 }, { ts: now, val: 5 },
        ];
        const getHistory = sinon.stub().resolves(points);
        const { classifyDataQuality } = loadClassifierWithStubs({ getHistory });

        const result = await classifyDataQuality({}, { id: 'shelly.0.power', common: { write: true } }, 'influxdb.0');

        expect(result.writable).to.equal(true);
        expect(result.writePattern).to.equal('continuous');
        expect(result.updateFrequency).to.equal('seconds');
        expect(result.dataCompleteness).to.equal('complete');
        expect(getHistory.calledOnce).to.equal(true);
        expect(getHistory.firstCall.args[5]).to.equal('none');
    });

    it('escalates to a 3-day window when the 24h sample is inconclusive', async () => {
        const now = Date.now();
        const tooFew24h = [{ ts: now - 1000, val: 1 }];
        const conclusive3d = Array.from({ length: 6 }, (unused, i) => ({ ts: now - i * 3600 * 1000, val: i }));
        const getHistory = sinon.stub();
        getHistory.onFirstCall().resolves(tooFew24h);
        getHistory.onSecondCall().resolves(conclusive3d);
        const { classifyDataQuality } = loadClassifierWithStubs({ getHistory });

        const result = await classifyDataQuality({}, obj, 'influxdb.0');

        expect(result.writePattern).to.not.equal('unknown');
        expect(getHistory.calledTwice).to.equal(true);
    });

    it('falls back to unknown for everything but writable after exhausting all escalation steps', async () => {
        const getHistory = sinon.stub().resolves([{ ts: 1, val: 1 }]);
        const { classifyDataQuality } = loadClassifierWithStubs({ getHistory });

        const result = await classifyDataQuality({}, obj, 'influxdb.0');

        expect(result).to.deep.equal({
            writable: false,
            writePattern: 'unknown',
            updateFrequency: 'unknown',
            dataCompleteness: 'unknown',
        });
        expect(getHistory.callCount).to.equal(3);
    });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/dataQualityClassifier.test.js`
Expected: FAIL — `classifyDataQuality is not a function`

- [ ] **Step 3: Implementierung**

In `lib/dataQualityClassifier.js`, `require` nach `'use strict';` ergänzen:

```js
const { getHistory } = require('./dataAccess');

const LOOKBACK_STEPS_MS = [DAY_MS, 3 * DAY_MS, 7 * DAY_MS];
```

(Hinweis: `DAY_MS` ist bereits aus Task 2 vorhanden — diese Konstante direkt darunter ergänzen, nicht duplizieren.)

Neue Funktion am Dateiende, vor `module.exports`:

```js
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
```

`module.exports` erweitern:

```js
module.exports = {
    computeWritable,
    computeDeltas,
    detectWritePattern,
    median,
    bucketUpdateFrequency,
    detectDataCompleteness,
    classifyDataQuality,
};
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/dataQualityClassifier.test.js`
Expected: PASS (alle Tests in der Datei)

- [ ] **Step 5: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/dataQualityClassifier.js test/unit/dataQualityClassifier.test.js
git commit -m "$(cat <<'EOF'
feat: add classifyDataQuality orchestration with escalating lookback

Ties writable (instant, from metadata) and the sampled fields
(writePattern/updateFrequency/dataCompleteness) together: escalates
through 24h/3d/7d history lookback windows until a write pattern is
confirmed, falling back to 'unknown' for the sampled fields if all
windows stay inconclusive. Pure history reads only, no LLM call, no
dailyTokenBudget impact.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
```

---

## Task 4: `lib/onboarding.js` — Datenqualität für neu entdeckte Objekte

**Files:**
- Modify: `lib/onboarding.js`
- Test: `test/unit/onboarding.test.js`

**Interfaces:**
- Consumes: `classifyDataQuality(adapter, obj, historyInstance)` aus `lib/dataQualityClassifier.js` (Task 3).
- Produces: Katalogeinträge aus `runOnboarding` haben ab jetzt zusätzlich `writable`/`writePattern`/`updateFrequency`/`dataCompleteness`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `test/unit/onboarding.test.js`, `loadOnboardingWithStubs` um einen `classifyDataQuality`-Stub erweitern:

```js
function loadOnboardingWithStubs({ getAllCatalogEntries, setCatalogEntry, recordUsage, isBudgetExceeded, classifyValueKind, classifyDataQuality }) {
    return proxyquire('../../lib/onboarding', {
        './catalog': {
            getAllCatalogEntries,
            setCatalogEntry,
            CATEGORIES: ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'],
        },
        './usage': {
            recordUsage: recordUsage || sinon.stub().resolves(),
            isBudgetExceeded: isBudgetExceeded || sinon.stub().resolves(false),
        },
        './valueKindClassifier': {
            classifyValueKind:
                classifyValueKind ||
                sinon.stub().resolves({ valueKind: 'gauge', valueKindConfidence: 'low', valueKindSource: 'metadata' }),
        },
        './dataQualityClassifier': {
            classifyDataQuality:
                classifyDataQuality ||
                sinon.stub().resolves({ writable: false, writePattern: 'unknown', updateFrequency: 'unknown', dataCompleteness: 'unknown' }),
        },
    });
}
```

Neuer Test in der `describe('runOnboarding', ...)`-Suite (nach dem bestehenden `valueKind`-Backfill-Test):

```js
    it('attaches data-quality classification to newly classified entries', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyDataQuality = sinon
            .stub()
            .resolves({ writable: true, writePattern: 'continuous', updateFrequency: 'seconds', dataCompleteness: 'complete' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyDataQuality,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            writable: true,
            writePattern: 'continuous',
            updateFrequency: 'seconds',
            dataCompleteness: 'complete',
        });
        expect(classifyDataQuality.calledOnceWith(sinon.match.any, discovered[0], 'influxdb.0')).to.equal(true);
    });

    it('falls back to safe unknown data-quality values when classifyDataQuality throws, without aborting the batch', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyDataQuality = sinon.stub().rejects(new Error('History-Instanz nicht erreichbar'));
        const adapter = { log: { warn: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyDataQuality,
        });

        await runOnboarding(adapter, provider, discovered);

        expect(setCatalogEntry.calledOnce).to.equal(true);
        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            writable: false,
            writePattern: 'unknown',
            updateFrequency: 'unknown',
            dataCompleteness: 'unknown',
        });
        expect(adapter.log.warn.called).to.equal(true);
    });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: FAIL — `entry.writePattern` ist `undefined`

- [ ] **Step 3: Implementierung**

In `lib/onboarding.js`, `require` ergänzen (nach der bestehenden `classifyValueKind`-Zeile):

```js
const { classifyDataQuality } = require('./dataQualityClassifier');
```

Im inneren Schleifenkörper von `runOnboarding`, direkt nach dem bestehenden `valueKindResult`-try/catch-Block (vor dem Bau von `entry`), einen analogen Block ergänzen:

```js
            let dataQualityResult;
            try {
                dataQualityResult = await classifyDataQuality(adapter, source, source.historyInstance);
            } catch (error) {
                if (adapter.log && adapter.log.warn) {
                    adapter.log.warn(`Datenqualitaets-Klassifizierung fuer ${source.id} fehlgeschlagen, verwende Fallback: ${error.message}`);
                }
                dataQualityResult = { writable: false, writePattern: 'unknown', updateFrequency: 'unknown', dataCompleteness: 'unknown' };
            }
```

Im `entry`-Objekt-Literal den Spread um `...dataQualityResult` neben dem bestehenden `...valueKindResult` ergänzen:

```js
                ...valueKindResult,
                ...dataQualityResult,
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS (alle Tests in der Datei)

- [ ] **Step 5: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "$(cat <<'EOF'
feat: classify data quality for newly onboarded catalog entries

runOnboarding now calls classifyDataQuality (lib/dataQualityClassifier.js)
for each newly classified object, in the same batch as the existing
description/category and valueKind classification, and merges the
result into the catalog entry. A per-object failure falls back to safe
'unknown' values and logs a warning instead of aborting the batch.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
```

---

## Task 5: `admin/jsonConfig.json` + `main.js` — Backfill für Bestandsobjekte

**Files:**
- Modify: `admin/jsonConfig.json`
- Modify: `main.js`

**Interfaces:**
- Consumes: `classifyDataQuality(adapter, obj, historyInstance)` aus `lib/dataQualityClassifier.js` (Task 3).
- Produces: neue Adapter-Methode `backfillDataQuality(entries)`, aufgerufen aus `syncCatalog()` wenn `this.config.enableDataQualityBackfill` gesetzt ist.

Kein automatisierter Test (siehe Global Constraints — reine Verdrahtung, analog `backfillValueKinds`).

- [ ] **Step 1: Admin-Konfiguration ergänzen**

In `admin/jsonConfig.json`, direkt nach dem bestehenden `enableValueKindBackfill`-Block (vor der schließenden `}` der `items`) ein Komma nach dem bestehenden Block ergänzen und den neuen Block einfügen:

```json
        "enableValueKindBackfill": {
          "type": "checkbox",
          "label": "Bestehende Datenpunkte nachtraeglich auf Auspraegung (valueKind) pruefen",
          "default": false,
          "xs": 12,
          "sm": 12,
          "md": 6,
          "lg": 4,
          "xl": 4
        },
        "enableDataQualityBackfill": {
          "type": "checkbox",
          "label": "Bestehende Datenpunkte nachtraeglich auf Schreibbarkeit/Update-Frequenz/Vollstaendigkeit pruefen",
          "default": false,
          "xs": 12,
          "sm": 12,
          "md": 6,
          "lg": 4,
          "xl": 4
        }
```

- [ ] **Step 2: `main.js` — Konstante, `require` und Backfill-Methode**

`require`-Block am Dateianfang ergänzen (nach der bestehenden `classifyValueKind`-Zeile):

```js
const { classifyDataQuality } = require('./lib/dataQualityClassifier');
```

Konstante nach `VALUE_KIND_BACKFILL_BATCH_SIZE` ergänzen:

```js
const DATA_QUALITY_BACKFILL_BATCH_SIZE = 20;
```

Neue Methode direkt nach `backfillValueKinds(entries)` einfügen (gleiche Struktur, andere Filterbedingung — siehe Spec Abschnitt 3: auch `unknown`-Einträge werden erneut versucht, da reine History-Reads ohne Kostenrisiko):

```js
    async backfillDataQuality(entries) {
        const pending = entries
            .filter((entry) => entry.active !== false && !entry.ignored && (!entry.writePattern || entry.writePattern === 'unknown'))
            .slice(0, DATA_QUALITY_BACKFILL_BATCH_SIZE);

        for (let index = 0; index < pending.length; index++) {
            const entry = pending[index];
            try {
                const sourceObj = await this.getForeignObjectAsync(entry.sourceId);
                const obj = { id: entry.sourceId, common: (sourceObj && sourceObj.common) || {} };
                const result = await classifyDataQuality(this, obj, entry.historyInstance);
                await setCatalogEntry(this, { ...entry, ...result });
                if (this.log && this.log.silly) {
                    this.log.silly(`Datenqualitaets-Backfill: ${entry.sourceId} -> ${result.writePattern}/${result.updateFrequency}/${result.dataCompleteness}`);
                }
            } catch (error) {
                if (this.log) {
                    this.log.error(`Datenqualitaets-Backfill fuer ${entry.sourceId} fehlgeschlagen: ${error.message}`);
                }
            }

            await this.updateCatalogSyncState({
                phase: 'backfill',
                processed: index + 1,
                total: pending.length,
                currentSourceId: entry.sourceId,
            });
        }

        return { backfilledCount: pending.length };
    }
```

- [ ] **Step 3: Einhängung in `syncCatalog()`**

Direkt nach dem bestehenden `enableValueKindBackfill`-Block in `syncCatalog()` (nach `await this.backfillValueKinds(currentEntries);` und dessen schließender `}`), einen analogen Block ergänzen:

```js
            if (this.config.enableDataQualityBackfill) {
                const currentEntriesForDataQuality = await getAllCatalogEntries(this);
                await this.updateCatalogSyncState({
                    phase: 'backfill',
                    processed: 0,
                    total: currentEntriesForDataQuality.length,
                    currentSourceId: null,
                    message: `Pruefe Datenqualitaet fuer ${currentEntriesForDataQuality.length} bestehende Datenpunkte...`,
                });
                await this.backfillDataQuality(currentEntriesForDataQuality);
            }
```

**Warum ein zweiter `getAllCatalogEntries`-Aufruf statt Wiederverwendung von `currentEntries`:** der `valueKind`-Backfill kann direkt davor Katalogeinträge geändert haben (neue `valueKind`-Felder) — ein frischer Fetch stellt sicher, dass der Datenqualitäts-Backfill auf dem aktuellen Stand arbeitet, statt eine veraltete lokale Kopie zurückzuschreiben und dabei die `valueKind`-Änderungen zu überschreiben.

- [ ] **Step 4: Volle Testsuite + Admin-Build + Commit**

```bash
npm test
npm run build:admin
git add admin/jsonConfig.json main.js
git commit -m "$(cat <<'EOF'
feat: add optional data-quality backfill for existing catalog entries

Mirrors the existing valueKind backfill: a new admin checkbox
(default off) triggers classifyDataQuality for existing entries
missing (or still 'unknown') writePattern, batched and run right
after the valueKind backfill inside syncCatalog(). Unlike valueKind,
'unknown' entries are retried on every run since these are cheap
history reads with no cost risk, and a too-young object may have
enough samples by the next run.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
```

---

## Task 6: `lib/tools.js` + System-Prompts — Sichtbarkeit für den Agenten

**Files:**
- Modify: `lib/tools.js`
- Modify: `main.js`
- Test: `test/unit/tools.test.js`

**Interfaces:**
- Consumes: nichts Neues (die Felder liegen bereits im Katalogeintrag, siehe Task 4/5).
- Produces: `getPeriodTotal`/`comparePeriods`-Ergebnisse enthalten zusätzlich `writePattern`, `updateFrequency`, `dataCompleteness` (mit `'unknown'`-Fallback, analog zu `valueKind`/`valueKindUnknown`).

- [ ] **Step 1: Fehlschlagende Tests schreiben**

In `test/unit/tools.test.js`, in der `describe('buildTools', ...)`-Suite nach dem bestehenden Test `'uses the maximum value for a daily reset counter'` ergänzen:

```js
    it('includes data-quality fields in getPeriodTotal results, with unknown fallback', async () => {
        const getHistory = sinon.stub().resolves([{ ts: 1, val: 5 }, { ts: 2, val: 12 }]);
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([{
                sourceId: 'meter.0.daily',
                historyInstance: 'influxdb.0',
                valueKind: 'daily_reset_counter',
                writePattern: 'continuous',
                updateFrequency: 'minutes',
                dataCompleteness: 'complete',
            }]),
            getHistory,
        });
        const result = await buildTools({}).execute('getPeriodTotal', { sourceId: 'meter.0.daily', periods: [{ start: 0, end: 10 }] });
        expect(result).to.deep.include({ writePattern: 'continuous', updateFrequency: 'minutes', dataCompleteness: 'complete' });
    });

    it('falls back to unknown data-quality fields in comparePeriods when the entry has none', async () => {
        const getHistory = sinon.stub();
        getHistory.onFirstCall().resolves([{ ts: 1, val: 40 }]);
        getHistory.onSecondCall().resolves([{ ts: 1, val: 50 }]);
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'meter.0.daily', historyInstance: 'history.0', valueKind: 'daily_reset_counter' }]),
            getHistory,
        });
        const result = await buildTools({}).execute('comparePeriods', {
            sourceId: 'meter.0.daily',
            periods: [{ start: 0, end: 10 }, { start: 10, end: 20 }],
        });
        expect(result).to.deep.include({ writePattern: 'unknown', updateFrequency: 'unknown', dataCompleteness: 'unknown' });
    });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/tools.test.js`
Expected: FAIL — `result.writePattern` ist `undefined`

- [ ] **Step 3: Implementierung**

In `lib/tools.js`, in der `execute`-Funktion, im `if (name === 'getPeriodTotal' || name === 'comparePeriods')`-Block: beide Rückgabe-Objekte (das `getPeriodTotal`-Return und das `comparePeriods`-Return am Ende des Blocks) um die drei Felder erweitern. Der bestehende `getPeriodTotal`-Return:

```js
            if (name === 'getPeriodTotal') {
                return {
                    description: entry.description,
                    room: entry.room,
                    unit: entry.unit,
                    valueKind: entry.valueKind || 'gauge',
                    valueKindUnknown: !entry.valueKind,
                    periods: values,
                };
            }
```

wird ersetzt durch:

```js
            if (name === 'getPeriodTotal') {
                return {
                    description: entry.description,
                    room: entry.room,
                    unit: entry.unit,
                    valueKind: entry.valueKind || 'gauge',
                    valueKindUnknown: !entry.valueKind,
                    writePattern: entry.writePattern || 'unknown',
                    updateFrequency: entry.updateFrequency || 'unknown',
                    dataCompleteness: entry.dataCompleteness || 'unknown',
                    periods: values,
                };
            }
```

Der bestehende `comparePeriods`-Return am Ende des Blocks:

```js
            return {
                description: entry.description,
                room: entry.room,
                unit: entry.unit,
                valueKind: entry.valueKind || 'gauge',
                valueKindUnknown: !entry.valueKind,
                periods,
            };
```

wird ersetzt durch:

```js
            return {
                description: entry.description,
                room: entry.room,
                unit: entry.unit,
                valueKind: entry.valueKind || 'gauge',
                valueKindUnknown: !entry.valueKind,
                writePattern: entry.writePattern || 'unknown',
                updateFrequency: entry.updateFrequency || 'unknown',
                dataCompleteness: entry.dataCompleteness || 'unknown',
                periods,
            };
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/tools.test.js`
Expected: PASS (alle Tests in der Datei — die bestehenden Tests nutzen `deep.include`/prüfen `result.periods`, nicht `deep.equal` auf das gesamte Ergebnisobjekt, daher stören die neuen Felder sie nicht)

- [ ] **Step 5: System-Prompts in `main.js` ergänzen**

In `main.js` gibt es zwei Vorkommen derselben Zeile:

```js
                    'Nutze in deiner Antwort IMMER die "description" aus den Werkzeug-Ergebnissen (getHistory/compareTimeframes) statt der rohen sourceId, damit die Ausgabe fuer den Nutzer lesbar ist. ' +
```

(einmal in `runProactiveCheck` um Zeile 385, einmal in `processChatQuestion` um Zeile 442 — bei der zweiten Stelle mit abweichender Einrückung `                 'Nutze ...`). Nach **beiden** Vorkommen jeweils die folgende Zeile einfügen:

```js
                    'Falls getPeriodTotal/comparePeriods ein Objekt mit dataCompleteness "gaps" oder "stale" liefern, benenne diese Unsicherheit in deiner Antwort statt sie zu verschweigen. ' +
```

(Einrückung an die jeweilige Umgebung anpassen — 20 Leerzeichen in `runProactiveCheck`, 21 Leerzeichen in `processChatQuestion`, wie die umgebenden Zeilen.)

- [ ] **Step 6: Volle Testsuite + Commit**

```bash
npm test
git add lib/tools.js main.js test/unit/tools.test.js
git commit -m "$(cat <<'EOF'
feat: expose write pattern/update frequency/data completeness to the agent

getPeriodTotal and comparePeriods now return writePattern/updateFrequency/
dataCompleteness alongside the existing valueKind fields, falling back to
'unknown' when a catalog entry predates this feature or backfill hasn't
run yet — same pattern as valueKindUnknown. Both system prompts now
instruct the agent to name the uncertainty in its answer when
dataCompleteness is 'gaps' or 'stale' instead of silently ignoring it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
```

---

## Task 7: Geräte-Tab (`src-admin/src/Components.jsx`) — drei neue Spalten + CSV

**Files:**
- Modify: `src-admin/src/Components.jsx`

Kein automatisierter Test (siehe bestehender Präzedenzfall — DOM-Rendering von `Components.jsx` bleibt manueller Abnahmetest).

- [ ] **Step 1: Spalten-Konstanten erweitern**

Am Dateianfang, `CSV_COLUMNS` erweitern (die vier neuen Felder ans Ende, `CSV_EDITABLE_COLUMNS` bleibt unverändert, da rein berechnet):

```js
const CSV_COLUMNS = ['sourceId', 'description', 'category', 'valueKind', 'unit', 'room', 'ignored', 'active', 'needsReview', 'writable', 'writePattern', 'updateFrequency', 'dataCompleteness'];
```

`SETTINGS_COLUMNS` und `SETTINGS_BOOLEAN_COLUMNS` um den neuen Admin-Schalter aus Task 5 erweitern:

```js
const SETTINGS_COLUMNS = [
    'providerType', 'baseUrl', 'model', 'apiKey',
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'onboardingProviderType', 'onboardingBaseUrl', 'onboardingModel', 'onboardingApiKey',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'checkIntervalHours', 'dailyTokenBudget', 'silentIfNothingFound', 'enableValueKindBackfill', 'enableDataQualityBackfill',
];
```

```js
const SETTINGS_BOOLEAN_COLUMNS = new Set(['silentIfNothingFound', 'enableValueKindBackfill', 'enableDataQualityBackfill']);
```

- [ ] **Step 2: Tabellenzeile um drei read-only Zellen erweitern**

In `renderRow(entry)`, nach der bestehenden Zeile `<td>{entry.unit || ''}</td>` (vor der `room`-Zelle) drei neue Zellen einfügen:

```js
                <td>{entry.unit || ''}</td>
                <td>{entry.writable === true ? '✓' : entry.writable === false ? '–' : ''}</td>
                <td>{entry.updateFrequency || ''}</td>
                <td>{entry.dataCompleteness || ''}</td>
                <td><input defaultValue={entry.room || ''} onBlur={event => update({ room: event.target.value })} /></td>
```

- [ ] **Step 3: Tabellenkopf erweitern**

Die bestehende `<thead>`-Zeile:

```js
                        <thead><tr><th>Objekt-ID</th><th>Beschreibung</th><th>Kategorie</th><th>Verhalten</th><th>Einheit</th><th>Raum</th><th>Status</th><th>Aktionen</th></tr></thead>
```

wird ersetzt durch:

```js
                        <thead><tr><th>Objekt-ID</th><th>Beschreibung</th><th>Kategorie</th><th>Verhalten</th><th>Einheit</th><th>Schreibbar</th><th>Update-Frequenz</th><th>Vollständigkeit</th><th>Raum</th><th>Status</th><th>Aktionen</th></tr></thead>
```

- [ ] **Step 4: Admin-Build + manueller Abnahmetest**

```bash
npm run build:admin
```

Manuell prüfen (an einer echten oder lokalen Testinstanz, siehe Spec Abschnitt 8): Geräte-Tab zeigt die drei neuen Spalten für bereits klassifizierte Objekte; CSV-Export enthält `writable`/`writePattern`/`updateFrequency`/`dataCompleteness`; die neue Einstellungs-Checkbox "Bestehende Datenpunkte nachtraeglich auf Schreibbarkeit/Update-Frequenz/Vollstaendigkeit pruefen" erscheint unter Einstellungen und wird korrekt in der Settings-CSV exportiert/importiert.

- [ ] **Step 5: Commit**

```bash
git add src-admin/src/Components.jsx
git commit -m "$(cat <<'EOF'
feat: show writable/update-frequency/data-completeness in the devices tab

Three new read-only columns (no dropdown/edit — these are purely
computed, unlike valueKind). CSV export/import and the settings
CSV gain the new enableDataQualityBackfill toggle alongside the
existing enableValueKindBackfill one.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
```

---

## Task 8: ADR + Architektur-/Risiko-/Changelog-Dokumentation

**Files:**
- Create: `docs/adr/0026-schreibmuster-bewusste-datenvollstaendigkeit.md`
- Modify: `docs/adr/adr-index.md`
- Modify: `docs/architecture/05-bausteinsicht.md`
- Modify: `docs/architecture/01-einfuehrung-und-ziele.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Neue ADR anlegen**

Neue Datei `docs/adr/0026-schreibmuster-bewusste-datenvollstaendigkeit.md`:

```markdown
# ADR-0026: Schreibmuster-bewusste Datenvollständigkeits-Erkennung

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-09-03

## Kontext

Katalogeinträge sollten laut Markt-Bedarfsanalyse ([01-einfuehrung-und-ziele.md §1.4](../architecture/01-einfuehrung-und-ziele.md), Punkt 15) auch Schreibbarkeit, Update-Frequenz und Datenvollständigkeit abbilden. Eine naive Lückenerkennung ("keine neuen Daten seit X Minuten = Lücke") funktioniert aber nicht für on-change-Objekte (z. B. Fensterkontakte): lange Funkstille ist dort normal, keine Lücke.

## Entscheidung

Die Klassifizierung (`lib/dataQualityClassifier.js`) erkennt zunächst das Schreibmuster eines Objekts (`continuous` vs. `on_change`) aus dem Variationskoeffizienten seiner Schreib-Zeitabstände — ein niedriger Koeffizient bedeutet festen Takt, unabhängig davon, ob sich der Wert dabei ändert. Datenvollständigkeit wird danach unterschiedlich bewertet: bei `continuous` gegen das Median-Intervall (5-facher Schwellwert), bei `on_change` gegen die größte historisch beobachtete Lücke des Objekts selbst (3-facher Schwellwert, mit 24h-Mindestschwelle). `writable` kommt direkt aus `common.write`. Alle vier Felder sind rein berechnet, kein manuelles Override, kein LLM-Aufruf.

## Konsequenzen

- Der Chat-Agent und das Geräte-Tab können zwischen "Objekt liefert gerade keine Daten" und "Objekt hat seit langem denselben Wert, das ist normal" unterscheiden.
- Bestehende Katalogeinträge ohne diese Felder werden wie `unknown` behandelt (kein Blocker); ein optionaler, standardmäßig deaktivierter Backfill klassifiziert sie nach.
- Sicherheitsklasse und Synonyme (die übrigen zwei Felder aus Punkt 15 der Analyse) bleiben spätere, eigene Teilprojekte.

## Verworfene Alternativen

- Eine einzige, musterunabhängige Lückenerkennung (fixer Zeitschwellwert) wäre bei on-change-Objekten systematisch falsch positiv.
- Eine LLM-gestützte Bewertung der Vollständigkeit wäre teurer und für ein rein statistisches Muster nicht nötig.
```

- [ ] **Step 2: ADR-Index ergänzen**

In `docs/adr/adr-index.md`, neue Zeile nach der bestehenden `0025`-Zeile:

```markdown
| [0026](0026-schreibmuster-bewusste-datenvollstaendigkeit.md) | Schreibmuster-bewusste Datenvollständigkeits-Erkennung (`writable`/`writePattern`/`updateFrequency`/`dataCompleteness`) | Angenommen | 2026-09-03 |
```

- [ ] **Step 3: Bausteinsicht ergänzen**

In `docs/architecture/05-bausteinsicht.md`, im Baum unter `lib/` (Abschnitt 5.1) nach der Zeile `valueKindClassifier.js  Klassifiziert Datenpunkt-Verhalten für typbewusste Auswertung` eine neue Zeile einfügen:

```
├── dataQualityClassifier.js Klassifiziert Schreibbarkeit/-muster/-frequenz/Vollstaendigkeit
```

In der Tabelle (Abschnitt 5.2), neue Zeile nach der bestehenden `valueKindClassifier.js`-Zeile:

```markdown
| `dataQualityClassifier.js` | Erkennt Schreibmuster (`continuous`/`on_change`) aus der Regelmäßigkeit der Schreibabstände und bewertet Datenvollständigkeit dazu passend (Median-Abstand bei `continuous`, eigene historische Maximallücke bei `on_change`); `writable` kommt direkt aus `common.write` | `classifyDataQuality(adapter,obj,historyInstance)`, `computeWritable`, `detectWritePattern`, `bucketUpdateFrequency`, `detectDataCompleteness` |
```

Den zusammenfassenden Satz am Dateiende (`bei der aktuellen Größe (16 Module...)`) auf die neue Modulzahl anpassen: `16 Module` → `17 Module`.

- [ ] **Step 4: Markt-Analyse-Dokument aktualisieren**

In `docs/architecture/01-einfuehrung-und-ziele.md`, Punkt 15 der "Abgeleiteten Funktionslücken" (Priorität 3) um einen Hinweis auf den Umsetzungsstand ergänzen. Die bestehende Zeile:

```markdown
15. **Semantische Datenqualität:** Katalogeinträge sollten neben Kategorie, Raum, Einheit und Wertart auch Schreibbarkeit, Sicherheitsklasse, Aktualisierungsfrequenz, Synonyme und Datenvollständigkeit abbilden. Das ist die Grundlage für zuverlässige Antworten, MCP-Integrationen und spätere Automationsvorschläge.
```

wird ersetzt durch:

```markdown
15. **Semantische Datenqualität:** Katalogeinträge sollten neben Kategorie, Raum, Einheit und Wertart auch Schreibbarkeit, Sicherheitsklasse, Aktualisierungsfrequenz, Synonyme und Datenvollständigkeit abbilden. Das ist die Grundlage für zuverlässige Antworten, MCP-Integrationen und spätere Automationsvorschläge. *Teilweise umgesetzt (2026-09-03): Schreibbarkeit, Aktualisierungsfrequenz und Datenvollständigkeit sind seit [ADR-0026](../adr/0026-schreibmuster-bewusste-datenvollstaendigkeit.md) automatisch berechnete Katalogfelder. Sicherheitsklasse und Synonyme bleiben offen.*
```

- [ ] **Step 5: CHANGELOG ergänzen**

In `CHANGELOG.md`, neuer Abschnitt ganz oben (vor `## [0.0.1-beta.18]`), Version entsprechend der in Task 9 gewählten neuen Versionsnummer:

```markdown
## [0.0.1-beta.19] - 2026-09-03

### Hinzugefügt
- Katalogeinträge bekommen automatisch berechnete Datenqualitäts-Felder: Schreibbarkeit, Schreibmuster (kontinuierlich/ereignisgetrieben), Update-Frequenz und Datenvollständigkeit — mit schreibmuster-bewusster Lückenerkennung, damit on-change-Objekte nicht fälschlich als lückenhaft gelten.
- Geräte-Tab zeigt die neuen Felder als zusätzliche Spalten; optionaler Backfill für Bestandsobjekte.
- Chat-Agent benennt in seinen Antworten, wenn die zugrundeliegenden Daten lückenhaft oder veraltet sind.
```

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0026-schreibmuster-bewusste-datenvollstaendigkeit.md docs/adr/adr-index.md docs/architecture/05-bausteinsicht.md docs/architecture/01-einfuehrung-und-ziele.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: record ADR-0026 and update architecture docs for data-quality fields

Documents the write-pattern-aware completeness decision, adds
lib/dataQualityClassifier.js to the building-block view, and marks
market-analysis item 15 as partially addressed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
```

---

## Task 9: Verifikation, Version, Merge, Release

**Files:**
- Modify: `io-package.json` (Version)
- Modify: `WORKLOG.md`

- [ ] **Step 1: Volle Verifikation**

```bash
git status
git diff master --stat
git log --oneline master..HEAD
npm test
npm run build:admin
```

Alle Tests grün, kein unerwarteter Diff. Bei Fehlern: beheben, erneut committen, bevor weitergemacht wird.

- [ ] **Step 2: Version anheben**

Beide Versionsfelder von `0.0.1-beta.18` auf `0.0.1-beta.19` anheben: `common.version` in `io-package.json:4` und `version` in `package.json:3`.

- [ ] **Step 3: WORKLOG auf DONE setzen**

In `WORKLOG.md`: den WIP-Eintrag für dieses Feature nach `DONE` verschieben (kurze Zusammenfassung: neues `dataQualityClassifier.js`-Modul, Onboarding-/Backfill-Einhängung, Agenten-Sichtbarkeit, Geräte-Tab-Spalten, ADR-0026, Release `0.0.1-beta.19`), `WIP` auf den nächsten offenen Punkt oder leer setzen.

- [ ] **Step 4: Commit, Push, Merge nach master**

```bash
git add io-package.json WORKLOG.md
git commit -m "$(cat <<'EOF'
chore: bump version to 0.0.1-beta.19

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S2qMf6tQzqvVatbqSrm383
EOF
)"
git push -u origin feature/katalog-datenqualitaet
git checkout master
git pull
git merge --no-ff feature/katalog-datenqualitaet -m "Merge feature: catalog data-quality fields (writable, write pattern, completeness)"
git push origin master
git branch -d feature/katalog-datenqualitaet
git push origin --delete feature/katalog-datenqualitaet
```

- [ ] **Step 5: Release-Tag erstellen und veröffentlichen**

```bash
git tag -a v0.0.1-beta.19 -m "v0.0.1-beta.19: catalog data-quality fields"
git push origin v0.0.1-beta.19
gh release create v0.0.1-beta.19 --title "v0.0.1-beta.19" --notes-from-tag
```

Falls ein GitHub-Actions-Workflow an Tags hängt: nach dem Push den Lauf prüfen (`gh run list --branch master --limit 5` bzw. `gh run watch`), Fehler vor Abschluss beheben.

- [ ] **Step 6: Abschluss prüfen**

```bash
gh run list --limit 5
gh release view v0.0.1-beta.19
```

CI grün, Release-Assets vorhanden. Damit ist der Task abgeschlossen.
