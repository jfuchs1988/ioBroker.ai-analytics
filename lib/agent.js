// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
// lib/agent.js
'use strict';

const { LIMIT_DEFAULTS } = require('./limits');
const MAX_ITERATIONS = LIMIT_DEFAULTS.maxAgentIterations;
const MAX_TOOL_CALLS = LIMIT_DEFAULTS.maxToolCalls;
const MAX_PERIODS = LIMIT_DEFAULTS.maxPeriodsPerRequest;
const MAX_TOOL_ARGUMENT_BYTES = 64 * 1024;
const MAX_TOOL_RESULT_BYTES = 256 * 1024;

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function validateUsage(usage) {
    if (usage === undefined) return { inputTokens: 0, outputTokens: 0 };
    if (!isPlainObject(usage) || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0 ||
        !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0) {
        throw new Error('Provider lieferte ungueltige Token-Nutzungsdaten.');
    }
    return usage;
}

function validateAssistantMessage(message) {
    if (!isPlainObject(message) || message.role !== 'assistant' || typeof message.content !== 'string' ||
        !Array.isArray(message.toolCalls)) {
        throw new Error('Provider lieferte eine ungueltige Assistenten-Antwort.');
    }
    validateUsage(message.usage);
}

function countPeriods(call) {
    if (call.name === 'getHistory') return 1;
    if (call.name === 'compareTimeframes') return 2;
    if ((call.name === 'getPeriodTotal' || call.name === 'comparePeriods') && Array.isArray(call.input.periods)) {
        return call.input.periods.length;
    }
    return 0;
}

function serializeBounded(value, maxBytes, errorMessage) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new Error(errorMessage);
    return serialized;
}

async function runAgent({ provider, tools, systemPrompt, userMessage, priorMessages, onAssistantText, onProgress, limits = LIMIT_DEFAULTS }) {
    const maxIterations = limits.maxAgentIterations || MAX_ITERATIONS;
    const maxToolCalls = limits.maxToolCalls || MAX_TOOL_CALLS;
    const maxPeriods = limits.maxPeriodsPerRequest || MAX_PERIODS;
    const messages = [...(priorMessages || []), { role: 'user', content: userMessage }];
    const usage = { inputTokens: 0, outputTokens: 0 };
    const allowedTools = new Set(tools.definitions.map((tool) => tool.name));
    const seenCallIds = new Set();
    let toolCallCount = 0;
    let periodCount = 0;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (onProgress) await onProgress({ processed: iteration, total: maxIterations });
        const assistantMessage = await provider.chat({
            system: systemPrompt,
            messages,
            tools: tools.definitions,
        });
        validateAssistantMessage(assistantMessage);

        const responseUsage = validateUsage(assistantMessage.usage);
        usage.inputTokens += responseUsage.inputTokens;
        usage.outputTokens += responseUsage.outputTokens;

        messages.push(assistantMessage);

        if (onProgress) await onProgress({ processed: iteration + 1, total: maxIterations });

        if (assistantMessage.content && onAssistantText) {
            onAssistantText(assistantMessage.content);
        }

        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
            return { finalText: assistantMessage.content, messages, usage };
        }

        const newCallIds = new Set();
        let responsePeriodCount = 0;
        for (const call of assistantMessage.toolCalls) {
            if (!isPlainObject(call) || typeof call.id !== 'string' || !call.id || seenCallIds.has(call.id) ||
                newCallIds.has(call.id) ||
                typeof call.name !== 'string' || !allowedTools.has(call.name) || !isPlainObject(call.input)) {
                throw new Error('Provider lieferte einen ungueltigen Werkzeug-Aufruf.');
            }
            serializeBounded(call.input, MAX_TOOL_ARGUMENT_BYTES, 'Werkzeug-Argumente ueberschreiten das Groessenlimit.');
            newCallIds.add(call.id);
            responsePeriodCount += countPeriods(call);
        }
        const requiredToolCalls = toolCallCount + assistantMessage.toolCalls.length;
        if (requiredToolCalls > maxToolCalls) {
            throw new Error(`Maximale Anzahl an Werkzeug-Aufrufen ueberschritten: benoetigt ${requiredToolCalls}, Limit ${maxToolCalls}, es fehlen ${requiredToolCalls - maxToolCalls}.`);
        }
        const requiredPeriods = periodCount + responsePeriodCount;
        if (requiredPeriods > maxPeriods) {
            throw new Error(`Maximale Anzahl an Zeitraeumen ueberschritten: benoetigt ${requiredPeriods}, Limit ${maxPeriods}, es fehlen ${requiredPeriods - maxPeriods}.`);
        }
        toolCallCount += assistantMessage.toolCalls.length;
        periodCount += responsePeriodCount;
        for (const call of assistantMessage.toolCalls) {
            seenCallIds.add(call.id);
            let resultContent;
            try {
                const result = await tools.execute(call.name, call.input);
                resultContent = serializeBounded(result, MAX_TOOL_RESULT_BYTES, 'Werkzeug-Ergebnis ueberschreitet das Groessenlimit.');
            } catch (_error) {
                resultContent = JSON.stringify({ error: 'Werkzeugaufruf fehlgeschlagen.' });
            }
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: resultContent });
        }
    }

    throw new Error('Agent hat die maximale Anzahl an Werkzeug-Aufrufen erreicht, ohne eine Antwort zu liefern.');
}

module.exports = {
    runAgent,
    MAX_ITERATIONS,
    MAX_TOOL_CALLS,
    MAX_PERIODS,
    MAX_TOOL_ARGUMENT_BYTES,
    MAX_TOOL_RESULT_BYTES,
};
