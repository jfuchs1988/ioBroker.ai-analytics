const { expect } = require('chai');
const {
    TOKEN_LIMIT_DEFAULTS,
    TOKEN_LIMIT_BOUNDS,
    getTokenLimits,
    estimateTokens,
    estimateRequestTokens,
} = require('../../lib/tokenLimits');

describe('tokenLimits', () => {
    describe('getTokenLimits', () => {
        it('returns defaults when the config has no values for the given role', () => {
            expect(getTokenLimits({}, 'chat')).to.deep.equal({ maxInputTokens: 100000, maxOutputTokens: 4096, contextWindowTokens: 128000 });
            expect(getTokenLimits({}, 'onboarding')).to.deep.equal({ maxInputTokens: 100000, maxOutputTokens: 4096, contextWindowTokens: 128000 });
        });

        it('reads role-specific config fields', () => {
            const config = { chatMaxInputTokens: 5000, chatMaxOutputTokens: 1000, onboardingMaxInputTokens: 8000, onboardingMaxOutputTokens: 2000 };
            expect(getTokenLimits(config, 'chat')).to.deep.equal({ maxInputTokens: 5000, maxOutputTokens: 1000, contextWindowTokens: 128000 });
            expect(getTokenLimits(config, 'onboarding')).to.deep.equal({ maxInputTokens: 8000, maxOutputTokens: 2000, contextWindowTokens: 128000 });
        });

        it('clamps values below the minimum bound up to the minimum', () => {
            expect(getTokenLimits({ chatMaxInputTokens: 1 }, 'chat').maxInputTokens).to.equal(TOKEN_LIMIT_BOUNDS.maxInputTokens.min);
            expect(getTokenLimits({ chatMaxOutputTokens: 1 }, 'chat').maxOutputTokens).to.equal(TOKEN_LIMIT_BOUNDS.maxOutputTokens.min);
        });

        it('clamps values above the maximum bound down to the maximum', () => {
            expect(getTokenLimits({ chatMaxInputTokens: 99999999 }, 'chat').maxInputTokens).to.equal(TOKEN_LIMIT_BOUNDS.maxInputTokens.max);
            expect(getTokenLimits({ chatMaxOutputTokens: 99999999 }, 'chat').maxOutputTokens).to.equal(TOKEN_LIMIT_BOUNDS.maxOutputTokens.max);
        });

        it('allows the 128000-token output limit supported by current Foundry deployments', () => {
            expect(TOKEN_LIMIT_BOUNDS.maxOutputTokens.max).to.equal(128000);
            expect(getTokenLimits({ chatMaxOutputTokens: 128000 }, 'chat').maxOutputTokens).to.equal(128000);
        });

        it('falls back to the default for a non-numeric or missing value', () => {
            expect(getTokenLimits({ chatMaxInputTokens: 'not-a-number' }, 'chat').maxInputTokens).to.equal(TOKEN_LIMIT_DEFAULTS.maxInputTokens);
            expect(getTokenLimits({}, 'chat').maxOutputTokens).to.equal(TOKEN_LIMIT_DEFAULTS.maxOutputTokens);
        });
    });

    describe('estimateTokens', () => {
        it('divides character count by 4, rounding up', () => {
            expect(estimateTokens('')).to.equal(0);
            expect(estimateTokens('abcd')).to.equal(1);
            expect(estimateTokens('abcde')).to.equal(2);
            expect(estimateTokens('x'.repeat(100))).to.equal(25);
        });
    });

    describe('estimateRequestTokens', () => {
        it('sums estimates over system, messages, and tools', () => {
            const system = 'x'.repeat(40); // 10 tokens
            const messages = [{ role: 'user', content: 'x'.repeat(40) }]; // JSON.stringify adds quotes/braces, still counted
            const tools = [{ name: 'listCatalog' }];
            const expected = estimateTokens(system) + estimateTokens(JSON.stringify(messages)) + estimateTokens(JSON.stringify(tools));
            expect(estimateRequestTokens({ system, messages, tools })).to.equal(expected);
        });

        it('treats a missing tools array as empty', () => {
            const withEmpty = estimateRequestTokens({ system: 's', messages: [], tools: [] });
            const withUndefined = estimateRequestTokens({ system: 's', messages: [], tools: undefined });
            expect(withUndefined).to.equal(withEmpty);
        });
    });
});
