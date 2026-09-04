// lib/providers/openaiCompatible.js
// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
'use strict';

const MODEL_LIST_TIMEOUT_MS = 15000;
const MAX_TOOL_ARGUMENT_BYTES = 64 * 1024;
const { fetchWithTimeout, readJsonResponse, createHttpError, nonRetryableError } = require('./request');

function parseUsage(value) {
    const normalized = value === undefined ? 0 : value;
    if (!Number.isSafeInteger(normalized) || normalized < 0) {
        throw nonRetryableError('OpenAI-compatible response contained invalid token usage.');
    }
    return normalized;
}

function resolveOpenAiBaseUrl(type, configuredBaseUrl) {
    const customUrl = typeof configuredBaseUrl === 'string' ? configuredBaseUrl.trim().replace(/\/+$/, '') : '';
    if (customUrl) {
        let parsed;
        try {
            parsed = new URL(customUrl);
        } catch (error) {
            throw new Error('Basis-URL ist ungueltig.', { cause: error });
        }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
            throw new Error('Basis-URL muss eine HTTP(S)-URL ohne Zugangsdaten oder Fragment sein.');
        }
        if (type !== 'local' && parsed.protocol !== 'https:') {
            throw new Error('Externe Provider erfordern eine HTTPS-Basis-URL.');
        }
        return customUrl;
    }
    if (type === 'openrouter') return 'https://openrouter.ai/api/v1';
    if (type === 'local') throw new Error('Für einen lokalen Provider ist eine Basis-URL erforderlich.');
    return 'https://api.openai.com/v1';
}

function authorizationHeaders(apiKey) {
    return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function isFreeOpenRouterToolModel(model) {
    const pricing = model && model.pricing;
    return Boolean(
        model &&
            Array.isArray(model.supported_parameters) &&
            model.supported_parameters.includes('tools') &&
            pricing &&
            Number(pricing.prompt) === 0 &&
            Number(pricing.completion) === 0 &&
            Number(pricing.request || 0) === 0
    );
}

async function listOpenAiCompatibleModels(config) {
    const baseUrl = resolveOpenAiBaseUrl(config.type, config.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);
    let data;
    try {
        const response = await fetch(`${baseUrl}/models`, {
            headers: authorizationHeaders(config.apiKey),
            signal: controller.signal,
            redirect: 'error',
        });

        if (!response.ok) {
            throw new Error(`OpenAI-compatible models API error ${response.status}`);
        }
        data = await readJsonResponse(response);
    } finally {
        clearTimeout(timeout);
    }

    if (!data || !Array.isArray(data.data)) {
        throw new Error('OpenAI-kompatible Modellantwort enthielt kein data-Array.');
    }

    const models = config.type === 'openrouter' ? data.data.filter(isFreeOpenRouterToolModel) : data.data;
    return models
        .filter((model) => model && typeof model.id === 'string' && model.id.trim())
        .map((model) => ({
            id: model.id,
            name: typeof model.name === 'string' && model.name.trim() ? model.name : model.id,
            isFree: config.type === 'openrouter',
        }));
}

function toOpenAiMessages(system, messages) {
    const result = [{ role: 'system', content: system }];

    for (const message of messages) {
        if (message.role === 'user') {
            result.push({ role: 'user', content: message.content });
        } else if (message.role === 'assistant') {
            const entry = { role: 'assistant', content: message.content || null };
            if (message.toolCalls && message.toolCalls.length) {
                entry.tool_calls = message.toolCalls.map((call) => ({
                    id: call.id,
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.input) },
                }));
            }
            result.push(entry);
        } else if (message.role === 'tool') {
            result.push({ role: 'tool', tool_call_id: message.toolCallId, content: message.content });
        }
    }

    return result;
}

function toOpenAiTools(tools) {
    return tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
}

function fromOpenAiResponse(data) {
    if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('OpenAI-kompatible Antwort enthielt keine choices.');
    }
    const choice = data.choices[0];
    const message = choice && choice.message;
    if (!choice || typeof choice !== 'object' || !message || typeof message !== 'object' ||
        (message.content !== null && message.content !== undefined && typeof message.content !== 'string') ||
        (message.tool_calls !== undefined && !Array.isArray(message.tool_calls))) {
        throw nonRetryableError('OpenAI-compatible response contained an invalid assistant message.');
    }
    const toolCalls = (message.tool_calls || []).map((call) => {
        if (!call || typeof call !== 'object' || typeof call.id !== 'string' || !call.id ||
            !call.function || typeof call.function.name !== 'string' || !call.function.name ||
            typeof call.function.arguments !== 'string') {
            throw nonRetryableError('OpenAI-compatible response contained an invalid tool call.');
        }
        if (Buffer.byteLength(call.function.arguments, 'utf8') > MAX_TOOL_ARGUMENT_BYTES) {
            throw nonRetryableError('OpenAI-compatible tool arguments were too large.');
        }
        let input;
        try {
            input = JSON.parse(call.function.arguments || '{}');
        } catch (_error) {
            throw nonRetryableError('OpenAI-compatible tool arguments were not valid JSON.');
        }
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw nonRetryableError('OpenAI-compatible tool arguments must be an object.');
        }
        return { id: call.id, name: call.function.name, input };
    });

    if (data.usage !== undefined && (!data.usage || typeof data.usage !== 'object' || Array.isArray(data.usage))) {
        throw nonRetryableError('OpenAI-compatible response contained invalid token usage.');
    }
    const usage = data.usage || {};

    return {
        role: 'assistant',
        content: message.content || '',
        toolCalls,
        stopReason: choice.finish_reason,
        usage: {
            inputTokens: parseUsage(usage.prompt_tokens),
            outputTokens: parseUsage(usage.completion_tokens),
        },
    };
}

function createOpenAiCompatibleProvider(config) {
    const baseUrl = resolveOpenAiBaseUrl(config.type, config.baseUrl);

    return {
        async chat({ system, messages, tools, signal }) {
            const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...authorizationHeaders(config.apiKey),
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: toOpenAiMessages(system, messages),
                    tools: tools && tools.length ? toOpenAiTools(tools) : undefined,
                }),
                signal,
            }, config.requestTimeoutMs);

            if (!response.ok) {
                throw await createHttpError(response, 'OpenAI-compatible');
            }

            const data = await readJsonResponse(response);
            return fromOpenAiResponse(data);
        },
    };
}

module.exports = {
    createOpenAiCompatibleProvider,
    listOpenAiCompatibleModels,
    resolveOpenAiBaseUrl,
    toOpenAiMessages,
    toOpenAiTools,
    fromOpenAiResponse,
};
