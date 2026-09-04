# Hybride Anomalieerkennung Phase 2 — Implementierungsplan

Spec: `docs/specs/2026-09-04-hybride-anomalieerkennung-phase2.md`

Umgesetzt inline in der laufenden Session (voller Kontext bereits vorhanden,
kein Subagent-Handoff). Dieses Dokument hält die Aufgabenzerlegung fest;
TDD pro Schritt.

## Task 1: `lib/periodValue.js` extrahieren

**Dateien:**
- Neu: `lib/periodValue.js`
- Ändern: `lib/tools.js` (lokale `resolvePeriod`/`computePeriodValue`
  entfernen, aus `./periodValue` importieren, Aufrufstelle
  `computePeriodValue(entry, period)` → `computePeriodValue(adapter, entry, period)`)
- Test: `test/unit/periodValue.test.js` (neu, portiert die relevanten
  Kind-Fälle aus den bestehenden `getPeriodTotal`/`comparePeriods`-Tests in
  `test/unit/tools.test.js`, sofern dort auf reines `computePeriodValue`-
  Verhalten prüfbar)

Reiner Verschieben-Refactor. `resolvePeriod` bekommt einen optionalen
`now`-Parameter (Default `Date.now()`), damit Phase 2 sie mit einem festen
`now` testen kann; Verhalten bei Aufruf ohne dritten Parameter bleibt
identisch zu vorher.

```js
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
```

- [ ] Datei `lib/periodValue.js` mit obigem Inhalt anlegen.
- [ ] In `lib/tools.js`: `resolvePeriod`/`computePeriodValue`-Definitionen
      entfernen, stattdessen `const { resolvePeriod, computePeriodValue } = require('./periodValue');`
      ergänzen; Aufrufstelle `values.push({ start: period.start, end: period.end, ...(await computePeriodValue(entry, period)) })`
      zu `...(await computePeriodValue(adapter, entry, period))` ändern.
- [ ] `npx mocha test/unit/tools.test.js` ausführen — muss unverändert grün
      bleiben (Verhaltensvertrag von `getPeriodTotal`/`comparePeriods` ist
      unangetastet).
- [ ] `npx mocha test/unit/**/*.test.js` komplett ausführen — muss grün
      bleiben.

## Task 2: `detectDailyAggregateAnomaly` in `lib/anomalyDetector.js`

**Dateien:**
- Ändern: `lib/anomalyDetector.js`
- Test: `test/unit/anomalyDetector.test.js` (erweitern)

**Interfaces:**
- Produziert: `detectDailyAggregateAnomaly({ currentValue, baselineValues, dataCompleteness }) => null | { reason, baselineMedian, currentValue, robustZ, relativeChange, currentCount, baselineCount, dataCompleteness }`
  (`currentCount` ist 0 oder 1, je nachdem ob `currentValue` eine endliche
  Zahl ist)

Extrahiert die robuste Kernformel aus `detectSeriesAnomaly` in eine private
Hilfsfunktion `robustDeviation(currentMedian, baselineValues)`, die beide
Funktionen nutzen. `detectSeriesAnomaly` bleibt in ihrem öffentlichen
Vertrag unverändert (bestehende Tests unangetastet).

- [ ] **Schritt 1: Roten Test für `detectDailyAggregateAnomaly` schreiben**

In `test/unit/anomalyDetector.test.js`, neuer `describe`-Block nach dem
bestehenden `detectSeriesAnomaly`-Block:

```js
const { detectDailyAggregateAnomaly } = require('../../lib/anomalyDetector');

describe('detectDailyAggregateAnomaly', () => {
    it('does not flag a current value within the baseline spread', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: 10,
            baselineValues: [9, 10, 11, 10, 9, 10, 11],
            dataCompleteness: 'complete',
        });

        expect(result).to.equal(null);
    });

    it('flags a robust outlier against the daily baseline', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: 40,
            baselineValues: [9, 10, 11, 10, 9, 10, 11],
            dataCompleteness: 'complete',
        });

        expect(result).to.include({ reason: 'deviation', baselineMedian: 10, currentValue: 40 });
        expect(result.robustZ).to.be.at.least(3.5);
    });

    it('flags a missing current value as missing_data, not a deviation', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: null,
            baselineValues: [9, 10, 11, 10, 9, 10, 11],
            dataCompleteness: 'complete',
        });

        expect(result).to.include({ reason: 'missing_data' });
        expect(result.currentCount).to.equal(0);
    });

    it('flags stale data as missing_data even with a numeric current value', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: 10,
            baselineValues: [9, 10, 11, 10, 9, 10, 11],
            dataCompleteness: 'stale',
        });

        expect(result).to.include({ reason: 'missing_data' });
    });

    it('returns null when the baseline has too few days', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: 40,
            baselineValues: [9, 10],
            dataCompleteness: 'complete',
        });

        expect(result).to.equal(null);
    });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/anomalyDetector.test.js`
