# LLM Token-Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurable, actually-enforced input/output token limits per LLM role (chat and onboarding), closing two real gaps (OpenAI-compatible providers never send an output cap; Anthropic's is hardcoded and invisible) and adding a pre-flight input-size safety check with one-shot chat-history compaction so oversized requests fail with a clear message instead of a provider error.

**Architecture:** One new focused module (`lib/tokenLimits.js`) is the single source of truth for limit resolution and size estimation, consumed at three existing call sites (`lib/providers/anthropic.js`, `lib/providers/openaiCompatible.js` for output caps; `lib/agent.js`'s `runAgent` and `lib/onboarding.js`'s `runOnboarding` for input pre-checks) without changing any of their public signatures. `main.js` is the only place that reads the new adapter settings and threads resolved values into the existing provider-config and `runtimeLimits` objects.

**Tech Stack:** Node.js/CommonJS (`lib/*.js`), Mocha/Chai/Sinon (backend tests), `@iobroker/json-config` JSON schema (`admin/jsonConfig.json`), a `vm`-based extraction test for the settings-CSV logic embedded in `src-admin/src/Components.jsx`.

**Spec:** [docs/specs/2026-09-08-llm-token-limits.md](../specs/2026-09-08-llm-token-limits.md)

## Global Constraints

- `npm test` (= `npm run test:unit && npm run test:admin`) must be green before every commit. `npm run lint` is part of final verification.
- TDD: every behavior task begins with a failing test.
- No tokenizer dependency — `estimateTokens`/`estimateRequestTokens` use `Math.ceil(text.length / 4)`, purely a pre-flight safety margin, never used for cost/billing (that stays exact, sourced from provider `usage` responses, unchanged).
- Compaction (spec Section D) applies ONLY to `priorMessages` (persisted, already-complete `chat.history` rounds — guaranteed alternating `[user, assistant]` pairs with no tool messages). It NEVER touches the in-flight tool-call sequence of the current question, to avoid breaking `tool_use`/`tool_result` pairing required by Anthropic/OpenAI-compatible APIs. Exactly one compaction attempt per request.
- Onboarding (`lib/onboarding.js`) gets the same input pre-check but never compaction (a single classification prompt has no conversation to summarize) — on overflow it fails the batch through the existing `try`/`catch`/`continue` path, never aborting the whole run.
- New settings: `chatMaxInputTokens` (default 100000, bounds 1000–1000000), `chatMaxOutputTokens` (default 4096, bounds 256–32768), `onboardingMaxInputTokens`/`onboardingMaxOutputTokens` (same bounds as their chat counterparts).

---

### Task 1: `lib/tokenLimits.js` — new module

**Files:**
- Create: `lib/tokenLimits.js`
- Test: `test/unit/tokenLimits.test.js` (new file)

**Interfaces:**
- Produces: `TOKEN_LIMIT_DEFAULTS` (`{ maxInputTokens: 100000, maxOutputTokens: 4096 }`), `TOKEN_LIMIT_BOUNDS` (`{ maxInputTokens: {min:1000,max:1000000}, maxOutputTokens: {min:256,max:32768} }`), `getTokenLimits(config, role)` where `role` is `'chat'` or `'onboarding'` — returns `{ maxInputTokens, maxOutputTokens }` reading `config[`${role}MaxInputTokens`]`/`config[`${role}MaxOutputTokens`]`, clamped like `lib/limits.js`'s `getLimits`. `estimateTokens(text)` → `Math.ceil(text.length / 4)`. `estimateRequestTokens({ system, messages, tools })` → sums `estimateTokens` over `system` (string, empty-string-safe), `JSON.stringify(messages)`, and `JSON.stringify(tools || [])`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/tokenLimits.test.js
const { expect } = require('chai');
const {
    TOKEN_LIMIT_DEFAULTS,
    TOKEN_LIMIT_BOUNDS,
    getTokenLimits,
    estimateTokens,
    estimateRequestTokens,
} = require('../../lib/tokenLimits');

