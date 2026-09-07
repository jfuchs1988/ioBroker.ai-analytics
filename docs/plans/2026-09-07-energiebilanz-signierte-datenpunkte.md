# Energiebilanz — signierte Datenpunkte, Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verhindert stille `NaN`-Ergebnisse in der Energiebilanz-Anomalieerkennung durch falsch typisierte Rollenzuweisungen, ergänzt zwei neue Spitzenlast-Rollen (`grid_power`/`battery_power`) für signierte Momentanleistungswerte, und lässt das KI-Onboarding passende Rollen (Energiebilanz + HVAC) je Adapter-Instanz vorschlagen statt sie ausschließlich manuell zu pflegen.

**Architecture:** Eine neue, gemeinsame Validierungsregel (`isDerivedMetricRoleValueKindValid`/`isHvacRoleValueKindValid` in `lib/catalog.js`) wird an drei Stellen wiederverwendet: der kanonischen Katalog-Validierung, der Admin-Message-Bus-Validierung und der neuen Onboarding-Vorprüfung — letztere verhindert, dass ein inkompatibler KI-Rollenvorschlag den kompletten Katalogeintrag zum Scheitern bringt. Fünf duplizierte `DERIVED_METRIC_ROLES`-Literale (Backend + Frontend) werden um zwei Werte erweitert. Kein neuer Berechnungscode für die Bilanz selbst — `grid_power`/`battery_power` sind reine Auffindbarkeits-Rollen, `getPeriodTotal` liefert für `gauge` bereits `min`/`max`.

**Tech Stack:** Node.js/CommonJS (Backend, `lib/*.js`), React 18 Klassenkomponenten (`src-admin/src/CatalogDevices/*.jsx`), Mocha/Chai/Sinon/Proxyquire (Backend-Tests), Vitest/Testing-Library (Admin-Tests).

**Spec:** [docs/specs/2026-09-07-energiebilanz-signierte-datenpunkte.md](../specs/2026-09-07-energiebilanz-signierte-datenpunkte.md)

## Global Constraints

- Times passed to history tools are Unix milliseconds (unverändert, nicht Teil dieser Änderung, aber gilt weiter für `lib/tools.js`).
- Keine hartkodierten Adapter-/Namens-Heuristiken im Code (`docs/architecture/11-risiken-und-schulden.md:7-15`) — Rollenvorschläge laufen ausschließlich über das KI-Onboarding (Sprachverständnis der bestehenden LLM-Klassifikation), niemals über `sourceId.startsWith(...)` o. Ä.
- `npm test` (= `npm run test:unit && npm run test:admin`) muss vor jedem Commit grün sein. `npm run lint` und `npm run build:admin` gehören zur Abschlussverifikation.
- TDD: jeder Verhaltens-Task beginnt mit einem fehlschlagenden Test.
- Bestehende, jetzt mit der neuen Regel kollidierende Tests werden **angepasst**, nicht gelöscht — sie testen weiterhin ihr ursprüngliches Verhalten, nur mit einem zusätzlich gesetzten `valueKind`, das die neue Regel erfüllt.
- proxyquire (in `test/unit/adminCommands.test.js` und `test/unit/onboarding.test.js`) ruft für jede im Stub-Objekt NICHT explizit überschriebene Eigenschaft automatisch die echte Implementierung aus `lib/catalog.js` auf ("call-thru", proxyquire-Standardverhalten). Die neuen Exporte (`isDerivedMetricRoleValueKindValid`, `isHvacRoleValueKindValid`, `DERIVED_METRIC_ROLES`, `HVAC_ROLES`, `GAUGE_DERIVED_METRIC_ROLES`) müssen deshalb in keinem der beiden Test-Stub-Objekte zusätzlich nachgezogen werden.

---

### Task 1: `lib/catalog.js` — gemeinsame Rollen-/valueKind-Validierung (Sektion A + B der Spec)

**Files:**
- Modify: `lib/catalog.js:1-12` (Konstanten), `lib/catalog.js:50-68` (Validierungsblock in `validateCatalogEntry`), `lib/catalog.js:145-156` (`module.exports`)
- Test: `test/unit/catalog.test.js:184-239` (drei bestehende Tests anpassen, neue Tests ergänzen)

**Interfaces:**
- Produces: `isDerivedMetricRoleValueKindValid(role, valueKind): boolean`, `isHvacRoleValueKindValid(valueKind): boolean`, erweitertes `DERIVED_METRIC_ROLES` (Set, jetzt 8 Werte inkl. `grid_power`/`battery_power`), neues `GAUGE_DERIVED_METRIC_ROLES` (Set: `grid_power`, `battery_power`) — alle aus `lib/catalog.js` exportiert, von Task 2 (`lib/adminCommands.js`) und Task 7 (`lib/onboarding.js`) konsumiert.
- Consumes: nichts Neues (nur bestehende `validateString`, `hasControlCharacter`).

- [ ] **Step 1: Drei bestehende Tests an die kommende Regel anpassen (sie brechen sonst aus einem anderen Grund als beabsichtigt)**

In `test/unit/catalog.test.js`, ersetze die drei Tests bei Zeile 184-220:

```js
    it('accepts a valid derivedMetricRole/derivedMetricGroupId pair', () => {
        const entry = validateCatalogEntry({
            sourceId: 'x', category: 'generation_pv', valueKind: 'daily_reset_counter',
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
            sourceId: 'x', category: 'generation_pv', valueKind: 'daily_reset_counter',
            derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'x'.repeat(129),
        })).to.throw('derivedMetricGroupId');
    });

    it('accepts the new energy balance roles', () => {
        for (const role of ['grid_import', 'battery_charge', 'battery_discharge', 'consumption']) {
            const entry = validateCatalogEntry({ sourceId: 'x', category: 'consumption', valueKind: 'daily_reset_counter', derivedMetricRole: role, derivedMetricGroupId: 'energy-1' });
            expect(entry.derivedMetricRole).to.equal(role);
        }
    });
```

(Nur `valueKind: 'daily_reset_counter'` wurde zu den drei Fällen hinzugefügt, die eine der sechs Bilanz-Rollen mit gültiger Rolle/Gruppe testen — die drei reinen Reject-Fälle für unbekannte Rolle/fehlende Kopplung brauchen keinen `valueKind`, da sie schon vorher werfen.)

- [ ] **Step 2: Tests ausführen, erwarteter Zustand: weiterhin grün (reine Vorbereitung, noch keine Verhaltensänderung)**

Run: `npx mocha test/unit/catalog.test.js`
Expected: alle bestehenden Tests PASS (Code in `lib/catalog.js` ist noch unverändert).

- [ ] **Step 3: Neue fehlschlagende Tests für die Sektion-A-Sperre schreiben**

Füge in `test/unit/catalog.test.js` nach dem `'accepts the new energy balance roles'`-Test (vor dem hvacRole-Block) ein:

```js
    it('rejects a balance role on a gauge-kind entry', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'consumption', valueKind: 'gauge',
            derivedMetricRole: 'grid_import', derivedMetricGroupId: 'energy-1',
        })).to.throw('grid_import');
    });

    it('rejects a balance role when valueKind is not yet classified', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'consumption',
            derivedMetricRole: 'battery_charge', derivedMetricGroupId: 'energy-1',
        })).to.throw('battery_charge');
    });

    it('accepts a balance role on a cumulative_total entry', () => {
        const entry = validateCatalogEntry({
            sourceId: 'x', category: 'consumption', valueKind: 'cumulative_total',
            derivedMetricRole: 'grid_feed_in', derivedMetricGroupId: 'energy-1',
        });
        expect(entry.derivedMetricRole).to.equal('grid_feed_in');
    });

    it('accepts grid_power/battery_power only on a gauge entry', () => {
        for (const role of ['grid_power', 'battery_power']) {
            const entry = validateCatalogEntry({ sourceId: 'x', category: 'consumption', valueKind: 'gauge', derivedMetricRole: role, derivedMetricGroupId: 'energy-1' });
            expect(entry.derivedMetricRole).to.equal(role);
        }
    });

    it('rejects grid_power/battery_power on a counter entry', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'consumption', valueKind: 'daily_reset_counter',
            derivedMetricRole: 'grid_power', derivedMetricGroupId: 'energy-1',
        })).to.throw('grid_power');
    });

    it('accepts derivedMetricInverted only alongside grid_power/battery_power', () => {
        const entry = validateCatalogEntry({
            sourceId: 'x', category: 'consumption', valueKind: 'gauge',
            derivedMetricRole: 'battery_power', derivedMetricGroupId: 'energy-1', derivedMetricInverted: true,
        });
        expect(entry.derivedMetricInverted).to.equal(true);
    });

    it('rejects derivedMetricInverted on a non-power role', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'consumption', valueKind: 'daily_reset_counter',
            derivedMetricRole: 'grid_import', derivedMetricGroupId: 'energy-1', derivedMetricInverted: true,
        })).to.throw('derivedMetricInverted');
    });

    it('rejects derivedMetricInverted without any derivedMetricRole', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'consumption', derivedMetricInverted: false,
        })).to.throw('derivedMetricInverted');
    });

    it('rejects a non-boolean derivedMetricInverted', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'consumption', valueKind: 'gauge',
            derivedMetricRole: 'grid_power', derivedMetricGroupId: 'energy-1', derivedMetricInverted: 'yes',
        })).to.throw('derivedMetricInverted');
    });
```

