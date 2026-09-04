// test/unit/chatLog.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const { ensureChatHistoryState, appendChatMessage, getRecentChatHistory, CHAT_HISTORY_STATE } = require('../../lib/chatLog');

describe('chatLog', () => {
    it('CHAT_HISTORY_STATE points at chat.history', () => {
        expect(CHAT_HISTORY_STATE).to.equal('chat.history');
    });

    it('ensureChatHistoryState creates the state object if missing', async () => {
        const adapter = { setObjectNotExistsAsync: sinon.stub().resolves() };
        await ensureChatHistoryState(adapter);
        expect(adapter.setObjectNotExistsAsync.calledOnce).to.equal(true);
        expect(adapter.setObjectNotExistsAsync.firstCall.args[0]).to.equal('chat.history');
    });

    it('appendChatMessage appends to existing history and writes back JSON', async () => {
        const existing = [{ role: 'user', text: 'Hallo', timestamp: 1 }];
        const adapter = {
            getStateAsync: sinon.stub().resolves({ val: JSON.stringify(existing) }),
            setStateAsync: sinon.stub().resolves(),
        };

        const clock = sinon.useFakeTimers(2000);
        const result = await appendChatMessage(adapter, 'assistant', 'Antwort');
        clock.restore();

        expect(result).to.deep.equal([
            { role: 'user', text: 'Hallo', timestamp: 1 },
            { role: 'assistant', text: 'Antwort', timestamp: 2000 },
        ]);
        const [id, state] = adapter.setStateAsync.firstCall.args;
        expect(id).to.equal('chat.history');
        expect(JSON.parse(state.val)).to.deep.equal(result);
        expect(state.ack).to.equal(true);
    });

    it('appendChatMessage starts a fresh history when none exists yet', async () => {
        const adapter = {
            getStateAsync: sinon.stub().resolves(null),
            setStateAsync: sinon.stub().resolves(),
        };

        const result = await appendChatMessage(adapter, 'user', 'Erste Frage');

        expect(result).to.have.lengthOf(1);
        expect(result[0].text).to.equal('Erste Frage');
    });

    it('appendChatMessage caps history at 200 entries', async () => {
        const existing = Array.from({ length: 200 }, (_, i) => ({ role: 'user', text: `m${i}`, timestamp: i }));
        const adapter = {
            getStateAsync: sinon.stub().resolves({ val: JSON.stringify(existing) }),
            setStateAsync: sinon.stub().resolves(),
        };

        const result = await appendChatMessage(adapter, 'user', 'neu');

        expect(result).to.have.lengthOf(200);
        expect(result[result.length - 1].text).to.equal('neu');
        expect(result[0].text).to.equal('m1');
    });

    it('serializes concurrent appends so no message is lost', async () => {
        let stored = { val: '[]' };
        const adapter = {
            getStateAsync: sinon.stub().callsFake(async () => stored),
            setStateAsync: sinon.stub().callsFake(async (_id, state) => { stored = state; }),
        };

        await Promise.all([
            appendChatMessage(adapter, 'user', 'eins'),
            appendChatMessage(adapter, 'assistant', 'zwei'),
        ]);

        expect(JSON.parse(stored.val).map(entry => entry.text)).to.deep.equal(['eins', 'zwei']);
    });

    it('recovers from malformed persisted history', async () => {
        const adapter = {
            getStateAsync: sinon.stub().resolves({ val: '{invalid' }),
            setStateAsync: sinon.stub().resolves(),
        };
        const result = await appendChatMessage(adapter, 'user', 'neu');
        expect(result.map(entry => entry.text)).to.deep.equal(['neu']);
    });

    describe('getRecentChatHistory', () => {
        it('returns the last N entries in chronological order', async () => {
            const history = Array.from({ length: 15 }, (_, i) => ({ role: 'user', text: `m${i}`, timestamp: i }));
            const adapter = { getStateAsync: sinon.stub().resolves({ val: JSON.stringify(history) }) };

            const result = await getRecentChatHistory(adapter, 5);

            expect(result.map((e) => e.text)).to.deep.equal(['m10', 'm11', 'm12', 'm13', 'm14']);
        });

        it('returns an empty array when there is no history yet', async () => {
            const adapter = { getStateAsync: sinon.stub().resolves(null) };
            const result = await getRecentChatHistory(adapter, 5);
            expect(result).to.deep.equal([]);
        });

        it('returns everything when there are fewer entries than the limit', async () => {
            const history = [{ role: 'user', text: 'only one', timestamp: 1 }];
            const adapter = { getStateAsync: sinon.stub().resolves({ val: JSON.stringify(history) }) };
            const result = await getRecentChatHistory(adapter, 10);
            expect(result).to.deep.equal(history);
        });
    });
});
