const { expect } = require('chai');
const { getLimits, LIMIT_DEFAULTS } = require('../../lib/limits');

describe('runtime limits', () => {
    it('returns defaults for missing settings', () => {
        expect(getLimits({})).to.deep.equal(LIMIT_DEFAULTS);
    });

    it('clamps configured limits to safe bounds', () => {
        expect(getLimits({ maxToolCalls: 9999, maxPeriodsPerRequest: 0 })).to.include({ maxToolCalls: 128, maxPeriodsPerRequest: 1 });
    });
});
