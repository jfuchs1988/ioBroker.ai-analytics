// lib/providers/anthropic.js
'use strict';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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
    let text = '';
    const toolCalls = [];

    for (const block of data.content || []) {
        if (block.type === 'text') {
            text += block.text;
        } else if (block.type === 'tool_use') {
            toolCalls.push({ id: block.id, name: block.name, input: block.input });
        }
    }

    const usage = data.usage || {};

    return {
        role: 'assistant',
        content: text,
        toolCalls,
        stopReason: data.stop_reason,
        usage: {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
        },
    };
}

function createAnthropicProvider(config) {
    return {
        async chat({ system, messages, tools }) {
            const response = await fetch(ANTHROPIC_API_URL, {
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
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
            }

            const data = await response.json();
            return fromAnthropicResponse(data);
        },
    };
}

module.exports = { createAnthropicProvider, toAnthropicMessages, toAnthropicTools, fromAnthropicResponse };
