# Abgeleitete Kennzahlen (Laufzeit + Eigenverbrauch) — Implementierungsplan

Spec: `docs/specs/2026-09-04-abgeleitete-kennzahlen-laufzeit-eigenverbrauch.md`

Umgesetzt inline in der laufenden Session (voller Kontext bereits vorhanden).
TDD pro Schritt.

## Global Constraints

- `derivedMetricRole` ∈ `{'pv_generation', 'grid_feed_in'}` oder `undefined`.
- `derivedMetricGroupId`: String, max. 128 Zeichen, nur zusammen mit
  `derivedMetricRole` gesetzt (beide oder keines).
- Beide Partner einer Gruppe müssen zählerartig sein
  (`daily_reset_counter`/`cumulative_total`/`event_count`) — keine `gauge`.
- Laufzeit braucht keinen Code (bereits über `getPeriodTotal` verfügbar) —
  nur eine manuelle Verifikation, kein Task unten.

---

## Task 1: Katalog-Validierung für `derivedMetricRole`/`derivedMetricGroupId`

**Dateien:**
- Ändern: `lib/catalog.js`
- Test: `test/unit/catalog.test.js`

- [ ] **Schritt 1: Rote Tests schreiben**

```js
it('accepts a valid derivedMetricRole/derivedMetricGroupId pair', () => {
    const entry = validateCatalogEntry({
        sourceId: 'x', category: 'generation_pv',
        derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1',
    });
    expect(entry.derivedMetricRole).to.equal('pv_generation');
});

it('rejects an unknown derivedMetricRole', () => {
    expect(() => validateCatalogEntry({
        sourceId: 'x', category: 'generation_pv',
        derivedMetricRole: 'not-a-role', derivedMetricGroupId: 'pv-1',
    })).to.throw('derivedMetricRole');
});

it('rejects derivedMetricRole without derivedMetricGroupId and vice versa', () => {
    expect(() => validateCatalogEntry({
        sourceId: 'x', category: 'generation_pv', derivedMetricRole: 'pv_generation',
    })).to.throw('derivedMetricRole');
    expect(() => validateCatalogEntry({
        sourceId: 'x', category: 'generation_pv', derivedMetricGroupId: 'pv-1',
    })).to.throw('derivedMetricGroupId');
});

it('rejects an oversized derivedMetricGroupId', () => {
    expect(() => validateCatalogEntry({
        sourceId: 'x', category: 'generation_pv',
        derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'x'.repeat(129),
    })).to.throw('derivedMetricGroupId');
});
```

(Import `validateCatalogEntry` zusätzlich in den bestehenden
`require('../../lib/catalog')`-Aufruf am Kopf der Datei — bereits exportiert,
nur noch nicht importiert.)

- [ ] **Schritt 2:** `npx mocha test/unit/catalog.test.js` → FAIL (Feld wird
      aktuell nicht geprüft, generische Objekt-Validierung lässt es aber
      durch, d. h. die "accepts"-Tests laufen ggf. schon grün, die
      "rejects"-Tests schlagen fehl).

- [ ] **Schritt 3: Implementieren** — in `lib/catalog.js`:

```js
const DERIVED_METRIC_ROLES = new Set(['pv_generation', 'grid_feed_in']);
const MAX_DERIVED_METRIC_GROUP_ID_LENGTH = 128;
```

In `validateCatalogEntry`, nach dem bestehenden `historyInstance`-Block:

```js
    const hasRole = entry.derivedMetricRole !== undefined;
    const hasGroupId = entry.derivedMetricGroupId !== undefined;
    if (hasRole !== hasGroupId) {
        throw new Error('derivedMetricRole und derivedMetricGroupId muessen zusammen gesetzt sein.');
    }
    if (hasRole && !DERIVED_METRIC_ROLES.has(entry.derivedMetricRole)) {
        throw new Error(`Unbekannte derivedMetricRole: ${entry.derivedMetricRole}`);
    }
    if (hasGroupId) {
        validateString(entry.derivedMetricGroupId, 'derivedMetricGroupId', MAX_DERIVED_METRIC_GROUP_ID_LENGTH, true);
    }
```

Export `DERIVED_METRIC_ROLES` zusätzlich in `module.exports`.

