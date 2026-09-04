const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const {
    median,
    medianAbsoluteDeviation,
    detectSeriesAnomaly,
    detectDailyAggregateAnomaly,
    isEligibleCatalogEntry,
} = require('../../lib/anomalyDetector');

function loadDetectorWithHistory(getHistory) {
    // '@global': true, damit auch der ueber ./periodValue transitiv geladene
    // './dataAccess' denselben Stub sieht (Phase-2-Pfade fuer Zaehler/Boolean).
    return proxyquire('../../lib/anomalyDetector', { './dataAccess': { getHistory, '@global': true } });
}

function loadDetectorWithPeriodValue({ computePeriodValue, resolvePeriod }) {
    return proxyquire('../../lib/anomalyDetector', {
        './periodValue': {
            computePeriodValue,
            resolvePeriod: resolvePeriod || ((period, now) => ({ start: now + period.dayOffset * 86400000, end: now + (period.dayOffset + 1) * 86400000 })),
        },
    });
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

describe('detectDailyAggregateAnomaly', () => {
    it('does not flag a current value within the baseline spread', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: 10,
            baselineValues: [9, 10, 11, 10, 9, 10, 11],
            dataCompleteness: 'complete',
        });

        expect(result).to.equal(null);
    });

    it('flags a robust outlier against the daily baseline', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: 40,
            baselineValues: [9, 10, 11, 10, 9, 10, 11],
            dataCompleteness: 'complete',
        });

        expect(result).to.include({ reason: 'deviation', baselineMedian: 10, currentValue: 40 });
        expect(result.robustZ).to.be.at.least(3.5);
    });

    it('flags a missing current value as missing_data, not a deviation', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: null,
            baselineValues: [9, 10, 11, 10, 9, 10, 11],
            dataCompleteness: 'complete',
        });

        expect(result).to.include({ reason: 'missing_data' });
        expect(result.currentCount).to.equal(0);
    });

    it('flags stale data as missing_data even with a numeric current value', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: 10,
            baselineValues: [9, 10, 11, 10, 9, 10, 11],
            dataCompleteness: 'stale',
        });

        expect(result).to.include({ reason: 'missing_data' });
    });

    it('returns null when the baseline has too few days', () => {
        const result = detectDailyAggregateAnomaly({
            currentValue: 40,
            baselineValues: [9, 10],
            dataCompleteness: 'complete',
        });

        expect(result).to.equal(null);
    });
});

