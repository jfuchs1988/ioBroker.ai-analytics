const { expect } = require('chai');
const sinon = require('sinon');
const {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    catalogStateId,
    CATEGORIES,
} = require('../../lib/catalog');

function makeAdapter() {
    return {
        namespace: 'ai-analytics.0',
        getStateAsync: sinon.stub(),
        getStatesAsync: sinon.stub(),
        setObjectNotExistsAsync: sinon.stub().resolves(),
        setStateAsync: sinon.stub().resolves(),
    };
}

describe('catalog', () => {
    it('catalogStateId builds a state id under catalog.<sourceId>', () => {
        expect(catalogStateId('javascript.0.verbrauch.gesamt')).to.equal(
            'catalog.javascript.0.verbrauch.gesamt'
        );
    });

    it('setCatalogEntry rejects unknown categories', async () => {
        const adapter = makeAdapter();
        let threw = false;
        try {
            await setCatalogEntry(adapter, { sourceId: 'x', category: 'not-a-category' });
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });

    it('setCatalogEntry writes a JSON-encoded state', async () => {
        const adapter = makeAdapter();
        const entry = {
            sourceId: 'javascript.0.verbrauch.gesamt',
            description: 'Gesamtverbrauch',
            unit: 'kWh',
            category: 'consumption',
            room: '',
            confidence: 'high',
            needsReview: false,
            active: true,
            historyInstance: 'influxdb.0',
            lastSeen: '2026-08-21T00:00:00.000Z',
        };

        await setCatalogEntry(adapter, entry);

        expect(adapter.setStateAsync.calledOnce).to.equal(true);
        const [id, state] = adapter.setStateAsync.firstCall.args;
        expect(id).to.equal('catalog.javascript.0.verbrauch.gesamt');
        expect(JSON.parse(state.val)).to.deep.equal(entry);
        expect(state.ack).to.equal(true);
    });

    it('getCatalogEntry returns null when no state exists', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves(null);
        const entry = await getCatalogEntry(adapter, 'javascript.0.x');
        expect(entry).to.equal(null);
    });

    it('getAllCatalogEntries parses every stored JSON value', async () => {
        const adapter = makeAdapter();
        adapter.getStatesAsync.resolves({
            'ai-analytics.0.catalog.a': { val: JSON.stringify({ sourceId: 'a', category: 'lighting' }) },
            'ai-analytics.0.catalog.b': { val: JSON.stringify({ sourceId: 'b', category: 'consumption' }) },
        });

        const entries = await getAllCatalogEntries(adapter);

        expect(entries).to.have.lengthOf(2);
        expect(entries.map((e) => e.sourceId).sort()).to.deep.equal(['a', 'b']);
    });

    it('markInactive sets active=false on an existing entry', async () => {
        const adapter = makeAdapter();
        const existing = {
            sourceId: 'javascript.0.x',
            description: 'x',
            unit: '',
            category: 'consumption',
            room: '',
            confidence: 'high',
            needsReview: false,
            active: true,
            historyInstance: 'influxdb.0',
            lastSeen: '2026-08-21T00:00:00.000Z',
        };
        adapter.getStateAsync.resolves({ val: JSON.stringify(existing) });

        await markInactive(adapter, 'javascript.0.x');

        const [, state] = adapter.setStateAsync.firstCall.args;
        expect(JSON.parse(state.val).active).to.equal(false);
    });

    it('exposes the allowed categories', () => {
        expect(CATEGORIES).to.deep.equal([
            'consumption',
            'generation_pv',
            'lighting',
            'device_usage',
            'environment',
        ]);
    });
});
