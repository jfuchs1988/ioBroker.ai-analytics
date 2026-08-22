// test/unit/tabFormat.test.js
const { expect } = require('chai');
const {
    formatMessageLine,
    resolveNamespaceFromQuery,
    filterEntries,
    formatBudgetLine,
    computeRangeHistory,
    computeCost,
    recommendLimits,
    formatCostLine,
    formatRecommendationLine,
} = require('../../admin/tab.js');

describe('formatMessageLine', () => {
    it('formats a chat entry as "[role] text"', () => {
        expect(formatMessageLine({ role: 'assistant', text: 'Keine Auffaelligkeiten.' })).to.equal(
            '[assistant] Keine Auffaelligkeiten.'
        );
    });
});

describe('resolveNamespaceFromQuery', () => {
    it('reads the instance from an "instance" query param', () => {
        expect(resolveNamespaceFromQuery('?instance=2')).to.equal('ai-analytics.2');
    });

    it('reads the instance from a short "i" query param', () => {
        expect(resolveNamespaceFromQuery('?i=1')).to.equal('ai-analytics.1');
    });

    it('defaults to instance 0 when no param is present', () => {
        expect(resolveNamespaceFromQuery('')).to.equal('ai-analytics.0');
    });
});

describe('filterEntries', () => {
    const entries = [
        { sourceId: 'javascript.0.lampe', description: 'Deckenlampe', category: 'lighting', room: 'Wohnzimmer', active: true, needsReview: false, ignored: false },
        { sourceId: 'javascript.0.steckdose', description: 'Waschmaschine', category: 'device_usage', room: 'Keller', active: false, needsReview: true, ignored: false },
        { sourceId: 'javascript.0.pv', description: 'PV-Einspeisung', category: 'generation_pv', room: '', active: true, needsReview: false, ignored: true },
    ];

    it('returns all entries for an empty query', () => {
        expect(filterEntries(entries, '')).to.deep.equal(entries);
        expect(filterEntries(entries, '   ')).to.deep.equal(entries);
    });

    it('matches by description, case-insensitive', () => {
        const result = filterEntries(entries, 'waschmaschine');
        expect(result.map((e) => e.sourceId)).to.deep.equal(['javascript.0.steckdose']);
    });

    it('matches by category', () => {
        const result = filterEntries(entries, 'lighting');
        expect(result.map((e) => e.sourceId)).to.deep.equal(['javascript.0.lampe']);
    });

    it('matches by room', () => {
        const result = filterEntries(entries, 'keller');
        expect(result.map((e) => e.sourceId)).to.deep.equal(['javascript.0.steckdose']);
    });

    it('matches the synthetic status tokens inactive/needsreview/ignored', () => {
        expect(filterEntries(entries, 'inactive').map((e) => e.sourceId)).to.deep.equal(['javascript.0.steckdose']);
        expect(filterEntries(entries, 'needsreview').map((e) => e.sourceId)).to.deep.equal(['javascript.0.steckdose']);
        expect(filterEntries(entries, 'ignored').map((e) => e.sourceId)).to.deep.equal(['javascript.0.pv']);
    });
});

describe('formatBudgetLine', () => {
    it('reports "kein Limit" when the budget is 0 or unset', () => {
        expect(formatBudgetLine({ tokensToday: 150 }, 0)).to.equal('Heute genutzt: 150 Tokens (kein Limit)');
        expect(formatBudgetLine({ tokensToday: 150 }, undefined)).to.equal('Heute genutzt: 150 Tokens (kein Limit)');
    });

    it('reports usage against the configured budget', () => {
        expect(formatBudgetLine({ tokensToday: 150 }, 1000)).to.equal('Heute genutzt: 150 / 1000 Tokens');
    });

    it('defaults to 0 tokens when usage is missing', () => {
        expect(formatBudgetLine(null, 1000)).to.equal('Heute genutzt: 0 / 1000 Tokens');
    });

    it('displays tokensToday normally when usage.date matches the injected today', () => {
        expect(formatBudgetLine({ date: '2026-08-22', tokensToday: 150 }, 1000, '2026-08-22')).to.equal(
            'Heute genutzt: 150 / 1000 Tokens'
        );
    });

    it('treats usage as stale (0 tokens) when usage.date does not match the injected today', () => {
        expect(formatBudgetLine({ date: '2026-08-21', tokensToday: 150 }, 1000, '2026-08-22')).to.equal(
            'Heute genutzt: 0 / 1000 Tokens'
        );
        expect(formatBudgetLine({ date: '2026-08-21', tokensToday: 150 }, 0, '2026-08-22')).to.equal(
            'Heute genutzt: 0 Tokens (kein Limit)'
        );
    });
});

