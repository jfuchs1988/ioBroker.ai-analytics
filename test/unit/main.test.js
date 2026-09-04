const { expect } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const adminCommands = require('../../lib/adminCommands');
const { getTodayKey } = require('../../lib/license');

class AdapterStub {
    constructor() {}
}

const { AiAnalytics } = proxyquire.noCallThru()('../../main', {
    '@iobroker/adapter-core': { Adapter: AdapterStub },
});

describe('AiAnalytics command dispatch', () => {
    it('rejects an empty chat question before invoking the chat provider', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { silly: () => {} };

        let error;
        try {
            await adapter.dispatchAdapterCommand('chatQuestion', { text: '   ' });
        } catch (caught) {
            error = caught;
        }

        expect(error).to.be.an('error');
        expect(error.message).to.equal('Leere Frage');
    });

    it('routes a valid chat question to processChatQuestion', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { silly: () => {} };
        adapter.processChatQuestion = async question => ({ question });

        const result = await adapter.dispatchAdapterCommand('chatQuestion', { text: 'Was lief gestern?' });

        expect(result).to.deep.equal({ question: 'Was lief gestern?' });
    });

    it('rejects oversized and concurrent chat questions', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { silly: sinon.stub() };
        let finish;
        adapter.processChatQuestion = sinon.stub().returns(new Promise(resolve => { finish = resolve; }));

        let error;
        try {
            await adapter.dispatchAdapterCommand('chatQuestion', { text: 'x'.repeat(16001) });
        } catch (caught) {
            error = caught;
        }
        expect(error.message).to.include('zu lang');

        const first = adapter.dispatchAdapterCommand('chatQuestion', { text: 'Erste Frage' });
        try {
            await adapter.dispatchAdapterCommand('chatQuestion', { text: 'Zweite Frage' });
        } catch (caught) {
            error = caught;
        }
        expect(error.message).to.include('bereits verarbeitet');
        finish({ ok: true });
        await first;
        expect(adapter.chatRunPromise).to.equal(null);
    });

    it('rejects a second chat question on the same day in limited license mode', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.licenseState = { status: 'limited', fullAccess: false };
        adapter.getStateAsync = sinon.stub().resolves({ val: getTodayKey() });

        let error;
        try {
            await adapter.processChatQuestion('Noch eine Frage');
        } catch (caught) {
            error = caught;
        }

        expect(error).to.be.an('error');
        expect(error.message).to.include('taegliche Chat-Kontingent');
    });

    it('rejects unknown adapter commands', async () => {
        const adapter = Object.create(AiAnalytics.prototype);

        let error;
        try {
            await adapter.dispatchAdapterCommand('unknownCommand', {});
        } catch (caught) {
            error = caught;
        }

        expect(error.message).to.equal('Unbekannter Befehl: unknownCommand');
    });

    it('routes every admin command to its dedicated handler', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { silly: sinon.stub() };
        const commands = [
            ['listProviderModels', 'listProviderModels', { providerType: 'openrouter' }],
            ['listCatalogEntries', 'listCatalogEntries', undefined],
            ['updateCatalogEntryAdmin', 'updateCatalogEntryAdmin', { sourceId: 'x' }],
            ['removeCatalogEntry', 'removeCatalogEntry', { sourceId: 'x' }],
            ['runDiscoveryNow', 'runDiscoveryNow', undefined],
            ['runDiscoveryOnly', 'runDiscoveryOnly', undefined],
            ['runProactiveCheckNow', 'runProactiveCheckNow', undefined],
        ];
        const stubs = commands.map(([, handler]) => sinon.stub(adminCommands, handler).resolves({ handler }));

        try {
            for (let index = 0; index < commands.length; index++) {
                const [command, handler, message] = commands[index];
                const result = await adapter.dispatchAdapterCommand(command, message);
                expect(result).to.deep.equal({ handler });
                expect(stubs[index].calledOnce).to.equal(true);
                expect(stubs[index].firstCall.args[0]).to.equal(adapter);
                if (message === undefined) {
                    expect(stubs[index].firstCall.args).to.have.length(1);
                } else {
                    expect(stubs[index].firstCall.args[1]).to.deep.equal(message);
                }
            }
        } finally {
            stubs.forEach(stub => stub.restore());
        }
    });

    it('sends successful and failed command results through the sendTo callback', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { silly: sinon.stub(), error: sinon.stub() };
        adapter.sendTo = sinon.spy();
        const handler = sinon.stub(adminCommands, 'listCatalogEntries');

        try {
            handler.resolves({ entries: [] });
            await adapter.onMessage({ command: 'listCatalogEntries', message: {}, from: 'system.admin', callback: { id: 1 } });
            expect(adapter.sendTo.calledOnce).to.equal(true);
            expect(adapter.sendTo.firstCall.args).to.deep.equal(['system.admin', 'listCatalogEntries', { entries: [] }, { id: 1 }]);

            handler.rejects(new Error('Katalog nicht verfügbar'));
            await adapter.onMessage({ command: 'listCatalogEntries', message: {}, from: 'system.admin', callback: { id: 2 } });
            expect(adapter.sendTo.secondCall.args).to.deep.equal([
                'system.admin',
                'listCatalogEntries',
                { error: 'Katalog nicht verfügbar' },
                { id: 2 },
            ]);
            expect(adapter.log.error.calledOnce).to.equal(true);
        } finally {
            handler.restore();
        }
    });

    it('ignores messages without a command or with a command outside the allowlist', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.sendTo = sinon.spy();
        adapter.dispatchAdapterCommand = sinon.stub();

        await adapter.onMessage(null);
        await adapter.onMessage({ command: 'notAllowed', callback: {} });

        expect(adapter.dispatchAdapterCommand.notCalled).to.equal(true);
        expect(adapter.sendTo.notCalled).to.equal(true);
    });

    it('rejects allowed commands from non-admin message senders', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { warn: sinon.stub() };
        adapter.sendTo = sinon.spy();
        adapter.dispatchAdapterCommand = sinon.stub();

        await adapter.onMessage({ command: 'chatQuestion', message: { text: 'test' }, from: 'system.adapter.javascript.0', callback: { id: 1 } });

        expect(adapter.dispatchAdapterCommand.notCalled).to.equal(true);
        expect(adapter.sendTo.firstCall.args[2]).to.deep.equal({ error: 'Nicht autorisiert.' });
    });

    it('delegates state changes to the admin bridge and always invokes the unload callback', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.stopScheduler = sinon.spy();
        adapter.log = { error: sinon.stub() };
        const callback = sinon.spy();

        await adapter.onUnload(callback);

        expect(adapter.stopScheduler.calledOnce).to.equal(true);
        expect(callback.calledOnce).to.equal(true);
    });

    it('passes state changes to the bridge with the adapter command dispatcher', async () => {
        const adminBridge = require('../../lib/adminBridge');
        const handleBridgeStateChange = sinon.stub().resolves(true);
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { error: sinon.stub() };
        const bridgeStub = sinon.stub(adminBridge, 'handleBridgeStateChange').callsFake(handleBridgeStateChange);

        try {
            const state = { val: '{}', ack: false };
            await adapter.onBridgeStateChange('ai-analytics.0.admin.bridge', state);
            expect(handleBridgeStateChange.calledOnce).to.equal(true);
            expect(handleBridgeStateChange.firstCall.args[0]).to.equal(adapter);
            expect(handleBridgeStateChange.firstCall.args[1]).to.equal('ai-analytics.0.admin.bridge');
            expect(handleBridgeStateChange.firstCall.args[2]).to.equal(state);
            expect(handleBridgeStateChange.firstCall.args[3]).to.be.a('function');
        } finally {
            bridgeStub.restore();
        }
    });
});

