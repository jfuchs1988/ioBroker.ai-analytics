// main.js
'use strict';

const utils = require('@iobroker/adapter-core');
const { findHistorizedObjects } = require('./lib/discovery');
const { getAllCatalogEntries, setCatalogEntry, markInactive } = require('./lib/catalog');
const { createProvider } = require('./lib/providers');
const { checkProviderReachable, ensureReachabilityStates, CHAT_STATE, ONBOARDING_STATE } = require('./lib/providerHealthCheck');
const { buildTools } = require('./lib/tools');
const { runAgent } = require('./lib/agent');
const { runOnboarding } = require('./lib/onboarding');
const { ensureChatHistoryState, appendChatMessage, getRecentChatHistory } = require('./lib/chatLog');
const { startProactiveScheduler } = require('./lib/scheduler');
const { ensureUsageState, recordUsage, isBudgetExceeded } = require('./lib/usage');
const adminCommands = require('./lib/adminCommands');

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
        await ensureReachabilityStates(this);

        this.chatProvider = createProvider({
            type: this.config.providerType,
            apiKey: this.config.apiKey,
            model: this.config.model,
            baseUrl: this.config.baseUrl,
        });
        this.onboardingProvider = this.config.onboardingProviderType
            ? createProvider({
                  type: this.config.onboardingProviderType,
                  apiKey: this.config.onboardingApiKey,
                  model: this.config.onboardingModel,
                  baseUrl: this.config.onboardingBaseUrl,
              })
            : this.chatProvider;
        this.tools = buildTools(this);

        const chatCheck = await checkProviderReachable(this.chatProvider);
        this.chatProviderOk = chatCheck.reachable;
        await this.setStateAsync(CHAT_STATE, { val: chatCheck.reachable, ack: true });
        if (!chatCheck.reachable) {
            this.log.error(`Chat/Pruefungs-Modell nicht erreichbar: ${chatCheck.error}`);
        }

        const onboardingCheck =
            this.onboardingProvider === this.chatProvider ? chatCheck : await checkProviderReachable(this.onboardingProvider);
        this.onboardingProviderOk = onboardingCheck.reachable;
        await this.setStateAsync(ONBOARDING_STATE, { val: onboardingCheck.reachable, ack: true });
        if (!onboardingCheck.reachable) {
            this.log.error(`Onboarding-Modell nicht erreichbar: ${onboardingCheck.error}`);
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

        let reactivatedCount = 0;
        for (const obj of discovered) {
            const entry = existingById.get(obj.id);
            if (entry && (entry.active === false || entry.historyInstance !== obj.historyInstance)) {
                await setCatalogEntry(this, {
                    ...entry,
                    active: true,
                    historyInstance: obj.historyInstance,
                    lastSeen: new Date().toISOString(),
                });
                reactivatedCount += 1;
            }
        }

        if (!this.onboardingProviderOk) {
            this.log.warn('Klassifikation neuer Objekte uebersprungen, da das Onboarding-Modell nicht erreichbar ist.');
            return { foundCount: discovered.length, newCount: 0, reactivatedCount };
        }

        const { classifiedCount, needsReview } = await runOnboarding(this, this.onboardingProvider, discovered);

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

        return { foundCount: discovered.length, newCount: classifiedCount, reactivatedCount };
    }

    async runProactiveCheck() {
        this.log.silly('Proaktive Pruefung: Lauf gestartet');

        if (!this.chatProviderOk) {
            this.log.warn('Proaktive Pruefung uebersprungen, da das Chat/Pruefungs-Modell nicht erreichbar ist.');
            return;
        }

        if (await isBudgetExceeded(this)) {
            this.log.warn('Proaktive Pruefung: Tagesbudget an Tokens ist erschoepft, Lauf wird uebersprungen.');
            return;
        }

        const silentIfNothingFound = this.config.silentIfNothingFound === true;

        const { finalText, usage } = await runAgent({
            provider: this.chatProvider,
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
        if (!obj || !obj.command) return;

        if (obj.command === 'chatQuestion') {
            const question = obj.message && obj.message.text;

            if (typeof question !== 'string' || !question.trim()) {
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { error: 'Leere Frage' }, obj.callback);
                }
                return;
            }

            this.log.silly(`Chat: Frage erhalten: ${question.slice(0, 200)}`);

            if (!this.chatProviderOk) {
                this.log.warn('Chat: Frage nicht beantwortet, da das Chat/Pruefungs-Modell nicht erreichbar ist.');
                if (obj.callback) {
                    this.sendTo(
                        obj.from,
                        obj.command,
                        { error: 'Chat-Modell derzeit nicht erreichbar, siehe Log/Admin-Konfiguration.' },
                        obj.callback
                    );
                }
                return;
            }

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
                    provider: this.chatProvider,
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
            return;
        }

        const adminCommandHandlers = {
            listCatalogEntries: () => adminCommands.listCatalogEntries(this),
            updateCatalogEntryAdmin: () => adminCommands.updateCatalogEntryAdmin(this, obj.message),
            removeCatalogEntry: () => adminCommands.removeCatalogEntry(this, obj.message),
            runDiscoveryNow: () => adminCommands.runDiscoveryNow(this),
            runProactiveCheckNow: () => adminCommands.runProactiveCheckNow(this),
        };

        const handler = adminCommandHandlers[obj.command];
        if (handler) {
            try {
                const result = await handler();
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, result, obj.callback);
                }
            } catch (error) {
                this.log.error(`Admin-Befehl ${obj.command} fehlgeschlagen: ${error.message}`);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                }
            }
            return;
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
