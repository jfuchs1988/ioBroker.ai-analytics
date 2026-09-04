const { expect } = require('chai');
const sinon = require('sinon');
const {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    removeCatalogEntry,
    catalogStateId,
    validateCatalogEntry,
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

    it('setCatalogEntry rejects malformed identifiers, history instances, and oversized text', async () => {
        const adapter = makeAdapter();
        const invalidEntries = [
            { sourceId: '', category: 'lighting' },
            { sourceId: 'sensor.0.x', category: 'lighting', historyInstance: 'javascript.0' },
            { sourceId: 'sensor.0.x', category: 'lighting', description: 'x'.repeat(2001) },
        ];

        for (const entry of invalidEntries) {
            let error;
            try {
                await setCatalogEntry(adapter, entry);
            } catch (caught) {
                error = caught;
            }
            expect(error).to.be.an('error');
        }
        expect(adapter.setStateAsync.notCalled).to.equal(true);
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

    it('getCatalogEntry returns null for malformed JSON or a mismatched entry shape', async () => {
        const adapter = makeAdapter();
        adapter.log = { warn: sinon.stub() };
        adapter.getStateAsync.onFirstCall().resolves({ val: '{broken' });
        adapter.getStateAsync.onSecondCall().resolves({ val: JSON.stringify({ sourceId: 'other', category: 'lighting' }) });

        expect(await getCatalogEntry(adapter, 'javascript.0.x')).to.equal(null);
        expect(await getCatalogEntry(adapter, 'javascript.0.x')).to.equal(null);
        expect(adapter.log.warn.callCount).to.equal(2);
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

    it('getAllCatalogEntries skips valid JSON with an invalid catalog shape', async () => {
        const adapter = makeAdapter();
        adapter.log = { warn: sinon.stub() };
        adapter.getStatesAsync.resolves({
            'ai-analytics.0.catalog.good': { val: JSON.stringify({ sourceId: 'good', category: 'lighting' }) },
            'ai-analytics.0.catalog.scalar': { val: '42' },
            'ai-analytics.0.catalog.badCategory': { val: JSON.stringify({ sourceId: 'badCategory', category: 'other' }) },
            'ai-analytics.0.catalog.wrong': { val: JSON.stringify({ sourceId: 'different', category: 'lighting' }) },
        });

        expect(await getAllCatalogEntries(adapter)).to.deep.equal([{ sourceId: 'good', category: 'lighting' }]);
        expect(adapter.log.warn.callCount).to.equal(3);
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

    it('removeCatalogEntry deletes the state and the object', async () => {
        const adapter = makeAdapter();
        adapter.delStateAsync = sinon.stub().resolves();
        adapter.delObjectAsync = sinon.stub().resolves();

        await removeCatalogEntry(adapter, 'javascript.0.x');

        expect(adapter.delStateAsync.calledOnceWith('catalog.javascript.0.x')).to.equal(true);
        expect(adapter.delObjectAsync.calledOnceWith('catalog.javascript.0.x')).to.equal(true);
    });

    it('removeCatalogEntry tolerates a missing state and still deletes the object', async () => {
        const adapter = makeAdapter();
        adapter.delStateAsync = sinon.stub().rejects(new Error('not found'));
        adapter.delObjectAsync = sinon.stub().resolves();

        await removeCatalogEntry(adapter, 'javascript.0.x');

        expect(adapter.delObjectAsync.calledOnce).to.equal(true);
    });

    it('accepts a valid derivedMetricRole/derivedMetricGroupId pair', () => {
        const entry = validateCatalogEntry({
            sourceId: 'x', category: 'generation_pv',
            derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1',
        });
        expect(entry.derivedMetricRole).to.equal('pv_generation');
    });

    it('rejects an unknown derivedMetricRole', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'generation_pv',
            derivedMetricRole: 'not-a-role', derivedMetricGroupId: 'pv-1',
        })).to.throw('derivedMetricRole');
    });

    it('rejects derivedMetricRole without derivedMetricGroupId and vice versa', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'generation_pv', derivedMetricRole: 'pv_generation',
        })).to.throw('derivedMetricRole');
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'generation_pv', derivedMetricGroupId: 'pv-1',
        })).to.throw('derivedMetricGroupId');
    });

    it('rejects an oversized derivedMetricGroupId', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'generation_pv',
            derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'x'.repeat(129),
        })).to.throw('derivedMetricGroupId');
    });

    it('accepts a valid hvacRole on a boolean_state entry', () => {
        const entry = validateCatalogEntry({
            sourceId: 'x', category: 'device_usage', valueKind: 'boolean_state', hvacRole: 'window',
        });
        expect(entry.hvacRole).to.equal('window');
    });

    it('rejects an unknown hvacRole', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'device_usage', valueKind: 'boolean_state', hvacRole: 'nope',
        })).to.throw('hvacRole');
    });

    it('rejects hvacRole on a non-boolean_state entry', () => {
        expect(() => validateCatalogEntry({
            sourceId: 'x', category: 'device_usage', valueKind: 'gauge', hvacRole: 'window',
        })).to.throw('hvacRole');
    });
});
