const { expect } = require('chai');
const { computeWritable, computeDeltas, detectWritePattern } = require('../../lib/dataQualityClassifier');

describe('computeWritable', () => {
    it('returns true when common.write is true', () => {
        expect(computeWritable({ common: { write: true } })).to.equal(true);
    });

    it('returns false when common.write is false or missing', () => {
        expect(computeWritable({ common: { write: false } })).to.equal(false);
        expect(computeWritable({ common: {} })).to.equal(false);
        expect(computeWritable({})).to.equal(false);
        expect(computeWritable(null)).to.equal(false);
    });
});

describe('computeDeltas', () => {
    it('returns the millisecond gaps between consecutive points, sorted by ts', () => {
        const points = [{ ts: 100, val: 1 }, { ts: 10, val: 0 }, { ts: 250, val: 1 }];
        expect(computeDeltas(points)).to.deep.equal([90, 150]);
    });

    it('returns an empty array for fewer than two points', () => {
        expect(computeDeltas([{ ts: 1, val: 0 }])).to.deep.equal([]);
        expect(computeDeltas([])).to.deep.equal([]);
    });

    it('ignores points without a finite ts', () => {
        const points = [{ ts: 10, val: 0 }, { ts: null, val: 1 }, { ts: 40, val: 1 }];
        expect(computeDeltas(points)).to.deep.equal([30]);
    });
});

describe('detectWritePattern', () => {
    it('returns unknown when there are fewer than 4 deltas (5 points)', () => {
        expect(detectWritePattern([1000, 1000, 1000])).to.equal('unknown');
        expect(detectWritePattern([])).to.equal('unknown');
    });

    it('detects continuous for a regular cadence (low coefficient of variation)', () => {
        // Same delta every time, e.g. a sensor writing every 10s regardless of value change.
        expect(detectWritePattern([10000, 10000, 10000, 10000, 10000])).to.equal('continuous');
    });

    it('detects continuous even with small jitter around a regular cadence', () => {
        expect(detectWritePattern([9800, 10200, 9900, 10100, 10000])).to.equal('continuous');
    });

    it('detects on_change for highly irregular deltas (event-driven)', () => {
        expect(detectWritePattern([2000, 900000, 15000, 3600000, 45000])).to.equal('on_change');
    });
});
