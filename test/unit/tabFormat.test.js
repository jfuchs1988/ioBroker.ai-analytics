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
    parseBridgeResponse,
    extractChatHistory,
    markdownToHtml,
    formatUsageLine,
} = require('../../admin/tab.js');

describe('formatMessageLine', () => {
    it('formats a chat entry as "[role] text"', () => {
        expect(formatMessageLine({ role: 'assistant', text: 'Keine Auffaelligkeiten.' })).to.equal(
            '[assistant] Keine Auffaelligkeiten.'
        );
    });
});

describe('markdownToHtml', () => {
    it('renders headings, emphasis, lists, and tables without allowing raw HTML', () => {
        const html = markdownToHtml('## Titel\n\n- **Wichtig**\n\n| Wert | Ergebnis |\n|---|---:|\n| Temperatur | 21 °C |\n\n<script>alert(1)</script>');
        expect(html).to.include('<h2>Titel</h2>');
        expect(html).to.include('<strong>Wichtig</strong>');
        expect(html).to.include('<table>');
        expect(html).to.include('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.to.include('<script>');
    });

    it('escapes HTML in Markdown table headers and cells', () => {
        const html = markdownToHtml('| <img src=x onerror="alert(1)"> | Safe |\n|---|---|\n| <svg onload="alert(2)"> | **bold** |');

        expect(html).to.include('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
        expect(html).to.include('&lt;svg onload=&quot;alert(2)&quot;&gt;');
        expect(html).to.include('<strong>bold</strong>');
        expect(html).not.to.include('<img');
        expect(html).not.to.include('<svg');
    });
});

describe('formatUsageLine', () => {
    it('formats tokens and configured cost in EUR', () => {
        expect(formatUsageLine({ usage: { inputTokens: 1000, outputTokens: 250 } }, { chatIn: 3, chatOut: 15 })).to.include('1.250 Tokens').and.to.include('Kosten: 0,006750 €');
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
    const prices = { chatIn: 3, chatOut: 15, onboardingIn: 1, onboardingOut: 5 };
    const chatEntry = { chat: { inputTokens: 1000000, outputTokens: 0 }, onboarding: { inputTokens: 0, outputTokens: 0 } };

    it('reports "kein Limit" when the budget is 0 or unset', () => {
        expect(formatBudgetLine(chatEntry, 0, prices)).to.equal('Heute genutzt: 3,0000 € (kein Limit)');
        expect(formatBudgetLine(chatEntry, undefined, prices)).to.equal('Heute genutzt: 3,0000 € (kein Limit)');
    });

    it('reports cost against the configured EUR budget', () => {
        expect(formatBudgetLine(chatEntry, 10, prices)).to.equal('Heute genutzt: 3,0000 € von 10,0000 €');
    });

    it('defaults to zero cost when there is no history entry for today', () => {
        expect(formatBudgetLine(null, 10, prices)).to.equal('Heute genutzt: 0,0000 € von 10,0000 €');
    });

    it('sums chat and onboarding cost for the total', () => {
        const entry = {
            chat: { inputTokens: 1000000, outputTokens: 0 },
            onboarding: { inputTokens: 2000000, outputTokens: 0 },
        };
        expect(formatBudgetLine(entry, 10, prices)).to.equal('Heute genutzt: 5,0000 € von 10,0000 €');
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
    it('formats total, chat, and onboarding cost to 4 decimal places in EUR', () => {
        expect(formatCostLine({ chatCost: 1.5, onboardingCost: 0.25, totalCost: 1.75 })).to.equal(
            'Kosten im Zeitraum: 1,7500 € (Normales Modell: 1,5000 €, Onboarding-Modell: 0,2500 €)'
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

describe('parseBridgeResponse', () => {
    const requestId = 'tab-123-abc';

    it('ignores the tab\'s own not-yet-processed request (ack:false), even though its id matches', () => {
        const ownRequestEchoedBack = { val: JSON.stringify({ id: requestId, command: 'chatQuestion', message: {} }), ack: false };
        expect(parseBridgeResponse(ownRequestEchoedBack, requestId)).to.equal(null);
    });

    it('accepts a real ack:true response with a matching id', () => {
        const response = { val: JSON.stringify({ id: requestId, ok: true, result: ['x'] }), ack: true };
        expect(parseBridgeResponse(response, requestId)).to.deep.equal({ id: requestId, ok: true, result: ['x'] });
    });

    it('ignores an ack:true response for a different request id', () => {
        const response = { val: JSON.stringify({ id: 'tab-other', ok: true, result: [] }), ack: true };
        expect(parseBridgeResponse(response, requestId)).to.equal(null);
    });

    it('returns null for missing/malformed state', () => {
        expect(parseBridgeResponse(null, requestId)).to.equal(null);
        expect(parseBridgeResponse({ val: 'not json', ack: true }, requestId)).to.equal(null);
        expect(parseBridgeResponse({ val: 42, ack: true }, requestId)).to.equal(null);
    });
});

describe('extractChatHistory', () => {
    it('accepts the real chatQuestion response shape: the history array directly', () => {
        const history = [{ role: 'user', text: 'hi', timestamp: 1 }];
        expect(extractChatHistory(history)).to.equal(history);
    });

    it('also accepts a {history: [...]} wrapper for backward-compat', () => {
        const history = [{ role: 'user', text: 'hi', timestamp: 1 }];
        expect(extractChatHistory({ history })).to.equal(history);
    });

    it('returns null for an error response or garbage', () => {
        expect(extractChatHistory({ error: 'nope' })).to.equal(null);
        expect(extractChatHistory(null)).to.equal(null);
        expect(extractChatHistory(undefined)).to.equal(null);
    });
});
