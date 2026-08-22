// test/unit/providerHealthCheck.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const {
    checkProviderReachable,
    ensureReachabilityStates,
    CHAT_STATE,
    ONBOARDING_STATE,
} = require('../../lib/providerHealthCheck');

function makeAdapter() {
    return {
        setObjectNotExistsAsync: sinon.stub().resolves(),
    };
}

describe('providerHealthCheck', () => {
    it('state constants point at the expected info.* paths', () => {
        expect(CHAT_STATE).to.equal('info.chatProviderReachable');
        expect(ONBOARDING_STATE).to.equal('info.onboardingProviderReachable');
    });

    describe('checkProviderReachable', () => {
        it('returns reachable: true when the provider responds successfully', async () => {
            const provider = {
                chat: sinon.stub().resolves({ role: 'assistant', content: 'OK', toolCalls: [], stopReason: 'end_turn' }),
            };

            const result = await checkProviderReachable(provider);

            expect(result).to.deep.equal({ reachable: true });
            expect(provider.chat.calledOnce).to.equal(true);
            const call = provider.chat.firstCall.args[0];
            expect(call.tools).to.deep.equal([]);
            expect(call.messages).to.have.lengthOf(1);
            expect(call.messages[0].role).to.equal('user');
        });

        it('returns reachable: false with the error message when the provider call throws', async () => {
            const provider = { chat: sinon.stub().rejects(new Error('401 Unauthorized')) };

            const result = await checkProviderReachable(provider);

            expect(result).to.deep.equal({ reachable: false, error: '401 Unauthorized' });
        });
    });

    describe('ensureReachabilityStates', () => {
        it('creates both state objects', async () => {
            const adapter = makeAdapter();

            await ensureReachabilityStates(adapter);

            expect(adapter.setObjectNotExistsAsync.calledTwice).to.equal(true);
            const ids = adapter.setObjectNotExistsAsync.getCalls().map((call) => call.args[0]);
            expect(ids).to.include(CHAT_STATE);
            expect(ids).to.include(ONBOARDING_STATE);
        });
    });
});
