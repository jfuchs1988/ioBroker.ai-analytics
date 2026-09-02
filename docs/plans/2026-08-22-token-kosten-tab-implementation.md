# Token-Kosten-Tab Implementation Plan

> **Status: abgeschlossen (2026-08-23).** Verbrauchshistorie, getrennte Onboarding-Verbrauchserfassung, manuelle Preisfelder, Kostenanzeige und Limit-Empfehlung sind umgesetzt und in `0.0.1-beta.5` dokumentiert. Die Checkboxen darunter stammen aus dem ursprünglichen TDD-Arbeitsplan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der bestehende Budget-Bereich im Geräte-Tab zeigt zusätzlich eine Verbrauchs-Historie (Balkendiagramm, wählbar 30 Tage/gesamt), berechnete Kosten (Chat/Prüfung + Onboarding getrennt, aus manuell gepflegten Preisen) und eine heuristische Tages-/Stunden-Limit-Empfehlung. Onboarding-Token-Verbrauch, der bisher gar nicht erfasst wurde, fließt jetzt korrekt ins Tagesbudget und die Historie ein.

**Architecture:** `lib/usage.js` bekommt einen zweiten, unbegrenzt wachsenden State (`usage.history`, ein Eintrag pro Kalendertag, Felder pro Zweck `chat`/`onboarding`) neben dem bestehenden `usage.today`. `recordUsage` bekommt einen dritten Parameter `purpose` (Default `'chat'`, rückwärtskompatibel). `lib/onboarding.js` ruft `recordUsage(..., 'onboarding')` nach jedem erfolgreichen Batch auf. Vier neue, manuell gepflegte Preis-Felder in der Admin-Config. `admin/tab.js` bekommt reine, testbare Berechnungsfunktionen (Zeitraum-Filter, Kosten, Empfehlung) plus DOM-Wiring, das den bestehenden Budget-Bereich erweitert (kein neuer Sub-Nav-Eintrag).

**Tech Stack:** Node.js/CommonJS (keine neuen Abhängigkeiten), Mocha/Chai/Sinon/Proxyquire, reines DOM/CSS fürs Balkendiagramm (kein Chart-Framework, passt zu [ADR-0009](../adr/0009-reines-javascript-kein-typescript.md)).

**Spec:** [docs/specs/2026-08-22-token-kosten-tab-design.md](../specs/2026-08-22-token-kosten-tab-design.md)

## Global Constraints

- Preise werden ausschließlich manuell in der Admin-Config gepflegt (kein externer Preislisten-Abruf, kein neuer "azure"-Providertyp).
- Kosten werden immer mit den *aktuell* konfigurierten Preisen berechnet, auch für vergangene Tage (keine historischen Preis-Snapshots).
- `usage.history` wächst unbegrenzt (keine Bereinigung/Rotation in dieser Runde).
- Kein gestapeltes/mehrfarbiges Chart — ein Balken pro Tag zeigt die Summe aus Chat+Onboarding.
- Die Limit-Empfehlung ist reiner Anzeigetext, keine neue Enforcement-Logik (`dailyTokenBudget` bleibt die einzige durchgesetzte Grenze).
- Bestehende Felder/States (`usage.today`, `formatBudgetLine`, die drei Sub-Nav-Einträge Chat/Geräte/Budget) bleiben unverändert in Name und Bedeutung.
- `npm test` muss vor jedem Commit auf `develop` grün sein.
- Ein Branch pro Task ([ADR-0019](../adr/0019-feature-branch-pro-task.md)): von `develop` abgezweigt, TDD-Commits darauf, nach grünem `npm test` lokal per `git merge --no-ff` zurück nach `develop`, danach Branch löschen.
- Keine Netzwerk-Calls in Tests — Provider/Sockets werden wie im gesamten Projekt üblich gemockt.

---

### Task 1: `lib/usage.js` — Verbrauchs-Historie pro Tag und Zweck

**Files:**
- Modify: `lib/usage.js`
- Modify: `test/unit/usage.test.js`

**Interfaces:**
- Produces: `getUsageHistory(adapter) => Promise<Array<{date, chat:{inputTokens,outputTokens}, onboarding:{inputTokens,outputTokens}}>>`, `HISTORY_STATE = 'usage.history'`, `recordUsage(adapter, usage, purpose = 'chat')` (dritter Parameter neu, optional).
- Consumes: nichts Neues aus anderen Tasks.

- [ ] **Step 1: Failing Tests ergänzen**

In `test/unit/usage.test.js`, die Import-Zeile erweitern:

```js
const { ensureUsageState, recordUsage, getTodayUsage, getUsageHistory, isBudgetExceeded, USAGE_STATE, HISTORY_STATE } = require('../../lib/usage');
```

Den bestehenden Test `'ensureUsageState creates the state object'` ersetzen durch (die Erwartung ändert sich legitim, da `ensureUsageState` jetzt zwei State-Objekte anlegt):

```js
    it('ensureUsageState creates both state objects', async () => {
        const adapter = makeAdapter();
        await ensureUsageState(adapter);
        expect(adapter.setObjectNotExistsAsync.calledTwice).to.equal(true);
        const ids = adapter.setObjectNotExistsAsync.getCalls().map((call) => call.args[0]);
        expect(ids).to.include(USAGE_STATE);
        expect(ids).to.include(HISTORY_STATE);
    });
```