- [ ] **Schritt 4:** `npx mocha test/unit/catalog.test.js` → PASS.

## Task 2: `validateCatalogUpdate` (Admin-Pfad) erweitern

**Dateien:**
- Ändern: `lib/adminCommands.js`
- Test: `test/unit/adminCommands.test.js`

- [ ] **Schritt 1: Roten Test schreiben** (in den bestehenden
      `validateCatalogUpdate`-Describe-Block, Muster wie der bestehende
      `valueKind`-Test):

```js
it('rejects an unknown derivedMetricRole', () => {
    expect(() => validateCatalogUpdate({ sourceId: 'x', derivedMetricRole: 'nope', derivedMetricGroupId: 'g1' }))
        .to.throw('derivedMetricRole');
});

it('rejects derivedMetricGroupId without derivedMetricRole', () => {
    expect(() => validateCatalogUpdate({ sourceId: 'x', derivedMetricGroupId: 'g1' }))
        .to.throw('derivedMetricRole');
});

it('accepts a valid derivedMetricRole/derivedMetricGroupId pair', () => {
    expect(() => validateCatalogUpdate({ sourceId: 'x', derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'g1' }))
        .to.not.throw();
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/adminCommands.test.js` → FAIL.

- [ ] **Schritt 3: Implementieren** — in `lib/adminCommands.js`:

```js
const DERIVED_METRIC_ROLES = new Set(['pv_generation', 'grid_feed_in']);
const MAX_DERIVED_METRIC_GROUP_ID_LENGTH = 128;
```

In `validateCatalogUpdate`, nach der `dataCompleteness`-Zeile:

```js
    const hasRole = message.derivedMetricRole !== undefined;
    const hasGroupId = message.derivedMetricGroupId !== undefined;
    if (hasRole !== hasGroupId) throw new Error('derivedMetricRole und derivedMetricGroupId müssen zusammen gesetzt sein.');
    if (hasRole && !DERIVED_METRIC_ROLES.has(message.derivedMetricRole)) throw new Error('derivedMetricRole ist ungültig.');
    if (hasGroupId) validateStringField(message, 'derivedMetricGroupId', MAX_DERIVED_METRIC_GROUP_ID_LENGTH);
```

In `updateCatalogEntryAdminUnlocked`: Parameter-Destrukturierung und
`validateCatalogUpdate(...)`-Aufruf um `derivedMetricRole, derivedMetricGroupId`
ergänzen; nach dem bestehenden `dataCompleteness`-Block:

```js
    if (derivedMetricRole !== undefined) {
        updated.derivedMetricRole = derivedMetricRole;
    }
    if (derivedMetricGroupId !== undefined) {
        updated.derivedMetricGroupId = derivedMetricGroupId;
    }
```

- [ ] **Schritt 4:** `npx mocha test/unit/adminCommands.test.js` → PASS.

## Task 3: `getSelfConsumption`-Werkzeug in `lib/tools.js`

**Dateien:**
- Ändern: `lib/tools.js`
- Test: `test/unit/tools.test.js`

**Interfaces:**
- Konsumiert: `computePeriodValue(adapter, entry, period)`,
  `resolvePeriod(period, now)` aus `./periodValue`;
  `getAllCatalogEntries(adapter)` aus `./catalog`
- Produziert: `execute('getSelfConsumption', { groupId?, periods })` liefert
  `{ pvDescription, feedInDescription, room, periods: [{ start, end, pvTotal, feedInTotal, selfConsumptionRatio, note? }] }`

- [ ] **Schritt 1: Roten Test schreiben** (neuer `describe`-Block in
      `test/unit/tools.test.js`, Muster wie `getPeriodTotal`):