- [ ] **Step 4: Tests ausführen, erwarteter Zustand: die neuen Tests FAIL, alle übrigen weiterhin PASS**

Run: `npx mocha test/unit/catalog.test.js`
Expected: 9 neue Tests FAIL mit z. B. "expected [Function] to throw" (die Sperre existiert noch nicht) bzw. `TypeError: Unbekannte derivedMetricRole: grid_power` (die Rolle existiert noch nicht im Set). Alle Tests aus Step 1 bleiben PASS.

- [ ] **Step 5: `lib/catalog.js` implementieren**

Ersetze die Konstanten am Dateianfang (Zeile 3-6):

```js
const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const COUNTER_DERIVED_METRIC_ROLES = new Set(['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption']);
const GAUGE_DERIVED_METRIC_ROLES = new Set(['grid_power', 'battery_power']);
const DERIVED_METRIC_ROLES = new Set([...COUNTER_DERIVED_METRIC_ROLES, ...GAUGE_DERIVED_METRIC_ROLES]);
const COUNTER_VALUE_KINDS = new Set(['daily_reset_counter', 'cumulative_total']);
const MAX_DERIVED_METRIC_GROUP_ID_LENGTH = 128;
const HVAC_ROLES = new Set(['window', 'heating']);

function isDerivedMetricRoleValueKindValid(role, valueKind) {
    if (COUNTER_DERIVED_METRIC_ROLES.has(role)) return COUNTER_VALUE_KINDS.has(valueKind);
    if (GAUGE_DERIVED_METRIC_ROLES.has(role)) return valueKind === 'gauge';
    return true;
}

function isHvacRoleValueKindValid(valueKind) {
    return valueKind === 'boolean_state';
}
```

Ersetze den Rollen-/hvacRole-Validierungsblock in `validateCatalogEntry` (aktuell Zeile 50-68):

```js
    const hasDerivedMetricRole = entry.derivedMetricRole !== undefined;
    const hasDerivedMetricGroupId = entry.derivedMetricGroupId !== undefined;
    if (hasDerivedMetricRole !== hasDerivedMetricGroupId) {
        throw new Error('derivedMetricRole und derivedMetricGroupId muessen zusammen gesetzt sein.');
    }
    if (hasDerivedMetricRole && !DERIVED_METRIC_ROLES.has(entry.derivedMetricRole)) {
        throw new Error(`Unbekannte derivedMetricRole: ${entry.derivedMetricRole}`);
    }
    if (hasDerivedMetricRole && !isDerivedMetricRoleValueKindValid(entry.derivedMetricRole, entry.valueKind)) {
        throw new Error(`derivedMetricRole '${entry.derivedMetricRole}' ist fuer valueKind '${entry.valueKind}' nicht gueltig.`);
    }
    if (hasDerivedMetricGroupId) {
        validateString(entry.derivedMetricGroupId, 'derivedMetricGroupId', MAX_DERIVED_METRIC_GROUP_ID_LENGTH, true);
    }
    if (entry.derivedMetricInverted !== undefined) {
        if (typeof entry.derivedMetricInverted !== 'boolean') {
            throw new TypeError('Ungueltiges Feld derivedMetricInverted.');
        }
        if (!hasDerivedMetricRole || !GAUGE_DERIVED_METRIC_ROLES.has(entry.derivedMetricRole)) {
            throw new Error('derivedMetricInverted ist nur fuer derivedMetricRole grid_power/battery_power gueltig.');
        }
    }
    if (entry.hvacRole !== undefined) {
        if (!HVAC_ROLES.has(entry.hvacRole)) {
            throw new Error(`Unbekannte hvacRole: ${entry.hvacRole}`);
        }
        if (!isHvacRoleValueKindValid(entry.valueKind)) {
            throw new Error('hvacRole ist nur fuer valueKind boolean_state gueltig.');
        }
    }
```

Ergänze `module.exports` (aktuell Zeile 145-156) um die neuen Namen:

```js
module.exports = {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    removeCatalogEntry,
    catalogStateId,
    CATEGORIES,
    DERIVED_METRIC_ROLES,
    GAUGE_DERIVED_METRIC_ROLES,
    HVAC_ROLES,
    isDerivedMetricRoleValueKindValid,
    isHvacRoleValueKindValid,
    validateCatalogEntry,
};
```

- [ ] **Step 6: Tests ausführen, erwarteter Zustand: alle PASS**

Run: `npx mocha test/unit/catalog.test.js`
Expected: alle Tests (bestehende + 9 neue) PASS.

- [ ] **Step 7: Vollen Unit-Testlauf gegen Regressionen prüfen**

Run: `npm run test:unit`
Expected: alle Tests PASS (insbesondere `test/unit/adminCommands.test.js` und `test/unit/onboarding.test.js`, die `lib/catalog.js` real importieren, nicht nur `catalog.test.js`).

- [ ] **Step 8: Commit**

```bash
git add lib/catalog.js test/unit/catalog.test.js
git commit -m "feat: validate energy-balance role against valueKind, add grid_power/battery_power roles"
```

---

### Task 2: `lib/adminCommands.js` — dieselbe Regel im Admin-Message-Bus-Pfad

**Files:**
- Modify: `lib/adminCommands.js:1-16` (Konstanten/Import), `lib/adminCommands.js:34-59` (`validateCatalogUpdate`), `lib/adminCommands.js:144-214` (`updateCatalogEntryAdminUnlocked`)
- Test: `test/unit/adminCommands.test.js:186-352` (bestehende Tests anpassen, neue ergänzen)

**Interfaces:**
- Consumes: `DERIVED_METRIC_ROLES`, `GAUGE_DERIVED_METRIC_ROLES`, `isDerivedMetricRoleValueKindValid`, `isHvacRoleValueKindValid` aus `./catalog` (Task 1).
- Produces: `updateCatalogEntryAdmin` akzeptiert neu `derivedMetricInverted` als Update-Feld (inkl. Lösch-Sentinel `''`-Verhalten analog zu den bestehenden Rollenfeldern); wird von Task 4 (Frontend `save()`-Aufruf) konsumiert.

- [ ] **Step 1: Bestehende Tests anpassen (dieselbe Kollision wie in Task 1)**

In `test/unit/adminCommands.test.js`, Zeile 260-284, ergänze `valueKind: 'daily_reset_counter'` in den `existing`-Mocks:

```js
        it('accepts and stores a valid derivedMetricRole/derivedMetricGroupId pair', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'generation_pv', valueKind: 'daily_reset_counter' };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' });

            expect(result.entry).to.deep.include({ derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' });
            expect(setCatalogEntry.calledOnce).to.equal(true);
        });

        it('accepts the new energy balance roles', async () => {
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'consumption', valueKind: 'daily_reset_counter' }]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'grid_import', derivedMetricGroupId: 'energy-1' });

            expect(result.entry).to.deep.include({ derivedMetricRole: 'grid_import', derivedMetricGroupId: 'energy-1' });
        });
```

- [ ] **Step 2: Tests ausführen, erwarteter Zustand: weiterhin grün**

Run: `npx mocha test/unit/adminCommands.test.js`
Expected: PASS (noch keine Verhaltensänderung im Code).

- [ ] **Step 3: Neue fehlschlagende Tests schreiben**

