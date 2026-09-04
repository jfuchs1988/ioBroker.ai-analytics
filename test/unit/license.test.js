const { expect } = require('chai');
const crypto = require('crypto');
const {
    evaluateLicense,
    canUseChat,
    canRunProactive,
    GRACE_PERIOD_DAYS,
} = require('../../lib/license');

function base64Url(value) {
    return Buffer.from(value).toString('base64url');
}

function makeSignedToken({ privateKey, kid = '2026-09', payload }) {
    const header = base64Url(JSON.stringify({ alg: 'EdDSA', kid, typ: 'JWT' }));
    const encodedPayload = base64Url(JSON.stringify(payload));
    const signingInput = `${header}.${encodedPayload}`;
    const signature = crypto.sign(null, Buffer.from(signingInput), privateKey).toString('base64url');
    return `${signingInput}.${signature}`;
}

function makeKeys() {
    return crypto.generateKeyPairSync('ed25519');
}

describe('license evaluation', () => {
    it('keeps all beta versions fully enabled without a token', () => {
        const result = evaluateLicense({ version: '0.0.1-beta.28', token: '', now: 1000, publicKeys: {} });

        expect(result).to.deep.include({ status: 'beta', fullAccess: true });
        expect(canRunProactive(result)).to.equal(true);
        expect(canUseChat(result, null, '2026-09-03')).to.equal(true);
    });

    it('accepts a valid Ed25519 JWS without requiring instance binding', () => {
        const { publicKey, privateKey } = makeKeys();
        const now = 1_700_000_000;
        const token = makeSignedToken({
            privateKey,
            payload: {
                iss: 'ai-analytics-license', aud: 'ioBroker.ai-analytics', tokenVersion: 1,
                licenseId: 'license-123',
                iat: now,
                nbf: now,
                exp: now + 35 * 24 * 3600,
                sponsorUntil: now + 30 * 24 * 3600,
            },
        });

        const result = evaluateLicense({
            version: '0.1.0',
            token,
            now,
            publicKeys: { '2026-09': publicKey.export({ type: 'spki', format: 'pem' }) },
        });

        expect(result).to.deep.include({ status: 'active', fullAccess: true, licenseId: 'license-123' });
        expect(canRunProactive(result)).to.equal(true);
    });

    it('uses a 30-day grace period starting at sponsorship expiry', () => {
        const { publicKey, privateKey } = makeKeys();
        const start = 1_700_000_000;
        const token = makeSignedToken({
            privateKey,
            payload: {
                iss: 'ai-analytics-license', aud: 'ioBroker.ai-analytics', tokenVersion: 1, licenseId: 'license-123', iat: start, nbf: start,
                exp: start + 35 * 24 * 3600, sponsorUntil: start + 30 * 24 * 3600,
            },
        });
        const options = {
            version: '0.1.0', token, publicKeys: { '2026-09': publicKey.export({ type: 'spki', format: 'pem' }) },
        };

        const result = evaluateLicense({ ...options, now: start + 31 * 24 * 3600 });
        expect(result).to.deep.include({ status: 'grace', fullAccess: true });
        expect(result.graceUntil).to.equal(start + (30 + GRACE_PERIOD_DAYS) * 24 * 3600);
    });

    it('limits expired entitlements to one successful chat request per day', () => {
        const result = { status: 'limited', fullAccess: false };

        expect(canRunProactive(result)).to.equal(false);
        expect(canUseChat(result, null, '2026-09-03')).to.equal(true);
        expect(canUseChat(result, '2026-09-03', '2026-09-03')).to.equal(false);
        expect(canUseChat(result, '2026-09-02', '2026-09-03')).to.equal(true);
    });

    it('does not accept a tampered token after beta end', () => {
        const { publicKey, privateKey } = makeKeys();
        const now = 1_700_000_000;
        const token = makeSignedToken({
            privateKey,
            payload: { iss: 'ai-analytics-license', aud: 'ioBroker.ai-analytics', tokenVersion: 1, licenseId: 'x', iat: now, nbf: now, exp: now + 1000, sponsorUntil: now + 1000 },
        }).replace('e', 'f');

        const result = evaluateLicense({
            version: '0.1.0', token, now,
            publicKeys: { '2026-09': publicKey.export({ type: 'spki', format: 'pem' }) },
        });

        expect(result.status).to.equal('invalid');
        expect(result.fullAccess).to.equal(false);
        expect(canUseChat(result, null, '2026-09-03')).to.equal(true);
    });

    it('rejects malformed claim timelines despite a valid signature', () => {
        const { publicKey, privateKey } = makeKeys();
        const now = 1_700_000_000;
        const token = makeSignedToken({
            privateKey,
            payload: {
                iss: 'ai-analytics-license', aud: 'ioBroker.ai-analytics', tokenVersion: 1,
                licenseId: 'license-123', iat: now, nbf: now, exp: now + 100, sponsorUntil: now + 200,
            },
        });

        const result = evaluateLicense({
            version: '0.1.0', token, now,
            publicKeys: { '2026-09': publicKey.export({ type: 'spki', format: 'pem' }) },
        });

        expect(result).to.deep.include({ status: 'invalid', fullAccess: false });
    });

    it('does not resolve signing keys through the object prototype', () => {
        const result = evaluateLicense({
            version: '0.1.0',
            token: `${base64Url(JSON.stringify({ alg: 'EdDSA', kid: 'toString', typ: 'JWT' }))}.${base64Url('{}')}.AA`,
            publicKeys: {},
        });

        expect(result.reason).to.equal('Unbekannter Signaturschluessel');
    });
});