```js
describe('getSelfConsumption', () => {
    function pvEntry(overrides = {}) {
        return { sourceId: 'pv.0.total', historyInstance: 'history.0', description: 'PV-Erzeugung', room: 'Dach', valueKind: 'cumulative_total', derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1', ...overrides };
    }
    function feedInEntry(overrides = {}) {
        return { sourceId: 'grid.0.feedin', historyInstance: 'history.0', description: 'Netzeinspeisung', valueKind: 'cumulative_total', derivedMetricRole: 'grid_feed_in', derivedMetricGroupId: 'pv-1', ...overrides };
    }

    it('computes the self-consumption ratio for the single available group', async () => {
        const getHistory = sinon.stub();
        getHistory.onCall(0).resolves([{ val: 100 }]); // pv before (cumulative_total)
        getHistory.onCall(1).resolves([{ val: 1100 }]); // pv end of period
        getHistory.onCall(2).resolves([{ val: 20 }]); // feedIn before
        getHistory.onCall(3).resolves([{ val: 220 }]); // feedIn end of period
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([pvEntry(), feedInEntry()]),
            getHistory,
            getLocalDayBoundaries: (target) => ({ start: target - 1000, end: target }),
            getLocalTimeZone: sinon.stub().returns('UTC'),
        });
        const { execute } = buildTools({});

        const result = await execute('getSelfConsumption', { periods: [{ dayOffset: -1 }] });

        expect(result.periods).to.have.lengthOf(1);
        expect(result.periods[0]).to.include({ pvTotal: 1000, feedInTotal: 200 });
        expect(result.periods[0].selfConsumptionRatio).to.be.closeTo(0.8, 1e-9);
    });

    it('returns null ratio without dividing by zero when pvTotal is zero', async () => {
        const getHistory = sinon.stub().resolves([{ val: 0 }]);
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([pvEntry(), feedInEntry()]),
            getHistory,
            getLocalDayBoundaries: (target) => ({ start: target - 1000, end: target }),
            getLocalTimeZone: sinon.stub().returns('UTC'),
        });
        const { execute } = buildTools({});

        const result = await execute('getSelfConsumption', { periods: [{ dayOffset: -1 }] });

        expect(result.periods[0].selfConsumptionRatio).to.equal(null);
        expect(result.periods[0].note).to.be.a('string');
    });

    it('throws a clear error when no groupId is given and zero or multiple groups exist', async () => {
        const { buildTools } = loadToolsWithStubs({ getAllCatalogEntries: sinon.stub().resolves([]) });
        const { execute } = buildTools({});

        let threw;
        try {
            await execute('getSelfConsumption', { periods: [{ dayOffset: -1 }] });
        } catch (error) {
            threw = error;
        }
        expect(threw).to.exist;
        expect(threw.message).to.include('groupId');
    });

    it('throws when a group is missing one of the two required roles', async () => {
        const { buildTools } = loadToolsWithStubs({ getAllCatalogEntries: sinon.stub().resolves([pvEntry()]) });
        const { execute } = buildTools({});

        let threw;
        try {
            await execute('getSelfConsumption', { groupId: 'pv-1', periods: [{ dayOffset: -1 }] });
        } catch (error) {
            threw = error;
        }
        expect(threw.message).to.include('grid_feed_in');
    });
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/tools.test.js` → FAIL (Werkzeug
      existiert nicht).

- [ ] **Schritt 3: Implementieren** — in `lib/tools.js`:

Definition (in das `definitions`-Array einfügen, z. B. nach
`comparePeriods`):

```js
        {
            name: 'getSelfConsumption',
            description:
                'Berechnet die Eigenverbrauchsquote (Anteil der PV-Erzeugung, der nicht ins Netz eingespeist wurde) ' +
                'fuer ein per derivedMetricGroupId verknuepftes Objektpaar (PV-Erzeugung + Netzeinspeisung). ' +
                'groupId kann entfallen, wenn genau eine vollstaendige Gruppe im Katalog existiert.',
            inputSchema: {
                type: 'object',
                properties: {
                    groupId: { type: 'string' },
                    periods: {
                        type: 'array',
                        minItems: 1,
                        maxItems: limits.maxPeriodsPerToolCall || MAX_PERIODS_PER_CALL,
                        items: {
                            type: 'object',
                            properties: { start: { type: 'integer' }, end: { type: 'integer' }, dayOffset: { type: 'integer' } },
                            additionalProperties: false,
                        },
                    },
                },
                required: ['periods'],
                additionalProperties: false,
            },
        },
```

`validateInput` (neuer Zweig, nach `getPeriodTotal`/`comparePeriods`):

