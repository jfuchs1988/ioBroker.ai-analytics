# HVAC-Korrelation (Fenster/Heizung) — Implementierungsplan

Spec: `docs/specs/2026-09-05-hvac-korrelation-fenster-heizung.md`

Umgesetzt inline in der laufenden Session. TDD pro Schritt.

## Global Constraints

- `hvacRole` ∈ `{'window', 'heating'}` oder `undefined`; nur gültig für
  `valueKind: 'boolean_state'`.
- Overlap-Schwelle: 15 Minuten (`900000` ms).
- Nur eindeutige Räume (genau ein `window` + genau ein `heating`) werden
  ausgewertet; mehrdeutige Räume werden übersprungen.
- `findHvacCorrelationCandidates` gibt `{ candidates, failedCount }` zurück
  (Plain Object, nicht die Hidden-Property-Konvention aus
  `anomalyDetector.js`).

---

## Task 1: Katalog-Validierung für `hvacRole`

**Dateien:**
- Ändern: `lib/catalog.js`
- Test: `test/unit/catalog.test.js`

- [ ] **Schritt 1: Rote Tests**

```js
it('accepts a valid hvacRole on a boolean_state entry', () => {
    const entry = validateCatalogEntry({
        sourceId: 'x', category: 'device_usage', valueKind: 'boolean_state', hvacRole: 'window',
    });
    expect(entry.hvacRole).to.equal('window');
});

it('rejects an unknown hvacRole', () => {
    expect(() => validateCatalogEntry({
        sourceId: 'x', category: 'device_usage', valueKind: 'boolean_state', hvacRole: 'nope',
    })).to.throw('hvacRole');
});

it('rejects hvacRole on a non-boolean_state entry', () => {
    expect(() => validateCatalogEntry({
        sourceId: 'x', category: 'device_usage', valueKind: 'gauge', hvacRole: 'window',
    })).to.throw('hvacRole');
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/catalog.test.js` → FAIL.

- [ ] **Schritt 3: Implementieren** — in `lib/catalog.js`, nach den
      `DERIVED_METRIC_ROLES`-Konstanten:

```js
const HVAC_ROLES = new Set(['window', 'heating']);
```

In `validateCatalogEntry`, nach dem `derivedMetricGroupId`-Block:

```js
    if (entry.hvacRole !== undefined) {
        if (!HVAC_ROLES.has(entry.hvacRole)) {
            throw new Error(`Unbekannte hvacRole: ${entry.hvacRole}`);
        }
        if (entry.valueKind !== 'boolean_state') {
            throw new Error('hvacRole ist nur fuer valueKind boolean_state gueltig.');
        }
    }
```

Export `HVAC_ROLES` in `module.exports`.

- [ ] **Schritt 4:** `npx mocha test/unit/catalog.test.js` → PASS.

## Task 2: `validateCatalogUpdate` (Admin-Pfad) erweitern

**Dateien:**
- Ändern: `lib/adminCommands.js`
- Test: `test/unit/adminCommands.test.js`

- [ ] **Schritt 1: Rote Tests** (Muster wie `derivedMetricRole`):

```js
it('rejects an unknown hvacRole', () => {
    expect(() => validateCatalogUpdate({ sourceId: 'x', hvacRole: 'nope' })).to.throw('hvacRole');
});
```

Ergänzend in der Tabelle der generischen Feld-Ablehnungstests:
`['hvacRole', 'nope']`.

Da `validateCatalogUpdate` das `valueKind`-Feld des *bestehenden* Eintrags
nicht kennt (nur das Update-Delta), prüft die `valueKind`-Kompatibilität erst
`updateCatalogEntryAdminUnlocked` gegen den geladenen Bestandseintrag:

```js
it('rejects hvacRole when the existing entry is not boolean_state', async () => {
    const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
        getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'device_usage', valueKind: 'gauge' }]),
    });

    let error;
    try {
        await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', hvacRole: 'window' });
    } catch (caught) {
        error = caught;
    }
    expect(error.message).to.include('hvacRole');
});

it('accepts and stores a valid hvacRole on a boolean_state entry', async () => {
    const setCatalogEntry = sinon.stub().resolves();
    const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
        getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'device_usage', valueKind: 'boolean_state' }]),
        setCatalogEntry,
    });

    const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', hvacRole: 'heating' });

    expect(result.entry).to.deep.include({ hvacRole: 'heating' });
    expect(setCatalogEntry.calledOnce).to.equal(true);
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/adminCommands.test.js` → FAIL.

- [ ] **Schritt 3: Implementieren** — in `lib/adminCommands.js`:

```js
const HVAC_ROLES = new Set(['window', 'heating']);
```

In `validateCatalogUpdate`, nach dem `derivedMetricGroupId`-Block:

```js
    if (message.hvacRole !== undefined && !HVAC_ROLES.has(message.hvacRole)) throw new Error('hvacRole ist ungültig.');
```

`updateCatalogEntryAdminUnlocked`: Parameter um `hvacRole` erweitern, im
`validateCatalogUpdate(...)`-Aufruf mit übergeben; nach dem
`derivedMetricGroupId`-Block:

```js
    if (hvacRole !== undefined) {
        const targetValueKind = valueKind !== undefined ? valueKind : entry.valueKind;
        if (targetValueKind !== 'boolean_state') {
            throw new Error('hvacRole ist nur fuer valueKind boolean_state gueltig.');
        }
        updated.hvacRole = hvacRole;
    }
```

(Platzierung: nach der Zeile, die `entry` per `findEntry` lädt, damit
`entry.valueKind` verfügbar ist — vor dem finalen `setCatalogEntry`-Aufruf.)

- [ ] **Schritt 4:** `npx mocha test/unit/adminCommands.test.js` → PASS.

## Task 3: `lib/hvacCorrelation.js` (neues Modul)

**Dateien:**
- Neu: `lib/hvacCorrelation.js`
- Test: `test/unit/hvacCorrelation.test.js` (neu)

**Interfaces:**
- Konsumiert: `getHistory(adapter, historyInstance, sourceId, start, end, aggregate)`
  aus `./dataAccess`; `resolvePeriod(period, now)` aus `./periodValue`
- Produziert: `findHvacCorrelationCandidates(adapter, entries, now) =>
  Promise<{ candidates: object[], failedCount: number }>`,
  `computeOverlapMs(pointsA, pointsB, periodStart, periodEnd) => number`

- [ ] **Schritt 1: Roten Test schreiben** — neue Datei
      `test/unit/hvacCorrelation.test.js`:

```js
// test/unit/hvacCorrelation.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { computeOverlapMs } = require('../../lib/hvacCorrelation');

function loadHvacCorrelationWithHistory(getHistory) {
    return proxyquire('../../lib/hvacCorrelation', {
        './dataAccess': { getHistory },
        './periodValue': {
            resolvePeriod: (period, now) => ({ start: now - 86400000, end: now }),
        },
    });
}

describe('computeOverlapMs', () => {
    it('sums the duration where both boolean streams are true', () => {
        // Fenster: offen von 100 bis 500 (400ms)
        const windowPoints = [{ ts: 100, val: true }, { ts: 500, val: false }];
        // Heizung: an von 300 bis 700 (400ms), Overlap mit Fenster: 300-500 = 200ms
        const heatingPoints = [{ ts: 300, val: true }, { ts: 700, val: false }];

        const overlap = computeOverlapMs(windowPoints, heatingPoints, 0, 1000);

        expect(overlap).to.equal(200);
    });

    it('returns 0 when the streams never overlap', () => {
        const windowPoints = [{ ts: 100, val: true }, { ts: 200, val: false }];
        const heatingPoints = [{ ts: 300, val: true }, { ts: 400, val: false }];

        expect(computeOverlapMs(windowPoints, heatingPoints, 0, 1000)).to.equal(0);
    });

    it('counts overlap through to periodEnd when a stream is still true', () => {
        const windowPoints = [{ ts: 100, val: true }];
        const heatingPoints = [{ ts: 200, val: true }];

        expect(computeOverlapMs(windowPoints, heatingPoints, 0, 1000)).to.equal(800);
    });
});

describe('findHvacCorrelationCandidates', () => {
    function windowEntry(overrides = {}) {
        return { sourceId: 'contact.0.window', historyInstance: 'history.0', description: 'Fenster Wohnzimmer', room: 'Wohnzimmer', valueKind: 'boolean_state', hvacRole: 'window', active: true, ...overrides };
    }
    function heatingEntry(overrides = {}) {
        return { sourceId: 'relay.0.heating', historyInstance: 'history.0', description: 'Heizungsventil Wohnzimmer', room: 'Wohnzimmer', valueKind: 'boolean_state', hvacRole: 'heating', active: true, ...overrides };
    }

    it('reports a candidate when the overlap meets the threshold', async () => {
        const getHistory = sinon.stub();
        getHistory.onCall(0).resolves([{ ts: 0, val: true }]); // Fenster: ganzen Tag offen
        getHistory.onCall(1).resolves([{ ts: 0, val: true }]); // Heizung: ganzen Tag an
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);
        const now = 10 * 24 * 3600 * 1000;

        const result = await findHvacCorrelationCandidates({}, [windowEntry(), heatingEntry()], now);

        expect(result.candidates).to.have.lengthOf(1);
        expect(result.candidates[0]).to.include({
            room: 'Wohnzimmer',
            reason: 'window_open_while_heating',
            windowSourceId: 'contact.0.window',
            heatingSourceId: 'relay.0.heating',
        });
        expect(result.candidates[0].overlapMs).to.equal(86400000);
        expect(result.failedCount).to.equal(0);
    });

    it('reports no candidate below the 15-minute threshold', async () => {
        const getHistory = sinon.stub();
        getHistory.onCall(0).resolves([{ ts: 0, val: true }, { ts: 60000, val: false }]); // 1 Minute offen
        getHistory.onCall(1).resolves([{ ts: 0, val: true }]); // Heizung ganzen Tag an
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);

        const result = await findHvacCorrelationCandidates({}, [windowEntry(), heatingEntry()], 10 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
    });

    it('skips rooms with more than one window or heating candidate', async () => {
        const getHistory = sinon.stub().resolves([]);
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);
        const entries = [windowEntry(), windowEntry({ sourceId: 'contact.0.window2' }), heatingEntry()];

        const result = await findHvacCorrelationCandidates({}, entries, 10 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(getHistory.called).to.equal(false);
    });

    it('ignores entries without hvacRole, inactive entries, and entries without a room', async () => {
        const getHistory = sinon.stub().resolves([]);
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);
        const entries = [
            windowEntry({ room: '' }),
            heatingEntry({ active: false }),
            { sourceId: 'other', room: 'Wohnzimmer', valueKind: 'boolean_state' },
        ];

        const result = await findHvacCorrelationCandidates({}, entries, 10 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
    });

    it('isolates history failures per room without aborting other rooms', async () => {
        const getHistory = sinon.stub().rejects(new Error('History offline'));
        const warn = sinon.stub();
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);

        const result = await findHvacCorrelationCandidates({ log: { warn } }, [windowEntry(), heatingEntry()], 10 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(result.failedCount).to.equal(1);
        expect(warn.calledOnce).to.equal(true);
    });
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/hvacCorrelation.test.js` → FAIL
      (Modul existiert nicht).

- [ ] **Schritt 3: Implementieren** — `lib/hvacCorrelation.js`:

