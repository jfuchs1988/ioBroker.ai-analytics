// test/unit/usage.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const {
    ensureUsageState,
    recordUsage,
    resetUsage,
    getTodayUsage,
    getUsageHistory,
    isBudgetExceeded,
    refreshTodaySummary,
    USAGE_STATE,
    HISTORY_STATE,
    TODAY_SUMMARY_STATE,
    MAX_HISTORY_DAYS,
    formatTodaySummary,
} = require('../../lib/usage');

function makeAdapter(config) {
    return {
        config: config || {},
        setObjectNotExistsAsync: sinon.stub().resolves(),
        getStateAsync: sinon.stub(),
        setStateAsync: sinon.stub().resolves(),
    };
}

describe('usage', () => {
    it('resets today and history counters', async () => {
        const adapter = makeAdapter({ dailyBudgetEur: 100 });
        await resetUsage(adapter);
        expect(adapter.setStateAsync.callCount).to.equal(3);
        expect(JSON.parse(adapter.setStateAsync.firstCall.args[1].val).tokensToday).to.equal(0);
        expect(JSON.parse(adapter.setStateAsync.secondCall.args[1].val)).to.deep.equal([]);
    });
    it('USAGE_STATE points at usage.today', () => {
        expect(USAGE_STATE).to.equal('usage.today');
    });

    it('ensureUsageState creates all three state objects', async () => {
        const adapter = makeAdapter();
        await ensureUsageState(adapter);
        expect(adapter.setObjectNotExistsAsync.calledThrice).to.equal(true);
        const ids = adapter.setObjectNotExistsAsync.getCalls().map((call) => call.args[0]);
        expect(ids).to.include(USAGE_STATE);
        expect(ids).to.include(HISTORY_STATE);
        expect(ids).to.include(TODAY_SUMMARY_STATE);
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

    it('getTodayUsage resets malformed and nonnumeric stored usage', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.onFirstCall().resolves({ val: '{broken' });
        adapter.getStateAsync.onSecondCall().resolves({ val: JSON.stringify({ date: new Date().toISOString().slice(0, 10), tokensToday: 'many' }) });

        expect((await getTodayUsage(adapter)).tokensToday).to.equal(0);
        expect((await getTodayUsage(adapter)).tokensToday).to.equal(0);
    });

    it('rejects invalid provider token counts without writing corrupted usage', async () => {
        const adapter = makeAdapter();
        adapter.getStateAsync.resolves(null);

        let error;
        try {
            await recordUsage(adapter, { inputTokens: 'many', outputTokens: -1 });
        } catch (caught) {
            error = caught;
        }

        expect(error).to.be.an('error');
        expect(adapter.setStateAsync.notCalled).to.equal(true);
    });

    describe('isBudgetExceeded (EUR-based)', () => {
        it('is false when dailyBudgetEur is 0 or unset, regardless of usage', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter({ dailyBudgetEur: 0, chatPricePerMillionInputTokens: 3 });
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({
                val: JSON.stringify([{ date: today, chat: { inputTokens: 1000000, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } }]),
            });
            expect(await isBudgetExceeded(adapter)).to.equal(false);
        });

        it('is false when a budget is set but no price is configured, even with heavy usage', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter({ dailyBudgetEur: 1 });
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({
                val: JSON.stringify([{ date: today, chat: { inputTokens: 100000000, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } }]),
            });
            expect(await isBudgetExceeded(adapter)).to.equal(false);
        });

        it('compares today\'s calculated cost (chat + onboarding) against the configured EUR budget', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter({
                dailyBudgetEur: 4,
                chatPricePerMillionInputTokens: 3,
                onboardingPricePerMillionInputTokens: 1,
            });
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({
                val: JSON.stringify([
                    {
                        date: today,
                        chat: { inputTokens: 1000000, outputTokens: 0 }, // 3 EUR
                        onboarding: { inputTokens: 2000000, outputTokens: 0 }, // 2 EUR
                    },
                ]),
            });
            // total cost 5 EUR >= 4 EUR budget
            expect(await isBudgetExceeded(adapter)).to.equal(true);
        });

        it('is false when under budget', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter({ dailyBudgetEur: 10, chatPricePerMillionInputTokens: 3 });
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({
                val: JSON.stringify([{ date: today, chat: { inputTokens: 1000000, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } }]),
            });
            expect(await isBudgetExceeded(adapter)).to.equal(false);
        });

        it('is false when there is no history entry for today', async () => {
            const adapter = makeAdapter({ dailyBudgetEur: 1, chatPricePerMillionInputTokens: 3 });
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves(null);
            expect(await isBudgetExceeded(adapter)).to.equal(false);
        });
    });

    describe('formatTodaySummary', () => {
        it('formats zero usage with thousand separators, EUR cost, and no budget line', () => {
            expect(formatTodaySummary(null, 0, {})).to.equal(
                '0,0000 € heute verbraucht (kein Limit) · Chat: 0 Tokens · Kosten: 0,0000 € · Onboarding: 0 Tokens · Kosten: 0,0000 €'
            );
        });

        it('treats a missing budget the same as no limit', () => {
            expect(formatTodaySummary(null, undefined, {})).to.equal(
                '0,0000 € heute verbraucht (kein Limit) · Chat: 0 Tokens · Kosten: 0,0000 € · Onboarding: 0 Tokens · Kosten: 0,0000 €'
            );
        });

        it('formats large token counts with German thousand separators, independent of cost', () => {
            const entry = { chat: { inputTokens: 100000, outputTokens: 20000 }, onboarding: { inputTokens: 0, outputTokens: 0 } };
            expect(formatTodaySummary(entry, 0, {})).to.equal(
                '0,0000 € heute verbraucht (kein Limit) · Chat: 120.000 Tokens · Kosten: 0,0000 € · Onboarding: 0 Tokens · Kosten: 0,0000 €'
            );
        });

        it('splits chat and onboarding usage, calculates cost per purpose, and reports total cost against the configured EUR budget', () => {
            const entry = {
                chat: { inputTokens: 100000, outputTokens: 20000 },
                onboarding: { inputTokens: 5000, outputTokens: 1000 },
            };
            const prices = { chatIn: 0.4, chatOut: 1.8, onboardingIn: 0.1, onboardingOut: 0.3 };
            expect(formatTodaySummary(entry, 5, prices)).to.equal(
                '0,0768 € von 5,0000 € heute verbraucht · Chat: 120.000 Tokens · Kosten: 0,0760 € · Onboarding: 6.000 Tokens · Kosten: 0,0008 €'
            );
        });
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

        it('drops malformed history entries and repairs nonnumeric purpose totals', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({
                val: JSON.stringify([null, 42, { date: today, chat: { inputTokens: 'many', outputTokens: -5 } }]),
            });

            await recordUsage(adapter, { inputTokens: 10, outputTokens: 2 });

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            expect(JSON.parse(historyCall.args[1].val)).to.deep.equal([
                { date: today, chat: { inputTokens: 10, outputTokens: 2 } },
            ]);
        });

        it('returns the stored array unchanged', async () => {
            const stored = [{ date: '2026-08-01', chat: { inputTokens: 10, outputTokens: 2 }, onboarding: { inputTokens: 0, outputTokens: 0 } }];
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(stored) });
            expect(await getUsageHistory(adapter)).to.deep.equal(stored);
        });
    });

    describe('refreshTodaySummary', () => {
        it('recomputes TODAY_SUMMARY_STATE from persisted history and current config without recording new usage', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter({ dailyBudgetEur: 5, chatPricePerMillionInputTokens: 0.4, chatPricePerMillionOutputTokens: 1.8 });
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({
                val: JSON.stringify([{ date: today, chat: { inputTokens: 100000, outputTokens: 20000 }, onboarding: { inputTokens: 0, outputTokens: 0 } }]),
            });

            await refreshTodaySummary(adapter);

            expect(adapter.setStateAsync.calledOnce).to.equal(true);
            const [id, state] = adapter.setStateAsync.firstCall.args;
            expect(id).to.equal(TODAY_SUMMARY_STATE);
            expect(state.val).to.include('Chat: 120.000 Tokens · Kosten: 0,0760 €');
        });

        it('reports an all-zero summary when there is no history entry for today', async () => {
            const adapter = makeAdapter({ dailyBudgetEur: 5 });
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves(null);

            await refreshTodaySummary(adapter);

            const [, state] = adapter.setStateAsync.firstCall.args;
            expect(state.val).to.equal(formatTodaySummary(null, 5, {}));
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

        it('bounds usage history to the configured retention length', async () => {
            const existingHistory = Array.from({ length: MAX_HISTORY_DAYS }, (_, index) => ({
                date: `old-${index}`,
                chat: { inputTokens: 1, outputTokens: 0 },
                onboarding: { inputTokens: 0, outputTokens: 0 },
            }));
            const adapter = makeAdapter();
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves({ val: JSON.stringify(existingHistory) });

            await recordUsage(adapter, { inputTokens: 1, outputTokens: 0 });

            const historyCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === HISTORY_STATE);
            const history = JSON.parse(historyCall.args[1].val);
            expect(history).to.have.lengthOf(MAX_HISTORY_DAYS);
            expect(history[0].date).to.equal('old-1');
        });

        it('serializes concurrent usage updates for one adapter', async () => {
            const states = new Map();
            const adapter = makeAdapter();
            adapter.getStateAsync.callsFake(async id => states.has(id) ? { val: states.get(id) } : null);
            adapter.setStateAsync.callsFake(async (id, state) => {
                await Promise.resolve();
                states.set(id, state.val);
            });

            await Promise.all([
                recordUsage(adapter, { inputTokens: 10, outputTokens: 1 }),
                recordUsage(adapter, { inputTokens: 20, outputTokens: 2 }),
            ]);

            expect(JSON.parse(states.get(USAGE_STATE)).tokensToday).to.equal(33);
        });

        it('recordUsage also writes TODAY_SUMMARY_STATE with formatted string', async () => {
            const today = new Date().toISOString().slice(0, 10);
            const adapter = makeAdapter({ dailyBudgetEur: 5 });
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves(null);

            await recordUsage(adapter, { inputTokens: 100, outputTokens: 20 });

            const summaryCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === TODAY_SUMMARY_STATE);
            expect(summaryCall).to.exist;
            expect(summaryCall.args[1].val).to.equal(
                formatTodaySummary(
                    { date: today, chat: { inputTokens: 100, outputTokens: 20 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
                    5,
                    {}
                )
            );
        });

        it('recordUsage computes summary cost from the configured per-purpose prices', async () => {
            const adapter = makeAdapter({ chatPricePerMillionInputTokens: 0.4, chatPricePerMillionOutputTokens: 1.8 });
            adapter.getStateAsync.withArgs(USAGE_STATE).resolves(null);
            adapter.getStateAsync.withArgs(HISTORY_STATE).resolves(null);

            await recordUsage(adapter, { inputTokens: 1000000, outputTokens: 0 });

            const summaryCall = adapter.setStateAsync.getCalls().find((call) => call.args[0] === TODAY_SUMMARY_STATE);
            expect(summaryCall.args[1].val).to.include('Chat: 1.000.000 Tokens · Kosten: 0,4000 €');
        });
    });
});
