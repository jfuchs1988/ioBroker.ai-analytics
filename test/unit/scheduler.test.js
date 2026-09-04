// test/unit/scheduler.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { startProactiveScheduler, MAX_TIMER_MS } = require('../../lib/scheduler');

describe('startProactiveScheduler', () => {
    it('invokes runCheck after each interval and stops when the returned function is called', async () => {
        const clock = sinon.useFakeTimers();
        const runCheck = sinon.stub().resolves();
        const adapter = { log: { error: sinon.stub() } };

        const stop = startProactiveScheduler(adapter, { intervalMs: 1000, runCheck });

        await clock.tickAsync(1000);
        expect(runCheck.callCount).to.equal(1);

        await clock.tickAsync(1000);
        expect(runCheck.callCount).to.equal(2);

        stop();
        await clock.tickAsync(5000);
        expect(runCheck.callCount).to.equal(2);

        clock.restore();
    });

    it('logs an error instead of throwing when runCheck rejects', async () => {
        const clock = sinon.useFakeTimers();
        const runCheck = sinon.stub().rejects(new Error('boom'));
        const adapter = { log: { error: sinon.stub() } };

        const stop = startProactiveScheduler(adapter, { intervalMs: 1000, runCheck });
        clock.tick(1000);
        await Promise.resolve();
        await Promise.resolve();

        expect(adapter.log.error.calledOnce).to.equal(true);
        expect(adapter.log.error.firstCall.args[0]).to.include('boom');

        stop();
        clock.restore();
    });

    it('does not overlap checks when one interval is still running', async () => {
        const clock = sinon.useFakeTimers();
        let finish;
        const runCheck = sinon.stub().returns(new Promise(resolve => { finish = resolve; }));
        const stop = startProactiveScheduler({ log: { error: sinon.stub() } }, { intervalMs: 1000, runCheck });

        await clock.tickAsync(3000);
        expect(runCheck.calledOnce).to.equal(true);
        finish();
        await Promise.resolve();
        await clock.tickAsync(1000);
        expect(runCheck.calledTwice).to.equal(true);

        stop();
        clock.restore();
    });

    it('rejects unsafe timer intervals', () => {
        const adapter = { log: { error: sinon.stub() } };
        expect(() => startProactiveScheduler(adapter, { intervalMs: MAX_TIMER_MS + 1, runCheck: async () => {} })).to.throw(RangeError);
    });
});