describe('computeRangeHistory', () => {
    const history = [
        { date: '2026-08-01', chat: { inputTokens: 10, outputTokens: 5 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
        { date: '2026-08-03', chat: { inputTokens: 20, outputTokens: 5 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
        { date: '2026-08-02', chat: { inputTokens: 15, outputTokens: 5 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
    ];

    it('returns the full history sorted by date ascending when days is null/undefined', () => {
        expect(computeRangeHistory(history, null).map((e) => e.date)).to.deep.equal(['2026-08-01', '2026-08-02', '2026-08-03']);
        expect(computeRangeHistory(history).map((e) => e.date)).to.deep.equal(['2026-08-01', '2026-08-02', '2026-08-03']);
    });

    it('returns only the last N days when a day count is given', () => {
        expect(computeRangeHistory(history, 2).map((e) => e.date)).to.deep.equal(['2026-08-02', '2026-08-03']);
    });

    it('does not mutate the input array', () => {
        const copy = JSON.parse(JSON.stringify(history));
        computeRangeHistory(history, 2);
        expect(history).to.deep.equal(copy);
    });
});

describe('computeCost', () => {
    it('computes chat and onboarding cost separately from token counts and prices', () => {
        const entries = [
            { date: '2026-08-01', chat: { inputTokens: 1000000, outputTokens: 500000 }, onboarding: { inputTokens: 2000000, outputTokens: 0 } },
        ];
        const cost = computeCost(entries, { chatIn: 3, chatOut: 15, onboardingIn: 1, onboardingOut: 5 });
        expect(cost.chatCost).to.be.closeTo(3 * 1 + 15 * 0.5, 1e-9);
        expect(cost.onboardingCost).to.be.closeTo(1 * 2, 1e-9);
        expect(cost.totalCost).to.be.closeTo(cost.chatCost + cost.onboardingCost, 1e-9);
    });

    it('returns zero cost for an empty range or missing prices', () => {
        expect(computeCost([], {})).to.deep.equal({ chatCost: 0, onboardingCost: 0, totalCost: 0 });
    });
});

describe('recommendLimits', () => {
    it('returns null when fewer than 3 days of history are given', () => {
        const entries = [
            { date: '2026-08-01', chat: { inputTokens: 100, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            { date: '2026-08-02', chat: { inputTokens: 200, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
        ];
        expect(recommendLimits(entries)).to.equal(null);
    });

    it('recommends a daily limit 20% above the observed maximum, and an hourly fraction of it', () => {
        const entries = [
            { date: '2026-08-01', chat: { inputTokens: 100, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            { date: '2026-08-02', chat: { inputTokens: 1000, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
            { date: '2026-08-03', chat: { inputTokens: 200, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } },
        ];
        const result = recommendLimits(entries);
        expect(result.dailyTokens).to.equal(1200);
        expect(result.hourlyTokens).to.equal(Math.ceil(1200 / 24));
    });
});

describe('formatCostLine', () => {
    it('formats total, chat, and onboarding cost to 4 decimal places', () => {
        expect(formatCostLine({ chatCost: 1.5, onboardingCost: 0.25, totalCost: 1.75 })).to.equal(
            'Kosten im Zeitraum: 1.7500 (Chat: 1.5000, Onboarding: 0.2500)'
        );
    });
});

describe('formatRecommendationLine', () => {
    it('reports insufficient data when recommendation is null', () => {
        expect(formatRecommendationLine(null)).to.equal('Noch nicht genug Daten fuer eine Empfehlung.');
    });

    it('formats the daily/hourly recommendation', () => {
        expect(formatRecommendationLine({ dailyTokens: 1200, hourlyTokens: 50 })).to.equal(
            'Empfehlung (basierend auf bisherigem Verbrauch, kein hartes Limit): 1200 Tokens/Tag, 50 Tokens/Stunde'
        );
    });
});
