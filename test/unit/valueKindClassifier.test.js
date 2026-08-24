const { expect } = require('chai');
const { classifyFromMetadata, VALUE_KINDS } = require('../../lib/valueKindClassifier');

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
