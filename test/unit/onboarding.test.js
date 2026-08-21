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

        expect(result.classifiedCount).to.equal(1);
        expect(result.needsReview).to.deep.equal([]);
        expect(errorStub.calledOnce).to.equal(true);
        expect(errorStub.firstCall.args[0]).to.include('Onboarding-Batch fehlgeschlagen');
        expect(setCatalogEntry.called).to.equal(false);
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
});