```js
// lib/hvacCorrelation.js
'use strict';

const { getHistory } = require('./dataAccess');
const { resolvePeriod } = require('./periodValue');

const OVERLAP_THRESHOLD_MS = 15 * 60 * 1000;

function computeOverlapMs(pointsA, pointsB, periodStart, periodEnd) {
    const events = [];
    for (const point of pointsA || []) events.push({ ts: point.ts, stream: 'a', val: !!point.val });
    for (const point of pointsB || []) events.push({ ts: point.ts, stream: 'b', val: !!point.val });
    events.sort((x, y) => x.ts - y.ts);

    let aVal = false;
    let bVal = false;
    let lastTs = periodStart;
    let overlapMs = 0;
    for (const event of events) {
        if (aVal && bVal) overlapMs += event.ts - lastTs;
        lastTs = event.ts;
        if (event.stream === 'a') aVal = event.val;
        else bVal = event.val;
    }
    if (aVal && bVal) overlapMs += periodEnd - lastTs;
    return overlapMs;
}

function isHvacCandidate(entry) {
    return Boolean(entry && entry.active !== false && !entry.ignored && entry.valueKind === 'boolean_state' && entry.room && entry.hvacRole);
}

function groupByRoom(entries) {
    const rooms = new Map();
    for (const entry of entries.filter(isHvacCandidate)) {
        if (!rooms.has(entry.room)) rooms.set(entry.room, []);
        rooms.get(entry.room).push(entry);
    }
    return rooms;
}

async function findHvacCorrelationCandidates(adapter, entries, now = Date.now()) {
    const rooms = groupByRoom(entries || []);
    const candidates = [];
    let failedCount = 0;

    for (const [room, roomEntries] of rooms) {
        const windows = roomEntries.filter((entry) => entry.hvacRole === 'window');
        const heatings = roomEntries.filter((entry) => entry.hvacRole === 'heating');
        if (windows.length !== 1 || heatings.length !== 1) continue;
        const [windowEntry] = windows;
        const [heatingEntry] = heatings;

        try {
            const period = resolvePeriod({ dayOffset: -1 }, now);
            const [windowPoints, heatingPoints] = await Promise.all([
                getHistory(adapter, windowEntry.historyInstance, windowEntry.sourceId, period.start, period.end, 'onchange'),
                getHistory(adapter, heatingEntry.historyInstance, heatingEntry.sourceId, period.start, period.end, 'onchange'),
            ]);
            const overlapMs = computeOverlapMs(windowPoints, heatingPoints, period.start, period.end);
            if (overlapMs >= OVERLAP_THRESHOLD_MS) {
                candidates.push({
                    room,
                    reason: 'window_open_while_heating',
                    windowSourceId: windowEntry.sourceId,
                    windowDescription: windowEntry.description,
                    heatingSourceId: heatingEntry.sourceId,
                    heatingDescription: heatingEntry.description,
                    overlapMs,
                    periodStart: period.start,
                    periodEnd: period.end,
                });
            }
        } catch (error) {
            failedCount++;
            if (adapter.log && adapter.log.warn) {
                adapter.log.warn(`HVAC-Korrelation fuer Raum '${room}' fehlgeschlagen: ${error.message}`);
            }
        }
    }

    return { candidates, failedCount };
}

module.exports = { computeOverlapMs, findHvacCorrelationCandidates };
```

- [ ] **Schritt 4:** `npx mocha test/unit/hvacCorrelation.test.js` → PASS.

## Task 4: Integration in `main.js`

**Dateien:**
- Ändern: `main.js`
- Test: `test/unit/main.test.js`

- [ ] **Schritt 1: Rote Tests** — `loadMainWithProactiveStubs` erweitern um
      optionale HVAC-Stubs, neue Tests ergänzen:

```js
function loadMainWithProactiveStubs({ candidates, runAgent, hvacCandidates, hvacFailedCount } = {}) {
    const appendChatMessage = sinon.stub().resolves();
    const recordUsage = sinon.stub().resolves();
    const findAnomalyCandidates = sinon.stub().resolves(candidates || []);
    const findHvacCorrelationCandidates = sinon.stub().resolves({ candidates: hvacCandidates || [], failedCount: hvacFailedCount || 0 });
    const isEligibleCatalogEntry = sinon.stub().returns(true);
    const isBudgetExceeded = sinon.stub().resolves(false);
    const { AiAnalytics: TestAdapter } = proxyquire.noCallThru()('../../main', {
        '@iobroker/adapter-core': { Adapter: class {} },
        './lib/anomalyDetector': { findAnomalyCandidates, isEligibleCatalogEntry },
        './lib/hvacCorrelation': { findHvacCorrelationCandidates },
        './lib/catalog': { getAllCatalogEntries: sinon.stub().resolves([]), setCatalogEntry: sinon.stub(), markInactive: sinon.stub() },
        './lib/usage': { isBudgetExceeded, recordUsage },
        './lib/chatLog': { appendChatMessage, ensureChatHistoryState: sinon.stub(), getRecentChatHistory: sinon.stub() },
        './lib/historyHealth': { consumeFailureReports: sinon.stub().resolves([]), ensureHealthState: sinon.stub() },
        './lib/promptContext': { buildTimeAndLocationContext: sinon.stub().resolves('Zeitkontext\n') },
        './lib/agent': { MAX_ITERATIONS: 3, runAgent: runAgent || sinon.stub().resolves({ finalText: 'Auffaelligkeit gefunden.', usage: {} }) },
    });
    return { TestAdapter, appendChatMessage, findAnomalyCandidates, findHvacCorrelationCandidates, recordUsage, runAgent };
}
```