describe('tokenLimits', () => {
    describe('getTokenLimits', () => {
        it('returns defaults when the config has no values for the given role', () => {
            expect(getTokenLimits({}, 'chat')).to.deep.equal({ maxInputTokens: 100000, maxOutputTokens: 4096 });
            expect(getTokenLimits({}, 'onboarding')).to.deep.equal({ maxInputTokens: 100000, maxOutputTokens: 4096 });
        });

        it('reads role-specific config fields', () => {
            const config = { chatMaxInputTokens: 5000, chatMaxOutputTokens: 1000, onboardingMaxInputTokens: 8000, onboardingMaxOutputTokens: 2000 };
            expect(getTokenLimits(config, 'chat')).to.deep.equal({ maxInputTokens: 5000, maxOutputTokens: 1000 });
            expect(getTokenLimits(config, 'onboarding')).to.deep.equal({ maxInputTokens: 8000, maxOutputTokens: 2000 });
        });

        it('clamps values below the minimum bound up to the minimum', () => {
            expect(getTokenLimits({ chatMaxInputTokens: 1 }, 'chat').maxInputTokens).to.equal(TOKEN_LIMIT_BOUNDS.maxInputTokens.min);
            expect(getTokenLimits({ chatMaxOutputTokens: 1 }, 'chat').maxOutputTokens).to.equal(TOKEN_LIMIT_BOUNDS.maxOutputTokens.min);
        });

        it('clamps values above the maximum bound down to the maximum', () => {
            expect(getTokenLimits({ chatMaxInputTokens: 99999999 }, 'chat').maxInputTokens).to.equal(TOKEN_LIMIT_BOUNDS.maxInputTokens.max);
            expect(getTokenLimits({ chatMaxOutputTokens: 99999999 }, 'chat').maxOutputTokens).to.equal(TOKEN_LIMIT_BOUNDS.maxOutputTokens.max);
        });

        it('falls back to the default for a non-numeric or missing value', () => {
            expect(getTokenLimits({ chatMaxInputTokens: 'not-a-number' }, 'chat').maxInputTokens).to.equal(TOKEN_LIMIT_DEFAULTS.maxInputTokens);
            expect(getTokenLimits({}, 'chat').maxOutputTokens).to.equal(TOKEN_LIMIT_DEFAULTS.maxOutputTokens);
        });
    });

    describe('estimateTokens', () => {
        it('divides character count by 4, rounding up', () => {
            expect(estimateTokens('')).to.equal(0);
            expect(estimateTokens('abcd')).to.equal(1);
            expect(estimateTokens('abcde')).to.equal(2);
            expect(estimateTokens('x'.repeat(100))).to.equal(25);
        });
    });

    describe('estimateRequestTokens', () => {
        it('sums estimates over system, messages, and tools', () => {
            const system = 'x'.repeat(40); // 10 tokens
            const messages = [{ role: 'user', content: 'x'.repeat(40) }]; // JSON.stringify adds quotes/braces, still counted
            const tools = [{ name: 'listCatalog' }];
            const expected = estimateTokens(system) + estimateTokens(JSON.stringify(messages)) + estimateTokens(JSON.stringify(tools));
            expect(estimateRequestTokens({ system, messages, tools })).to.equal(expected);
        });

        it('treats a missing tools array as empty', () => {
            const withEmpty = estimateRequestTokens({ system: 's', messages: [], tools: [] });
            const withUndefined = estimateRequestTokens({ system: 's', messages: [], tools: undefined });
            expect(withUndefined).to.equal(withEmpty);
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx mocha test/unit/tokenLimits.test.js`
Expected: FAIL with `Cannot find module '../../lib/tokenLimits'`.

- [ ] **Step 3: Implement `lib/tokenLimits.js`**

```js
// lib/tokenLimits.js
'use strict';

const TOKEN_LIMIT_DEFAULTS = Object.freeze({
    maxInputTokens: 100000,
    maxOutputTokens: 4096,
});

const TOKEN_LIMIT_BOUNDS = Object.freeze({
    maxInputTokens: { min: 1000, max: 1000000 },
    maxOutputTokens: { min: 256, max: 32768 },
});

function getTokenLimits(config = {}, role) {
    const limits = {};
    for (const [key, fallback] of Object.entries(TOKEN_LIMIT_DEFAULTS)) {
        const bounds = TOKEN_LIMIT_BOUNDS[key];
        const configKey = `${role}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        const value = Number(config[configKey]);
        limits[key] = Number.isSafeInteger(value) ? Math.min(bounds.max, Math.max(bounds.min, value)) : fallback;
    }
    return limits;
}

function estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
}

function estimateRequestTokens({ system, messages, tools }) {
    return estimateTokens(system || '') + estimateTokens(JSON.stringify(messages)) + estimateTokens(JSON.stringify(tools || []));
}

module.exports = { TOKEN_LIMIT_DEFAULTS, TOKEN_LIMIT_BOUNDS, getTokenLimits, estimateTokens, estimateRequestTokens };
```

Note the `configKey` construction: `role` is `'chat'` or `'onboarding'`, `key` is `'maxInputTokens'` or `'maxOutputTokens'` — `${role}${key.charAt(0).toUpperCase()}${key.slice(1)}` produces `chatMaxInputTokens`, `chatMaxOutputTokens`, `onboardingMaxInputTokens`, `onboardingMaxOutputTokens` exactly, mirroring `lib/limits.js`'s `getLimits` clamping pattern (invalid/missing → fallback; otherwise clamp to bounds).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx mocha test/unit/tokenLimits.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full unit suite for regressions**

Run: `npm run test:unit`
Expected: PASS (451 pre-existing + new tokenLimits tests).

- [ ] **Step 6: Commit**

```bash
git add lib/tokenLimits.js test/unit/tokenLimits.test.js
git commit -m "feat: add lib/tokenLimits.js for per-role token limit resolution and size estimation"
```

---

### Task 2: Settings plumbing — `admin/jsonConfig.json`, `io-package.json`, `src-admin/src/Components.jsx`

**Files:**
- Modify: `admin/jsonConfig.json:125-228` (insert new fields after each provider's existing price fields)
- Modify: `io-package.json:75-96` (`native` defaults)
- Modify: `src-admin/src/Components.jsx:15-26` (`SETTINGS_COLUMNS`, `SETTINGS_NUMBER_COLUMNS`)
- Test: `test/unit/settingsCsvImport.test.js:100-127` (extend the existing CSV round-trip test)

**Interfaces:**
- Produces: four new adapter config keys (`chatMaxInputTokens`, `chatMaxOutputTokens`, `onboardingMaxInputTokens`, `onboardingMaxOutputTokens`) readable via `this.config.<key>` in `main.js` (Task 4) and `adapter.config.<key>` in `lib/onboarding.js` (Task 6).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test (extend the existing settings-CSV round-trip test)**

In `test/unit/settingsCsvImport.test.js`, replace the single test in the `describe('SettingsCsvComponent settings import', ...)` block (currently lines 101-126) with:

```js
    it('applies every imported settings column, not just the last one', async () => {
        const adapter = makeAdapter({
            checkIntervalHours: 24,
            dailyBudgetEur: 0,
            maxAgentIterations: 8,
            maxToolCalls: 32,
        });
        const component = makeComponent(adapter);
        const file = {
            text: async () =>
                'checkIntervalHours,dailyBudgetEur,maxAgentIterations,maxToolCalls\n48,999,7,31\n',
        };

        await component.handleFileSelected({ target: { files: [file] } });
        // Let the mock framework's deferred `cb` (macrotask) callbacks settle,
        // mirroring the real ConfigGeneric state update happening after onChange returns.
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(adapter.data).to.deep.equal({
            checkIntervalHours: 48,
            dailyBudgetEur: 999,
            maxAgentIterations: 7,
            maxToolCalls: 31,
        });
        expect(component.state.status).to.equal('4 Settings importiert. Bitte mit Speichern übernehmen.');
    });

    it('imports the new chat/onboarding token-limit columns as numbers', async () => {
        const adapter = makeAdapter({
            chatMaxInputTokens: 100000,
            chatMaxOutputTokens: 4096,
            onboardingMaxInputTokens: 100000,
            onboardingMaxOutputTokens: 4096,
        });
        const component = makeComponent(adapter);
        const file = {
            text: async () =>
                'chatMaxInputTokens,chatMaxOutputTokens,onboardingMaxInputTokens,onboardingMaxOutputTokens\n50000,2048,60000,3000\n',
        };

        await component.handleFileSelected({ target: { files: [file] } });
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(adapter.data).to.deep.equal({
            chatMaxInputTokens: 50000,
            chatMaxOutputTokens: 2048,
            onboardingMaxInputTokens: 60000,
            onboardingMaxOutputTokens: 3000,
        });
    });
```

- [ ] **Step 2: Run the test to verify the new one fails**

Run: `npx mocha test/unit/settingsCsvImport.test.js`
Expected: the new test FAILS with a `deep.equal` mismatch — `SETTINGS_NUMBER_COLUMNS` does not yet include the four new keys, so `validateSettingImportValue` returns the raw CSV strings (`'50000'`, `'2048'`, ...) unconverted, and the assertion expects numbers (`50000`, `2048`, ...) instead. `handleFileSelected` itself does not throw; the mismatch surfaces as a normal chai assertion failure.

- [ ] **Step 3: Add the four fields to `admin/jsonConfig.json`**

Insert immediately after the `chatPricePerMillionOutputTokens` block (ends at line 147 with `},`) and before `onboardingDivider` (line 148):

```json
        "chatMaxInputTokens": {
          "type": "number",
          "label": "Max. Eingabe-Tokens (Chat, Sicherheitsmarge)",
          "default": 100000,
          "min": 1000,
          "max": 1000000,
          "xs": 12,
          "sm": 6,
          "md": 3,
          "lg": 2,
          "xl": 2
        },
        "chatMaxOutputTokens": {
          "type": "number",
          "label": "Max. Ausgabe-Tokens (Chat)",
          "default": 4096,
          "min": 256,
          "max": 32768,
          "xs": 12,
          "sm": 6,
          "md": 3,
          "lg": 2,
          "xl": 2
        },
```

Insert immediately after the `onboardingPricePerMillionOutputTokens` block (ends at line 228 with `},`) and before `operationsDivider` (line 229):

```json
        "onboardingMaxInputTokens": {
          "type": "number",
          "label": "Max. Eingabe-Tokens (Onboarding, Sicherheitsmarge)",
          "default": 100000,
          "min": 1000,
          "max": 1000000,
          "xs": 12,
          "sm": 6,
          "md": 3,
          "lg": 2,
          "xl": 2
        },
        "onboardingMaxOutputTokens": {
          "type": "number",
          "label": "Max. Ausgabe-Tokens (Onboarding)",
          "default": 4096,
          "min": 256,
          "max": 32768,
          "xs": 12,
          "sm": 6,
          "md": 3,
          "lg": 2,
          "xl": 2
        },
```

- [ ] **Step 4: Add the four defaults to `io-package.json`'s `native` object**

Insert after `"chatPricePerMillionOutputTokens": 0,` (line 81):

```json
    "chatMaxInputTokens": 100000,
    "chatMaxOutputTokens": 4096,
```

Insert after `"onboardingPricePerMillionOutputTokens": 0,` (line 87):

```json
    "onboardingMaxInputTokens": 100000,
    "onboardingMaxOutputTokens": 4096,
```

- [ ] **Step 5: Add the four fields to `src-admin/src/Components.jsx`'s settings CSV lists**

Replace lines 15-26 with:

```js
const SETTINGS_COLUMNS = [
    'providerType', 'baseUrl', 'model', 'apiKey',
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'chatMaxInputTokens', 'chatMaxOutputTokens',
    'onboardingProviderType', 'onboardingBaseUrl', 'onboardingModel', 'onboardingApiKey',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'onboardingMaxInputTokens', 'onboardingMaxOutputTokens',
    'checkIntervalHours', 'dailyBudgetEur', 'maxAgentIterations', 'maxToolCalls', 'maxPeriodsPerRequest', 'maxPeriodsPerToolCall', 'silentIfNothingFound', 'enableValueKindBackfill', 'enableDataQualityBackfill',
];
const SETTINGS_NUMBER_COLUMNS = new Set([
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'chatMaxInputTokens', 'chatMaxOutputTokens',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'onboardingMaxInputTokens', 'onboardingMaxOutputTokens',
    'checkIntervalHours', 'dailyBudgetEur', 'maxAgentIterations', 'maxToolCalls', 'maxPeriodsPerRequest', 'maxPeriodsPerToolCall',
]);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx mocha test/unit/settingsCsvImport.test.js`
Expected: PASS (both tests).

- [ ] **Step 7: Run the full test suite for regressions**

Run: `npm test`
Expected: PASS. `npm run test:admin` matters here since `Components.jsx` changed.

- [ ] **Step 8: Commit**

```bash
git add admin/jsonConfig.json io-package.json src-admin/src/Components.jsx test/unit/settingsCsvImport.test.js
git commit -m "feat: add chat/onboarding max input/output token settings fields"
```

---

### Task 3: Output-cap wiring — `lib/providers/anthropic.js`, `lib/providers/openaiCompatible.js`

**Files:**
- Modify: `lib/providers/anthropic.js` (no code change needed — verify only, see Step 1)
- Modify: `lib/providers/openaiCompatible.js:242-275` (`createOpenAiCompatibleProvider`)
- Test: `test/unit/providers.test.js`

**Interfaces:**
- Consumes: `config.maxTokens` (a plain number, already the existing informal contract in `anthropic.js`; this task makes `openaiCompatible.js` honor the same field name for consistency — Task 4 is what actually populates `config.maxTokens` from the new settings).
- Produces: nothing new for later tasks — this is a leaf task.

- [ ] **Step 1: Confirm `anthropic.js` needs no code change**

Read `lib/providers/anthropic.js` around line 144: it already sends `max_tokens: config.maxTokens || 2048`. This task does not modify this file — it already honors `config.maxTokens` correctly; Task 4 is what starts actually populating that field with a real value instead of leaving it `undefined`. No step here writes to this file. (Listed in Files above only because the spec's Section B mentions it — confirming "no change needed" is itself the deliverable for this half of the task.)

- [ ] **Step 2: Write the failing tests for `openaiCompatible.js`**

Add to `test/unit/providers.test.js`, inside the separate top-level `describe('openai-compatible provider', () => { ... })` block (starts at line 132, sibling to `describe('anthropic provider', ...)` at line 12 and `describe('createProvider', ...)` at line 365) — add these three tests after the existing `'uses config.baseUrl when provided (OpenRouter / local)'` test:

```js
    it('sends max_tokens when config.maxTokens is provided (chat/completions)', async () => {
        const fetchStub = sinon.stub().resolves({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const provider = createOpenAiCompatibleProvider({ apiKey: 'key', model: 'gpt-4o-mini', maxTokens: 2048 });
        await provider.chat({ system: 's', messages: [], tools: [] });

        const body = JSON.parse(fetchStub.firstCall.args[1].body);
        expect(body.max_tokens).to.equal(2048);
    });

    it('omits max_tokens when config.maxTokens is not provided (chat/completions)', async () => {
        const fetchStub = sinon.stub().resolves({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const provider = createOpenAiCompatibleProvider({ apiKey: 'key', model: 'gpt-4o-mini' });
        await provider.chat({ system: 's', messages: [], tools: [] });

        const body = JSON.parse(fetchStub.firstCall.args[1].body);
        expect(body).not.to.have.property('max_tokens');
    });

    it('sends max_output_tokens when config.maxTokens is provided (Responses API)', async () => {
        const fetchStub = sinon.stub(global, 'fetch').resolves({
            ok: true,
            body: null,
            text: async () => JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }], usage: {} }),
        });

        const provider = createOpenAiCompatibleProvider({ type: 'opencode', apiKey: 'key', model: 'muse-spark-1.3-contributor-free', maxTokens: 1500 });
        await provider.chat({ system: 's', messages: [], tools: [] });

        const body = JSON.parse(fetchStub.firstCall.args[1].body);
        expect(body.max_output_tokens).to.equal(1500);
    });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx mocha test/unit/providers.test.js`
Expected: the three new tests FAIL — `body.max_tokens`/`body.max_output_tokens` are `undefined` since `openaiCompatible.js` never sends them.

- [ ] **Step 4: Implement in `lib/providers/openaiCompatible.js`**

Modify the `body: JSON.stringify({...})` construction inside `createOpenAiCompatibleProvider`'s `chat` method (current code, lines ~254-263):

```js
                body: JSON.stringify({
                    model: config.model,
                    ...(config.maxTokens !== undefined ? (useResponses ? { max_output_tokens: config.maxTokens } : { max_tokens: config.maxTokens }) : {}),
                    ...(useResponses ? {
                        input: toResponsesInput(system, messages),
                        tools: tools && tools.length ? toResponsesTools(tools) : undefined,
                    } : {
                        messages: toOpenAiMessages(system, messages),
                        tools: tools && tools.length ? toOpenAiTools(tools) : undefined,
                    }),
                }),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx mocha test/unit/providers.test.js`
Expected: PASS, all tests including the new three.

- [ ] **Step 6: Run the full unit suite for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/providers/openaiCompatible.js test/unit/providers.test.js
git commit -m "feat: send an output-token cap for OpenAI-compatible providers when configured"
```

---

### Task 4: `main.js` — wire settings into provider configs and `runtimeLimits`

**Files:**
- Modify: `main.js:1-30` (imports), `main.js:175-200` (provider config construction and `runtimeLimits`)

**Interfaces:**
- Consumes: `getTokenLimits` from `./lib/tokenLimits` (Task 1).
- Produces: `chatProviderConfig.maxTokens`/`onboardingProviderConfig.maxTokens` (consumed by `lib/providers/anthropic.js` and Task 3's `openaiCompatible.js` change); `this.runtimeLimits.maxInputTokens` (consumed by Task 5's `runAgent`).

- [ ] **Step 1: Read the current code precisely**

Read `main.js` around the top-level `require`s (find the existing `const { getLimits } = require('./lib/limits');`-style line) and the block building `chatProviderConfig`/`onboardingProviderConfig`/`this.runtimeLimits` (search for `this.chatProvider = this.buildProviderSafely`). Confirm the exact current lines before editing — this plan was written against a snapshot and line numbers may have shifted by a few lines due to Tasks 1-3, though none of those tasks touch `main.js`.

- [ ] **Step 2: Add the import**

Next to the existing `const { getLimits } = require('./lib/limits');` (or equivalent existing limits import), add:

```js
const { getTokenLimits } = require('./lib/tokenLimits');
```

- [ ] **Step 3: Extend `chatProviderConfig` construction**

Find:

```js
        const chatProviderConfig = {
            type: this.config.providerType,
            apiKey: this.config.apiKey,
            model: this.config.model,
            baseUrl: this.config.baseUrl,
        };
```

Replace with:

```js
        const chatTokenLimits = getTokenLimits(this.config, 'chat');
        const chatProviderConfig = {
            type: this.config.providerType,
            apiKey: this.config.apiKey,
            model: this.config.model,
            baseUrl: this.config.baseUrl,
            maxTokens: chatTokenLimits.maxOutputTokens,
        };
```

- [ ] **Step 4: Extend `onboardingProviderConfig` construction**

Find:

```js
        const onboardingProviderConfig = this.config.onboardingProviderType
            ? {
                  type: this.config.onboardingProviderType,
                  apiKey: this.config.onboardingApiKey,
                  model: this.config.onboardingModel,
                  baseUrl: this.config.onboardingBaseUrl,
              }
            : chatProviderConfig;
```

Replace with:

```js
        const onboardingTokenLimits = getTokenLimits(this.config, 'onboarding');
        const onboardingProviderConfig = this.config.onboardingProviderType
            ? {
                  type: this.config.onboardingProviderType,
                  apiKey: this.config.onboardingApiKey,
                  model: this.config.onboardingModel,
                  baseUrl: this.config.onboardingBaseUrl,
                  maxTokens: onboardingTokenLimits.maxOutputTokens,
              }
            : chatProviderConfig;
```

(When there is no separate onboarding provider, `onboardingProviderConfig` stays the exact same object as `chatProviderConfig` — including its `maxTokens` — matching how `apiKey`/`model`/`baseUrl` already behave in that fallback case. `onboardingTokenLimits` is still computed for use in Task 6, which reads it independently via `adapter.config` rather than through this local variable.)

- [ ] **Step 5: Extend `this.runtimeLimits`**

Find:

```js
        this.runtimeLimits = getLimits(this.config);
```

Replace with:

```js
        this.runtimeLimits = { ...getLimits(this.config), ...chatTokenLimits };
```

(`chatTokenLimits` was already computed in Step 3. This adds `maxInputTokens`/`maxOutputTokens` onto the same object already threaded into `buildTools(this, { limits: this.runtimeLimits })` and both `runAgent({..., limits: this.runtimeLimits})` call sites — no changes needed at either of those two call sites themselves.)

- [ ] **Step 6: Manual verification (no existing unit-test seam for `onReady`)**

`main.js`'s adapter-startup sequence (`onReady`) has no existing unit test that constructs a fake adapter and calls it directly — `test/unit/main.test.js` does not cover this path today (confirmed: no `onReady`/`createProvider`/`chatProviderConfig` references in that file), and the project's own testing docs already note that deep adapter-orchestration coverage is a known gap addressed only by the real end-to-end test (`npm run test:e2e`). Adding that test harness is out of scope for this feature. Instead:
- Re-read the four edited blocks once, side by side with the spec's "Verwendung in main.js" section, confirming: `chatProviderConfig.maxTokens` and `onboardingProviderConfig.maxTokens` are set; the no-separate-onboarding-provider fallback still shares one object; `this.runtimeLimits` contains all of `maxAgentIterations`/`maxToolCalls`/`maxPeriodsPerRequest`/`maxPeriodsPerToolCall`/`maxInputTokens`/`maxOutputTokens`.
- Run the full suite (next step) to confirm no regression in the (indirect) existing coverage of `buildTools`/`runAgent` call sites.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS (451 unit + 56 admin, unchanged — this task has no dedicated new test, per Step 6).

- [ ] **Step 8: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add main.js
git commit -m "feat: wire chat/onboarding token limits into provider configs and runtimeLimits"
```

---

### Task 5: `lib/agent.js` — input pre-check and one-shot chat-history compaction

**Files:**
- Modify: `lib/agent.js` (imports, `runAgent`, two new module-level helper functions)
- Test: `test/unit/agent.test.js`

**Interfaces:**
- Consumes: `estimateRequestTokens`, `TOKEN_LIMIT_DEFAULTS` from `./tokenLimits` (Task 1); `limits.maxInputTokens` (populated by Task 4, defaults via `TOKEN_LIMIT_DEFAULTS.maxInputTokens` when absent — this is what keeps every pre-existing test in this file passing unmodified, since none of them pass `limits` at all and none come remotely close to 100000 estimated tokens).
- Produces: nothing new for later tasks (`lib/onboarding.js`'s Task 6 uses `tokenLimits.js` directly, not anything from here).

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/agent.test.js`, inside the existing `describe('runAgent', ...)` block (after the last existing test, before the closing `});`):

```js
    describe('input token limit', () => {
        function tinyLimits() {
            return { maxInputTokens: 50 }; // ~200 chars total budget — trivially exceeded by the fixtures below
        }

        it('throws without calling the provider when there is no compactable history', async () => {
            const provider = { chat: sinon.stub() };
            const tools = { definitions: [], execute: sinon.stub() };

            let error;
            try {
                await runAgent({
                    provider,
                    tools,
                    systemPrompt: 'x'.repeat(300),
                    userMessage: 'Frage',
                    limits: tinyLimits(),
                });
            } catch (caught) {
                error = caught;
            }

            expect(error.message).to.include('Eingabe-Token-Limit');
            expect(provider.chat.called).to.equal(false);
        });

        it('throws without calling the provider when priorMessages has fewer than 2 complete rounds', async () => {
            const provider = { chat: sinon.stub() };
            const tools = { definitions: [], execute: sinon.stub() };

            let error;
            try {
                await runAgent({
                    provider,
                    tools,
                    systemPrompt: 's',
                    userMessage: 'Frage',
                    priorMessages: [
                        { role: 'user', content: 'x'.repeat(300) },
                        { role: 'assistant', content: 'x'.repeat(300) },
                    ],
                    limits: tinyLimits(),
                });
            } catch (caught) {
                error = caught;
            }

            expect(error.message).to.include('Eingabe-Token-Limit');
            expect(provider.chat.called).to.equal(false);
        });

        it('compacts the oldest half of complete rounds once, prepends the summary, and proceeds', async () => {
            const priorMessages = [
                { role: 'user', content: 'alte Frage 1 ' + 'x'.repeat(80) },
                { role: 'assistant', content: 'alte Antwort 1 ' + 'x'.repeat(80) },
                { role: 'user', content: 'alte Frage 2 ' + 'x'.repeat(80) },
                { role: 'assistant', content: 'alte Antwort 2 ' + 'x'.repeat(80) },
            ];
            const chat = sinon.stub();
            chat.onCall(0).callsFake(async ({ system, messages, tools }) => {
                expect(system).to.include('Fasse');
                expect(messages).to.deep.equal(priorMessages.slice(0, 2));
                expect(tools).to.deep.equal([]);
                return { role: 'assistant', content: 'Kurze Zusammenfassung.', toolCalls: [], usage: { inputTokens: 5, outputTokens: 3 } };
            });
            chat.onCall(1).callsFake(async ({ messages }) => {
                expect(messages[0].content).to.include('[Zusammenfassung des bisherigen Verlaufs]: Kurze Zusammenfassung.');
                expect(messages[0].content).to.include('alte Frage 2');
                expect(messages[1]).to.deep.equal(priorMessages[3]);
                expect(messages[2]).to.deep.equal({ role: 'user', content: 'neue Frage' });
                return { role: 'assistant', content: 'Antwort.', toolCalls: [], usage: { inputTokens: 7, outputTokens: 4 } };
            });
            const tools = { definitions: [], execute: sinon.stub() };

            const result = await runAgent({
                provider: { chat },
                tools,
                systemPrompt: 's',
                userMessage: 'neue Frage',
                priorMessages,
                limits: tinyLimits(),
            });

            expect(result.finalText).to.equal('Antwort.');
            expect(chat.callCount).to.equal(2);
            expect(result.usage).to.deep.equal({ inputTokens: 12, outputTokens: 7 });
        });

        it('throws if the estimate still exceeds the limit after compaction', async () => {
            const priorMessages = [
                { role: 'user', content: 'x'.repeat(80) },
                { role: 'assistant', content: 'x'.repeat(80) },
                { role: 'user', content: 'x'.repeat(80) },
                { role: 'assistant', content: 'y'.repeat(2000) }, // kept round stays huge even after compaction
            ];
            const chat = sinon.stub();
            chat.onCall(0).resolves({ role: 'assistant', content: 'Zusammenfassung.', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } });
            const tools = { definitions: [], execute: sinon.stub() };

            let error;
            try {
                await runAgent({
                    provider: { chat },
                    tools,
                    systemPrompt: 's',
                    userMessage: 'Frage',
                    priorMessages,
                    limits: tinyLimits(),
                });
            } catch (caught) {
                error = caught;
            }

            expect(error.message).to.include('Eingabe-Token-Limit');
            expect(chat.callCount).to.equal(1); // only the compaction attempt, never the real request
        });

        it('throws if the compaction call itself fails, without a second attempt', async () => {
            const priorMessages = [
                { role: 'user', content: 'x'.repeat(300) },
                { role: 'assistant', content: 'x'.repeat(300) },
                { role: 'user', content: 'x'.repeat(300) },
                { role: 'assistant', content: 'x'.repeat(300) },
            ];
            const chat = sinon.stub().rejects(new Error('Provider nicht erreichbar.'));
            const tools = { definitions: [], execute: sinon.stub() };

            let error;
            try {
                await runAgent({
                    provider: { chat },
                    tools,
                    systemPrompt: 's',
                    userMessage: 'Frage',
                    priorMessages,
                    limits: tinyLimits(),
                });
            } catch (caught) {
                error = caught;
            }

            expect(error.message).to.include('Eingabe-Token-Limit');
            expect(chat.callCount).to.equal(1);
        });

        it('throws mid-loop when the growing tool-call sequence alone exceeds the limit, without attempting compaction', async () => {
            const bigToolResult = { data: 'x'.repeat(500) };
            const chat = sinon.stub();
            chat.onCall(0).resolves({
                role: 'assistant', content: '',
                toolCalls: [{ id: 'call_1', name: 'getHistory', input: {} }],
                usage: { inputTokens: 1, outputTokens: 1 },
            });
            const tools = { definitions: [{ name: 'getHistory' }], execute: sinon.stub().resolves(bigToolResult) };

            let error;
            try {
                await runAgent({
                    provider: { chat },
                    tools,
                    systemPrompt: 's',
                    userMessage: 'Frage',
                    limits: tinyLimits(),
                });
            } catch (caught) {
                error = caught;
            }

            expect(error.message).to.include('Eingabe-Token-Limit');
            expect(chat.callCount).to.equal(1); // the first call succeeded; the second (mid-loop) never happens
        });
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx mocha test/unit/agent.test.js`
Expected: the six new tests FAIL (no size-checking logic exists yet — every one of them either calls the provider a different number of times than expected, or never throws).

- [ ] **Step 3: Implement in `lib/agent.js`**

Add the import near the top, next to `const { LIMIT_DEFAULTS } = require('./limits');`:

```js
const { estimateRequestTokens, TOKEN_LIMIT_DEFAULTS } = require('./tokenLimits');
```

Add two new module-level functions after `serializeBounded` (before `async function runAgent`):

```js
async function compactPriorMessages({ provider, priorMessages, userMessage }) {
    const rounds = [];
    for (let i = 0; i < priorMessages.length; i += 2) {
        rounds.push([priorMessages[i], priorMessages[i + 1]]);
    }
    const compactCount = Math.floor(rounds.length / 2);
    const toCompact = rounds.slice(0, compactCount).flat();
    const keptMessages = rounds.slice(compactCount).flat();

    const summaryResponse = await provider.chat({
        system: 'Fasse den folgenden Gespraechsverlauf kurz und sachlich zusammen. Behalte wichtige Fakten, bereits geklaerte Zuordnungen und offene Rueckfragen bei.',
        messages: toCompact,
        tools: [],
    });
    validateAssistantMessage(summaryResponse);
    const summaryUsage = validateUsage(summaryResponse.usage);

    const summaryPrefix = `[Zusammenfassung des bisherigen Verlaufs]: ${summaryResponse.content}\n\n`;
    keptMessages[0] = { ...keptMessages[0], content: summaryPrefix + keptMessages[0].content };

    return { messages: [...keptMessages, { role: 'user', content: userMessage }], usage: summaryUsage };
}

async function ensureWithinInputBudget({ provider, messages, priorMessages, systemPrompt, userMessage, toolDefinitions, maxInputTokens, usage }) {
    const estimate = estimateRequestTokens({ system: systemPrompt, messages, tools: toolDefinitions });
    if (estimate <= maxInputTokens) return messages;

    if (priorMessages && priorMessages.length >= 4) {
        let compacted;
        try {
            compacted = await compactPriorMessages({ provider, priorMessages, userMessage });
        } catch (_error) {
            throw new Error(`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit (~${estimate} von ${maxInputTokens} geschaetzten Tokens).`);
        }
        usage.inputTokens += compacted.usage.inputTokens;
        usage.outputTokens += compacted.usage.outputTokens;
        const reEstimate = estimateRequestTokens({ system: systemPrompt, messages: compacted.messages, tools: toolDefinitions });
        if (reEstimate <= maxInputTokens) return compacted.messages;
        throw new Error(`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit auch nach Zusammenfassung (~${reEstimate} von ${maxInputTokens} geschaetzten Tokens).`);
    }

    throw new Error(`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit (~${estimate} von ${maxInputTokens} geschaetzten Tokens).`);
}
```

Modify `runAgent` itself. Replace:

```js
async function runAgent({ provider, tools, systemPrompt, userMessage, priorMessages, onAssistantText, onProgress, limits = LIMIT_DEFAULTS }) {
    const maxIterations = limits.maxAgentIterations || MAX_ITERATIONS;
    const maxToolCalls = limits.maxToolCalls || MAX_TOOL_CALLS;
    const maxPeriods = limits.maxPeriodsPerRequest || MAX_PERIODS;
    const messages = [...(priorMessages || []), { role: 'user', content: userMessage }];
    const usage = { inputTokens: 0, outputTokens: 0 };
    const allowedTools = new Set(tools.definitions.map((tool) => tool.name));
    const seenCallIds = new Set();
    let toolCallCount = 0;
    let periodCount = 0;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (onProgress) await onProgress({ processed: iteration, total: maxIterations });
        const assistantMessage = await provider.chat({
            system: systemPrompt,
            messages,
            tools: tools.definitions,
        });
```

with:

```js
async function runAgent({ provider, tools, systemPrompt, userMessage, priorMessages, onAssistantText, onProgress, limits = LIMIT_DEFAULTS }) {
    const maxIterations = limits.maxAgentIterations || MAX_ITERATIONS;
    const maxToolCalls = limits.maxToolCalls || MAX_TOOL_CALLS;
    const maxPeriods = limits.maxPeriodsPerRequest || MAX_PERIODS;
    const maxInputTokens = limits.maxInputTokens || TOKEN_LIMIT_DEFAULTS.maxInputTokens;
    const usage = { inputTokens: 0, outputTokens: 0 };
    let messages = [...(priorMessages || []), { role: 'user', content: userMessage }];
    messages = await ensureWithinInputBudget({
        provider, messages, priorMessages, systemPrompt, userMessage,
        toolDefinitions: tools.definitions, maxInputTokens, usage,
    });
    const allowedTools = new Set(tools.definitions.map((tool) => tool.name));
    const seenCallIds = new Set();
    let toolCallCount = 0;
    let periodCount = 0;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (iteration > 0) {
            const estimate = estimateRequestTokens({ system: systemPrompt, messages, tools: tools.definitions });
            if (estimate > maxInputTokens) {
                throw new Error(`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit (~${estimate} von ${maxInputTokens} geschaetzten Tokens).`);
            }
        }
        if (onProgress) await onProgress({ processed: iteration, total: maxIterations });
        const assistantMessage = await provider.chat({
            system: systemPrompt,
            messages,
            tools: tools.definitions,
        });
```

Everything from `validateAssistantMessage(assistantMessage);` onward in the loop body is unchanged — `messages.push(...)` calls still work since `messages` is now `let` instead of `const` but is still the same array reference being mutated in place after the initial (possible) reassignment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx mocha test/unit/agent.test.js`
Expected: PASS, all tests including the six new ones.

- [ ] **Step 5: Run the full unit suite for regressions**

Run: `npm run test:unit`
Expected: PASS — this is the step that proves every pre-existing test in this file (and every other file using `runAgent`) is unaffected by the new default `maxInputTokens` fallback (100000), since none of their fixtures come close to that size.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/agent.js test/unit/agent.test.js
git commit -m "feat: enforce input token budget in runAgent with one-shot chat-history compaction"
```

---

### Task 6: `lib/onboarding.js` — input pre-check, no compaction

**Files:**
- Modify: `lib/onboarding.js:1-10` (imports), `lib/onboarding.js:169-193` (the `try` block wrapping the `provider.chat` call)
- Test: `test/unit/onboarding.test.js`

**Interfaces:**
- Consumes: `getTokenLimits`, `estimateRequestTokens` from `./tokenLimits` (Task 1).
- Produces: nothing new for later tasks (this is the last code task).

- [ ] **Step 1: Write the failing test**

Add to `test/unit/onboarding.test.js`, inside `describe('runOnboarding', ...)` (after the last existing test, before the closing `});`):

```js
    it('skips a batch whose prompt exceeds the configured onboarding input-token limit, without aborting the run', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x'.repeat(2000) } },
        ];
        const provider = { chat: sinon.stub() };
        const setCatalogEntry = sinon.stub().resolves();
        const adapter = { log: { warn: sinon.stub(), error: sinon.stub(), silly: sinon.stub() }, config: { onboardingMaxInputTokens: 10 } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        const result = await runOnboarding(adapter, provider, discovered);

        expect(provider.chat.called).to.equal(false);
        expect(setCatalogEntry.called).to.equal(false);
        expect(result.classifiedCount).to.equal(0);
        expect(adapter.log.error.called).to.equal(true);
    });

    it('classifies normally when the prompt fits the default onboarding input-token limit', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{ sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const adapter = { log: { warn: sinon.stub(), error: sinon.stub(), silly: sinon.stub() }, config: {} };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        const result = await runOnboarding(adapter, provider, discovered);

        expect(provider.chat.calledOnce).to.equal(true);
        expect(result.classifiedCount).to.equal(1);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: the first new test FAILS — `provider.chat` gets called (no pre-check exists yet), so `provider.chat.called` is `true` instead of the expected `false`. The second new test should already PASS (it's a regression guard establishing the default-limit case works before and after this change) — if it fails, something about the stub setup is wrong; fix the test, not the (not-yet-written) implementation.

- [ ] **Step 3: Implement in `lib/onboarding.js`**

Add the import next to the existing `./catalog` require (line 4):

```js
const { getTokenLimits, estimateRequestTokens } = require('./tokenLimits');
```

Modify the `try` block that calls `provider.chat` (current lines 169-193). Replace:

```js
        let classifications;
        try {
            const response = await provider.chat({
                system: 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.',
                messages: [{ role: 'user', content: prompt }],
                tools: [],
            });
```

with:

```js
        let classifications;
        try {
            const onboardingSystemPrompt = 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.';
            const promptEstimate = estimateRequestTokens({ system: onboardingSystemPrompt, messages: [{ role: 'user', content: prompt }], tools: [] });
            const onboardingTokenLimits = getTokenLimits(adapter.config, 'onboarding');
            if (promptEstimate > onboardingTokenLimits.maxInputTokens) {
                throw new Error(`Batch ueberschreitet das konfigurierte Eingabe-Token-Limit (~${promptEstimate} von ${onboardingTokenLimits.maxInputTokens} geschaetzten Tokens).`);
            }

            const response = await provider.chat({
                system: onboardingSystemPrompt,
                messages: [{ role: 'user', content: prompt }],
                tools: [],
            });
```

The existing `catch (error) { adapter.log.error(...); continue; }` immediately below already handles this new thrown error identically to any other batch failure — no other change needed in this function.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Run the full unit suite for regressions**

Run: `npm run test:unit`
Expected: PASS — confirms every pre-existing onboarding test (none of which set `onboardingMaxInputTokens` in their adapter config, so they get the 100000-token default) is unaffected.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "feat: enforce onboarding input token budget before classification calls"
```

---

### Task 7: Final verification and documentation

**Files:**
- Modify: `WORKLOG.md`
- Modify: `docs/architecture/05-bausteinsicht.md` (new module `lib/tokenLimits.js` — per AGENTS.md, a new module gets an entry in the component reference)

**Interfaces:** none (documentation).

- [ ] **Step 1: Full verification**

Run: `npm test && npm run lint`
Expected: `npm test` (test:unit + test:admin) PASS, `npm run lint` clean. `npm run build:admin` is NOT required for this feature — it builds the Vite bundle under `src-admin/` into `admin/custom/`, and while Task 2 modified `src-admin/src/Components.jsx`, that file's settings-CSV logic is already covered by the `vm`-extraction unit test (`test/unit/settingsCsvImport.test.js`) and by `npm run test:admin`'s Vitest suite (whichever admin component tests exercise `Components.jsx`) — rebuilding the bundle only matters when verifying the actual rendered Admin UI in a browser, which this plan does not require since no new interactive component/JSX markup was added (only two flat data arrays and two `admin/jsonConfig.json` field definitions, which `@iobroker/json-config` reads directly at runtime without a build step).

- [ ] **Step 2: `docs/architecture/05-bausteinsicht.md` — add the new module**

This file has two parts that both enumerate `lib/*` modules: a tree diagram (§5.1) and a full whitebox responsibility table (§5.2, one row per module: `Baustein | Verantwortung | Schnittstelle nach außen`). Note: `lib/limits.js` (an older, similarly-shaped module) is missing from both — a pre-existing gap, not something to fix here; add only `lib/tokenLimits.js`, following the current, more complete pattern the table already uses for every other module.

In §5.1's tree, insert a new line right after `├── agent.js              Provider-agnostischer Tool-Calling-Loop`:

```
├── tokenLimits.js        Token-Limit-Aufloesung je Rolle + zeichenbasierte Groessenschaetzung
```

In §5.2's table, insert a new row right after the `agent.js` row:

```markdown
| `tokenLimits.js` | Löst pro Rolle (`chat`/`onboarding`) konfigurierte Input-/Output-Token-Limits auf (Clamping wie `limits.js`) und schätzt die Größe einer ausgehenden Anfrage zeichenbasiert (kein Tokenizer) — von `providers/*` (Output-Cap), `agent.js` (Input-Vorabprüfung + Kompression) und `onboarding.js` (Input-Vorabprüfung) genutzt | `getTokenLimits(config,role) => {maxInputTokens,maxOutputTokens}`, `estimateTokens(text) => number`, `estimateRequestTokens({system,messages,tools}) => number` |
```

Do not change the `22 Module`/`Ebene-2-Zerlegung` sentence at the end of §5.2 (line 75) — that count is already stale relative to the current module list for unrelated reasons (e.g. it excludes `lib/limits.js` too) and reconciling it is out of scope for this feature.

- [ ] **Step 3: `WORKLOG.md` — close out the entry**

Read the current `WORKLOG.md` (its `## WIP` section should still reflect the prior energy-balance feature's now-merged state, per that feature's own Task 9 — this step corrects the currently-stale `## WIP` and adds a new `## DONE` entry for this feature). Replace `## WIP` with:

```markdown
## WIP

- Branch: `feature/llm-token-limits` (aus `master`), bereit zum Merge.
- Status: alle sieben Tasks der Spec umgesetzt, `npm test`/`npm run lint` grün.
```

Add under `## DONE`, above the previous top entry:

```markdown
- LLM-Token-Limits (2026-09-08): neues fokussiertes Modul `lib/tokenLimits.js`
  (`getTokenLimits`, `estimateTokens`/`estimateRequestTokens`, zeichenbasierte
  Heuristik ohne Tokenizer-Abhaengigkeit) loest zwei Luecken: OpenAI-kompatible
  Provider sendeten bisher gar kein Ausgabe-Limit, Anthropic nutzte einen
  unsichtbaren, nicht einstellbaren Fallback (2048). Vier neue Einstellungen
  (`chatMaxInputTokens`/`chatMaxOutputTokens`/`onboardingMaxInputTokens`/
  `onboardingMaxOutputTokens`) je Chat-/Onboarding-Modell. `runAgent`
  (`lib/agent.js`) schaetzt vor jeder Anfrage die Eingabegroesse; bei
  Ueberschreitung mit mindestens zwei abgeschlossenen Chat-Runden in der
  Historie wird genau ein Kompressionsversuch unternommen (aelteste Haelfte
  der Runden wird zusammengefasst und der verbleibenden ersten Nutzer-Nachricht
  vorangestellt — nie als eigene Nachricht, um die user/assistant-Alternierung
  nicht zu brechen); reicht das nicht oder gibt es keine kompaktierbare
  Historie, ein klar definierter Fehler statt der kryptischen Provider-Meldung.
  Bewusst keine Kompression der laufenden Werkzeug-Aufruf-Sequenz einer
  einzelnen Frage (Risiko fuer `tool_use`/`tool_result`-Paarung). Onboarding
  bekommt denselben Eingabe-Check ohne Kompression (kein Gespraechsverlauf
  zum Zusammenfassen) — ueberschreitet ein Batch das Limit, wird er wie jeder
  andere Batch-Fehler geloggt und uebersprungen. Siehe
  [Spec](docs/specs/2026-09-08-llm-token-limits.md).
```

- [ ] **Step 4: Commit the documentation changes**

```bash
git add WORKLOG.md docs/architecture/05-bausteinsicht.md
git commit -m "docs: close out llm-token-limits worklog entry"
```

- [ ] **Step 5: Push and merge (per CONTRIBUTING.md)**

Read `CONTRIBUTING.md` for this project's exact merge/versioning/release steps and follow them. This task deliberately ends without pre-written merge/release commands — that sequencing is CONTRIBUTING.md's responsibility to define, not this plan's, and the prior feature's session already established that (a) this session's git operations are worktree-isolated and cannot touch the main checkout directly, and (b) merging/releasing is a side effect outside this worktree that warrants an explicit check-in rather than autonomous execution — confirm the same way before pushing/merging/tagging here.
