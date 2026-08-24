# Datenpunkt-Klassifizierung (`valueKind`) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder katalogisierte Datenpunkt bekommt eine erkannte `valueKind`-Ausprägung (Momentanwert / Schalter / Tageszähler mit Reset / Lebenszeit-Zähler / Summenwert), damit zwei neue Werkzeuge (`getPeriodTotal`, `comparePeriods`) die für den jeweiligen Datenpunkt-Typ korrekte Rechenoperation anwenden, statt dass die KI rohe Werte selbst (und teils falsch) verrechnet.

**Architecture:** Neues Modul `lib/valueKindClassifier.js` kapselt die zweistufige Klassifizierung (deterministisch aus Metadaten, dann Datenprobe mit eskalierendem Lookback) als reine, testbare Funktionen plus eine async Orchestrierungsfunktion, die `getHistory` aus `lib/dataAccess.js` nutzt. `lib/onboarding.js` ruft sie für neu entdeckte Objekte auf; `main.js`s `syncCatalog()` ruft sie zusätzlich für bestehende Objekte ohne `valueKind` auf (gedeckelt, nur wenn per Admin-Konfiguration aktiviert). `lib/tools.js` bekommt zwei neue, `valueKind`-bewusste Werkzeuge. `lib/promptContext.js` bekommt eine Hilfsfunktion für lokale Kalendertag-Grenzen (Zeitzone), die sowohl die Muster-Erkennung als auch die neuen Werkzeuge nutzen.

**Tech Stack:** Node.js (CommonJS, kein Build-Schritt — [ADR-0009](../adr/0009-reines-javascript-kein-typescript.md)), Mocha/Chai/Sinon/Proxyquire für Unit-Tests, `Intl`-API für Zeitzonenberechnung (keine neue Abhängigkeit).

**Spec:** [docs/specs/2026-08-24-datenpunkt-klassifizierung.md](../specs/2026-08-24-datenpunkt-klassifizierung.md)

## Global Constraints

- `npm test` (= `test:unit` + `test:adapter`) muss vor jedem Commit auf `develop` grün sein.
- Neue `lib/*`-Module bekommen eigene Unit-Tests mit gemockter Adapter-API (kein echter DB-/LLM-/Socket-Zugriff in Tests).
- Kein TypeScript, kein Build-Schritt, reines CommonJS ([ADR-0009](../adr/0009-reines-javascript-kein-typescript.md)).
- Pro Task ein eigener Branch (`feature/<name>`), von `develop` abgezweigt, TDD-Commits darauf, danach lokal per `git merge --no-ff` zurück nach `develop`, Branch löschen ([ADR-0019](../adr/0019-feature-branch-pro-task.md)).
- Kein `git push` in diesem Plan — bleibt expliziter, gesonderter Schritt außerhalb dieses Plans (Release-Vorgehen siehe `CONTRIBUTING.md`).
- `main.js` bekommt laut etabliertem Präzedenzfall (siehe Geräte-Tab-Plan) **keine** neuen Tests für reine Verdrahtung — die eigentliche Logik ist bereits in den jeweiligen `lib/*`-Modulen getestet.
- Jede neue schreibende/auslösende Aktion loggt via `adapter.log.silly`/`adapter.log.warn`/`adapter.log.error`, defensiv geprüft (`if (adapter.log && adapter.log.silly)`), konsistent zum bestehenden Muster.
- Commit-Nachrichten erklären das Warum, mit `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (bzw. zusätzlich `Claude Haiku 4.5`, falls per Subagent umgesetzt).
- Reine History-Abrufe (Datenprobe zur Mustererkennung) zählen **nicht** gegen `dailyTokenBudget` — nur ein tatsächlicher LLM-Aufruf würde das (in dieser Iteration gibt es keinen LLM-Aufruf im Klassifizierer, siehe Spec Abschnitt 2).

---

## Task 1: `lib/promptContext.js` — lokale Kalendertag-Grenzen

**Files:**
- Modify: `lib/promptContext.js`
- Test: `test/unit/promptContext.test.js`

**Interfaces:**
- Produces: `getLocalDayBoundaries(timestampMs, timeZone) => {start: number, end: number}` — Start/Ende (Unix-ms) des Kalendertags, der `timestampMs` in `timeZone` enthält. Wird von Task 4 (`valueKindClassifier.js`) und Task 9 (`tools.js`) konsumiert.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/day-boundaries
```

- [ ] **Step 2: Fehlschlagenden Test schreiben**

In `test/unit/promptContext.test.js`, Import erweitern und neuen `describe`-Block ergänzen:

```js
const { buildTimeAndLocationContext, getLocalDayBoundaries } = require('../../lib/promptContext');
```

```js
describe('getLocalDayBoundaries', () => {
    it('returns the UTC-ms boundaries of a calendar day in Europe/Berlin during DST (UTC+2)', () => {
        // 2026-08-21 12:00 UTC is 2026-08-21 14:00 in Berlin (summer time, UTC+2)
        const noonUtc = Date.UTC(2026, 7, 21, 12, 0, 0);
        const { start, end } = getLocalDayBoundaries(noonUtc, 'Europe/Berlin');

        expect(new Date(start).toISOString()).to.equal('2026-08-20T22:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-08-21T22:00:00.000Z');
    });

    it('returns the UTC-ms boundaries of a calendar day in Europe/Berlin during standard time (UTC+1)', () => {
        // 2026-01-15 12:00 UTC is 2026-01-15 13:00 in Berlin (winter time, UTC+1)
        const noonUtc = Date.UTC(2026, 0, 15, 12, 0, 0);
        const { start, end } = getLocalDayBoundaries(noonUtc, 'Europe/Berlin');

        expect(new Date(start).toISOString()).to.equal('2026-01-14T23:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-01-15T23:00:00.000Z');
    });

    it('returns the same boundaries for any two timestamps within the same local day', () => {
        const morning = Date.UTC(2026, 7, 21, 4, 0, 0);
        const evening = Date.UTC(2026, 7, 21, 20, 0, 0);

        expect(getLocalDayBoundaries(morning, 'Europe/Berlin')).to.deep.equal(
            getLocalDayBoundaries(evening, 'Europe/Berlin')
        );
    });

    it('spans 23 hours on a spring-forward (DST start) day in Europe/Berlin', () => {
        const noonOnDstStart = Date.UTC(2026, 2, 29, 12, 0, 0); // 2026-03-29
        const { start, end } = getLocalDayBoundaries(noonOnDstStart, 'Europe/Berlin');

        expect(new Date(start).toISOString()).to.equal('2026-03-28T23:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-03-29T22:00:00.000Z');
        expect(end - start).to.equal(23 * 3600 * 1000);
    });

    it('spans 25 hours on a fall-back (DST end) day in Europe/Berlin', () => {
        const noonOnDstEnd = Date.UTC(2026, 9, 25, 12, 0, 0); // 2026-10-25
        const { start, end } = getLocalDayBoundaries(noonOnDstEnd, 'Europe/Berlin');

        expect(new Date(start).toISOString()).to.equal('2026-10-24T22:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-10-25T23:00:00.000Z');
        expect(end - start).to.equal(25 * 3600 * 1000);
    });

    it('spans exactly 24 hours on a day with no DST transition (UTC has none, ever)', () => {
        const fixedNoonUtc = Date.UTC(2026, 5, 15, 12, 0, 0);
        const { start, end } = getLocalDayBoundaries(fixedNoonUtc, 'UTC');
        expect(end - start).to.equal(24 * 3600 * 1000);
    });

    it('defaults to UTC boundaries for the UTC timezone', () => {
        const noonUtc = Date.UTC(2026, 7, 21, 12, 0, 0);
        const { start, end } = getLocalDayBoundaries(noonUtc, 'UTC');

        expect(new Date(start).toISOString()).to.equal('2026-08-21T00:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-08-22T00:00:00.000Z');
    });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/promptContext.test.js`
Expected: FAIL — `getLocalDayBoundaries is not a function`

- [ ] **Step 4: Implementierung**

In `lib/promptContext.js`, nach `formatLocalTime` einfügen:

```js
/**
 * Berechnet den UTC-Zeitpunkt der lokalen Mitternacht in `timeZone` fuer den Kalendertag,
 * der `timestampMs` enthaelt. Der Offset wird AM ZIELTAG (nicht "jetzt") ermittelt, damit
 * DST-Wechsel korrekt behandelt werden.
 */
function computeUtcMidnight(timestampMs, timeZone) {
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const dateParts = dateFormatter.formatToParts(new Date(timestampMs));
    const year = Number(dateParts.find((part) => part.type === 'year').value);
    const month = Number(dateParts.find((part) => part.type === 'month').value);
    const day = Number(dateParts.find((part) => part.type === 'day').value);
    const utcMidnightGuess = Date.UTC(year, month - 1, day);

    const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
    const offsetName = offsetFormatter.formatToParts(new Date(utcMidnightGuess)).find(
        (part) => part.type === 'timeZoneName'
    ).value;
    const offsetMatch = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(offsetName);
    const offsetHours = offsetMatch ? Number(offsetMatch[1]) : 0;
    const offsetMinutesPart = offsetMatch && offsetMatch[2] ? Number(offsetMatch[2]) : 0;
    const offsetMs = (offsetHours * 60 + Math.sign(offsetHours || 1) * offsetMinutesPart) * 60 * 1000;

    return utcMidnightGuess - offsetMs;
}

/**
 * Start/Ende (Unix-ms) des Kalendertags in `timeZone`, der `timestampMs` enthaelt. `end`
 * wird als die tatsaechliche naechste lokale Mitternacht ermittelt (nicht start+24h) —
 * an DST-Umstellungstagen ist ein Tag 23 oder 25 Stunden lang, und start+24h wuerde dort
 * entweder eine Stunde des Tages ausschliessen oder mit dem Folgetag ueberlappen. `start
 * + 25h` liegt garantiert im naechsten Kalendertag, unabhaengig von der tatsaechlichen
 * Tageslaenge.
 */
function getLocalDayBoundaries(timestampMs, timeZone) {
    const start = computeUtcMidnight(timestampMs, timeZone);
    const end = computeUtcMidnight(start + 25 * 3600 * 1000, timeZone);
    return { start, end };
}
```

`module.exports` erweitern:

```js
module.exports = {
    getSystemLocation,
    getLocalTimeZone,
    formatLocalTime,
    getLocalDayBoundaries,
    buildTimeAndLocationContext,
};
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/promptContext.test.js`
Expected: PASS (alle Tests in der Datei, inkl. der bereits bestehenden für `buildTimeAndLocationContext`)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/promptContext.js test/unit/promptContext.test.js
git commit -m "$(cat <<'EOF'
feat: add getLocalDayBoundaries for timezone-aware calendar-day ranges

Needed by the upcoming value-kind pattern detection (daily-reset-counter
recognition) and the typ-aware getPeriodTotal/comparePeriods tools —
both need to know exactly where "today" starts/ends in the user's local
timezone, not UTC. Computes the UTC offset at the target date (not "now"),
so DST transitions are handled correctly.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/day-boundaries -m "Merge feature/day-boundaries into develop"
git branch -d feature/day-boundaries
```

---

## Task 2: `lib/valueKindClassifier.js` — deterministische Metadaten-Klassifizierung

**Files:**
- Create: `lib/valueKindClassifier.js`
- Create: `test/unit/valueKindClassifier.test.js`

**Interfaces:**
- Produces: `VALUE_KINDS` (Array der 5 gültigen Werte), `classifyFromMetadata(obj) => {valueKind, valueKindConfidence, valueKindSource}` — `obj` hat die Form `{id, common: {type?, role?, name?, unit?}}` (wie von `lib/discovery.js` geliefert). Wird von Task 4 (Orchestrierung) konsumiert.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/valuekind-metadata-classification
```

- [ ] **Step 2: Fehlschlagende Tests schreiben**

Neue Datei `test/unit/valueKindClassifier.test.js`:

```js
const { expect } = require('chai');
const { classifyFromMetadata, VALUE_KINDS } = require('../../lib/valueKindClassifier');

describe('VALUE_KINDS', () => {
    it('lists exactly the five defined value kinds', () => {
        expect(VALUE_KINDS).to.deep.equal([
            'gauge',
            'boolean_state',
            'daily_reset_counter',
            'cumulative_total',
            'event_count',
        ]);
    });
});

describe('classifyFromMetadata', () => {
    it('classifies boolean-typed objects as boolean_state with high confidence', () => {
        const obj = { id: 'shelly.0.relay', common: { type: 'boolean', name: 'Relais', role: 'switch' } };
        expect(classifyFromMetadata(obj)).to.deep.equal({
            valueKind: 'boolean_state',
            valueKindConfidence: 'high',
            valueKindSource: 'metadata',
        });
    });

    it('guesses daily_reset_counter for names/ids hinting at a daily value', () => {
        const obj = { id: 'sun2000.0.collected.dailyEnergyYield', common: { type: 'number', name: 'Heutiger Energieertrag' } };
        const result = classifyFromMetadata(obj);
        expect(result.valueKind).to.equal('daily_reset_counter');
        expect(result.valueKindConfidence).to.equal('low');
        expect(result.valueKindSource).to.equal('metadata');
    });

    it('guesses cumulative_total for names/roles hinting at a lifetime total', () => {
        const obj = { id: 'sun2000.0.inverter.totalYield', common: { type: 'number', name: 'Gesamtertrag', role: 'value.power.consumption' } };
        const result = classifyFromMetadata(obj);
        expect(result.valueKind).to.equal('cumulative_total');
        expect(result.valueKindConfidence).to.equal('low');
    });

    it('defaults to gauge with low confidence when nothing else matches', () => {
        const obj = { id: 'sun2000.0.meter.activePower', common: { type: 'number', name: 'Aktuelle Wirkleistung' } };
        expect(classifyFromMetadata(obj)).to.deep.equal({
            valueKind: 'gauge',
            valueKindConfidence: 'low',
            valueKindSource: 'metadata',
        });
    });

    it('is defensive against missing common/id fields', () => {
        expect(classifyFromMetadata({})).to.deep.equal({
            valueKind: 'gauge',
            valueKindConfidence: 'low',
            valueKindSource: 'metadata',
        });
    });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/valueKindClassifier.test.js`
Expected: FAIL — `Cannot find module '../../lib/valueKindClassifier'`

- [ ] **Step 4: Implementierung**

Neue Datei `lib/valueKindClassifier.js`:

```js
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
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/valueKindClassifier.test.js`
Expected: PASS (alle 7 Tests)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/valueKindClassifier.js test/unit/valueKindClassifier.test.js
git commit -m "$(cat <<'EOF'
feat: add lib/valueKindClassifier.js with deterministic metadata classification

Stage 1 of the two-stage value-kind classification (see
docs/specs/2026-08-24-datenpunkt-klassifizierung.md): classifies an
object as boolean_state (certain, from common.type) or guesses
daily_reset_counter/cumulative_total/gauge from id/name/role hints
(low confidence, pending data-sample confirmation in stage 2).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/valuekind-metadata-classification -m "Merge feature/valuekind-metadata-classification into develop"
git branch -d feature/valuekind-metadata-classification
```

---

## Task 3: `lib/valueKindClassifier.js` — Mustererkennung aus Datenproben

**Files:**
- Modify: `lib/valueKindClassifier.js`
- Test: `test/unit/valueKindClassifier.test.js`

**Interfaces:**
- Consumes: nichts Neues von anderen Tasks.
- Produces: `detectPatternFromSamples(points) => 'boolean_state' | 'gauge' | 'daily_reset_counter' | 'monotonic_no_reset' | null` — `points` ist ein Array `{ts, val}` (wie von `getHistory` geliefert), Reihenfolge nach `ts` aufsteigend erwartet. `null` = zu wenig Datenpunkte fuer eine Aussage. `'monotonic_no_reset'` = steigt durchgehend, aber im beobachteten Fenster kein Reset gesehen (die aufrufende Seite, Task 4, entscheidet anhand der Fensterlaenge, ob das schon `cumulative_total` bedeutet). Wird von Task 4 konsumiert.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/valuekind-pattern-detection
```

- [ ] **Step 2: Fehlschlagende Tests schreiben**

In `test/unit/valueKindClassifier.test.js`, Import erweitern:

```js
const { classifyFromMetadata, detectPatternFromSamples, VALUE_KINDS } = require('../../lib/valueKindClassifier');
```

Neuer `describe`-Block am Dateiende:

```js
describe('detectPatternFromSamples', () => {
    it('returns null when there are fewer than 3 valid points', () => {
        expect(detectPatternFromSamples([{ ts: 1, val: 0 }])).to.equal(null);
        expect(detectPatternFromSamples([])).to.equal(null);
    });

    it('detects boolean_state when only two distinct values (0/1) occur', () => {
        const points = [
            { ts: 1, val: 0 }, { ts: 2, val: 1 }, { ts: 3, val: 0 }, { ts: 4, val: 1 }, { ts: 5, val: 0 },
        ];
        expect(detectPatternFromSamples(points)).to.equal('boolean_state');
    });

    it('detects daily_reset_counter for a series that climbs then drops sharply (reset)', () => {
        const points = [
            { ts: 1, val: 0 }, { ts: 2, val: 5 }, { ts: 3, val: 10 }, { ts: 4, val: 20 },
            { ts: 5, val: 0.5 }, { ts: 6, val: 3 }, { ts: 7, val: 8 },
        ];
        expect(detectPatternFromSamples(points)).to.equal('daily_reset_counter');
    });

    it('returns monotonic_no_reset for a series that only ever increases', () => {
        const points = [{ ts: 1, val: 100 }, { ts: 2, val: 150 }, { ts: 3, val: 200 }, { ts: 4, val: 260 }];
        expect(detectPatternFromSamples(points)).to.equal('monotonic_no_reset');
    });

    it('detects gauge for a series that fluctuates up and down without a sharp reset', () => {
        const points = [
            { ts: 1, val: 20 }, { ts: 2, val: 18 }, { ts: 3, val: 22 }, { ts: 4, val: 19 }, { ts: 5, val: 21 },
        ];
        expect(detectPatternFromSamples(points)).to.equal('gauge');
    });

    it('ignores non-finite values when judging the pattern', () => {
        const points = [
            { ts: 1, val: 10 }, { ts: 2, val: null }, { ts: 3, val: 20 }, { ts: 4, val: undefined }, { ts: 5, val: 30 },
        ];
        expect(detectPatternFromSamples(points)).to.equal('monotonic_no_reset');
    });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/valueKindClassifier.test.js`
Expected: FAIL — `detectPatternFromSamples is not a function`

- [ ] **Step 4: Implementierung**

In `lib/valueKindClassifier.js`, `RESET_DROP_RATIO`-Konstante und die Funktion nach `classifyFromMetadata` einfügen:

```js
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
```

`module.exports` erweitern:

```js
module.exports = { VALUE_KINDS, classifyFromMetadata, detectPatternFromSamples };
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/valueKindClassifier.test.js`
Expected: PASS (alle Tests in der Datei)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/valueKindClassifier.js test/unit/valueKindClassifier.test.js
git commit -m "$(cat <<'EOF'
feat: add data-sample pattern detection to valueKindClassifier

Stage 2: given raw history points, detects boolean (only 0/1 values),
a daily-reset counter (climbs then drops sharply), a lifetime counter
candidate (climbs without ever resetting, flagged monotonic_no_reset
for the caller to confirm against the observed window length), or a
gauge (fluctuates freely). Reset detection is value-based, not tied to
midnight, so it works regardless of when exactly a counter resets.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/valuekind-pattern-detection -m "Merge feature/valuekind-pattern-detection into develop"
git branch -d feature/valuekind-pattern-detection
```

---

## Task 4: `lib/valueKindClassifier.js` — Orchestrierung mit eskalierendem Lookback

**Files:**
- Modify: `lib/valueKindClassifier.js`
- Test: `test/unit/valueKindClassifier.test.js`

**Interfaces:**
- Consumes: `getHistory(adapter, historyInstance, sourceId, start, end, aggregate) => Promise<Array<{ts, val}>>` aus `lib/dataAccess.js` (Task 1 der vorherigen Session, bereits vorhanden); `classifyFromMetadata`, `detectPatternFromSamples` (Task 2/3, selbes Modul).
- Produces: `classifyValueKind(adapter, obj, historyInstance) => Promise<{valueKind, valueKindConfidence, valueKindSource}>`. Wird von Task 5 (`onboarding.js`) und Task 6 (`main.js` Backfill) konsumiert.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/valuekind-orchestration
```

- [ ] **Step 2: Fehlschlagende Tests schreiben**

In `test/unit/valueKindClassifier.test.js`, Imports ergänzen (`proxyquire`/`sinon` hinzu, `classifyValueKind` aus dem proxied Modul statt direkt):

```js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { classifyFromMetadata, detectPatternFromSamples, VALUE_KINDS } = require('../../lib/valueKindClassifier');

function loadClassifierWithStubs({ getHistory }) {
    return proxyquire('../../lib/valueKindClassifier', {
        './dataAccess': { getHistory },
    });
}
```

Neuer `describe`-Block am Dateiende:

```js
describe('classifyValueKind', () => {
    const obj = { id: 'sun2000.0.collected.dailyEnergyYield', common: { type: 'number', name: 'Heutiger Energieertrag' } };

    it('returns the metadata result immediately for boolean_state (no history call)', async () => {
        const getHistory = sinon.stub();
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });
        const boolObj = { id: 'shelly.0.relay', common: { type: 'boolean', name: 'Relais' } };

        const result = await classifyValueKind({}, boolObj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'boolean_state', valueKindConfidence: 'high', valueKindSource: 'metadata' });
        expect(getHistory.called).to.equal(false);
    });

    it('confirms a daily_reset_counter from the first (48h) sample window', async () => {
        const resetPoints = [
            { ts: 1, val: 0 }, { ts: 2, val: 10 }, { ts: 3, val: 20 }, { ts: 4, val: 0.2 }, { ts: 5, val: 5 },
        ];
        const getHistory = sinon.stub().resolves(resetPoints);
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        const result = await classifyValueKind({}, obj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'daily_reset_counter', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        expect(getHistory.calledOnce).to.equal(true);
        expect(getHistory.firstCall.args[5]).to.equal('none');
    });

    it('escalates to a 7-day window and confirms cumulative_total once 5+ days without a reset are observed', async () => {
        const inconclusive48h = [{ ts: 1, val: 10 }, { ts: 2, val: 15 }, { ts: 3, val: 20 }];
        const monotonic7d = [{ ts: 1, val: 10 }, { ts: 2, val: 500 }, { ts: 3, val: 900 }];
        const getHistory = sinon.stub();
        getHistory.onFirstCall().resolves(inconclusive48h);
        getHistory.onSecondCall().resolves(monotonic7d);
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        const result = await classifyValueKind({}, obj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        expect(getHistory.calledTwice).to.equal(true);
    });

    it('falls back to the low-confidence metadata guess after exhausting all escalation steps', async () => {
        const tooFewPoints = [{ ts: 1, val: 1 }];
        const getHistory = sinon.stub().resolves(tooFewPoints);
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        const result = await classifyValueKind({}, obj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'daily_reset_counter', valueKindConfidence: 'low', valueKindSource: 'metadata' });
        expect(getHistory.callCount).to.equal(4);
    });

    it('confirms gauge as soon as a plain fluctuation is seen, without further escalation', async () => {
        const fluctuating = [{ ts: 1, val: 20 }, { ts: 2, val: 18 }, { ts: 3, val: 22 }, { ts: 4, val: 19 }];
        const getHistory = sinon.stub().resolves(fluctuating);
        const gaugeObj = { id: 'sun2000.0.meter.activePower', common: { type: 'number', name: 'Wirkleistung' } };
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        const result = await classifyValueKind({}, gaugeObj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'gauge', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        expect(getHistory.calledOnce).to.equal(true);
    });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/valueKindClassifier.test.js`
Expected: FAIL — `classifyValueKind is not a function`

- [ ] **Step 4: Implementierung**

In `lib/valueKindClassifier.js`, `require` am Dateianfang ergänzen (nach `'use strict';`):

```js
const { getHistory } = require('./dataAccess');

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LOOKBACK_STEPS_MS = [48 * HOUR_MS, 7 * DAY_MS, 30 * DAY_MS, 365 * DAY_MS];
const CUMULATIVE_MIN_SPAN_MS = 5 * DAY_MS;
```

Neue Funktion nach `detectPatternFromSamples` einfügen:

```js
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

    const sourceId = obj && obj.id;
    const now = Date.now();

    for (const lookbackMs of LOOKBACK_STEPS_MS) {
        const points = await getHistory(adapter, historyInstance, sourceId, now - lookbackMs, now, 'none');
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
```

`module.exports` erweitern:

```js
module.exports = { VALUE_KINDS, classifyFromMetadata, detectPatternFromSamples, classifyValueKind };
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/valueKindClassifier.test.js`
Expected: PASS (alle Tests in der Datei)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/valueKindClassifier.js test/unit/valueKindClassifier.test.js
git commit -m "$(cat <<'EOF'
feat: add classifyValueKind orchestration (metadata + escalating data sample)