Füge nach dem `'accepts the new energy balance roles'`-Test (vor `'rejects hvacRole when the existing entry is not boolean_state'`, aktuell Zeile 286) ein:

```js
        it('rejects a balance role when the resulting valueKind is not counter-like', async () => {
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'consumption', valueKind: 'gauge' }]),
                setCatalogEntry: sinon.stub().resolves(),
            });

            let error;
            try {
                await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'grid_import', derivedMetricGroupId: 'energy-1' });
            } catch (err) {
                error = err;
            }

            expect(error.message).to.include('grid_import');
        });

        it('accepts grid_power on a gauge entry and stores derivedMetricInverted', async () => {
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'consumption', valueKind: 'gauge' }]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'grid_power', derivedMetricGroupId: 'sun2000-0', derivedMetricInverted: true });

            expect(result.entry).to.deep.include({ derivedMetricRole: 'grid_power', derivedMetricGroupId: 'sun2000-0', derivedMetricInverted: true });
        });

        it('rejects grid_power on a non-gauge entry', async () => {
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'consumption', valueKind: 'daily_reset_counter' }]),
                setCatalogEntry: sinon.stub().resolves(),
            });

            let error;
            try {
                await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'grid_power', derivedMetricGroupId: 'sun2000-0' });
            } catch (err) {
                error = err;
            }

            expect(error.message).to.include('grid_power');
        });

        it('rejects derivedMetricInverted alongside a non-power role', async () => {
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'consumption', valueKind: 'daily_reset_counter' }]),
                setCatalogEntry: sinon.stub().resolves(),
            });

            let error;
            try {
                await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'grid_import', derivedMetricGroupId: 'energy-1', derivedMetricInverted: true });
            } catch (err) {
                error = err;
            }

            expect(error.message).to.include('derivedMetricInverted');
        });

        it('clears derivedMetricInverted via the empty-string sentinel', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'consumption', valueKind: 'gauge', derivedMetricRole: 'grid_power', derivedMetricGroupId: 'sun2000-0', derivedMetricInverted: true };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricInverted: false });

            expect(result.entry).to.deep.include({ derivedMetricInverted: false });
        });
```

- [ ] **Step 4: Tests ausführen, erwarteter Zustand: die neuen Tests FAIL**

Run: `npx mocha test/unit/adminCommands.test.js`
Expected: die 5 neuen Tests FAIL (z. B. `TypeError: Cannot read properties of undefined (reading 'message')`, weil kein Fehler geworfen wird, oder `derivedMetricRole ist ungültig.` für `grid_power`, das noch nicht im lokalen `DERIVED_METRIC_ROLES`-Set steht).

- [ ] **Step 5: `lib/adminCommands.js` implementieren**

Ersetze den Import (Zeile 3) und die lokalen Rollen-Konstanten (Zeile 8-11):

```js
const { getAllCatalogEntries, setCatalogEntry, removeCatalogEntry: deleteCatalogEntry, CATEGORIES, DERIVED_METRIC_ROLES, GAUGE_DERIVED_METRIC_ROLES, HVAC_ROLES, isDerivedMetricRoleValueKindValid, isHvacRoleValueKindValid } = require('./catalog');
const { checkProviderReachable, CHAT_STATE, ONBOARDING_STATE } = require('./providerHealthCheck');
const { listModels } = require('./providers');
const { resetUsage: resetUsageState } = require('./usage');

const VALUE_KINDS = new Set(['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count']);
const MAX_DERIVED_METRIC_GROUP_ID_LENGTH = 128;
```

(Entfernt die lokal duplizierten `DERIVED_METRIC_ROLES`/`HVAC_ROLES`-Sets — jetzt aus `./catalog` importiert, einzige Quelle der Wahrheit zusammen mit Task 1.)

Ergänze `validateCatalogUpdate` (aktuell Zeile 34-59) um die `derivedMetricInverted`-Strukturprüfung (die valueKind-Kompatibilitätsprüfung selbst braucht den — ggf. erst nach dem Update bekannten — `valueKind`, daher unten in `updateCatalogEntryAdminUnlocked`, analog zum bestehenden `hvacRole`-Muster):

```js
    if (message.derivedMetricInverted !== undefined && typeof message.derivedMetricInverted !== 'boolean') {
        throw new Error('derivedMetricInverted muss ein Boolean sein.');
    }
```

(Direkt nach der bestehenden `hvacRole`-Prüfung einfügen, vor `return message;`.)

Erweitere `updateCatalogEntryAdminUnlocked` (aktuell Zeile 144-214). Ersetze die Funktionssignatur und den hvacRole-Check-Block (Zeile 144-158):

```js
async function updateCatalogEntryAdminUnlocked(
    adapter,
    { sourceId, category, room, description, valueKind, ignored, updateFrequency, dataCompleteness, derivedMetricRole, derivedMetricGroupId, derivedMetricInverted, hvacRole } = {},
) {
    validateCatalogUpdate({ sourceId, category, room, description, valueKind, ignored, updateFrequency, dataCompleteness, derivedMetricRole, derivedMetricGroupId, derivedMetricInverted, hvacRole });
    const entry = await findEntry(adapter, sourceId);
    if (!entry) {
        return { error: `Unbekanntes Objekt: ${sourceId}` };
    }
    const targetValueKind = valueKind !== undefined ? valueKind : entry.valueKind;
    if (hvacRole !== undefined && hvacRole !== '') {
        if (!isHvacRoleValueKindValid(targetValueKind)) {
            throw new Error('hvacRole ist nur fuer valueKind boolean_state gueltig.');
        }
    }
    const clearingDerivedMetric = derivedMetricRole === '';
    const targetDerivedMetricRole = derivedMetricRole !== undefined && !clearingDerivedMetric ? derivedMetricRole : entry.derivedMetricRole;
    if (derivedMetricRole !== undefined && !clearingDerivedMetric && !isDerivedMetricRoleValueKindValid(derivedMetricRole, targetValueKind)) {
        throw new Error(`derivedMetricRole '${derivedMetricRole}' ist fuer valueKind '${targetValueKind}' nicht gueltig.`);
    }
    if (derivedMetricInverted !== undefined && (!targetDerivedMetricRole || !GAUGE_DERIVED_METRIC_ROLES.has(targetDerivedMetricRole))) {
        throw new Error('derivedMetricInverted ist nur fuer derivedMetricRole grid_power/battery_power gueltig.');
    }
```

(Der Rest der Funktion ab dem bestehenden `const updated = { ...entry };` bleibt unverändert stehen — nur die Deklaration `const hvacDisabled`/alte Inline-Prüfung entfällt, da jetzt oben per `isHvacRoleValueKindValid` erledigt.)

Ergänze im `updated`-Aufbau (aktuell Zeile 185-202), direkt nach dem bestehenden `hvacRole`-Block, das neue Feld:

```js
    if (derivedMetricInverted !== undefined) {
        updated.derivedMetricInverted = derivedMetricInverted;
    }
```

- [ ] **Step 6: Tests ausführen, erwarteter Zustand: alle PASS**

Run: `npx mocha test/unit/adminCommands.test.js`
Expected: alle Tests PASS.

- [ ] **Step 7: Vollen Unit-Testlauf prüfen**

Run: `npm run test:unit`
Expected: alle Tests PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/adminCommands.js test/unit/adminCommands.test.js
git commit -m "feat: mirror energy-balance role validation in the admin update path"
```

---

### Task 3: Frontend-Rollenkonstanten und CSV-Spalten synchronisieren

**Files:**
- Modify: `src-admin/src/csvHelpers.js:5`, `src-admin/src/CatalogDevices/CatalogDevicesComponent.jsx:9-10`, `src-admin/src/CatalogDevices/DeviceRow.jsx:6`, `src-admin/src/CatalogDevices/BulkEditToolbar.jsx:6`, `src-admin/src/CatalogDevices/catalogColumns.js:1-20`
- Test: `test/admin/csvHelpers.test.jsx`, `test/admin/bulkEditToolbar.test.jsx`

**Interfaces:**
- Produces: `CSV_COLUMNS`/`CSV_EDITABLE_COLUMNS` inkl. `derivedMetricInverted`; alle fünf `DERIVED_METRIC_ROLES`-Literale enthalten `grid_power`/`battery_power`. Wird von Task 4 (DeviceRow-Checkbox) konsumiert.

- [ ] **Step 1: Fehlschlagende Assertions für die CSV-Validierung der neuen Rollen ergänzen**

`test/admin/csvHelpers.test.jsx` importiert `validateCatalogImportValue` aus `'../../src-admin/src/Components.jsx'` (nicht direkt aus `csvHelpers.js` — `Components.jsx` re-exportiert es) und prüft alle Rollenwerte in einem einzigen Test `'strictly validates catalog enum and boolean values'` (Zeile 34-44) mit mehreren `expect`-Zeilen statt separaten `it`-Blöcken. Füge dort nach Zeile 41 (`expect(validateCatalogImportValue('derivedMetricRole', 'battery_charge')).toBe('battery_charge');`) zwei Zeilen ein:

```js
        expect(validateCatalogImportValue('derivedMetricRole', 'grid_power')).toBe('grid_power');
        expect(validateCatalogImportValue('derivedMetricRole', 'battery_power')).toBe('battery_power');
