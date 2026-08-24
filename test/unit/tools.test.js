// test/unit/tools.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadToolsWithStubs({ getAllCatalogEntries, getHistory, compareTimeframes, setCatalogEntry }) {
    return proxyquire('../../lib/tools', {
        './catalog': { getAllCatalogEntries, setCatalogEntry },
        './dataAccess': { getHistory, compareTimeframes },
    });
}

describe('buildTools', () => {
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

    it('listCatalog excludes inactive and needsReview entries, and supports a category filter', async () => {
        const entries = [
            { sourceId: 'a', category: 'lighting', active: true, needsReview: false },
            { sourceId: 'b', category: 'consumption', active: false, needsReview: false },
            { sourceId: 'c', category: 'consumption', active: true, needsReview: true },
            { sourceId: 'd', category: 'consumption', active: true, needsReview: false },
        ];
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves(entries),
        });

        const { execute } = buildTools({});

        const all = await execute('listCatalog', {});
        expect(all.map((e) => e.sourceId)).to.deep.equal(['a', 'd']);

        const filtered = await execute('listCatalog', { category: 'consumption' });
        expect(filtered.map((e) => e.sourceId)).to.deep.equal(['d']);
    });

    it('listCatalog also excludes ignored entries', async () => {
        const entries = [
            { sourceId: 'a', category: 'lighting', active: true, needsReview: false, ignored: false },
            { sourceId: 'b', category: 'lighting', active: true, needsReview: false, ignored: true },
        ];
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves(entries),
        });

        const { execute } = buildTools({});
        const result = await execute('listCatalog', {});

        expect(result.map((e) => e.sourceId)).to.deep.equal(['a']);
    });

    it('getHistory resolves the historyInstance from the catalog and delegates to dataAccess', async () => {
        const getHistoryStub = sinon.stub().resolves([{ ts: 1, val: 5 }]);
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon
                .stub()
                .resolves([{ sourceId: 'javascript.0.x', historyInstance: 'influxdb.0' }]),
            getHistory: getHistoryStub,
        });

        const adapter = {};
        const { execute } = buildTools(adapter);
        const result = await execute('getHistory', { sourceId: 'javascript.0.x', start: 1, end: 2, aggregate: 'average' });

        expect(getHistoryStub.calledOnceWith(adapter, 'influxdb.0', 'javascript.0.x', 1, 2, 'average')).to.equal(true);
        expect(result).to.deep.equal({ description: undefined, room: undefined, unit: undefined, history: [{ ts: 1, val: 5 }] });
    });

    it('getHistory throws for objects not in the catalog', async () => {
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
        });
        const { execute } = buildTools({});

        let threw = false;
        try {
            await execute('getHistory', { sourceId: 'unknown', start: 1, end: 2 });
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });

    it('compareTimeframes resolves the historyInstance and delegates to dataAccess', async () => {
        const compareStub = sinon.stub().resolves({ deltaSum: 5 });
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon
                .stub()
                .resolves([{ sourceId: 'javascript.0.x', historyInstance: 'influxdb.0' }]),
            compareTimeframes: compareStub,
        });

        const adapter = {};
        const { execute } = buildTools(adapter);
        const periodA = { start: 0, end: 1 };
        const periodB = { start: 1, end: 2 };
        const result = await execute('compareTimeframes', { sourceId: 'javascript.0.x', periodA, periodB });

        expect(compareStub.calledOnceWith(adapter, 'influxdb.0', 'javascript.0.x', periodA, periodB)).to.equal(true);
        expect(result).to.deep.equal({ description: undefined, room: undefined, unit: undefined, deltaSum: 5 });
    });

    it('getHistory includes description/room/unit from the catalog entry in the result', async () => {
        const getHistoryStub = sinon.stub().resolves([{ ts: 1, val: 5 }]);
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([
                {
                    sourceId: 'javascript.0.x',
                    historyInstance: 'influxdb.0',
                    description: 'Wohnzimmer Lampe',
                    room: 'Wohnzimmer',
                    unit: 'kWh',
                },
            ]),
            getHistory: getHistoryStub,
        });

        const adapter = {};
        const { execute } = buildTools(adapter);
        const result = await execute('getHistory', { sourceId: 'javascript.0.x', start: 1, end: 2 });

        expect(result).to.deep.equal({
            description: 'Wohnzimmer Lampe',
            room: 'Wohnzimmer',
            unit: 'kWh',
            history: [{ ts: 1, val: 5 }],
        });
    });

    it('throws for unknown tool names', async () => {
        const { buildTools } = require('../../lib/tools');
        const { execute } = buildTools({});
        let threw = false;
        try {
            await execute('doesNotExist', {});
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
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

    it('listCatalog with needsReviewOnly excludes entries the admin has ignored', async () => {
        const entries = [
            { sourceId: 'a', category: 'consumption', active: true, needsReview: true, ignored: false },
            { sourceId: 'b', category: 'consumption', active: true, needsReview: true, ignored: true },
        ];
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves(entries),
        });

        const { execute } = buildTools({});
        const result = await execute('listCatalog', { needsReviewOnly: true });

        expect(result.map((e) => e.sourceId)).to.deep.equal(['a']);
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
});
