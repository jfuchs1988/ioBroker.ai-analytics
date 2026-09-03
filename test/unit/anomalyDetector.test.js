const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const {
    median,
    medianAbsoluteDeviation,
    detectSeriesAnomaly,
    isEligibleCatalogEntry,
} = require('../../lib/anomalyDetector');

function loadDetectorWithHistory(getHistory) {
    return proxyquire('../../lib/anomalyDetector', { './dataAccess': { getHistory } });
}

describe('anomalyDetector statistics', () => {
    it('calculates median without mutating the input', () => {
        const values = [9, 1, 5, 3];

        expect(median(values)).to.equal(4);
        expect(values).to.deep.equal([9, 1, 5, 3]);
    });

    it('calculates the median absolute deviation around the median', () => {
        expect(medianAbsoluteDeviation([10, 11, 10, 9, 10])).to.equal(0);
        expect(medianAbsoluteDeviation([1, 2, 3, 4, 5])).to.equal(1);
    });

    it('does not flag a stable series', () => {
        const result = detectSeriesAnomaly({
            currentValues: [100, 101, 99, 100],
            baselineValues: [100, 100, 101, 99, 100, 100],
            dataCompleteness: 'complete',
        });

        expect(result).to.equal(null);
    });

    it('flags a robust outlier with compact evidence', () => {
        const result = detectSeriesAnomaly({
            currentValues: [249, 250, 251],
            baselineValues: [100, 101, 99, 100, 102, 98],
            dataCompleteness: 'complete',
        });

        expect(result).to.include({ reason: 'deviation', baselineMedian: 100, currentMedian: 250 });
        expect(result.robustZ).to.be.at.least(3.5);
        expect(result.relativeChange).to.equal(1.5);
    });

    it('flags a large relative change when the baseline has non-zero values', () => {
        const result = detectSeriesAnomaly({
            currentValues: [160, 161, 159],
            baselineValues: [100, 101, 99, 100],
            dataCompleteness: 'complete',
        });

        expect(result).to.include({ reason: 'deviation', baselineMedian: 100, currentMedian: 160 });
        expect(result.relativeChange).to.equal(0.6);
    });

    it('flags missing or stale current data separately', () => {
        const result = detectSeriesAnomaly({
            currentValues: [],
            baselineValues: [10, 11, 9, 10],
            dataCompleteness: 'stale',
        });

        expect(result).to.include({ reason: 'missing_data', dataCompleteness: 'stale' });
        expect(result.currentCount).to.equal(0);
    });

    it('returns insufficient_data when either series is too short', () => {
        const result = detectSeriesAnomaly({
            currentValues: [100],
            baselineValues: [100, 101, 99],
            dataCompleteness: 'complete',
        });

        expect(result).to.equal(null);
    });
});

describe('isEligibleCatalogEntry', () => {
    it('only accepts active, non-ignored gauge entries', () => {
        expect(isEligibleCatalogEntry({ active: true, ignored: false, valueKind: 'gauge' })).to.equal(true);
        expect(isEligibleCatalogEntry({ active: false, valueKind: 'gauge' })).to.equal(false);
        expect(isEligibleCatalogEntry({ ignored: true, valueKind: 'gauge' })).to.equal(false);
        expect(isEligibleCatalogEntry({ active: true, valueKind: 'daily_reset_counter' })).to.equal(false);
    });
});

describe('findAnomalyCandidates', () => {
    it('samples current and baseline windows and returns only anomalous entries', async () => {
        const getHistory = sinon.stub();
        getHistory.onFirstCall().resolves([{ val: 249 }, { val: 250 }, { val: 251 }]);
        getHistory.onSecondCall().resolves([{ val: 100 }, { val: 101 }, { val: 99 }, { val: 100 }]);
        const { findAnomalyCandidates } = loadDetectorWithHistory(getHistory);
        const entry = {
            sourceId: 'sensor.0.power',
            historyInstance: 'history.0',
            description: 'Leistung',
            valueKind: 'gauge',
            dataCompleteness: 'complete',
        };
        const now = 8 * 24 * 3600 * 1000;

        const result = await findAnomalyCandidates({}, [entry], now);

        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.include({ sourceId: 'sensor.0.power', description: 'Leistung', reason: 'deviation' });
        expect(getHistory.calledTwice).to.equal(true);
        expect(getHistory.firstCall.args).to.deep.equal([{}, 'history.0', 'sensor.0.power', now - 24 * 3600 * 1000, now, 'average']);
    });

    it('isolates history failures and excludes ineligible entries', async () => {
        const getHistory = sinon.stub().rejects(new Error('History offline'));
        const warn = sinon.stub();
        const { findAnomalyCandidates } = loadDetectorWithHistory(getHistory);

        const result = await findAnomalyCandidates({ log: { warn } }, [
            { sourceId: 'sensor.0.power', historyInstance: 'history.0', valueKind: 'gauge' },
            { sourceId: 'counter.0.total', historyInstance: 'history.0', valueKind: 'daily_reset_counter' },
        ], Date.now());

        expect(result).to.deep.equal([]);
        expect(getHistory.calledTwice).to.equal(true);
        expect(warn.calledOnce).to.equal(true);
    });
});