describe('isEligibleCatalogEntry', () => {
    it('accepts active, non-ignored gauge and daily-aggregate entries', () => {
        expect(isEligibleCatalogEntry({ active: true, ignored: false, valueKind: 'gauge' })).to.equal(true);
        expect(isEligibleCatalogEntry({ active: false, valueKind: 'gauge' })).to.equal(false);
        expect(isEligibleCatalogEntry({ ignored: true, valueKind: 'gauge' })).to.equal(false);
        expect(isEligibleCatalogEntry({ active: true, valueKind: 'daily_reset_counter' })).to.equal(true);
        expect(isEligibleCatalogEntry({ active: true, valueKind: 'cumulative_total' })).to.equal(true);
        expect(isEligibleCatalogEntry({ active: true, valueKind: 'event_count' })).to.equal(true);
        expect(isEligibleCatalogEntry({ active: true, valueKind: 'boolean_state' })).to.equal(true);
        expect(isEligibleCatalogEntry({ active: true, valueKind: undefined })).to.equal(false);
        expect(isEligibleCatalogEntry({ active: false, valueKind: 'boolean_state' })).to.equal(false);
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
        expect(result[0]).to.include({ sourceId: 'sensor.0.power', description: 'Leistung', reason: 'deviation', valueKind: 'gauge' });
        expect(getHistory.calledTwice).to.equal(true);
        expect(getHistory.firstCall.args).to.deep.equal([{}, 'history.0', 'sensor.0.power', now - 24 * 3600 * 1000, now, 'average']);
    });

    it('isolates history failures for both gauge and daily-aggregate entries', async () => {
        const getHistory = sinon.stub().rejects(new Error('History offline'));
        const warn = sinon.stub();
        const { findAnomalyCandidates } = loadDetectorWithHistory(getHistory);

        const result = await findAnomalyCandidates({ log: { warn } }, [
            { sourceId: 'sensor.0.power', historyInstance: 'history.0', valueKind: 'gauge' },
            { sourceId: 'counter.0.total', historyInstance: 'history.0', valueKind: 'daily_reset_counter' },
        ], Date.now());

        expect(result).to.deep.equal([]);
        expect(result.failedCount).to.equal(2);
        expect(warn.calledTwice).to.equal(true);
    });

    it('flags a daily_reset_counter with an outlying day total', async () => {
        const now = 30 * 24 * 3600 * 1000;
        const computePeriodValue = sinon.stub();
        for (let i = 0; i < 7; i++) computePeriodValue.onCall(i).resolves({ total: 10 });
        computePeriodValue.onCall(7).resolves({ total: 40 });
        const { findAnomalyCandidates } = loadDetectorWithPeriodValue({ computePeriodValue });
        const entry = {
            sourceId: 'counter.0.total',
            historyInstance: 'history.0',
            description: 'Wasserzaehler',
            valueKind: 'daily_reset_counter',
            dataCompleteness: 'complete',
        };

        const result = await findAnomalyCandidates({}, [entry], now);

        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.include({
            sourceId: 'counter.0.total',
            valueKind: 'daily_reset_counter',
            reason: 'deviation',
            currentTotal: 40,
            baselineMedianTotal: 10,
        });
        expect(computePeriodValue.callCount).to.equal(8);
    });

    it('flags a boolean_state with an outlying on-duration', async () => {
        const now = 30 * 24 * 3600 * 1000;
        const computePeriodValue = sinon.stub();
        for (let i = 0; i < 7; i++) computePeriodValue.onCall(i).resolves({ onDurationMs: 3600000, switchCount: 4 });
        computePeriodValue.onCall(7).resolves({ onDurationMs: 20 * 3600000, switchCount: 2 });
        const { findAnomalyCandidates } = loadDetectorWithPeriodValue({ computePeriodValue });
        const entry = {
            sourceId: 'switch.0.pump',
            historyInstance: 'history.0',
            description: 'Pumpe',
            valueKind: 'boolean_state',
            dataCompleteness: 'complete',
        };

        const result = await findAnomalyCandidates({}, [entry], now);

        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.include({
            sourceId: 'switch.0.pump',
            valueKind: 'boolean_state',
            reason: 'deviation',
            currentOnDurationMs: 20 * 3600000,
        });
    });

    it('does not flag a steady daily_reset_counter', async () => {
        const now = 30 * 24 * 3600 * 1000;
        const computePeriodValue = sinon.stub().resolves({ total: 10 });
        const { findAnomalyCandidates } = loadDetectorWithPeriodValue({ computePeriodValue });
        const entry = {
            sourceId: 'counter.0.total',
            historyInstance: 'history.0',
            valueKind: 'daily_reset_counter',
            dataCompleteness: 'complete',
        };

        const result = await findAnomalyCandidates({}, [entry], now);

        expect(result).to.deep.equal([]);
    });

    it('reports progress before and after each eligible history sample', async () => {
        const getHistory = sinon.stub().resolves([{ val: 100 }, { val: 100 }, { val: 100 }]);
        const onProgress = sinon.stub().resolves();
        const { findAnomalyCandidates } = loadDetectorWithHistory(getHistory);

        await findAnomalyCandidates({}, [{ sourceId: 'sensor.0.power', historyInstance: 'history.0', valueKind: 'gauge' }], 100000, onProgress);

        expect(onProgress.callCount).to.equal(2);
        expect(onProgress.firstCall.args[0]).to.include({ processed: 0, total: 1, currentSourceId: 'sensor.0.power' });
        expect(onProgress.secondCall.args[0]).to.include({ processed: 1, total: 1, currentSourceId: 'sensor.0.power' });
    });
});
