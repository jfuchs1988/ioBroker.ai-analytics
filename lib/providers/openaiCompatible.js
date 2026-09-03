// lib/providers/openaiCompatible.js
// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
'use strict';

const MODEL_LIST_TIMEOUT_MS = 15000;

function resolveOpenAiBaseUrl(type, configuredBaseUrl) {
    const customUrl = typeof configuredBaseUrl === 'string' ? configuredBaseUrl.trim().replace(/\/+$/, '') : '';
    if (customUrl) return customUrl;
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
        });

        if (!response.ok) {
            throw new Error(`OpenAI-compatible models API error ${response.status}`);
        }
        data = await response.json();
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
    const message = choice.message;
    const toolCalls = (message.tool_calls || []).map((call) => ({
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments || '{}'),
    }));

    const usage = data.usage || {};

    return {
        role: 'assistant',
        content: message.content || '',
        toolCalls,
        stopReason: choice.finish_reason,
        usage: {
            inputTokens: usage.prompt_tokens || 0,
            outputTokens: usage.completion_tokens || 0,
        },
    };
}

function createOpenAiCompatibleProvider(config) {
    const baseUrl = resolveOpenAiBaseUrl(config.type, config.baseUrl);

    return {
        async chat({ system, messages, tools }) {
            const response = await fetch(`${baseUrl}/chat/completions`, {
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
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`OpenAI-compatible API error ${response.status}: ${errorBody}`);
            }

            const data = await response.json();
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
