# Chat Fixes & Safeguards Implementation Plan

> **Status: umgesetzt (2026-08-24).** Chat-Gedächtnis, Katalog-Schreibwerkzeug, Token-Budget, Logging und die Admin-Transport-Fallbacks sind umgesetzt. Der Plan bleibt als historische Umsetzungsspezifikation erhalten.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken admin chat tab, let the chat agent resolve its own onboarding rückfragen, give the chat agent short-term conversation memory, add a daily LLM token budget safeguard, and add `silly`-level logging across discovery/onboarding/agent/main so real usage is observable.

**Architecture:** Extends the existing `lib/*` modules in place — no new architectural layer beyond one new `lib/usage.js` module and one new scoped write-capable tool. The admin tab gets a defensive multi-strategy connection fallback instead of the removed, nonexistent `adapterNamespace` global.

**Tech Stack:** Same as the rest of the project — plain JavaScript (CommonJS), mocha/chai/sinon, no build step.

**Spec:** `docs/specs/2026-08-21-chat-fixes-and-safeguards.md`

## Global Constraints

- Same stack constraints as the original plan (`docs/plans/2026-08-21-ai-analytics-implementation.md`): Node.js >= 18, CommonJS, no TypeScript/build step, mocha+chai+sinon.
- Never log API keys or Authorization headers — only log request/response bodies and derived metadata.
- `updateCatalogEntry` (Task 5) MUST reject any entry where `needsReview !== true` — this is the security boundary for the KI's first write capability. Do not weaken this check.
- `runAgent`'s new `priorMessages` and `usage` additions must be backward compatible: existing callers that don't pass `priorMessages` or don't read `usage` must keep working unchanged (this plan updates the one real caller, `main.js`, in the same task set, but the interface itself must not force a breaking change).

---

### Task 1: Chat History — Read Recent Entries

**Files:**
- Modify: `lib/chatLog.js`
- Test: `test/unit/chatLog.test.js`

**Interfaces:**
- Consumes: nothing new (same adapter state API as the rest of the module).
- Produces: `getRecentChatHistory(adapter, limit) => Promise<Array<{role, text, timestamp}>>` — returns up to the last `limit` entries currently in `chat.history`, in chronological order (oldest of the returned slice first). Used by Task 7 (`main.js`).

- [ ] **Step 1: Write the failing test**

Add to `test/unit/chatLog.test.js` (new `describe` block, same file):

```js
describe('getRecentChatHistory', () => {
    it('returns the last N entries in chronological order', async () => {
        const history = Array.from({ length: 15 }, (_, i) => ({ role: 'user', text: `m${i}`, timestamp: i }));
        const adapter = { getStateAsync: sinon.stub().resolves({ val: JSON.stringify(history) }) };

        const result = await getRecentChatHistory(adapter, 5);

        expect(result.map((e) => e.text)).to.deep.equal(['m10', 'm11', 'm12', 'm13', 'm14']);
    });

    it('returns an empty array when there is no history yet', async () => {
        const adapter = { getStateAsync: sinon.stub().resolves(null) };
        const result = await getRecentChatHistory(adapter, 5);
        expect(result).to.deep.equal([]);
    });

    it('returns everything when there are fewer entries than the limit', async () => {
        const history = [{ role: 'user', text: 'only one', timestamp: 1 }];
        const adapter = { getStateAsync: sinon.stub().resolves({ val: JSON.stringify(history) }) };
        const result = await getRecentChatHistory(adapter, 10);
        expect(result).to.deep.equal(history);
    });
});
```

Add `getRecentChatHistory` to the existing `require` line at the top of the test file:

```js
const { ensureChatHistoryState, appendChatMessage, getRecentChatHistory, CHAT_HISTORY_STATE } = require('../../lib/chatLog');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/chatLog.test.js`
Expected: FAIL — `getRecentChatHistory is not a function`.

- [ ] **Step 3: Write the implementation**

In `lib/chatLog.js`, add (after `appendChatMessage`, before `module.exports`):

```js
async function getRecentChatHistory(adapter, limit) {
    const state = await adapter.getStateAsync(CHAT_HISTORY_STATE);
    const history = state && state.val ? JSON.parse(state.val) : [];
    return history.slice(-limit);
}
```

Update `module.exports`:

```js
module.exports = { ensureChatHistoryState, appendChatMessage, getRecentChatHistory, CHAT_HISTORY_STATE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/chatLog.test.js`
Expected: PASS (8 tests — 5 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/chatLog.js test/unit/chatLog.test.js
git commit -m "feat: add getRecentChatHistory for conversation memory"
```

---

### Task 2: Provider Usage Extraction

**Files:**
- Modify: `lib/providers/anthropic.js`
- Modify: `lib/providers/openaiCompatible.js`
- Test: `test/unit/providers.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: both `fromAnthropicResponse` and `fromOpenAiResponse` now include a `usage: { inputTokens, outputTokens }` field in the returned assistant message (defaulting to `{inputTokens: 0, outputTokens: 0}` when the API response has no usage data). Used by Task 3 (`runAgent`).

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/providers.test.js`, inside the `describe('anthropic provider', ...)` block:

```js
it('extracts usage from the response', async () => {
    sinon.stub(global, 'fetch').resolves({
        ok: true,
        json: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 120, output_tokens: 45 },
        }),
    });

    const provider = createAnthropicProvider({ apiKey: 'key' });
    const result = await provider.chat({ system: 's', messages: [], tools: [] });

    expect(result.usage).to.deep.equal({ inputTokens: 120, outputTokens: 45 });
});

it('defaults usage to zero when the response has none', async () => {
    sinon.stub(global, 'fetch').resolves({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }),
    });

    const provider = createAnthropicProvider({ apiKey: 'key' });
    const result = await provider.chat({ system: 's', messages: [], tools: [] });

    expect(result.usage).to.deep.equal({ inputTokens: 0, outputTokens: 0 });
});
```

Add to the `describe('openai-compatible provider', ...)` block:

```js
it('extracts usage from the response', async () => {
    sinon.stub(global, 'fetch').resolves({
        ok: true,
        json: async () => ({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 200, completion_tokens: 60 },
        }),
    });

    const provider = createOpenAiCompatibleProvider({ apiKey: 'key', model: 'x' });
    const result = await provider.chat({ system: 's', messages: [], tools: [] });

    expect(result.usage).to.deep.equal({ inputTokens: 200, outputTokens: 60 });
});