describe('AiAnalytics data-quality backfill', () => {
    it('processes only active pending entries and preserves the batch limit', async () => {
        const classifyDataQuality = sinon.stub().resolves({
            writable: false,
            writePattern: 'continuous',
            updateFrequency: 'minutes',
            dataCompleteness: 'complete',
        });
        const setCatalogEntry = sinon.stub().resolves();
        const { AiAnalytics: TestAdapter } = proxyquire.noCallThru()('../../main', {
            '@iobroker/adapter-core': { Adapter: class {} },
            './lib/catalog': { getAllCatalogEntries: sinon.stub(), setCatalogEntry, markInactive: sinon.stub() },
            './lib/dataQualityClassifier': { classifyDataQuality },
        });
        const adapter = Object.create(TestAdapter.prototype);
        adapter.log = { silly: sinon.stub(), error: sinon.stub() };
        adapter.getForeignObjectAsync = sinon.stub().resolves({ common: { write: false } });
        adapter.updateCatalogSyncState = sinon.stub().resolves();
        const entries = [
            ...Array.from({ length: 25 }, (_, index) => ({ sourceId: `pending.${index}`, historyInstance: 'history.0' })),
            { sourceId: 'known.1', writePattern: 'continuous' },
            { sourceId: 'ignored.1', ignored: true },
            { sourceId: 'inactive.1', active: false },
        ];

        const result = await adapter.backfillDataQuality(entries);

        expect(result).to.deep.equal({ backfilledCount: 20 });
        expect(classifyDataQuality.callCount).to.equal(20);
        expect(setCatalogEntry.callCount).to.equal(20);
        expect(adapter.updateCatalogSyncState.callCount).to.equal(20);
    });

    it('logs per-entry failures and continues with the remaining entries', async () => {
        const classifyDataQuality = sinon.stub()
            .onFirstCall().rejects(new Error('History offline'))
            .onSecondCall().resolves({ writable: true, writePattern: 'on_change', updateFrequency: 'event_driven', dataCompleteness: 'complete' });
        const setCatalogEntry = sinon.stub().resolves();
        const { AiAnalytics: TestAdapter } = proxyquire.noCallThru()('../../main', {
            '@iobroker/adapter-core': { Adapter: class {} },
            './lib/catalog': { getAllCatalogEntries: sinon.stub(), setCatalogEntry, markInactive: sinon.stub() },
            './lib/dataQualityClassifier': { classifyDataQuality },
        });
        const adapter = Object.create(TestAdapter.prototype);
        adapter.log = { silly: sinon.stub(), error: sinon.stub() };
        adapter.getForeignObjectAsync = sinon.stub().resolves({ common: { write: true } });
        adapter.updateCatalogSyncState = sinon.stub().resolves();

        await adapter.backfillDataQuality([
            { sourceId: 'broken', historyInstance: 'history.0' },
            { sourceId: 'healthy', historyInstance: 'history.0' },
        ]);

        expect(adapter.log.error.calledOnce).to.equal(true);
        expect(adapter.log.error.firstCall.args[0]).to.include('broken');
        expect(setCatalogEntry.calledOnce).to.equal(true);
        expect(setCatalogEntry.firstCall.args[1].sourceId).to.equal('healthy');
    });
});

