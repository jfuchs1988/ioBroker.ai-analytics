// lib/providers/openaiCompatible.js
'use strict';

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
    const choice = data.choices[0];
    const message = choice.message;
    const toolCalls = (message.tool_calls || []).map((call) => ({
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments || '{}'),
    }));

    return {
        role: 'assistant',
        content: message.content || '',
        toolCalls,
        stopReason: choice.finish_reason,
    };
}

function createOpenAiCompatibleProvider(config) {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';

    return {
        async chat({ system, messages, tools }) {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${config.apiKey}`,
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

module.exports = { createOpenAiCompatibleProvider, toOpenAiMessages, toOpenAiTools, fromOpenAiResponse };
