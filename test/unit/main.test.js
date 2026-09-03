const { expect } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const adminCommands = require('../../lib/adminCommands');

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
