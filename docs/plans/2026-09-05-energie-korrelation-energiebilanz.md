# Energie-Korrelation (Energiebilanz) — Implementierungsplan

Spec: `docs/specs/2026-09-05-energie-korrelation-energiebilanz.md`

Umgesetzt inline in der laufenden Session. TDD pro Schritt.

## Global Constraints

- Pflichtrollen pro Gruppe: `pv_generation`, `grid_import`, `grid_feed_in`,
  `consumption` (je genau ein Objekt). Optional: `battery_charge`,
  `battery_discharge` (beide gesetzt oder beide fehlend — nur eine von
  beiden ist unvollständig und führt zum Überspringen der Gruppe).
- `residual = (pv + gridImport + batteryDischarge) - (gridFeedIn + batteryCharge + consumption)`
- Statistik: `detectDailyAggregateAnomaly` aus `lib/anomalyDetector.js`
  wiederverwenden, keine neue Schwelle.
- `reason` wird von `'deviation'`/`'missing_data'` auf
  `'energy_balance_deviation'`/`'energy_balance_missing_data'` umgemappt.

---

## Task 1: `DERIVED_METRIC_ROLES` um vier Energie-Rollen erweitern

**Dateien:**
- Ändern: `lib/catalog.js`, `lib/adminCommands.js`, `src-admin/src/Components.jsx`
- Test: `test/unit/catalog.test.js`, `test/unit/adminCommands.test.js`,
  `test/admin/csvHelpers.test.jsx`

- [ ] **Schritt 1: Rote Tests**

```js
// test/unit/catalog.test.js
it('accepts the new energy balance roles', () => {
    for (const role of ['grid_import', 'battery_charge', 'battery_discharge', 'consumption']) {
        const entry = validateCatalogEntry({ sourceId: 'x', category: 'consumption', derivedMetricRole: role, derivedMetricGroupId: 'energy-1' });
        expect(entry.derivedMetricRole).to.equal(role);
    }
});
```

```js
// test/unit/adminCommands.test.js
it('accepts the new energy balance roles', async () => {
    const setCatalogEntry = sinon.stub().resolves();
    const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
        getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'consumption' }]),
        setCatalogEntry,
    });

    const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'grid_import', derivedMetricGroupId: 'energy-1' });

    expect(result.entry).to.deep.include({ derivedMetricRole: 'grid_import', derivedMetricGroupId: 'energy-1' });
});
```

```js
// test/admin/csvHelpers.test.jsx (in der bestehenden it, neue Zeile)
expect(validateCatalogImportValue('derivedMetricRole', 'battery_charge')).toBe('battery_charge');
```

- [ ] **Schritt 2:** Tests laufen lassen → FAIL (Rollen noch nicht im
      jeweiligen `Set`/Array).

- [ ] **Schritt 3: Implementieren**

`lib/catalog.js`:

```js
const DERIVED_METRIC_ROLES = new Set(['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption']);
```

`lib/adminCommands.js`: identische `DERIVED_METRIC_ROLES`-Konstante
erweitern.

`src-admin/src/Components.jsx`:

```js
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption'];
```

- [ ] **Schritt 4:** Tests laufen lassen → PASS.

## Task 2: `lib/energyBalance.js` (neues Modul)

**Dateien:**
- Neu: `lib/energyBalance.js`
- Test: `test/unit/energyBalance.test.js` (neu)

**Interfaces:**
- Konsumiert: `computePeriodValue(adapter, entry, period)`,
  `resolvePeriod(period, now)` aus `./periodValue`;
  `detectDailyAggregateAnomaly` aus `./anomalyDetector`
- Produziert: `findEnergyBalanceCandidates(adapter, entries, now) =>
  Promise<{ candidates: object[], failedCount: number }>`

- [ ] **Schritt 1: Roten Test schreiben** — neue Datei
      `test/unit/energyBalance.test.js`:

```js
// test/unit/energyBalance.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadEnergyBalanceWithStubs({ computePeriodValue, resolvePeriod, detectDailyAggregateAnomaly }) {
    return proxyquire('../../lib/energyBalance', {
        './periodValue': {
            computePeriodValue,
            resolvePeriod: resolvePeriod || ((period) => ({ start: period.dayOffset, end: period.dayOffset + 1 })),
        },
        './anomalyDetector': {
            detectDailyAggregateAnomaly: detectDailyAggregateAnomaly || require('../../lib/anomalyDetector').detectDailyAggregateAnomaly,
        },
    });
}

function makeGroup(overrides = {}) {
    const base = {
        historyInstance: 'history.0',
        valueKind: 'cumulative_total',
        derivedMetricGroupId: 'energy-1',
        active: true,
        dataCompleteness: 'complete',
    };
    return [
        { ...base, sourceId: 'pv.0.total', description: 'PV-Erzeugung', derivedMetricRole: 'pv_generation' },
        { ...base, sourceId: 'grid.0.import', description: 'Netzbezug', derivedMetricRole: 'grid_import' },
        { ...base, sourceId: 'grid.0.feedin', description: 'Netzeinspeisung', derivedMetricRole: 'grid_feed_in' },
        { ...base, sourceId: 'meter.0.consumption', description: 'Verbrauch', derivedMetricRole: 'consumption' },
    ].map((entry) => ({ ...entry, ...(overrides[entry.derivedMetricRole] || {}) }));
}

describe('findEnergyBalanceCandidates', () => {
    it('reports a deviation candidate when the residual is a statistical outlier', async () => {
        // 7 Baseline-Tage: residual ~ 0 (pv=100, gridImport=0, feedIn=50, consumption=50)
        // Letzter Tag: residual weicht stark ab (consumption viel niedriger als erwartet)
        const computePeriodValue = sinon.stub();
        // Aufrufreihenfolge je Tag (8 Tage): pv, gridImport, gridFeedIn, batteryCharge(=keins, uebersprungen), batteryDischarge(=keins), consumption
        // Da keine Batterie-Rollen vorhanden sind, werden dafuer keine computePeriodValue-Aufrufe erwartet.
        for (let day = 0; day < 7; day++) {
            computePeriodValue.onCall(day * 4 + 0).resolves({ total: 100 });
            computePeriodValue.onCall(day * 4 + 1).resolves({ total: 0 });
            computePeriodValue.onCall(day * 4 + 2).resolves({ total: 50 });
            computePeriodValue.onCall(day * 4 + 3).resolves({ total: 50 });
        }
        computePeriodValue.onCall(28).resolves({ total: 100 });
        computePeriodValue.onCall(29).resolves({ total: 0 });
        computePeriodValue.onCall(30).resolves({ total: 50 });
        computePeriodValue.onCall(31).resolves({ total: 5 });

        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, makeGroup(), 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.have.lengthOf(1);
        expect(result.candidates[0]).to.include({ groupId: 'energy-1', reason: 'energy_balance_deviation', hasBattery: false });
        expect(result.candidates[0].currentResidual).to.equal(45);
        expect(result.failedCount).to.equal(0);
    });

    it('does not flag a stable balance', async () => {
        const computePeriodValue = sinon.stub();
        computePeriodValue.callsFake((adapter, entry) => {
            if (entry.derivedMetricRole === 'pv_generation') return Promise.resolve({ total: 100 });
            if (entry.derivedMetricRole === 'grid_import') return Promise.resolve({ total: 0 });
            if (entry.derivedMetricRole === 'grid_feed_in') return Promise.resolve({ total: 50 });
            return Promise.resolve({ total: 50 });
        });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, makeGroup(), 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
    });

    it('treats missing battery roles as zero and reports hasBattery: false', async () => {
        const computePeriodValue = sinon.stub().resolves({ total: 10 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        await findEnergyBalanceCandidates({}, makeGroup(), 30 * 24 * 3600 * 1000);

        // 4 Pflichtrollen * 8 Tage = 32 Aufrufe, keine fuer Batterie
        expect(computePeriodValue.callCount).to.equal(32);
    });

    it('includes battery roles in the residual when both are present', async () => {
        const entries = makeGroup({
            grid_import: {},
        }).concat([
            { sourceId: 'battery.0.charge', historyInstance: 'history.0', valueKind: 'cumulative_total', derivedMetricGroupId: 'energy-1', derivedMetricRole: 'battery_charge', active: true, dataCompleteness: 'complete', description: 'Batterieladung' },
            { sourceId: 'battery.0.discharge', historyInstance: 'history.0', valueKind: 'cumulative_total', derivedMetricGroupId: 'energy-1', derivedMetricRole: 'battery_discharge', active: true, dataCompleteness: 'complete', description: 'Batterieentladung' },
        ]);
        const computePeriodValue = sinon.stub().resolves({ total: 0 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        await findEnergyBalanceCandidates({}, entries, 30 * 24 * 3600 * 1000);

        // 6 Rollen * 8 Tage = 48 Aufrufe
        expect(computePeriodValue.callCount).to.equal(48);
    });

    it('skips a group with only one of the two battery roles', async () => {
        const entries = makeGroup().concat([
            { sourceId: 'battery.0.charge', historyInstance: 'history.0', valueKind: 'cumulative_total', derivedMetricGroupId: 'energy-1', derivedMetricRole: 'battery_charge', active: true, dataCompleteness: 'complete', description: 'Batterieladung' },
        ]);
        const computePeriodValue = sinon.stub().resolves({ total: 0 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, entries, 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(computePeriodValue.called).to.equal(false);
    });

    it('skips a group missing a required role', async () => {
        const entries = makeGroup().filter((entry) => entry.derivedMetricRole !== 'consumption');
        const computePeriodValue = sinon.stub().resolves({ total: 0 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, entries, 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(computePeriodValue.called).to.equal(false);
    });

    it('skips a group with a duplicated required role', async () => {
        const entries = makeGroup().concat([{ sourceId: 'pv.1.total', historyInstance: 'history.0', valueKind: 'cumulative_total', derivedMetricGroupId: 'energy-1', derivedMetricRole: 'pv_generation', active: true, dataCompleteness: 'complete', description: 'Zweite PV' }]);
        const computePeriodValue = sinon.stub().resolves({ total: 0 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, entries, 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
    });

    it('isolates history failures per group without aborting other groups', async () => {
        const warn = sinon.stub();
        const computePeriodValue = sinon.stub().rejects(new Error('History offline'));
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({ log: { warn } }, makeGroup(), 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(result.failedCount).to.equal(1);
        expect(warn.calledOnce).to.equal(true);
    });
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/energyBalance.test.js` → FAIL
      (Modul existiert nicht).

