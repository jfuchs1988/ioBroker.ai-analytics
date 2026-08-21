// test/unit/tabFormat.test.js
const { expect } = require('chai');
const { formatMessageLine, resolveNamespaceFromQuery } = require('../../admin/tab.js');

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