Ties stage 1 (metadata) and stage 2 (pattern detection) together: boolean
is certain from metadata alone (no history call needed); everything else
escalates through 48h/7d/30d/365d lookback windows via getHistory until
a pattern is confirmed, falling back to the low-confidence metadata guess
if all windows stay inconclusive. Pure history reads only, no LLM call.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/valuekind-orchestration -m "Merge feature/valuekind-orchestration into develop"
git branch -d feature/valuekind-orchestration
```

---

## Task 5: `lib/onboarding.js` — `valueKind` für neu entdeckte Objekte

**Files:**
- Modify: `lib/onboarding.js`
- Test: `test/unit/onboarding.test.js`

**Interfaces:**
- Consumes: `classifyValueKind(adapter, obj, historyInstance)` aus `lib/valueKindClassifier.js` (Task 4).
- Produces: Katalogeinträge aus `runOnboarding` haben ab jetzt zusätzlich `valueKind`/`valueKindConfidence`/`valueKindSource`.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/onboarding-valuekind
```

- [ ] **Step 2: Fehlschlagenden Test schreiben**

In `test/unit/onboarding.test.js`, `loadOnboardingWithStubs` um einen `classifyValueKind`-Stub erweitern:

```js
function loadOnboardingWithStubs({ getAllCatalogEntries, setCatalogEntry, recordUsage, isBudgetExceeded, classifyValueKind }) {
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
    });
}
```

Neuer Test am Ende der `describe('runOnboarding', ...)`-Suite (vor der letzten `});`):