Erwartet: FAIL, `detectDailyAggregateAnomaly is not a function` (oder
`undefined`).

- [ ] **Schritt 3: Robuste Kernformel extrahieren und
      `detectDailyAggregateAnomaly` implementieren**

In `lib/anomalyDetector.js`, die bestehende Berechnung ab
`const baselineMedian = median(baseline);` innerhalb von
`detectSeriesAnomaly` in eine private Funktion auslagern:

```js
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
```

`detectSeriesAnomaly` nutzt danach `robustDeviation(currentMedian, baseline)`
statt der Inline-Rechnung (Ergebnis identisch, Tests bleiben grün ohne
Änderung an ihnen).

Neue Funktion:

```js
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
```

Export ergänzen: `module.exports = { ..., detectDailyAggregateAnomaly };`

- [ ] **Schritt 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/anomalyDetector.test.js`
Erwartet: PASS, alle bestehenden und neuen Tests grün.

- [ ] **Schritt 5: Committen** (erst am Ende der gesamten Aufgabe, siehe
      Task 5 — kein Zwischen-Commit pro Task nötig, da alles in einer Sitzung
      läuft).

## Task 3: `findAnomalyCandidates` um Zähler/Boolean erweitern

**Dateien:**
- Ändern: `lib/anomalyDetector.js`
- Test: `test/unit/anomalyDetector.test.js` (erweitern)

**Interfaces:**
- Konsumiert: `computePeriodValue(adapter, entry, period)`,
  `resolvePeriod({ dayOffset }, now)` aus `./periodValue`;
  `detectDailyAggregateAnomaly` aus Task 2
- Produziert: `findAnomalyCandidates` liefert weiterhin ein Array; Kandidaten
  für `gauge` bekommen zusätzlich `valueKind: 'gauge'`; neue Kandidaten für
  `daily_reset_counter`/`cumulative_total`/`event_count` haben
  `{ valueKind, reason, currentTotal, baselineMedianTotal, robustZ, relativeChange, currentCount, baselineCount, dataCompleteness }`;
  für `boolean_state`
  `{ valueKind: 'boolean_state', reason, currentOnDurationMs, baselineMedianOnDurationMs, robustZ, relativeChange, currentCount, baselineCount, dataCompleteness }`

- [ ] **Schritt 1: Roten Test schreiben**

```js
describe('findAnomalyCandidates — Zähler und Boolean-Zustände', () => {
    it('flags a daily_reset_counter with an outlying day total', async () => {
        const now = 30 * 24 * 3600 * 1000; // beliebiger fixer Zeitpunkt
        const computePeriodValue = sinon.stub();
        // 7 Baseline-Tage (dayOffset -8..-2), dann aktueller Tag (dayOffset -1)
        for (let i = 0; i < 7; i++) computePeriodValue.onCall(i).resolves({ total: 10 });
        computePeriodValue.onCall(7).resolves({ total: 40 });
        const { findAnomalyCandidates } = proxyquire('../../lib/anomalyDetector', {
            './periodValue': {
                computePeriodValue,
                resolvePeriod: (period, nowArg) => ({ start: nowArg + period.dayOffset * 86400000, end: nowArg + (period.dayOffset + 1) * 86400000 }),
            },
        });
        const entry = {
            sourceId: 'counter.0.total',
            historyInstance: 'history.0',
            description: 'Wasserzaehler',
            valueKind: 'daily_reset_counter',
            dataCompleteness: 'complete',
        };

        const result = await findAnomalyCandidates({}, [entry], now);

        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.include({ sourceId: 'counter.0.total', valueKind: 'daily_reset_counter', reason: 'deviation', currentTotal: 40, baselineMedianTotal: 10 });
        expect(computePeriodValue.callCount).to.equal(8);
    });

    it('flags a boolean_state with an outlying on-duration', async () => {
        const now = 30 * 24 * 3600 * 1000;
        const computePeriodValue = sinon.stub();
        for (let i = 0; i < 7; i++) computePeriodValue.onCall(i).resolves({ onDurationMs: 3600000, switchCount: 4 });
        computePeriodValue.onCall(7).resolves({ onDurationMs: 20 * 3600000, switchCount: 2 });
        const { findAnomalyCandidates } = proxyquire('../../lib/anomalyDetector', {
            './periodValue': {
                computePeriodValue,
                resolvePeriod: (period, nowArg) => ({ start: nowArg + period.dayOffset * 86400000, end: nowArg + (period.dayOffset + 1) * 86400000 }),
            },
        });
        const entry = {
            sourceId: 'switch.0.pump',
            historyInstance: 'history.0',
            description: 'Pumpe',
            valueKind: 'boolean_state',
            dataCompleteness: 'complete',
        };

        const result = await findAnomalyCandidates({}, [entry], now);

        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.include({ sourceId: 'switch.0.pump', valueKind: 'boolean_state', reason: 'deviation', currentOnDurationMs: 20 * 3600000 });
    });

    it('does not treat gauge entries differently after the valueKind field is added', async () => {
        const getHistory = sinon.stub();
        getHistory.onFirstCall().resolves([{ val: 100 }, { val: 100 }, { val: 100 }]);
        getHistory.onSecondCall().resolves([{ val: 100 }, { val: 100 }, { val: 100 }]);
        const { findAnomalyCandidates } = proxyquire('../../lib/anomalyDetector', { './dataAccess': { getHistory } });
        const entry = { sourceId: 'sensor.0.power', historyInstance: 'history.0', valueKind: 'gauge', dataCompleteness: 'complete' };

        const result = await findAnomalyCandidates({}, [entry], 8 * 24 * 3600 * 1000);

        expect(result).to.have.lengthOf(0);
    });
});
```

Ergänzend: bestehender Test `'samples current and baseline windows and
returns only anomalous entries'` bekommt eine zusätzliche Assertion
`expect(result[0].valueKind).to.equal('gauge');` — Erweiterung eines
bestehenden Tests, kein neuer.