Am Ende der Datei, vor der letzten schließenden `});` des äußeren `describe('usage', ...)`-Blocks, folgenden neuen Block einfügen:

```js
    describe('getUsageHistory', () => {
        it('returns an empty array when no history state exists', async () => {
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves(null);
            expect(await getUsageHistory(adapter)).to.deep.equal([]);
        });

        it('returns an empty array defensively when the stored value is not an array', async () => {
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify({ not: 'an array' }) });
            expect(await getUsageHistory(adapter)).to.deep.equal([]);
        });

        it('returns the stored array unchanged', async () => {
            const stored = [{ date: '2026-08-01', chat: { inputTokens: 10, outputTokens: 2 }, onboarding: { inputTokens: 0, outputTokens: 0 } }];
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(stored) });
            expect(await getUsageHistory(adapter)).to.deep.equal(stored);
        });
    });

    describe('recordUsage with purpose / history', () => {
        it('defaults to purpose "chat" and creates a new history entry for today', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves(null);

            await recordUsage(adapter, { inputTokens: 100, outputTokens: 20 });

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            const history = JSON.parse(historyCall.args[1].val);
            expect(history).to.deep.equal([
                { date: today, chat: { inputTokens: 100, outputTokens: 20 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            ]);
        });

        it('accumulates onboarding usage separately from chat usage on the same day', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const existingHistory = [
                { date: today, chat: { inputTokens: 50, outputTokens: 10 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            ];
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(existingHistory) });

            await recordUsage(adapter, { inputTokens: 200, outputTokens: 30 }, 'onboarding');

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            const history = JSON.parse(historyCall.args[1].val);
            expect(history).to.deep.equal([
                { date: today, chat: { inputTokens: 50, outputTokens: 10 }, onboarding: { inputTokens: 200, outputTokens: 30 } },
            ]);
        });

        it('appends a separate entry for a new day without touching prior days', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const existingHistory = [
                { date: '2000-01-01', chat: { inputTokens: 999, outputTokens: 999 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            ];
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(existingHistory) });

            await recordUsage(adapter, { inputTokens: 10, outputTokens: 5 }, 'chat');

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            const history = JSON.parse(historyCall.args[1].val);
            expect(history).to.have.lengthOf(2);
            expect(history[0]).to.deep.equal(existingHistory[0]);
            expect(history[1]).to.deep.equal({
                date: today,
                chat: { inputTokens: 10, outputTokens: 5 },
                onboarding: { inputTokens: 0, outputTokens: 0 },
            });
        });
    });
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/usage.test.js`
Expected: FAIL — `getUsageHistory`/`HISTORY_STATE` sind nicht exportiert, `ensureUsageState creates both state objects` schlägt fehl (aktuell nur ein `setObjectNotExistsAsync`-Call).

- [ ] **Step 3: `lib/usage.js` implementieren**

Komplette neue Datei:

```js
'use strict';

const USAGE_STATE = 'usage.today';
const HISTORY_STATE = 'usage.history';

function todayString() {
    return new Date().toISOString().slice(0, 10);
}

async function ensureUsageState(adapter) {
    await adapter.setObjectNotExistsAsync(USAGE_STATE, {
        type: 'state',
        common: { name: 'Token usage today', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(HISTORY_STATE, {
        type: 'state',
        common: { name: 'Token usage history (per day)', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
}

async function getTodayUsage(adapter) {
    const state = await adapter.getStateAsync(USAGE_STATE);
    const today = todayString();
    if (!state || !state.val) {
        return { date: today, tokensToday: 0 };
    }
    const stored = JSON.parse(state.val);
    if (stored.date !== today) {
        return { date: today, tokensToday: 0 };
    }
    return stored;
}

async function getUsageHistory(adapter) {
    const state = await adapter.getStateAsync(HISTORY_STATE);
    if (!state || !state.val) {
        return [];
    }
    try {
        const parsed = JSON.parse(state.val);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function emptyPurposeTotals() {
    return { inputTokens: 0, outputTokens: 0 };
}

async function recordHistoryEntry(adapter, usage, purpose) {
    const today = todayString();
    const history = await getUsageHistory(adapter);
    let entry = history.find((item) => item.date === today);
    if (!entry) {
        entry = { date: today, chat: emptyPurposeTotals(), onboarding: emptyPurposeTotals() };
        history.push(entry);
    }
    entry[purpose].inputTokens += usage.inputTokens || 0;
    entry[purpose].outputTokens += usage.outputTokens || 0;
    await adapter.setStateAsync(HISTORY_STATE, { val: JSON.stringify(history), ack: true });
}

async function recordUsage(adapter, usage, purpose = 'chat') {
    const current = await getTodayUsage(adapter);
    const added = (usage.inputTokens || 0) + (usage.outputTokens || 0);
    const updated = { date: current.date, tokensToday: current.tokensToday + added };
    await adapter.setStateAsync(USAGE_STATE, { val: JSON.stringify(updated), ack: true });
    await recordHistoryEntry(adapter, usage, purpose);
    return updated;
}

async function isBudgetExceeded(adapter) {
    const budget = Number(adapter.config && adapter.config.dailyTokenBudget);
    if (!budget || budget <= 0) {
        return false;
    }
    const current = await getTodayUsage(adapter);
    return current.tokensToday >= budget;
}

module.exports = {
    ensureUsageState,
    recordUsage,
    getTodayUsage,
    getUsageHistory,
    isBudgetExceeded,
    USAGE_STATE,
    HISTORY_STATE,
};
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/usage.test.js`
Expected: PASS, alle Tests grün (bestehende + neue).

