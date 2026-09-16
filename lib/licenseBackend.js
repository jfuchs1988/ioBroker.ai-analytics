'use strict';

const crypto = require('crypto');
const requestHelpers = require('./providers/request');

const DEFAULT_BACKEND_URL = '';
const ACTIVATION_STATE = 'info.licenseActivation';
const DAILY_RENEWAL_MS = 24 * 60 * 60 * 1000;

function backendUrl(value) {
    const url = new URL(typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BACKEND_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('licenseBackendUrl muss eine HTTPS-URL ohne Zugangsdaten sein.');
    return url.toString().replace(/\/$/, '');
}

function requireObject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Lizenzdienst antwortete mit einem ungueltigen Format.');
    return data;
}

async function request(baseUrl, path, options = {}) {
    const response = await requestHelpers.fetchWithTimeout(`${baseUrl}${path}`, {
        redirect: 'error',
        headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
        method: options.method || 'GET',
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    if (!response.ok) throw await requestHelpers.createHttpError(response, 'Lizenzdienst');
    return requireObject(await requestHelpers.readJsonResponse(response));
}

function newInstallationId() {
    return crypto.randomUUID();
}

function validateActivationCode(activationCode) {
    if (typeof activationCode !== 'string' || !/^[A-Z0-9-]{6,64}$/.test(activationCode)) throw new Error('Aktivierungscode ungueltig.');
}

async function createActivation({ url, installationId }) {
    if (typeof installationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId)) throw new Error('Installations-ID ungueltig.');
    const result = await request(backendUrl(url), '/v1/activation-sessions', { method: 'POST', body: { installationId } });
    let verificationUri;
    try {
        verificationUri = new URL(result.verificationUri);
    } catch (_error) {
        verificationUri = null;
    }
    if (typeof result.activationCode !== 'string' || !verificationUri || verificationUri.protocol !== 'https:' || !Number.isSafeInteger(result.expiresAt)) throw new Error('Lizenzdienst lieferte keine gueltige Aktivierung.');
    return { activationCode: result.activationCode, verificationUri: result.verificationUri, expiresAt: result.expiresAt };
}

async function getActivationStatus({ url, activationCode }) {
    validateActivationCode(activationCode);
    const result = await request(backendUrl(url), `/v1/activation-sessions/${encodeURIComponent(activationCode)}`);
    if (!['pending', 'authorized', 'denied', 'expired'].includes(result.status)) throw new Error('Lizenzdienst lieferte einen ungueltigen Aktivierungsstatus.');
    return { status: result.status };
}

async function issueEntitlement({ url, activationCode }) {
    validateActivationCode(activationCode);
    const result = await request(backendUrl(url), '/v1/entitlements/issue', { method: 'POST', body: { activationCode } });
    if (typeof result.token !== 'string' || !result.token || typeof result.licenseId !== 'string') throw new Error('Lizenzdienst lieferte kein gueltiges Entitlement.');
    return result;
}

async function renewEntitlement({ url, token }) {
    if (typeof token !== 'string' || !token) throw new Error('Kein Entitlement-Token vorhanden.');
    const result = await request(backendUrl(url), '/v1/entitlements/renew', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    if (typeof result.token !== 'string' || !result.token || typeof result.licenseId !== 'string') throw new Error('Lizenzdienst lieferte kein gueltiges Renewal.');
    return result;
}

module.exports = { DEFAULT_BACKEND_URL, ACTIVATION_STATE, DAILY_RENEWAL_MS, backendUrl, newInstallationId, createActivation, getActivationStatus, issueEntitlement, renewEntitlement };
