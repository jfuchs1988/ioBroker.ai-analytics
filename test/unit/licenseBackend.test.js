const { expect } = require('chai');
const sinon = require('sinon');

describe('licenseBackend', () => {
    let request;
    beforeEach(() => {
        request = require('../../lib/providers/request');
        sinon.stub(request, 'fetchWithTimeout').resolves({ ok: true, body: null, json: async () => ({}) });
        sinon.stub(request, 'readJsonResponse').resolves({});
        sinon.stub(request, 'createHttpError');
    });
    afterEach(() => sinon.restore());

    it('rejects unsafe backend URLs', () => {
        const client = require('../../lib/licenseBackend');
        expect(() => client.backendUrl('http://example.test')).to.throw();
        expect(() => client.backendUrl('https://user:pass@example.test')).to.throw();
        expect(() => client.backendUrl('https://example.test/?token=secret')).to.throw();
    });

    it('creates an activation request with the installation ID and returns public handoff data', async () => {
        request.readJsonResponse.resolves({ activationCode: 'ABC123-XYZ', verificationUri: 'https://example.test/link/ABC123-XYZ', expiresAt: 123 });
        const client = require('../../lib/licenseBackend');
        const result = await client.createActivation({ url: 'https://example.test', installationId: client.newInstallationId() });
        expect(result.activationCode).to.equal('ABC123-XYZ');
        expect(request.fetchWithTimeout.firstCall.args[1].method).to.equal('POST');
    });

    it('sends renewal tokens only as bearer headers and validates the response', async () => {
        request.readJsonResponse.resolves({ token: 'new-token', licenseId: 'license-1', githubLogin: 'octocat', sponsorUntil: 200, tokenExpiresAt: 200 });
        const client = require('../../lib/licenseBackend');
        await client.renewEntitlement({ url: 'https://example.test', token: 'old-token' });
        expect(request.fetchWithTimeout.firstCall.args[1].headers.authorization).to.equal('Bearer old-token');
    });
});
