// main.js
'use strict';

const utils = require('@iobroker/adapter-core');
const { findHistorizedObjects } = require('./lib/discovery');
const { getAllCatalogEntries, markInactive } = require('./lib/catalog');
const { createProvider } = require('./lib/providers');
const { buildTools } = require('./lib/tools');
const { runAgent } = require('./lib/agent');
const { runOnboarding } = require('./lib/onboarding');
const { ensureChatHistoryState, appendChatMessage } = require('./lib/chatLog');

class AiAnalytics extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'ai-analytics' });
        this.on('ready', this.onReady.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await ensureChatHistoryState(this);

        this.provider = createProvider({
            type: this.config.providerType,
            apiKey: this.config.apiKey,
            model: this.config.model,
            baseUrl: this.config.baseUrl,
        });
        this.tools = buildTools(this);

        await this.syncCatalog();

        this.log.info('ai-analytics adapter ready');
    }

    async syncCatalog() {
        const discovered = await findHistorizedObjects(this);
        const existing = await getAllCatalogEntries(this);
        const discoveredIds = new Set(discovered.map((obj) => obj.id));

        for (const entry of existing) {
            if (!discoveredIds.has(entry.sourceId) && entry.active !== false) {
                await markInactive(this, entry.sourceId);
            }
        }

        const { needsReview } = await runOnboarding(this, this.provider, discovered);

        if (needsReview.length > 0) {
            const question = needsReview
                .map((entry) => `- ${entry.sourceId}: wofuer steht dieser Wert?`)
                .join('\n');
            await appendChatMessage(this, 'assistant', `Ich bin mir bei folgenden Objekten unsicher:\n${question}`);
        }
    }

    async onMessage(obj) {
        if (!obj || obj.command !== 'chatQuestion') return;

        const question = obj.message && obj.message.text;

        try {
            await appendChatMessage(this, 'user', question);
            const { finalText } = await runAgent({
                provider: this.provider,
                tools: this.tools,
                systemPrompt:
                    'Du beantwortest Fragen zu Smart-Home-Verbrauchsdaten anhand der katalogisierten Objekte.',
                userMessage: question,
            });
            const history = await appendChatMessage(this, 'assistant', finalText);
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { history }, obj.callback);
            }
        } catch (error) {
            this.log.error(`Chat-Anfrage fehlgeschlagen: ${error.message}`);
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
            }
        }
    }

    onUnload(callback) {
        try {
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new AiAnalytics(options);
} else {
    new AiAnalytics();
}
