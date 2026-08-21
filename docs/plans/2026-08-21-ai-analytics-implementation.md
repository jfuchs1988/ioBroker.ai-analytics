# ioBroker.ai-analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working ioBroker adapter (`ioBroker.ai-analytics`) that answers natural-language questions about historized smart-home data and periodically runs AI-driven proactive checks, per the approved design spec.

**Architecture:** A discovery/catalog layer finds and semantically labels every ioBroker object that is actually logged to InfluxDB/History/SQL. A provider-agnostic tool-calling agent (backed by a pluggable LLM client) uses a small set of curated data-access tools to answer chat questions and to run scheduled proactive checks, posting everything into a single chat log that the admin tab renders.

**Tech Stack:** Node.js >= 18, plain JavaScript (CommonJS, no build step), `@iobroker/adapter-core`, mocha/chai/sinon for tests, `@iobroker/testing` for the adapter smoke test. No vendor LLM SDKs — providers are called directly over `fetch`.

**Spec:** `docs/specs/2026-08-21-ai-analytics-design.md`

## Global Constraints

- Node.js >= 18 required (uses the built-in global `fetch`, no HTTP client dependency).
- Plain JavaScript (CommonJS `require`/`module.exports`), no TypeScript, no bundler/build step.
- No official vendor SDKs for LLM providers — provider clients call the REST APIs directly via `fetch`.
- Normalized agent message format used everywhere between agent/tools/providers: `{ role: 'user'|'assistant'|'tool', content, toolCalls?: [{id, name, input}], toolCallId?, name? }`.
- Historical data is read exclusively through ioBroker's generic message API: `adapter.sendToAsync(historyInstance, 'getHistory', { id, options: { start, end, aggregate } })`. No direct InfluxDB/SQL driver dependency.
- Historized objects are discovered exclusively via `obj.common.custom["<influxdb|history|sql>.N"].enabled === true`.
- Catalog entries are persisted as adapter states at `catalog.<sourceId>` with a JSON-encoded string value; schema: `{ sourceId, description, unit, category, room, confidence, needsReview, active, historyInstance, lastSeen }`. Allowed `category` values: `consumption`, `generation_pv`, `lighting`, `device_usage`, `environment`.
- No rule-based thresholds for proactive checks — the LLM evaluates the data freely, per the approved spec.
- Test stack: mocha + chai + sinon for unit tests (adapter object mocked with sinon stubs), `@iobroker/testing` for the adapter startup smoke test.

---

### Task 1: Project Scaffolding & Adapter Smoke Test

**Files:**
- Create: `package.json`
- Create: `io-package.json`
- Create: `main.js`
- Create: `test/adapter.test.js`
- Create: `.mocharc.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: an `AiAnalytics` adapter class (extends `@iobroker/adapter-core`'s `utils.Adapter`) that starts and unloads cleanly. Later tasks extend this class's `onReady`/`onMessage`/`onUnload` methods and add `require`s for `./lib/*` modules.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "iobroker.ai-analytics",
  "version": "0.1.0",
  "description": "KI-gestuetzte Analyse und proaktive Pruefungen fuer historisierte ioBroker-Objekte",
  "main": "main.js",
  "engines": { "node": ">=18" },
  "author": "Johannes Fuchs <johannes.fuchs@jfuchs.de>",
  "license": "MIT",
  "dependencies": {
    "@iobroker/adapter-core": "^3.1.6"
  },
  "devDependencies": {
    "@iobroker/testing": "^4.1.3",
    "chai": "^4.3.10",
    "mocha": "^10.2.0",
    "sinon": "^17.0.1"
  },
  "scripts": {
    "test:unit": "mocha test/unit/**/*.test.js",
    "test:adapter": "mocha test/adapter.test.js",
    "test": "npm run test:unit && npm run test:adapter"
  }
}
```

- [ ] **Step 2: Create `io-package.json`**

```json
{
  "common": {
    "name": "ai-analytics",
    "version": "0.1.0",
    "title": "AI Analytics",
    "titleLang": { "en": "AI Analytics", "de": "AI Analytics" },
    "desc": {
      "en": "AI-powered Q&A and proactive checks over historized ioBroker objects",
      "de": "KI-gestuetzte Fragen und proaktive Pruefungen ueber historisierte ioBroker-Objekte"
    },
    "authors": ["Johannes Fuchs <johannes.fuchs@jfuchs.de>"],
    "keywords": ["ai", "analytics", "influxdb", "history"],
    "license": "MIT",
    "platform": "Javascript/Node.js",
    "main": "main.js",
    "enabled": true,
    "type": "utility",
    "mode": "daemon",
    "compact": true,
    "adminUI": {
      "config": "json"
    },
    "adminTab": {
      "singleton": true,
      "name": { "en": "Chat", "de": "Chat" }
    },
    "dependencies": [{ "js-controller": ">=5.0.0" }]
  },
  "native": {
    "providerType": "anthropic",
    "apiKey": "",
    "model": "",
    "baseUrl": "",
    "checkIntervalHours": 24,
    "silentIfNothingFound": false
  },
  "objects": [],
  "instanceObjects": []
}
```

Note: `adminUI.config: "json"` references `admin/jsonConfig.json`, which is created in Task 12. The Admin UI form is not usable until then — this does not affect adapter startup or the tests in this plan.

- [ ] **Step 3: Create `main.js` (skeleton)**

```js
'use strict';

const utils = require('@iobroker/adapter-core');

