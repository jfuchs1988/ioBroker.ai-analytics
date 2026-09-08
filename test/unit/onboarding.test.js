// test/unit/onboarding.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { buildBatches } = require('../../lib/onboarding');

function loadOnboardingWithStubs({ getAllCatalogEntries, setCatalogEntry, recordUsage, isBudgetExceeded, classifyValueKind, classifyDataQuality }) {
    return proxyquire('../../lib/onboarding', {
        './catalog': {
            getAllCatalogEntries,
            setCatalogEntry,
            CATEGORIES: ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'],
        },
        './usage': {
            recordUsage: recordUsage || sinon.stub().resolves(),
            isBudgetExceeded: isBudgetExceeded || sinon.stub().resolves(false),
        },
        './valueKindClassifier': {
            classifyValueKind:
                classifyValueKind ||
                sinon.stub().resolves({ valueKind: 'gauge', valueKindConfidence: 'low', valueKindSource: 'metadata' }),
        },
        './dataQualityClassifier': {
            classifyDataQuality:
                classifyDataQuality ||
                sinon.stub().resolves({ writable: false, writePattern: 'unknown', updateFrequency: 'unknown', dataCompleteness: 'unknown' }),
        },
    });
}

function makeDiscovered(count) {
    return Array.from({ length: count }, (unused, index) => ({
        id: `javascript.0.obj${index}`,
        historyInstance: 'influxdb.0',
        common: { name: `obj${index}` },
    }));
}

describe('buildClassificationPrompt', () => {
    const { buildClassificationPrompt } = require('../../lib/onboarding');

    it('lists all eight derivedMetricRole values and both hvacRole values', () => {
        const prompt = buildClassificationPrompt([{ id: 'sun2000.0.x', common: { name: 'x' } }]);

        for (const role of ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption', 'grid_power', 'battery_power']) {
            expect(prompt).to.include(role);
        }
        expect(prompt).to.include('window');
        expect(prompt).to.include('heating');
    });

    it('instructs the model to answer null when the role is not evident from the name', () => {
        const prompt = buildClassificationPrompt([{ id: 'sun2000.0.x', common: { name: 'x' } }]);

        expect(prompt.toLowerCase()).to.include('null');
    });
});

