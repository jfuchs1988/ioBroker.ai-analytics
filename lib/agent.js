// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
// lib/agent.js
'use strict';

const { LIMIT_DEFAULTS } = require('./limits');
const { estimateRequestTokens, TOKEN_LIMIT_DEFAULTS } = require('./tokenLimits');
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

async function compactPriorMessages({ provider, priorMessages, userMessage }) {
    if (priorMessages.length % 2 !== 0 || priorMessages.some((message, index) => {
        const expectedRole = index % 2 === 0 ? 'user' : 'assistant';
        return !message || message.role !== expectedRole || typeof message.content !== 'string';
    })) {
        throw new Error('Gesprächsverlauf kann wegen einer ungültigen Nachrichtenfolge nicht komprimiert werden.');
    }
    const rounds = [];
    for (let i = 0; i < priorMessages.length; i += 2) {
        rounds.push([priorMessages[i], priorMessages[i + 1]]);
    }
    const compactCount = Math.floor(rounds.length / 2);
    const toCompact = rounds.slice(0, compactCount).flat();
    const keptMessages = rounds.slice(compactCount).flat();

    const summaryResponse = await provider.chat({
        system: 'Fasse den folgenden Gespraechsverlauf kurz und sachlich zusammen. Behalte wichtige Fakten, bereits geklaerte Zuordnungen und offene Rueckfragen bei.',
        messages: toCompact,
        tools: [],
    });
    validateAssistantMessage(summaryResponse);
    const summaryUsage = validateUsage(summaryResponse.usage);

    const summaryPrefix = `[Zusammenfassung des bisherigen Verlaufs]: ${summaryResponse.content}\n\n`;
    keptMessages[0] = { ...keptMessages[0], content: summaryPrefix + keptMessages[0].content };

    return { messages: [...keptMessages, { role: 'user', content: userMessage }], usage: summaryUsage };
}

async function ensureWithinInputBudget({ provider, messages, priorMessages, systemPrompt, userMessage, toolDefinitions, maxInputTokens, usage }) {
    const estimate = estimateRequestTokens({ system: systemPrompt, messages, tools: toolDefinitions });
    if (estimate <= maxInputTokens) return messages;

    if (priorMessages && priorMessages.length >= 4) {
        let compacted;
        try {
            compacted = await compactPriorMessages({ provider, priorMessages, userMessage });
        } catch (error) {
            error.usage = usage;
            throw new Error(`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit (~${estimate} von ${maxInputTokens} geschaetzten Tokens).`, { cause: error });
        }
        usage.inputTokens += compacted.usage.inputTokens;
        usage.outputTokens += compacted.usage.outputTokens;
        const reEstimate = estimateRequestTokens({ system: systemPrompt, messages: compacted.messages, tools: toolDefinitions });
        if (reEstimate <= maxInputTokens) return compacted.messages;
        throw new Error(`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit auch nach Zusammenfassung (~${reEstimate} von ${maxInputTokens} geschaetzten Tokens).`);
    }

    throw new Error(`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit (~${estimate} von ${maxInputTokens} geschaetzten Tokens).`);
}

async function runAgent({ provider, tools, systemPrompt, userMessage, priorMessages, onAssistantText, onProgress, limits = LIMIT_DEFAULTS }) {
    const maxIterations = limits.maxAgentIterations || MAX_ITERATIONS;
    const maxToolCalls = limits.maxToolCalls || MAX_TOOL_CALLS;
    const maxPeriods = limits.maxPeriodsPerRequest || MAX_PERIODS;
    const maxInputTokens = Math.min(limits.maxInputTokens || TOKEN_LIMIT_DEFAULTS.maxInputTokens,
        (limits.contextWindowTokens || TOKEN_LIMIT_DEFAULTS.contextWindowTokens) - (limits.maxOutputTokens || TOKEN_LIMIT_DEFAULTS.maxOutputTokens));
    if (maxInputTokens < 1) throw new Error('Kontextfenster ist kleiner als das konfigurierte Ausgabe-Limit.');
    const usage = { inputTokens: 0, outputTokens: 0 };
    let messages = [...(priorMessages || []), { role: 'user', content: userMessage }];
    messages = await ensureWithinInputBudget({
        provider, messages, priorMessages, systemPrompt, userMessage,
        toolDefinitions: tools.definitions, maxInputTokens, usage,
    });
    const allowedTools = new Set(tools.definitions.map((tool) => tool.name));
    const seenCallIds = new Set();
    let toolCallCount = 0;
    let periodCount = 0;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (iteration > 0) {
            const estimate = estimateRequestTokens({ system: systemPrompt, messages, tools: tools.definitions });
            if (estimate > maxInputTokens) {
                throw new Error(`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit (~${estimate} von ${maxInputTokens} geschaetzten Tokens).`);
            }
        }
        if (onProgress) await onProgress({ processed: iteration, total: maxIterations });
        let assistantMessage;
        try {
            assistantMessage = await provider.chat({
                system: systemPrompt,
                messages,
                tools: tools.definitions,
            });
        } catch (error) {
            error.usage = usage;
            throw error;
        }
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

    const error = new Error('Agent hat die maximale Anzahl an Werkzeug-Aufrufen erreicht, ohne eine Antwort zu liefern.');
    error.usage = usage;
    throw error;
}

module.exports = {
    runAgent,
    MAX_ITERATIONS,
    MAX_TOOL_CALLS,
    MAX_PERIODS,
    MAX_TOOL_ARGUMENT_BYTES,
    MAX_TOOL_RESULT_BYTES,
};