```js
    it('attaches valueKind classification to newly classified entries', async () => {
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
        const classifyValueKind = sinon
            .stub()
            .resolves({ valueKind: 'daily_reset_counter', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            valueKind: 'daily_reset_counter',
            valueKindConfidence: 'high',
            valueKindSource: 'sampled',
        });
        expect(classifyValueKind.calledOnceWith(sinon.match.any, discovered[0], 'influxdb.0')).to.equal(true);
    });
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: FAIL — `entry.valueKind` ist `undefined`

- [ ] **Step 4: Implementierung**

In `lib/onboarding.js`, `require` ergänzen (nach der bestehenden `require('./usage')`-Zeile):

```js
const { classifyValueKind } = require('./valueKindClassifier');
```

Im inneren `for`-Loop, in dem `entry` gebaut wird (in `runOnboarding`), vor `try { await setCatalogEntry(...)` die Klassifizierung aufrufen und das Ergebnis in `entry` mergen. Der bestehende Block:

```js
            const entry = {
                sourceId: classification.sourceId,
                description: classification.description,
                unit: classification.unit || source.common.unit || '',
                category: classification.category,
                room: roomLookup.get(source.id) || classification.room || '',
                confidence: classification.confidence,
                needsReview: classification.confidence === 'low',
                active: true,
                ignored: false,
                historyInstance: source.historyInstance,
                lastSeen: new Date().toISOString(),
            };
```

wird ersetzt durch:

```js
            const valueKindResult = await classifyValueKind(adapter, source, source.historyInstance);
            const entry = {
                sourceId: classification.sourceId,
                description: classification.description,
                unit: classification.unit || source.common.unit || '',
                category: classification.category,
                room: roomLookup.get(source.id) || classification.room || '',
                confidence: classification.confidence,
                needsReview: classification.confidence === 'low',
                active: true,
                ignored: false,
                historyInstance: source.historyInstance,
                lastSeen: new Date().toISOString(),
                ...valueKindResult,
            };
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS (alle Tests in der Datei, inkl. der bereits bestehenden — die Standard-Stub liefert `gauge`/`low`/`metadata`, was die bestehenden `deep.include`-Assertions nicht stört, da die nicht auf Abwesenheit dieser Felder prüfen)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "$(cat <<'EOF'
feat: classify valueKind for newly onboarded catalog entries

runOnboarding now calls classifyValueKind (lib/valueKindClassifier.js)
for each newly classified object, in the same batch as the existing
description/category classification, and merges the result into the
catalog entry.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/onboarding-valuekind -m "Merge feature/onboarding-valuekind into develop"
git branch -d feature/onboarding-valuekind
```

---

## Task 6: `lib/adminCommands.js` — `valueKind` im Admin-Update

**Files:**
- Modify: `lib/adminCommands.js`
- Test: `test/unit/adminCommands.test.js`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `updateCatalogEntryAdmin(adapter, {sourceId, category?, room?, description?, valueKind?, ignored?})` — setzt bei mitgeschicktem `valueKind` zusätzlich `valueKindSource: 'manual'` (verhindert, dass ein späterer automatischer Klassifizierungslauf die manuelle Korrektur überschreibt, siehe Task 7).

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/admin-update-valuekind
```

- [ ] **Step 2: Fehlschlagenden Test schreiben**

In `test/unit/adminCommands.test.js`, in der `describe('updateCatalogEntryAdmin', ...)`-Suite ergänzen:

```js
        it('updates valueKind and marks the source as manual', async () => {
            const existing = {
                sourceId: 'javascript.0.x',
                category: 'lighting',
                valueKind: 'gauge',
                valueKindConfidence: 'low',
                valueKindSource: 'metadata',
            };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', valueKind: 'daily_reset_counter' });

            expect(result.entry).to.deep.include({
                valueKind: 'daily_reset_counter',
                valueKindSource: 'manual',
            });
        });

        it('leaves valueKind untouched when not provided', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'lighting', valueKind: 'gauge', valueKindSource: 'sampled' };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', room: 'Keller' });

            expect(result.entry).to.deep.include({ valueKind: 'gauge', valueKindSource: 'sampled' });
        });
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/adminCommands.test.js`
Expected: FAIL — `result.entry.valueKindSource` ist `'metadata'` statt `'manual'` im ersten neuen Test

- [ ] **Step 4: Implementierung**

In `lib/adminCommands.js`, `updateCatalogEntryAdmin`s Signatur und Body anpassen. Der bestehende Block:

```js
async function updateCatalogEntryAdmin(adapter, { sourceId, category, room, description, ignored } = {}) {
    const entry = await findEntry(adapter, sourceId);
    if (!entry) {
        return { error: `Unbekanntes Objekt: ${sourceId}` };
    }

    const updated = { ...entry };
    if (category !== undefined) {
        updated.category = category;
        updated.needsReview = false;
    }
    if (room !== undefined) {
        updated.room = room;
    }
    if (description !== undefined) {
        updated.description = description;
    }
    if (ignored !== undefined) {
        updated.ignored = ignored;
    }
    updated.lastSeen = new Date().toISOString();
```

wird ersetzt durch:

```js
async function updateCatalogEntryAdmin(adapter, { sourceId, category, room, description, valueKind, ignored } = {}) {
    const entry = await findEntry(adapter, sourceId);
    if (!entry) {
        return { error: `Unbekanntes Objekt: ${sourceId}` };
    }

    const updated = { ...entry };
    if (category !== undefined) {
        updated.category = category;
        updated.needsReview = false;
    }
    if (room !== undefined) {
        updated.room = room;
    }
    if (description !== undefined) {
        updated.description = description;
    }
    if (valueKind !== undefined) {
        updated.valueKind = valueKind;
        updated.valueKindConfidence = 'high';
        updated.valueKindSource = 'manual';
    }
    if (ignored !== undefined) {
        updated.ignored = ignored;
    }
    updated.lastSeen = new Date().toISOString();
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/adminCommands.test.js`
Expected: PASS (alle Tests in der Datei)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/adminCommands.js test/unit/adminCommands.test.js
git commit -m "$(cat <<'EOF'
feat: allow manual valueKind correction via updateCatalogEntryAdmin

Mirrors the existing description/category pattern. Setting valueKind
through the admin device table marks valueKindSource as 'manual' and
confidence as 'high', so the syncCatalog() backfill (upcoming) never
silently overwrites a human correction.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/admin-update-valuekind -m "Merge feature/admin-update-valuekind into develop"
git branch -d feature/admin-update-valuekind
```

---

## Task 7: `admin/jsonConfig.json` + `main.js` — Backfill für bestehende Objekte

**Files:**
- Modify: `admin/jsonConfig.json`
- Modify: `main.js`

**Interfaces:**
- Consumes: `classifyValueKind` aus `lib/valueKindClassifier.js` (Task 4); `updateCatalogEntryAdmin`-Feld-Konvention aus Task 6 (`valueKindSource: 'manual'` wird respektiert, nie überschrieben).
- Produces: `this.config.enableValueKindBackfill` (boolean, Default `false`); `syncCatalog()` klassifiziert pro Lauf bis zu 20 bestehende, aktive, nicht ignorierte Katalogeinträge ohne `valueKind` nach, sofern der Schalter aktiv ist.

**Hinweis zur Testabdeckung:** wie bei allen bisherigen `main.js`-Änderungen in diesem Projekt kein neuer `main.js`-Test (siehe Global Constraints) — die Klassifizierungs-Logik selbst ist bereits in Task 2–4 vollständig getestet, hier geht es nur um Verdrahtung. Verifikation über den manuellen Abnahmetest (Task 10).

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/valuekind-backfill
```

- [ ] **Step 2: Admin-Konfigurationsfeld ergänzen**

In `admin/jsonConfig.json`, nach dem bestehenden `"dailyTokenBudget"`-Feld (vor der schließenden `}` von `"items"`) ergänzen:

```json
    "dailyTokenBudget": {
      "type": "number",
      "label": "Taegliches Token-Budget (0 = kein Limit)",
      "default": 0,
      "min": 0
    },
    "enableValueKindBackfill": {
      "type": "checkbox",
      "label": "Bestehende Datenpunkte nachtraeglich auf Auspraegung (valueKind) pruefen",
      "default": false
    }
```

- [ ] **Step 3: `main.js` — `require` ergänzen**

Nach der bestehenden `require('./lib/promptContext')`-Zeile:

```js
const { classifyValueKind } = require('./lib/valueKindClassifier');
```

- [ ] **Step 4: `main.js` — Backfill-Konstante und Hilfsmethode**

Nach der bestehenden `const BATCH_SIZE = 20;`-artigen Stelle **gibt es in `main.js` keine solche Konstante** — sie lebt in `lib/onboarding.js`. In `main.js` daher direkt am Klassen-Anfang (innerhalb von `class AiAnalytics extends utils.Adapter { ... }`, z. B. direkt vor `syncCatalog()`) eine Modul-Konstante ergänzen, oberhalb der Klasse:

```js
const VALUE_KIND_BACKFILL_BATCH_SIZE = 20;
```

Neue Methode `backfillValueKinds` in die Klasse einfügen (z. B. direkt nach `syncCatalog()`):

```js
    async backfillValueKinds(entries) {
        const pending = entries
            .filter((entry) => entry.active !== false && !entry.ignored && !entry.valueKind)
            .slice(0, VALUE_KIND_BACKFILL_BATCH_SIZE);

        for (const entry of pending) {
            try {
                const sourceObj = await this.getForeignObjectAsync(entry.sourceId);
                const obj = { id: entry.sourceId, common: (sourceObj && sourceObj.common) || {} };
                const result = await classifyValueKind(this, obj, entry.historyInstance);
                await setCatalogEntry(this, { ...entry, ...result });
                if (this.log && this.log.silly) {
                    this.log.silly(`valueKind-Backfill: ${entry.sourceId} -> ${result.valueKind} (${result.valueKindConfidence}, ${result.valueKindSource})`);
                }
            } catch (error) {
                if (this.log) {
                    this.log.error(`valueKind-Backfill fuer ${entry.sourceId} fehlgeschlagen: ${error.message}`);
                }
            }
        }

        return { backfilledCount: pending.length };
    }
```

- [ ] **Step 5: `main.js` — Aufruf aus `syncCatalog()`**

Am Ende von `syncCatalog()`, direkt vor dem bestehenden `return { foundCount: ..., newCount: ..., reactivatedCount, skipped: null };` (bzw. vor dem entsprechenden Return-Statement im Erfolgsfall — nach dem `runOnboarding`-Aufruf und dem `needsReview`-Block), folgenden Block einfügen:

```js
        if (this.config.enableValueKindBackfill) {
            const currentEntries = await getAllCatalogEntries(this);
            await this.backfillValueKinds(currentEntries);
        }
```

(Reihenfolge: nach `runOnboarding`, vor dem finalen `return`. `getAllCatalogEntries` ist in `main.js` bereits importiert.)

- [ ] **Step 6: Vollständige Testsuite laufen lassen**

Run: `npm test`
Expected: PASS (keine Regression — dieser Task fügt bewusst keine `main.js`-Tests hinzu, siehe Hinweis oben; alle bisherigen Tests bleiben unberührt, da `enableValueKindBackfill` standardmäßig `undefined`/falsy ist und der neue Codepfad damit in bestehenden Tests nie greift)

- [ ] **Step 7: Commit**

```bash
git add admin/jsonConfig.json main.js
git commit -m "$(cat <<'EOF'
feat: backfill valueKind for existing catalog entries (opt-in)

syncCatalog() (runs on adapter start and on manual "Geraete neu
einlesen") now also classifies up to 20 existing, active, non-ignored
catalog entries missing valueKind per run — but only when the new
enableValueKindBackfill config switch is on (default: off), so
existing installations with many catalog entries don't get an
unsolicited cost/time spike right after the update. Entries already
manually corrected (valueKindSource: 'manual') are skipped since they
already have a valueKind set.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/valuekind-backfill -m "Merge feature/valuekind-backfill into develop"
git branch -d feature/valuekind-backfill
```

---

## Task 8: `admin/tab.js` — Geräte-Tab: "Verhalten"- und "Einheit"-Spalte

**Files:**
- Modify: `admin/tab.js`

**Interfaces:** keine neuen exportierten Funktionen — reine DOM-Erweiterung der bestehenden `renderDeviceRow`. Kein neuer automatisierter Test (DOM-Rendering bleibt manueller Abnahmetest, wie beim Rest von `admin/tab.js` — siehe bereits bestehende `description`-Spalte, ebenfalls ungetestet).

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/tab-valuekind-column
```

- [ ] **Step 2: `VALUE_KINDS` in `admin/tab.js` verfügbar machen**

Direkt nach der bestehenden `const CATEGORIES = [...]`-Zeile in `admin/tab.js` ergänzen:

```js
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
```

- [ ] **Step 3: Tabellenkopf um zwei Spalten erweitern**

In `admin/tab.html`, die Kopfzeile der Geräte-Tabelle:

```html
                <tr><th>Objekt-ID</th><th>Beschreibung</th><th>Kategorie</th><th>Raum</th><th>Status</th><th>Aktionen</th></tr>
```

wird zu:

```html
                <tr><th>Objekt-ID</th><th>Beschreibung</th><th>Kategorie</th><th>Verhalten</th><th>Einheit</th><th>Raum</th><th>Status</th><th>Aktionen</th></tr>
```

- [ ] **Step 4: `renderDeviceRow` in `admin/tab.js` erweitern**

Nach dem bestehenden Block, der `categorySelect`/`categoryCell` baut und anhängt (`row.appendChild(categoryCell);`), zwei neue Zellen einfügen:

```js
    const valueKindSelect = document.createElement('select');
    VALUE_KINDS.forEach((kind) => {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = kind;
        if (kind === entry.valueKind) option.selected = true;
        valueKindSelect.appendChild(option);
    });
    const valueKindCell = document.createElement('td');
    valueKindCell.appendChild(valueKindSelect);
    row.appendChild(valueKindCell);

    const unitCell = document.createElement('td');
    unitCell.textContent = entry.unit || '';
    row.appendChild(unitCell);
```

Im bestehenden `saveButton`-Click-Handler, in dem `updateCatalogEntryAdmin` aufgerufen wird, `valueKind: valueKindSelect.value` zum übergebenen Objekt hinzufügen (neben `sourceId`, `category`, `room`, `description`).

- [ ] **Step 5: Vollständige Testsuite laufen lassen**

Run: `npm test`
Expected: PASS (keine Regression — `renderDeviceRow` ist nicht exportiert/unit-getestet, `test/unit/tabFormat.test.js` bleibt unberührt)

- [ ] **Step 6: Commit**

```bash
git add admin/tab.js admin/tab.html
git commit -m "$(cat <<'EOF'
feat: show and edit valueKind + unit in the Geraete-Tab device table

New "Verhalten" dropdown (mirrors the existing Kategorie dropdown) and
read-only "Einheit" column, so a wrong automatic classification can be
corrected by hand.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/tab-valuekind-column -m "Merge feature/tab-valuekind-column into develop"
git branch -d feature/tab-valuekind-column
```

---

## Task 9: `lib/tools.js` — `getPeriodTotal`/`comparePeriods`

**Files:**
- Modify: `lib/tools.js`
- Test: `test/unit/tools.test.js`

**Interfaces:**
- Consumes: `getHistory` aus `lib/dataAccess.js` (bereits importiert in `tools.js`); `getLocalDayBoundaries`, `getLocalTimeZone` aus `lib/promptContext.js` (Task 1) — jeder Zeitraum kann statt expliziter `start`/`end` ein `dayOffset` (0 = heute, -1 = gestern, ...) angeben, das per `getLocalDayBoundaries` in der lokalen Zeitzone aufgelöst wird. Das nimmt der KI genau die Tagesgrenzen-Arithmetik ab, bei der sie live beim UTC+2-Fall wiederholt danebenlag (siehe Kontext im Spec).
- Produces: zwei neue Werkzeuge `getPeriodTotal`, `comparePeriods` in `buildTools(adapter).definitions`/`.execute`.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/period-total-tools
```

- [ ] **Step 2: Fehlschlagende Tests schreiben**

In `test/unit/tools.test.js` zuerst die bestehende `loadToolsWithStubs`-Hilfsfunktion am Dateianfang erweitern, damit sie zusätzlich `./promptContext` proxied:

```js
function loadToolsWithStubs({ getAllCatalogEntries, getHistory, compareTimeframes, setCatalogEntry, getLocalDayBoundaries, getLocalTimeZone }) {
    return proxyquire('../../lib/tools', {
        './catalog': { getAllCatalogEntries, setCatalogEntry, CATEGORIES: ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'] },
        './dataAccess': { getHistory, compareTimeframes },
        './promptContext': {
            getLocalDayBoundaries: getLocalDayBoundaries || sinon.stub(),
            getLocalTimeZone: getLocalTimeZone || sinon.stub().returns('UTC'),
        },
    });
}
```

(Nur die `getLocalDayBoundaries`/`getLocalTimeZone`-Zeilen und der `./promptContext`-Block sind neu — die bestehende Signatur/die anderen Proxies bleiben wie sie sind, exakte bestehende Feldnamen/Struktur beibehalten.)

Danach am Ende der `describe('buildTools', ...)`-Suite (vor der letzten `});`) ergänzen:

```js
    describe('getPeriodTotal', () => {
        it('returns {total} using the last/max value of the period for a daily_reset_counter', async () => {
            const getHistoryStub = sinon.stub().resolves([
                { ts: 1, val: 5 }, { ts: 2, val: 12 }, { ts: 3, val: 8 },
            ]);
            const { buildTools } = loadToolsWithStubs({
                getAllCatalogEntries: sinon
                    .stub()
                    .resolves([{ sourceId: 'sun2000.0.x', historyInstance: 'influxdb.0', valueKind: 'daily_reset_counter', description: 'PV-Ertrag', unit: 'kWh' }]),
                getHistory: getHistoryStub,
            });

            const { execute } = buildTools({});
            const result = await execute('getPeriodTotal', { sourceId: 'sun2000.0.x', periods: [{ start: 0, end: 1000 }] });

            expect(result.valueKind).to.equal('daily_reset_counter');
            expect(result.valueKindUnknown).to.equal(false);
            expect(result.periods).to.deep.equal([{ start: 0, end: 1000, total: 12 }]);
            expect(getHistoryStub.calledOnceWith({}, 'influxdb.0', 'sun2000.0.x', 0, 1000, 'minmax')).to.equal(true);
        });

        it('returns {onDurationMs, switchCount} for a boolean_state using onchange points', async () => {
            const getHistoryStub = sinon.stub().resolves([
                { ts: 100, val: true }, { ts: 400, val: false }, { ts: 700, val: true },
            ]);
            const { buildTools } = loadToolsWithStubs({
                getAllCatalogEntries: sinon
                    .stub()
                    .resolves([{ sourceId: 'shelly.0.relay', historyInstance: 'influxdb.0', valueKind: 'boolean_state' }]),
                getHistory: getHistoryStub,
            });

            const { execute } = buildTools({});
            const result = await execute('getPeriodTotal', { sourceId: 'shelly.0.relay', periods: [{ start: 0, end: 1000 }] });

            expect(result.periods).to.deep.equal([{ start: 0, end: 1000, onDurationMs: 600, switchCount: 3 }]);
            expect(getHistoryStub.calledOnceWith({}, 'influxdb.0', 'shelly.0.relay', 0, 1000, 'onchange')).to.equal(true);
        });

        it('returns {avg, min, max} for a gauge using average aggregation', async () => {
            const getHistoryStub = sinon.stub().resolves([{ ts: 1, val: 10 }, { ts: 2, val: 20 }, { ts: 3, val: 30 }]);
            const { buildTools } = loadToolsWithStubs({
                getAllCatalogEntries: sinon
                    .stub()
                    .resolves([{ sourceId: 'sun2000.0.power', historyInstance: 'influxdb.0', valueKind: 'gauge' }]),
                getHistory: getHistoryStub,
            });

            const { execute } = buildTools({});
            const result = await execute('getPeriodTotal', { sourceId: 'sun2000.0.power', periods: [{ start: 0, end: 1000 }] });

            expect(result.periods).to.deep.equal([{ start: 0, end: 1000, avg: 20, min: 10, max: 30 }]);
            expect(getHistoryStub.calledOnceWith({}, 'influxdb.0', 'sun2000.0.power', 0, 1000, 'average')).to.equal(true);
        });

        it('treats an entry without valueKind as a gauge and flags valueKindUnknown', async () => {
            const getHistoryStub = sinon.stub().resolves([{ ts: 1, val: 5 }]);
            const { buildTools } = loadToolsWithStubs({
                getAllCatalogEntries: sinon
                    .stub()
                    .resolves([{ sourceId: 'javascript.0.x', historyInstance: 'influxdb.0' }]),
                getHistory: getHistoryStub,
            });

            const { execute } = buildTools({});
            const result = await execute('getPeriodTotal', { sourceId: 'javascript.0.x', periods: [{ start: 0, end: 1000 }] });

            expect(result.valueKind).to.equal('gauge');
            expect(result.valueKindUnknown).to.equal(true);
        });

        it('resolves a dayOffset period into the local calendar day, instead of requiring explicit start/end', async () => {
            const getHistoryStub = sinon.stub().resolves([{ ts: 1, val: 7 }]);
            const { buildTools } = loadToolsWithStubs({
                getAllCatalogEntries: sinon
                    .stub()
                    .resolves([{ sourceId: 'sun2000.0.x', historyInstance: 'influxdb.0', valueKind: 'daily_reset_counter' }]),
                getHistory: getHistoryStub,
                getLocalDayBoundaries: sinon.stub().returns({ start: 1000, end: 87400000 }),
                getLocalTimeZone: sinon.stub().returns('Europe/Berlin'),
            });

            const { execute } = buildTools({});
            const result = await execute('getPeriodTotal', { sourceId: 'sun2000.0.x', periods: [{ dayOffset: -1 }] });

            expect(result.periods).to.deep.equal([{ start: 1000, end: 87400000, total: 7 }]);
            expect(getHistoryStub.calledOnceWith({}, 'influxdb.0', 'sun2000.0.x', 1000, 87400000, 'minmax')).to.equal(true);
        });
    });

    describe('comparePeriods', () => {
        it('computes deltaTotal/deltaPercent against the baseline period (default index 0)', async () => {
            const getHistoryStub = sinon.stub();
            getHistoryStub.onCall(0).resolves([{ ts: 1, val: 40 }]);
            getHistoryStub.onCall(1).resolves([{ ts: 1, val: 50 }]);
            const { buildTools } = loadToolsWithStubs({
                getAllCatalogEntries: sinon
                    .stub()
                    .resolves([{ sourceId: 'sun2000.0.x', historyInstance: 'influxdb.0', valueKind: 'daily_reset_counter' }]),
                getHistory: getHistoryStub,
            });

            const { execute } = buildTools({});
            const result = await execute('comparePeriods', {
                sourceId: 'sun2000.0.x',
                periods: [{ start: 0, end: 100 }, { start: 100, end: 200 }],
            });

            expect(result.periods[0]).to.deep.include({ total: 40, deltaTotal: 0, deltaPercent: 0 });
            expect(result.periods[1]).to.deep.include({ total: 50, deltaTotal: 10, deltaPercent: 25 });
        });

        it('uses baselineIndex to compare against a non-first period', async () => {
            const getHistoryStub = sinon.stub();
            getHistoryStub.onCall(0).resolves([{ ts: 1, val: 40 }]);
            getHistoryStub.onCall(1).resolves([{ ts: 1, val: 50 }]);
            const { buildTools } = loadToolsWithStubs({
                getAllCatalogEntries: sinon
                    .stub()
                    .resolves([{ sourceId: 'sun2000.0.x', historyInstance: 'influxdb.0', valueKind: 'daily_reset_counter' }]),
                getHistory: getHistoryStub,
            });

            const { execute } = buildTools({});
            const result = await execute('comparePeriods', {
                sourceId: 'sun2000.0.x',
                periods: [{ start: 0, end: 100 }, { start: 100, end: 200 }],
                baselineIndex: 1,
            });

            expect(result.periods[0]).to.deep.include({ total: 40, deltaTotal: -10, deltaPercent: -20 });
            expect(result.periods[1]).to.deep.include({ total: 50, deltaTotal: 0, deltaPercent: 0 });
        });
    });
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/tools.test.js`
Expected: FAIL — `Unbekanntes Werkzeug: getPeriodTotal`

- [ ] **Step 4: Implementierung**

In `lib/tools.js`, den bestehenden Import-Block am Dateianfang erweitern:

```js
const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
const { getHistory, compareTimeframes } = require('./dataAccess');
const { getLocalDayBoundaries, getLocalTimeZone } = require('./promptContext');
```

In der `definitions`-Array (nach der bestehenden `compareTimeframes`-Definition, vor `updateCatalogEntry`) zwei neue Definitionen einfügen — der `periods`-Item-Typ erlaubt entweder explizite `start`/`end` **oder** ein `dayOffset` (0 = heute, -1 = gestern, lokale Zeitzone):

```js
        {
            name: 'getPeriodTotal',
            description:
                'Berechnet fuer ein katalogisiertes Objekt den korrekten Wert je angegebenem Zeitraum, passend zur ' +
                'Auspraegung (valueKind) des Objekts (z.B. letzter Wert des Tages bei Tageszaehlern statt Summe der ' +
                'Rohwerte). Zu bevorzugen gegenueber getHistory, sobald valueKind fuer das Objekt bekannt ist (siehe listCatalog). ' +
                'Jeder Zeitraum kann statt start/end ein dayOffset angeben (0=heute, -1=gestern, ...) — wird automatisch ' +
                'in die lokale Kalendertag-Grenze aufgeloest, keine eigene UTC-Arithmetik noetig.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    periods: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                start: { type: 'number' },
                                end: { type: 'number' },
                                dayOffset: { type: 'number', description: '0=heute, -1=gestern, ... (lokale Zeitzone); Alternative zu start/end' },
                            },
                        },
                    },
                },
                required: ['sourceId', 'periods'],
            },
        },
        {
            name: 'comparePeriods',
            description:
                'Vergleicht mehrere Zeitraeume desselben Objekts typ-bewusst (siehe getPeriodTotal) und liefert je ' +
                'Zeitraum die Differenz/Prozent zu einem gewaehlten Basiszeitraum (baselineIndex, Default 0). ' +
                'Periods koennen wie bei getPeriodTotal per dayOffset statt start/end angegeben werden.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    periods: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                start: { type: 'number' },
                                end: { type: 'number' },
                                dayOffset: { type: 'number', description: '0=heute, -1=gestern, ... (lokale Zeitzone); Alternative zu start/end' },
                            },
                        },
                    },
                    baselineIndex: { type: 'number' },
                },
                required: ['sourceId', 'periods'],
            },
        },
```

Vor der `execute`-Funktion (also z. B. direkt nach `findCatalogEntry`) zwei private Hilfsfunktionen einfügen:

```js
    function resolvePeriod(period) {
        if (typeof period.dayOffset === 'number') {
            const timeZone = getLocalTimeZone();
            const target = Date.now() + period.dayOffset * 24 * 3600 * 1000;
            return getLocalDayBoundaries(target, timeZone);
        }
        return { start: period.start, end: period.end };
    }

    async function computePeriodValue(entry, period) {
        const { historyInstance, sourceId, valueKind } = entry;
        const kind = valueKind || 'gauge';

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
        const validVals = points.map((point) => point.val).filter((val) => Number.isFinite(val));
        const avg = validVals.length ? validVals.reduce((a, b) => a + b, 0) / validVals.length : 0;
        const min = validVals.length ? Math.min(...validVals) : 0;
        const max = validVals.length ? Math.max(...validVals) : 0;
        return { avg, min, max };
    }
```

In `execute`, nach dem bestehenden `if (name === 'compareTimeframes') { ... }`-Block einfügen:

```js
        if (name === 'getPeriodTotal') {
            const entry = await findCatalogEntry(input.sourceId);
            const periods = [];
            for (const rawPeriod of input.periods) {
                const period = resolvePeriod(rawPeriod);
                periods.push({ start: period.start, end: period.end, ...(await computePeriodValue(entry, period)) });
            }
            return {
                description: entry.description,
                room: entry.room,
                unit: entry.unit,
                valueKind: entry.valueKind || 'gauge',
                valueKindUnknown: !entry.valueKind,
                periods,
            };
        }

        if (name === 'comparePeriods') {
            const entry = await findCatalogEntry(input.sourceId);
            const baselineIndex = input.baselineIndex || 0;
            const values = [];
            for (const rawPeriod of input.periods) {
                const period = resolvePeriod(rawPeriod);
                values.push({ start: period.start, end: period.end, ...(await computePeriodValue(entry, period)) });
            }
            const numericField = (value) => (value.total !== undefined ? value.total : value.avg);
            const baselineValue = numericField(values[baselineIndex]);
            const periods = values.map((value) => {
                const currentValue = numericField(value);
                const deltaTotal = currentValue - baselineValue;
                const deltaPercent = baselineValue !== 0 ? (deltaTotal / baselineValue) * 100 : 0;
                return { ...value, deltaTotal, deltaPercent };
            });
            return {
                description: entry.description,
                room: entry.room,
                unit: entry.unit,
                valueKind: entry.valueKind || 'gauge',
                valueKindUnknown: !entry.valueKind,
                periods,
            };
        }
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/tools.test.js`
Expected: PASS (alle Tests in der Datei, inkl. der bereits bestehenden)

- [ ] **Step 6: `main.js` — System-Prompt-Hinweis (beide Vorkommen)**

In `main.js`, in beiden `systemPrompt`-String-Verkettungen (`runProactiveCheck` und `processChatQuestion`), nach der Zeile zu `Zeitangaben fuer getHistory/compareTimeframes...` folgende Zeile ergänzen:

```js
                'Bevorzuge getPeriodTotal/comparePeriods gegenueber getHistory/compareTimeframes, sobald fuer ein Objekt ' +
                'ein valueKind bekannt ist (siehe listCatalog) — sie wenden automatisch die fuer die Auspraegung ' +
                '(Momentanwert/Zaehler/Schalter) richtige Rechenoperation an. ' +
```

- [ ] **Step 7: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/tools.js main.js
git commit -m "$(cat <<'EOF'
feat: add valueKind-aware getPeriodTotal/comparePeriods tools

Fixes the root cause of a live-observed bug: for a single-day question
the agent called compareTimeframes (two unneeded history calls) and
summed raw points of a monotonically increasing daily counter, giving
a nonsensical total. These new tools pick the correct operation per
valueKind (last/max value for daily counters, delta for lifetime
counters, on-duration/switch-count for booleans, average/min/max for
gauges, sum only for the genuinely additive event_count case) and are
preferred by the system prompt once an object's valueKind is known.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/period-total-tools -m "Merge feature/period-total-tools into develop"
git branch -d feature/period-total-tools
```

---

## Task 10: ADR-0024 + Dokumentations-Sync + CHANGELOG

**Files:**
- Create: `docs/adr/0024-zweistufige-valuekind-klassifizierung.md`
- Modify: `docs/adr/adr-index.md`
- Modify: `docs/architecture/05-bausteinsicht.md`
- Modify: `docs/architecture/11-risiken-und-schulden.md`
- Modify: `CHANGELOG.md`

**Interfaces:** keine Code-Schnittstellen — reine Dokumentation, letzter Task des Plans.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b docs/valuekind-wrapup
```

- [ ] **Step 2: ADR-0024 schreiben**

Neue Datei `docs/adr/0024-zweistufige-valuekind-klassifizierung.md`:

```markdown
# ADR-0024: Zweistufige `valueKind`-Klassifizierung (Metadaten + Datenprobe), kein LLM-Aufruf

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-24

## Kontext

Live beobachtet ([Spec](../specs/2026-08-24-datenpunkt-klassifizierung.md)): die KI summierte die Rohwerte eines monoton steigenden Tageszählers und erhielt einen physikalisch bedeutungslosen Wert (624,97 kWh statt eines plausiblen Tagesertrags). Der Katalog kannte bisher keine Achse für das *Verhalten* eines Datenpunkts (Momentanwert/Zähler/Schalter), nur die fachliche `category`.

## Entscheidung

Die Klassifizierung läuft zweistufig, rein regelbasiert (keine LLM-Beteiligung):

1. **Deterministisch aus ioBroker-Metadaten** (`common.type`/`role`/`name`/ID-Textmuster) — kostenlos, sofort.
2. **Datenprobe mit eskalierendem Lookback** (48h → 7d → 30d → 365d) über die bereits vorhandene `getHistory`-Anbindung, Mustererkennung rein wertbasiert (keine Zeitzonen-Abhängigkeit für die Erkennung selbst, nur für die spätere Tages-Bucketing-Anwendung in `getPeriodTotal`).

Ein echter LLM-Aufruf ist bewusst **nicht** Teil dieser Klassifizierung — die Muster (Boolean, Reset-Zähler, Lebenszeit-Zähler, Gauge) sind aus den Rohdaten programmatisch zuverlässig erkennbar, ein LLM-Aufruf pro Objekt wäre unnötiger Kostenaufwand ohne Genauigkeitsgewinn.

## Konsequenzen

- Neues Katalogfeld `valueKind` (+ `valueKindConfidence`, `valueKindSource`) ist reines Zusatzmetadatum, kein Breaking Change für bestehende Katalogeinträge (fehlt es, behandeln die neuen Werkzeuge das Objekt als `gauge`).
- Bestehende Katalogeinträge (vor diesem Feature) bekommen `valueKind` nur nachträglich, wenn der neue Admin-Schalter `enableValueKindBackfill` aktiviert wird (Default aus) — bewusst kein ungefragter Kosten-/Zeitschub direkt nach dem Update.
- `event_count` ist die einzige Ausprägung ohne automatische Erkennung (kein zuverlässiges Datenmuster dafür) — bleibt rein manuell im Geräte-Tab setzbar.

## Verworfene Alternativen

- **Reine LLM-Klassifizierung** (analog zur Beschreibung/Kategorie-Klassifizierung beim Onboarding): verworfen, da Verhaltensmuster aus Zeitreihendaten zuverlässiger und günstiger programmatisch erkennbar sind als durch ein Sprachmodell, das die Rohdaten ohnehin nicht sinnvoll "lesen" kann, ohne sie im Kontext zu verarbeiten.
- **Zeitzonen-basierte Reset-Erkennung** (Reset muss exakt um lokale Mitternacht liegen): verworfen zugunsten einer rein wertbasierten Erkennung (Abfall auf einen Bruchteil des bisherigen Maximums) — robuster gegenüber Objekten, deren Reset nicht exakt an der Tagesgrenze liegt, und unabhängig von Zeitzonen-Rechengenauigkeit.
```

`docs/adr/adr-index.md` um eine Zeile ergänzen (nach der ADR-0023-Zeile):

```markdown
| [0024](0024-zweistufige-valuekind-klassifizierung.md) | Zweistufige `valueKind`-Klassifizierung (Metadaten + Datenprobe), kein LLM-Aufruf | Angenommen | 2026-08-24 |
```

- [ ] **Step 3: `05-bausteinsicht.md` aktualisieren**

Neue Zeile im `lib/`-Baum (nach `promptContext.js`, vor `scheduler.js`):

```
├── valueKindClassifier.js  Klassifiziert Datenpunkt-Verhalten (gauge/boolean/Zaehler) fuer typ-bewusste Auswertung
```

Neue Zeile in der Whitebox-Tabelle (nach `promptContext.js`):

```markdown
| `valueKindClassifier.js` | Zweistufige Klassifizierung des Wert-Verhaltens (Metadaten, dann Datenprobe mit eskalierendem Lookback 48h/7d/30d/365d) — siehe [ADR-0024](../adr/0024-zweistufige-valuekind-klassifizierung.md) | `classifyValueKind(adapter,obj,historyInstance) => Promise<{valueKind,valueKindConfidence,valueKindSource}>`, `classifyFromMetadata`, `detectPatternFromSamples`, `VALUE_KINDS` |
```

Zeile zu `tools.js` um die zwei neuen Werkzeuge ergänzen; Zeile zu `onboarding.js` um die valueKind-Klassifizierung ergänzen; Modulzahl in der Fußzeile entsprechend erhöhen (bisher 14, jetzt 15).

- [ ] **Step 4: `11-risiken-und-schulden.md` aktualisieren**

Neuer Eintrag, der den ursprünglich beobachteten Bug als gelöst dokumentiert:

```markdown
- ~~KI summierte rohe Werte eines monoton steigenden Tageszählers (physikalisch bedeutungsloses Ergebnis)~~ — **gelöst (2026-08-24)**: live beobachtet (`sun2000.0.collected.dailyEnergyYield`, Antwort 624,97 kWh statt eines plausiblen Tagesertrags) — Ursache war fehlendes Wissen über das *Verhalten* eines Datenpunkts (Zähler vs. Momentanwert) plus unnötige Nutzung von `compareTimeframes` für eine Ein-Tages-Frage. Gelöst durch neues Katalogfeld `valueKind` (siehe [ADR-0024](../adr/0024-zweistufige-valuekind-klassifizierung.md)) und die typ-bewussten Werkzeuge `getPeriodTotal`/`comparePeriods`.
```

- [ ] **Step 5: CHANGELOG.md ergänzen**

Neuer `## [Unreleased]`-Abschnitt (oder Ergänzung eines bestehenden) am Dateianfang:

```markdown
## [Unreleased]

### Hinzugefügt
- Datenpunkte bekommen jetzt eine erkannte Verhaltens-Klassifizierung (`valueKind`: Momentanwert/Schalter/Tageszähler/Lebenszeit-Zähler/Summenwert) — zweistufig aus Metadaten und Datenprobe, sichtbar und korrigierbar im Geräte-Tab. Zwei neue Werkzeuge (`getPeriodTotal`, `comparePeriods`) nutzen sie, um für jeden Datenpunkt-Typ die richtige Rechenoperation anzuwenden, statt dass die KI rohe Werte selbst (und teils falsch) verrechnet — behebt einen live beobachteten Fehler, bei dem ein Tageszähler-Wert fälschlich aufsummiert wurde.
- Neuer Admin-Schalter "Bestehende Datenpunkte nachträglich auf Ausprägung prüfen" (Default aus) für die rückwirkende Klassifizierung bereits katalogisierter Objekte.
```

- [ ] **Step 6: Vollständige Testsuite laufen lassen + Commit**

```bash
npm test
git add docs/adr/0024-zweistufige-valuekind-klassifizierung.md docs/adr/adr-index.md docs/architecture/05-bausteinsicht.md docs/architecture/11-risiken-und-schulden.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: ADR-0024 and doc sync for the valueKind classification feature

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff docs/valuekind-wrapup -m "Merge docs/valuekind-wrapup into develop"
git branch -d docs/valuekind-wrapup
```

---

## Manueller Abnahmetest (nach Abschluss aller Tasks, an echter Instanz)

- Instanz neu starten, prüfen dass `onReady` fehlerfrei durchläuft.
- Ein neues, noch nicht katalogisiertes Objekt vom Typ boolean (z. B. ein Shelly-Relais) erscheint im Geräte-Tab mit `Verhalten: boolean_state`.
- `enableValueKindBackfill` aktivieren, "Geräte neu einlesen" klicken: ein bereits bekanntes Objekt ohne `valueKind` (z. B. `sun2000.0.collected.dailyEnergyYield`) bekommt `daily_reset_counter` zugewiesen (silly-Log prüfen).
- Im Geräte-Tab die `Verhalten`-Auswahl eines Objekts manuell ändern, speichern, Re-Scan erneut auslösen — die manuelle Wahl bleibt erhalten (nicht überschrieben).
- Im Chat den ursprünglichen Bug-Fall nachstellen: "wie hoch war der PV-Ertrag gestern" und "diese Woche vs. letzte Woche" — Antwort nutzt jetzt `getPeriodTotal`/`comparePeriods` (silly-Log prüfen) und liefert einen plausiblen Wert statt einer Rohwert-Summe.

## Nicht-Ziele dieser Iteration

- Automatische Erkennung von `event_count` — bleibt manuell (siehe Spec).
- Konfigurierbare Eskalationsstufen (48h/7d/30d/365d) — fest im Code.
- Rückwirkende Korrektur bereits im Chat gegebener falscher Antworten.
- Multi-Objekt-Aggregation (z. B. Summe aller PV-Wechselrichter).