describe('buildBatches', () => {
    it('never mixes two adapter types in the same batch, even if that means a smaller batch', () => {
        const objects = [
            { id: 'hm-rpc.0.a' },
            { id: 'hm-rpc.0.b' },
            { id: 'shelly.0.c' },
            { id: 'shelly.0.d' },
        ];

        const batches = buildBatches(objects, 3);

        expect(batches).to.have.lengthOf(2);
        expect(batches[0].map((o) => o.id)).to.deep.equal(['hm-rpc.0.a', 'hm-rpc.0.b']);
        expect(batches[1].map((o) => o.id)).to.deep.equal(['shelly.0.c', 'shelly.0.d']);
    });

    it('splits by adapter instance, keeping different instances of the same adapter type in separate batches', () => {
        const objects = [
            { id: 'hm-rpc.0.a' },
            { id: 'hm-rpc.1.b' },
            { id: 'shelly.0.c' },
        ];

        const batches = buildBatches(objects, 10);

        expect(batches).to.have.lengthOf(3);
        expect(batches[0].map((o) => o.id)).to.deep.equal(['hm-rpc.0.a']);
        expect(batches[1].map((o) => o.id)).to.deep.equal(['hm-rpc.1.b']);
        expect(batches[2].map((o) => o.id)).to.deep.equal(['shelly.0.c']);
    });

    it('keeps two objects of the same adapter instance in the same batch', () => {
        const objects = [
            { id: 'sun2000.0.grid.power' },
            { id: 'sun2000.1.grid.power' },
            { id: 'sun2000.0.battery.totalCharge' },
        ];

        const batches = buildBatches(objects, 10);

        expect(batches).to.have.lengthOf(2);
        expect(batches[0].map((o) => o.id)).to.deep.equal(['sun2000.0.grid.power', 'sun2000.0.battery.totalCharge']);
        expect(batches[1].map((o) => o.id)).to.deep.equal(['sun2000.1.grid.power']);
    });

    it('splits a single adapter type into multiple batches once it exceeds the batch size', () => {
        const objects = Array.from({ length: 5 }, (unused, i) => ({ id: `javascript.0.obj${i}` }));

        const batches = buildBatches(objects, 2);

        expect(batches).to.have.lengthOf(3);
        expect(batches.map((b) => b.length)).to.deep.equal([2, 2, 1]);
    });

    it('keeps adapter types separate even when their objects are interleaved in the input order', () => {
        const objects = [
            { id: 'hm-rpc.0.a' },
            { id: 'shelly.0.x' },
            { id: 'hm-rpc.0.b' },
            { id: 'shelly.0.y' },
        ];

        const batches = buildBatches(objects, 10);

        expect(batches).to.have.lengthOf(2);
        expect(batches[0].map((o) => o.id)).to.deep.equal(['hm-rpc.0.a', 'hm-rpc.0.b']);
        expect(batches[1].map((o) => o.id)).to.deep.equal(['shelly.0.x', 'shelly.0.y']);
    });

    it('returns an empty array for no objects', () => {
        expect(buildBatches([], 20)).to.deep.equal([]);
    });
});

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

    it('accepts localized common.name objects during default classification', async () => {
        const discovered = [{
            id: 'shelly.0.power',
            historyInstance: 'history.0',
            common: { name: { en: 'Power', de: 'Leistung' }, unit: 'W' },
        }];
        const setCatalogEntry = sinon.stub().resolves();
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'shelly.0.power',
                    description: 'Leistung',
                    category: 'consumption',
                    confidence: 'high',
                }]),
            }),
        };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding({}, provider, discovered);

        expect(setCatalogEntry.calledOnce).to.equal(true);
    });

    it('reports onboarding progress through the optional callback', async () => {
        const discovered = [
            { id: 'javascript.0.verbrauch.gesamt', historyInstance: 'influxdb.0', common: { name: 'Gesamtverbrauch' } },
        ];
        const progressSpy = sinon.stub().resolves();
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry: sinon.stub().resolves(),
        });
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

        await runOnboarding({}, provider, discovered, progressSpy);

        expect(progressSpy.called).to.equal(true);
        expect(progressSpy.lastCall.args[0]).to.include({ processed: 1, total: 1, currentSourceId: 'javascript.0.verbrauch.gesamt' });
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

    it('continues after batch processing fails', async () => {
        const discovered = [
            { id: 'javascript.0.bad', historyInstance: 'history.0', common: { name: 'BadObject' } },
        ];
        const setCatalogEntry = sinon.stub().resolves();
        const errorStub = sinon.stub();
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: 'This is not valid JSON at all',
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const adapter = {
            log: {
                error: errorStub,
            },
        };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        const result = await runOnboarding(adapter, provider, discovered);

        expect(result.classifiedCount).to.equal(0);
        expect(result.needsReview).to.deep.equal([]);
        expect(errorStub.calledOnce).to.equal(true);
        expect(errorStub.firstCall.args[0]).to.include('Onboarding-Batch fehlgeschlagen');
        expect(setCatalogEntry.called).to.equal(false);
    });

    it('rejects a non-array classification response without aborting onboarding', async () => {
        const setCatalogEntry = sinon.stub().resolves();
        const provider = { chat: sinon.stub().resolves({ content: '{"sourceId":"javascript.0.x"}' }) };
        const adapter = { log: { error: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        const result = await runOnboarding(adapter, provider, makeDiscovered(1));

        expect(result.classifiedCount).to.equal(0);
        expect(setCatalogEntry.notCalled).to.equal(true);
        expect(adapter.log.error.calledOnce).to.equal(true);
    });

    it('rejects an oversized classification response', async () => {
        const setCatalogEntry = sinon.stub().resolves();
        const provider = { chat: sinon.stub().resolves({ content: `[${' '.repeat(128 * 1024)}]` }) };
        const adapter = { log: { error: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        const result = await runOnboarding(adapter, provider, makeDiscovered(1));

        expect(result.classifiedCount).to.equal(0);
        expect(setCatalogEntry.notCalled).to.equal(true);
    });

    it('rejects duplicate, unknown, and oversized classification result sets', async () => {
        const discovered = makeDiscovered(2);
        const invalidResults = [
            [
                { sourceId: discovered[0].id, category: 'lighting', confidence: 'high' },
                { sourceId: discovered[0].id, category: 'lighting', confidence: 'high' },
            ],
            [{ sourceId: 'unknown.0.x', category: 'lighting', confidence: 'high' }],
            Array.from({ length: 3 }, (_, index) => ({ sourceId: `javascript.0.obj${index}`, category: 'lighting', confidence: 'high' })),
        ];

        for (const classifications of invalidResults) {
            const setCatalogEntry = sinon.stub().resolves();
            const provider = { chat: sinon.stub().resolves({ content: JSON.stringify(classifications) }) };
            const adapter = { log: { error: sinon.stub() } };
            const { runOnboarding } = loadOnboardingWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([]),
                setCatalogEntry,
            });

            const result = await runOnboarding(adapter, provider, discovered);
            expect(result.classifiedCount).to.equal(0);
            expect(setCatalogEntry.notCalled).to.equal(true);
        }
    });

    it('counts only classifications that were persisted successfully', async () => {
        const discovered = makeDiscovered(2);
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify(discovered.map(source => ({
                    sourceId: source.id,
                    description: source.id,
                    category: 'lighting',
                    confidence: 'high',
                }))),
            }),
        };
        const setCatalogEntry = sinon.stub();
        setCatalogEntry.onFirstCall().resolves();
        setCatalogEntry.onSecondCall().rejects(new Error('write failed'));
        const adapter = { log: { error: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        const result = await runOnboarding(adapter, provider, discovered);

        expect(result.classifiedCount).to.equal(1);
    });

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

    it('overrides the guessed room with the ioBroker room enum when the object is a member', async () => {
        const discovered = [
            { id: 'javascript.0.lampe', historyInstance: 'influxdb.0', common: { name: 'Lampe', role: 'switch.light', unit: '' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.lampe', description: 'Lampe', unit: '', category: 'lighting', room: 'geraten', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const adapter = {
            getForeignObjectsAsync: sinon.stub().resolves({
                'enum.rooms.wohnzimmer': { common: { name: 'Wohnzimmer', members: ['javascript.0.lampe'] } },
            }),
        };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding(adapter, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry.room).to.equal('Wohnzimmer');
    });

    it('falls back to the LLM-guessed room when there is no enum match', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: 'Keller', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const adapter = { getForeignObjectsAsync: sinon.stub().resolves({}) };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding(adapter, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry.room).to.equal('Keller');
    });

    it('works without a getForeignObjectsAsync method on the adapter (defensive default)', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: 'Keller', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding({}, provider, discovered);

        expect(setCatalogEntry.calledOnce).to.equal(true);
    });

    it('sets ignored=false by default on newly classified entries', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry.ignored).to.equal(false);
    });

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

    it('stops classifying further batches once the daily token budget is exhausted', async () => {
        // 60 Objekte = 3 Batches à 20; Budget ist nach dem ersten Batch erschoepft.
        const discovered = makeDiscovered(60);
        const setCatalogEntry = sinon.stub().resolves();
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: '[]',
                toolCalls: [],
                stopReason: 'end_turn',
                usage: { inputTokens: 1000, outputTokens: 100 },
            }),
        };
        const isBudgetExceeded = sinon.stub();
        isBudgetExceeded.onFirstCall().resolves(false);
        isBudgetExceeded.resolves(true);
        const adapter = { log: { warn: sinon.stub(), error: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            isBudgetExceeded,
        });

        const result = await runOnboarding(adapter, provider, discovered);

        expect(provider.chat.callCount).to.equal(1);
        expect(provider.chat.callCount).to.be.below(3);
        expect(adapter.log.warn.calledOnce).to.equal(true);
        expect(adapter.log.warn.firstCall.args[0]).to.include('Tagesbudget');
        expect(adapter.log.error.called).to.equal(true);
        expect(result.needsReview).to.deep.equal([]);
    });

    it('does not call the provider at all when the budget is already exhausted before the run', async () => {
        const discovered = makeDiscovered(20);
        const provider = { chat: sinon.stub() };
        const adapter = { log: { warn: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry: sinon.stub().resolves(),
            isBudgetExceeded: sinon.stub().resolves(true),
        });

        const result = await runOnboarding(adapter, provider, discovered);

        expect(provider.chat.called).to.equal(false);
        expect(adapter.log.warn.calledOnce).to.equal(true);
        expect(result.needsReview).to.deep.equal([]);
    });

    it('still writes the catalog entry when recording the token usage fails', async () => {
        const discovered = [{ id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } }];
        const setCatalogEntry = sinon.stub().resolves();
        const recordUsage = sinon.stub().rejects(new Error('usage.today ist kaputt'));
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
                usage: { inputTokens: 100, outputTokens: 20 },
            }),
        };
        const adapter = { log: { warn: sinon.stub(), error: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            recordUsage,
        });

        await runOnboarding(adapter, provider, discovered);

        expect(recordUsage.calledOnce).to.equal(true);
        expect(setCatalogEntry.calledOnce).to.equal(true);
        expect(setCatalogEntry.firstCall.args[1]).to.deep.include({ sourceId: 'javascript.0.x', category: 'consumption' });
        expect(adapter.log.error.called).to.equal(false);
        expect(adapter.log.warn.calledOnce).to.equal(true);
        expect(adapter.log.warn.firstCall.args[0]).to.include('Onboarding-Verbrauch nicht erfasst');
    });

    it('attaches valueKind classification to newly classified entries', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon
            .stub()
            .resolves({ valueKind: 'daily_reset_counter', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            valueKind: 'daily_reset_counter',
            valueKindConfidence: 'high',
            valueKindSource: 'sampled',
        });
        expect(classifyValueKind.calledOnceWith(sinon.match.any, discovered[0], 'influxdb.0')).to.equal(true);
    });

    it('falls back to a safe gauge/low classification when classifyValueKind throws, without aborting the batch', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().rejects(new Error('History-Instanz nicht erreichbar'));
        const adapter = { log: { warn: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding(adapter, provider, discovered);

        expect(setCatalogEntry.calledOnce).to.equal(true);
        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            valueKind: 'gauge',
            valueKindConfidence: 'low',
            valueKindSource: 'metadata',
        });
        expect(adapter.log.warn.calledOnce).to.equal(true);
    });

    it('attaches data-quality classification to newly classified entries', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyDataQuality = sinon
            .stub()
            .resolves({ writable: true, writePattern: 'continuous', updateFrequency: 'seconds', dataCompleteness: 'complete' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyDataQuality,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            writable: true,
            writePattern: 'continuous',
            updateFrequency: 'seconds',
            dataCompleteness: 'complete',
        });
        expect(classifyDataQuality.calledOnceWith(sinon.match.any, discovered[0], 'influxdb.0')).to.equal(true);
    });

    it('falls back to safe unknown data-quality values when classifyDataQuality throws, without aborting the batch', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyDataQuality = sinon.stub().rejects(new Error('History-Instanz nicht erreichbar'));
        const adapter = { log: { warn: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyDataQuality,
        });

        await runOnboarding(adapter, provider, discovered);

        expect(setCatalogEntry.calledOnce).to.equal(true);
        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            writable: false,
            writePattern: 'unknown',
            updateFrequency: 'unknown',
            dataCompleteness: 'unknown',
        });
        expect(adapter.log.warn.called).to.equal(true);
    });

    it('stores a compatible derivedMetricRole proposal and forces needsReview even at high confidence', async () => {
        const discovered = [
            { id: 'sun2000.0.battery.totalCharge', historyInstance: 'influxdb.0', common: { name: 'Batterie Ladeleistung gesamt' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'sun2000.0.battery.totalCharge', description: 'Batterie Ladeleistung gesamt',
                    unit: 'kWh', category: 'consumption', room: '', confidence: 'high',
                    derivedMetricRole: 'battery_charge',
                }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({
            derivedMetricRole: 'battery_charge',
            derivedMetricGroupId: 'sun2000.0',
            needsReview: true,
        });
    });

    it('drops an incompatible derivedMetricRole proposal but still stores the rest of the entry', async () => {
        const discovered = [
            { id: 'sun2000.0.grid.power', historyInstance: 'influxdb.0', common: { name: 'Netzleistung' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'sun2000.0.grid.power', description: 'Netzleistung', unit: 'W',
                    category: 'consumption', room: '', confidence: 'high',
                    derivedMetricRole: 'grid_import',
                }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'gauge', valueKindConfidence: 'high', valueKindSource: 'metadata' });
        const adapter = { log: { warn: sinon.stub() } };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding(adapter, provider, discovered);

        expect(setCatalogEntry.calledOnce).to.equal(true);
        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.not.have.property('derivedMetricRole');
        expect(entry).to.not.have.property('derivedMetricGroupId');
        expect(entry.needsReview).to.equal(true);
        expect(entry.description).to.equal('Netzleistung');
    });

    it('drops both roles when the LLM proposes the same role twice within one adapter instance', async () => {
        const discovered = [
            { id: 'sun2000.0.battery.a', historyInstance: 'influxdb.0', common: { name: 'a' } },
            { id: 'sun2000.0.battery.b', historyInstance: 'influxdb.0', common: { name: 'b' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([
                    { sourceId: 'sun2000.0.battery.a', description: 'a', unit: 'kWh', category: 'consumption', room: '', confidence: 'high', derivedMetricRole: 'battery_charge' },
                    { sourceId: 'sun2000.0.battery.b', description: 'b', unit: 'kWh', category: 'consumption', room: '', confidence: 'high', derivedMetricRole: 'battery_charge' },
                ]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        expect(setCatalogEntry.calledTwice).to.equal(true);
        for (const call of setCatalogEntry.getCalls()) {
            const [, entry] = call.args;
            expect(entry).to.not.have.property('derivedMetricRole');
            expect(entry.needsReview).to.equal(true);
        }
    });

    it('does not propose a role that is already claimed by an existing catalog entry in the same group', async () => {
        const discovered = [
            { id: 'sun2000.0.battery.new', historyInstance: 'influxdb.0', common: { name: 'neu' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'sun2000.0.battery.new', description: 'neu', unit: 'kWh',
                    category: 'consumption', room: '', confidence: 'high', derivedMetricRole: 'battery_charge',
                }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([
                { sourceId: 'sun2000.0.battery.old', derivedMetricRole: 'battery_charge', derivedMetricGroupId: 'sun2000.0' },
            ]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.not.have.property('derivedMetricRole');
        expect(entry.needsReview).to.equal(true);
    });

    it('stores a compatible hvacRole proposal and forces needsReview', async () => {
        const discovered = [
            { id: 'javascript.0.fenster.kueche', historyInstance: 'influxdb.0', common: { name: 'Fenster Kueche' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{
                    sourceId: 'javascript.0.fenster.kueche', description: 'Fenster Kueche', unit: '',
                    category: 'environment', room: 'Kueche', confidence: 'high', hvacRole: 'window',
                }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'boolean_state', valueKindConfidence: 'high', valueKindSource: 'metadata' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.deep.include({ hvacRole: 'window', needsReview: true });
    });

    it('derives the same derivedMetricGroupId for two objects of the same adapter instance', async () => {
        const discovered = [
            { id: 'sun2000.0.grid.import', historyInstance: 'influxdb.0', common: { name: 'Netzbezug' } },
            { id: 'sun2000.0.grid.feedin', historyInstance: 'influxdb.0', common: { name: 'Netzeinspeisung' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([
                    { sourceId: 'sun2000.0.grid.import', description: 'Netzbezug', unit: 'kWh', category: 'consumption', room: '', confidence: 'high', derivedMetricRole: 'grid_import' },
                    { sourceId: 'sun2000.0.grid.feedin', description: 'Netzeinspeisung', unit: 'kWh', category: 'generation_pv', room: '', confidence: 'high', derivedMetricRole: 'grid_feed_in' },
                ]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        expect(setCatalogEntry.getCall(0).args[1].derivedMetricGroupId).to.equal('sun2000.0');
        expect(setCatalogEntry.getCall(1).args[1].derivedMetricGroupId).to.equal('sun2000.0');
    });

    it('catches a duplicate role proposed in a later batch of the same instance (instance larger than BATCH_SIZE)', async () => {
        // 21 objects of the same adapter instance -> buildBatches (size 20) splits it into two
        // batches. Only obj0 (batch 1) and obj20 (batch 2, alone) propose a role, both the same
        // one -> obj20's batch-local roleKeyCounts is 1 (no in-batch duplicate), so this only
        // gets caught if assignedRoleKeys persists across the batch loop from batch 1 to batch 2.
        const discovered = Array.from({ length: 21 }, (unused, i) => ({
            id: `sun2000.0.obj${i}`,
            historyInstance: 'influxdb.0',
            common: { name: `obj${i}` },
        }));
        const provider = {
            chat: sinon.stub().callsFake(({ messages }) => {
                const requested = JSON.parse(messages[0].content.split('Objekte:\n')[1]);
                const content = requested.map((obj) => ({
                    sourceId: obj.sourceId, description: obj.sourceId, unit: 'kWh',
                    category: 'consumption', room: '', confidence: 'high',
                    derivedMetricRole: (obj.sourceId === 'sun2000.0.obj0' || obj.sourceId === 'sun2000.0.obj20') ? 'battery_charge' : null,
                }));
                return Promise.resolve({ content: JSON.stringify(content) });
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const classifyValueKind = sinon.stub().resolves({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
            classifyValueKind,
        });

        await runOnboarding({}, provider, discovered);

        expect(provider.chat.callCount).to.equal(2); // 21 objects / BATCH_SIZE 20 -> two batches
        const obj0Call = setCatalogEntry.getCalls().find((call) => call.args[1].sourceId === 'sun2000.0.obj0');
        const obj20Call = setCatalogEntry.getCalls().find((call) => call.args[1].sourceId === 'sun2000.0.obj20');
        expect(obj0Call.args[1].derivedMetricRole).to.equal('battery_charge'); // first claim (batch 1) succeeds
        expect(obj20Call.args[1]).to.not.have.property('derivedMetricRole'); // second claim (batch 2) blocked by assignedRoleKeys
        expect(obj20Call.args[1].needsReview).to.equal(true);
    });

    it('leaves entries untouched when the LLM proposes no role, unchanged from prior behaviour', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                content: JSON.stringify([{ sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' }]),
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry).to.not.have.property('derivedMetricRole');
        expect(entry.needsReview).to.equal(false);
    });

    it('skips a batch whose prompt exceeds the configured onboarding input-token limit, without aborting the run', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x'.repeat(5000) } },
        ];
        const provider = { chat: sinon.stub() };
        const setCatalogEntry = sinon.stub().resolves();
        const adapter = { log: { warn: sinon.stub(), error: sinon.stub(), silly: sinon.stub() }, config: { onboardingMaxInputTokens: 100 } };
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

});
