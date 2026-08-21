'use strict';

const MAX_ITERATIONS = 8;

async function runAgent({ provider, tools, systemPrompt, userMessage, onAssistantText }) {
    const messages = [{ role: 'user', content: userMessage }];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const assistantMessage = await provider.chat({
            system: systemPrompt,
            messages,
            tools: tools.definitions,
        });

        messages.push(assistantMessage);

        if (assistantMessage.content && onAssistantText) {
            onAssistantText(assistantMessage.content);
        }

        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
            return { finalText: assistantMessage.content, messages };
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