- [ ] **Schritt 3: Implementieren** — `lib/energyBalance.js`:

```js
// lib/energyBalance.js
'use strict';

const { computePeriodValue, resolvePeriod } = require('./periodValue');
const { detectDailyAggregateAnomaly } = require('./anomalyDetector');

const REQUIRED_ROLES = ['pv_generation', 'grid_import', 'grid_feed_in', 'consumption'];
const BATTERY_ROLES = ['battery_charge', 'battery_discharge'];
const BASELINE_DAY_OFFSETS = [-8, -7, -6, -5, -4, -3, -2];
const CURRENT_DAY_OFFSET = -1;
const DATA_COMPLETENESS_SEVERITY = { stale: 2, gaps: 1, unknown: 0, complete: 0 };

function isEnergyBalanceCandidate(entry) {
    return Boolean(entry && entry.active !== false && !entry.ignored && entry.derivedMetricGroupId && entry.derivedMetricRole);
}

function groupByDerivedMetricGroupId(entries) {
    const groups = new Map();
    for (const entry of entries.filter(isEnergyBalanceCandidate)) {
        if (!groups.has(entry.derivedMetricGroupId)) groups.set(entry.derivedMetricGroupId, []);
        groups.get(entry.derivedMetricGroupId).push(entry);
    }
    return groups;
}

function resolveGroupRoles(groupEntries) {
    const byRole = {};
    for (const role of [...REQUIRED_ROLES, ...BATTERY_ROLES]) {
        const matches = groupEntries.filter((entry) => entry.derivedMetricRole === role);
        if (matches.length > 1) return null;
        byRole[role] = matches[0];
    }
    if (REQUIRED_ROLES.some((role) => !byRole[role])) return null;
    const hasBatteryCharge = Boolean(byRole.battery_charge);
    const hasBatteryDischarge = Boolean(byRole.battery_discharge);
    if (hasBatteryCharge !== hasBatteryDischarge) return null;
    return { ...byRole, hasBattery: hasBatteryCharge };
}

function worstDataCompleteness(entries) {
    let worst = 'unknown';
    for (const entry of entries) {
        const severity = DATA_COMPLETENESS_SEVERITY[entry.dataCompleteness] || 0;
        if (severity > (DATA_COMPLETENESS_SEVERITY[worst] || 0)) worst = entry.dataCompleteness;
    }
    return worst;
}

async function residualForDay(adapter, roles, dayOffset, now) {
    const period = resolvePeriod({ dayOffset }, now);
    const totals = {};
    for (const role of REQUIRED_ROLES) {
        totals[role] = (await computePeriodValue(adapter, roles[role], period)).total;
    }
    totals.battery_charge = roles.battery_charge ? (await computePeriodValue(adapter, roles.battery_charge, period)).total : 0;
    totals.battery_discharge = roles.battery_discharge ? (await computePeriodValue(adapter, roles.battery_discharge, period)).total : 0;
    return (totals.pv_generation + totals.grid_import + totals.battery_discharge)
        - (totals.grid_feed_in + totals.battery_charge + totals.consumption);
}

async function findEnergyBalanceCandidates(adapter, entries, now = Date.now()) {
    const groups = groupByDerivedMetricGroupId(entries || []);
    const candidates = [];
    let failedCount = 0;

    for (const [groupId, groupEntries] of groups) {
        const roles = resolveGroupRoles(groupEntries);
        if (!roles) continue;

        try {
            const baselineValues = [];
            for (const dayOffset of BASELINE_DAY_OFFSETS) {
                baselineValues.push(await residualForDay(adapter, roles, dayOffset, now));
            }
            const currentValue = await residualForDay(adapter, roles, CURRENT_DAY_OFFSET, now);
            const dataCompleteness = worstDataCompleteness(REQUIRED_ROLES.map((role) => roles[role]));

            const evidence = detectDailyAggregateAnomaly({ currentValue, baselineValues, dataCompleteness });
            if (!evidence) continue;

            candidates.push({
                groupId,
                reason: evidence.reason === 'deviation' ? 'energy_balance_deviation' : 'energy_balance_missing_data',
                currentResidual: evidence.currentValue,
                baselineMedianResidual: evidence.baselineMedian,
                robustZ: evidence.robustZ,
                relativeChange: evidence.relativeChange,
                currentCount: evidence.currentCount,
                baselineCount: evidence.baselineCount,
                dataCompleteness: evidence.dataCompleteness,
                hasBattery: roles.hasBattery,
                pvSourceId: roles.pv_generation.sourceId,
                pvDescription: roles.pv_generation.description,
                gridImportSourceId: roles.grid_import.sourceId,
                gridImportDescription: roles.grid_import.description,
                gridFeedInSourceId: roles.grid_feed_in.sourceId,
                gridFeedInDescription: roles.grid_feed_in.description,
                consumptionSourceId: roles.consumption.sourceId,
                consumptionDescription: roles.consumption.description,
            });
        } catch (error) {
            failedCount++;
            if (adapter.log && adapter.log.warn) {
                adapter.log.warn(`Energiebilanz fuer Gruppe '${groupId}' fehlgeschlagen: ${error.message}`);
            }
        }
    }

    return { candidates, failedCount };
}

module.exports = { findEnergyBalanceCandidates };
```

