const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { classifyFromMetadata, detectPatternFromSamples, VALUE_KINDS } = require('../../lib/valueKindClassifier');

function loadClassifierWithStubs({ getHistory }) {
    return proxyquire('../../lib/valueKindClassifier', {
        './dataAccess': { getHistory },
    });
}

describe('VALUE_KINDS', () => {
    it('lists exactly the five defined value kinds', () => {
        expect(VALUE_KINDS).to.deep.equal([
            'gauge',
            'boolean_state',
            'daily_reset_counter',
            'cumulative_total',
            'event_count',
        ]);
    });
});

describe('classifyFromMetadata', () => {
    it('classifies boolean-typed objects as boolean_state with high confidence', () => {
        const obj = { id: 'shelly.0.relay', common: { type: 'boolean', name: 'Relais', role: 'switch' } };
        expect(classifyFromMetadata(obj)).to.deep.equal({
            valueKind: 'boolean_state',
            valueKindConfidence: 'high',
            valueKindSource: 'metadata',
        });
    });

    it('guesses daily_reset_counter for names/ids hinting at a daily value', () => {
        const obj = { id: 'sun2000.0.collected.dailyEnergyYield', common: { type: 'number', name: 'Heutiger Energieertrag' } };
        const result = classifyFromMetadata(obj);
        expect(result.valueKind).to.equal('daily_reset_counter');
        expect(result.valueKindConfidence).to.equal('low');
        expect(result.valueKindSource).to.equal('metadata');
    });

    it('guesses cumulative_total for names/roles hinting at a lifetime total', () => {
        const obj = { id: 'sun2000.0.inverter.totalYield', common: { type: 'number', name: 'Gesamtertrag', role: 'value.power.consumption' } };
        const result = classifyFromMetadata(obj);
        expect(result.valueKind).to.equal('cumulative_total');
        expect(result.valueKindConfidence).to.equal('low');
    });

    it('defaults to gauge with low confidence when nothing else matches', () => {
        const obj = { id: 'sun2000.0.meter.activePower', common: { type: 'number', name: 'Aktuelle Wirkleistung' } };
        expect(classifyFromMetadata(obj)).to.deep.equal({
            valueKind: 'gauge',
            valueKindConfidence: 'low',
            valueKindSource: 'metadata',
        });
    });

    it('is defensive against missing common/id fields', () => {
        expect(classifyFromMetadata({})).to.deep.equal({
            valueKind: 'gauge',
            valueKindConfidence: 'low',
            valueKindSource: 'metadata',
        });
    });
});

describe('detectPatternFromSamples', () => {
    it('returns null when there are fewer than 3 valid points', () => {
        expect(detectPatternFromSamples([{ ts: 1, val: 0 }])).to.equal(null);
        expect(detectPatternFromSamples([])).to.equal(null);
    });

    it('detects boolean_state when only two distinct values (0/1) occur', () => {
        const points = [
            { ts: 1, val: 0 }, { ts: 2, val: 1 }, { ts: 3, val: 0 }, { ts: 4, val: 1 }, { ts: 5, val: 0 },
        ];
        expect(detectPatternFromSamples(points)).to.equal('boolean_state');
    });

    it('detects daily_reset_counter for a series that climbs then drops sharply (reset)', () => {
        const points = [
            { ts: 1, val: 0 }, { ts: 2, val: 5 }, { ts: 3, val: 10 }, { ts: 4, val: 20 },
            { ts: 5, val: 0.5 }, { ts: 6, val: 3 }, { ts: 7, val: 8 },
        ];
        expect(detectPatternFromSamples(points)).to.equal('daily_reset_counter');
    });

    it('returns monotonic_no_reset for a series that only ever increases', () => {
        const points = [{ ts: 1, val: 100 }, { ts: 2, val: 150 }, { ts: 3, val: 200 }, { ts: 4, val: 260 }];
        expect(detectPatternFromSamples(points)).to.equal('monotonic_no_reset');
    });

    it('detects gauge for a series that fluctuates up and down without a sharp reset', () => {
        const points = [
            { ts: 1, val: 20 }, { ts: 2, val: 18 }, { ts: 3, val: 22 }, { ts: 4, val: 19 }, { ts: 5, val: 21 },
        ];
        expect(detectPatternFromSamples(points)).to.equal('gauge');
    });

    it('ignores non-finite values when judging the pattern', () => {
        const points = [
            { ts: 1, val: 10 }, { ts: 2, val: null }, { ts: 3, val: 20 }, { ts: 4, val: undefined }, { ts: 5, val: 30 },
        ];
        expect(detectPatternFromSamples(points)).to.equal('monotonic_no_reset');
    });
});

