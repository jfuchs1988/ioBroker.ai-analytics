// test/unit/agent.test.js
const { expect } = require('chai');
const sinon = require('sinon');
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
});