- [ ] **Step 5: Branch, Commit, Merge**

```bash
git checkout -b feature/usage-history develop
git add lib/usage.js test/unit/usage.test.js
git commit -m "feat: track daily token usage history split by purpose"
npm test
git checkout develop
git merge --no-ff feature/usage-history
git branch -d feature/usage-history
```

---

### Task 2: `lib/onboarding.js` — Onboarding-Verbrauch erfassen

**Files:**
- Modify: `lib/onboarding.js`
- Modify: `test/unit/onboarding.test.js`

**Interfaces:**
- Consumes: `recordUsage(adapter, usage, purpose)` aus `lib/usage.js` (Task 1).
- Produces: keine neuen Exporte — `runOnboarding`s Signatur/Rückgabewert bleibt unverändert.

- [ ] **Step 1: Failing Test ergänzen**

In `test/unit/onboarding.test.js`, `loadOnboardingWithStubs` ersetzen durch (fügt einen optionalen `recordUsage`-Stub hinzu, Default sorgt dafür, dass alle bestehenden Aufrufstellen ohne Änderung weiterlaufen):

```js
function loadOnboardingWithStubs({ getAllCatalogEntries, setCatalogEntry, recordUsage }) {
    return proxyquire('../../lib/onboarding', {
        './catalog': {
            getAllCatalogEntries,
            setCatalogEntry,
            CATEGORIES: ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'],
        },
        './usage': {
            recordUsage: recordUsage || sinon.stub().resolves(),
        },
    });
}
```

Vor der letzten schließenden `});` des `describe('runOnboarding', ...)`-Blocks zwei neue Tests einfügen:

```js
    it('records onboarding token usage after a successful batch call', async () => {
        const discovered = [{ id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } }];
        const recordUsage = sinon.stub().resolves();
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
                usage: { inputTokens: 500, outputTokens: 80 },
            }),
        };
        const adapter = {};
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry: sinon.stub().resolves(),
            recordUsage,
        });

        await runOnboarding(adapter, provider, discovered);

        expect(recordUsage.calledOnce).to.equal(true);
        expect(recordUsage.firstCall.args).to.deep.equal([adapter, { inputTokens: 500, outputTokens: 80 }, 'onboarding']);
    });

    it('does not call recordUsage when the provider response has no usage field', async () => {
        const discovered = [{ id: 'javascript.0.y', historyInstance: 'influxdb.0', common: { name: 'y' } }];
        const recordUsage = sinon.stub().resolves();
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.y', description: 'y', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry: sinon.stub().resolves(),
            recordUsage,
        });

        await runOnboarding({}, provider, discovered);

        expect(recordUsage.called).to.equal(false);
    });
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: FAIL bei den zwei neuen Tests (`recordUsage` wird nie aufgerufen, da `lib/onboarding.js` es noch nicht importiert/aufruft).

- [ ] **Step 3: `lib/onboarding.js` anpassen**

Import-Zeile am Dateianfang ergänzen:

```js
const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
const { recordUsage } = require('./usage');
```

Im `try`-Block innerhalb der Batch-Schleife, direkt nach dem `provider.chat(...)`-Aufruf und vor `classifications = parseClassificationResponse(response.content);`, einfügen:

```js
            const response = await provider.chat({
                system: 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.',
                messages: [{ role: 'user', content: prompt }],
                tools: [],
            });

            if (response.usage) {
                await recordUsage(adapter, response.usage, 'onboarding');
            }

            classifications = parseClassificationResponse(response.content);
```

(Ersetzt die bisherigen drei Zeilen `const response = ...; classifications = parseClassificationResponse(response.content);` durch die obigen fünf Zeilen — der Rest der Funktion bleibt unverändert.)

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS, alle Tests grün (bestehende + 2 neue).

- [ ] **Step 5: Branch, Commit, Merge**

```bash
git checkout -b feature/onboarding-usage-tracking develop
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "feat: record onboarding token usage (was previously never tracked)"
npm test
git checkout develop
git merge --no-ff feature/onboarding-usage-tracking
git branch -d feature/onboarding-usage-tracking
```

---

### Task 3: Admin-Config — Preisfelder pro Zweck

**Files:**
- Modify: `io-package.json`
- Modify: `admin/jsonConfig.json`

**Interfaces:**
- Produces: native Felder `chatPricePerMillionInputTokens`, `chatPricePerMillionOutputTokens`, `onboardingPricePerMillionInputTokens`, `onboardingPricePerMillionOutputTokens` (alle `number`, Default `0`) — von Task 5 als `instanceObj.native.*` gelesen.

Reines Config-/UI-Schema, kein neuer Test (Projekt-Konvention, siehe Geräte-Tab- und Multi-Model-Plan).

- [ ] **Step 1: `io-package.json` erweitern**

Im `native`-Objekt, nach `"baseUrl": "",` einfügen:

```json
    "chatPricePerMillionInputTokens": 0,
    "chatPricePerMillionOutputTokens": 0,
```

Und nach `"onboardingBaseUrl": "",` einfügen:

```json
    "onboardingPricePerMillionInputTokens": 0,
    "onboardingPricePerMillionOutputTokens": 0,