```

- [ ] **Step 2: Test ausführen, erwarteter Zustand: FAIL**

Run: `npx vitest run test/admin/csvHelpers.test.jsx`
Expected: FAIL mit "Ungültige derivedMetricRole: grid_power".

- [ ] **Step 3: `src-admin/src/csvHelpers.js` Zeile 5 ändern**

```js
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption', 'grid_power', 'battery_power'];
```

- [ ] **Step 4: Test ausführen, erwarteter Zustand: PASS**

Run: `npx vitest run test/admin/csvHelpers.test.jsx`
Expected: PASS.

- [ ] **Step 5: `src-admin/src/CatalogDevices/CatalogDevicesComponent.jsx` Zeile 9-10 ändern (CSV-Spalten, kein separater Test — wird über `catalogDevicesComponent.test.jsx` in Task 9 indirekt mitgeprüft)**

```js
const CSV_COLUMNS = ['sourceId', 'description', 'category', 'valueKind', 'unit', 'room', 'ignored', 'active', 'needsReview', 'writable', 'writePattern', 'updateFrequency', 'dataCompleteness', 'derivedMetricRole', 'derivedMetricGroupId', 'derivedMetricInverted', 'hvacRole'];
const CSV_EDITABLE_COLUMNS = ['description', 'category', 'room', 'valueKind', 'ignored', 'updateFrequency', 'dataCompleteness', 'derivedMetricRole', 'derivedMetricGroupId', 'derivedMetricInverted', 'hvacRole'];
```

- [ ] **Step 6: `src-admin/src/CatalogDevices/catalogColumns.js` — neue Spalte für Sichtbarkeits-Umschaltung ergänzen**

Füge nach der `derivedMetricGroupId`-Zeile (aktuell Zeile 16) ein:

```js
    { key: 'derivedMetricInverted', label: 'Vorzeichen invertiert', sortable: true },
```

- [ ] **Step 7: Fehlschlagenden Test für die Bulk-Toolbar-Rollenliste schreiben**

Füge in `test/admin/bulkEditToolbar.test.jsx` innerhalb `describe('BulkEditToolbar', ...)`, nach dem bestehenden Test `'requires both a role and a group before enabling apply for derivedMetricRole'` (Zeile 31-44), einen Test hinzu, der die bestehende `renderToolbar()`-Hilfsfunktion (Zeile 6-18) verwendet — kein zusätzlicher Import nötig:

```js
    it('offers grid_power and battery_power in the bulk energy-role dropdown', async () => {
        const user = userEvent.setup();
        renderToolbar();

        await user.selectOptions(screen.getByLabelText('Bulk-Feld'), 'derivedMetricRole');

        const select = screen.getByLabelText('Wert für Bulk-Energie-Rolle');
        const optionValues = Array.from(select.options).map(option => option.value);
        expect(optionValues).toContain('grid_power');
        expect(optionValues).toContain('battery_power');
    });
