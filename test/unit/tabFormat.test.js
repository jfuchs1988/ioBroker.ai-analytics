// test/unit/tabFormat.test.js
const { expect } = require('chai');
const { formatMessageLine, resolveNamespaceFromQuery, filterEntries, formatBudgetLine } = require('../../admin/tab.js');

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
});
