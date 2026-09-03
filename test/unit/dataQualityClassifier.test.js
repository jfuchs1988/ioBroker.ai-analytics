const { expect } = require('chai');
const {
    computeWritable,
    computeDeltas,
    detectWritePattern,
    median,
    bucketUpdateFrequency,
    detectDataCompleteness,
} = require('../../lib/dataQualityClassifier');

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

describe('median', () => {
    it('returns the middle value for an odd-length array', () => {
        expect(median([5, 1, 3])).to.equal(3);
    });

    it('averages the two middle values for an even-length array', () => {
        expect(median([10, 20, 30, 40])).to.equal(25);
    });
});

describe('bucketUpdateFrequency', () => {
    it('returns event_driven for on_change regardless of median', () => {
        expect(bucketUpdateFrequency('on_change', 5000)).to.equal('event_driven');
    });

    it('returns unknown for writePattern unknown', () => {
        expect(bucketUpdateFrequency('unknown', 5000)).to.equal('unknown');
    });

    it('buckets a continuous pattern by median delta', () => {
        const MIN = 60 * 1000;
        const HOUR = 3600 * 1000;
        const DAY = 24 * HOUR;
        expect(bucketUpdateFrequency('continuous', 10 * 1000)).to.equal('seconds');
        expect(bucketUpdateFrequency('continuous', 30 * MIN)).to.equal('minutes');
        expect(bucketUpdateFrequency('continuous', 12 * HOUR)).to.equal('hourly');
        expect(bucketUpdateFrequency('continuous', 5 * DAY)).to.equal('daily');
        expect(bucketUpdateFrequency('continuous', 30 * DAY)).to.equal('weekly_or_slower');
    });
});

describe('detectDataCompleteness', () => {
    const HOUR = 3600 * 1000;
    const DAY = 24 * HOUR;

    it('returns unknown when writePattern is unknown', () => {
        const result = detectDataCompleteness({ writePattern: 'unknown', deltasMs: [], medianDeltaMs: 0, lastPointTs: 0, now: 0 });
        expect(result).to.equal('unknown');
    });

    it('continuous: returns complete when no gap exceeds the multiplier and the tail is fresh', () => {
        const now = 100000;
        const result = detectDataCompleteness({
            writePattern: 'continuous',
            deltasMs: [10000, 10000, 9000, 11000],
            medianDeltaMs: 10000,
            lastPointTs: now - 5000,
            now,
        });
        expect(result).to.equal('complete');
    });

    it('continuous: returns gaps when an interior gap exceeds 5x the median', () => {
        const now = 100000;
        const result = detectDataCompleteness({
            writePattern: 'continuous',
            deltasMs: [10000, 60000, 9000, 11000], // 60000 = 6x median
            medianDeltaMs: 10000,
            lastPointTs: now - 5000,
            now,
        });
        expect(result).to.equal('gaps');
    });

    it('continuous: returns gaps when the tail (now - lastPointTs) exceeds 5x the median', () => {
        const now = 200000;
        const result = detectDataCompleteness({
            writePattern: 'continuous',
            deltasMs: [10000, 10000, 9000, 11000],
            medianDeltaMs: 10000,
            lastPointTs: now - 60000, // 60000 = 6x median, source has gone quiet
            now,
        });
        expect(result).to.equal('gaps');
    });

    it('on_change: returns complete when the current silence is within the historical max gap * 3', () => {
        const now = 10 * DAY;
        const result = detectDataCompleteness({
            writePattern: 'on_change',
            deltasMs: [DAY, 2 * DAY, 3 * DAY], // max historical gap = 3 days
            medianDeltaMs: 2 * DAY,
            lastPointTs: now - 5 * DAY, // within 3 * 3 days = 9 days
            now,
        });
        expect(result).to.equal('complete');
    });

    it('on_change: returns stale when the current silence exceeds the historical max gap * 3', () => {
        const now = 20 * DAY;
        const result = detectDataCompleteness({
            writePattern: 'on_change',
            deltasMs: [DAY, 2 * DAY, 3 * DAY], // max historical gap = 3 days, threshold = 9 days
            medianDeltaMs: 2 * DAY,
            lastPointTs: now - 10 * DAY,
            now,
        });
        expect(result).to.equal('stale');
    });

    it('on_change: applies the 24h floor so an object with only a couple of events is not immediately stale', () => {
        const now = 2 * DAY;
        // Historical max gap is tiny (1 minute), naive 3x would flag anything past 3 minutes as stale.
        const result = detectDataCompleteness({
            writePattern: 'on_change',
            deltasMs: [60 * 1000, 45 * 1000, 50 * 1000],
            medianDeltaMs: 50 * 1000,
            lastPointTs: now - (23 * HOUR), // within the 24h floor
            now,
        });
        expect(result).to.equal('complete');
    });
});