it('defaults usage to zero when the response has none', async () => {
    sinon.stub(global, 'fetch').resolves({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    });

    const provider = createOpenAiCompatibleProvider({ apiKey: 'key', model: 'x' });
    const result = await provider.chat({ system: 's', messages: [], tools: [] });

    expect(result.usage).to.deep.equal({ inputTokens: 0, outputTokens: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/providers.test.js`
Expected: FAIL — the 4 new tests fail because `result.usage` is `undefined`.

- [ ] **Step 3: Update `fromAnthropicResponse` in `lib/providers/anthropic.js`**

Find:

```js
    return {
        role: 'assistant',
        content: text,
        toolCalls,
        stopReason: data.stop_reason,
    };
```

Replace with:

```js
    const usage = data.usage || {};

    return {
        role: 'assistant',
        content: text,
        toolCalls,
        stopReason: data.stop_reason,
        usage: {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
        },
    };
```

- [ ] **Step 4: Update `fromOpenAiResponse` in `lib/providers/openaiCompatible.js`**

Find:

```js
    return {
        role: 'assistant',
        content: message.content || '',
        toolCalls,
        stopReason: choice.finish_reason,
    };
```

Replace with:

```js
    const usage = data.usage || {};

    return {
        role: 'assistant',
        content: message.content || '',
        toolCalls,
        stopReason: choice.finish_reason,
        usage: {
            inputTokens: usage.prompt_tokens || 0,
            outputTokens: usage.completion_tokens || 0,
        },
    };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx mocha test/unit/providers.test.js`
Expected: PASS (13 tests — 9 existing + 4 new).

- [ ] **Step 6: Commit**

```bash
git add lib/providers/anthropic.js lib/providers/openaiCompatible.js test/unit/providers.test.js
git commit -m "feat: extract token usage from provider responses"
```

---

### Task 3: Agent — Conversation Memory + Usage Aggregation

**Files:**
- Modify: `lib/agent.js`
- Test: `test/unit/agent.test.js`

**Interfaces:**
- Consumes: `provider.chat(...)`'s new `usage` field (Task 2).
- Produces: `runAgent({provider, tools, systemPrompt, userMessage, priorMessages？, onAssistantText？}) => Promise<{finalText, messages, usage}>`. `priorMessages` is an optional array of already-normalized `{role, content}` messages prepended before the new user message. `usage` in the return value is `{inputTokens, outputTokens}` summed across every `provider.chat` call made during the run. Used by Task 7 (`main.js`).

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/agent.test.js`:

```js
it('prepends priorMessages before the new user message', async () => {
    const provider = {
        chat: sinon.stub().callsFake(async ({ messages }) => {
            expect(messages[0]).to.deep.equal({ role: 'user', content: 'erste Frage' });
            expect(messages[1]).to.deep.equal({ role: 'assistant', content: 'erste Antwort' });
            expect(messages[2]).to.deep.equal({ role: 'user', content: 'zweite Frage' });
            return { role: 'assistant', content: 'zweite Antwort', toolCalls: [], stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } };
        }),
    };
    const tools = { definitions: [], execute: async () => {} };

    const result = await runAgent({
        provider,
        tools,
        systemPrompt: 's',
        userMessage: 'zweite Frage',
        priorMessages: [
            { role: 'user', content: 'erste Frage' },
            { role: 'assistant', content: 'erste Antwort' },
        ],
    });

    expect(result.finalText).to.equal('zweite Antwort');
});

it('works without priorMessages (backward compatible)', async () => {
    const provider = {
        chat: sinon.stub().callsFake(async ({ messages }) => {
            expect(messages).to.deep.equal([{ role: 'user', content: 'Frage' }]);
            return { role: 'assistant', content: 'Antwort', toolCalls: [], stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } };
        }),
    };
    const tools = { definitions: [], execute: async () => {} };

    const result = await runAgent({ provider, tools, systemPrompt: 's', userMessage: 'Frage' });

    expect(result.finalText).to.equal('Antwort');
});

it('sums usage across multiple tool-calling iterations', async () => {
    const responses = [
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'listCatalog', input: {} }], stopReason: 'tool_use', usage: { inputTokens: 10, outputTokens: 5 } },
        { role: 'assistant', content: 'fertig', toolCalls: [], stopReason: 'end_turn', usage: { inputTokens: 20, outputTokens: 8 } },
    ];
    let call = 0;
    const provider = { chat: async () => responses[call++] };
    const tools = { definitions: [], execute: async () => ({}) };

    const result = await runAgent({ provider, tools, systemPrompt: 's', userMessage: 'Frage' });

    expect(result.usage).to.deep.equal({ inputTokens: 30, outputTokens: 13 });
});

it('defaults usage to zero total when a provider response has no usage field', async () => {
    const provider = {
        chat: async () => ({ role: 'assistant', content: 'ok', toolCalls: [], stopReason: 'end_turn' }),
    };
    const tools = { definitions: [], execute: async () => {} };

    const result = await runAgent({ provider, tools, systemPrompt: 's', userMessage: 'Frage' });

    expect(result.usage).to.deep.equal({ inputTokens: 0, outputTokens: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/agent.test.js`
Expected: FAIL — `priorMessages` is ignored and `result.usage` is `undefined`.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `lib/agent.js` with:

```js
// lib/agent.js
'use strict';

const MAX_ITERATIONS = 8;

async function runAgent({ provider, tools, systemPrompt, userMessage, priorMessages, onAssistantText }) {
    const messages = [...(priorMessages || []), { role: 'user', content: userMessage }];
    const usage = { inputTokens: 0, outputTokens: 0 };

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const assistantMessage = await provider.chat({
            system: systemPrompt,
            messages,
            tools: tools.definitions,
        });

        if (assistantMessage.usage) {
            usage.inputTokens += assistantMessage.usage.inputTokens || 0;
            usage.outputTokens += assistantMessage.usage.outputTokens || 0;
        }

        messages.push(assistantMessage);

        if (assistantMessage.content && onAssistantText) {
            onAssistantText(assistantMessage.content);
        }

        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
            return { finalText: assistantMessage.content, messages, usage };
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
Expected: PASS (8 tests — 4 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/agent.js test/unit/agent.test.js
git commit -m "feat: add conversation memory and usage aggregation to the agent loop"
```

---

### Task 4: Token Usage Budget Tracking

**Files:**
- Create: `lib/usage.js`
- Test: `test/unit/usage.test.js`

**Interfaces:**
- Consumes: `adapter.getStateAsync`, `adapter.setObjectNotExistsAsync`, `adapter.setStateAsync` (same pattern as `chatLog.js`), `adapter.config.dailyTokenBudget`.
- Produces:
  - `ensureUsageState(adapter) => Promise<void>`
  - `recordUsage(adapter, {inputTokens, outputTokens}) => Promise<{date, tokensToday}>` — adds to today's counter, resetting to 0 first if the stored date differs from today (UTC date string `YYYY-MM-DD`).
  - `getTodayUsage(adapter) => Promise<{date, tokensToday}>` — reads without mutating; returns `{date: <today>, tokensToday: 0}` if no state exists yet or the stored date is stale.
  - `isBudgetExceeded(adapter) => Promise<boolean>` — `false` if `adapter.config.dailyTokenBudget` is falsy/0 (no limit); otherwise compares `getTodayUsage(adapter).tokensToday >= adapter.config.dailyTokenBudget`.
  - Used by Task 7 (`main.js`).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/usage.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { ensureUsageState, recordUsage, getTodayUsage, isBudgetExceeded, USAGE_STATE } = require('../../lib/usage');

function makeAdapter(config) {
    return {
        config: config || {},
        setObjectNotExistsAsync: sinon.stub().resolves(),
        getStateAsync: sinon.stub(),
        setStateAsync: sinon.stub().resolves(),
    };
}

describe('usage', () => {
    it('USAGE_STATE points at usage.today', () => {
        expect(USAGE_STATE).to.equal('usage.today');
    });

    it('ensureUsageState creates the state object', async () => {
        const adapter = makeAdapter();
        await ensureUsageState(adapter);
        expect(adapter.setObjectNotExistsAsync.calledOnce).to.equal(true);
        expect(adapter.setObjectNotExistsAsync.firstCall.args[0]).to.equal(USAGE_STATE);
    });

    it('recordUsage starts a fresh counter when no state exists', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves(null);

        const result = await recordUsage(adapter, { inputTokens: 100, outputTokens: 20 });

        expect(result.tokensToday).to.equal(120);
        const [, state] = adapter.setStateAsync.firstCall.args;
        expect(JSON.parse(state.val).tokensToday).to.equal(120);
    });

    it('recordUsage adds to an existing same-day counter', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves({ val: JSON.stringify({ date: today, tokensToday: 500 }) });

        const result = await recordUsage(adapter, { inputTokens: 10, outputTokens: 5 });

        expect(result.tokensToday).to.equal(515);
    });

    it('recordUsage resets the counter when the stored date is stale', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves({ val: JSON.stringify({ date: '2000-01-01', tokensToday: 99999 }) });

        const result = await recordUsage(adapter, { inputTokens: 10, outputTokens: 5 });

        expect(result.tokensToday).to.equal(15);
    });

    it('getTodayUsage returns zero when no state exists', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves(null);
        const result = await getTodayUsage(adapter);
        expect(result.tokensToday).to.equal(0);
    });

    it('isBudgetExceeded is false when dailyTokenBudget is 0 or unset', async () => {
        const adapter = makeAdapter({ dailyTokenBudget: 0 });
        expect(await isBudgetExceeded(adapter)).to.equal(false);
    });

    it('isBudgetExceeded compares tokensToday against the configured budget', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const adapter = makeAdapter({ dailyTokenBudget: 1000 });
        adapter.getStateAsync.resolves({ val: JSON.stringify({ date: today, tokensToday: 1500 }) });

        expect(await isBudgetExceeded(adapter)).to.equal(true);
    });

    it('isBudgetExceeded is false when under budget', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const adapter = makeAdapter({ dailyTokenBudget: 1000 });
        adapter.getStateAsync.resolves({ val: JSON.stringify({ date: today, tokensToday: 200 }) });

        expect(await isBudgetExceeded(adapter)).to.equal(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/usage.test.js`
Expected: FAIL — `Cannot find module '../../lib/usage'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/usage.js
'use strict';

const USAGE_STATE = 'usage.today';

function todayString() {
    return new Date().toISOString().slice(0, 10);
}

async function ensureUsageState(adapter) {
    await adapter.setObjectNotExistsAsync(USAGE_STATE, {
        type: 'state',
        common: { name: 'Token usage today', type: 'string', role: 'json', read: true, write: false },
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

async function recordUsage(adapter, usage) {
    const current = await getTodayUsage(adapter);
    const added = (usage.inputTokens || 0) + (usage.outputTokens || 0);
    const updated = { date: current.date, tokensToday: current.tokensToday + added };
    await adapter.setStateAsync(USAGE_STATE, { val: JSON.stringify(updated), ack: true });
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

module.exports = { ensureUsageState, recordUsage, getTodayUsage, isBudgetExceeded, USAGE_STATE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/usage.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/usage.js test/unit/usage.test.js
git commit -m "feat: add daily token usage tracking and budget check"
```

---

### Task 5: Catalog Write Tool — `updateCatalogEntry` + `listCatalog` needsReviewOnly

**Files:**
- Modify: `lib/tools.js`
- Test: `test/unit/tools.test.js`

**Interfaces:**
- Consumes: `getAllCatalogEntries`, `setCatalogEntry`, `CATEGORIES` (Task 3 of the original plan, `lib/catalog.js` — unchanged).
- Produces: `buildTools(adapter)`'s `definitions` array grows to 4 entries (adds `updateCatalogEntry`); `listCatalog`'s execute path accepts an optional `needsReviewOnly` boolean; a new `updateCatalogEntry` execute path that only permits editing entries where `needsReview === true`. Used by Task 7 (`main.js`, via the existing `this.tools`).

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/tools.test.js`:

```js
it('exposes listCatalog, getHistory, compareTimeframes and updateCatalogEntry definitions', () => {
    const { buildTools } = require('../../lib/tools');
    const { definitions } = buildTools({});
    expect(definitions.map((d) => d.name)).to.deep.equal([
        'listCatalog',
        'getHistory',
        'compareTimeframes',
        'updateCatalogEntry',
    ]);
});

it('listCatalog with needsReviewOnly returns only entries pending review', async () => {
    const entries = [
        { sourceId: 'a', category: 'lighting', active: true, needsReview: false },
        { sourceId: 'b', category: 'consumption', active: true, needsReview: true },
        { sourceId: 'c', category: 'consumption', active: false, needsReview: true },
    ];
    const { buildTools } = loadToolsWithStubs({
        getAllCatalogEntries: sinon.stub().resolves(entries),
    });

    const { execute } = buildTools({});
    const result = await execute('listCatalog', { needsReviewOnly: true });

    expect(result.map((e) => e.sourceId)).to.deep.equal(['b', 'c']);
});

it('updateCatalogEntry updates a needsReview entry and clears the flag', async () => {
    const existingEntry = {
        sourceId: 'javascript.0.steckdose3', description: 'Unklar', unit: '', category: 'device_usage',
        room: '', confidence: 'low', needsReview: true, active: true, historyInstance: 'history.0', lastSeen: '2000-01-01T00:00:00.000Z',
    };
    const setCatalogEntry = sinon.stub().resolves();
    const { buildTools } = loadToolsWithStubs({
        getAllCatalogEntries: sinon.stub().resolves([existingEntry]),
        setCatalogEntry,
    });

    const adapter = {};
    const { execute } = buildTools(adapter);
    await execute('updateCatalogEntry', {
        sourceId: 'javascript.0.steckdose3',
        description: 'Waschmaschine Steckdose',
        category: 'device_usage',
        room: 'Waschkeller',
    });

    expect(setCatalogEntry.calledOnce).to.equal(true);
    const [, updated] = setCatalogEntry.firstCall.args;
    expect(updated).to.deep.include({
        sourceId: 'javascript.0.steckdose3',
        description: 'Waschmaschine Steckdose',
        category: 'device_usage',
        room: 'Waschkeller',
        needsReview: false,
        confidence: 'high',
        active: true,
        historyInstance: 'history.0',
    });
});

it('updateCatalogEntry rejects an entry that is not marked needsReview', async () => {
    const existingEntry = {
        sourceId: 'javascript.0.x', description: 'Bekannt', unit: '', category: 'consumption',
        room: '', confidence: 'high', needsReview: false, active: true, historyInstance: 'influxdb.0', lastSeen: '2000-01-01T00:00:00.000Z',
    };
    const setCatalogEntry = sinon.stub().resolves();
    const { buildTools } = loadToolsWithStubs({
        getAllCatalogEntries: sinon.stub().resolves([existingEntry]),
        setCatalogEntry,
    });

    const { execute } = buildTools({});

    let threw = false;
    try {
        await execute('updateCatalogEntry', { sourceId: 'javascript.0.x', description: 'x', category: 'consumption' });
    } catch (e) {
        threw = true;
    }

    expect(threw).to.equal(true);
    expect(setCatalogEntry.called).to.equal(false);
});

it('updateCatalogEntry throws for an unknown sourceId', async () => {
    const { buildTools } = loadToolsWithStubs({
        getAllCatalogEntries: sinon.stub().resolves([]),
    });
    const { execute } = buildTools({});

    let threw = false;
    try {
        await execute('updateCatalogEntry', { sourceId: 'unknown', description: 'x', category: 'consumption' });
    } catch (e) {
        threw = true;
    }
    expect(threw).to.equal(true);
});
```

Note: the existing test `'exposes listCatalog, getHistory and compareTimeframes definitions'` must be UPDATED to the new name/assertion shown in the first new test above (replace it, don't leave both — there would otherwise be two conflicting assertions on `definitions`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/tools.test.js`
Expected: FAIL — `updateCatalogEntry` definition missing, `needsReviewOnly` not supported.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `lib/tools.js` with:

```js
// lib/tools.js
'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
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
                    needsReviewOnly: {
                        type: 'boolean',
                        description: 'Falls true: nur Objekte, die noch eine Rueckfrage vom Nutzer brauchen (needsReview)',
                    },
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
        {
            name: 'updateCatalogEntry',
            description:
                'Aktualisiert einen Katalogeintrag, NACHDEM der Nutzer im Chat geklaert hat, wofuer ein unsicheres ' +
                '(needsReview) Objekt steht. Funktioniert NUR fuer Objekte, die aktuell needsReview=true sind.',
            inputSchema: {
                type: 'object',
                properties: {
                    sourceId: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: CATEGORIES },
                    room: { type: 'string' },
                },
                required: ['sourceId', 'description', 'category'],
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

            if (input && input.needsReviewOnly) {
                return filtered.filter((entry) => entry.needsReview);
            }
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

        if (name === 'updateCatalogEntry') {
            const entry = await findCatalogEntry(input.sourceId);
            if (entry.needsReview !== true) {
                throw new Error(
                    `Objekt ${input.sourceId} ist nicht als needsReview markiert und kann daher nicht ueber dieses Werkzeug geaendert werden.`
                );
            }
            const updated = {
                ...entry,
                description: input.description,
                category: input.category,
                room: input.room || entry.room,
                needsReview: false,
                confidence: 'high',
                lastSeen: new Date().toISOString(),
            };
            await setCatalogEntry(adapter, updated);
            return updated;
        }

        throw new Error(`Unbekanntes Werkzeug: ${name}`);
    }

    return { definitions, execute };
}

module.exports = { buildTools };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/unit/tools.test.js`
Expected: PASS (10 tests — 6 kept/updated + 4 new, minus the one replaced definitions test counted once).

- [ ] **Step 5: Commit**

```bash
git add lib/tools.js test/unit/tools.test.js
git commit -m "feat: add scoped updateCatalogEntry write tool and needsReviewOnly listing"
```

---

### Task 6: Silly-Level Logging — Discovery & Onboarding

**Files:**
- Modify: `lib/discovery.js`
- Modify: `lib/onboarding.js`
- Test: `test/unit/discovery.test.js`, `test/unit/onboarding.test.js`

**Interfaces:**
- Consumes: `adapter.log.silly(message)` (standard ioBroker adapter logging method — already used elsewhere in this codebase via `adapter.log.error`/`.warn`).
- Produces: no signature changes — both functions still take the same parameters and return the same values. Purely additive logging. Existing callers (Task 10/Task 9 of the original plan) are unaffected.

- [ ] **Step 1: Write the failing test for discovery**

Add to `test/unit/discovery.test.js` (extend the existing `adapter` fixture with a `log` stub, add a new assertion):

```js
it('logs a silly-level summary of the scan and each matched object', async () => {
    const adapter = {
        log: { silly: sinon.stub() },
        getForeignObjectsAsync: sinon.stub().resolves({
            'javascript.0.verbrauch.gesamt': {
                common: { name: 'Gesamtverbrauch', custom: { 'influxdb.0': { enabled: true } } },
            },
        }),
    };

    await findHistorizedObjects(adapter);

    expect(adapter.log.silly.called).to.equal(true);
    const messages = adapter.log.silly.getCalls().map((call) => call.args[0]);
    expect(messages.some((m) => m.includes('javascript.0.verbrauch.gesamt'))).to.equal(true);
    expect(messages.some((m) => m.includes('influxdb.0'))).to.equal(true);
});
```

- [ ] **Step 2: Write the failing test for onboarding**

Add to `test/unit/onboarding.test.js`:

```js
it('logs a silly-level summary per batch and per classified object', async () => {
    const discovered = [
        { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x', role: 'value', unit: 'kWh' } },
    ];
    const adapter = { log: { silly: sinon.stub(), error: sinon.stub() } };
    const provider = {
        chat: sinon.stub().resolves({
            role: 'assistant',
            content: JSON.stringify([
                { sourceId: 'javascript.0.x', description: 'Test', unit: 'kWh', category: 'consumption', room: '', confidence: 'high' },
            ]),
            toolCalls: [],
            stopReason: 'end_turn',
        }),
    };
    const { runOnboarding } = loadOnboardingWithStubs({
        getAllCatalogEntries: sinon.stub().resolves([]),
        setCatalogEntry: sinon.stub().resolves(),
    });

    await runOnboarding(adapter, provider, discovered);

    expect(adapter.log.silly.called).to.equal(true);
    const messages = adapter.log.silly.getCalls().map((call) => call.args[0]);
    expect(messages.some((m) => m.includes('javascript.0.x'))).to.equal(true);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx mocha test/unit/discovery.test.js test/unit/onboarding.test.js`
Expected: FAIL — `adapter.log.silly` never called (existing implementations don't log at all).

- [ ] **Step 4: Add logging to `lib/discovery.js`**

In `findHistorizedObjects`, after the `const objects = await adapter.getForeignObjectsAsync('*', 'state');` line, add:

```js
    if (adapter.log) {
        adapter.log.silly(`Discovery: durchsuche ${Object.keys(objects).length} Objekte nach aktivem History-Logging`);
    }
```

Inside the `if (loggingInstance) { ... }` block, after `result.push({...})`, add:

```js
            if (adapter.log) {
                adapter.log.silly(`Discovery: ${id} hat aktives Logging ueber ${loggingInstance}`);
            }
```

- [ ] **Step 5: Add logging to `lib/onboarding.js`**

In `runOnboarding`, inside the `for (let i = 0; ...)` loop, right after `const prompt = buildClassificationPrompt(batch);`, add:

```js
        if (adapter.log) {
            adapter.log.silly(`Onboarding: klassifiziere Batch ${i / BATCH_SIZE + 1} mit ${batch.length} Objekten`);
        }
```

Inside the `for (const classification of classifications) { ... }` loop, right after the `const entry = {...};` block (before `try { await setCatalogEntry ...`), add:

```js
            if (adapter.log) {
                adapter.log.silly(`Onboarding: ${entry.sourceId} -> Kategorie=${entry.category}, Confidence=${entry.confidence}`);
            }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx mocha test/unit/discovery.test.js test/unit/onboarding.test.js`
Expected: PASS (discovery: 3 tests; onboarding: 8 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/discovery.js lib/onboarding.js test/unit/discovery.test.js test/unit/onboarding.test.js
git commit -m "feat: add silly-level logging to discovery and onboarding"
```

---

### Task 7: Main.js Wiring — Conversation Memory, Budget Checks, Logging, Rückfrage-Prompt

**Files:**
- Modify: `main.js`
- Test: `test/adapter.test.js` (re-run only)

**Interfaces:**
- Consumes: `getRecentChatHistory` (Task 1), `runAgent`'s new `priorMessages`/`usage` (Task 3), `ensureUsageState`/`recordUsage`/`isBudgetExceeded` (Task 4), `buildTools`'s grown definitions (Task 5, no main.js signature change needed — `this.tools = buildTools(this)` already picks up the new tool automatically).
- Produces: updated `onReady`, `onMessage`, `runProactiveCheck` methods as described below.

- [ ] **Step 1: Update imports**

At the top of `main.js`, change:

```js
const { ensureChatHistoryState, appendChatMessage } = require('./lib/chatLog');
```
to:
```js
const { ensureChatHistoryState, appendChatMessage, getRecentChatHistory } = require('./lib/chatLog');
```

Add a new import line after the scheduler import:
```js
const { ensureUsageState, recordUsage, isBudgetExceeded } = require('./lib/usage');
```

- [ ] **Step 2: Initialize the usage state in `onReady`**

Find:
```js
    async onReady() {
        await ensureChatHistoryState(this);
```
Replace with:
```js
    async onReady() {
        await ensureChatHistoryState(this);
        await ensureUsageState(this);
```

- [ ] **Step 3: Rewrite `onMessage` for conversation memory, budget check, updated prompt, and logging**

Replace the entire `onMessage` method with:

```js
    async onMessage(obj) {
        if (!obj || obj.command !== 'chatQuestion') return;

        const question = obj.message && obj.message.text;

        if (typeof question !== 'string' || !question.trim()) {
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: 'Leere Frage' }, obj.callback);
            }
            return;
        }

        this.log.silly(`Chat: Frage erhalten: ${question.slice(0, 200)}`);

        if (await isBudgetExceeded(this)) {
            this.log.warn('Chat: Tagesbudget an Tokens ist erschoepft, Frage wird nicht beantwortet.');
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: 'Tagesbudget an Tokens ist erschoepft.' }, obj.callback);
            }
            return;
        }

        try {
            await appendChatMessage(this, 'user', question);
            const priorEntries = await getRecentChatHistory(this, 10);
            const priorMessages = priorEntries.map((entry) => ({ role: entry.role, content: entry.text }));

            const { finalText, usage } = await runAgent({
                provider: this.provider,
                tools: this.tools,
                systemPrompt:
                    `Aktuelle Zeit: ${new Date().toISOString()} (${Date.now()} ms seit Epoch, Unix-Millisekunden). ` +
                    'Du beantwortest Fragen zu Smart-Home-Verbrauchsdaten anhand der katalogisierten Objekte. ' +
                    'Zeitangaben fuer getHistory/compareTimeframes sind IMMER Unix-Millisekunden relativ zur oben genannten aktuellen Zeit. ' +
                    'Falls der Nutzer eine offene Rueckfrage zu einem unsicheren Objekt beantwortet (du kannst offene Rueckfragen mit ' +
                    'listCatalog({needsReviewOnly: true}) einsehen), aktualisiere den Eintrag mit updateCatalogEntry.',
                userMessage: question,
                priorMessages,
            });

            await recordUsage(this, usage);
            this.log.silly(`Chat: Antwort gesendet: ${finalText.slice(0, 200)}`);

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
```

- [ ] **Step 4: Update `runProactiveCheck` for budget check and logging**

Replace the entire `runProactiveCheck` method with:

```js
    async runProactiveCheck() {
        this.log.silly('Proaktive Pruefung: Lauf gestartet');

        if (await isBudgetExceeded(this)) {
            this.log.warn('Proaktive Pruefung: Tagesbudget an Tokens ist erschoepft, Lauf wird uebersprungen.');
            return;
        }

        const silentIfNothingFound = this.config.silentIfNothingFound === true;

        const { finalText, usage } = await runAgent({
            provider: this.provider,
            tools: this.tools,
            systemPrompt:
                `Aktuelle Zeit: ${new Date().toISOString()} (${Date.now()} ms seit Epoch, Unix-Millisekunden). ` +
                'Du pruefst katalogisierte Smart-Home-Objekte auf Auffaelligkeiten (Geraetenutzung, Beleuchtung, ' +
                'Verbrauch, PV-Einspeisung) der letzten 24 Stunden. Begruende Auffaelligkeiten mit konkreten Werten. ' +
                'Zeitangaben fuer getHistory/compareTimeframes sind IMMER Unix-Millisekunden relativ zur oben genannten aktuellen Zeit. ' +
                'Wenn nichts auffaellig ist, antworte kurz mit "Keine Auffaelligkeiten."',
            userMessage: 'Fuehre die periodische Pruefung durch.',
        });

        await recordUsage(this, usage);

        const isNothingFound = finalText.trim().toLowerCase().startsWith('keine auffaelligkeiten');
        this.log.silly(`Proaktive Pruefung: Lauf beendet, Ergebnis: ${isNothingFound ? 'keine Auffaelligkeiten' : 'Auffaelligkeit gefunden'}`);

        if (isNothingFound && silentIfNothingFound) {
            return;
        }

        await appendChatMessage(this, 'assistant', finalText);
    }
```

- [ ] **Step 5: Run the adapter smoke test and full unit suite**

Run: `npm run test:adapter`
Expected: PASS.

Run: `npm run test:unit`
Expected: PASS (all prior + new task tests green).

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: wire conversation memory, token budget, and silly logging into main.js"
```

---

### Task 8: Admin Config — Daily Token Budget Field

**Files:**
- Modify: `admin/jsonConfig.json`
- Modify: `io-package.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `this.config.dailyTokenBudget` becomes readable in `main.js` (already consumed by `lib/usage.js`'s `isBudgetExceeded` from Task 4). No automated test — matches the existing pattern for JSON Config fields (Task 12 of the original plan).

- [ ] **Step 1: Add the native default to `io-package.json`**

In the `"native"` object, add a new field:

```json
    "checkIntervalHours": 24,
    "silentIfNothingFound": false,
    "dailyTokenBudget": 0
```

(i.e. add `"dailyTokenBudget": 0,` right after `"silentIfNothingFound": false,` — remember to keep valid JSON/commas.)

- [ ] **Step 2: Add the form field to `admin/jsonConfig.json`**

In `"items"`, add after `silentIfNothingFound`:

```json
    "dailyTokenBudget": {
      "type": "number",
      "label": "Taegliches Token-Budget (0 = kein Limit)",
      "default": 0,
      "min": 0
    }
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('io-package.json'))"`
Run: `node -e "JSON.parse(require('fs').readFileSync('admin/jsonConfig.json'))"`
Expected: both exit with no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add admin/jsonConfig.json io-package.json
git commit -m "feat: add daily token budget admin config field"
```

---

### Task 9: Admin Chat Tab — Connection Fallback + UI Polish

**Files:**
- Modify: `admin/tab.js`
- Modify: `admin/tab.html`
- Test: `test/unit/tabFormat.test.js` (re-run only — `formatMessageLine` itself is unchanged; this task only touches connection/init/CSS)

**Interfaces:**
- Consumes: same `chat.history` state and `chatQuestion` message command as before — no server-side contract change.
- Produces: `admin/tab.js` no longer depends on the nonexistent `adapterNamespace` global. New exported (for testability) pure function `resolveNamespaceFromQuery(searchString)`.

- [ ] **Step 1: Write the failing test for the new pure function**

In `test/unit/tabFormat.test.js`, replace the existing import line:

```js
const { formatMessageLine } = require('../../admin/tab.js');
```

with:

```js
const { formatMessageLine, resolveNamespaceFromQuery } = require('../../admin/tab.js');
```

(Do not add a second, duplicate `require` line — there is only one import line for this module in the file; widen that one.)

Then add a new `describe` block:

```js
describe('resolveNamespaceFromQuery', () => {
    it('reads the instance from an "instance" query param', () => {
        expect(resolveNamespaceFromQuery('?instance=2')).to.equal('ai-analytics.2');
    });

    it('reads the instance from a short "i" query param', () => {
        expect(resolveNamespaceFromQuery('?i=1')).to.equal('ai-analytics.1');
    });

    it('defaults to instance 0 when no param is present', () => {
        expect(resolveNamespaceFromQuery('')).to.equal('ai-analytics.0');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/unit/tabFormat.test.js`
Expected: FAIL — `resolveNamespaceFromQuery is not a function`.

- [ ] **Step 3: Rewrite `admin/tab.js`**

```js
// admin/tab.js
let socket;
let namespace;

function formatMessageLine(entry) {
    return `[${entry.role}] ${entry.text}`;
}

function resolveNamespaceFromQuery(searchString) {
    const params = new URLSearchParams(searchString || '');
    const instance = params.get('instance') || params.get('i') || '0';
    return `ai-analytics.${instance}`;
}

function renderHistory(history) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    (history || []).forEach((entry) => {
        const line = document.createElement('div');
        line.className = `chat-message chat-message-${entry.role}`;
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = entry.text;
        const time = document.createElement('div');
        time.className = 'chat-timestamp';
        time.textContent = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
        line.appendChild(bubble);
        line.appendChild(time);
        container.appendChild(line);
    });
    container.scrollTop = container.scrollHeight;
}

function showConnectionError(message) {
    const container = document.getElementById('chat-messages');
    if (container) {
        container.textContent = message;
    }
    console.error(`[ai-analytics tab] ${message}`);
}

function setLoading(isLoading) {
    const button = document.getElementById('chat-send');
    if (button) {
        button.disabled = isLoading;
        button.textContent = isLoading ? '...' : 'Senden';
    }
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
    setLoading(true);

    socket.emit('sendTo', namespace, 'chatQuestion', { text }, (response) => {
        setLoading(false);
        if (response && response.history) {
            renderHistory(response.history);
        } else if (response && response.error) {
            const container = document.getElementById('chat-messages');
            const line = document.createElement('div');
            line.textContent = `[Fehler] ${response.error}`;
            container.appendChild(line);
        }
    });
}

function resolveConnection() {
    console.log('[ai-analytics tab] Versuche Verbindung herzustellen...');
    if (window.parent && window.parent !== window && window.parent.socket) {
        console.log('[ai-analytics tab] Verwende socket vom Elternfenster (parent.socket).');
        return window.parent.socket;
    }
    if (typeof io !== 'undefined') {
        console.log('[ai-analytics tab] Verwende eigenes io.connect() (same-origin).');
        return io.connect();
    }
    return null;
}

function init() {
    namespace = resolveNamespaceFromQuery(window.location.search);
    socket = resolveConnection();

    if (!socket) {
        showConnectionError('Verbindung zu ioBroker konnte nicht hergestellt werden.');
        return;
    }

    loadHistory();
    document.getElementById('chat-send').addEventListener('click', sendQuestion);
    document.getElementById('chat-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') sendQuestion();
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined') {
    module.exports = { formatMessageLine, resolveNamespaceFromQuery };
}
```

- [ ] **Step 4: Update `admin/tab.html` with chat-bubble CSS**

Replace the full contents of `admin/tab.html` with:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <link rel="stylesheet" type="text/css" href="../../css/adapter.css" />
    <style>
        body { font-family: sans-serif; margin: 0; }
        #chat-messages { height: 70vh; overflow-y: auto; padding: 12px; box-sizing: border-box; }
        .chat-message { display: flex; flex-direction: column; margin-bottom: 8px; }
        .chat-message-user { align-items: flex-end; }
        .chat-message-assistant { align-items: flex-start; }
        .chat-bubble { max-width: 70%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; word-break: break-word; }
        .chat-message-user .chat-bubble { background: #1976d2; color: #fff; }
        .chat-message-assistant .chat-bubble { background: #eee; color: #222; }
        .chat-timestamp { font-size: 11px; color: #888; margin-top: 2px; }
        #chat-input-row { display: flex; padding: 8px; border-top: 1px solid #ddd; }
        #chat-input { flex: 1; padding: 8px; }
        #chat-send { padding: 8px 16px; margin-left: 8px; }
    </style>
    <script type="text/javascript" src="../../lib/js/jquery-3.5.1.min.js"></script>
    <script type="text/javascript" src="../../socket.io/socket.io.js"></script>
    <script type="text/javascript" src="tab.js"></script>
</head>
<body>
    <div id="chat-messages"></div>
    <div id="chat-input-row">
        <input id="chat-input" type="text" placeholder="Frage stellen..." />
        <button id="chat-send">Senden</button>
    </div>
</body>
</html>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx mocha test/unit/tabFormat.test.js`
Expected: PASS (4 tests — 1 existing + 3 new).

Run: `npm test`
Expected: PASS — full suite green.

- [ ] **Step 6: Commit**

```bash
git add admin/tab.js admin/tab.html test/unit/tabFormat.test.js
git commit -m "feat: defensive chat-tab connection fallback and chat-bubble UI"
```

Note: this fix cannot be fully verified without the pending browser diagnostic on the real instance (see spec). It replaces a confirmed-wrong single assumption with a defensive multi-strategy approach that is strictly more likely to work, and now fails visibly instead of silently if both strategies fail.

---

### Task 10: New ADR + Documentation Updates

**Files:**
- Create: `docs/adr/0017-scoped-catalog-write-capability.md`
- Modify: `docs/adr/adr-index.md`
- Modify: `docs/adr/backlog.md`
- Modify: `docs/architecture/08-querschnittliche-konzepte.md`
- Modify: `docs/architecture/11-risiken-und-schulden.md`
- Modify: `CHANGELOG.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Create the new ADR**

```markdown
# ADR-0017: Scoped Catalog Write Capability for Resolving Onboarding Rückfragen

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Onboarding-Rückfragen zu unsicheren Objekten (`needsReview: true`) waren bis hierhin nicht beantwortbar — der Chat-Agent hatte nur lesende Werkzeuge (siehe [ADR-0002](0002-datenzugriff-nur-historisierte-objekte.md)). Der Nutzer wollte Rückfragen direkt im selben Chat beantworten können.

## Entscheidung

Der Chat-Agent bekommt ein einziges, eng begrenztes Schreib-Werkzeug (`updateCatalogEntry`), das ausschließlich Katalogeinträge mit `needsReview: true` bearbeiten darf. Ein Zugriffsversuch auf einen bereits geklärten Eintrag wird abgelehnt. Das Werkzeug kann `description`, `category`, `room` setzen und löscht danach `needsReview`.

## Konsequenzen

- Erste Schreibfähigkeit der KI überhaupt — bewusst auf den kleinstmöglichen Anwendungsfall begrenzt (nur unsichere, noch ungeklärte Einträge).
- Kein Zugriff auf bereits validierte Katalogeinträge oder andere ioBroker-States.
- Öffnet den Weg für künftige, ähnlich eng begrenzte Schreib-Werkzeuge (siehe [Backlog](backlog.md) Punkt 12 zum generellen Sicherheitsmodell für Schreibzugriffe).

## Verworfene Alternativen

- Ein Formular in der Admin-Konfiguration statt im Chat.
- Ein separates Message-Kommando außerhalb des normalen Chat-Flows.
```

- [ ] **Step 2: Add the row to `docs/adr/adr-index.md`**

Add after the `0016` row:

```markdown
| [0017](0017-scoped-catalog-write-capability.md) | Scoped Catalog Write Capability für Onboarding-Rückfragen | Angenommen | 2026-08-21 |
```

- [ ] **Step 3: Replace `docs/adr/backlog.md` with the trimmed, renumbered version**

Items 1 (Chat-Tab-Technologie), 2 (Onboarding-Rückfragen), 3 (Konversationsgedächtnis) and 5 (Kosten-/Token-Budget) from the current file are now resolved by this plan and ADR-0017 — remove them. Item 1's live-verification concern (does the connection fallback actually work on a real Admin instance) is NOT re-added here — that stays a note in arc42 §11 (Step 5 of this task), since it's a verification gap, not an open architecture decision. Renumber the remaining 12 items sequentially. Replace the ENTIRE file content with:

```markdown
# Backlog offener Architekturentscheidungen

[← ADR-Übersicht](adr-index.md) · [← Architektur-Übersicht](../architecture/arc42-index.md)

Architekturrelevante Fragen, die noch **nicht** entschieden wurden. Jeder Eintrag wird erst zu einer eigenen ADR unter `docs/adr/`, sobald eine Entscheidung getroffen ist. Sortiert nach grober Priorität (dringend/blockierend zuerst).

_Aktualisiert 2026-08-21: die vorherigen Punkte 1 (Chat-Tab-Technologie), 2 (Onboarding-Rückfragen), 3 (Konversationsgedächtnis) und 5 (Kosten-/Token-Budget) sind durch [ADR-0017](0017-scoped-catalog-write-capability.md) und die zugehörige [Spec](../specs/2026-08-21-chat-fixes-and-safeguards.md) aufgelöst. Die verbleibenden Punkte wurden entsprechend neu nummeriert._

## 1. Auswahl der History-Adapterinstanz(en) + manueller Re-Discovery-Trigger

Aktuell werden automatisch alle aktiven `influxdb`/`history`/`sql`-Instanzen berücksichtigt. Zu klären: soll die Admin-Konfiguration eine Instanz-Auswahl anbieten (Mehrfachauswahl-Feld)? Soll es einen Button/Message-Kommando geben, das `syncCatalog()` manuell ohne Adapter-Neustart auslöst (auch nützlich zum Testen der proaktiven Prüfung, siehe Punkt 12 unten — eigentlich derselbe Mechanismus).

## 2. Deduplizierung wiederholter Ausfallmeldungen

Spec verlangt "einmalig melden, nicht bei jedem Lauf erneut" bei komplettem Ausfall einer History-Instanz. Zu klären: welcher Zustand wird persistiert, um "bereits gemeldet" zu erkennen, und wann gilt eine Meldung als "erledigt" (nächster erfolgreicher Lauf? manuelles Zurücksetzen?).

## 3. Teststrategie für main.js und die Admin-UI

`test/adapter.test.js` ist durch eine veraltete `@iobroker/testing`-Verhaltensänderung faktisch wirkungslos (bestätigt weiterhin der Fall auch nach dem Dependency-Bump auf v5.3.0). Zu klären: `tests.integration` (echter js-controller, schwerer, näher an der Realität) oder ein proxyquire-basierter Fake-Adapter-Test (leichter, aber weniger realistisch)?

## 4. npm-Veröffentlichung und ioBroker-Katalog-Aufnahme

Aktuell nur GitHub-Release (Pre-Release), kein `npm publish`, keine Aufnahme in den offiziellen ioBroker-Adapter-Katalog. Zu klären: wann (nach erfolgreichem Abnahmetest? nach CI-Einführung? nach Behebung aller bekannten Lücken?) und ob überhaupt eine öffentliche Distribution gewünscht ist, oder ob es ein rein privates Tool bleibt.

## 5. CI-/Linting-/Dependency-Scanning-Stack (konkrete Tool-Wahl)

Bereits als Folge-Plan angekündigt (GitHub Actions, ESLint+Prettier, `@iobroker/adapter-dev`-Checker, CHANGELOG-Pflege, Dependabot/Renovate), aber noch keine konkreten Konfigurationsentscheidungen (z. B. welche ESLint-Regelbasis, welcher Node-Versionsmatrix in CI).

## 6. Versionierungs-/Release-Policy nach der Beta-Phase

Wann wird aus `0.0.x-beta` eine `0.1.0`? Nach welchen Kriterien (alle bekannten Lücken behoben? erfolgreicher Langzeit-Betrieb?). Noch nicht festgelegt.

## 7. Katalog-Skalierung bei großen Installationen

Von der Spec als spätere Optimierung markiert. Zu klären: Vorfilterung nach Kategorie/Raum, Embedding-basierte Relevanzsuche, oder einfache Paginierung — sobald eine reale Installation mit vielen hundert Objekten das nötig macht.

## 8. Sicherheitsmodell für zukünftige schreibende Werkzeuge

[ADR-0017](0017-scoped-catalog-write-capability.md) hat die erste, eng begrenzte Schreibfähigkeit (`updateCatalogEntry`, nur für `needsReview`-Einträge) eingeführt. Zu klären bleibt das generelle Modell für künftige, weitergehende Schreibzugriffe (z. B. Geräte schalten): reicht die aktuelle "Admin-Message-Bus"-Vertrauensgrenze noch, oder braucht es eine explizite Nutzerbestätigung pro Schreibaktion?

## 9. Mehrinstanz-Unterstützung

Können mehrere Instanzen dieses Adapters gleichzeitig laufen (z. B. für unterschiedliche Objektgruppen oder Räume)? Bisher nicht bedacht, `catalog.*`/`chat.*` sind pro Instanz getrennt, aber Discovery ist global über alle historisierten Objekte.

## 10. Katalog-Backup/-Restore

Geht der State-Speicher verloren (z. B. Objekte-DB-Reset), muss das komplette Onboarding neu laufen — bei großen Installationen potenziell teuer. Zu klären: Export/Import-Mechanismus für den Katalog?

## 11. WhatsApp-/Alexa-Anbindung — technische Richtung

Laut [ADR-0010](0010-ausgabekanal-v1-nur-chat-tab.md) als spätere Erweiterung vorgesehen, aber keine technische Richtung entschieden (eigene Bridge? bestehender Telegram-/WhatsApp-Adapter als Zwischenschicht? Alexa Smart Home Skill?).

## 12. Manueller Trigger für die proaktive Prüfung

Aktuell nur über das konfigurierte Intervall (Default 24h) auslösbar — es gibt keinen Weg, sie zu Test-/Debugging-Zwecken sofort anzustoßen. Hängt eng mit Punkt 1 (Re-Discovery-Trigger) zusammen — evtl. derselbe generische "jetzt ausführen"-Mechanismus für beides.
```

- [ ] **Step 4: Update `docs/architecture/08-querschnittliche-konzepte.md`**

In section 8.3 ("Sicherheits-/Zugriffskonzept"), find the bullet:
```
- Die KI hat **nie** direkten Datenbank-Query-Zugriff — nur die drei kuratierten Werkzeuge.
```
Replace with:
```
- Die KI hat **nie** direkten Datenbank-Query-Zugriff — nur die kuratierten Werkzeuge.
- Seit [ADR-0017](../adr/0017-scoped-catalog-write-capability.md) hat die KI eine einzige, eng begrenzte Schreibfähigkeit: `updateCatalogEntry` darf ausschließlich Katalogeinträge mit `needsReview: true` bearbeiten, um im Chat geklärte Rückfragen aufzulösen. Kein anderer Schreibzugriff existiert.
```

- [ ] **Step 5: Update `docs/architecture/11-risiken-und-schulden.md`**

Under the "Bestätigt **nicht** funktionierend" bullet for the Admin-Chat-Tab, append a sentence: `Ein defensiver Fix (Fallback-Kette statt der nicht-existenten adapterNamespace-Abhaengigkeit) wurde umgesetzt (siehe Spec/Plan vom 2026-08-21) — endgueltige Bestaetigung steht weiterhin aus, da die vereinbarte Browser-Konsolen-Diagnose nie geliefert wurde.`

- [ ] **Step 6: Add a CHANGELOG entry**

In `CHANGELOG.md`, add this new section immediately after the `# Changelog` header and its intro line, above the first `## [` version entry:

```markdown
## [Unreleased]

### Hinzugefügt
- Admin-Chat-Tab: defensive Verbindungs-Fallback-Kette (ersetzt die nicht-existente `adapterNamespace`-Abhängigkeit) + Chat-Bubble-UI mit Zeitstempeln und Lade-Indikator.
- Neues, eng begrenztes Schreib-Werkzeug `updateCatalogEntry` — der Chat-Agent kann Onboarding-Rückfragen (`needsReview`-Objekte) jetzt direkt im Chat auflösen (siehe [ADR-0017](docs/adr/0017-scoped-catalog-write-capability.md)).
- Konversationsgedächtnis: Chat-Fragen laufen jetzt mit den letzten 10 Nachrichten aus der Historie im Kontext.
- Tägliches Token-Budget (`dailyTokenBudget`, Default 0 = kein Limit) für Chat und proaktive Prüfung.
- `silly`-Level-Logging für Discovery, Onboarding, Agent-Aufrufe (Senden/Empfangen) und Chat-/Prüf-Läufe.

### Geändert
- Dev-Dependencies aktualisiert: mocha 10 → 11, sinon 17 → 22, `@iobroker/testing` 4 → 5. `chai` bewusst auf 4.x belassen (5/6 ist ESM-only, würde `require('chai')` brechen).
```

- [ ] **Step 7: Commit**

```bash
git add docs/adr/0017-scoped-catalog-write-capability.md docs/adr/adr-index.md docs/adr/backlog.md docs/architecture/08-querschnittliche-konzepte.md docs/architecture/11-risiken-und-schulden.md CHANGELOG.md
git commit -m "docs: add ADR-0017, trim resolved backlog items, update security section"
```

---

## Post-Implementation Manual Verification

Once all 10 tasks are complete and `npm test` passes:

1. Re-run the manual acceptance test's still-pending step: open the admin chat tab on the real instance, check the browser console for `[ai-analytics tab]` log lines to see which connection strategy fired (or the visible error if both failed).
2. If the tab now connects: test asking a question, test resolving an existing `needsReview` catalog entry by describing what it is in the chat, test a follow-up question that relies on the previous answer (conversation memory).
3. Set a very low `dailyTokenBudget` temporarily and confirm chat/proactive checks correctly refuse once exceeded.
4. Check the adapter log at `silly` level and confirm discovery/onboarding/chat/proactive-check activity is now visible.