- [ ] **Schritt 4:** `npx mocha test/unit/energyBalance.test.js` → PASS.

**Hinweis zum ersten Testfall** ("reports a deviation candidate..."): Die
`onCall`-Indizes gehen davon aus, dass `residualForDay` die vier
Pflichtrollen **in `REQUIRED_ROLES`-Reihenfolge** abruft
(`pv_generation, grid_import, grid_feed_in, consumption`) und die
Baseline-Tage **in `BASELINE_DAY_OFFSETS`-Reihenfolge** vor dem aktuellen
Tag berechnet werden. Beim Ausführen genau prüfen, ob die tatsächliche
Aufrufreihenfolge dazu passt; falls nicht, den Test an die reale
(korrekte) Reihenfolge anpassen statt die Produktionslogik zu verbiegen.

## Task 3: Integration in `main.js`

**Dateien:**
- Ändern: `main.js`
- Test: `test/unit/main.test.js`

- [ ] **Schritt 1: Rote Tests** — `loadMainWithProactiveStubs` um
      `energyCandidates`/`energyFailedCount` erweitern:

```js
function loadMainWithProactiveStubs({ candidates, runAgent, hvacCandidates, hvacFailedCount, energyCandidates, energyFailedCount } = {}) {
    const appendChatMessage = sinon.stub().resolves();
    const recordUsage = sinon.stub().resolves();
    const findAnomalyCandidates = sinon.stub().resolves(candidates || []);
    const findHvacCorrelationCandidates = sinon.stub().resolves({ candidates: hvacCandidates || [], failedCount: hvacFailedCount || 0 });
    const findEnergyBalanceCandidates = sinon.stub().resolves({ candidates: energyCandidates || [], failedCount: energyFailedCount || 0 });
    const isEligibleCatalogEntry = sinon.stub().returns(true);
    const isBudgetExceeded = sinon.stub().resolves(false);
    const { AiAnalytics: TestAdapter } = proxyquire.noCallThru()('../../main', {
        '@iobroker/adapter-core': { Adapter: class {} },
        './lib/anomalyDetector': { findAnomalyCandidates, isEligibleCatalogEntry },
        './lib/hvacCorrelation': { findHvacCorrelationCandidates },
        './lib/energyBalance': { findEnergyBalanceCandidates },
        './lib/catalog': { getAllCatalogEntries: sinon.stub().resolves([]), setCatalogEntry: sinon.stub(), markInactive: sinon.stub() },
        './lib/usage': { isBudgetExceeded, recordUsage },
        './lib/chatLog': { appendChatMessage, ensureChatHistoryState: sinon.stub(), getRecentChatHistory: sinon.stub() },
        './lib/historyHealth': { consumeFailureReports: sinon.stub().resolves([]), ensureHealthState: sinon.stub() },
        './lib/promptContext': { buildTimeAndLocationContext: sinon.stub().resolves('Zeitkontext\n') },
        './lib/agent': { MAX_ITERATIONS: 3, runAgent: runAgent || sinon.stub().resolves({ finalText: 'Auffaelligkeit gefunden.', usage: {} }) },
    });
    return { TestAdapter, appendChatMessage, findAnomalyCandidates, findHvacCorrelationCandidates, findEnergyBalanceCandidates, recordUsage, runAgent };
}
```

