const { expect } = require('chai');
const sinon = require('sinon');
const {
    ensureHealthState,
    recordHistoryFailure,
    recordHistorySuccess,
    isHistoryAvailable,
    consumeFailureReports,
    STATE_ID,
} = require('../../lib/historyHealth');

function makeAdapter() {
    let value = null;
    return {
        setObjectNotExistsAsync: sinon.stub().resolves(),
        getStateAsync: sinon.stub().callsFake(async () => (value ? { val: value } : null)),
        setStateAsync: sinon.stub().callsFake(async (_id, state) => {
            value = state.val;
        }),
    };
}

describe('historyHealth', () => {
    it('creates the persistent health state', async () => {
        const adapter = makeAdapter();
        await ensureHealthState(adapter);
        expect(adapter.setObjectNotExistsAsync.calledOnceWith(STATE_ID)).to.equal(true);
    });

    it('reports after three failures and schedules 12/24/48 hour retries', async () => {
        const adapter = makeAdapter();
        const clock = sinon.useFakeTimers(new Date('2026-09-03T12:00:00Z').getTime());
        try {
            expect((await recordHistoryFailure(adapter, 'history.0', new Error('offline'))).shouldReport).to.equal(false);
            expect(await isHistoryAvailable(adapter, 'history.0')).to.equal(false);
            clock.tick(12 * 3600 * 1000);
            expect(await isHistoryAvailable(adapter, 'history.0')).to.equal(true);
            await recordHistoryFailure(adapter, 'history.0', new Error('offline'));
            expect(await isHistoryAvailable(adapter, 'history.0')).to.equal(false);
            clock.tick(24 * 3600 * 1000);
            expect(await isHistoryAvailable(adapter, 'history.0')).to.equal(true);
            expect((await recordHistoryFailure(adapter, 'history.0', new Error('offline'))).shouldReport).to.equal(true);
            expect(await isHistoryAvailable(adapter, 'history.0')).to.equal(false);
            clock.tick(48 * 3600 * 1000);
            expect(await isHistoryAvailable(adapter, 'history.0')).to.equal(true);
            await recordHistoryFailure(adapter, 'history.0', new Error('offline'));
            expect(await isHistoryAvailable(adapter, 'history.0')).to.equal(false);
        } finally {
            clock.restore();
        }
    });

    it('delivers a failure report once and clears the state after recovery', async () => {
        const adapter = makeAdapter();
        await recordHistoryFailure(adapter, 'history.0', new Error('offline'));
        await recordHistoryFailure(adapter, 'history.0', new Error('offline'));
        await recordHistoryFailure(adapter, 'history.0', new Error('offline'));
        expect(await consumeFailureReports(adapter)).to.deep.equal([{ historyInstance: 'history.0', error: 'offline' }]);
        expect(await consumeFailureReports(adapter)).to.deep.equal([]);
        await recordHistorySuccess(adapter, 'history.0');
        expect(await isHistoryAvailable(adapter, 'history.0')).to.equal(true);
    });
});
