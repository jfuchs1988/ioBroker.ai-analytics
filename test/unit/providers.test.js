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
    afterEach(() => sinon.restore());

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