Neue Tests, nach den bestehenden HVAC-Tests:

```js
it('merges energy balance candidates with the other candidates', async () => {
    const energyCandidates = [{ groupId: 'energy-1', reason: 'energy_balance_deviation', currentResidual: 45 }];
    const loaded = loadMainWithProactiveStubs({ energyCandidates });
    const adapter = makeAdapter(loaded.TestAdapter);

    const result = await adapter.runProactiveCheck();

    expect(result).to.deep.equal({ skipped: false });
    expect(loaded.findEnergyBalanceCandidates.calledOnce).to.equal(true);
});

it('combines statistical, HVAC, and energy balance failure counts', async () => {
    const candidates = [];
    Object.defineProperty(candidates, 'failedCount', { value: 1 });
    const loaded = loadMainWithProactiveStubs({ candidates, hvacFailedCount: 1, energyFailedCount: 1 });
    const adapter = makeAdapter(loaded.TestAdapter);

    const result = await adapter.runProactiveCheck();

    expect(result).to.deep.include({ skipped: false, incomplete: true, failedCount: 3 });
});
```

- [ ] **Schritt 2:** `npx mocha test/unit/main.test.js` → FAIL.

- [ ] **Schritt 3: Implementieren** — in `main.js`:

Import ergänzen:

```js
const { findEnergyBalanceCandidates } = require('./lib/energyBalance');
```

Nach dem bestehenden HVAC-Block (innerhalb desselben äußeren `try`, eigener
innerer `try/catch`):

```js
            try {
                const energyResult = await findEnergyBalanceCandidates(this, catalogEntries, Date.now());
                anomalyCandidates = [...anomalyCandidates, ...energyResult.candidates];
                totalFailedCount += energyResult.failedCount || 0;
            } catch (error) {
                this.log.warn(`Energiebilanz-Korrelation fehlgeschlagen: ${error.message}`);
            }
```

Systemprompt-Zusatz (im bestehenden String, nach dem HVAC-Satz):

```js
                    '"energy_balance_deviation" bedeutet: PV-Erzeugung, Netzbezug, Netzeinspeisung, Batterie und Verbrauch einer Energie-Gruppe ergeben in Summe nicht die erwartete Bilanz. ' +
```

- [ ] **Schritt 4:** `npx mocha test/unit/main.test.js` → PASS.

## Abschlussverifikation

- [ ] `npm test` (Unit + Admin) grün.
- [ ] `npm run lint` grün.
- [ ] `npm run build:admin` grün (Components.jsx geändert).
- [ ] Diff-Review: `getSelfConsumption` (Sub-A), `hvacCorrelation.js`
      (Sub-C) und Phase-1/2-Anomalieerkennung unverändert.