(Ersetzt die bestehende Funktionsdefinition komplett — nur die
`hvacCorrelation`-Stub-Zeile und der erweiterte Parameter/Rückgabewert sind
neu.)

Neue Tests, nach dem bestehenden `'reports an incomplete check...'`-Test:

```js
it('merges HVAC correlation candidates with the statistical candidates', async () => {
    const hvacCandidates = [{ room: 'Wohnzimmer', reason: 'window_open_while_heating', overlapMs: 1200000 }];
    const loaded = loadMainWithProactiveStubs({ hvacCandidates });
    const adapter = makeAdapter(loaded.TestAdapter);

    const result = await adapter.runProactiveCheck();

    expect(result).to.deep.equal({ skipped: false });
    expect(loaded.findHvacCorrelationCandidates.calledOnce).to.equal(true);
});

it('combines statistical and HVAC failure counts into one incomplete report', async () => {
    const candidates = [];
    Object.defineProperty(candidates, 'failedCount', { value: 1 });
    const loaded = loadMainWithProactiveStubs({ candidates, hvacFailedCount: 2 });
    const adapter = makeAdapter(loaded.TestAdapter);

    const result = await adapter.runProactiveCheck();

    expect(result).to.deep.include({ skipped: false, incomplete: true, failedCount: 3 });
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/main.test.js` → FAIL (neue Tests;
      bestehende Tests bleiben grün, da die reale `hvacCorrelation.js`
      gegen den leeren Katalog-Stub keine Kandidaten liefert).

- [ ] **Schritt 3: Implementieren** — in `main.js`:

Import ergänzen (nach der `anomalyDetector`-Zeile):

```js
const { findHvacCorrelationCandidates } = require('./lib/hvacCorrelation');
```

In `executeProactiveCheck`, den bestehenden Block ersetzen:

```js
        let anomalyCandidates = [];
        let totalFailedCount = 0;
        let preAnalysisError = null;
        try {
            const catalogEntries = await getAllCatalogEntries(this);
            const eligibleCount = catalogEntries.filter(isEligibleCatalogEntry).length;
            await this.updateCatalogSyncState({
                phase: 'check',
                processed: 0,
                total: eligibleCount,
                currentSourceId: null,
                message: `Statistische Voranalyse läuft ... 0/${eligibleCount}`,
            });
            anomalyCandidates = await findAnomalyCandidates(this, catalogEntries, Date.now(), progress =>
                this.updateCatalogSyncState({
                    phase: 'check',
                    processed: progress.processed,
                    total: progress.total,
                    currentSourceId: progress.currentSourceId,
                    message: progress.message,
                })
            );
            totalFailedCount += anomalyCandidates.failedCount || 0;

            try {
                const hvacResult = await findHvacCorrelationCandidates(this, catalogEntries, Date.now());
                anomalyCandidates = [...anomalyCandidates, ...hvacResult.candidates];
                totalFailedCount += hvacResult.failedCount || 0;
            } catch (error) {
                this.log.warn(`HVAC-Korrelation fehlgeschlagen: ${error.message}`);
            }
        } catch (error) {
            preAnalysisError = error;
            this.log.warn(`Statistische Anomalievoranalyse fehlgeschlagen: ${error.message}`);
        }

        if (anomalyCandidates.length === 0 && (preAnalysisError || totalFailedCount > 0)) {
            await this.appendHistoryFailureReports();
            const failedCount = totalFailedCount || 1;
            const finalText = `Prüfung unvollständig: ${failedCount} Datenreihe(n) konnten nicht gelesen werden.`;
            await appendChatMessage(this, 'assistant', finalText);
            await this.updateCatalogSyncState({
                running: false,
                phase: 'error',
                processed: MAX_ITERATIONS,
                total: MAX_ITERATIONS,
                message: finalText,
                finishedAt: new Date().toISOString(),
            });
            return { skipped: false, incomplete: true, failedCount };
        }
```