```

- [ ] **Step 2: `admin/jsonConfig.json` erweitern**

Nach dem `baseUrl`-Item (vor `onboardingHeader`) einfügen:

```json
    "chatPricePerMillionInputTokens": {
      "type": "number",
      "label": "Preis pro 1 Mio. Input-Tokens (Chat, z.B. USD)",
      "default": 0,
      "min": 0
    },
    "chatPricePerMillionOutputTokens": {
      "type": "number",
      "label": "Preis pro 1 Mio. Output-Tokens (Chat, z.B. USD)",
      "default": 0,
      "min": 0
    },
```

Nach dem `onboardingBaseUrl`-Item (vor `checkIntervalHours`) einfügen:

```json
    "onboardingPricePerMillionInputTokens": {
      "type": "number",
      "label": "Preis pro 1 Mio. Input-Tokens (Onboarding, z.B. USD)",
      "default": 0,
      "min": 0
    },
    "onboardingPricePerMillionOutputTokens": {
      "type": "number",
      "label": "Preis pro 1 Mio. Output-Tokens (Onboarding, z.B. USD)",
      "default": 0,
      "min": 0
    },
```

- [ ] **Step 3: Beide Dateien auf gültiges JSON prüfen**

Run: `node -e "JSON.parse(require('fs').readFileSync('io-package.json', 'utf8')); JSON.parse(require('fs').readFileSync('admin/jsonConfig.json', 'utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Tests laufen lassen, Branch, Commit, Merge**

```bash
git checkout -b feature/pricing-config-schema develop
npm test
git add io-package.json admin/jsonConfig.json
git commit -m "feat: add manually maintained per-purpose token price fields"
git checkout develop
git merge --no-ff feature/pricing-config-schema
git branch -d feature/pricing-config-schema
```

---

### Task 4: `admin/tab.js` — reine Berechnungsfunktionen (Zeitraum, Kosten, Empfehlung)

**Files:**
- Modify: `admin/tab.js`
- Modify: `test/unit/tabFormat.test.js`

**Interfaces:**
- Produces: `computeRangeHistory(history, days)`, `computeCost(rangeEntries, prices)`, `recommendLimits(rangeEntries)`, `formatCostLine(cost)`, `formatRecommendationLine(recommendation)` — alle exportiert wie die bestehenden `filterEntries`/`formatBudgetLine`. Von Task 5 fürs DOM-Rendering verwendet.
- Consumes: nichts Neues — reine Funktionen ohne Abhängigkeit zu Task 1-3.

- [ ] **Step 1: Failing Tests schreiben**

In `test/unit/tabFormat.test.js`, die Import-Zeile erweitern:

```js
const {
    formatMessageLine,
    resolveNamespaceFromQuery,
    filterEntries,
    formatBudgetLine,
    computeRangeHistory,
    computeCost,
    recommendLimits,
    formatCostLine,
    formatRecommendationLine,
} = require('../../admin/tab.js');
```

Am Ende der Datei folgende neue `describe`-Blöcke anhängen:

```js
describe('computeRangeHistory', () => {
    const history = [
        { date: '2026-08-01', chat: { inputTokens: 10, outputTokens: 5 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
        { date: '2026-08-03', chat: { inputTokens: 20, outputTokens: 5 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
        { date: '2026-08-02', chat: { inputTokens: 15, outputTokens: 5 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
    ];

    it('returns the full history sorted by date ascending when days is null/undefined', () => {
        expect(computeRangeHistory(history, null).map((e) => e.date)).to.deep.equal(['2026-08-01', '2026-08-02', '2026-08-03']);
        expect(computeRangeHistory(history).map((e) => e.date)).to.deep.equal(['2026-08-01', '2026-08-02', '2026-08-03']);
    });

    it('returns only the last N days when a day count is given', () => {
        expect(computeRangeHistory(history, 2).map((e) => e.date)).to.deep.equal(['2026-08-02', '2026-08-03']);
    });

    it('does not mutate the input array', () => {
        const copy = JSON.parse(JSON.stringify(history));
        computeRangeHistory(history, 2);
        expect(history).to.deep.equal(copy);
    });
});

describe('computeCost', () => {
    it('computes chat and onboarding cost separately from token counts and prices', () => {
        const entries = [
            { date: '2026-08-01', chat: { inputTokens: 1000000, outputTokens: 500000 }, onboarding: { inputTokens: 2000000, outputTokens: 0 } },
        ];
        const cost = computeCost(entries, { chatIn: 3, chatOut: 15, onboardingIn: 1, onboardingOut: 5 });
        expect(cost.chatCost).to.be.closeTo(3 * 1 + 15 * 0.5, 1e-9);
        expect(cost.onboardingCost).to.be.closeTo(1 * 2, 1e-9);
        expect(cost.totalCost).to.be.closeTo(cost.chatCost + cost.onboardingCost, 1e-9);
    });

    it('returns zero cost for an empty range or missing prices', () => {
        expect(computeCost([], {})).to.deep.equal({ chatCost: 0, onboardingCost: 0, totalCost: 0 });
    });
});

describe('recommendLimits', () => {
    it('returns null when fewer than 3 days of history are given', () => {
        const entries = [
            { date: '2026-08-01', chat: { inputTokens: 100, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            { date: '2026-08-02', chat: { inputTokens: 200, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
        ];
        expect(recommendLimits(entries)).to.equal(null);
    });

    it('recommends a daily limit 20% above the observed maximum, and an hourly fraction of it', () => {
        const entries = [
            { date: '2026-08-01', chat: { inputTokens: 100, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            { date: '2026-08-02', chat: { inputTokens: 1000, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            { date: '2026-08-03', chat: { inputTokens: 200, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
        ];
        const result = recommendLimits(entries);
        expect(result.dailyTokens).to.equal(1200);
        expect(result.hourlyTokens).to.equal(Math.ceil(1200 / 24));
    });
});

describe('formatCostLine', () => {
    it('formats total, chat, and onboarding cost to 4 decimal places', () => {
        expect(formatCostLine({ chatCost: 1.5, onboardingCost: 0.25, totalCost: 1.75 })).to.equal(
            'Kosten im Zeitraum: 1.7500 (Chat: 1.5000, Onboarding: 0.2500)'
        );
    });
});

describe('formatRecommendationLine', () => {
    it('reports insufficient data when recommendation is null', () => {
        expect(formatRecommendationLine(null)).to.equal('Noch nicht genug Daten fuer eine Empfehlung.');
    });

    it('formats the daily/hourly recommendation', () => {
        expect(formatRecommendationLine({ dailyTokens: 1200, hourlyTokens: 50 })).to.equal(
            'Empfehlung (basierend auf bisherigem Verbrauch, kein hartes Limit): 1200 Tokens/Tag, 50 Tokens/Stunde'
        );
    });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/tabFormat.test.js`
