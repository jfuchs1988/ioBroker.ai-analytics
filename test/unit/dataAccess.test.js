const { expect } = require('chai');
const sinon = require('sinon');
const { getHistory, compareTimeframes, computeIntervalCount } = require('../../lib/dataAccess');

describe('computeIntervalCount', () => {
    const HOUR = 3600 * 1000;
    const DAY = 24 * HOUR;

    it('uses hourly buckets for ranges up to 3 days', () => {
        expect(computeIntervalCount(0, DAY)).to.equal(24);
    });

    it('uses daily buckets for ranges beyond 3 days up to 90 days', () => {
        expect(computeIntervalCount(0, 10 * DAY)).to.equal(10);
    });

    it('caps at 500 for very long ranges', () => {
        expect(computeIntervalCount(0, 20 * 365 * DAY)).to.equal(500);
    });

    it('returns at least 1 for a zero-length range', () => {
        expect(computeIntervalCount(1000, 1000)).to.equal(1);
    });
});

describe('dataAccess', () => {
    it('getHistory calls sendToAsync with the standard getHistory message shape, including an explicit count', async () => {
        const adapter = {
            sendToAsync: sinon.stub().resolves({ result: [{ ts: 1, val: 10 }, { ts: 2, val: 20 }] }),
        };

        const points = await getHistory(adapter, 'influxdb.0', 'javascript.0.x', 100, 200, 'average');

        expect(adapter.sendToAsync.calledOnceWith('influxdb.0', 'getHistory', {
            id: 'javascript.0.x',
            options: { start: 100, end: 200, aggregate: 'average', count: 1 },
        })).to.equal(true);
        expect(points).to.deep.equal([{ ts: 1, val: 10 }, { ts: 2, val: 20 }]);
    });

    it('getHistory passes a computed bucket count for a bucketed aggregate spanning a full day', async () => {
        const adapter = { sendToAsync: sinon.stub().resolves({ result: [] }) };
        const oneDayMs = 24 * 3600 * 1000;

        await getHistory(adapter, 'influxdb.0', 'sun2000.0.x', 0, oneDayMs, 'average');

        expect(adapter.sendToAsync.calledOnceWith('influxdb.0', 'getHistory', {
            id: 'sun2000.0.x',
            options: { start: 0, end: oneDayMs, aggregate: 'average', count: 24 },
        })).to.equal(true);
    });

    it('getHistory passes a fixed safe count (2000) for raw aggregates (none/onchange)', async () => {
        const adapter = { sendToAsync: sinon.stub().resolves({ result: [] }) };

        await getHistory(adapter, 'influxdb.0', 'shelly.0.x', 0, 1000, 'none');

        expect(adapter.sendToAsync.calledOnceWith('influxdb.0', 'getHistory', {
            id: 'shelly.0.x',
            options: { start: 0, end: 1000, aggregate: 'none', count: 2000 },
        })).to.equal(true);
    });

    it('warns when a raw (none/onchange) result hits the count limit, suggesting truncation', async () => {
        const filledResult = Array.from({ length: 2000 }, (unused, i) => ({ ts: i, val: i }));
        const warnStub = sinon.stub();
        const adapter = { log: { warn: warnStub }, sendToAsync: sinon.stub().resolves({ result: filledResult }) };

        await getHistory(adapter, 'influxdb.0', 'shelly.0.x', 0, 1000, 'none');

        expect(warnStub.calledOnce).to.equal(true);
        expect(warnStub.firstCall.args[0]).to.include('shelly.0.x');
    });

    it('does not warn when a raw result is below the count limit', async () => {
        const partialResult = [{ ts: 1, val: 1 }];
        const warnStub = sinon.stub();
        const adapter = { log: { warn: warnStub }, sendToAsync: sinon.stub().resolves({ result: partialResult }) };

        await getHistory(adapter, 'influxdb.0', 'shelly.0.x', 0, 1000, 'none');

        expect(warnStub.called).to.equal(false);
    });

    it('does not warn for bucketed aggregates even when the result length equals count', async () => {
        const oneDayMs = 24 * 3600 * 1000;
        const bucketedResult = Array.from({ length: 24 }, (unused, i) => ({ ts: i, val: i }));
        const warnStub = sinon.stub();
        const adapter = { log: { warn: warnStub }, sendToAsync: sinon.stub().resolves({ result: bucketedResult }) };

        await getHistory(adapter, 'influxdb.0', 'sun2000.0.x', 0, oneDayMs, 'average');

        expect(warnStub.called).to.equal(false);
    });

    it('does not throw when adapter.log is absent, even when the raw result hits the count limit', async () => {
        const filledResult = Array.from({ length: 2000 }, (unused, i) => ({ ts: i, val: i }));
        const adapter = { sendToAsync: sinon.stub().resolves({ result: filledResult }) };

        let threw = false;
        try {
            await getHistory(adapter, 'influxdb.0', 'shelly.0.x', 0, 1000, 'none');
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(false);
    });

    it('getHistory throws when the response has no result array', async () => {
        const adapter = { sendToAsync: sinon.stub().resolves({}) };
        let threw = false;
        try {
            await getHistory(adapter, 'influxdb.0', 'javascript.0.x', 100, 200);
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });

    it('getHistory logs to silly when adapter.log.silly is provided', async () => {
        const sillyStub = sinon.stub();
        const adapter = {
            log: { silly: sillyStub },
            sendToAsync: sinon.stub().resolves({ result: [{ ts: 1, val: 10 }] }),
        };

        await getHistory(adapter, 'influxdb.0', 'javascript.0.x', 100, 200, 'average');

        expect(sillyStub.calledOnce).to.equal(true);
        const message = sillyStub.firstCall.args[0];
        expect(message).to.include('influxdb.0');
        expect(message).to.include('javascript.0.x');
        expect(message).to.include('average');
    });

    it('getHistory does not throw when adapter.log is absent', async () => {
        const adapter = {
            sendToAsync: sinon.stub().resolves({ result: [{ ts: 1, val: 10 }] }),
        };

        let threw = false;
        try {
            await getHistory(adapter, 'influxdb.0', 'javascript.0.x', 100, 200, 'average');
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(false);
    });

    it('compareTimeframes computes sum/avg/delta for two periods', async () => {
        const adapter = {
            sendToAsync: sinon
                .stub()
                .onFirstCall()
                .resolves({ result: [{ ts: 1, val: 10 }, { ts: 2, val: 10 }] })
                .onSecondCall()
                .resolves({ result: [{ ts: 3, val: 30 }] }),
        };

        const comparison = await compareTimeframes(
            adapter,
            'influxdb.0',
            'javascript.0.x',
            { start: 0, end: 100 },
            { start: 100, end: 200 }
        );

        expect(comparison).to.deep.equal({
            periodA: { start: 0, end: 100, sum: 20, avg: 10, count: 2 },
            periodB: { start: 100, end: 200, sum: 30, avg: 30, count: 1 },
            deltaSum: 10,
            deltaAvg: 20,
        });
    });
});
