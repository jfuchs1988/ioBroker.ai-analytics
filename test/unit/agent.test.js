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
            definitions: [{ name: 'getHistory' }],
            execute: async () => {
                throw new Error('Unbekanntes Objekt: unknown');
            },
        };

        const result = await runAgent({ provider, tools, systemPrompt: 's', userMessage: 'Frage' });

        expect(result.messages[2].content).to.equal(JSON.stringify({ error: 'Werkzeugaufruf fehlgeschlagen.' }));
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
        const tools = { definitions: [{ name: 'listCatalog' }], execute: async () => ({}) };

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

    it('rejects more than the maximum number of tool calls before executing the excess call', async () => {
        const { MAX_TOOL_CALLS } = require('../../lib/agent');
        const execute = sinon.stub().resolves({});
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: '',
                toolCalls: Array.from({ length: MAX_TOOL_CALLS + 1 }, (_, index) => ({
                    id: `call_${index}`,
                    name: 'listCatalog',
                    input: {},
                })),
            }),
        };

        let error;
        try {
            await runAgent({ provider, tools: { definitions: [{ name: 'listCatalog' }], execute }, systemPrompt: 's', userMessage: 'q' });
        } catch (caught) {
            error = caught;
        }

        expect(error.message).to.include('Maximale Anzahl').and.to.include(`Limit ${MAX_TOOL_CALLS}`).and.to.include(`benoetigt ${MAX_TOOL_CALLS + 1}`);
        expect(execute.notCalled).to.equal(true);
    });

    it('enforces an aggregate period limit across tool calls', async () => {
        const { MAX_PERIODS } = require('../../lib/agent');
        const periods = Array.from({ length: MAX_PERIODS }, (_, index) => ({ start: index * 2, end: index * 2 + 1 }));
        const provider = {
            chat: sinon.stub()
                .onFirstCall().resolves({ role: 'assistant', content: '', toolCalls: [{ id: 'one', name: 'getPeriodTotal', input: { periods } }] })
                .onSecondCall().resolves({ role: 'assistant', content: '', toolCalls: [{ id: 'two', name: 'getHistory', input: {} }] }),
        };
        const tools = { definitions: [{ name: 'getPeriodTotal' }, { name: 'getHistory' }], execute: sinon.stub().resolves({}) };

        let error;
        try {
            await runAgent({ provider, tools, systemPrompt: 's', userMessage: 'q' });
        } catch (caught) {
            error = caught;
        }

        expect(error.message).to.include('Zeitraeumen').and.to.include(`Limit ${MAX_PERIODS}`).and.to.include(`benoetigt ${MAX_PERIODS + 1}`);
        expect(tools.execute.calledOnce).to.equal(true);
    });

    it('rejects malformed provider responses and invalid usage', async () => {
        for (const response of [null, { role: 'assistant', content: {}, toolCalls: [] },
            { role: 'assistant', content: 'x', toolCalls: [], usage: { inputTokens: -1, outputTokens: 0 } }]) {
            let error;
            try {
                await runAgent({
                    provider: { chat: async () => response },
                    tools: { definitions: [], execute: sinon.stub() },
                    systemPrompt: 's',
                    userMessage: 'q',
                });
            } catch (caught) {
                error = caught;
            }
            expect(error).to.be.an('error');
        }
    });

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
                limits: { maxInputTokens: 100 },
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
});