Expected: FAIL — die fünf neuen Funktionen existieren noch nicht in `admin/tab.js` (Import liefert `undefined`).

- [ ] **Step 3: Funktionen in `admin/tab.js` ergänzen**

Direkt nach der bestehenden `formatBudgetLine`-Funktion (vor `renderHistory`) einfügen:

```js
function computeRangeHistory(history, days) {
    const sorted = [...(history || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!days) return sorted;
    return sorted.slice(-days);
}

function computeCost(rangeEntries, prices) {
    const p = prices || {};
    let chatCost = 0;
    let onboardingCost = 0;
    (rangeEntries || []).forEach((entry) => {
        const chat = entry.chat || { inputTokens: 0, outputTokens: 0 };
        const onboarding = entry.onboarding || { inputTokens: 0, outputTokens: 0 };
        chatCost += ((chat.inputTokens || 0) * (p.chatIn || 0)) / 1000000 + ((chat.outputTokens || 0) * (p.chatOut || 0)) / 1000000;
        onboardingCost +=
            ((onboarding.inputTokens || 0) * (p.onboardingIn || 0)) / 1000000 +
            ((onboarding.outputTokens || 0) * (p.onboardingOut || 0)) / 1000000;
    });
    return { chatCost, onboardingCost, totalCost: chatCost + onboardingCost };
}

function sumDailyTokens(entry) {
    const chat = entry.chat || { inputTokens: 0, outputTokens: 0 };
    const onboarding = entry.onboarding || { inputTokens: 0, outputTokens: 0 };
    return (chat.inputTokens || 0) + (chat.outputTokens || 0) + (onboarding.inputTokens || 0) + (onboarding.outputTokens || 0);
}

function recommendLimits(rangeEntries) {
    const entries = rangeEntries || [];
    if (entries.length < 3) return null;
    const maxDaily = Math.max(...entries.map(sumDailyTokens));
    const dailyTokens = Math.ceil(maxDaily * 1.2);
    const hourlyTokens = Math.ceil(dailyTokens / 24);
    return { dailyTokens, hourlyTokens };
}

function formatCostLine(cost) {
    const format = (n) => n.toFixed(4);
    return `Kosten im Zeitraum: ${format(cost.totalCost)} (Chat: ${format(cost.chatCost)}, Onboarding: ${format(cost.onboardingCost)})`;
}

function formatRecommendationLine(recommendation) {
    if (!recommendation) {
        return 'Noch nicht genug Daten fuer eine Empfehlung.';
    }
    return `Empfehlung (basierend auf bisherigem Verbrauch, kein hartes Limit): ${recommendation.dailyTokens} Tokens/Tag, ${recommendation.hourlyTokens} Tokens/Stunde`;
}
```

Die `module.exports`-Zeile am Dateiende erweitern:

```js
    module.exports = {
        formatMessageLine,
        resolveNamespaceFromQuery,
        filterEntries,
        formatBudgetLine,
        computeRangeHistory,
        computeCost,
        recommendLimits,
        formatCostLine,
        formatRecommendationLine,
        CATEGORIES,
    };
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/tabFormat.test.js`
Expected: PASS, alle Tests grün.

- [ ] **Step 5: Branch, Commit, Merge**

```bash
git checkout -b feature/cost-tab-pure-functions develop
git add admin/tab.js test/unit/tabFormat.test.js
git commit -m "feat: add pure cost/range/recommendation calculation functions"
npm test
git checkout develop
git merge --no-ff feature/cost-tab-pure-functions
git branch -d feature/cost-tab-pure-functions
```

---

### Task 5: `admin/tab.html` + `admin/tab.js` — DOM-Wiring (Chart, Zeitraum-Auswahl, Kosten-/Empfehlungs-Anzeige)

**Files:**
- Modify: `admin/tab.html`
- Modify: `admin/tab.js`

