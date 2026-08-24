const { expect } = require('chai');
const sinon = require('sinon');
const { ensureBridgeState, parseRequest, handleBridgeStateChange, BRIDGE_STATE } = require('../../lib/adminBridge');

function makeAdapter(overrides = {}) {
    return {
        namespace: 'ai-analytics.0',
        setObjectNotExistsAsync: sinon.stub().resolves(),
        setStateAsync: sinon.stub().resolves(),
        log: {
            warn: sinon.stub(),
            silly: sinon.stub(),
            error: sinon.stub(),
        },
        ...overrides,
    };
}

describe('adminBridge', () => {
    describe('ensureBridgeState', () => {
        it('creates the bridge state with write enabled', async () => {
            const adapter = makeAdapter();
            await ensureBridgeState(adapter);
            expect(adapter.setObjectNotExistsAsync.calledOnce).to.equal(true);
            const [id, obj] = adapter.setObjectNotExistsAsync.firstCall.args;
            expect(id).to.equal(BRIDGE_STATE);
            expect(obj.common.write).to.equal(true);
            expect(obj.common.type).to.equal('string');
        });
    });

    describe('parseRequest', () => {
        it('accepts a valid request written with ack=false', () => {
            const adapter = makeAdapter();
            const state = { val: JSON.stringify({ id: 'tab-1', command: 'listCatalogEntries', message: {} }), ack: false };
            const request = parseRequest(adapter, `ai-analytics.0.${BRIDGE_STATE}`, state);
            expect(request).to.deep.equal({ id: 'tab-1', command: 'listCatalogEntries', message: {} });
        });

        it('ignores changes to other states', () => {
            const adapter = makeAdapter();
            const state = { val: JSON.stringify({ id: 'tab-1', command: 'listCatalogEntries' }), ack: false };
            expect(parseRequest(adapter, 'ai-analytics.0.other.state', state)).to.equal(null);
        });

        it('ignores its own responses (ack=true)', () => {
            const adapter = makeAdapter();
            const state = { val: JSON.stringify({ id: 'tab-1', ok: true, result: {} }), ack: true };
            expect(parseRequest(adapter, `ai-analytics.0.${BRIDGE_STATE}`, state)).to.equal(null);
        });

        it('ignores non-string values', () => {
            const adapter = makeAdapter();
            expect(parseRequest(adapter, `ai-analytics.0.${BRIDGE_STATE}`, { val: 42, ack: false })).to.equal(null);
            expect(parseRequest(adapter, `ai-analytics.0.${BRIDGE_STATE}`, null)).to.equal(null);
        });

        it('ignores invalid JSON with a warning', () => {
            const adapter = makeAdapter();
            const request = parseRequest(adapter, `ai-analytics.0.${BRIDGE_STATE}`, { val: '{not json', ack: false });
            expect(request).to.equal(null);
            expect(adapter.log.warn.calledOnce).to.equal(true);
        });

        it('ignores requests without an id', () => {
            const adapter = makeAdapter();
            const request = parseRequest(adapter, `ai-analytics.0.${BRIDGE_STATE}`, {
                val: JSON.stringify({ command: 'listCatalogEntries' }),
                ack: false,
            });
            expect(request).to.equal(null);
            expect(adapter.log.warn.calledOnce).to.equal(true);
        });

        it('ignores unknown commands', () => {
            const adapter = makeAdapter();
            const request = parseRequest(adapter, `ai-analytics.0.${BRIDGE_STATE}`, {
                val: JSON.stringify({ id: 'tab-1', command: 'deleteEverything' }),
                ack: false,
            });
            expect(request).to.equal(null);
            expect(adapter.log.warn.calledOnce).to.equal(true);
            expect(adapter.log.warn.firstCall.args[0]).to.include('deleteEverything');
        });
    });

    describe('handleBridgeStateChange', () => {
        it('dispatches a valid request and writes an ok response with ack=true', async () => {
            const adapter = makeAdapter();
            const dispatch = sinon.stub().resolves({ entries: [{ sourceId: 'a' }] });
            const state = {
                val: JSON.stringify({ id: 'tab-1', command: 'listCatalogEntries', message: {} }),
                ack: false,
            };

            const handled = await handleBridgeStateChange(adapter, `ai-analytics.0.${BRIDGE_STATE}`, state, dispatch);

            expect(handled).to.equal(true);
            expect(dispatch.calledOnceWithExactly('listCatalogEntries', {})).to.equal(true);
            expect(adapter.setStateAsync.calledOnce).to.equal(true);
            const [id, written] = adapter.setStateAsync.firstCall.args;
            expect(id).to.equal(BRIDGE_STATE);
            expect(written.ack).to.equal(true);
            expect(JSON.parse(written.val)).to.deep.equal({
                id: 'tab-1',
                ok: true,
                result: { entries: [{ sourceId: 'a' }] },
            });
        });

        it('writes an error response when the dispatch throws', async () => {
            const adapter = makeAdapter();
            const dispatch = sinon.stub().rejects(new Error('Tagesbudget an Tokens ist erschoepft.'));
            const state = {
                val: JSON.stringify({ id: 'tab-2', command: 'chatQuestion', message: { text: 'Wie hoch?' } }),
                ack: false,
            };

            await handleBridgeStateChange(adapter, `ai-analytics.0.${BRIDGE_STATE}`, state, dispatch);

            const [, written] = adapter.setStateAsync.firstCall.args;
            expect(JSON.parse(written.val)).to.deep.equal({
                id: 'tab-2',
                ok: false,
                error: 'Tagesbudget an Tokens ist erschoepft.',
            });
        });

        it('stringifies non-error throwables', async () => {
            const adapter = makeAdapter();
            const dispatch = sinon.stub().rejects('kaputt');
            const state = { val: JSON.stringify({ id: 'tab-3', command: 'runDiscoveryNow' }), ack: false };

            await handleBridgeStateChange(adapter, `ai-analytics.0.${BRIDGE_STATE}`, state, dispatch);

            const [, written] = adapter.setStateAsync.firstCall.args;
            expect(JSON.parse(written.val).error).to.equal('kaputt');
        });

        it('returns false and does nothing for non-request changes', async () => {
            const adapter = makeAdapter();
            const dispatch = sinon.stub().resolves({});
            const handled = await handleBridgeStateChange(
                adapter,
                `ai-analytics.0.${BRIDGE_STATE}`,
                { val: '{"id":"tab-4","ok":true,"result":{}}', ack: true },
                dispatch
            );
            expect(handled).to.equal(false);
            expect(dispatch.notCalled).to.equal(true);
            expect(adapter.setStateAsync.notCalled).to.equal(true);
        });
    });
});