```js
    if (name === 'getSelfConsumption') {
        assertObject(input, name, ['groupId', 'periods']);
        assertOwn(input, ['periods'], name);
        if (input.groupId !== undefined) assertString(input.groupId, 'groupId', { maxLength: 128 });
        const maxPeriodsPerCall = limits.maxPeriodsPerToolCall || MAX_PERIODS_PER_CALL;
        if (!Array.isArray(input.periods) || input.periods.length === 0 || input.periods.length > maxPeriodsPerCall) {
            throw new Error(`Zu viele Zeitraeume in diesem Werkzeug: Limit ${maxPeriodsPerCall}.`);
        }
        input.periods.forEach((period, index) => validatePeriod(period, `periods[${index}]`));
        return input;
    }
```

Hilfsfunktion (vor `execute`, analog zu `findCatalogEntry`):

```js
    async function findSelfConsumptionPair(groupId) {
        const entries = await getAllCatalogEntries(adapter);
        const grouped = entries.filter((entry) => entry.derivedMetricGroupId && (groupId === undefined || entry.derivedMetricGroupId === groupId));
        const groupIds = groupId !== undefined ? [groupId] : [...new Set(grouped.map((entry) => entry.derivedMetricGroupId))];
        if (groupIds.length === 0) {
            const available = [...new Set(entries.filter((entry) => entry.derivedMetricGroupId).map((entry) => entry.derivedMetricGroupId))];
            throw new Error(`Keine groupId angegeben und keine Eigenverbrauchs-Gruppe im Katalog vorhanden. Verfuegbare groupIds: ${available.join(', ') || 'keine'}.`);
        }
        if (groupIds.length > 1) {
            throw new Error(`Mehrere Eigenverbrauchs-Gruppen im Katalog, groupId erforderlich: ${groupIds.join(', ')}.`);
        }
        const [resolvedGroupId] = groupIds;
        const members = entries.filter((entry) => entry.derivedMetricGroupId === resolvedGroupId);
        const pv = members.find((entry) => entry.derivedMetricRole === 'pv_generation');
        const feedIn = members.find((entry) => entry.derivedMetricRole === 'grid_feed_in');
        if (!pv) throw new Error(`Gruppe ${resolvedGroupId} hat kein Objekt mit derivedMetricRole 'pv_generation'.`);
        if (!feedIn) throw new Error(`Gruppe ${resolvedGroupId} hat kein Objekt mit derivedMetricRole 'grid_feed_in'.`);
        return { pv, feedIn };
    }
```

`execute`-Zweig (nach `getPeriodTotal`/`comparePeriods`-Block):

```js
    if (name === 'getSelfConsumption') {
        const { pv, feedIn } = await findSelfConsumptionPair(input.groupId);
        const periods = [];
        for (const rawPeriod of input.periods) {
            const period = resolvePeriod(rawPeriod);
            const [pvValue, feedInValue] = await Promise.all([
                computePeriodValue(adapter, pv, period),
                computePeriodValue(adapter, feedIn, period),
            ]);
            const pvTotal = pvValue.total;
            const feedInTotal = feedInValue.total;
            const selfConsumptionRatio = pvTotal > 0 ? (pvTotal - feedInTotal) / pvTotal : null;
            const entry = { start: period.start, end: period.end, pvTotal, feedInTotal, selfConsumptionRatio };
            if (selfConsumptionRatio === null) entry.note = 'Keine PV-Erzeugung in diesem Zeitraum.';
            periods.push(entry);
        }
        return { pvDescription: pv.description, feedInDescription: feedIn.description, room: pv.room, periods };
    }
```

- [ ] **Schritt 4:** `npx mocha test/unit/tools.test.js` → PASS.

## Task 4: Onboarding-Heuristik für automatische Paar-Vorschläge

**Dateien:**
- Ändern: `lib/onboarding.js`
- Test: `test/unit/onboarding.test.js`

**Interfaces:**
- Neue interne Funktion `suggestSelfConsumptionPair(entries)` gibt entweder
  `null` oder `{ pvSourceId, feedInSourceId }` zurück (rein synchron, keine
  Seiteneffekte — leicht isoliert testbar).

- [ ] **Schritt 1: Roten Test schreiben** (neuer `describe`-Block):

