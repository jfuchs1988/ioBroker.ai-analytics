// test/unit/tabFormat.test.js
const { expect } = require('chai');
const { formatMessageLine } = require('../../admin/tab.js');

describe('formatMessageLine', () => {
    it('formats a chat entry as "[role] text"', () => {
        expect(formatMessageLine({ role: 'assistant', text: 'Keine Auffaelligkeiten.' })).to.equal(
            '[assistant] Keine Auffaelligkeiten.'
        );
    });
});
