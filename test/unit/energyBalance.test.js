// test/unit/energyBalance.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadEnergyBalanceWithStubs({ computePeriodValue, resolvePeriod, detectDailyAggregateAnomaly }) {
    return proxyquire('../../lib/energyBalance', {
        './periodValue': {
            computePeriodValue,
            resolvePeriod: resolvePeriod || ((period) => ({ start: period.dayOffset, end: period.dayOffset + 1 })),
        },
        './anomalyDetector': {
            detectDailyAggregateAnomaly: detectDailyAggregateAnomaly || require('../../lib/anomalyDetector').detectDailyAggregateAnomaly,
        },
    });
}

function makeGroup(overrides = {}) {
    const base = {
        historyInstance: 'history.0',
        valueKind: 'cumulative_total',
        derivedMetricGroupId: 'energy-1',
        active: true,
        dataCompleteness: 'complete',
    };
    return [
        { ...base, sourceId: 'pv.0.total', description: 'PV-Erzeugung', derivedMetricRole: 'pv_generation' },
        { ...base, sourceId: 'grid.0.import', description: 'Netzbezug', derivedMetricRole: 'grid_import' },
        { ...base, sourceId: 'grid.0.feedin', description: 'Netzeinspeisung', derivedMetricRole: 'grid_feed_in' },
        { ...base, sourceId: 'meter.0.consumption', description: 'Verbrauch', derivedMetricRole: 'consumption' },
    ].map((entry) => ({ ...entry, ...(overrides[entry.derivedMetricRole] || {}) }));
}

describe('findEnergyBalanceCandidates', () => {
    it('reports a deviation candidate when the residual is a statistical outlier', async () => {
        const computePeriodValue = sinon.stub();
        for (let day = 0; day < 7; day++) {
            computePeriodValue.onCall(day * 4 + 0).resolves({ total: 100 });
            computePeriodValue.onCall(day * 4 + 1).resolves({ total: 0 });
            computePeriodValue.onCall(day * 4 + 2).resolves({ total: 50 });
            computePeriodValue.onCall(day * 4 + 3).resolves({ total: 50 });
        }
        computePeriodValue.onCall(28).resolves({ total: 100 });
        computePeriodValue.onCall(29).resolves({ total: 0 });
        computePeriodValue.onCall(30).resolves({ total: 50 });
        computePeriodValue.onCall(31).resolves({ total: 5 });

        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, makeGroup(), 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.have.lengthOf(1);
        expect(result.candidates[0]).to.include({ groupId: 'energy-1', reason: 'energy_balance_deviation', hasBattery: false });
        expect(result.candidates[0].currentResidual).to.equal(45);
        expect(result.failedCount).to.equal(0);
    });

    it('does not flag a stable balance', async () => {
        const computePeriodValue = sinon.stub();
        computePeriodValue.callsFake((adapter, entry) => {
            if (entry.derivedMetricRole === 'pv_generation') return Promise.resolve({ total: 100 });
            if (entry.derivedMetricRole === 'grid_import') return Promise.resolve({ total: 0 });
            if (entry.derivedMetricRole === 'grid_feed_in') return Promise.resolve({ total: 50 });
            return Promise.resolve({ total: 50 });
        });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, makeGroup(), 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
    });

    it('treats missing battery roles as zero and reports hasBattery: false', async () => {
        const computePeriodValue = sinon.stub().resolves({ total: 10 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        await findEnergyBalanceCandidates({}, makeGroup(), 30 * 24 * 3600 * 1000);

        expect(computePeriodValue.callCount).to.equal(32);
    });

    it('includes battery roles in the residual when both are present', async () => {
        const entries = makeGroup().concat([
            { sourceId: 'battery.0.charge', historyInstance: 'history.0', valueKind: 'cumulative_total', derivedMetricGroupId: 'energy-1', derivedMetricRole: 'battery_charge', active: true, dataCompleteness: 'complete', description: 'Batterieladung' },
            { sourceId: 'battery.0.discharge', historyInstance: 'history.0', valueKind: 'cumulative_total', derivedMetricGroupId: 'energy-1', derivedMetricRole: 'battery_discharge', active: true, dataCompleteness: 'complete', description: 'Batterieentladung' },
        ]);
        const computePeriodValue = sinon.stub().resolves({ total: 0 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        await findEnergyBalanceCandidates({}, entries, 30 * 24 * 3600 * 1000);

        expect(computePeriodValue.callCount).to.equal(48);
    });

    it('skips a group with only one of the two battery roles', async () => {
        const entries = makeGroup().concat([
            { sourceId: 'battery.0.charge', historyInstance: 'history.0', valueKind: 'cumulative_total', derivedMetricGroupId: 'energy-1', derivedMetricRole: 'battery_charge', active: true, dataCompleteness: 'complete', description: 'Batterieladung' },
        ]);
        const computePeriodValue = sinon.stub().resolves({ total: 0 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, entries, 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(computePeriodValue.called).to.equal(false);
    });

    it('skips a group missing a required role', async () => {
        const entries = makeGroup().filter((entry) => entry.derivedMetricRole !== 'consumption');
        const computePeriodValue = sinon.stub().resolves({ total: 0 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, entries, 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(computePeriodValue.called).to.equal(false);
    });

    it('skips a group with a duplicated required role', async () => {
        const entries = makeGroup().concat([{ sourceId: 'pv.1.total', historyInstance: 'history.0', valueKind: 'cumulative_total', derivedMetricGroupId: 'energy-1', derivedMetricRole: 'pv_generation', active: true, dataCompleteness: 'complete', description: 'Zweite PV' }]);
        const computePeriodValue = sinon.stub().resolves({ total: 0 });
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({}, entries, 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
    });

    it('isolates history failures per group without aborting other groups', async () => {
        const warn = sinon.stub();
        const computePeriodValue = sinon.stub().rejects(new Error('History offline'));
        const { findEnergyBalanceCandidates } = loadEnergyBalanceWithStubs({ computePeriodValue });

        const result = await findEnergyBalanceCandidates({ log: { warn } }, makeGroup(), 30 * 24 * 3600 * 1000);

        expect(result.candidates).to.deep.equal([]);
        expect(result.failedCount).to.equal(1);
        expect(warn.calledOnce).to.equal(true);
    });
});