(Der nachfolgende Code — `if (anomalyCandidates.length === 0) {...}` und der
LLM-Aufruf — bleibt unverändert; er liest nur `anomalyCandidates`, nicht die
alte Hidden-Property.)

Systemprompt-Zusatz (im bestehenden String, nach dem Satz über
Zähler/`boolean_state`):

```js
                    'Kandidaten koennen auch raumbezogene Korrelationen enthalten (reason: "window_open_while_heating" — ' +
                    'Fenster war laengere Zeit offen, waehrend die Heizung im selben Raum lief). ' +
```

- [ ] **Schritt 4:** `npx mocha test/unit/main.test.js` → PASS.

## Task 5: Onboarding-Heuristik für `hvacRole`

**Dateien:**
- Ändern: `lib/onboarding.js`
- Test: `test/unit/onboarding.test.js`

**Interfaces:**
- Neue Funktion `suggestHvacRoles(entries) => Array<{ sourceId, hvacRole }>`
  (rein synchron, keine Seiteneffekte).

- [ ] **Schritt 1: Roten Test schreiben**:

```js
describe('suggestHvacRoles', () => {
    const { suggestHvacRoles } = require('../../lib/onboarding');

    function windowCandidate(overrides = {}) {
        return { sourceId: 'contact.0.window', description: 'Fensterkontakt Wohnzimmer', room: 'Wohnzimmer', valueKind: 'boolean_state', hvacRole: undefined, ...overrides };
    }
    function heatingCandidate(overrides = {}) {
        return { sourceId: 'relay.0.heating', description: 'Heizungsventil Wohnzimmer', room: 'Wohnzimmer', valueKind: 'boolean_state', hvacRole: undefined, ...overrides };
    }

    it('suggests window/heating roles for an unambiguous room', () => {
        const result = suggestHvacRoles([windowCandidate(), heatingCandidate()]);
        expect(result).to.deep.equal([
            { sourceId: 'contact.0.window', hvacRole: 'window' },
            { sourceId: 'relay.0.heating', hvacRole: 'heating' },
        ]);
    });

    it('suggests nothing for a room with two window candidates', () => {
        const result = suggestHvacRoles([windowCandidate(), windowCandidate({ sourceId: 'contact.0.window2' }), heatingCandidate()]);
        expect(result).to.deep.equal([]);
    });

    it('suggests nothing for entries that already have an hvacRole', () => {
        const result = suggestHvacRoles([windowCandidate({ hvacRole: 'window' }), heatingCandidate()]);
        expect(result).to.deep.equal([]);
    });

    it('handles multiple unambiguous rooms independently', () => {
        const result = suggestHvacRoles([
            windowCandidate(),
            heatingCandidate(),
            windowCandidate({ sourceId: 'contact.1.window', room: 'Kueche' }),
            heatingCandidate({ sourceId: 'relay.1.heating', room: 'Kueche' }),
        ]);
        expect(result).to.have.lengthOf(4);
    });
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/onboarding.test.js` → FAIL.

- [ ] **Schritt 3: Implementieren** — in `lib/onboarding.js`, nach
      `suggestSelfConsumptionPair`:

```js
const WINDOW_NAME_PATTERN = /fenster|kontakt|window/i;
const HEATING_NAME_PATTERN = /heizung|thermostat|ventil|heating/i;

function isHvacRoleCandidate(entry) {
    return Boolean(entry && !entry.hvacRole && entry.valueKind === 'boolean_state' && entry.room);
}

/**
 * Rein namensbasierte Heuristik (kein LLM-Aufruf): schlaegt hvacRole pro
 * Raum nur bei genau einem eindeutigen Kandidaten je Rolle vor.
 */
function suggestHvacRoles(entries) {
    const byRoom = new Map();
    for (const entry of (entries || []).filter(isHvacRoleCandidate)) {
        if (!byRoom.has(entry.room)) byRoom.set(entry.room, []);
        byRoom.get(entry.room).push(entry);
    }
    const suggestions = [];
    for (const roomEntries of byRoom.values()) {
        const windows = roomEntries.filter((entry) => WINDOW_NAME_PATTERN.test(`${entry.description || ''} ${entry.sourceId}`));
        const heatings = roomEntries.filter((entry) => HEATING_NAME_PATTERN.test(`${entry.description || ''} ${entry.sourceId}`));
        if (windows.length !== 1 || heatings.length !== 1) continue;
        if (windows[0].sourceId === heatings[0].sourceId) continue;
        suggestions.push({ sourceId: windows[0].sourceId, hvacRole: 'window' });
        suggestions.push({ sourceId: heatings[0].sourceId, hvacRole: 'heating' });
    }
    return suggestions;
}
```

Aufruf am Ende von `runOnboarding`, im selben `try`-Block wie
`suggestSelfConsumptionPair` (nach dem bestehenden PV-Block, `allEntries`
wiederverwenden):

```js
        const hvacSuggestions = suggestHvacRoles(allEntries);
        for (const { sourceId, hvacRole } of hvacSuggestions) {
            const target = allEntries.find((entry) => entry.sourceId === sourceId);
            if (target) await setCatalogEntry(adapter, { ...target, hvacRole });
        }
        if (hvacSuggestions.length && adapter.log && adapter.log.info) {
            adapter.log.info(`Onboarding: ${hvacSuggestions.length / 2} HVAC-Raumpaar(e) vorgeschlagen, sichtbar/aenderbar im Geraete-Tab.`);
        }
```

(Platzierung: direkt nach dem bestehenden PV-Eigenverbrauch-Block, innerhalb
desselben `try`, vor dessen `catch`.)

Export ergänzen: `suggestHvacRoles` zu `module.exports` hinzufügen.

- [ ] **Schritt 4:** `npx mocha test/unit/onboarding.test.js` → PASS.

## Task 6: Admin-UI — CSV-Spalte für `hvacRole`

**Dateien:**
- Ändern: `src-admin/src/Components.jsx`
- Test: `test/admin/csvHelpers.test.jsx`

- [ ] **Schritt 1: Roter Test**:

```js
expect(validateCatalogImportValue('hvacRole', 'window')).toBe('window');
expect(() => validateCatalogImportValue('hvacRole', 'unknown')).toThrow('hvacRole');
```

- [ ] **Schritt 2:** `npx vitest run test/admin/csvHelpers.test.jsx` → FAIL.

- [ ] **Schritt 3: Implementieren**:

```js
const HVAC_ROLES = ['window', 'heating'];
```

`CSV_COLUMNS`/`CSV_EDITABLE_COLUMNS` um `'hvacRole'` ergänzen.
`validateCatalogImportValue`, neue Zeile:

```js
    if (field === 'hvacRole' && !HVAC_ROLES.includes(value)) throw new Error(`Ungültige hvacRole: ${value}`);
```

- [ ] **Schritt 4:** `npx vitest run test/admin/csvHelpers.test.jsx` → PASS.

## Abschlussverifikation

- [ ] `npm test` (Unit + Admin) grün.
- [ ] `npm run lint` grün.
- [ ] `npm run build:admin` grün.
- [ ] Diff-Review: Phase-1/2-Anomalieerkennung (`lib/anomalyDetector.js`)
      unverändert — HVAC-Korrelation lebt vollständig in
      `lib/hvacCorrelation.js`.