```

- [ ] **Step 8: Test ausführen, erwarteter Zustand: FAIL**

Run: `npx vitest run test/admin/bulkEditToolbar.test.jsx`
Expected: FAIL — Option `grid_power` nicht gefunden.

- [ ] **Step 9: `src-admin/src/CatalogDevices/BulkEditToolbar.jsx` Zeile 6 und `src-admin/src/CatalogDevices/DeviceRow.jsx` Zeile 6 ändern**

Beide Dateien: gleiche Konstante wie in Task 3 Step 3, exakt derselbe Wert wie `src-admin/src/csvHelpers.js`:

```js
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption', 'grid_power', 'battery_power'];
```

- [ ] **Step 10: Test ausführen, erwarteter Zustand: PASS**

Run: `npx vitest run test/admin/bulkEditToolbar.test.jsx`
Expected: PASS.

- [ ] **Step 11: Vollen Admin-Testlauf prüfen**

Run: `npm run test:admin`
Expected: alle Tests PASS (inkl. `deviceRow.test.jsx`, das die geänderte Konstante in Task 4 noch nicht braucht, aber durch die geänderte Datei nicht brechen darf).

- [ ] **Step 12: Commit**

```bash
git add src-admin/src/csvHelpers.js src-admin/src/CatalogDevices/CatalogDevicesComponent.jsx src-admin/src/CatalogDevices/catalogColumns.js src-admin/src/CatalogDevices/BulkEditToolbar.jsx src-admin/src/CatalogDevices/DeviceRow.jsx test/admin/csvHelpers.test.jsx test/admin/bulkEditToolbar.test.jsx
git commit -m "feat: add grid_power/battery_power to all frontend role pickers and CSV columns"
```

---

### Task 4: `DeviceRow.jsx` — `derivedMetricInverted`-Checkbox im Detail-Panel

**Files:**
- Modify: `src-admin/src/CatalogDevices/DeviceRow.jsx:231-247` (Detail-Panel-Bereich)
- Test: `test/admin/deviceRow.test.jsx`

**Interfaces:**
- Consumes: `entry.derivedMetricRole`, `entry.derivedMetricInverted`, `this.save(fields)` (bestehende Methode, Zeile 70-99), `effectiveRole` (bereits berechnete lokale Variable, Zeile 198).

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Füge in `test/admin/deviceRow.test.jsx` nach dem `'clears the energy role via the empty-string sentinel...'`-Test (aktuell Zeile 112-119) ein:

```js
    it('shows the invert-sign checkbox only for grid_power/battery_power roles and saves changes', async () => {
        const user = userEvent.setup();
        const { props } = renderRow({ expanded: true, entry: { derivedMetricRole: 'grid_power', derivedMetricGroupId: 'sun2000.0' } });

        const checkbox = screen.getByLabelText('Vorzeichen invertiert für javascript.0.x');
        expect(checkbox).not.toBeChecked();
        await user.click(checkbox);

        expect(props.onFieldChange).toHaveBeenCalledWith({ derivedMetricInverted: true });
    });

    it('reflects an already-inverted entry as checked', () => {
        renderRow({ expanded: true, entry: { derivedMetricRole: 'battery_power', derivedMetricGroupId: 'sun2000.0', derivedMetricInverted: true } });

        expect(screen.getByLabelText('Vorzeichen invertiert für javascript.0.x')).toBeChecked();
    });

    it('hides the invert-sign checkbox for non-power energy roles', () => {
        renderRow({ expanded: true, entry: { derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' } });

        expect(screen.queryByLabelText('Vorzeichen invertiert für javascript.0.x')).not.toBeInTheDocument();
    });

    it('hides the invert-sign checkbox when no energy role is set', () => {
        renderRow({ expanded: true });

        expect(screen.queryByLabelText('Vorzeichen invertiert für javascript.0.x')).not.toBeInTheDocument();
    });
```

- [ ] **Step 2: Tests ausführen, erwarteter Zustand: die ersten beiden FAIL (Element nicht gefunden), die letzten beiden PASS (Checkbox existiert noch gar nicht)**

Run: `npx vitest run test/admin/deviceRow.test.jsx`
Expected: 2 FAIL, 2 PASS (die "hides"-Tests sind vor der Implementierung trivial erfüllt, bleiben aber als Regressionsschutz stehen).

- [ ] **Step 3: `DeviceRow.jsx` implementieren**

Füge im Detail-Panel (aktuell Zeile 231-246, nach dem `GroupIdPicker`-Block und vor dem `fieldErrors.derivedMetricRole`-Alert oder direkt danach) ein:

```jsx
                                {(effectiveRole === 'grid_power' || effectiveRole === 'battery_power') ? (
                                    <label>
                                        <input
                                            type="checkbox"
                                            aria-label={`Vorzeichen invertiert für ${entry.sourceId}`}
                                            checked={Boolean(entry.derivedMetricInverted)}
                                            onChange={event => this.save({ derivedMetricInverted: event.target.checked })}
                                        />
                                        {' '}Vorzeichen invertiert
                                    </label>
                                ) : null}
```

Platziere diesen Block direkt nach der schließenden Zeile des bestehenden `{fieldErrors.derivedMetricRole ? <span role="alert">{fieldErrors.derivedMetricRole}</span> : null}` (aktuell Zeile 246), vor dem `<label>HVAC-Rolle...`-Block (aktuell Zeile 247).

- [ ] **Step 4: Tests ausführen, erwarteter Zustand: alle 4 PASS**

Run: `npx vitest run test/admin/deviceRow.test.jsx`
Expected: PASS.

- [ ] **Step 5: Vollen Admin-Testlauf prüfen**

Run: `npm run test:admin`
Expected: alle Tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src-admin/src/CatalogDevices/DeviceRow.jsx test/admin/deviceRow.test.jsx
git commit -m "feat: add derivedMetricInverted checkbox for grid_power/battery_power roles"
```

---

### Task 5: `lib/onboarding.js` — Batching auf Adapter-Instanz-Ebene umstellen

**Files:**
- Modify: `lib/onboarding.js:12-14` (Funktion `adapterTypeOf` → `adapterInstanceOf`), `lib/onboarding.js:25` (`buildBatches`), `lib/onboarding.js:157` (Log-Zeile), `lib/onboarding.js:254` (`module.exports`)
- Test: `test/unit/onboarding.test.js:55-67` (bestehenden Test ersetzen), neuer Test ergänzen

**Interfaces:**
- Produces: `adapterInstanceOf(sourceId): string` (z. B. `'sun2000.0'` aus `'sun2000.0.battery.totalCharge'`), von Task 7 (`derivedMetricGroupId`-Ableitung) konsumiert.

- [ ] **Step 1: Bestehenden Test ersetzen (testet die alte, jetzt bewusst geänderte Semantik)**

Ersetze in `test/unit/onboarding.test.js` den Test `'groups by adapter type regardless of instance number'` (Zeile 55-67):

```js
    it('splits by adapter instance, keeping different instances of the same adapter type in separate batches', () => {
        const objects = [
            { id: 'hm-rpc.0.a' },
            { id: 'hm-rpc.1.b' },
            { id: 'shelly.0.c' },
        ];

        const batches = buildBatches(objects, 10);

        expect(batches).to.have.lengthOf(3);
        expect(batches[0].map((o) => o.id)).to.deep.equal(['hm-rpc.0.a']);
        expect(batches[1].map((o) => o.id)).to.deep.equal(['hm-rpc.1.b']);
        expect(batches[2].map((o) => o.id)).to.deep.equal(['shelly.0.c']);
    });

    it('keeps two objects of the same adapter instance in the same batch', () => {
        const objects = [
            { id: 'sun2000.0.grid.power' },
            { id: 'sun2000.1.grid.power' },
            { id: 'sun2000.0.battery.totalCharge' },
        ];

        const batches = buildBatches(objects, 10);

        expect(batches).to.have.lengthOf(2);
        expect(batches[0].map((o) => o.id)).to.deep.equal(['sun2000.0.grid.power', 'sun2000.0.battery.totalCharge']);
        expect(batches[1].map((o) => o.id)).to.deep.equal(['sun2000.1.grid.power']);
    });
```

- [ ] **Step 2: Tests ausführen, erwarteter Zustand: beide neuen/geänderten Tests FAIL, übrige `buildBatches`-Tests weiterhin PASS**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: FAIL — `hm-rpc.1.b` landet noch im selben Batch wie `hm-rpc.0.a`.

- [ ] **Step 3: `lib/onboarding.js` implementieren**

Ersetze Zeile 12-14:

```js
function adapterInstanceOf(sourceId) {
    return sourceId.split('.').slice(0, 2).join('.');
}
```

Ersetze in `buildBatches` (Zeile 25) `adapterTypeOf(obj.id)` durch `adapterInstanceOf(obj.id)`.

Ersetze in der Silly-Log-Zeile (Zeile 157) `adapterTypeOf(batch[0].id)` durch `adapterInstanceOf(batch[0].id)`.

Ersetze in `module.exports` (Zeile 254) `adapterTypeOf` durch `adapterInstanceOf`.

- [ ] **Step 4: Tests ausführen, erwarteter Zustand: alle PASS**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS.

- [ ] **Step 5: Vollen Unit-Testlauf prüfen**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "feat: batch onboarding classification by adapter instance, not adapter type"
```

---

### Task 6: `lib/onboarding.js` — `buildClassificationPrompt` schlägt Rollen vor

**Files:**
- Modify: `lib/onboarding.js:3-4` (Import), `lib/onboarding.js:63-81` (`buildClassificationPrompt`)
- Test: `test/unit/onboarding.test.js` (neue Tests für Prompt-Inhalt)

**Interfaces:**
- Consumes: `DERIVED_METRIC_ROLES`, `HVAC_ROLES` aus `./catalog` (Task 1).
- Produces: Prompt-Text enthält die acht Rollen und zwei HVAC-Rollen als Auswahlvorgabe; erwartetes Antwortschema um `derivedMetricRole`/`hvacRole` erweitert. Von Task 7 konsumiert (die tatsächliche Verarbeitung der Antwortfelder).

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Füge in `test/unit/onboarding.test.js` einen neuen `describe('buildClassificationPrompt', ...)`-Block ein (z. B. vor `describe('runOnboarding', ...)`):

```js
describe('buildClassificationPrompt', () => {
    const { buildClassificationPrompt } = require('../../lib/onboarding');

    it('lists all eight derivedMetricRole values and both hvacRole values', () => {
        const prompt = buildClassificationPrompt([{ id: 'sun2000.0.x', common: { name: 'x' } }]);

        for (const role of ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption', 'grid_power', 'battery_power']) {
            expect(prompt).to.include(role);
        }
        expect(prompt).to.include('window');
        expect(prompt).to.include('heating');
    });

    it('instructs the model to answer null when the role is not evident from the name', () => {
        const prompt = buildClassificationPrompt([{ id: 'sun2000.0.x', common: { name: 'x' } }]);

        expect(prompt.toLowerCase()).to.include('null');
    });
});
```

- [ ] **Step 2: Test ausführen, erwarteter Zustand: FAIL**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: FAIL — `grid_power` etc. nicht im Prompt-Text enthalten.

- [ ] **Step 3: `lib/onboarding.js` implementieren**

Ersetze den Import (Zeile 4):

```js
const { getAllCatalogEntries, setCatalogEntry, CATEGORIES, DERIVED_METRIC_ROLES, HVAC_ROLES, isDerivedMetricRoleValueKindValid, isHvacRoleValueKindValid } = require('./catalog');
```

Ersetze `buildClassificationPrompt` (Zeile 63-81):

```js
function buildClassificationPrompt(objects) {
    const objectDescriptions = objects.map((obj) => ({
        sourceId: obj.id,
        name: textValue(obj.common.name),
        role: textValue(obj.common.role),
        unit: textValue(obj.common.unit),
    }));

    return [
        'Du bist Teil eines ioBroker-Adapters und ordnest Smart-Home-Objekte in Kategorien ein.',
        `Erlaubte Kategorien: ${CATEGORIES.join(', ')}.`,
        `Optionale Energiebilanz-Rolle, NUR wenn Zweck und Richtung eindeutig aus Name/sourceId hervorgehen (sonst null): ${[...DERIVED_METRIC_ROLES].join(', ')}.`,
        `Optionale HVAC-Rolle, NUR fuer Fensterkontakte/Heizungs-Schaltzustaende (sonst null): ${[...HVAC_ROLES].join(', ')}.`,
        'Antworte AUSSCHLIESSLICH mit einem JSON-Array, ein Eintrag pro Objekt, in dieser Form:',
        '[{"sourceId": "...", "description": "...", "unit": "...", "category": "...", "room": "...", "confidence": "high"|"low", "derivedMetricRole": "..."|null, "hvacRole": "..."|null}]',
        'Setze derivedMetricRole/hvacRole nur bei eindeutigem Namensindiz (z. B. "Batterie Ladeleistung gesamt" -> battery_charge), sonst null. Im Zweifel: null.',
        'Nutze confidence "low", wenn du dir bei Zweck oder Kategorie nicht sicher bist.',
        'Schreibe die description ausschliesslich auf Deutsch, in klarer Alltagssprache (kein Fachjargon, kein Datenpunktname).',
        'Objekte:',
        JSON.stringify(objectDescriptions, null, 2),
    ].join('\n');
}
```

(`isDerivedMetricRoleValueKindValid`/`isHvacRoleValueKindValid` werden hier importiert, aber erst in Task 7 verwendet — ein ungenutzter Import würde ESLint stören, daher Import und Verwendung in Task 7 gemeinsam einfügen: **korrigiere diesen Step** — importiere in Task 6 nur `DERIVED_METRIC_ROLES, HVAC_ROLES` zusätzlich zu den bestehenden `getAllCatalogEntries, setCatalogEntry, CATEGORIES`, und ergänze `isDerivedMetricRoleValueKindValid, isHvacRoleValueKindValid` erst in Task 7 Step 3.)

- [ ] **Step 4: Tests ausführen, erwarteter Zustand: alle PASS**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS.

- [ ] **Step 5: Lint prüfen (unbenutzte Imports vermeiden)**

Run: `npm run lint`
Expected: keine neuen Fehler (insbesondere kein `no-unused-vars` für `DERIVED_METRIC_ROLES`/`HVAC_ROLES`, die jetzt in `buildClassificationPrompt` verwendet werden).

- [ ] **Step 6: Vollen Unit-Testlauf prüfen**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "feat: let onboarding classification prompt suggest derivedMetricRole/hvacRole"
```

---

### Task 7: `lib/onboarding.js` — `runOnboarding` verarbeitet Rollenvorschläge

**Files:**
- Modify: `lib/onboarding.js:3-4` (Import ergänzen), `lib/onboarding.js:118-252` (`runOnboarding`)
- Test: `test/unit/onboarding.test.js` (neue Tests)

**Interfaces:**
- Consumes: `adapterInstanceOf` (Task 5), `DERIVED_METRIC_ROLES`/`HVAC_ROLES`/`isDerivedMetricRoleValueKindValid`/`isHvacRoleValueKindValid` (Task 1, Task 6).
- Produces: Katalogeinträge mit `derivedMetricRole`/`derivedMetricGroupId`/`hvacRole`, wenn von der KI vorgeschlagen und valueKind-kompatibel; `needsReview: true` bei jedem Rollenvorschlag (behalten oder verworfen); nie ein kompletter Speicherabbruch wegen einer inkompatiblen Rolle.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Füge in `test/unit/onboarding.test.js` innerhalb `describe('runOnboarding', ...)` (z. B. nach dem letzten bestehenden Test, vor der schließenden `});` bei Zeile 785) ein:

```js
    it('stores a compatible derivedMetricRole proposal and forces needsReview even at high confidence', async () => {
        const discovered = [
            { id: 'sun2000.0.battery.totalCharge', historyInstance: 'influxdb.0', common: { name: 'Batterie Ladeleistung gesamt' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'sun2000.0.battery.totalCharge', description: 'Batterie Ladeleistung gesamt',
                    unit: 'kWh', category: 'consumption', room: '', confidence: 'high',
                    derivedMetricRole: 'battery_charge',
                }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            derivedMetricRole: 'battery_charge',
            derivedMetricGroupId: 'sun2000.0',
            needsReview: true,
        });
    });

    it('drops an incompatible derivedMetricRole proposal but still stores the rest of the entry', async () => {
        const discovered = [
            { id: 'sun2000.0.grid.power', historyInstance: 'influxdb.0', common: { name: 'Netzleistung' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'sun2000.0.grid.power', description: 'Netzleistung', unit: 'W',
                    category: 'consumption', room: '', confidence: 'high',
                    derivedMetricRole: 'grid_import',
                }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'gauge', valueKindConfidence: 'high', valueKindSource: 'metadata' });
        const adapter = { log: { warn: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding(adapter, provider, discovered);

        expect(setCatalogEntry.calledOnce).to.equal(true);
        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.not.have.property('derivedMetricRole');
        expect(entry).to.not.have.property('derivedMetricGroupId');
        expect(entry.needsReview).to.equal(true);
        expect(entry.description).to.equal('Netzleistung');
    });

    it('drops both roles when the LLM proposes the same role twice within one adapter instance', async () => {
        const discovered = [
            { id: 'sun2000.0.battery.a', historyInstance: 'influxdb.0', common: { name: 'a' } },
            { id: 'sun2000.0.battery.b', historyInstance: 'influxdb.0', common: { name: 'b' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([
                    { sourceId: 'sun2000.0.battery.a', description: 'a', unit: 'kWh', category: 'consumption', room: '', confidence: 'high', derivedMetricRole: 'battery_charge' },
                    { sourceId: 'sun2000.0.battery.b', description: 'b', unit: 'kWh', category: 'consumption', room: '', confidence: 'high', derivedMetricRole: 'battery_charge' },
                ]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        expect(setCatalogEntry.calledTwice).to.equal(true);
        for (const call of setCatalogEntry.getCalls()) {
            const [, entry] = call.args;
            expect(entry).to.not.have.property('derivedMetricRole');
            expect(entry.needsReview).to.equal(true);
        }
    });

    it('does not propose a role that is already claimed by an existing catalog entry in the same group', async () => {
        const discovered = [
            { id: 'sun2000.0.battery.new', historyInstance: 'influxdb.0', common: { name: 'neu' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'sun2000.0.battery.new', description: 'neu', unit: 'kWh',
                    category: 'consumption', room: '', confidence: 'high', derivedMetricRole: 'battery_charge',
                }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([
                { sourceId: 'sun2000.0.battery.old', derivedMetricRole: 'battery_charge', derivedMetricGroupId: 'sun2000.0' },
            ]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.not.have.property('derivedMetricRole');
        expect(entry.needsReview).to.equal(true);
    });

    it('stores a compatible hvacRole proposal and forces needsReview', async () => {
        const discovered = [
            { id: 'javascript.0.fenster.kueche', historyInstance: 'influxdb.0', common: { name: 'Fenster Kueche' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'javascript.0.fenster.kueche', description: 'Fenster Kueche', unit: '',
                    category: 'environment', room: 'Kueche', confidence: 'high', hvacRole: 'window',
                }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'boolean_state', valueKindConfidence: 'high', valueKindSource: 'metadata' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({ hvacRole: 'window', needsReview: true });
    });

    it('derives the same derivedMetricGroupId for two objects of the same adapter instance', async () => {
        const discovered = [
            { id: 'sun2000.0.grid.import', historyInstance: 'influxdb.0', common: { name: 'Netzbezug' } },
            { id: 'sun2000.0.grid.feedin', historyInstance: 'influxdb.0', common: { name: 'Netzeinspeisung' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([
                    { sourceId: 'sun2000.0.grid.import', description: 'Netzbezug', unit: 'kWh', category: 'consumption', room: '', confidence: 'high', derivedMetricRole: 'grid_import' },
                    { sourceId: 'sun2000.0.grid.feedin', description: 'Netzeinspeisung', unit: 'kWh', category: 'generation_pv', room: '', confidence: 'high', derivedMetricRole: 'grid_feed_in' },
                ]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        expect(setCatalogEntry.getCall(0).args[1].derivedMetricGroupId).to.equal('sun2000.0');
        expect(setCatalogEntry.getCall(1).args[1].derivedMetricGroupId).to.equal('sun2000.0');
    });

    it('catches a duplicate role proposed in a later batch of the same instance (instance larger than BATCH_SIZE)', async () => {
        // 21 objects of the same adapter instance -> buildBatches (size 20) splits it into two
        // batches. Only obj0 (batch 1) and obj20 (batch 2, alone) propose a role, both the same
        // one -> obj20's batch-local roleKeyCounts is 1 (no in-batch duplicate), so this only
        // gets caught if assignedRoleKeys persists across the batch loop from batch 1 to batch 2.
        const discovered = Array.from({ length: 21 }, (unused, i) => ({
            id: `sun2000.0.obj${i}`,
            historyInstance: 'influxdb.0',
            common: { name: `obj${i}` },
        }));
        const provider = {
            chat: sinon.stub().callsFake(({ messages }) => {
                const requested = JSON.parse(messages[0].content.split('Objekte:\n')[1]);
                const content = requested.map((obj) => ({
                    sourceId: obj.sourceId, description: obj.sourceId, unit: 'kWh',
                    category: 'consumption', room: '', confidence: 'high',
                    derivedMetricRole: (obj.sourceId === 'sun2000.0.obj0' || obj.sourceId === 'sun2000.0.obj20') ? 'battery_charge' : null,
                }));
                return Promise.resolve({ content: JSON.stringify(content) });
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        expect(provider.chat.callCount).to.equal(2); // 21 objects / BATCH_SIZE 20 -> two batches
        const obj0Call = setCatalogEntry.getCalls().find((call) => call.args[1].sourceId === 'sun2000.0.obj0');
        const obj20Call = setCatalogEntry.getCalls().find((call) => call.args[1].sourceId === 'sun2000.0.obj20');
        expect(obj0Call.args[1].derivedMetricRole).to.equal('battery_charge'); // first claim (batch 1) succeeds
        expect(obj20Call.args[1]).to.not.have.property('derivedMetricRole'); // second claim (batch 2) blocked by assignedRoleKeys
        expect(obj20Call.args[1].needsReview).to.equal(true);
    });

    it('leaves entries untouched when the LLM proposes no role, unchanged from prior behaviour', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{ sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.not.have.property('derivedMetricRole');
        expect(entry.needsReview).to.equal(false);
    });
```

- [ ] **Step 2: Tests ausführen, erwarteter Zustand: die 8 neuen Tests FAIL, alle übrigen weiterhin PASS**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: FAIL — `entry.derivedMetricRole` ist bislang nie gesetzt, `needsReview` ignoriert Rollenvorschläge.

- [ ] **Step 3: `lib/onboarding.js` implementieren**

Ergänze den Import (bereits in Task 6 auf `DERIVED_METRIC_ROLES, HVAC_ROLES` erweitert) um die zwei Prädikat-Funktionen:

```js
const { getAllCatalogEntries, setCatalogEntry, CATEGORIES, DERIVED_METRIC_ROLES, HVAC_ROLES, isDerivedMetricRoleValueKindValid, isHvacRoleValueKindValid } = require('./catalog');
```

Füge in `runOnboarding`, direkt nach der bestehenden Zeile `const roomLookup = await buildRoomLookup(adapter);` (aktuell Zeile 122), die Vorbelegung der Duplikat-Erkennung ein:

```js
    const assignedRoleKeys = new Set(
        existing
            .filter((entry) => entry.derivedMetricRole && entry.derivedMetricGroupId)
            .map((entry) => `${entry.derivedMetricGroupId}::${entry.derivedMetricRole}`)
    );
```

Füge innerhalb der Batch-Schleife, direkt nach dem bestehenden `classifications = validateClassificationResults(...)`-Aufruf im try-Block (aktuell Zeile 178, vor dem schließenden `} catch (error) {`), die Batch-weite Rollen-Zählung ein — das erfordert, den Aufbau **nach** dem try/catch-Block zu platzieren (die Zählung braucht nur erfolgreich geparste `classifications`, nicht den Fehlerfall):

```js
        let classifications;
        try {
            const response = await provider.chat({
                system: 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.',
                messages: [{ role: 'user', content: prompt }],
                tools: [],
            });

            if (response.usage) {
                try {
                    await recordUsage(adapter, response.usage, 'onboarding');
                } catch (usageError) {
                    if (adapter.log && adapter.log.warn) {
                        adapter.log.warn(`Onboarding-Verbrauch nicht erfasst: ${usageError.message}`);
                    }
                }
            }

            classifications = validateClassificationResults(parseClassificationResponse(response.content), batch);
        } catch (error) {
            if (adapter.log) {
                adapter.log.error(`Onboarding-Batch fehlgeschlagen: ${error.message}`);
            }
            continue;
        }

        const roleKeyCounts = new Map();
        for (const classification of classifications) {
            if (!classification.derivedMetricRole) continue;
            const source = batch.find((obj) => obj.id === classification.sourceId);
            if (!source) continue;
            const key = `${adapterInstanceOf(source.id)}::${classification.derivedMetricRole}`;
            roleKeyCounts.set(key, (roleKeyCounts.get(key) || 0) + 1);
        }
```

(Dieser Block ersetzt die bisherige Zeile `classifications = validateClassificationResults(parseClassificationResponse(response.content), batch);` bis zum Ende des `catch`-Blocks — der gezeigte Code enthält den unveränderten bestehenden try/catch vollständig, damit die Einfügestelle eindeutig ist, plus die neue `roleKeyCounts`-Berechnung direkt danach.)

Ersetze den Entry-Aufbau innerhalb der `for (const classification of classifications)`-Schleife (aktuell Zeile 186-224). Der Block von `const finalClassification = classification;` bis `};` (Ende des `entry`-Objekt-Literals) wird zu:

```js
            const finalClassification = classification;
            let valueKindResult;
            try {
                valueKindResult = await classifyValueKind(adapter, source, source.historyInstance);
            } catch (error) {
                if (adapter.log && adapter.log.warn) {
                    adapter.log.warn(`valueKind-Klassifizierung fuer ${source.id} fehlgeschlagen, verwende Fallback: ${error.message}`);
                }
                valueKindResult = { valueKind: 'gauge', valueKindConfidence: 'low', valueKindSource: 'metadata' };
            }
            let dataQualityResult;
            try {
                dataQualityResult = await classifyDataQuality(adapter, source, source.historyInstance);
            } catch (error) {
                if (adapter.log && adapter.log.warn) {
                    adapter.log.warn(`Datenqualitaets-Klassifizierung fuer ${source.id} fehlgeschlagen, verwende Fallback: ${error.message}`);
                }
                dataQualityResult = { writable: false, writePattern: 'unknown', updateFrequency: 'unknown', dataCompleteness: 'unknown' };
            }

            const roleFields = {};
            let needsReviewForRole = false;

            if (finalClassification.derivedMetricRole) {
                needsReviewForRole = true;
                const proposedRole = finalClassification.derivedMetricRole;
                const groupId = adapterInstanceOf(source.id);
                const roleKey = `${groupId}::${proposedRole}`;
                const isDuplicate = (roleKeyCounts.get(roleKey) || 0) > 1 || assignedRoleKeys.has(roleKey);
                const isCompatible = DERIVED_METRIC_ROLES.has(proposedRole) && isDerivedMetricRoleValueKindValid(proposedRole, valueKindResult.valueKind);
                if (isCompatible && !isDuplicate) {
                    roleFields.derivedMetricRole = proposedRole;
                    roleFields.derivedMetricGroupId = groupId;
                    assignedRoleKeys.add(roleKey);
                } else if (adapter.log && adapter.log.warn) {
                    adapter.log.warn(`Onboarding: derivedMetricRole '${proposedRole}' fuer ${source.id} verworfen (${isDuplicate ? `Duplikat in Gruppe ${groupId}` : `passt nicht zu valueKind '${valueKindResult.valueKind}'`}).`);
                }
            }

            if (finalClassification.hvacRole) {
                needsReviewForRole = true;
                const proposedHvacRole = finalClassification.hvacRole;
                if (HVAC_ROLES.has(proposedHvacRole) && isHvacRoleValueKindValid(valueKindResult.valueKind)) {
                    roleFields.hvacRole = proposedHvacRole;
                } else if (adapter.log && adapter.log.warn) {
                    adapter.log.warn(`Onboarding: hvacRole '${proposedHvacRole}' fuer ${source.id} passt nicht zu valueKind '${valueKindResult.valueKind}', wird verworfen.`);
                }
            }

            const entry = {
                sourceId: finalClassification.sourceId,
                description: finalClassification.description,
                unit: textValue(finalClassification.unit || source.common.unit),
                category: finalClassification.category,
                room: roomLookup.get(source.id) || finalClassification.room || '',
                confidence: finalClassification.confidence,
                needsReview: finalClassification.confidence === 'low' || needsReviewForRole,
                classificationSource: 'llm',
                active: true,
                ignored: false,
                historyInstance: source.historyInstance,
                lastSeen: new Date().toISOString(),
                ...valueKindResult,
                ...dataQualityResult,
                ...roleFields,
            };
```

Der Rest der Schleife (Log-Zeile, `try { await setCatalogEntry(...) } catch`, `processedCount`/`emitProgress`) bleibt unverändert.

- [ ] **Step 4: Tests ausführen, erwarteter Zustand: alle PASS**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS (alle bisherigen + 8 neue Tests).

- [ ] **Step 5: Vollen Unit-Testlauf und Lint prüfen**

Run: `npm run test:unit && npm run lint`
Expected: alle PASS, keine neuen Lint-Fehler.

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "feat: apply and guard KI-suggested derivedMetricRole/hvacRole during onboarding"
```

---

### Task 8: `main.js` — Systemprompt-Hinweis für `grid_power`/`battery_power`

**Files:**
- Modify: `main.js:638-653` (proaktive Prüfung), `main.js:720-733` (Chat)

**Interfaces:**
- Keine neuen Funktionen — reiner Text-Zusatz in zwei bestehenden String-Konkatenationen.

- [ ] **Step 1: Ergänzung in der proaktiven Prüfung (nach der bestehenden `dataCompleteness`-Zeile, aktuell Zeile 651, vor der `Die statistische Voranalyse`-Zeile)**

```js
                     'Bei einem Objekt mit derivedMetricRole "grid_power" oder "battery_power" (Momentanleistung, kein Zaehler) ' +
                     'liefert getPeriodTotal/comparePeriods min/max als Spitzenlast in beide Richtungen; ohne derivedMetricInverted (Standard) ' +
                     'ist bei grid_power positiv = Netzbezug/negativ = Einspeisung, bei battery_power positiv = Laden/negativ = Entladen — ' +
                     'ist derivedMetricInverted gesetzt, gilt die jeweils umgekehrte Zuordnung. ' +
```

- [ ] **Step 2: Identische Ergänzung im Chat-Systemprompt (nach der bestehenden `dataCompleteness`-Zeile, aktuell Zeile 727, vor der Standort-Zeile)**

```js
                 'Bei einem Objekt mit derivedMetricRole "grid_power" oder "battery_power" (Momentanleistung, kein Zaehler) ' +
                 'liefert getPeriodTotal/comparePeriods min/max als Spitzenlast in beide Richtungen; ohne derivedMetricInverted (Standard) ' +
                 'ist bei grid_power positiv = Netzbezug/negativ = Einspeisung, bei battery_power positiv = Laden/negativ = Entladen — ' +
                 'ist derivedMetricInverted gesetzt, gilt die jeweils umgekehrte Zuordnung. ' +
```

- [ ] **Step 3: Grep-Verifikation statt dediziertem Test (Systemprompt-Strings werden im bestehenden Testkorpus nicht wörtlich geprüft)**

Run: `grep -n "grid_power" main.js`
Expected: zwei Treffer (proaktive Prüfung + Chat).

- [ ] **Step 4: Vollen Unit-Testlauf prüfen (Regression, main.test.js prüft u. a. Prompt-Aufbau strukturell)**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "docs: explain grid_power/battery_power min/max semantics in both system prompts"
```

---

### Task 9: Abschlussverifikation, Dokumentation, Worklog

**Files:**
- Modify: `WORKLOG.md`, `docs/architecture/11-risiken-und-schulden.md`

**Interfaces:** keine (Dokumentation).

- [ ] **Step 1: Vollständige Verifikation**

Run: `npm test && npm run lint && npm run build:admin`
Expected: `npm test` (= `test:unit` + `test:admin`) PASS, `npm run lint` ohne Fehler, `npm run build:admin` baut ohne Fehler durch.

- [ ] **Step 2: `docs/architecture/11-risiken-und-schulden.md` — bewusste Nicht-Entscheidung dokumentieren**

Füge vor der Schlusszeile `---` (aktuell Zeile 65) einen neuen Bullet-Punkt ein:

```markdown
- **Kein Leistungs-Integrations-Feature fuer die Energiebilanz (2026-09-07):** Reale Wechselrichter/Speicher (z. B. Huawei SUN2000) liefern Netz-/Batterieleistung teils nur als signiertes Momentanleistungsregister (gauge), nicht als getrennte Lifetime-Zaehler. Eine Tagesenergie per Watt-Zeit-Integration aus diesem Wert zu berechnen wurde bewusst NICHT gebaut: bei lueckenhaftem Logging verzerrt eine Integration die Tagessumme systematisch, und genau diese Summen fliessen in die automatische Bilanz-Anomalieerkennung ein. Stattdessen: zwei neue, rein informative Rollen `grid_power`/`battery_power` (nur `valueKind: gauge`) fuer Spitzenlast-Auswertung ueber die bestehenden `getPeriodTotal`/`compareTimeframes`-Werkzeuge (min/max), ausserhalb der Bilanz-Pflichtrollen. Die Bilanz-Residuum-Berechnung selbst verlangt weiterhin ausschliesslich Zaehler-artige Rollen (`daily_reset_counter`/`cumulative_total`), jetzt auch aktiv durchgesetzt statt nur implizit vorausgesetzt. Siehe [Spec](../specs/2026-09-07-energiebilanz-signierte-datenpunkte.md).
```

- [ ] **Step 3: `WORKLOG.md` aktualisieren**

Lies `WORKLOG.md` und ersetze den `## WIP`-Abschnitt (Branch/Status) durch den Merge-fertigen Stand dieses Features, und ergänze unter `## DONE` einen neuen Punkt analog zu den bestehenden Einträgen (Beispieltext, an das tatsächliche `git log`/den tatsächlichen Verifikationsstand anzupassen):

```markdown
## WIP

- Branch: `feature/energiebilanz-signierte-datenpunkte` (aus `master`), bereit zum Merge.
- Status: alle neun Tasks der Spec umgesetzt, `npm test`/`npm run lint`/`npm run build:admin` grün.

## TODO

- Nächste Produktaufgabe: [unverändert aus vorherigem Stand übernehmen, ausser bereits erledigt]
```

Und unter `## DONE`, oberhalb des bisher jüngsten Eintrags:

```markdown
- Energiebilanz-Rollen gegen `valueKind` abgesichert und um Spitzenlast-Rollen erweitert (2026-09-07): `derivedMetricRole` fuer die sechs Bilanz-Rollen verlangt jetzt `daily_reset_counter`/`cumulative_total` (verhindert stilles `NaN` im Residuum bei versehentlicher Zuweisung an einen `gauge`-Datenpunkt); zwei neue Rollen `grid_power`/`battery_power` (nur `gauge`) plus `derivedMetricInverted` fuer Spitzenlast-Auswertung ueber die bestehenden `getPeriodTotal`/`compareTimeframes`-Werkzeuge, ausserhalb der Bilanz-Pflichtrollen. KI-Onboarding schlaegt jetzt zusaetzlich zu `category` auch `derivedMetricRole`/`hvacRole` vor (Batching jetzt pro Adapter-**Instanz** statt Adapter-Typ), mit Vorpruefung gegen die neue Regel (inkompatible/doppelte Vorschlaege werden verworfen statt den ganzen Katalogeintrag abzulehnen) und erzwungenem `needsReview` bei jedem Rollenvorschlag. Bewusst NICHT gebaut: eine Leistungs-Integration fuer Tagesenergie aus einem signierten Momentanleistungswert (Genauigkeitsrisiko bei lueckenhaftem Logging), siehe `docs/architecture/11-risiken-und-schulden.md`. Siehe [Spec](docs/specs/2026-09-07-energiebilanz-signierte-datenpunkte.md).
```

- [ ] **Step 4: Commit der Dokumentations-Änderungen**

```bash
git add WORKLOG.md docs/architecture/11-risiken-und-schulden.md
git commit -m "docs: close out energiebilanz-signierte-datenpunkte worklog entry"
```

- [ ] **Step 5: Push und Merge (nach CONTRIBUTING.md)**

Lies `CONTRIBUTING.md` für den exakten Merge-/Versionierungs-/Release-Ablauf dieses Projekts (Versionsbump in `package.json`/`io-package.json`, `CHANGELOG.md`-Eintrag, Merge-Strategie nach `master`, Tag/Release) und führe ihn aus. Dieser Task endet bewusst ohne vorformulierte Merge-/Release-Kommandos, da `CONTRIBUTING.md` die verbindliche, versionsabhängige Abfolge vorgibt (siehe z. B. die Commit-Historie: `merge: harden onboarding and device table` gefolgt von `release: publish beta.51` als Muster der letzten zwei Releases).