**Interfaces:**
- Consumes: `computeRangeHistory`, `computeCost`, `recommendLimits`, `formatCostLine`, `formatRecommendationLine` (Task 4, im selben Modul definiert — kein Import nötig); native Felder `chatPricePerMillionInputTokens/OutputTokens`, `onboardingPricePerMillionInputTokens/OutputTokens` (Task 3); State `usage.history` (Task 1).
- Produces: keine neuen Exporte — reine DOM-Erweiterung des bestehenden Budget-Bereichs.

Kein automatisierter Test für DOM-Wiring (bestehende, akzeptierte Projekt-Konvention — nur die reinen Funktionen aus Task 4 sind unit-getestet). Regressionsschutz: `npm test` (stellt sicher, dass Task 4s Funktionen weiterhin exportiert/funktionsfähig sind) plus sorgfältiges Lesen des Diffs.

- [ ] **Step 1: `admin/tab.html` erweitern**

Im `<style>`-Block, nach der Zeile `tr.device-ignored { font-style: italic; }`, einfügen:

```css
        #budget-range-toolbar { display: flex; gap: 4px; padding: 8px 0; }
        .range-btn { padding: 4px 10px; border: 1px solid #ccc; background: #f5f5f5; cursor: pointer; }
        .range-btn.active { background: #1976d2; color: #fff; border-color: #1976d2; }
        #budget-chart { display: flex; align-items: flex-end; gap: 2px; height: 120px; padding: 8px; border: 1px solid #eee; }
        .budget-bar { flex: 1; background: #1976d2; min-width: 2px; }
        #budget-cost-line, #budget-recommendation-line { padding: 4px 8px; font-size: 13px; color: #555; }
```

Den bestehenden `#section-budget`-Block ersetzen durch:

```html
    <div id="section-budget" class="section" hidden>
        <div id="budget-display">Lade...</div>
        <div id="budget-range-toolbar">
            <button id="budget-range-30" class="range-btn active">30 Tage</button>
            <button id="budget-range-all" class="range-btn">Gesamt</button>
        </div>
        <div id="budget-chart"></div>
        <div id="budget-cost-line"></div>
        <div id="budget-recommendation-line"></div>
    </div>
```

- [ ] **Step 2: `admin/tab.js` erweitern**

Nach der Zeile `let allDeviceEntries = [];` einfügen:

```js
let budgetHistory = [];
let budgetPrices = { chatIn: 0, chatOut: 0, onboardingIn: 0, onboardingOut: 0 };
let budgetRangeDays = 30;
```

Direkt vor `function loadBudget()` einfügen:

```js
function renderBudgetChart(rangeEntries) {
    const container = document.getElementById('budget-chart');
    if (!container) return;
    container.innerHTML = '';
    const totals = rangeEntries.map(sumDailyTokens);
    const max = Math.max(1, ...totals);
    rangeEntries.forEach((entry, index) => {
        const bar = document.createElement('div');
        bar.className = 'budget-bar';
        bar.style.height = `${Math.round((totals[index] / max) * 100)}%`;
        bar.title = `${entry.date}: ${totals[index]} Tokens`;
        container.appendChild(bar);
    });
}

function renderBudgetExtras() {
    const rangeEntries = computeRangeHistory(budgetHistory, budgetRangeDays);
    renderBudgetChart(rangeEntries);
    const cost = computeCost(rangeEntries, budgetPrices);
    const costLine = document.getElementById('budget-cost-line');
    if (costLine) costLine.textContent = formatCostLine(cost);
    const recLine = document.getElementById('budget-recommendation-line');
    if (recLine) recLine.textContent = formatRecommendationLine(recommendLimits(rangeEntries));
}

function showBudgetRange30() {
    budgetRangeDays = 30;
    document.getElementById('budget-range-30').classList.add('active');
    document.getElementById('budget-range-all').classList.remove('active');
    renderBudgetExtras();
}

function showBudgetRangeAll() {
    budgetRangeDays = null;
    document.getElementById('budget-range-all').classList.add('active');
    document.getElementById('budget-range-30').classList.remove('active');
    renderBudgetExtras();
}
```

Die bestehende `loadBudget`-Funktion komplett ersetzen durch:

```js
function loadBudget() {
    const display = document.getElementById('budget-display');
    socket.emit('getState', `${namespace}.usage.today`, (usageErr, usageState) => {
        let usage = { tokensToday: 0 };
        if (!usageErr && usageState && usageState.val) {
            try {
                usage = JSON.parse(usageState.val);
            } catch (parseError) {
                usage = { tokensToday: 0 };
            }
        }
        socket.emit('getState', `${namespace}.usage.history`, (historyErr, historyState) => {
            let history = [];
            if (!historyErr && historyState && historyState.val) {
                try {
                    const parsed = JSON.parse(historyState.val);
                    history = Array.isArray(parsed) ? parsed : [];
                } catch (parseError) {
                    history = [];
                }
            }
            budgetHistory = history;
            socket.emit('getObject', `system.adapter.${namespace}`, (objErr, instanceObj) => {
                const native = !objErr && instanceObj && instanceObj.native ? instanceObj.native : {};
                display.textContent = formatBudgetLine(usage, native.dailyTokenBudget);
                budgetPrices = {
                    chatIn: native.chatPricePerMillionInputTokens || 0,
                    chatOut: native.chatPricePerMillionOutputTokens || 0,
                    onboardingIn: native.onboardingPricePerMillionInputTokens || 0,
                    onboardingOut: native.onboardingPricePerMillionOutputTokens || 0,
                };
                renderBudgetExtras();
            });
        });
    });
}
```

