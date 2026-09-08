const { expect } = require('chai');
const proxyquire = require('proxyquire');

function load(getHistory) {
    return proxyquire('../../lib/periodValue', {
        './dataAccess': { getHistory },
        './promptContext': {
            getLocalTimeZone: () => 'UTC',
            getLocalDayBoundaries: value => ({ start: value, end: value + 86400000 }),
        },
    });
}

describe('periodValue', () => {
    it('counts cumulative counter increments across a reset', async () => {
        const getHistory = async (_adapter, _instance, _source, start) => start < 0
            ? [{ ts: -1, val: 100 }]
            : [{ ts: 1, val: 110 }, { ts: 2, val: 10 }, { ts: 3, val: 30 }];
        const { computePeriodValue } = load(getHistory);

        const result = await computePeriodValue({}, { historyInstance: 'history.0', sourceId: 'meter.0.total', valueKind: 'cumulative_total' }, { start: 0, end: 10 });

        expect(result).to.deep.equal({ total: 40 });
    });

    it('uses the state before the period for an already active boolean', async () => {
        const getHistory = async () => [{ ts: -1, val: 'true' }, { ts: 5, val: 'false' }];
        const { computePeriodValue } = load(getHistory);

        const result = await computePeriodValue({}, { historyInstance: 'history.0', sourceId: 'switch.0.state', valueKind: 'boolean_state' }, { start: 0, end: 10 });

        expect(result).to.deep.equal({ onDurationMs: 5, switchCount: 1 });
    });
});
