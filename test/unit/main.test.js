const { expect } = require('chai');
const proxyquire = require('proxyquire');

class AdapterStub {
    constructor() {}
}

const { AiAnalytics } = proxyquire.noCallThru()('../../main', {
    '@iobroker/adapter-core': { Adapter: AdapterStub },
});

describe('AiAnalytics command dispatch', () => {
    it('rejects an empty chat question before invoking the chat provider', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { silly: () => {} };

        let error;
        try {
            await adapter.dispatchAdapterCommand('chatQuestion', { text: '   ' });
        } catch (caught) {
            error = caught;
        }

        expect(error).to.be.an('error');
        expect(error.message).to.equal('Leere Frage');
    });

    it('routes a valid chat question to processChatQuestion', async () => {
        const adapter = Object.create(AiAnalytics.prototype);
        adapter.log = { silly: () => {} };
        adapter.processChatQuestion = async question => ({ question });

        const result = await adapter.dispatchAdapterCommand('chatQuestion', { text: 'Was lief gestern?' });

        expect(result).to.deep.equal({ question: 'Was lief gestern?' });
    });

    it('rejects unknown adapter commands', async () => {
        const adapter = Object.create(AiAnalytics.prototype);

        let error;
        try {
            await adapter.dispatchAdapterCommand('unknownCommand', {});
        } catch (caught) {
            error = caught;
        }

        expect(error.message).to.equal('Unbekannter Befehl: unknownCommand');
    });
});