Da `renderBudgetChart` die neue Hilfsfunktion `sumDailyTokens` aus Task 4 nutzt: sicherstellen, dass `sumDailyTokens` (aus Task 4) nicht mit `function` innerhalb eines Moduls-Scopes kollidiert — sie ist bereits eine normale, im Dateiscope sichtbare Funktion, kein weiterer Schritt nötig.

In `init()`, nach der Zeile `document.getElementById('devices-filter').addEventListener('input', renderDevicesTable);` einfügen:

```js
    document.getElementById('budget-range-30').addEventListener('click', showBudgetRange30);
    document.getElementById('budget-range-all').addEventListener('click', showBudgetRangeAll);
```

- [ ] **Step 3: Manuell verifizieren**

Run: `node -e "require('./admin/tab.js'); console.log('OK — Modul laedt ohne Fehler (module-Zweig)')"`
Expected: `OK — Modul laedt ohne Fehler (module-Zweig)` (stellt sicher, dass keine Syntaxfehler eingeführt wurden — die DOM-Funktionen selbst laufen im `module`-Kontext nicht, das ist erwartet und kein Fehler).

- [ ] **Step 4: Tests laufen lassen, Branch, Commit, Merge**

```bash
git checkout -b feature/cost-tab-dom-wiring develop
npm test
git add admin/tab.html admin/tab.js
git commit -m "feat: wire cost-tab chart, range selector, and recommendation into the budget section"
git checkout develop
git merge --no-ff feature/cost-tab-dom-wiring
git branch -d feature/cost-tab-dom-wiring
```

---

### Task 6: ADR-0022, Dokumentation, Versionsbump

**Files:**
- Create: `docs/adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md`
- Modify: `docs/adr/adr-index.md`, `docs/adr/backlog.md`, `docs/architecture/05-bausteinsicht.md`, `README.md`, `CHANGELOG.md`, `package.json`, `io-package.json`

**Interfaces:** keine (reine Dokumentation).

- [ ] **Step 1: ADR-0022 erstellen**

Erstelle `docs/adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md`:

```markdown
# ADR-0022: Manuell gepflegte Preise statt automatischer Preisliste, unbegrenzte tägliche Verbrauchs-Historie

[← ADR-Übersicht](adr-index.md)

## Status

Angenommen (2026-08-23)

## Kontext

Backlog [Punkt 13](backlog.md) wollte eine grafische Kosten-Übersicht "anhand von Azure-Preisen". Es gibt weder einen eigenen Azure-Providertyp noch eine praktikable Möglichkeit, Preise für beliebig viele Provider/Modell-Kombinationen (inkl. kostenloser lokaler Modelle) automatisch aktuell zu halten. Details: [Design-Spec](../specs/2026-08-22-token-kosten-tab-design.md).

## Entscheidung

1. Preise pro 1 Mio. Input-/Output-Tokens werden vom Nutzer manuell in der Admin-Config hinterlegt (vier Felder: Chat/Onboarding × Input/Output), Default 0.
2. Der Token-Verbrauch wird täglich granular UND nach Zweck getrennt (Chat/Prüfung vs. Onboarding) in einem neuen, unbegrenzt wachsenden State `usage.history` gespeichert, zusätzlich zum bestehenden `usage.today`-Tageszähler.
3. Kosten werden stets mit den *aktuell* konfigurierten Preisen berechnet, auch rückwirkend für vergangene Tage — keine Preis-Snapshots pro Tag.
4. Onboarding-Verbrauch (bisher nirgends erfasst) wird ab jetzt ebenfalls über `recordUsage` erfasst und zählt korrekt gegen `dailyTokenBudget`.

## Konsequenzen

**Positiv:** funktioniert für jeden Provider/jedes Modell ohne Wartungslast im Code; Preisänderungen wirken sofort; schließt eine Lücke, durch die Onboarding-Verbrauch bisher weder budgetiert noch sichtbar war.

**Negativ:** Nutzer muss Preise selbst pflegen und bei Änderungen nachtragen; `usage.history` wächst unbegrenzt (bei täglicher Granularität klein — ca. 150 Bytes/Tag, mehrere Jahrzehnte bis das relevant wird); rückwirkende Kosten sind nur eine Näherung mit aktuellen Preisen, keine historisch korrekte Abrechnung.
```

- [ ] **Step 2: `docs/adr/adr-index.md` ergänzen**

Neue Zeile am Ende der Tabelle:

```
| [0022](0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md) | Manuell gepflegte Preise statt automatischer Preisliste, unbegrenzte tägliche Verbrauchs-Historie | Angenommen | 2026-08-23 |
```

- [ ] **Step 3: `docs/adr/backlog.md` — Punkt 13 entfernen**

Den kompletten Abschnitt `## 13. Token-Kosten-Tab (grafisch, Azure-Preise, Limit-Empfehlung)` (inklusive seines Fließtexts) löschen.

Im Änderungsverlauf-Kommentarblock am Dateianfang eine neue Zeile ergänzen:

```
_Aktualisiert 2026-08-23: Punkt 13 durch [ADR-0022](0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md) und den Token-Kosten-Tab aufgelöst — entfällt._
```

- [ ] **Step 4: `docs/architecture/05-bausteinsicht.md` — `usage.js` ergänzen (bestehende Lücke, kein neues Modul)**

