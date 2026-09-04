// test/unit/hvacCorrelation.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { computeOverlapMs } = require('../../lib/hvacCorrelation');

function loadHvacCorrelationWithHistory(getHistory) {
    return proxyquire('../../lib/hvacCorrelation', {
        './dataAccess': { getHistory },
        './periodValue': {
            resolvePeriod: () => ({ start: 0, end: 86400000 }),
        },
    });
}

describe('computeOverlapMs', () => {
    it('sums the duration where both boolean streams are true', () => {
        const windowPoints = [{ ts: 100, val: true }, { ts: 500, val: false }];
        const heatingPoints = [{ ts: 300, val: true }, { ts: 700, val: false }];

        const overlap = computeOverlapMs(windowPoints, heatingPoints, 0, 1000);

        expect(overlap).to.equal(200);
    });

    it('returns 0 when the streams never overlap', () => {
        const windowPoints = [{ ts: 100, val: true }, { ts: 200, val: false }];
        const heatingPoints = [{ ts: 300, val: true }, { ts: 400, val: false }];

        expect(computeOverlapMs(windowPoints, heatingPoints, 0, 1000)).to.equal(0);
    });

    it('counts overlap through to periodEnd when a stream is still true', () => {
        const windowPoints = [{ ts: 100, val: true }];
        const heatingPoints = [{ ts: 200, val: true }];

        expect(computeOverlapMs(windowPoints, heatingPoints, 0, 1000)).to.equal(800);
    });
});

describe('findHvacCorrelationCandidates', () => {
    function windowEntry(overrides = {}) {
        return { sourceId: 'contact.0.window', historyInstance: 'history.0', description: 'Fenster Wohnzimmer', room: 'Wohnzimmer', valueKind: 'boolean_state', hvacRole: 'window', active: true, ...overrides };
    }
    function heatingEntry(overrides = {}) {
        return { sourceId: 'relay.0.heating', historyInstance: 'history.0', description: 'Heizungsventil Wohnzimmer', room: 'Wohnzimmer', valueKind: 'boolean_state', hvacRole: 'heating', active: true, ...overrides };
    }

    it('reports a candidate when the overlap meets the threshold', async () => {
        const getHistory = sinon.stub();
        getHistory.onCall(0).resolves([{ ts: 0, val: true }]);
        getHistory.onCall(1).resolves([{ ts: 0, val: true }]);
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);
        const now = 10 * 24 * 3600 * 1000;

        const result = await findHvacCorrelationCandidates({}, [windowEntry(), heatingEntry()], now);

        expect(result.candidates).to.have.lengthOf(1);
        expect(result.candidates[0]).to.include({
            room: 'Wohnzimmer',
            reason: 'window_open_while_heating',
            windowSourceId: 'contact.0.window',
            heatingSourceId: 'relay.0.heating',
        });
        expect(result.candidates[0].overlapMs).to.equal(86400000);
        expect(result.failedCount).to.equal(0);
    });

    it('reports no candidate below the 15-minute threshold', async () => {
        const getHistory = sinon.stub();
        getHistory.onCall(0).resolves([{ ts: 0, val: true }, { ts: 60000, val: false }]);
        getHistory.onCall(1).resolves([{ ts: 0, val: true }]);
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);

        const result = await findHvacCorrelationCandidates({}, [windowEntry(), heatingEntry()], 10 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
    });

    it('skips rooms with more than one window or heating candidate', async () => {
        const getHistory = sinon.stub().resolves([]);
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);
        const entries = [windowEntry(), windowEntry({ sourceId: 'contact.0.window2' }), heatingEntry()];

        const result = await findHvacCorrelationCandidates({}, entries, 10 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(getHistory.called).to.equal(false);
    });

    it('ignores entries without hvacRole, inactive entries, and entries without a room', async () => {
        const getHistory = sinon.stub().resolves([]);
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);
        const entries = [
            windowEntry({ room: '' }),
            heatingEntry({ active: false }),
            { sourceId: 'other', room: 'Wohnzimmer', valueKind: 'boolean_state' },
        ];

        const result = await findHvacCorrelationCandidates({}, entries, 10 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
    });

    it('isolates history failures per room without aborting other rooms', async () => {
        const getHistory = sinon.stub().rejects(new Error('History offline'));
        const warn = sinon.stub();
        const { findHvacCorrelationCandidates } = loadHvacCorrelationWithHistory(getHistory);

        const result = await findHvacCorrelationCandidates({ log: { warn } }, [windowEntry(), heatingEntry()], 10 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(result.failedCount).to.equal(1);
        expect(warn.calledOnce).to.equal(true);
    });
});
