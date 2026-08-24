const { expect } = require('chai');
const sinon = require('sinon');
const { getHistory, compareTimeframes } = require('../../lib/dataAccess');

describe('dataAccess', () => {
    it('getHistory calls sendToAsync with the standard getHistory message shape', async () => {
        const adapter = {
            sendToAsync: sinon.stub().resolves({ result: [{ ts: 1, val: 10 }, { ts: 2, val: 20 }] }),
        };

        const points = await getHistory(adapter, 'influxdb.0', 'javascript.0.x', 100, 200, 'average');

        expect(adapter.sendToAsync.calledOnceWith('influxdb.0', 'getHistory', {
            id: 'javascript.0.x',
            options: { start: 100, end: 200, aggregate: 'average' },
        })).to.equal(true);
        expect(points).to.deep.equal([{ ts: 1, val: 10 }, { ts: 2, val: 20 }]);
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
