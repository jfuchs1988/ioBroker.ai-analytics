'use strict';
// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.

const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const pendingResponses = new WeakMap();

function byteLength(value) {
    return Buffer.byteLength(value, 'utf8');
}

function nonRetryableError(message) {
    const error = new Error(message);
    error.retryable = false;
    return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;
    let onAbort;

    if (externalSignal) {
        if (externalSignal.aborted) {
            const error = new Error('Provider request aborted.');
            error.name = 'AbortError';
            error.retryable = false;
            throw error;
        }
        onAbort = () => controller.abort(externalSignal.reason);
        externalSignal.addEventListener('abort', onAbort, { once: true });
    }

    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error(`Provider request timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    const cleanup = () => {
        clearTimeout(timeout);
        if (externalSignal && onAbort) externalSignal.removeEventListener('abort', onAbort);
    };

    try {
        const response = await fetch(url, { redirect: 'error', ...options, signal: controller.signal });
        pendingResponses.set(response, { cleanup, didTimeOut: () => timedOut, timeoutMs });
        return response;
    } catch (error) {
        cleanup();
        if (timedOut) {
            const timeoutError = new Error(`Provider request timed out after ${timeoutMs} ms.`);
            timeoutError.code = 'PROVIDER_TIMEOUT';
            timeoutError.retryable = true;
            throw timeoutError;
        }
        if (externalSignal && externalSignal.aborted) {
            const abortError = new Error('Provider request aborted.');
            abortError.name = 'AbortError';
            abortError.retryable = false;
            throw abortError;
        }
        if (error && error.retryable === undefined) error.retryable = true;
        throw error;
    }
}

async function readResponseText(response, maxBytes = MAX_RESPONSE_BYTES) {
    const pending = pendingResponses.get(response);
    try {
        const contentLength = Number(response.headers && response.headers.get && response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            throw nonRetryableError(`Provider response exceeds ${maxBytes} bytes.`);
        }

        if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            const chunks = [];
            let total = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                total += value.byteLength;
                if (total > maxBytes) {
                    await reader.cancel();
                    throw nonRetryableError(`Provider response exceeds ${maxBytes} bytes.`);
                }
                chunks.push(Buffer.from(value));
            }
            return Buffer.concat(chunks, total).toString('utf8');
        }

        if (typeof response.text === 'function') {
            const text = await response.text();
            if (byteLength(text) > maxBytes) throw nonRetryableError(`Provider response exceeds ${maxBytes} bytes.`);
            return text;
        }

        throw nonRetryableError('Provider response body is unavailable.');
    } catch (error) {
        if (pending && pending.didTimeOut()) {
            const timeoutError = new Error(`Provider request timed out after ${pending.timeoutMs} ms.`);
            timeoutError.code = 'PROVIDER_TIMEOUT';
            timeoutError.retryable = true;
            throw timeoutError;
        }
        throw error;
    } finally {
        if (pending) {
            pending.cleanup();
            pendingResponses.delete(response);
        }
    }
}

async function readJsonResponse(response, maxBytes = MAX_RESPONSE_BYTES) {
    if ((!response.body || typeof response.body.getReader !== 'function') && typeof response.text !== 'function' && typeof response.json === 'function') {
        const pending = pendingResponses.get(response);
        try {
            const data = await response.json();
            const serialized = JSON.stringify(data);
            if (serialized === undefined || byteLength(serialized) > maxBytes) {
                throw nonRetryableError(`Provider response exceeds ${maxBytes} bytes or is not valid JSON.`);
            }
            return data;
        } catch (error) {
            if (pending && pending.didTimeOut()) {
                const timeoutError = new Error(`Provider request timed out after ${pending.timeoutMs} ms.`);
                timeoutError.code = 'PROVIDER_TIMEOUT';
                timeoutError.retryable = true;
                throw timeoutError;
            }
            throw error;
        } finally {
            if (pending) {
                pending.cleanup();
                pendingResponses.delete(response);
            }
        }
    }

    const text = await readResponseText(response, maxBytes);
    try {
        return JSON.parse(text);
    } catch (_error) {
        throw nonRetryableError('Provider response was not valid JSON.');
    }
}

function parseRetryAfter(response) {
    const raw = response.headers && response.headers.get && response.headers.get('retry-after');
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60000);
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp) ? Math.min(Math.max(0, timestamp - Date.now()), 60000) : 0;
}

async function createHttpError(response, providerName) {
    // Consume only a bounded amount and never expose a provider-controlled body to logs or callers.
    try {
        await readResponseText(response, 8192);
    } catch (_error) {
        // The HTTP status is sufficient for the public error.
    }
    const error = new Error(`${providerName} API error ${response.status}`);
    error.status = response.status;
    error.retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
    error.retryAfterMs = parseRetryAfter(response);
    return error;
}

module.exports = {
    fetchWithTimeout,
    readJsonResponse,
    createHttpError,
    nonRetryableError,
    DEFAULT_REQUEST_TIMEOUT_MS,
    MAX_RESPONSE_BYTES,
};