describe('classifyValueKind', () => {
    const obj = { id: 'sun2000.0.collected.dailyEnergyYield', common: { type: 'number', name: 'Heutiger Energieertrag' } };

    it('returns the metadata result immediately for boolean_state (no history call)', async () => {
        const getHistory = sinon.stub();
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });
        const boolObj = { id: 'shelly.0.relay', common: { type: 'boolean', name: 'Relais' } };

        const result = await classifyValueKind({}, boolObj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'boolean_state', valueKindConfidence: 'high', valueKindSource: 'metadata' });
        expect(getHistory.called).to.equal(false);
    });

    it('confirms a daily_reset_counter from the first sample window on InfluxDB using bucketed average data', async () => {
        const resetPoints = [
            { ts: 1, val: 0 }, { ts: 2, val: 10 }, { ts: 3, val: 20 }, { ts: 4, val: 0.2 }, { ts: 5, val: 5 },
        ];
        const getHistory = sinon.stub().resolves(resetPoints);
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        const result = await classifyValueKind({}, obj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'daily_reset_counter', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        expect(getHistory.calledOnce).to.equal(true);
        expect(getHistory.firstCall.args[5]).to.equal('average');
    });

    it('keeps raw none sampling for non-Influx history adapters', async () => {
        const getHistory = sinon.stub().resolves([{ ts: 1, val: 20 }, { ts: 2, val: 18 }, { ts: 3, val: 22 }, { ts: 4, val: 19 }]);
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        await classifyValueKind({}, obj, 'history.0');

        expect(getHistory.calledOnce).to.equal(true);
        expect(getHistory.firstCall.args[5]).to.equal('none');
    });

    it('escalates to a 7-day window and confirms cumulative_total once 5+ days without a reset are observed', async () => {
        const inconclusive48h = [{ ts: 1, val: 10 }, { ts: 2, val: 15 }, { ts: 3, val: 20 }];
        const monotonic7d = [{ ts: 1, val: 10 }, { ts: 2, val: 500 }, { ts: 3, val: 900 }];
        const getHistory = sinon.stub();
        getHistory.onFirstCall().resolves(inconclusive48h);
        getHistory.onSecondCall().resolves(monotonic7d);
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        const result = await classifyValueKind({}, obj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'cumulative_total', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        expect(getHistory.calledTwice).to.equal(true);
    });

    it('falls back to the low-confidence metadata guess after exhausting all escalation steps', async () => {
        const tooFewPoints = [{ ts: 1, val: 1 }];
        const getHistory = sinon.stub().resolves(tooFewPoints);
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        const result = await classifyValueKind({}, obj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'daily_reset_counter', valueKindConfidence: 'low', valueKindSource: 'metadata' });
        expect(getHistory.callCount).to.equal(4);
    });

    it('confirms gauge as soon as a plain fluctuation is seen, without further escalation', async () => {
        const fluctuating = [{ ts: 1, val: 20 }, { ts: 2, val: 18 }, { ts: 3, val: 22 }, { ts: 4, val: 19 }];
        const getHistory = sinon.stub().resolves(fluctuating);
        const gaugeObj = { id: 'sun2000.0.meter.activePower', common: { type: 'number', name: 'Wirkleistung' } };
        const { classifyValueKind } = loadClassifierWithStubs({ getHistory });

        const result = await classifyValueKind({}, gaugeObj, 'influxdb.0');

        expect(result).to.deep.equal({ valueKind: 'gauge', valueKindConfidence: 'high', valueKindSource: 'sampled' });
        expect(getHistory.calledOnce).to.equal(true);
    });
});
