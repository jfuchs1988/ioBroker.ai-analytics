// test/unit/usage.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { ensureUsageState, recordUsage, getTodayUsage, getUsageHistory, isBudgetExceeded, USAGE_STATE, HISTORY_STATE } = require('../../lib/usage');

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

    it('ensureUsageState creates both state objects', async () => {
        const adapter = makeAdapter();
        await ensureUsageState(adapter);
        expect(adapter.setObjectNotExistsAsync.calledTwice).to.equal(true);
        const ids = adapter.setObjectNotExistsAsync.getCalls().map((call) => call.args[0]);
        expect(ids).to.include(USAGE_STATE);
        expect(ids).to.include(HISTORY_STATE);
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

    describe('getUsageHistory', () => {
        it('returns an empty array when no history state exists', async () => {
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves(null);
            expect(await getUsageHistory(adapter)).to.deep.equal([]);
        });

        it('returns an empty array defensively when the stored value is not an array', async () => {
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify({ not: 'an array' }) });
            expect(await getUsageHistory(adapter)).to.deep.equal([]);
        });

        it('returns the stored array unchanged', async () => {
            const stored = [{ date: '2026-08-01', chat: { inputTokens: 10, outputTokens: 2 }, onboarding: { inputTokens: 0, outputTokens: 0 } }];
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(stored) });
            expect(await getUsageHistory(adapter)).to.deep.equal(stored);
        });
    });

    describe('recordUsage with purpose / history', () => {
        it('defaults to purpose "chat" and creates a new history entry for today', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves(null);

            await recordUsage(adapter, { inputTokens: 100, outputTokens: 20 });

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            const history = JSON.parse(historyCall.args[1].val);
            expect(history).to.deep.equal([
                { date: today, chat: { inputTokens: 100, outputTokens: 20 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            ]);
        });

        it('accumulates onboarding usage separately from chat usage on the same day', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const existingHistory = [
                { date: today, chat: { inputTokens: 50, outputTokens: 10 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            ];
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(existingHistory) });

            await recordUsage(adapter, { inputTokens: 200, outputTokens: 30 }, 'onboarding');

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            const history = JSON.parse(historyCall.args[1].val);
            expect(history).to.deep.equal([
                { date: today, chat: { inputTokens: 50, outputTokens: 10 }, onboarding: { inputTokens: 200, outputTokens: 30 } },
            ]);
        });

        it('repairs a malformed existing entry that is missing the purpose key', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const existingHistory = [{ date: today, chat: { inputTokens: 50, outputTokens: 10 } }];
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(existingHistory) });

            await recordUsage(adapter, { inputTokens: 200, outputTokens: 30 }, 'onboarding');

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            const history = JSON.parse(historyCall.args[1].val);
            expect(history).to.deep.equal([
                { date: today, chat: { inputTokens: 50, outputTokens: 10 }, onboarding: { inputTokens: 200, outputTokens: 30 } },
            ]);
        });

        it('appends a separate entry for a new day without touching prior days', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const existingHistory = [
                { date: '2000-01-01', chat: { inputTokens: 999, outputTokens: 999 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            ];
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(existingHistory) });

            await recordUsage(adapter, { inputTokens: 10, outputTokens: 5 }, 'chat');

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            const history = JSON.parse(historyCall.args[1].val);
            expect(history).to.have.lengthOf(2);
            expect(history[0]).to.deep.equal(existingHistory[0]);
            expect(history[1]).to.deep.equal({
                date: today,
                chat: { inputTokens: 10, outputTokens: 5 },
                onboarding: { inputTokens: 0, outputTokens: 0 },
            });
        });
    });
});