```js
const { suggestSelfConsumptionPair } = require('../../lib/onboarding');

describe('suggestSelfConsumptionPair', () => {
    function pvCandidate(overrides = {}) {
        return { sourceId: 'pv.0.total', description: 'PV Erzeugung gesamt', category: 'generation_pv', valueKind: 'cumulative_total', derivedMetricGroupId: undefined, ...overrides };
    }
    function feedInCandidate(overrides = {}) {
        return { sourceId: 'grid.0.feedin', description: 'Netzeinspeisung', category: 'consumption', valueKind: 'cumulative_total', derivedMetricGroupId: undefined, ...overrides };
    }

    it('suggests a pair when exactly one candidate exists for each role', () => {
        const result = suggestSelfConsumptionPair([pvCandidate(), feedInCandidate()]);
        expect(result).to.deep.equal({ pvSourceId: 'pv.0.total', feedInSourceId: 'grid.0.feedin' });
    });

    it('suggests nothing when a candidate is a gauge instead of a counter kind', () => {
        const result = suggestSelfConsumptionPair([pvCandidate({ valueKind: 'gauge' }), feedInCandidate()]);
        expect(result).to.equal(null);
    });

    it('suggests nothing when multiple pv candidates exist (ambiguous)', () => {
        const result = suggestSelfConsumptionPair([pvCandidate(), pvCandidate({ sourceId: 'pv.1.total' }), feedInCandidate()]);
        expect(result).to.equal(null);
    });

    it('suggests nothing when a candidate already has a derivedMetricGroupId', () => {
        const result = suggestSelfConsumptionPair([pvCandidate({ derivedMetricGroupId: 'existing' }), feedInCandidate()]);
        expect(result).to.equal(null);
    });

    it('suggests nothing when no feed-in candidate exists', () => {
        const result = suggestSelfConsumptionPair([pvCandidate()]);
        expect(result).to.equal(null);
    });
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/onboarding.test.js` → FAIL
      (Funktion existiert nicht / nicht exportiert).

- [ ] **Schritt 3: Implementieren** — in `lib/onboarding.js`, vor
      `runOnboarding`:

```js
const COUNTER_VALUE_KINDS = new Set(['daily_reset_counter', 'cumulative_total', 'event_count']);
const FEED_IN_NAME_PATTERN = /einspeisung|feed[-_ ]?in|export/i;

function isDerivedMetricCandidate(entry) {
    return Boolean(entry && !entry.derivedMetricGroupId && COUNTER_VALUE_KINDS.has(entry.valueKind));
}

function suggestSelfConsumptionPair(entries) {
    const pvCandidates = (entries || []).filter((entry) => isDerivedMetricCandidate(entry) && entry.category === 'generation_pv');
    const feedInCandidates = (entries || []).filter((entry) => isDerivedMetricCandidate(entry) && FEED_IN_NAME_PATTERN.test(`${entry.description || ''} ${entry.sourceId}`));
    if (pvCandidates.length !== 1 || feedInCandidates.length !== 1) return null;
    if (pvCandidates[0].sourceId === feedInCandidates[0].sourceId) return null;
    return { pvSourceId: pvCandidates[0].sourceId, feedInSourceId: feedInCandidates[0].sourceId };
}
```

Am Ende von `runOnboarding`, vor `return { classifiedCount, needsReview };`:

```js
    try {
        const allEntries = await getAllCatalogEntries(adapter);
        const suggestion = suggestSelfConsumptionPair(allEntries);
        if (suggestion) {
            const groupId = `derived-${suggestion.pvSourceId}`;
            const pvEntry = allEntries.find((entry) => entry.sourceId === suggestion.pvSourceId);
            const feedInEntry = allEntries.find((entry) => entry.sourceId === suggestion.feedInSourceId);
            await setCatalogEntry(adapter, { ...pvEntry, derivedMetricRole: 'pv_generation', derivedMetricGroupId: groupId });
            await setCatalogEntry(adapter, { ...feedInEntry, derivedMetricRole: 'grid_feed_in', derivedMetricGroupId: groupId });
            if (adapter.log && adapter.log.info) {
                adapter.log.info(`Onboarding: Eigenverbrauchs-Paar vorgeschlagen (${suggestion.pvSourceId} + ${suggestion.feedInSourceId}), sichtbar/aenderbar im Geraete-Tab.`);
            }
        }
    } catch (error) {
        if (adapter.log && adapter.log.warn) {
            adapter.log.warn(`Vorschlag fuer Eigenverbrauchs-Paar fehlgeschlagen: ${error.message}`);
        }
    }
```