**Achtung, bestehender Test kippt bewusst:** Der `isEligibleCatalogEntry`-Test
`'only accepts active, non-ignored gauge entries'` enthält aktuell
`expect(isEligibleCatalogEntry({ active: true, valueKind: 'daily_reset_counter' })).to.equal(false);`
— das ist mit Phase 2 falsch, `daily_reset_counter` wird jetzt eligible. Diese
Zeile ersetzen durch:

```js
expect(isEligibleCatalogEntry({ active: true, valueKind: 'daily_reset_counter' })).to.equal(true);
expect(isEligibleCatalogEntry({ active: true, valueKind: 'cumulative_total' })).to.equal(true);
expect(isEligibleCatalogEntry({ active: true, valueKind: 'event_count' })).to.equal(true);
expect(isEligibleCatalogEntry({ active: true, valueKind: 'boolean_state' })).to.equal(true);
expect(isEligibleCatalogEntry({ active: true, valueKind: undefined })).to.equal(false);
expect(isEligibleCatalogEntry({ active: false, valueKind: 'boolean_state' })).to.equal(false);
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/anomalyDetector.test.js`
Erwartet: FAIL (neue Kandidaten fehlen / `valueKind` fehlt).

- [ ] **Schritt 3: Implementieren**

In `lib/anomalyDetector.js`:

```js
const { computePeriodValue, resolvePeriod } = require('./periodValue');

const DAILY_KINDS = new Set(['daily_reset_counter', 'cumulative_total', 'event_count', 'boolean_state']);
const BASELINE_DAY_OFFSETS = [-8, -7, -6, -5, -4, -3, -2];
const CURRENT_DAY_OFFSET = -1;

function isEligibleCatalogEntry(entry) {
    return Boolean(
        entry &&
        entry.active !== false &&
        !entry.ignored &&
        (entry.valueKind === 'gauge' || DAILY_KINDS.has(entry.valueKind))
    );
}

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
```

`findAnomalyCandidates` verzweigt pro Objekt:

```js
async function findAnomalyCandidates(adapter, entries, now = Date.now(), onProgress) {
    const eligible = (entries || []).filter(isEligibleCatalogEntry);
    const candidates = [];
    let failedCount = 0;

    for (let index = 0; index < eligible.length; index++) {
        const entry = eligible[index];
        await reportProgress(adapter, onProgress, { processed: index, total: eligible.length, currentSourceId: entry.sourceId, message: `Statistische Voranalyse ${index}/${eligible.length}...` });
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
        await reportProgress(adapter, onProgress, { processed: index + 1, total: eligible.length, currentSourceId: entry.sourceId, message: `Statistische Voranalyse ${index + 1}/${eligible.length}...` });
    }

    Object.defineProperty(candidates, 'failedCount', { value: failedCount, enumerable: false });
    return candidates;
}
```

Der bisherige Gauge-Inline-Code aus dem alten `findAnomalyCandidates`-Rumpf
(die beiden `getHistory`-Aufrufe + `detectSeriesAnomaly`) wandert unverändert
in eine eigene Funktion `findGaugeCandidate(adapter, entry, now)`, die
zusätzlich `valueKind: 'gauge'` ins Ergebnis mischt:

```js
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
```

Export ergänzen: `module.exports = { ..., findGaugeCandidate, findDailyCandidate };`
(für gezielte Tests; `findAnomalyCandidates` bleibt der öffentliche
Haupteinstieg).

- [ ] **Schritt 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/anomalyDetector.test.js`
Erwartet: PASS, alle Tests grün.

## Task 4: `main.js` — Prompt-Text kind-neutral formulieren

**Dateien:**
- Ändern: `main.js` (Systemprompt in `executeProactiveCheck`, siehe
  `main.js:583`)
- Test: `test/unit/main.test.js` (nur falls dort der exakte Prompt-Text
  geprüft wird — prüfen und ggf. String-Erwartung anpassen)

- [ ] Grep in `test/unit/main.test.js` nach `letzten 24 Stunden` oder Teilen
      des Systemprompts; falls ein Test den exakten String erwartet, den
      String synchron anpassen.
- [ ] In `main.js` den Satz
      `'Du pruefst katalogisierte Smart-Home-Objekte auf Auffaelligkeiten (Geraetenutzung, Beleuchtung, Verbrauch, PV-Einspeisung) der letzten 24 Stunden. '`
      ersetzen durch
      `'Du pruefst katalogisierte Smart-Home-Objekte auf Auffaelligkeiten (Geraetenutzung, Beleuchtung, Verbrauch, PV-Einspeisung). Momentanwerte (gauge) beziehen sich auf die letzten 24 Stunden, Zaehler und Schalter (boolean_state) auf den letzten vollstaendigen Kalendertag. '`.
- [ ] `npx mocha test/unit/main.test.js` ausführen — grün bestätigen.

## Task 5: Dokumentation aktualisieren

**Dateien:**
- `docs/architecture/05-bausteinsicht.md`: neue Zeile für `periodValue.js`
  (nach `dataAccess.js` einfügen), `anomalyDetector.js`-Zeile aktualisieren
  (Beschreibung + Exporte um `detectDailyAggregateAnomaly` ergänzen),
  `tools.js`-Zeile: Hinweis, dass Periodenberechnung jetzt aus
  `periodValue.js` kommt, Modulzahl 19 → 20 in der Fußzeile.
- `docs/roadmap.md`: Status von Punkt 1 "Phase 1 umgesetzt" →
  "Phase 1+2 umgesetzt", Beschreibung um Zähler/Boolean ergänzen,
  Korrelationen bleiben als offener Rest.
- `docs/adr/backlog.md`: Punkt 3 (Teststrategie) und Punkt 5 (CI-Aktivierung)
  aus der vorigen Session als gelöst markieren — Nummern bleiben stehen
  (Querverweise wie ADR-0020 auf Punkt 8 sonst gebrochen), nur Titel/Text auf
  "gelöst" umgestellt.
- `WORKLOG.md`: `DONE` um diese Aufgabe ergänzen.

- [ ] Alle vier Dokumente aktualisieren.

## Abschlussverifikation

- [ ] `npm test` (Unit + Admin) grün.
- [ ] `npm run lint` grün.
- [ ] `npm run build:admin` grün (nur falls `src-admin/` betroffen ist — ist
      es hier nicht, Build kann übersprungen werden, `admin/`-Bundle bleibt
      unverändert).
- [ ] Diff review: sicherstellen, dass `detectSeriesAnomaly`s öffentlicher
      Vertrag (Signatur, Rückgabewerte für Phase-1-Fälle) unverändert ist.
