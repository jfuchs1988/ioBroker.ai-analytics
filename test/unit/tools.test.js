// test/unit/tools.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadToolsWithStubs({ getAllCatalogEntries, getHistory, compareTimeframes }) {
    return proxyquire('../../lib/tools', {
        './catalog': { getAllCatalogEntries },
        './dataAccess': { getHistory, compareTimeframes },
    });
}

describe('buildTools', () => {
    it('exposes listCatalog, getHistory and compareTimeframes definitions', () => {
        const { buildTools } = require('../../lib/tools');
        const { definitions } = buildTools({});
        expect(definitions.map((d) => d.name)).to.deep.equal(['listCatalog', 'getHistory', 'compareTimeframes']);
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
        expect(result).to.deep.equal([{ ts: 1, val: 5 }]);
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
        expect(result).to.deep.equal({ deltaSum: 5 });
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
});