Export ergänzen: `module.exports = { runOnboarding, buildClassificationPrompt, parseClassificationResponse, validateClassificationResults, adapterTypeOf, buildBatches, suggestSelfConsumptionPair };`

**Hinweis:** Dieser Schritt läuft bei **jedem** Onboarding-Lauf (nicht nur
bei neu entdeckten Objekten), da die Heuristik den *gesamten* aktuellen
Katalog braucht, um Eindeutigkeit zu prüfen. Ein zusätzlicher Test stellt
sicher, dass er bei leerem `unclassified` (keine neuen Objekte) trotzdem
läuft:

```js
it('still runs the self-consumption suggestion even with no newly discovered objects', async () => {
    const setCatalogEntry = sinon.stub().resolves();
    const { runOnboarding } = loadOnboardingWithStubs({
        getAllCatalogEntries: sinon.stub().resolves([
            { sourceId: 'pv.0.total', description: 'PV Erzeugung', category: 'generation_pv', valueKind: 'cumulative_total' },
            { sourceId: 'grid.0.feedin', description: 'Netzeinspeisung', category: 'consumption', valueKind: 'cumulative_total' },
        ]),
        setCatalogEntry,
    });

    await runOnboarding({ log: {} }, {}, []);

    expect(setCatalogEntry.callCount).to.equal(2);
    const [, pvUpdate] = setCatalogEntry.getCalls()[0].args;
    expect(pvUpdate.derivedMetricRole).to.equal('pv_generation');
});
```

- [ ] **Schritt 4:** `npx mocha test/unit/onboarding.test.js` → PASS.

## Task 5: Admin-UI — CSV-Spalten

**Dateien:**
- Ändern: `src-admin/src/Components.jsx`
- Test: `test/admin/csvHelpers.test.jsx`

- [ ] **Schritt 1: Roten Test schreiben** (in `test/admin/csvHelpers.test.jsx`,
      neuer Fall in der bestehenden `'strictly validates catalog enum and
      boolean values'`-it oder eigene it):

```js
it('validates the derivedMetricRole enum for CSV import', () => {
    expect(validateCatalogImportValue('derivedMetricRole', 'pv_generation')).toBe('pv_generation');
    expect(() => validateCatalogImportValue('derivedMetricRole', 'unknown')).toThrow('derivedMetricRole');
});
```

- [ ] **Schritt 2:** `npx vitest run test/admin/csvHelpers.test.jsx` → FAIL.

- [ ] **Schritt 3: Implementieren** — in `src-admin/src/Components.jsx`:

```js
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in'];
```

`CSV_COLUMNS`/`CSV_EDITABLE_COLUMNS` um `'derivedMetricRole', 'derivedMetricGroupId'`
ergänzen. `validateCatalogImportValue`, neue Zeile nach dem
`valueKind`-Fall:

```js
    if (field === 'derivedMetricRole' && !DERIVED_METRIC_ROLES.includes(value)) throw new Error(`Ungültige derivedMetricRole: ${value}`);
```

- [ ] **Schritt 4:** `npx vitest run test/admin/csvHelpers.test.jsx` → PASS.

## Abschlussverifikation

- [ ] `npm test` (Unit + Admin) grün.
- [ ] `npm run lint` grün.
- [ ] `npm run build:admin` grün (Components.jsx geändert).
- [ ] Manuell: Chat-Frage zur Laufzeit eines `boolean_state`-Objekts über
      `getPeriodTotal` funktioniert bereits (kein Code, nur Beobachtung) —
      im WORKLOG vermerken.
- [ ] Diff-Review: `detectSeriesAnomaly`/Phase-1-Verhalten unberührt (dieser
      Task betrifft nur Katalog/Tools/Onboarding/Admin-UI, keine
      Anomalieerkennung).
