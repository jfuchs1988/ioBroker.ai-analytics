// test/unit/providerHealthCheck.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const {
    checkProviderReachable,
    ensureReachabilityStates,
    CHAT_STATE,
    ONBOARDING_STATE,
    DEFAULT_TIMEOUT_MS,
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

        it('falls back to String(error) when the rejection value has no message', async () => {
            // Nicht-Error-Rejection (sinon's rejects(string) wuerde daraus einen Error bauen).
            const provider = { chat: sinon.stub().callsFake(() => Promise.reject('kaputt')) };

            const result = await checkProviderReachable(provider);

            expect(result).to.deep.equal({ reachable: false, error: 'kaputt' });
        });

        it('handles a null rejection value without throwing', async () => {
            const provider = { chat: sinon.stub().callsFake(() => Promise.reject(null)) };

            const result = await checkProviderReachable(provider);

            expect(result).to.deep.equal({ reachable: false, error: 'null' });
        });

        it('defaults to a 15 second timeout', () => {
            expect(DEFAULT_TIMEOUT_MS).to.equal(15000);
        });

        it('gives up with a timeout error when the provider never responds', async () => {
            // Endpunkt, der die Verbindung annimmt, aber nie antwortet.
            const provider = { chat: sinon.stub().returns(new Promise(() => {})) };

            const result = await checkProviderReachable(provider, 20);

            expect(result.reachable).to.equal(false);
            expect(result.error).to.match(/Zeit/i);
            expect(result.error).to.include('20');
            expect(provider.chat.firstCall.args[0].signal.aborted).to.equal(true);
        });

        it('does not time out when the provider answers within the limit', async () => {
            const provider = {
                chat: sinon.stub().callsFake(
                    () => new Promise((resolve) => setTimeout(() => resolve({ content: 'OK' }), 5))
                ),
            };

            const result = await checkProviderReachable(provider, 200);

            expect(result).to.deep.equal({ reachable: true });
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
