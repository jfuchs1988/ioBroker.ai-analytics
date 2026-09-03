// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
// lib/agent.js
'use strict';

const MAX_ITERATIONS = 8;

async function runAgent({ provider, tools, systemPrompt, userMessage, priorMessages, onAssistantText, onProgress }) {
    const messages = [...(priorMessages || []), { role: 'user', content: userMessage }];
    const usage = { inputTokens: 0, outputTokens: 0 };

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (onProgress) await onProgress({ processed: iteration, total: MAX_ITERATIONS });
        const assistantMessage = await provider.chat({
            system: systemPrompt,
            messages,
            tools: tools.definitions,
        });

        if (assistantMessage.usage) {
            usage.inputTokens += assistantMessage.usage.inputTokens || 0;
            usage.outputTokens += assistantMessage.usage.outputTokens || 0;
        }

        messages.push(assistantMessage);

        if (onProgress) await onProgress({ processed: iteration + 1, total: MAX_ITERATIONS });

        if (assistantMessage.content && onAssistantText) {
            onAssistantText(assistantMessage.content);
        }

        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
            return { finalText: assistantMessage.content, messages, usage };
        }

        for (const call of assistantMessage.toolCalls) {
            let resultContent;
            try {
                const result = await tools.execute(call.name, call.input);
                resultContent = JSON.stringify(result);
            } catch (error) {
                resultContent = JSON.stringify({ error: error.message });
            }
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: resultContent });
        }
    }

    throw new Error('Agent hat die maximale Anzahl an Werkzeug-Aufrufen erreicht, ohne eine Antwort zu liefern.');
}

module.exports = { runAgent, MAX_ITERATIONS };
