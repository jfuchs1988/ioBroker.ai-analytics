// main.js
'use strict';

const utils = require('@iobroker/adapter-core');
const { findHistorizedObjects } = require('./lib/discovery');
const { getAllCatalogEntries, setCatalogEntry, markInactive } = require('./lib/catalog');
const { createProvider } = require('./lib/providers');
const { buildTools } = require('./lib/tools');
const { runAgent } = require('./lib/agent');
const { runOnboarding } = require('./lib/onboarding');
const { ensureChatHistoryState, appendChatMessage, getRecentChatHistory } = require('./lib/chatLog');
const { startProactiveScheduler } = require('./lib/scheduler');
const { ensureUsageState, recordUsage, isBudgetExceeded } = require('./lib/usage');

class AiAnalytics extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'ai-analytics' });
        this.on('ready', this.onReady.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.stopScheduler = null;
    }

    async onReady() {
        await ensureChatHistoryState(this);
        await ensureUsageState(this);

        this.provider = createProvider({
            type: this.config.providerType,
            apiKey: this.config.apiKey,
            model: this.config.model,
            baseUrl: this.config.baseUrl,
        });
        this.tools = buildTools(this);

        if (!this.config.apiKey && this.config.providerType !== 'local') {
            this.log.warn(
                'Kein API-Key konfiguriert - ueberspringe Katalog-Synchronisierung und proaktive Pruefung, bis ein API-Key hinterlegt ist.'
            );
            return;
        }

        await this.syncCatalog();

        const configuredHours = Number(this.config.checkIntervalHours);
        const intervalHours = Number.isFinite(configuredHours) && configuredHours >= 1 ? configuredHours : 24;
        const intervalMs = intervalHours * 3600 * 1000;
        this.stopScheduler = startProactiveScheduler(this, {
            intervalMs,
            runCheck: () => this.runProactiveCheck(),
        });

        this.log.info('ai-analytics adapter ready');
    }

    async syncCatalog() {
        const discovered = await findHistorizedObjects(this);
        const existing = await getAllCatalogEntries(this);
        const existingById = new Map(existing.map((entry) => [entry.sourceId, entry]));
        const discoveredIds = new Set(discovered.map((obj) => obj.id));

        for (const entry of existing) {
            if (!discoveredIds.has(entry.sourceId) && entry.active !== false) {
                await markInactive(this, entry.sourceId);
            }
        }

        for (const obj of discovered) {
            const entry = existingById.get(obj.id);
            if (entry && (entry.active === false || entry.historyInstance !== obj.historyInstance)) {
                await setCatalogEntry(this, {
                    ...entry,
                    active: true,
                    historyInstance: obj.historyInstance,
                    lastSeen: new Date().toISOString(),
                });
            }
        }

        const { needsReview } = await runOnboarding(this, this.provider, discovered);

        try {
            if (needsReview.length > 0) {
                const question = needsReview
                    .map((entry) => `- ${entry.sourceId}: wofuer steht dieser Wert?`)
                    .join('\n');
                await appendChatMessage(this, 'assistant', `Ich bin mir bei folgenden Objekten unsicher:\n${question}`);
            }
        } catch (error) {
            this.log.warn(`Konnte Rueckfrage nicht im Chat protokollieren: ${error.message}`);
        }
    }

    async runProactiveCheck() {
        this.log.silly('Proaktive Pruefung: Lauf gestartet');

        if (await isBudgetExceeded(this)) {
            this.log.warn('Proaktive Pruefung: Tagesbudget an Tokens ist erschoepft, Lauf wird uebersprungen.');
            return;
        }

        const silentIfNothingFound = this.config.silentIfNothingFound === true;

        const { finalText, usage } = await runAgent({
            provider: this.provider,
            tools: this.tools,
            systemPrompt:
                `Aktuelle Zeit: ${new Date().toISOString()} (${Date.now()} ms seit Epoch, Unix-Millisekunden). ` +
                'Du pruefst katalogisierte Smart-Home-Objekte auf Auffaelligkeiten (Geraetenutzung, Beleuchtung, ' +
                'Verbrauch, PV-Einspeisung) der letzten 24 Stunden. Begruende Auffaelligkeiten mit konkreten Werten. ' +
                'Zeitangaben fuer getHistory/compareTimeframes sind IMMER Unix-Millisekunden relativ zur oben genannten aktuellen Zeit. ' +
                'Wenn nichts auffaellig ist, antworte kurz mit "Keine Auffaelligkeiten."',
            userMessage: 'Fuehre die periodische Pruefung durch.',
        });

        await recordUsage(this, usage);

        const isNothingFound = finalText.trim().toLowerCase().startsWith('keine auffaelligkeiten');
        this.log.silly(`Proaktive Pruefung: Lauf beendet, Ergebnis: ${isNothingFound ? 'keine Auffaelligkeiten' : 'Auffaelligkeit gefunden'}`);

        if (isNothingFound && silentIfNothingFound) {
            return;
        }

        await appendChatMessage(this, 'assistant', finalText);
    }

    async onMessage(obj) {
        if (!obj || obj.command !== 'chatQuestion') return;

        const question = obj.message && obj.message.text;

        if (typeof question !== 'string' || !question.trim()) {
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: 'Leere Frage' }, obj.callback);
            }
            return;
        }

        this.log.silly(`Chat: Frage erhalten: ${question.slice(0, 200)}`);

        if (await isBudgetExceeded(this)) {
            this.log.warn('Chat: Tagesbudget an Tokens ist erschoepft, Frage wird nicht beantwortet.');
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: 'Tagesbudget an Tokens ist erschoepft.' }, obj.callback);
            }
            return;
        }

        try {
            await appendChatMessage(this, 'user', question);
            const priorEntries = await getRecentChatHistory(this, 10);
            const priorMessages = priorEntries.map((entry) => ({ role: entry.role, content: entry.text }));

            const { finalText, usage } = await runAgent({
                provider: this.provider,
                tools: this.tools,
                systemPrompt:
                    `Aktuelle Zeit: ${new Date().toISOString()} (${Date.now()} ms seit Epoch, Unix-Millisekunden). ` +
                    'Du beantwortest Fragen zu Smart-Home-Verbrauchsdaten anhand der katalogisierten Objekte. ' +
                    'Zeitangaben fuer getHistory/compareTimeframes sind IMMER Unix-Millisekunden relativ zur oben genannten aktuellen Zeit. ' +
                    'Falls der Nutzer eine offene Rueckfrage zu einem unsicheren Objekt beantwortet (du kannst offene Rueckfragen mit ' +
                    'listCatalog({needsReviewOnly: true}) einsehen), aktualisiere den Eintrag mit updateCatalogEntry.',
                userMessage: question,
                priorMessages,
            });

            await recordUsage(this, usage);
            this.log.silly(`Chat: Antwort gesendet: ${finalText.slice(0, 200)}`);

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
            if (this.stopScheduler) this.stopScheduler();
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
