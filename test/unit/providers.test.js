// test/unit/providers.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { createAnthropicProvider, listAnthropicModels } = require('../../lib/providers/anthropic');
const {
    createOpenAiCompatibleProvider,
    listOpenAiCompatibleModels,
    resolveOpenAiBaseUrl,
} = require('../../lib/providers/openaiCompatible');
const { createProvider, listModels } = require('../../lib/providers');

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
            usage: { inputTokens: 0, outputTokens: 0 },
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

    it('lists Anthropic models with their display names', async () => {
        const fetchStub = sinon.stub().resolves({
            ok: true,
            json: async () => ({ data: [{ id: 'claude-b', display_name: 'Claude B' }, { id: 'claude-a' }] }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const models = await listAnthropicModels({ apiKey: 'secret' });

        expect(fetchStub.firstCall.args[0]).to.equal('https://api.anthropic.com/v1/models?limit=1000');
        expect(fetchStub.firstCall.args[1].headers['x-api-key']).to.equal('secret');
        expect(models).to.deep.equal([
            { id: 'claude-b', name: 'Claude B', isFree: false },
            { id: 'claude-a', name: 'claude-a', isFree: false },
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
            usage: { inputTokens: 0, outputTokens: 0 },
        });
    });

    it('uses config.baseUrl when provided (OpenRouter / local)', async () => {
        const fetchStub = sinon.stub().resolves({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const provider = createOpenAiCompatibleProvider({
            type: 'local',
            apiKey: 'key',
            model: 'local-model',
            baseUrl: 'http://localhost:1234/v1',
        });

        await provider.chat({ system: 's', messages: [], tools: [] });

        expect(fetchStub.firstCall.args[0]).to.equal('http://localhost:1234/v1/chat/completions');
    });

    it('uses the OpenRouter API by default for the openrouter provider', async () => {
        const fetchStub = sinon.stub().resolves({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const provider = createOpenAiCompatibleProvider({ type: 'openrouter', apiKey: 'key', model: 'free-model' });
        await provider.chat({ system: 's', messages: [], tools: [] });

        expect(fetchStub.firstCall.args[0]).to.equal('https://openrouter.ai/api/v1/chat/completions');
    });

    it('normalizes custom base URLs and requires one for local providers', () => {
        expect(resolveOpenAiBaseUrl('openai', '')).to.equal('https://api.openai.com/v1');
        expect(resolveOpenAiBaseUrl('openrouter', '')).to.equal('https://openrouter.ai/api/v1');
        expect(resolveOpenAiBaseUrl('local', 'http://localhost:1234/v1/')).to.equal('http://localhost:1234/v1');
        expect(() => resolveOpenAiBaseUrl('local', '')).to.throw('Basis-URL');
    });

    it('lists only free OpenRouter models that support tools', async () => {
        const fetchStub = sinon.stub().resolves({
            ok: true,
            json: async () => ({
                data: [
                    {
                        id: 'vendor/free-tools:free',
                        name: 'Free Tools',
                        supported_parameters: ['tools'],
                        pricing: { prompt: '0', completion: '0', request: '0' },
                    },
                    {
                        id: 'vendor/free-no-tools:free',
                        supported_parameters: [],
                        pricing: { prompt: '0', completion: '0' },
                    },
                    {
                        id: 'vendor/paid-tools',
                        supported_parameters: ['tools'],
                        pricing: { prompt: '0.000001', completion: '0' },
                    },
                ],
            }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const models = await listOpenAiCompatibleModels({ type: 'openrouter', apiKey: 'secret' });

        expect(fetchStub.firstCall.args[0]).to.equal('https://openrouter.ai/api/v1/models');
        expect(models).to.deep.equal([{ id: 'vendor/free-tools:free', name: 'Free Tools', isFree: true }]);
    });

    it('lists models from a local endpoint without sending an empty bearer token', async () => {
        const fetchStub = sinon.stub().resolves({
            ok: true,
            json: async () => ({ data: [{ id: 'z-model' }, { id: 'a-model' }] }),
        });
        sinon.stub(global, 'fetch').callsFake(fetchStub);

        const models = await listOpenAiCompatibleModels({ type: 'local', baseUrl: 'http://localhost:1234/v1/' });

        expect(fetchStub.firstCall.args[0]).to.equal('http://localhost:1234/v1/models');
        expect(fetchStub.firstCall.args[1].headers).not.to.have.property('authorization');
        expect(models).to.deep.equal([
            { id: 'z-model', name: 'z-model', isFree: false },
            { id: 'a-model', name: 'a-model', isFree: false },
        ]);
    });

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

    it('aborts a chat request at the configured timeout', async () => {
        let observedSignal;
        sinon.stub(global, 'fetch').callsFake((_url, options) => {
            observedSignal = options.signal;
            return new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
            });
        });
        const provider = createOpenAiCompatibleProvider({ apiKey: 'key', model: 'x', requestTimeoutMs: 10 });

        let error;
        try {
            await provider.chat({ system: 's', messages: [], tools: [] });
        } catch (caught) {
            error = caught;
        }

        expect(error.code).to.equal('PROVIDER_TIMEOUT');
        expect(error.retryable).to.equal(true);
        expect(observedSignal.aborted).to.equal(true);
    });

    it('rejects malformed tool calls and token usage', () => {
        const { fromOpenAiResponse } = require('../../lib/providers/openaiCompatible');
        expect(() => fromOpenAiResponse({
            choices: [{ message: { content: null, tool_calls: [{ id: 'x', function: { name: 'tool', arguments: '[]' } }] } }],
        })).to.throw('must be an object');
        expect(() => fromOpenAiResponse({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: -1, completion_tokens: 0 },
        })).to.throw('token usage');
    });
});

describe('createProvider', () => {
    afterEach(() => sinon.restore());

    it('routes anthropic to the Anthropic client', () => {
        const provider = createProvider({ type: 'anthropic', apiKey: 'k' });
        expect(provider).to.have.property('chat').that.is.a('function');
    });

    it('routes openai/openrouter/local to the OpenAI-compatible client', () => {
        for (const type of ['openai', 'openrouter', 'local']) {
            const provider = createProvider({
                type,
                apiKey: 'k',
                baseUrl: type === 'local' ? 'http://localhost:1234/v1' : undefined,
            });
            expect(provider).to.have.property('chat').that.is.a('function');
        }
    });

    it('throws on unknown provider type', () => {
        expect(() => createProvider({ type: 'unknown' })).to.throw('Unknown provider type: unknown');
    });

    it('routes model discovery through the selected provider', async () => {
        sinon.stub(global, 'fetch').resolves({ ok: true, json: async () => ({ data: [{ id: 'model-a' }] }) });

        const models = await listModels({ type: 'openai', apiKey: 'k' });

        expect(models).to.deep.equal([{ id: 'model-a', name: 'model-a', isFree: false }]);
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

    it('does not retry permanent HTTP failures or malformed successful responses', async () => {
        const fetchStub = sinon.stub(global, 'fetch');
        fetchStub.resolves({ ok: false, status: 401, text: async () => 'secret response body' });
        const unauthorized = createProvider({ type: 'openai', apiKey: 'k', model: 'x' });

        let error;
        try {
            await unauthorized.chat({ system: 's', messages: [], tools: [] });
        } catch (caught) {
            error = caught;
        }
        expect(error.message).to.equal('OpenAI-compatible API error 401');
        expect(error.message).not.to.include('secret response body');
        expect(fetchStub.calledOnce).to.equal(true);

        fetchStub.resetHistory();
        fetchStub.resolves({ ok: true, json: async () => ({}) });
        const malformed = createProvider({ type: 'anthropic', apiKey: 'k' });
        try {
            await malformed.chat({ system: 's', messages: [], tools: [] });
        } catch (caught) {
            error = caught;
        }
        expect(error.message).to.include('content array');
        expect(fetchStub.calledOnce).to.equal(true);
    });

    it('honors Retry-After for transient HTTP failures', async () => {
        const clock = sinon.useFakeTimers();
        try {
            const fetchStub = sinon.stub(global, 'fetch');
            fetchStub.onFirstCall().resolves({
                ok: false,
                status: 429,
                headers: { get: (name) => name === 'retry-after' ? '2' : null },
                text: async () => 'slow down',
            });
            fetchStub.onSecondCall().resolves({
                ok: true,
                json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
            });
            const provider = createProvider({ type: 'openai', apiKey: 'k', model: 'x' });
            const resultPromise = provider.chat({ system: 's', messages: [], tools: [] });

            await clock.tickAsync(1999);
            expect(fetchStub.calledOnce).to.equal(true);
            await clock.tickAsync(1);
            const result = await resultPromise;
            expect(result.content).to.equal('ok');
            expect(fetchStub.calledTwice).to.equal(true);
        } finally {
            clock.restore();
        }
    });

    it('rejects provider responses above the configured hard size limit without retrying', async () => {
        const fetchStub = sinon.stub(global, 'fetch').resolves({
            ok: true,
            json: async () => ({ content: [{ type: 'text', text: 'x'.repeat(1024 * 1024) }], stop_reason: 'end_turn' }),
        });
        const provider = createProvider({ type: 'anthropic', apiKey: 'k' });

        let error;
        try {
            await provider.chat({ system: 's', messages: [], tools: [] });
        } catch (caught) {
            error = caught;
        }

        expect(error.message).to.include('exceeds');
        expect(fetchStub.calledOnce).to.equal(true);
    });
});