class AiAnalytics extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'ai-analytics' });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.log.info('ai-analytics adapter ready');
    }

    onUnload(callback) {
        try {
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new AiAnalytics(options);
} else {
    new AiAnalytics();
}
```

- [ ] **Step 4: Create `.mocharc.json`**

```json
{
  "timeout": 10000,
  "reporter": "min"
}
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 6: Write the adapter smoke test**

```js
// test/adapter.test.js
const path = require('path');
const { tests } = require('@iobroker/testing');

tests.unit(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
});
```

- [ ] **Step 7: Run the smoke test**

Run: `npm run test:adapter`
Expected: PASS — the adapter starts, calls `onReady`, and unloads cleanly under the `@iobroker/testing` harness.

- [ ] **Step 8: Commit**

```bash
git add package.json io-package.json main.js test/adapter.test.js .mocharc.json
git commit -m "chore: scaffold ai-analytics adapter with smoke test"
```

---

### Task 2: Discovery Service

**Files:**
- Create: `lib/discovery.js`
- Test: `test/unit/discovery.test.js`

**Interfaces:**
- Consumes: `adapter.getForeignObjectsAsync(pattern, type)` (standard `@iobroker/adapter-core` method, stubbed in tests).
- Produces: `findHistorizedObjects(adapter) => Promise<Array<{ id: string, historyInstance: string, common: object }>>`, and the exported regex `HISTORY_ADAPTER_PATTERN`. Task 9 (onboarding) and Task 10 (main.js wiring) call `findHistorizedObjects`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/discovery.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { findHistorizedObjects } = require('../../lib/discovery');

describe('findHistorizedObjects', () => {
    it('returns only objects with an enabled history/influxdb/sql logging instance', async () => {
        const adapter = {
            getForeignObjectsAsync: sinon.stub().resolves({
                'javascript.0.verbrauch.gesamt': {
                    common: {
                        name: 'Gesamtverbrauch',
                        custom: { 'influxdb.0': { enabled: true } },
                    },
                },
                'javascript.0.verbrauch.disabled': {
                    common: {
                        name: 'Nicht geloggt',
                        custom: { 'history.0': { enabled: false } },
                    },
                },
                'javascript.0.sonstwas': {
                    common: { name: 'Kein Logging' },
                },
            }),
        };

        const result = await findHistorizedObjects(adapter);

        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.deep.equal({
            id: 'javascript.0.verbrauch.gesamt',
            historyInstance: 'influxdb.0',
            common: {
                name: 'Gesamtverbrauch',
                custom: { 'influxdb.0': { enabled: true } },
            },
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/discovery.test.js`
Expected: FAIL with `Cannot find module '../../lib/discovery'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/discovery.js
'use strict';

const HISTORY_ADAPTER_PATTERN = /^(influxdb|history|sql)\.\d+$/;

async function findHistorizedObjects(adapter) {
    const objects = await adapter.getForeignObjectsAsync('*', 'state');
    const result = [];

    for (const id of Object.keys(objects)) {
        const obj = objects[id];
        const custom = obj && obj.common && obj.common.custom;
        if (!custom) continue;

        const loggingInstance = Object.keys(custom).find(
            (key) => HISTORY_ADAPTER_PATTERN.test(key) && custom[key] && custom[key].enabled
        );

        if (loggingInstance) {
            result.push({
                id,
                historyInstance: loggingInstance,
                common: obj.common,
            });
        }
    }

    return result;
}

module.exports = { findHistorizedObjects, HISTORY_ADAPTER_PATTERN };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/discovery.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discovery.js test/unit/discovery.test.js
git commit -m "feat: add discovery service for historized objects"
```

---

### Task 3: Catalog Storage

**Files:**
- Create: `lib/catalog.js`
- Test: `test/unit/catalog.test.js`

**Interfaces:**
- Consumes: `adapter.getStateAsync`, `adapter.getStatesAsync`, `adapter.setObjectNotExistsAsync`, `adapter.setStateAsync`, `adapter.namespace` (all stubbed in tests).
- Produces:
  - `catalogStateId(sourceId) => string`
  - `getCatalogEntry(adapter, sourceId) => Promise<Entry|null>`
  - `getAllCatalogEntries(adapter) => Promise<Entry[]>`
  - `setCatalogEntry(adapter, entry) => Promise<void>` (throws if `entry.category` is not in `CATEGORIES`)
  - `markInactive(adapter, sourceId) => Promise<void>`
  - `CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment']`
  - `Entry` shape: `{ sourceId, description, unit, category, room, confidence, needsReview, active, historyInstance, lastSeen }`
  - Used by: Task 6 (tools), Task 9 (onboarding), Task 10 (main.js).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/catalog.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    catalogStateId,
    CATEGORIES,
} = require('../../lib/catalog');

function makeAdapter() {
    return {
        namespace: 'ai-analytics.0',
        getStateAsync: sinon.stub(),
        getStatesAsync: sinon.stub(),
        setObjectNotExistsAsync: sinon.stub().resolves(),
        setStateAsync: sinon.stub().resolves(),
    };
}

describe('catalog', () => {
    it('catalogStateId builds a state id under catalog.<sourceId>', () => {
        expect(catalogStateId('javascript.0.verbrauch.gesamt')).to.equal(
            'catalog.javascript.0.verbrauch.gesamt'
        );
    });

    it('setCatalogEntry rejects unknown categories', async () => {
        const adapter = makeAdapter();
        let threw = false;
        try {
            await setCatalogEntry(adapter, { sourceId: 'x', category: 'not-a-category' });
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });

    it('setCatalogEntry writes a JSON-encoded state', async () => {
        const adapter = makeAdapter();
        const entry = {
            sourceId: 'javascript.0.verbrauch.gesamt',
            description: 'Gesamtverbrauch',
            unit: 'kWh',
            category: 'consumption',
            room: '',
            confidence: 'high',
            needsReview: false,
            active: true,
            historyInstance: 'influxdb.0',
            lastSeen: '2026-08-21T00:00:00.000Z',
        };

        await setCatalogEntry(adapter, entry);

        expect(adapter.setStateAsync.calledOnce).to.equal(true);
        const [id, state] = adapter.setStateAsync.firstCall.args;
        expect(id).to.equal('catalog.javascript.0.verbrauch.gesamt');
        expect(JSON.parse(state.val)).to.deep.equal(entry);
        expect(state.ack).to.equal(true);
    });

    it('getCatalogEntry returns null when no state exists', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves(null);
        const entry = await getCatalogEntry(adapter, 'javascript.0.x');
        expect(entry).to.equal(null);
    });

    it('getAllCatalogEntries parses every stored JSON value', async () => {
        const adapter = makeAdapter();
        adapter.getStatesAsync.resolves({
            'ai-analytics.0.catalog.a': { val: JSON.stringify({ sourceId: 'a', category: 'lighting' }) },
            'ai-analytics.0.catalog.b': { val: JSON.stringify({ sourceId: 'b', category: 'consumption' }) },
        });

        const entries = await getAllCatalogEntries(adapter);

        expect(entries).to.have.lengthOf(2);
        expect(entries.map((e) => e.sourceId).sort()).to.deep.equal(['a', 'b']);
    });

    it('markInactive sets active=false on an existing entry', async () => {
        const adapter = makeAdapter();
        const existing = {
            sourceId: 'javascript.0.x',
            description: 'x',
            unit: '',
            category: 'consumption',
            room: '',
            confidence: 'high',
            needsReview: false,
            active: true,
            historyInstance: 'influxdb.0',
            lastSeen: '2026-08-21T00:00:00.000Z',
        };
        adapter.getStateAsync.resolves({ val: JSON.stringify(existing) });

        await markInactive(adapter, 'javascript.0.x');

        const [, state] = adapter.setStateAsync.firstCall.args;
        expect(JSON.parse(state.val).active).to.equal(false);
    });

    it('exposes the allowed categories', () => {
        expect(CATEGORIES).to.deep.equal([
            'consumption',
            'generation_pv',
            'lighting',
            'device_usage',
            'environment',
        ]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/catalog.test.js`
Expected: FAIL with `Cannot find module '../../lib/catalog'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/catalog.js
'use strict';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];

function catalogStateId(sourceId) {
    return `catalog.${sourceId}`;
}

async function getCatalogEntry(adapter, sourceId) {
    const state = await adapter.getStateAsync(catalogStateId(sourceId));
    if (!state || state.val == null) return null;
    return JSON.parse(state.val);
}

async function getAllCatalogEntries(adapter) {
    const states = await adapter.getStatesAsync(`${adapter.namespace}.catalog.*`);
    const entries = [];
    for (const fullId of Object.keys(states)) {
        const state = states[fullId];
        if (state && state.val != null) {
            entries.push(JSON.parse(state.val));
        }
    }
    return entries;
}

async function setCatalogEntry(adapter, entry) {
    if (!CATEGORIES.includes(entry.category)) {
        throw new Error(`Unknown category: ${entry.category}`);
    }

    const id = catalogStateId(entry.sourceId);
    await adapter.setObjectNotExistsAsync(id, {
        type: 'state',
        common: {
            name: `Catalog: ${entry.sourceId}`,
            type: 'string',
            role: 'json',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setStateAsync(id, { val: JSON.stringify(entry), ack: true });
}

async function markInactive(adapter, sourceId) {
    const entry = await getCatalogEntry(adapter, sourceId);
    if (!entry) return;
    entry.active = false;
    await setCatalogEntry(adapter, entry);
}

module.exports = {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    catalogStateId,
    CATEGORIES,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/catalog.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/catalog.js test/unit/catalog.test.js
git commit -m "feat: add catalog storage backed by adapter states"
```

---

### Task 4: Data Access Layer

**Files:**
- Create: `lib/dataAccess.js`
- Test: `test/unit/dataAccess.test.js`

**Interfaces:**
- Consumes: `adapter.sendToAsync(instance, command, message) => Promise<any>` (stubbed in tests).
- Produces:
  - `getHistory(adapter, historyInstance, sourceId, start, end, aggregate = 'average') => Promise<Array<{ ts, val }>>`
  - `compareTimeframes(adapter, historyInstance, sourceId, periodA, periodB, aggregate = 'average') => Promise<{ periodA: {start,end,sum,avg,count}, periodB: {...}, deltaSum, deltaAvg }>`
  - Used by: Task 6 (tools).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/dataAccess.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { getHistory, compareTimeframes } = require('../../lib/dataAccess');

describe('dataAccess', () => {
    it('getHistory calls sendToAsync with the standard getHistory message shape', async () => {
        const adapter = {
            sendToAsync: sinon.stub().resolves({ result: [{ ts: 1, val: 10 }, { ts: 2, val: 20 }] }),
        };

        const points = await getHistory(adapter, 'influxdb.0', 'javascript.0.x', 100, 200, 'average');

        expect(adapter.sendToAsync.calledOnceWith('influxdb.0', 'getHistory', {
            id: 'javascript.0.x',
            options: { start: 100, end: 200, aggregate: 'average' },
        })).to.equal(true);
        expect(points).to.deep.equal([{ ts: 1, val: 10 }, { ts: 2, val: 20 }]);
    });

    it('getHistory throws when the response has no result array', async () => {
        const adapter = { sendToAsync: sinon.stub().resolves({}) };
        let threw = false;
        try {
            await getHistory(adapter, 'influxdb.0', 'javascript.0.x', 100, 200);
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });

    it('compareTimeframes computes sum/avg/delta for two periods', async () => {
        const adapter = {
            sendToAsync: sinon
                .stub()
                .onFirstCall()
                .resolves({ result: [{ ts: 1, val: 10 }, { ts: 2, val: 10 }] })
                .onSecondCall()
                .resolves({ result: [{ ts: 3, val: 30 }] }),
        };

        const comparison = await compareTimeframes(
            adapter,
            'influxdb.0',
            'javascript.0.x',
            { start: 0, end: 100 },
            { start: 100, end: 200 }
        );

        expect(comparison).to.deep.equal({
            periodA: { start: 0, end: 100, sum: 20, avg: 10, count: 2 },
            periodB: { start: 100, end: 200, sum: 30, avg: 30, count: 1 },
            deltaSum: 10,
            deltaAvg: 20,
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/dataAccess.test.js`
Expected: FAIL with `Cannot find module '../../lib/dataAccess'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/dataAccess.js
'use strict';

async function getHistory(adapter, historyInstance, sourceId, start, end, aggregate = 'average') {
    const response = await adapter.sendToAsync(historyInstance, 'getHistory', {
        id: sourceId,
        options: { start, end, aggregate },
    });

    if (!response || !Array.isArray(response.result)) {
        throw new Error(`No history data returned for ${sourceId} from ${historyInstance}`);
    }

    return response.result;
}

async function compareTimeframes(adapter, historyInstance, sourceId, periodA, periodB, aggregate = 'average') {
    const [dataA, dataB] = await Promise.all([
        getHistory(adapter, historyInstance, sourceId, periodA.start, periodA.end, aggregate),
        getHistory(adapter, historyInstance, sourceId, periodB.start, periodB.end, aggregate),
    ]);

    const sum = (points) => points.reduce((total, point) => total + (point.val || 0), 0);
    const avg = (points) => (points.length ? sum(points) / points.length : 0);

    return {
        periodA: { start: periodA.start, end: periodA.end, sum: sum(dataA), avg: avg(dataA), count: dataA.length },
        periodB: { start: periodB.start, end: periodB.end, sum: sum(dataB), avg: avg(dataB), count: dataB.length },
        deltaSum: sum(dataB) - sum(dataA),
        deltaAvg: avg(dataB) - avg(dataA),
    };
}

module.exports = { getHistory, compareTimeframes };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/dataAccess.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dataAccess.js test/unit/dataAccess.test.js
git commit -m "feat: add data access layer over the getHistory message API"
```

---

### Task 5: LLM Provider Abstraction

**Files:**
- Create: `lib/providers/anthropic.js`
- Create: `lib/providers/openaiCompatible.js`
- Create: `lib/providers/index.js`
- Test: `test/unit/providers.test.js`

**Interfaces:**
- Consumes: global `fetch` (stubbed in tests).
- Produces:
  - `createProvider(config) => { chat({ system, messages, tools }) => Promise<{ role: 'assistant', content: string, toolCalls: [{id,name,input}], stopReason: string }> }`, exported from `lib/providers/index.js`. `config.type` is one of `'anthropic' | 'openai' | 'openrouter' | 'local'`. The returned provider retries a failed `chat()` call up to 2 additional times with backoff before rejecting (per the spec's "LLM-API-Fehler" error handling), transparent to callers.
  - `messages` passed into `chat()` follow the normalized format from Global Constraints.
  - `tools` passed into `chat()` is `Array<{ name, description, inputSchema }>` (matches Task 6's `tools.definitions`).
  - Used by: Task 7 (agent), Task 9 (onboarding), Task 10 (main.js).

- [ ] **Step 1: Write the failing test for the Anthropic provider**

```js
// test/unit/providers.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { createAnthropicProvider } = require('../../lib/providers/anthropic');
const { createOpenAiCompatibleProvider } = require('../../lib/providers/openaiCompatible');
const { createProvider } = require('../../lib/providers');

describe('anthropic provider', () => {
    afterEach(() => sinon.restore());

    it('sends system/messages/tools in Anthropic wire format and parses the response', async () => {
        const fakeResponse = {
            ok: true,
            json: async () => ({
                content: [
                    { type: 'text', text: 'Der Verbrauch ist gestiegen.' },
                    { type: 'tool_use', id: 'call_1', name: 'getHistory', input: { sourceId: 'x' } },
                ],
                stop_reason: 'tool_use',
            }),
        };
        const fetchStub = sinon.stub().resolves(fakeResponse);
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const provider = createAnthropicProvider({ apiKey: 'key', model: 'claude-sonnet-4-5' });

        const result = await provider.chat({
            system: 'system prompt',
            messages: [{ role: 'user', content: 'Wie hat sich der Verbrauch veraendert?' }],
            tools: [{ name: 'getHistory', description: 'desc', inputSchema: { type: 'object' } }],
        });

        expect(fetchStub.calledOnce).to.equal(true);
        const [url, options] = fetchStub.firstCall.args;
        expect(url).to.equal('https://api.anthropic.com/v1/messages');
        const body = JSON.parse(options.body);
        expect(body.system).to.equal('system prompt');
        expect(body.messages).to.deep.equal([
            { role: 'user', content: 'Wie hat sich der Verbrauch veraendert?' },
        ]);
        expect(body.tools).to.deep.equal([
            { name: 'getHistory', description: 'desc', input_schema: { type: 'object' } },
        ]);

        expect(result).to.deep.equal({
            role: 'assistant',
            content: 'Der Verbrauch ist gestiegen.',
            toolCalls: [{ id: 'call_1', name: 'getHistory', input: { sourceId: 'x' } }],
            stopReason: 'tool_use',
        });
    });

    it('groups a tool-result message after an assistant tool_use into one user message', async () => {
        const { toAnthropicMessages } = require('../../lib/providers/anthropic');

        const messages = [
            { role: 'user', content: 'Frage' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [{ id: 'call_1', name: 'getHistory', input: { sourceId: 'x' } }],
            },
            { role: 'tool', toolCallId: 'call_1', name: 'getHistory', content: '[{"ts":1,"val":10}]' },
        ];

        const converted = toAnthropicMessages(messages);

        expect(converted).to.deep.equal([
            { role: 'user', content: 'Frage' },
            {
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'call_1', name: 'getHistory', input: { sourceId: 'x' } }],
            },
            {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '[{"ts":1,"val":10}]' }],
            },
        ]);
    });
});

describe('openai-compatible provider', () => {
    afterEach(() => sinon.restore());

    it('sends system/messages/tools in OpenAI chat-completions format and parses the response', async () => {
        const fakeResponse = {
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content: 'Keine Auffaelligkeiten.',
                            tool_calls: [
                                { id: 'call_1', type: 'function', function: { name: 'listCatalog', arguments: '{}' } },
                            ],
                        },
                        finish_reason: 'tool_calls',
                    },
                ],
            }),
        };
        const fetchStub = sinon.stub().resolves(fakeResponse);
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const provider = createOpenAiCompatibleProvider({ apiKey: 'key', model: 'gpt-4o-mini' });

        const result = await provider.chat({
            system: 'system prompt',
            messages: [{ role: 'user', content: 'Pruefe die Werte' }],
            tools: [{ name: 'listCatalog', description: 'desc', inputSchema: { type: 'object' } }],
        });

        expect(fetchStub.firstCall.args[0]).to.equal('https://api.openai.com/v1/chat/completions');

        expect(result).to.deep.equal({
            role: 'assistant',
            content: 'Keine Auffaelligkeiten.',
            toolCalls: [{ id: 'call_1', name: 'listCatalog', input: {} }],
            stopReason: 'tool_calls',
        });
    });

    it('uses config.baseUrl when provided (OpenRouter / local)', async () => {
        const fetchStub = sinon.stub().resolves({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const provider = createOpenAiCompatibleProvider({
            apiKey: 'key',
            model: 'local-model',
            baseUrl: 'http://localhost:1234/v1',
        });

        await provider.chat({ system: 's', messages: [], tools: [] });

        expect(fetchStub.firstCall.args[0]).to.equal('http://localhost:1234/v1/chat/completions');
    });
});

describe('createProvider', () => {
    it('routes anthropic to the Anthropic client', () => {
        const provider = createProvider({ type: 'anthropic', apiKey: 'k' });
        expect(provider).to.have.property('chat').that.is.a('function');
    });

    it('routes openai/openrouter/local to the OpenAI-compatible client', () => {
        for (const type of ['openai', 'openrouter', 'local']) {
            const provider = createProvider({ type, apiKey: 'k' });
            expect(provider).to.have.property('chat').that.is.a('function');
        }
    });

    it('throws on unknown provider type', () => {
        expect(() => createProvider({ type: 'unknown' })).to.throw('Unknown provider type: unknown');
    });

    it('retries a failing chat() call and returns the result once it succeeds', async () => {
        const fetchStub = sinon.stub();
        fetchStub.onCall(0).rejects(new Error('network down'));
        fetchStub.onCall(1).resolves({
            ok: true,
            json: async () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const provider = createProvider({ type: 'anthropic', apiKey: 'k' });
        const result = await provider.chat({ system: 's', messages: [], tools: [] });

        expect(fetchStub.callCount).to.equal(2);
        expect(result.content).to.equal('ok');
    });

    it('gives up after exhausting retries and throws the last error', async () => {
        sinon.stub(global, 'fetch').rejects(new Error('network down'));

        const provider = createProvider({ type: 'anthropic', apiKey: 'k' });

        let thrown;
        try {
            await provider.chat({ system: 's', messages: [], tools: [] });
        } catch (e) {
            thrown = e;
        }

        expect(thrown.message).to.equal('network down');
        expect(global.fetch.callCount).to.equal(3);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/providers.test.js`
Expected: FAIL with `Cannot find module '../../lib/providers/anthropic'`.

- [ ] **Step 3: Write `lib/providers/anthropic.js`**

```js
// lib/providers/anthropic.js
'use strict';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

function toAnthropicMessages(messages) {
    const anthropicMessages = [];

    for (const message of messages) {
        if (message.role === 'user') {
            anthropicMessages.push({ role: 'user', content: message.content });
        } else if (message.role === 'assistant') {
            const content = [];
            if (message.content) {
                content.push({ type: 'text', text: message.content });
            }
            for (const call of message.toolCalls || []) {
                content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
            }
            anthropicMessages.push({ role: 'assistant', content });
        } else if (message.role === 'tool') {
            const toolResultBlock = {
                type: 'tool_result',
                tool_use_id: message.toolCallId,
                content: message.content,
            };
            const last = anthropicMessages[anthropicMessages.length - 1];
            if (last && last.__toolResults) {
                last.content.push(toolResultBlock);
            } else {
                anthropicMessages.push({ role: 'user', content: [toolResultBlock], __toolResults: true });
            }
        }
    }

    return anthropicMessages.map(({ __toolResults, ...rest }) => rest);
}

function toAnthropicTools(tools) {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
    }));
}

function fromAnthropicResponse(data) {
    let text = '';
    const toolCalls = [];

    for (const block of data.content || []) {
        if (block.type === 'text') {
            text += block.text;
        } else if (block.type === 'tool_use') {
            toolCalls.push({ id: block.id, name: block.name, input: block.input });
        }
    }

    return {
        role: 'assistant',
        content: text,
        toolCalls,
        stopReason: data.stop_reason,
    };
}

function createAnthropicProvider(config) {
    return {
        async chat({ system, messages, tools }) {
            const response = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': config.apiKey,
                    'anthropic-version': ANTHROPIC_VERSION,
                },
                body: JSON.stringify({
                    model: config.model || 'claude-sonnet-4-5',
                    max_tokens: config.maxTokens || 2048,
                    system,
                    messages: toAnthropicMessages(messages),
                    tools: tools && tools.length ? toAnthropicTools(tools) : undefined,
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
            }

            const data = await response.json();
            return fromAnthropicResponse(data);
        },
    };
}

module.exports = { createAnthropicProvider, toAnthropicMessages, toAnthropicTools, fromAnthropicResponse };
```

- [ ] **Step 4: Write `lib/providers/openaiCompatible.js`**

```js
// lib/providers/openaiCompatible.js
'use strict';

function toOpenAiMessages(system, messages) {
    const result = [{ role: 'system', content: system }];

    for (const message of messages) {
        if (message.role === 'user') {
            result.push({ role: 'user', content: message.content });
        } else if (message.role === 'assistant') {
            const entry = { role: 'assistant', content: message.content || null };
            if (message.toolCalls && message.toolCalls.length) {
                entry.tool_calls = message.toolCalls.map((call) => ({
                    id: call.id,
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.input) },
                }));
            }
            result.push(entry);
        } else if (message.role === 'tool') {
            result.push({ role: 'tool', tool_call_id: message.toolCallId, content: message.content });
        }
    }

    return result;
}

function toOpenAiTools(tools) {
    return tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
}

function fromOpenAiResponse(data) {
    const choice = data.choices[0];
    const message = choice.message;
    const toolCalls = (message.tool_calls || []).map((call) => ({
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments || '{}'),
    }));

    return {
        role: 'assistant',
        content: message.content || '',
        toolCalls,
        stopReason: choice.finish_reason,
    };
}

function createOpenAiCompatibleProvider(config) {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';

    return {
        async chat({ system, messages, tools }) {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: toOpenAiMessages(system, messages),
                    tools: tools && tools.length ? toOpenAiTools(tools) : undefined,
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`OpenAI-compatible API error ${response.status}: ${errorBody}`);
            }

            const data = await response.json();
            return fromOpenAiResponse(data);
        },
    };
}

module.exports = { createOpenAiCompatibleProvider, toOpenAiMessages, toOpenAiTools, fromOpenAiResponse };
```

- [ ] **Step 5: Write `lib/providers/index.js` with retry-with-backoff**

```js
// lib/providers/index.js
'use strict';

const { createAnthropicProvider } = require('./anthropic');
const { createOpenAiCompatibleProvider } = require('./openaiCompatible');

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function withRetry(provider) {
    return {
        async chat(params) {
            let lastError;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    return await provider.chat(params);
                } catch (error) {
                    lastError = error;
                    if (attempt < MAX_ATTEMPTS) {
                        await delay(BASE_DELAY_MS * attempt);
                    }
                }
            }
            throw lastError;
        },
    };
}

function createProvider(config) {
    switch (config.type) {
        case 'anthropic':
            return withRetry(createAnthropicProvider(config));
        case 'openai':
        case 'openrouter':
        case 'local':
            return withRetry(createOpenAiCompatibleProvider(config));
        default:
            throw new Error(`Unknown provider type: ${config.type}`);
    }
}

module.exports = { createProvider, withRetry };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx mocha test/unit/providers.test.js`
Expected: PASS (9 tests). Note: the two retry tests add roughly 1.5s of real wall-clock delay (500ms + 1000ms backoff) — acceptable for this suite's size.

- [ ] **Step 7: Commit**

```bash
git add lib/providers/ test/unit/providers.test.js
git commit -m "feat: add pluggable LLM provider abstraction (Anthropic + OpenAI-compatible)"
```

---

### Task 6: Tool Definitions & Dispatcher

**Files:**
- Create: `lib/tools.js`
- Test: `test/unit/tools.test.js`

**Interfaces:**
- Consumes: `getAllCatalogEntries(adapter)` (Task 3), `getHistory(adapter, historyInstance, sourceId, start, end, aggregate)` and `compareTimeframes(adapter, historyInstance, sourceId, periodA, periodB)` (Task 4).
- Produces: `buildTools(adapter) => { definitions: Array<{name, description, inputSchema}>, execute(name, input) => Promise<any> }`. Used by Task 7 (agent) and Task 10 (main.js).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/tools.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadToolsWithStubs({ getAllCatalogEntries, getHistory, compareTimeframes }) {
    return proxyquire('../../lib/tools', {
        './catalog': { getAllCatalogEntries },
        './dataAccess': { getHistory, compareTimeframes },
    });
}

describe('buildTools', () => {
    it('exposes listCatalog, getHistory and compareTimeframes definitions', () => {
        const { buildTools } = require('../../lib/tools');
        const { definitions } = buildTools({});
        expect(definitions.map((d) => d.name)).to.deep.equal(['listCatalog', 'getHistory', 'compareTimeframes']);
    });

    it('listCatalog excludes inactive and needsReview entries, and supports a category filter', async () => {
        const entries = [
            { sourceId: 'a', category: 'lighting', active: true, needsReview: false },
            { sourceId: 'b', category: 'consumption', active: false, needsReview: false },
            { sourceId: 'c', category: 'consumption', active: true, needsReview: true },
            { sourceId: 'd', category: 'consumption', active: true, needsReview: false },
        ];
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves(entries),
        });

        const { execute } = buildTools({});

        const all = await execute('listCatalog', {});
        expect(all.map((e) => e.sourceId)).to.deep.equal(['a', 'd']);

        const filtered = await execute('listCatalog', { category: 'consumption' });
        expect(filtered.map((e) => e.sourceId)).to.deep.equal(['d']);
    });

    it('getHistory resolves the historyInstance from the catalog and delegates to dataAccess', async () => {
        const getHistoryStub = sinon.stub().resolves([{ ts: 1, val: 5 }]);
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon
                .stub()
                .resolves([{ sourceId: 'javascript.0.x', historyInstance: 'influxdb.0' }]),
            getHistory: getHistoryStub,
        });

        const adapter = {};
        const { execute } = buildTools(adapter);
        const result = await execute('getHistory', { sourceId: 'javascript.0.x', start: 1, end: 2, aggregate: 'average' });

        expect(getHistoryStub.calledOnceWith(adapter, 'influxdb.0', 'javascript.0.x', 1, 2, 'average')).to.equal(true);
        expect(result).to.deep.equal([{ ts: 1, val: 5 }]);
    });

    it('getHistory throws for objects not in the catalog', async () => {
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
        });
        const { execute } = buildTools({});

        let threw = false;
        try {
            await execute('getHistory', { sourceId: 'unknown', start: 1, end: 2 });
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });

    it('compareTimeframes resolves the historyInstance and delegates to dataAccess', async () => {
        const compareStub = sinon.stub().resolves({ deltaSum: 5 });
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon
                .stub()
                .resolves([{ sourceId: 'javascript.0.x', historyInstance: 'influxdb.0' }]),
            compareTimeframes: compareStub,
        });

        const adapter = {};
        const { execute } = buildTools(adapter);
        const periodA = { start: 0, end: 1 };
        const periodB = { start: 1, end: 2 };
        const result = await execute('compareTimeframes', { sourceId: 'javascript.0.x', periodA, periodB });

        expect(compareStub.calledOnceWith(adapter, 'influxdb.0', 'javascript.0.x', periodA, periodB)).to.equal(true);
        expect(result).to.deep.equal({ deltaSum: 5 });
    });

    it('throws for unknown tool names', async () => {
        const { buildTools } = require('../../lib/tools');
        const { execute } = buildTools({});
        let threw = false;
        try {
            await execute('doesNotExist', {});
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });
});
```

- [ ] **Step 2: Install the test-only proxying dependency and run test to verify it fails**

Run: `npm install --save-dev proxyquire`
Run: `npx mocha test/unit/tools.test.js`
Expected: FAIL with `Cannot find module '../../lib/tools'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/tools.js
'use strict';

const { getAllCatalogEntries } = require('./catalog');
const { getHistory, compareTimeframes } = require('./dataAccess');

function buildTools(adapter) {
    const definitions = [
        {
            name: 'listCatalog',
            description: 'Listet alle bekannten, katalogisierten Objekte mit Beschreibung, Kategorie und Einheit auf.',
            inputSchema: {
                type: 'object',
                properties: {
                    category: { type: 'string', description: 'Optionaler Filter nach Kategorie' },
                },
            },
        },
        {
            name: 'getHistory',
            description: 'Ruft historische Werte fuer ein Objekt in einem Zeitraum ab.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    start: { type: 'number', description: 'Startzeit als Unix-Millisekunden' },
                    end: { type: 'number', description: 'Endzeit als Unix-Millisekunden' },
                    aggregate: { type: 'string', enum: ['average', 'minmax', 'onchange', 'none'] },
                },
                required: ['sourceId', 'start', 'end'],
            },
        },
        {
            name: 'compareTimeframes',
            description: 'Vergleicht Summe und Durchschnitt eines Objekts zwischen zwei Zeitraeumen.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    periodA: {
                        type: 'object',
                        properties: { start: { type: 'number' }, end: { type: 'number' } },
                        required: ['start', 'end'],
                    },
                    periodB: {
                        type: 'object',
                        properties: { start: { type: 'number' }, end: { type: 'number' } },
                        required: ['start', 'end'],
                    },
                },
                required: ['sourceId', 'periodA', 'periodB'],
            },
        },
    ];

    async function findCatalogEntry(sourceId) {
        const entries = await getAllCatalogEntries(adapter);
        const entry = entries.find((candidate) => candidate.sourceId === sourceId);
        if (!entry) {
            throw new Error(`Unbekanntes Objekt: ${sourceId}`);
        }
        return entry;
    }

    async function execute(name, input) {
        if (name === 'listCatalog') {
            const entries = await getAllCatalogEntries(adapter);
            const filtered = input && input.category
                ? entries.filter((entry) => entry.category === input.category)
                : entries;
            return filtered.filter((entry) => entry.active !== false && !entry.needsReview);
        }

        if (name === 'getHistory') {
            const entry = await findCatalogEntry(input.sourceId);
            return getHistory(adapter, entry.historyInstance, input.sourceId, input.start, input.end, input.aggregate);
        }

        if (name === 'compareTimeframes') {
            const entry = await findCatalogEntry(input.sourceId);
            return compareTimeframes(adapter, entry.historyInstance, input.sourceId, input.periodA, input.periodB);
        }

        throw new Error(`Unbekanntes Werkzeug: ${name}`);
    }

    return { definitions, execute };
}

module.exports = { buildTools };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/tools.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tools.js test/unit/tools.test.js package.json package-lock.json
git commit -m "feat: add curated tool definitions and dispatcher over the catalog"
```

---

### Task 7: Tool-Calling Agent Loop

**Files:**
- Create: `lib/agent.js`
- Test: `test/unit/agent.test.js`

**Interfaces:**
- Consumes: `provider.chat({system, messages, tools})` (Task 5 interface), `tools.definitions` / `tools.execute(name, input)` (Task 6 interface).
- Produces: `runAgent({ provider, tools, systemPrompt, userMessage, onAssistantText? }) => Promise<{ finalText: string, messages: Array }>`. Throws if `MAX_ITERATIONS` (8) is exceeded without a final answer. Used by Task 9 (onboarding is NOT built on this — see Task 9 note), Task 10 and Task 11 (main.js chat + proactive checks).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/agent.test.js
const { expect } = require('chai');
const { runAgent } = require('../../lib/agent');

function fakeTools() {
    const calls = [];
    return {
        definitions: [{ name: 'listCatalog', description: 'd', inputSchema: { type: 'object' } }],
        execute: async (name, input) => {
            calls.push({ name, input });
            return [{ sourceId: 'javascript.0.x' }];
        },
        calls,
    };
}

describe('runAgent', () => {
    it('executes a tool call and feeds the result back, returning the final text', async () => {
        const responses = [
            {
                role: 'assistant',
                content: '',
                toolCalls: [{ id: 'call_1', name: 'listCatalog', input: {} }],
                stopReason: 'tool_use',
            },
            {
                role: 'assistant',
                content: 'Es gibt ein bekanntes Objekt.',
                toolCalls: [],
                stopReason: 'end_turn',
            },
        ];
        let callIndex = 0;
        const provider = { chat: async () => responses[callIndex++] };
        const tools = fakeTools();

        const result = await runAgent({
            provider,
            tools,
            systemPrompt: 'system',
            userMessage: 'Welche Objekte kennst du?',
        });

        expect(result.finalText).to.equal('Es gibt ein bekanntes Objekt.');
        expect(tools.calls).to.deep.equal([{ name: 'listCatalog', input: {} }]);
        expect(result.messages).to.have.lengthOf(4);
        expect(result.messages[0]).to.deep.equal({ role: 'user', content: 'Welche Objekte kennst du?' });
        expect(result.messages[2]).to.deep.equal({
            role: 'tool',
            toolCallId: 'call_1',
            name: 'listCatalog',
            content: JSON.stringify([{ sourceId: 'javascript.0.x' }]),
        });
    });

    it('returns immediately when the first response has no tool calls', async () => {
        const provider = {
            chat: async () => ({ role: 'assistant', content: 'Direkte Antwort.', toolCalls: [], stopReason: 'end_turn' }),
        };
        const tools = fakeTools();

        const result = await runAgent({ provider, tools, systemPrompt: 's', userMessage: 'Frage' });

        expect(result.finalText).to.equal('Direkte Antwort.');
        expect(tools.calls).to.deep.equal([]);
    });

    it('encodes tool execution errors as JSON instead of throwing', async () => {
        const responses = [
            {
                role: 'assistant',
                content: '',
                toolCalls: [{ id: 'call_1', name: 'getHistory', input: { sourceId: 'unknown' } }],
                stopReason: 'tool_use',
            },
            { role: 'assistant', content: 'Konnte nicht abgerufen werden.', toolCalls: [], stopReason: 'end_turn' },
        ];
        let callIndex = 0;
        const provider = { chat: async () => responses[callIndex++] };
        const tools = {
            definitions: [],
            execute: async () => {
                throw new Error('Unbekanntes Objekt: unknown');
            },
        };

        const result = await runAgent({ provider, tools, systemPrompt: 's', userMessage: 'Frage' });

        expect(result.messages[2].content).to.equal(JSON.stringify({ error: 'Unbekanntes Objekt: unknown' }));
    });

    it('throws once MAX_ITERATIONS is exceeded without a final answer', async () => {
        const provider = {
            chat: async () => ({
                role: 'assistant',
                content: '',
                toolCalls: [{ id: 'call_x', name: 'listCatalog', input: {} }],
                stopReason: 'tool_use',
            }),
        };
        const tools = fakeTools();

        let threw = false;
        try {
            await runAgent({ provider, tools, systemPrompt: 's', userMessage: 'Frage' });
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/agent.test.js`
Expected: FAIL with `Cannot find module '../../lib/agent'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/agent.js
'use strict';

const MAX_ITERATIONS = 8;

async function runAgent({ provider, tools, systemPrompt, userMessage, onAssistantText }) {
    const messages = [{ role: 'user', content: userMessage }];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const assistantMessage = await provider.chat({
            system: systemPrompt,
            messages,
            tools: tools.definitions,
        });

        messages.push(assistantMessage);

        if (assistantMessage.content && onAssistantText) {
            onAssistantText(assistantMessage.content);
        }

        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
            return { finalText: assistantMessage.content, messages };
        }

        for (const call of assistantMessage.toolCalls) {
            let resultContent;
            try {
                const result = await tools.execute(call.name, call.input);
                resultContent = JSON.stringify(result);
            } catch (error) {
                resultContent = JSON.stringify({ error: error.message });
            }
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: resultContent });
        }
    }

    throw new Error('Agent hat die maximale Anzahl an Werkzeug-Aufrufen erreicht, ohne eine Antwort zu liefern.');
}

module.exports = { runAgent, MAX_ITERATIONS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/agent.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/agent.js test/unit/agent.test.js
git commit -m "feat: add provider-agnostic tool-calling agent loop"
```

---

### Task 8: Chat History Log Storage

**Files:**
- Create: `lib/chatLog.js`
- Test: `test/unit/chatLog.test.js`

**Interfaces:**
- Consumes: `adapter.setObjectNotExistsAsync`, `adapter.getStateAsync`, `adapter.setStateAsync` (stubbed in tests).
- Produces: `ensureChatHistoryState(adapter) => Promise<void>`, `appendChatMessage(adapter, role, text) => Promise<Array<{role, text, timestamp}>>` (returns the updated, capped history), `CHAT_HISTORY_STATE = 'chat.history'`. Used by Task 9, 10, 11, 13.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/chatLog.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { ensureChatHistoryState, appendChatMessage, CHAT_HISTORY_STATE } = require('../../lib/chatLog');

describe('chatLog', () => {
    it('CHAT_HISTORY_STATE points at chat.history', () => {
        expect(CHAT_HISTORY_STATE).to.equal('chat.history');
    });

    it('ensureChatHistoryState creates the state object if missing', async () => {
        const adapter = { setObjectNotExistsAsync: sinon.stub().resolves() };
        await ensureChatHistoryState(adapter);
        expect(adapter.setObjectNotExistsAsync.calledOnce).to.equal(true);
        expect(adapter.setObjectNotExistsAsync.firstCall.args[0]).to.equal('chat.history');
    });

    it('appendChatMessage appends to existing history and writes back JSON', async () => {
        const existing = [{ role: 'user', text: 'Hallo', timestamp: 1 }];
        const adapter = {
            getStateAsync: sinon.stub().resolves({ val: JSON.stringify(existing) }),
            setStateAsync: sinon.stub().resolves(),
        };

        const clock = sinon.useFakeTimers(2000);
        const result = await appendChatMessage(adapter, 'assistant', 'Antwort');
        clock.restore();

        expect(result).to.deep.equal([
            { role: 'user', text: 'Hallo', timestamp: 1 },
            { role: 'assistant', text: 'Antwort', timestamp: 2000 },
        ]);
        const [id, state] = adapter.setStateAsync.firstCall.args;
        expect(id).to.equal('chat.history');
        expect(JSON.parse(state.val)).to.deep.equal(result);
        expect(state.ack).to.equal(true);
    });

    it('appendChatMessage starts a fresh history when none exists yet', async () => {
        const adapter = {
            getStateAsync: sinon.stub().resolves(null),
            setStateAsync: sinon.stub().resolves(),
        };

        const result = await appendChatMessage(adapter, 'user', 'Erste Frage');

        expect(result).to.have.lengthOf(1);
        expect(result[0].text).to.equal('Erste Frage');
    });

    it('appendChatMessage caps history at 200 entries', async () => {
        const existing = Array.from({ length: 200 }, (_, i) => ({ role: 'user', text: `m${i}`, timestamp: i }));
        const adapter = {
            getStateAsync: sinon.stub().resolves({ val: JSON.stringify(existing) }),
            setStateAsync: sinon.stub().resolves(),
        };

        const result = await appendChatMessage(adapter, 'user', 'neu');

        expect(result).to.have.lengthOf(200);
        expect(result[result.length - 1].text).to.equal('neu');
        expect(result[0].text).to.equal('m1');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/chatLog.test.js`
Expected: FAIL with `Cannot find module '../../lib/chatLog'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/chatLog.js
'use strict';

const CHAT_HISTORY_STATE = 'chat.history';
const MAX_MESSAGES = 200;

async function ensureChatHistoryState(adapter) {
    await adapter.setObjectNotExistsAsync(CHAT_HISTORY_STATE, {
        type: 'state',
        common: { name: 'Chat History', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
}

async function appendChatMessage(adapter, role, text) {
    const state = await adapter.getStateAsync(CHAT_HISTORY_STATE);
    const history = state && state.val ? JSON.parse(state.val) : [];
    history.push({ role, text, timestamp: Date.now() });
    const trimmed = history.slice(-MAX_MESSAGES);
    await adapter.setStateAsync(CHAT_HISTORY_STATE, { val: JSON.stringify(trimmed), ack: true });
    return trimmed;
}

module.exports = { ensureChatHistoryState, appendChatMessage, CHAT_HISTORY_STATE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/chatLog.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/chatLog.js test/unit/chatLog.test.js
git commit -m "feat: add capped chat history log storage"
```

---

### Task 9: Onboarding Flow

**Files:**
- Create: `lib/onboarding.js`
- Test: `test/unit/onboarding.test.js`

**Interfaces:**
- Consumes: `provider.chat({system, messages, tools})` (Task 5), `getAllCatalogEntries(adapter)` / `setCatalogEntry(adapter, entry)` / `CATEGORIES` (Task 3).
- Produces: `runOnboarding(adapter, provider, discoveredObjects) => Promise<{ classifiedCount: number, needsReview: Entry[] }>`, where `discoveredObjects` is the array returned by Task 2's `findHistorizedObjects`. Used by Task 10 (main.js `syncCatalog`).
- Note: onboarding classification is a single-shot batched prompt (not the tool-calling agent from Task 7) — it only needs the object metadata already in hand, not iterative data exploration.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/onboarding.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadOnboardingWithStubs({ getAllCatalogEntries, setCatalogEntry }) {
    return proxyquire('../../lib/onboarding', {
        './catalog': {
            getAllCatalogEntries,
            setCatalogEntry,
            CATEGORIES: ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'],
        },
    });
}

describe('runOnboarding', () => {
    it('classifies newly discovered objects and stores them in the catalog', async () => {
        const discovered = [
            {
                id: 'javascript.0.verbrauch.gesamt',
                historyInstance: 'influxdb.0',
                common: { name: 'Gesamtverbrauch', role: 'value.power.consumption', unit: 'kWh' },
            },
        ];
        const setCatalogEntry = sinon.stub().resolves();
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    {
                        sourceId: 'javascript.0.verbrauch.gesamt',
                        description: 'Gesamtstromverbrauch Haus',
                        unit: 'kWh',
                        category: 'consumption',
                        room: 'gesamt',
                        confidence: 'high',
                    },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        const result = await runOnboarding({}, provider, discovered);

        expect(result.classifiedCount).to.equal(1);
        expect(result.needsReview).to.deep.equal([]);
        expect(setCatalogEntry.calledOnce).to.equal(true);
        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            sourceId: 'javascript.0.verbrauch.gesamt',
            description: 'Gesamtstromverbrauch Haus',
            category: 'consumption',
            confidence: 'high',
            needsReview: false,
            active: true,
            historyInstance: 'influxdb.0',
        });
    });

    it('skips objects that are already in the catalog', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const setCatalogEntry = sinon.stub().resolves();
        const provider = { chat: sinon.stub() };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x' }]),
            setCatalogEntry,
        });

        const result = await runOnboarding({}, provider, discovered);

        expect(result.classifiedCount).to.equal(0);
        expect(provider.chat.called).to.equal(false);
        expect(setCatalogEntry.called).to.equal(false);
    });

    it('collects low-confidence classifications into needsReview', async () => {
        const discovered = [
            { id: 'javascript.0.steckdose3', historyInstance: 'history.0', common: { name: 'Steckdose_3' } },
        ];
        const setCatalogEntry = sinon.stub().resolves();
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    {
                        sourceId: 'javascript.0.steckdose3',
                        description: 'Unklar',
                        unit: '',
                        category: 'device_usage',
                        room: '',
                        confidence: 'low',
                    },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        const result = await runOnboarding({}, provider, discovered);

        expect(result.needsReview).to.have.lengthOf(1);
        expect(result.needsReview[0].needsReview).to.equal(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: FAIL with `Cannot find module '../../lib/onboarding'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/onboarding.js
'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');

const BATCH_SIZE = 20;

function buildClassificationPrompt(objects) {
    const objectDescriptions = objects.map((obj) => ({
        sourceId: obj.id,
        name: obj.common.name,
        role: obj.common.role,
        unit: obj.common.unit,
    }));

    return [
        'Du bist Teil eines ioBroker-Adapters und ordnest Smart-Home-Objekte in Kategorien ein.',
        `Erlaubte Kategorien: ${CATEGORIES.join(', ')}.`,
        'Antworte AUSSCHLIESSLICH mit einem JSON-Array, ein Eintrag pro Objekt, in dieser Form:',
        '[{"sourceId": "...", "description": "...", "unit": "...", "category": "...", "room": "...", "confidence": "high"|"low"}]',
        'Nutze confidence "low", wenn du dir bei Zweck oder Kategorie nicht sicher bist.',
        'Objekte:',
        JSON.stringify(objectDescriptions, null, 2),
    ].join('\n');
}

function parseClassificationResponse(text) {
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('Antwort enthaelt kein JSON-Array.');
    }
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

async function runOnboarding(adapter, provider, discoveredObjects) {
    const existing = await getAllCatalogEntries(adapter);
    const knownIds = new Set(existing.map((entry) => entry.sourceId));
    const unclassified = discoveredObjects.filter((obj) => !knownIds.has(obj.id));

    const needsReview = [];

    for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
        const batch = unclassified.slice(i, i + BATCH_SIZE);
        const prompt = buildClassificationPrompt(batch);

        const response = await provider.chat({
            system: 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.',
            messages: [{ role: 'user', content: prompt }],
            tools: [],
        });

        const classifications = parseClassificationResponse(response.content);

        for (const classification of classifications) {
            const source = batch.find((obj) => obj.id === classification.sourceId);
            if (!source) continue;

            const entry = {
                sourceId: classification.sourceId,
                description: classification.description,
                unit: classification.unit || source.common.unit || '',
                category: classification.category,
                room: classification.room || '',
                confidence: classification.confidence,
                needsReview: classification.confidence === 'low',
                active: true,
                historyInstance: source.historyInstance,
                lastSeen: new Date().toISOString(),
            };

            await setCatalogEntry(adapter, entry);

            if (entry.needsReview) {
                needsReview.push(entry);
            }
        }
    }

    return { classifiedCount: unclassified.length, needsReview };
}

module.exports = { runOnboarding, buildClassificationPrompt, parseClassificationResponse };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "feat: add onboarding flow that classifies newly discovered objects"
```

---

### Task 10: Main.js Wiring — Catalog Sync & Chat Q&A

**Files:**
- Modify: `main.js`
- Test: `test/adapter.test.js` (already exists from Task 1 — re-run only, no changes)

**Interfaces:**
- Consumes: `findHistorizedObjects` (Task 2), `getAllCatalogEntries`/`markInactive` (Task 3), `createProvider` (Task 5), `buildTools` (Task 6), `runAgent` (Task 7), `ensureChatHistoryState`/`appendChatMessage` (Task 8), `runOnboarding` (Task 9).
- Produces: `AiAnalytics.onReady()` (runs `syncCatalog()` then starts the adapter), `AiAnalytics.syncCatalog()`, `AiAnalytics.onMessage(obj)` handling `obj.command === 'chatQuestion'`. Task 11 adds the scheduler on top of this; Task 13's admin tab calls the `chatQuestion` message.

- [ ] **Step 1: Rewrite `main.js` with catalog sync and chat wiring**

```js
// main.js
'use strict';

const utils = require('@iobroker/adapter-core');
const { findHistorizedObjects } = require('./lib/discovery');
const { getAllCatalogEntries, markInactive } = require('./lib/catalog');
const { createProvider } = require('./lib/providers');
const { buildTools } = require('./lib/tools');
const { runAgent } = require('./lib/agent');
const { runOnboarding } = require('./lib/onboarding');
const { ensureChatHistoryState, appendChatMessage } = require('./lib/chatLog');

class AiAnalytics extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'ai-analytics' });
        this.on('ready', this.onReady.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await ensureChatHistoryState(this);

        this.provider = createProvider({
            type: this.config.providerType,
            apiKey: this.config.apiKey,
            model: this.config.model,
            baseUrl: this.config.baseUrl,
        });
        this.tools = buildTools(this);

        await this.syncCatalog();

        this.log.info('ai-analytics adapter ready');
    }

    async syncCatalog() {
        const discovered = await findHistorizedObjects(this);
        const existing = await getAllCatalogEntries(this);
        const discoveredIds = new Set(discovered.map((obj) => obj.id));

        for (const entry of existing) {
            if (!discoveredIds.has(entry.sourceId) && entry.active !== false) {
                await markInactive(this, entry.sourceId);
            }
        }

        const { needsReview } = await runOnboarding(this, this.provider, discovered);

        if (needsReview.length > 0) {
            const question = needsReview
                .map((entry) => `- ${entry.sourceId}: wofuer steht dieser Wert?`)
                .join('\n');
            await appendChatMessage(this, 'assistant', `Ich bin mir bei folgenden Objekten unsicher:\n${question}`);
        }
    }

    async onMessage(obj) {
        if (!obj || obj.command !== 'chatQuestion') return;

        const question = obj.message && obj.message.text;
        await appendChatMessage(this, 'user', question);

        try {
            const { finalText } = await runAgent({
                provider: this.provider,
                tools: this.tools,
                systemPrompt:
                    'Du beantwortest Fragen zu Smart-Home-Verbrauchsdaten anhand der katalogisierten Objekte.',
                userMessage: question,
            });
            const history = await appendChatMessage(this, 'assistant', finalText);
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { history }, obj.callback);
            }
        } catch (error) {
            this.log.error(`Chat-Anfrage fehlgeschlagen: ${error.message}`);
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
            }
        }
    }

    onUnload(callback) {
        try {
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new AiAnalytics(options);
} else {
    new AiAnalytics();
}
```

- [ ] **Step 2: Run the adapter smoke test to verify it still passes**

Run: `npm run test:adapter`
Expected: PASS — `@iobroker/testing`'s mocked environment provides stubbed object/state methods, so `onReady`'s calls into `syncCatalog` resolve against empty mocked data without throwing.

- [ ] **Step 3: Run the full unit suite to verify nothing regressed**

Run: `npm run test:unit`
Expected: PASS (all prior task tests still green).

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "feat: wire catalog sync and chat Q&A into the adapter lifecycle"
```

---

### Task 11: Proactive Check Scheduler

**Files:**
- Create: `lib/scheduler.js`
- Modify: `main.js`
- Test: `test/unit/scheduler.test.js`

**Interfaces:**
- Consumes: `runAgent` (Task 7), `appendChatMessage` (Task 8).
- Produces: `startProactiveScheduler(adapter, { intervalMs, runCheck }) => stopFn` (from `lib/scheduler.js`). `main.js` gains `AiAnalytics.runProactiveCheck()` and calls `startProactiveScheduler` in `onReady`, storing the returned `stopFn` for `onUnload`.

- [ ] **Step 1: Write the failing test for `lib/scheduler.js`**

```js
// test/unit/scheduler.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { startProactiveScheduler } = require('../../lib/scheduler');

describe('startProactiveScheduler', () => {
    it('invokes runCheck after each interval and stops when the returned function is called', () => {
        const clock = sinon.useFakeTimers();
        const runCheck = sinon.stub().resolves();
        const adapter = { log: { error: sinon.stub() } };

        const stop = startProactiveScheduler(adapter, { intervalMs: 1000, runCheck });

        clock.tick(1000);
        expect(runCheck.callCount).to.equal(1);

        clock.tick(1000);
        expect(runCheck.callCount).to.equal(2);

        stop();
        clock.tick(5000);
        expect(runCheck.callCount).to.equal(2);

        clock.restore();
    });

    it('logs an error instead of throwing when runCheck rejects', async () => {
        const clock = sinon.useFakeTimers();
        const runCheck = sinon.stub().rejects(new Error('boom'));
        const adapter = { log: { error: sinon.stub() } };

        const stop = startProactiveScheduler(adapter, { intervalMs: 1000, runCheck });
        clock.tick(1000);
        await Promise.resolve();
        await Promise.resolve();

        expect(adapter.log.error.calledOnce).to.equal(true);
        expect(adapter.log.error.firstCall.args[0]).to.include('boom');

        stop();
        clock.restore();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/scheduler.test.js`
Expected: FAIL with `Cannot find module '../../lib/scheduler'`.

- [ ] **Step 3: Write `lib/scheduler.js`**

```js
// lib/scheduler.js
'use strict';

function startProactiveScheduler(adapter, { intervalMs, runCheck }) {
    const timer = setInterval(() => {
        runCheck().catch((error) => adapter.log.error(`Proaktive Pruefung fehlgeschlagen: ${error.message}`));
    }, intervalMs);

    return () => clearInterval(timer);
}

module.exports = { startProactiveScheduler };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/scheduler.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the scheduler and `runProactiveCheck` into `main.js`**

Add the import near the top of `main.js`:

```js
const { startProactiveScheduler } = require('./lib/scheduler');
```

Add `this.stopScheduler = null;` to the constructor, after the `this.on(...)` calls.

Replace the end of `onReady()` (the `this.log.info(...)` line) with:

```js
        const intervalMs = (Number(this.config.checkIntervalHours) || 24) * 3600 * 1000;
        this.stopScheduler = startProactiveScheduler(this, {
            intervalMs,
            runCheck: () => this.runProactiveCheck(),
        });

        this.log.info('ai-analytics adapter ready');
```

Add a new method after `syncCatalog()`:

```js
    async runProactiveCheck() {
        const silentIfNothingFound = this.config.silentIfNothingFound === true;

        const { finalText } = await runAgent({
            provider: this.provider,
            tools: this.tools,
            systemPrompt:
                'Du pruefst katalogisierte Smart-Home-Objekte auf Auffaelligkeiten (Geraetenutzung, Beleuchtung, ' +
                'Verbrauch, PV-Einspeisung) der letzten 24 Stunden. Begruende Auffaelligkeiten mit konkreten Werten. ' +
                'Wenn nichts auffaellig ist, antworte kurz mit "Keine Auffaelligkeiten."',
            userMessage: 'Fuehre die periodische Pruefung durch.',
        });

        const isNothingFound = finalText.trim().toLowerCase().startsWith('keine auffaelligkeiten');
        if (isNothingFound && silentIfNothingFound) {
            return;
        }

        await appendChatMessage(this, 'assistant', finalText);
    }
```

Update `onUnload` to stop the scheduler:

```js
    onUnload(callback) {
        try {
            if (this.stopScheduler) this.stopScheduler();
            callback();
        } catch (e) {
            callback();
        }
    }
```

- [ ] **Step 6: Run the adapter smoke test and full unit suite**

Run: `npm run test:adapter`
Expected: PASS.

Run: `npm run test:unit`
Expected: PASS (all prior task tests still green).

- [ ] **Step 7: Commit**

```bash
git add lib/scheduler.js main.js test/unit/scheduler.test.js
git commit -m "feat: add proactive check scheduler"
```

---

### Task 12: Admin Configuration UI

**Files:**
- Create: `admin/jsonConfig.json`

**Interfaces:**
- Consumes: the `native` fields already declared in `io-package.json` (Task 1): `providerType`, `apiKey`, `model`, `baseUrl`, `checkIntervalHours`, `silentIfNothingFound`.
- Produces: a working Admin configuration form. No automated test (JSON Config schemas are validated by the ioBroker Admin adapter at render time, not unit-testable in isolation) — verify manually as noted in Step 2.

- [ ] **Step 1: Create `admin/jsonConfig.json`**

```json
{
  "type": "panel",
  "items": {
    "providerType": {
      "type": "select",
      "label": "LLM-Provider",
      "options": [
        { "label": "Anthropic", "value": "anthropic" },
        { "label": "OpenAI", "value": "openai" },
        { "label": "OpenRouter", "value": "openrouter" },
        { "label": "Lokal (OpenAI-kompatibel)", "value": "local" }
      ]
    },
    "apiKey": {
      "type": "password",
      "label": "API-Key"
    },
    "model": {
      "type": "text",
      "label": "Modell"
    },
    "baseUrl": {
      "type": "text",
      "label": "Basis-URL (nur fuer OpenRouter/Lokal)"
    },
    "checkIntervalHours": {
      "type": "number",
      "label": "Intervall proaktive Pruefung (Stunden)",
      "default": 24
    },
    "silentIfNothingFound": {
      "type": "checkbox",
      "label": "Bei keinem Fund keine Nachricht senden",
      "default": false
    }
  }
}
```

- [ ] **Step 2: Manual verification note**

This form can only be rendered inside a running ioBroker Admin instance. Defer visual verification to the manual acceptance test described in the spec's testing section (after Task 13, once the adapter is installed on a real ioBroker instance).

- [ ] **Step 3: Commit**

```bash
git add admin/jsonConfig.json
git commit -m "feat: add admin configuration form"
```

---

### Task 13: Admin Chat Tab

**Files:**
- Create: `admin/tab.html`
- Create: `admin/tab.js`

**Interfaces:**
- Consumes: the `chat.history` state (Task 8) via the Admin socket connection's `getState`; the `chatQuestion` message command (Task 10) via `socket.emit('sendTo', namespace, 'chatQuestion', {text}, callback)`.
- Produces: a browser-rendered chat tab. No automated test — DOM-driven admin tabs are covered by the spec's manual acceptance test, not unit tests.

- [ ] **Step 1: Create `admin/tab.html`**

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <link rel="stylesheet" type="text/css" href="../../css/adapter.css" />
    <script type="text/javascript" src="../../lib/js/jquery-3.5.1.min.js"></script>
    <script type="text/javascript" src="../../socket.io/socket.io.js"></script>
    <script type="text/javascript" src="tab.js"></script>
</head>
<body>
    <div id="chat-messages" style="height: 70vh; overflow-y: auto; padding: 8px;"></div>
    <div style="display: flex; padding: 8px;">
        <input id="chat-input" type="text" style="flex: 1;" placeholder="Frage stellen..." />
        <button id="chat-send">Senden</button>
    </div>
</body>
</html>
```

- [ ] **Step 2: Create `admin/tab.js`**

```js
// admin/tab.js
let socket;
let namespace;

function formatMessageLine(entry) {
    return `[${entry.role}] ${entry.text}`;
}

function renderHistory(history) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    (history || []).forEach((entry) => {
        const line = document.createElement('div');
        line.textContent = formatMessageLine(entry);
        container.appendChild(line);
    });
    container.scrollTop = container.scrollHeight;
}

function loadHistory() {
    socket.emit('getState', `${namespace}.chat.history`, (err, state) => {
        if (!err && state && state.val) {
            renderHistory(JSON.parse(state.val));
        }
    });
}

function sendQuestion() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    socket.emit('sendTo', namespace, 'chatQuestion', { text }, (response) => {
        if (response && response.history) {
            renderHistory(response.history);
        }
    });
}

function init(socketInstance, adapterNamespace) {
    socket = socketInstance;
    namespace = adapterNamespace;
    loadHistory();
    document.getElementById('chat-send').addEventListener('click', sendQuestion);
    document.getElementById('chat-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') sendQuestion();
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        if (typeof io !== 'undefined' && typeof adapterNamespace !== 'undefined') {
            init(io.connect(), adapterNamespace);
        }
    });
}

if (typeof module !== 'undefined') {
    module.exports = { formatMessageLine };
}
```

- [ ] **Step 3: Write a unit test for the pure formatting helper**

```js
// test/unit/tabFormat.test.js
const { expect } = require('chai');
const { formatMessageLine } = require('../../admin/tab.js');

describe('formatMessageLine', () => {
    it('formats a chat entry as "[role] text"', () => {
        expect(formatMessageLine({ role: 'assistant', text: 'Keine Auffaelligkeiten.' })).to.equal(
            '[assistant] Keine Auffaelligkeiten.'
        );
    });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/tabFormat.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — every unit test file plus the adapter smoke test.

- [ ] **Step 6: Commit**

```bash
git add admin/tab.html admin/tab.js test/unit/tabFormat.test.js
git commit -m "feat: add admin chat tab UI"
```

---

## Post-Implementation Manual Acceptance Test

Once all 13 tasks are complete and `npm test` passes, follow the spec's manual acceptance test on a real ioBroker instance:

1. Symlink or copy the repo into `iobroker/node_modules/iobroker.ai-analytics`, add an instance via Admin.
2. Configure a real provider API key in the admin form (Task 12).
3. Confirm the onboarding run produces sane catalog entries (check `ai-analytics.0.catalog.*` states) and sane bundled rückfragen for ambiguous objects.
4. Ask a sample question in the chat tab (Task 13), e.g. "Wie hat sich mein Stromverbrauch verändert und warum?", and confirm the agent calls tools and returns a grounded answer.
5. Trigger (or wait for) one proactive check run and confirm a message appears in the chat tab.

## Known Gaps (deferred, not blocking v1)

- **Deduplicated outage alerts:** the spec asks that a complete history-instance outage be "reported once, not on every run" rather than repeated every scheduled check. This plan surfaces `getHistory`/`sendTo` failures as tool errors the agent can mention in its own wording (Task 6/7), but does not add a persisted "already alerted about this outage" state to suppress repeats. Left for a follow-up plan once real outage behavior can be observed.
- **Catalog pre-filtering for very large installations:** the spec calls this an explicit future optimization, not a v1 blocker — no task implements it here.
- **Onboarding-Rückfragen sind nicht auflösbar:** Für Objekte mit `needsReview: true` postet das System eine Rückfrage im Chat, aber es gibt aktuell keinen Weg, eine Nutzerantwort zurück in den Katalog zu schreiben — der Chat-Q&A-Agent hat nur lesende Werkzeuge. Objekte bleiben dauerhaft `needsReview: true` und von Analysen ausgeschlossen. Für v1 als Limitierung akzeptiert; ein Folge-Plan sollte ein Werkzeug/Message-Kommando zum Aktualisieren eines Katalogeintrags ergänzen.
- **Keine Konversationshistorie im Chat-Agenten:** Jede Chat-Frage startet den Agenten ohne vorherige Nachrichten im Kontext, obwohl die Spec Folgefragen mit erhaltenem Kontext vorsieht. `chat.history` ist aktuell nur ein Anzeige-Log. Für v1 als Limitierung akzeptiert; ein Folge-Plan sollte `runAgent` um optionalen `priorMessages`-Kontext erweitern.
- **Keine Auswahl der History-Adapterinstanz(en) und kein manueller Re-Discovery-Trigger:** Die Spec sieht beides in der Admin-Konfiguration vor; aktuell werden automatisch alle aktiven influxdb/history/sql-Instanzen berücksichtigt, und ein Neu-Einlesen erfordert einen Adapter-Neustart. Für v1 als Limitierung akzeptiert.
- **Main.js und die Admin-UI haben effektiv keine automatisierte Testabdeckung:** `test/adapter.test.js` nutzt `@iobroker/testing`s `tests.unit`, das in der installierten v4-Version ein deprecated No-Op ist — lädt `main.js` nie, ruft nie `onReady`/`onUnload` auf. Entdeckt in der finalen Whole-Branch-Review, bewusst nicht in der Fix-Welle behoben (echte Testabdeckung braucht ein `tests.integration`- oder proxyquire-Fake-Adapter-Design, kein blinder Fix). Für den CI-Folge-Plan vorgesehen.
- **Admin-Chat-Tab (`admin/tab.js`) bestätigt nicht funktionsfähig (Abnahmetest 2026-08-21):** Tab rendert, Senden-Button reagiert nicht. Ursachenhypothese: `init()` läuft nur bei `typeof adapterNamespace !== 'undefined'`, vermutlich kein reales Admin-Global. Diagnose per Browser-Konsole mit Nutzer vereinbart (`typeof adapterNamespace`, `typeof io`, `window.location.href`, `typeof parent.socket`), noch ausstehend — siehe arc42 §11 für Details. Kein blinder Fix, bis die Diagnose vorliegt.
- **Zwei kleinere, in der Fix-Wellen-Nachprüfung bewusst zurückgestellte Punkte:** `lastSeen` bei der Katalog-Reaktivierung wird nur bei tatsächlicher Reaktivierung/Instanzwechsel aktualisiert, nicht bei jedem unveränderten Sync; die neuen Reaktivierungs-`setCatalogEntry`-Aufrufe in `syncCatalog` sind nicht try/catch-abgesichert wie der Rest der Funktion. Beide Minor, für die CI-/Hardening-Folge-Runde vorgesehen.