describe('AiAnalytics syncCatalog flow', () => {
    it('discovers, onboards, and persists a new catalog entry through the real catalog state path', async () => {
        const discovered = [
            {
                id: 'shelly.0.power.0',
                historyInstance: 'influxdb.0',
                common: { name: 'Leistung', role: 'value.power', unit: 'W', write: false },
            },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    {
                        sourceId: 'shelly.0.power.0',
                        description: 'Leistungsaufnahme',
                        unit: 'W',
                        category: 'consumption',
                        room: 'Keller',
                        confidence: 'high',
                    },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const onboarding = proxyquire('../../lib/onboarding', {
            './usage': {
                recordUsage: sinon.stub().resolves(),
                isBudgetExceeded: sinon.stub().resolves(false),
            },
            './valueKindClassifier': {
                classifyValueKind: sinon.stub().resolves({ valueKind: 'gauge', valueKindConfidence: 'high', valueKindSource: 'metadata' }),
            },
            './dataQualityClassifier': {
                classifyDataQuality: sinon.stub().resolves({
                    writable: false,
                    writePattern: 'continuous',
                    updateFrequency: 'minutes',
                    dataCompleteness: 'complete',
                }),
            },
        });
        const findHistorizedObjects = sinon.stub().resolves(discovered);
        const { AiAnalytics: TestAdapter } = proxyquire.noCallThru()('../../main', {
            '@iobroker/adapter-core': { Adapter: class {} },
            './lib/discovery': { findHistorizedObjects },
            './lib/onboarding': onboarding,
        });
        const states = {};
        const adapter = Object.create(TestAdapter.prototype);
        adapter.namespace = 'ai-analytics.0';
        adapter.config = { enableValueKindBackfill: false, enableDataQualityBackfill: false };
        adapter.onboardingProvider = provider;
        adapter.onboardingProviderOk = true;
        adapter.log = { silly: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
        adapter.getStatesAsync = sinon.stub().callsFake(async () =>
            Object.fromEntries(Object.entries(states).filter(([id]) => id.startsWith(`${adapter.namespace}.catalog.`)))
        );
        adapter.getStateAsync = sinon.stub().callsFake(async id => states[`${adapter.namespace}.${id}`] || null);
        adapter.setObjectNotExistsAsync = sinon.stub().resolves();
        adapter.setStateAsync = sinon.stub().callsFake(async (id, state) => {
            states[`${adapter.namespace}.${id}`] = state;
        });
        adapter.updateCatalogSyncState = AiAnalytics.prototype.updateCatalogSyncState;

        const result = await adapter.syncCatalog();

        expect(findHistorizedObjects.calledOnceWithExactly(adapter)).to.equal(true);
        expect(provider.chat.calledOnce).to.equal(true);
        expect(result).to.deep.equal({ foundCount: 1, newCount: 1, reactivatedCount: 0, skipped: null });
        const storedState = states['ai-analytics.0.catalog.shelly.0.power.0'];
        expect(storedState).to.exist;
        expect(JSON.parse(storedState.val)).to.deep.include({
            sourceId: 'shelly.0.power.0',
            description: 'Leistungsaufnahme',
            category: 'consumption',
            room: 'Keller',
            valueKind: 'gauge',
            writePattern: 'continuous',
            dataCompleteness: 'complete',
            active: true,
        });
    });
});

describe('AiAnalytics proactive anomaly gate', () => {
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

    function makeAdapter(TestAdapter) {
        const adapter = Object.create(TestAdapter.prototype);
        adapter.config = { silentIfNothingFound: false };
        adapter.chatProviderOk = true;
        adapter.tools = {};
        adapter.readOnlyTools = { definitions: [{ name: 'listCatalog' }] };
        adapter.log = { silly: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
        adapter.updateCatalogSyncState = sinon.stub().resolves();
        adapter.appendHistoryFailureReports = sinon.stub().resolves();
        return adapter;
    }

    it('does not call the LLM when the statistical pre-analysis finds no candidates', async () => {
        const runAgent = sinon.stub();
        const loaded = loadMainWithProactiveStubs({ runAgent });
        const adapter = makeAdapter(loaded.TestAdapter);

        const result = await adapter.runProactiveCheck();

        expect(result).to.deep.include({ skipped: false, anomalyCandidates: 0 });
        expect(runAgent.notCalled).to.equal(true);
        expect(loaded.appendChatMessage.calledOnceWith(adapter, 'assistant', 'Keine Auffaelligkeiten.')).to.equal(true);
        expect(adapter.appendHistoryFailureReports.calledOnce).to.equal(true);
    });

    it('passes statistical candidates to the LLM for explanation', async () => {
        const runAgent = sinon.stub().resolves({ finalText: 'Die Leistung war ungewoehnlich hoch.', usage: { inputTokens: 5 } });
        const candidates = [{ sourceId: 'sensor.0.power', reason: 'deviation', robustZ: 8 }];
        const loaded = loadMainWithProactiveStubs({ candidates, runAgent });
        const adapter = makeAdapter(loaded.TestAdapter);

        const result = await adapter.runProactiveCheck();

        expect(result).to.deep.equal({ skipped: false });
        expect(runAgent.calledOnce).to.equal(true);
        expect(runAgent.firstCall.args[0].tools).to.equal(adapter.readOnlyTools);
        expect(runAgent.firstCall.args[0].systemPrompt).to.include(JSON.stringify(candidates));
        expect(loaded.recordUsage.calledOnceWith(adapter, { inputTokens: 5 }, 'chat')).to.equal(true);
    });

    it('reports an incomplete check instead of no anomalies when history reads fail', async () => {
        const candidates = [];
        Object.defineProperty(candidates, 'failedCount', { value: 2 });
        const loaded = loadMainWithProactiveStubs({ candidates });
        const adapter = makeAdapter(loaded.TestAdapter);

        const result = await adapter.runProactiveCheck();

        expect(result).to.deep.include({ skipped: false, incomplete: true, failedCount: 2 });
        expect(loaded.appendChatMessage.firstCall.args[2]).to.include('unvollständig');
    });

    it('merges HVAC correlation candidates with the statistical candidates', async () => {
        const hvacCandidates = [{ room: 'Wohnzimmer', reason: 'window_open_while_heating', overlapMs: 1200000 }];
        const loaded = loadMainWithProactiveStubs({ hvacCandidates });
        const adapter = makeAdapter(loaded.TestAdapter);

        const result = await adapter.runProactiveCheck();

        expect(result).to.deep.equal({ skipped: false });
        expect(loaded.findHvacCorrelationCandidates.calledOnce).to.equal(true);
    });

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
});
