// test/unit/scheduler.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { startProactiveScheduler } = require('../../lib/scheduler');

describe('startProactiveScheduler', () => {
    it('invokes runCheck after each interval and stops when the returned function is called', () => {
        const clock = sinon.useFakeTimers();
        const runCheck = sinon.stub().resolves();
        const adapter = { log: { error: sinon.stub() } };

        const stop = startProactiveScheduler(adapter, { intervalMs: 1000, runCheck });

        clock.tick(1000);
        expect(runCheck.callCount).to.equal(1);

        clock.tick(1000);
        expect(runCheck.callCount).to.equal(2);

        stop();
        clock.tick(5000);
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
});
