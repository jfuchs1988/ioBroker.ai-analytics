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
        // Fail-closed: solange onReady die Pruefung nicht abgeschlossen hat, gilt kein Provider als erreichbar.
        this.chatProviderOk = false;
        this.onboardingProviderOk = false;
    }

    /**
     * Baut einen Provider und faengt Konfigurationsfehler ab, damit ein ungueltiger
     * Provider-Typ nicht den gesamten onReady-Lauf (und damit den jeweils anderen Provider) mitreisst.
     *
     * @returns {object|undefined} der Provider oder undefined bei fehlgeschlagener Konstruktion
     */
    buildProviderSafely(providerConfig, label) {
        try {
            return createProvider(providerConfig);
        } catch (error) {
            this.log.error(`${label} konnte nicht initialisiert werden: ${error && error.message ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Erreichbarkeitspruefung mit zwei Kurzschluessen vor dem eigentlichen Netzaufruf:
     * kein Provider (Konstruktion fehlgeschlagen) und "noch nicht konfiguriert" (kein API-Key,
     * Typ != local) — letzteres ist bei einer frischen Installation der Normalfall und
     * darf die Instanz nicht rot faerben.
     *
     * @returns {Promise<{reachable: boolean, error?: string}>} `error` nur, wenn ein echter Aufruf fehlschlug
     */
    async checkProviderConfigured(provider, providerConfig, label) {
        if (!provider) {
            // Fehler wurde bereits bei der Konstruktion geloggt.
            return { reachable: false };
        }
        if (!providerConfig.apiKey && providerConfig.type !== 'local') {
            this.log.warn(`${label} ist noch nicht konfiguriert (kein API-Key hinterlegt) — Erreichbarkeitspruefung uebersprungen.`);
            return { reachable: false };
        }
        return checkProviderReachable(provider);
    }

    async onReady() {
        await ensureChatHistoryState(this);
        await ensureUsageState(this);
        await ensureReachabilityStates(this);

        const chatProviderConfig = {
            type: this.config.providerType,
            apiKey: this.config.apiKey,
            model: this.config.model,
            baseUrl: this.config.baseUrl,
        };
        this.chatProvider = this.buildProviderSafely(chatProviderConfig, 'Chat/Pruefungs-Modell');

        const onboardingProviderConfig = this.config.onboardingProviderType
            ? {
                  type: this.config.onboardingProviderType,
                  apiKey: this.config.onboardingApiKey,
                  model: this.config.onboardingModel,
                  baseUrl: this.config.onboardingBaseUrl,
              }
            : chatProviderConfig;
        this.onboardingProvider = this.config.onboardingProviderType
            ? this.buildProviderSafely(onboardingProviderConfig, 'Onboarding-Modell')
            : this.chatProvider;

        this.tools = buildTools(this);

        const chatCheck = await this.checkProviderConfigured(this.chatProvider, chatProviderConfig, 'Chat/Pruefungs-Modell');
        this.chatProviderOk = chatCheck.reachable;
        await this.setStateAsync(CHAT_STATE, { val: chatCheck.reachable, ack: true });
        if (!chatCheck.reachable && chatCheck.error) {
            this.log.error(`Chat/Pruefungs-Modell nicht erreichbar: ${chatCheck.error}`);
        }

        // Ohne eigenen Onboarding-Provider ist es derselbe Provider — dann auch dieselbe Pruefung.
        const onboardingCheck =
            this.onboardingProvider === this.chatProvider
                ? chatCheck
                : await this.checkProviderConfigured(this.onboardingProvider, onboardingProviderConfig, 'Onboarding-Modell');
        this.onboardingProviderOk = onboardingCheck.reachable;
        await this.setStateAsync(ONBOARDING_STATE, { val: onboardingCheck.reachable, ack: true });
        if (!onboardingCheck.reachable && onboardingCheck.error && this.onboardingProvider !== this.chatProvider) {
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
            // `skipped` unterscheidet "nichts Neues gefunden" von "gar nicht erst geschaut".
            return { foundCount: discovered.length, newCount: 0, reactivatedCount, skipped: 'onboardingProvider' };
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

        return { foundCount: discovered.length, newCount: classifiedCount, reactivatedCount, skipped: null };
    }

    /**
     * @returns {Promise<{skipped: boolean, reason?: string}>} `skipped: true` wenn der Lauf gar nicht stattfand
     */
    async runProactiveCheck() {
        this.log.silly('Proaktive Pruefung: Lauf gestartet');

        if (!this.chatProviderOk) {
            this.log.warn('Proaktive Pruefung uebersprungen, da das Chat/Pruefungs-Modell nicht erreichbar ist.');
            return { skipped: true, reason: 'chatProviderUnreachable' };
        }

        if (await isBudgetExceeded(this)) {
            this.log.warn('Proaktive Pruefung: Tagesbudget an Tokens ist erschoepft, Lauf wird uebersprungen.');
            return { skipped: true, reason: 'budgetExceeded' };
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

        await recordUsage(this, usage, 'chat');

        const isNothingFound = finalText.trim().toLowerCase().startsWith('keine auffaelligkeiten');
        this.log.silly(`Proaktive Pruefung: Lauf beendet, Ergebnis: ${isNothingFound ? 'keine Auffaelligkeiten' : 'Auffaelligkeit gefunden'}`);

        if (isNothingFound && silentIfNothingFound) {
            return { skipped: false };
        }

        await appendChatMessage(this, 'assistant', finalText);
        return { skipped: false };
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

                await recordUsage(this, usage, 'chat');
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
