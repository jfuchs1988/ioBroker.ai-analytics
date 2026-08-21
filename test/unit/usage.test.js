// test/unit/usage.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { ensureUsageState, recordUsage, getTodayUsage, isBudgetExceeded, USAGE_STATE } = require('../../lib/usage');

function makeAdapter(config) {
    return {
        config: config || {},
        setObjectNotExistsAsync: sinon.stub().resolves(),
        getStateAsync: sinon.stub(),
        setStateAsync: sinon.stub().resolves(),
    };
}

describe('usage', () => {
    it('USAGE_STATE points at usage.today', () => {
        expect(USAGE_STATE).to.equal('usage.today');
    });

    it('ensureUsageState creates the state object', async () => {
        const adapter = makeAdapter();
        await ensureUsageState(adapter);
        expect(adapter.setObjectNotExistsAsync.calledOnce).to.equal(true);
        expect(adapter.setObjectNotExistsAsync.firstCall.args[0]).to.equal(USAGE_STATE);
    });

    it('recordUsage starts a fresh counter when no state exists', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves(null);

        const result = await recordUsage(adapter, { inputTokens: 100, outputTokens: 20 });

        expect(result.tokensToday).to.equal(120);
        const [, state] = adapter.setStateAsync.firstCall.args;
        expect(JSON.parse(state.val).tokensToday).to.equal(120);
    });

    it('recordUsage adds to an existing same-day counter', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves({ val: JSON.stringify({ date: today, tokensToday: 500 }) });

        const result = await recordUsage(adapter, { inputTokens: 10, outputTokens: 5 });

        expect(result.tokensToday).to.equal(515);
    });

    it('recordUsage resets the counter when the stored date is stale', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves({ val: JSON.stringify({ date: '2000-01-01', tokensToday: 99999 }) });

        const result = await recordUsage(adapter, { inputTokens: 10, outputTokens: 5 });

        expect(result.tokensToday).to.equal(15);
    });

    it('getTodayUsage returns zero when no state exists', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves(null);
        const result = await getTodayUsage(adapter);
        expect(result.tokensToday).to.equal(0);
    });

    it('isBudgetExceeded is false when dailyTokenBudget is 0 or unset', async () => {
        const adapter = makeAdapter({ dailyTokenBudget: 0 });
        expect(await isBudgetExceeded(adapter)).to.equal(false);
    });

    it('isBudgetExceeded compares tokensToday against the configured budget', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const adapter = makeAdapter({ dailyTokenBudget: 1000 });
        adapter.getStateAsync.resolves({ val: JSON.stringify({ date: today, tokensToday: 1500 }) });

        expect(await isBudgetExceeded(adapter)).to.equal(true);
    });

    it('isBudgetExceeded is false when under budget', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const adapter = makeAdapter({ dailyTokenBudget: 1000 });
        adapter.getStateAsync.resolves({ val: JSON.stringify({ date: today, tokensToday: 200 }) });

        expect(await isBudgetExceeded(adapter)).to.equal(false);
    });
});
