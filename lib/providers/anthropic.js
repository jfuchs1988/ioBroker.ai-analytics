// lib/providers/anthropic.js
// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
'use strict';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL_LIST_TIMEOUT_MS = 15000;
const { fetchWithTimeout, readJsonResponse, createHttpError, nonRetryableError } = require('./request');

function parseUsage(data) {
    const usage = data === undefined ? 0 : data;
    if (!Number.isSafeInteger(usage) || usage < 0) throw nonRetryableError('Anthropic response contained invalid token usage.');
    return usage;
}

async function listAnthropicModels(config) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);
    let data;
    try {
        const response = await fetch(`${ANTHROPIC_MODELS_URL}?limit=1000`, {
            headers: {
                'x-api-key': config.apiKey,
                'anthropic-version': ANTHROPIC_VERSION,
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Anthropic models API error ${response.status}`);
        }
        data = await readJsonResponse(response);
    } finally {
        clearTimeout(timeout);
    }

    if (!data || !Array.isArray(data.data)) {
        throw new Error('Anthropic-Modellantwort enthielt kein data-Array.');
    }

    return data.data
        .filter((model) => model && typeof model.id === 'string' && model.id.trim())
        .map((model) => ({
            id: model.id,
            name: typeof model.display_name === 'string' && model.display_name.trim() ? model.display_name : model.id,
            isFree: false,
        }));
}

function toAnthropicMessages(messages) {
    const anthropicMessages = [];

    for (const message of messages) {
        if (message.role === 'user') {
            anthropicMessages.push({ role: 'user', content: message.content });
        } else if (message.role === 'assistant') {
            const content = [];
            if (message.content) {
                content.push({ type: 'text', text: message.content });
            }
            for (const call of message.toolCalls || []) {
                content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
            }
            anthropicMessages.push({ role: 'assistant', content });
        } else if (message.role === 'tool') {
            const toolResultBlock = {
                type: 'tool_result',
                tool_use_id: message.toolCallId,
                content: message.content,
            };
            const last = anthropicMessages[anthropicMessages.length - 1];
            if (last && last.__toolResults) {
                last.content.push(toolResultBlock);
            } else {
                anthropicMessages.push({ role: 'user', content: [toolResultBlock], __toolResults: true });
            }
        }
    }

    return anthropicMessages.map(({ __toolResults, ...rest }) => rest);
}

function toAnthropicTools(tools) {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
    }));
}

function fromAnthropicResponse(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.content)) {
        throw nonRetryableError('Anthropic response contained no content array.');
    }
    let text = '';
    const toolCalls = [];

    for (const block of data.content) {
        if (!block || typeof block !== 'object' || typeof block.type !== 'string') {
            throw nonRetryableError('Anthropic response contained an invalid content block.');
        }
        if (block.type === 'text') {
            if (typeof block.text !== 'string') throw nonRetryableError('Anthropic response contained invalid text.');
            text += block.text;
        } else if (block.type === 'tool_use') {
            if (typeof block.id !== 'string' || !block.id || typeof block.name !== 'string' || !block.name ||
                !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) {
                throw nonRetryableError('Anthropic response contained an invalid tool call.');
            }
            toolCalls.push({ id: block.id, name: block.name, input: block.input });
        }
    }

    if (data.usage !== undefined && (!data.usage || typeof data.usage !== 'object' || Array.isArray(data.usage))) {
        throw nonRetryableError('Anthropic response contained invalid token usage.');
    }
    const usage = data.usage || {};

    return {
        role: 'assistant',
        content: text,
        toolCalls,
        stopReason: data.stop_reason,
        usage: {
            inputTokens: parseUsage(usage.input_tokens),
            outputTokens: parseUsage(usage.output_tokens),
        },
    };
}

function createAnthropicProvider(config) {
    return {
        async chat({ system, messages, tools, signal }) {
            const response = await fetchWithTimeout(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': config.apiKey,
                    'anthropic-version': ANTHROPIC_VERSION,
                },
                body: JSON.stringify({
                    model: config.model || 'claude-sonnet-4-5',
                    max_tokens: config.maxTokens || 2048,
                    system,
                    messages: toAnthropicMessages(messages),
                    tools: tools && tools.length ? toAnthropicTools(tools) : undefined,
                }),
                signal,
            }, config.requestTimeoutMs);

            if (!response.ok) {
                throw await createHttpError(response, 'Anthropic');
            }

            const data = await readJsonResponse(response);
            return fromAnthropicResponse(data);
        },
    };
}

module.exports = {
    createAnthropicProvider,
    listAnthropicModels,
    toAnthropicMessages,
    toAnthropicTools,
    fromAnthropicResponse,
};