`lib/usage.js` fehlte bisher im Baum/der Tabelle, obwohl es bereits seit Version 0.0.1-beta.2 existiert und in der Modul-Zählung (12) schon mitgezählt war — diese Doku-Lücke wird hier korrigiert, **die Modul-Zahl bleibt bei 12** (kein neues Modul, nur nachträglich sichtbar gemacht).

Im Baum (Abschnitt 5.1), nach der Zeile `├── chatLog.js            Gedeckelte Chat-Historie (State-Speicher)` einfügen:

```
├── usage.js              Taeglicher Token-Verbrauch (Budget-Check) + unbegrenzte Verlaufs-Historie pro Zweck
```

In der Tabelle (Abschnitt 5.2), nach der `chatLog.js`-Zeile eine neue Zeile einfügen:

```
| `usage.js` | Verfolgt taeglichen Token-Verbrauch fuers Budget (`dailyTokenBudget`) und eine unbegrenzte, nach Chat/Pruefung vs. Onboarding getrennte Tages-Historie fuer den Kosten-Tab (siehe [ADR-0022](../adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md)) | `ensureUsageState`, `recordUsage(adapter,usage,purpose='chat')`, `getTodayUsage`, `getUsageHistory`, `isBudgetExceeded` |
```

- [ ] **Step 5: `README.md` ergänzen**

Nach dem bestehenden Absatz, der mit "Beim Adapterstart wird jeder der beiden Provider einmalig auf Erreichbarkeit geprüft..." endet, eine neue Überschrift mit Absatz einfügen:

```markdown

### Token-Kosten-Tab

Der Budget-Bereich im Admin-Tab zeigt neben dem heutigen Verbrauch auch eine Verlaufs-Historie (Balkendiagramm, wählbar 30 Tage/gesamt), berechnete Kosten getrennt nach Chat/Prüfung und Onboarding sowie eine heuristische Tages-/Stunden-Limit-Empfehlung. Die Preise pro 1 Mio. Input-/Output-Tokens werden manuell in der Admin-Config gepflegt (vier zusätzliche Felder, Default 0 — z. B. für lokale, kostenlose Modelle). Hintergrund: [ADR-0022](docs/adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md).
```

- [ ] **Step 6: `CHANGELOG.md` — neuer Versionseintrag**

Nach der `# Changelog`-Kopfzeile, vor dem bestehenden `## [0.0.1-beta.4]`-Eintrag, einfügen:

```markdown
## [0.0.1-beta.5] - 2026-08-23

### Hinzugefügt
- Token-Kosten-Tab: Erweiterung des bestehenden Budget-Bereichs um eine Verbrauchs-Historie (Balkendiagramm, wählbar 30 Tage/gesamt), berechnete Kosten getrennt nach Chat/Prüfung und Onboarding, sowie eine heuristische Tages-/Stunden-Limit-Empfehlung.
- Vier neue, manuell gepflegte Preis-Felder (Preis pro 1 Mio. Input-/Output-Tokens, je Chat und Onboarding).
- Neuer State `usage.history` (unbegrenzte, tägliche, nach Zweck getrennte Verbrauchs-Historie).
- Neues ADR-0022 dokumentiert die Preis-/Historie-Entscheidung, siehe [ADR-0022](docs/adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md).

### Behoben
- Onboarding-Token-Verbrauch wurde bisher nirgends erfasst (weder im Tagesbudget noch in irgendeiner Anzeige) — `runOnboarding` ruft jetzt korrekt `recordUsage` auf.
```

- [ ] **Step 7: Versionsbump**

In `package.json`, `"version"` von `"0.0.1-beta.4"` auf `"0.0.1-beta.5"` ändern.

In `io-package.json`, `"version"` (im `common`-Objekt) von `"0.0.1-beta.4"` auf `"0.0.1-beta.5"` ändern, und im `news`-Objekt, vor dem bestehenden `"0.0.1-beta.4"`-Eintrag, einfügen:

```json
      "0.0.1-beta.5": {
        "en": "Token-cost tab (usage history chart, cost calculation from manually maintained prices, daily/hourly limit recommendation) extending the existing budget section. Onboarding token usage is now tracked (was previously never recorded).",
        "de": "Token-Kosten-Tab (Verbrauchs-Historie als Diagramm, Kostenberechnung aus manuell gepflegten Preisen, Tages-/Stunden-Limit-Empfehlung) als Erweiterung des bestehenden Budget-Bereichs. Onboarding-Token-Verbrauch wird jetzt erfasst (bisher nie aufgezeichnet)."
      },
```

- [ ] **Step 8: Tests laufen lassen, Branch, Commit, Merge**

```bash
git checkout -b docs/token-kosten-tab-wrapup develop
npm test
git add docs/adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md docs/adr/adr-index.md docs/adr/backlog.md docs/architecture/05-bausteinsicht.md README.md CHANGELOG.md package.json io-package.json
git commit -m "docs: add ADR-0022 and record the token-cost-tab feature (v0.0.1-beta.5)"
git checkout develop
git merge --no-ff docs/token-kosten-tab-wrapup
git branch -d docs/token-kosten-tab-wrapup
```

---

## Abschluss

Nach Task 6: `npm test` grün, alle sechs Tasks lokal per `--no-ff` in `develop` gemergt. Anschließend (laut Nutzerauftrag, autonom bis dahin auszuführen): finales Whole-Branch-Review, danach Release-Merge nach `master` + Tag `v0.0.1-beta.5` + Push von `develop` und `master` nach `origin`.
