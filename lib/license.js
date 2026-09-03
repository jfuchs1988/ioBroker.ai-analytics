'use strict';

const crypto = require('crypto');

const GRACE_PERIOD_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;
const EXPECTED_ISSUER = 'ai-analytics-license';
const EXPECTED_AUDIENCE = 'ioBroker.ai-analytics';
const EXPECTED_TOKEN_VERSION = 1;
const LICENSE_STATUS_STATE = 'info.licenseStatus';
const LICENSE_CHAT_LAST_USED_STATE = 'info.licenseChatLastUsed';

function decodeJson(part) {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function parseJws(token) {
    if (typeof token !== 'string') throw new Error('Token fehlt');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Tokenformat ungueltig');

    const header = decodeJson(parts[0]);
    const payload = decodeJson(parts[1]);
    const signature = Buffer.from(parts[2], 'base64url');
    if (!header || header.alg !== 'EdDSA' || typeof header.kid !== 'string' || !payload || !signature.length) {
        throw new Error('Tokenheader ungueltig');
    }
    return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature };
}

function invalid(reason) {
    return { status: 'invalid', fullAccess: false, reason };
}

function evaluateLicense({ version, token, now = Math.floor(Date.now() / 1000), publicKeys = {} } = {}) {
    if (typeof version === 'string' && version.includes('-beta')) {
        return { status: 'beta', fullAccess: true, reason: 'beta' };
    }

    let parsed;
    try {
        parsed = parseJws(token);
    } catch (error) {
        return invalid(error.message);
    }

    const publicKey = publicKeys[parsed.header.kid];
    if (!publicKey) return invalid('Unbekannter Signaturschluessel');

    let verified = false;
    try {
        verified = crypto.verify(null, Buffer.from(parsed.signingInput), publicKey, parsed.signature);
    } catch (_error) {
        verified = false;
    }
    if (!verified) return invalid('Token-Signatur ungueltig');

    const claims = parsed.payload;
    if (claims.iss !== EXPECTED_ISSUER || claims.aud !== EXPECTED_AUDIENCE || claims.tokenVersion !== EXPECTED_TOKEN_VERSION ||
        typeof claims.licenseId !== 'string' ||
        !Number.isFinite(claims.nbf) || !Number.isFinite(claims.exp) || !Number.isFinite(claims.sponsorUntil)) {
        return invalid('Tokenclaims unvollstaendig');
    }
    if (now < claims.nbf) return invalid('Token noch nicht gueltig');

    const graceUntil = claims.sponsorUntil + GRACE_PERIOD_DAYS * DAY_SECONDS;
    const base = { licenseId: claims.licenseId, tokenExpiresAt: claims.exp, sponsorUntil: claims.sponsorUntil, graceUntil };
    if (now <= claims.sponsorUntil && now <= claims.exp) return { ...base, status: 'active', fullAccess: true };
    if (now <= graceUntil) return { ...base, status: 'grace', fullAccess: true };
    return { ...base, status: 'limited', fullAccess: false, reason: 'Entitlement abgelaufen' };
}

function canRunProactive(status) {
    return Boolean(status && status.fullAccess);
}

function canUseChat(status, lastUsedDate, today) {
    if (status && status.fullAccess) return true;
    return !lastUsedDate || lastUsedDate !== today;
}

function getTodayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function ensureLicenseStates(adapter) {
    await adapter.setObjectNotExistsAsync(LICENSE_STATUS_STATE, {
        type: 'state',
        common: { name: 'License status', type: 'string', role: 'json', read: true, write: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(LICENSE_CHAT_LAST_USED_STATE, {
        type: 'state',
        common: { name: 'License chat request date', type: 'string', role: 'date', read: true, write: false },
        native: {},
    });
}

module.exports = {
    evaluateLicense,
    canUseChat,
    canRunProactive,
    parseJws,
    getTodayKey,
    ensureLicenseStates,
    LICENSE_STATUS_STATE,
    LICENSE_CHAT_LAST_USED_STATE,
    GRACE_PERIOD_DAYS,
};
