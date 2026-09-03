// main.js
'use strict';

const utils = require('@iobroker/adapter-core');
const { findHistorizedObjects } = require('./lib/discovery');
const { getAllCatalogEntries, setCatalogEntry, markInactive } = require('./lib/catalog');
const { createProvider } = require('./lib/providers');
const { checkProviderReachable, ensureReachabilityStates, CHAT_STATE, ONBOARDING_STATE } = require('./lib/providerHealthCheck');
const { buildTools } = require('./lib/tools');
const { runAgent, MAX_ITERATIONS } = require('./lib/agent');
const { runOnboarding } = require('./lib/onboarding');
const { ensureChatHistoryState, appendChatMessage, getRecentChatHistory } = require('./lib/chatLog');
const { startProactiveScheduler } = require('./lib/scheduler');
const { ensureUsageState, recordUsage, isBudgetExceeded } = require('./lib/usage');
const adminCommands = require('./lib/adminCommands');
const adminBridge = require('./lib/adminBridge');
const { buildTimeAndLocationContext } = require('./lib/promptContext');
const { classifyValueKind } = require('./lib/valueKindClassifier');
const { ensureHealthState, consumeFailureReports } = require('./lib/historyHealth');

const VALUE_KIND_BACKFILL_BATCH_SIZE = 20;
const CATALOG_SYNC_STATE = 'catalogSync';

class AiAnalytics extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'ai-analytics' });
        this.on('ready', this.onReady.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('stateChange', this.onBridgeStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.stopScheduler = null;
        // Fail-closed: solange onReady die Pruefung nicht abgeschlossen hat, gilt kein Provider als erreichbar.
        this.chatProviderOk = false;
        this.onboardingProviderOk = false;
        this.catalogSyncState = { running: false, phase: 'idle', processed: 0, total: 0, message: '' };
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

    async ensureCatalogSyncState() {
        await this.setObjectNotExistsAsync(CATALOG_SYNC_STATE, {
            type: 'state',
            common: {
                name: 'Catalog sync progress',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setStateAsync(CATALOG_SYNC_STATE, { val: JSON.stringify(this.catalogSyncState), ack: true });
    }

    async updateCatalogSyncState(partial) {
        this.catalogSyncState = { ...this.catalogSyncState, ...partial };
        await this.setStateAsync(CATALOG_SYNC_STATE, { val: JSON.stringify(this.catalogSyncState), ack: true });
    }

    async onReady() {
        await ensureChatHistoryState(this);
        await ensureUsageState(this);
        await ensureHealthState(this);
        await ensureReachabilityStates(this);
        await this.ensureCatalogSyncState();
        await adminBridge.ensureBridgeState(this);
        await this.subscribeStatesAsync(adminBridge.BRIDGE_STATE);

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

    async syncCatalog(options = {}) {
        await this.updateCatalogSyncState({
            running: true,
            phase: 'discover',
            processed: 0,
            total: 0,
            message: 'Suche historisierte Datenpunkte...',
            startedAt: new Date().toISOString(),
            finishedAt: null,
            error: null,
        });

        try {
            const discovered = await findHistorizedObjects(this);
            const existing = await getAllCatalogEntries(this);
            const existingById = new Map(existing.map((entry) => [entry.sourceId, entry]));
            const discoveredIds = new Set(discovered.map((obj) => obj.id));

            await this.updateCatalogSyncState({
                phase: 'reactivate',
                message: `Pruefe ${discovered.length} gefundene Datenpunkte...`,
                total: discovered.length,
                processed: 0,
            });

            for (const entry of existing) {
                if (!discoveredIds.has(entry.sourceId) && entry.active !== false) {
                    await markInactive(this, entry.sourceId);
                }
            }

            let reactivatedCount = 0;
            for (let index = 0; index < discovered.length; index++) {
                const obj = discovered[index];
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
                await this.updateCatalogSyncState({
                    phase: 'reactivate',
                    processed: index + 1,
                    total: discovered.length,
                    message: `Reaktiviere und pruefe ${index + 1}/${discovered.length} Datenpunkte...`,
                });
            }

        if (options.skipClassification) {
            const result = { foundCount: discovered.length, newCount: 0, reactivatedCount, skipped: 'classification' };
            await this.updateCatalogSyncState({
                running: false,
                phase: 'done',
                processed: discovered.length,
                total: discovered.length,
                currentSourceId: null,
                message: `Sync abgeschlossen (nur Updates): ${reactivatedCount} reaktiviert, Klassifikation uebersprungen.`,
                finishedAt: new Date().toISOString(),
                error: null,
            });
            return result;
        }

        if (!this.onboardingProviderOk) {
            this.log.warn('Klassifikation neuer Objekte uebersprungen, da das Onboarding-Modell nicht erreichbar ist.');
            // `skipped` unterscheidet "nichts Neues gefunden" von "gar nicht erst geschaut".
            const skippedResult = { foundCount: discovered.length, newCount: 0, reactivatedCount, skipped: 'onboardingProvider' };
            await this.updateCatalogSyncState({
                running: false,
                phase: 'done',
                processed: discovered.length,
                total: discovered.length,
                currentSourceId: null,
                message: 'Sync abgeschlossen, aber das Onboarding-Modell war nicht erreichbar.',
                finishedAt: new Date().toISOString(),
                error: null,
            });
            return skippedResult;
        }

            await this.updateCatalogSyncState({
                phase: 'onboarding',
                processed: 0,
                total: discovered.length,
                message: `Klassifiziere ${discovered.length} Datenpunkte...`,
            });

            const { classifiedCount, needsReview } = await runOnboarding(this, this.onboardingProvider, discovered, async (progress) => {
                await this.updateCatalogSyncState({
                    phase: 'onboarding',
                    processed: progress.processed,
                    total: progress.total,
                    message: progress.message || `Klassifiziere ${progress.processed}/${progress.total} Datenpunkte...`,
                    currentSourceId: progress.currentSourceId || null,
                });
            });

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

            if (this.config.enableValueKindBackfill) {
                const currentEntries = await getAllCatalogEntries(this);
                await this.updateCatalogSyncState({
                    phase: 'backfill',
                    processed: 0,
                    total: currentEntries.length,
                    currentSourceId: null,
                    message: `Pruefe Auspraegungen fuer ${currentEntries.length} bestehende Datenpunkte...`,
                });
                await this.backfillValueKinds(currentEntries);
            }

            const result = { foundCount: discovered.length, newCount: classifiedCount, reactivatedCount, skipped: null };
            await this.updateCatalogSyncState({
                running: false,
                phase: 'done',
                processed: discovered.length,
                total: discovered.length,
                currentSourceId: null,
                message: `Sync abgeschlossen: ${classifiedCount} neu, ${reactivatedCount} reaktiviert.`,
                finishedAt: new Date().toISOString(),
                error: null,
            });
            return result;
        } catch (error) {
            await this.updateCatalogSyncState({
                running: false,
                phase: 'error',
                currentSourceId: null,
                message: `Sync fehlgeschlagen: ${error.message}`,
                finishedAt: new Date().toISOString(),
                error: error.message,
            });
            throw error;
        }
    }

    async backfillValueKinds(entries) {
        const pending = entries
            .filter((entry) => entry.active !== false && !entry.ignored && !entry.valueKind)
            .slice(0, VALUE_KIND_BACKFILL_BATCH_SIZE);

        for (let index = 0; index < pending.length; index++) {
            const entry = pending[index];
            try {
                const sourceObj = await this.getForeignObjectAsync(entry.sourceId);
                const obj = { id: entry.sourceId, common: (sourceObj && sourceObj.common) || {} };
                const result = await classifyValueKind(this, obj, entry.historyInstance);
                await setCatalogEntry(this, { ...entry, ...result });
                if (this.log && this.log.silly) {
                    this.log.silly(`valueKind-Backfill: ${entry.sourceId} -> ${result.valueKind} (${result.valueKindConfidence}, ${result.valueKindSource})`);
                }
            } catch (error) {
                if (this.log) {
                    this.log.error(`valueKind-Backfill fuer ${entry.sourceId} fehlgeschlagen: ${error.message}`);
                }
            }

            await this.updateCatalogSyncState({
                phase: 'backfill',
                processed: index + 1,
                total: pending.length,
                currentSourceId: entry.sourceId,
                message: `Pruefe Auspraegungen ${index + 1}/${pending.length}...`,
            });
        }

        return { backfilledCount: pending.length };
    }

    async appendHistoryFailureReports() {
        const reports = await consumeFailureReports(this);
        for (const report of reports) {
            await appendChatMessage(
                this,
                'assistant',
                `Die History-Instanz ${report.historyInstance} ist nach drei Fehlern voruebergehend pausiert. ` +
                    'Weitere Versuche erfolgen nach 12, 24 und 48 Stunden. ' +
                    `Letzter Fehler: ${report.error || 'unbekannter Fehler'}`
            );
        }
    }

    /**
     * @returns {Promise<{skipped: boolean, reason?: string}>} `skipped: true` wenn der Lauf gar nicht stattfand
     */
    async runProactiveCheck() {
        this.log.silly('Proaktive Pruefung: Lauf gestartet');
        await this.updateCatalogSyncState({ running: true, phase: 'check', processed: 0, total: MAX_ITERATIONS, message: 'Prüfung der Geräte läuft ...', error: null });

        if (!this.chatProviderOk) {
            this.log.warn('Proaktive Pruefung uebersprungen, da das Chat/Pruefungs-Modell nicht erreichbar ist.');
            await this.updateCatalogSyncState({ running: false, phase: 'done', processed: MAX_ITERATIONS, total: MAX_ITERATIONS, message: 'Prüfung übersprungen: Modell nicht erreichbar.' });
            return { skipped: true, reason: 'chatProviderUnreachable' };
        }

        if (await isBudgetExceeded(this)) {
            this.log.warn('Proaktive Pruefung: Tagesbudget an Tokens ist erschoepft, Lauf wird uebersprungen.');
            await this.updateCatalogSyncState({ running: false, phase: 'done', processed: MAX_ITERATIONS, total: MAX_ITERATIONS, message: 'Prüfung übersprungen: Budget erschöpft.' });
            return { skipped: true, reason: 'budgetExceeded' };
        }

        const silentIfNothingFound = this.config.silentIfNothingFound === true;

        const timeAndLocation = await buildTimeAndLocationContext(this);
        let finalText;
        let usage;
        try {
            ({ finalText, usage } = await runAgent({
                provider: this.chatProvider,
                tools: this.tools,
                systemPrompt:
                    timeAndLocation +
                    'Du pruefst katalogisierte Smart-Home-Objekte auf Auffaelligkeiten (Geraetenutzung, Beleuchtung, ' +
                    'Verbrauch, PV-Einspeisung) der letzten 24 Stunden. Begruende Auffaelligkeiten mit konkreten Werten. ' +
                    'Zeitangaben fuer getHistory/compareTimeframes sind IMMER Unix-Millisekunden relativ zur oben genannten aktuellen Zeit. ' +
                    'Bevorzuge getPeriodTotal/comparePeriods, sobald fuer ein Objekt ein valueKind bekannt ist (siehe listCatalog), ' +
                    'da diese automatisch die passende Rechenoperation fuer Momentanwerte, Zaehler und Schalter anwenden. ' +
                    'Nutze in deiner Antwort IMMER die "description" aus den Werkzeug-Ergebnissen (getHistory/compareTimeframes) statt der rohen sourceId, damit die Ausgabe fuer den Nutzer lesbar ist. ' +
                    'Wenn nichts auffaellig ist, antworte kurz mit "Keine Auffaelligkeiten."',
                userMessage: 'Fuehre die periodische Pruefung durch.',
                onProgress: progress => this.updateCatalogSyncState({ phase: 'check', processed: progress.processed, total: progress.total, message: `Prüfung läuft ... ${Math.round((progress.processed / progress.total) * 100)}%` }),
            }));
        } catch (error) {
            await this.updateCatalogSyncState({ running: false, phase: 'error', message: `Prüfung fehlgeschlagen: ${error.message}`, error: error.message, finishedAt: new Date().toISOString() });
            throw error;
        }

        await recordUsage(this, usage, 'chat');

        const isNothingFound = finalText.trim().toLowerCase().startsWith('keine auffaelligkeiten');
        this.log.silly(`Proaktive Pruefung: Lauf beendet, Ergebnis: ${isNothingFound ? 'keine Auffaelligkeiten' : 'Auffaelligkeit gefunden'}`);

        if (isNothingFound && silentIfNothingFound) {
            await this.appendHistoryFailureReports();
            await this.updateCatalogSyncState({ running: false, phase: 'done', processed: MAX_ITERATIONS, total: MAX_ITERATIONS, message: 'Prüfung abgeschlossen.', finishedAt: new Date().toISOString() });
            return { skipped: false };
        }

        await this.appendHistoryFailureReports();
        await appendChatMessage(this, 'assistant', finalText);
        await this.updateCatalogSyncState({ running: false, phase: 'done', processed: MAX_ITERATIONS, total: MAX_ITERATIONS, message: 'Prüfung abgeschlossen.', finishedAt: new Date().toISOString() });
        return { skipped: false };
    }

    /**
     * Beantwortet eine Chat-Frage. Wirft bei Ablehnungsgruenden (Provider nicht
     * erreichbar, Budget erschoepft, Aufruffehler) — der Aufrufer verpackt das
     * als {error}-Antwort. Genau dieselben Guard-Texte wie vor dem Refactoring.
     */
    async processChatQuestion(question) {
        if (!this.chatProviderOk) {
            this.log.warn('Chat: Frage nicht beantwortet, da das Chat/Pruefungs-Modell nicht erreichbar ist.');
            throw new Error('Chat-Modell derzeit nicht erreichbar, siehe Log/Admin-Konfiguration.');
        }

        if (await isBudgetExceeded(this)) {
            this.log.warn('Chat: Tagesbudget an Tokens ist erschoepft, Frage wird nicht beantwortet.');
            throw new Error('Tagesbudget an Tokens ist erschoepft.');
        }

        await appendChatMessage(this, 'user', question);
        const priorEntries = await getRecentChatHistory(this, 10);
        const priorMessages = priorEntries.map((entry) => ({ role: entry.role, content: entry.text }));

        const timeAndLocation = await buildTimeAndLocationContext(this);
        const { finalText, usage } = await runAgent({
            provider: this.chatProvider,
            tools: this.tools,
            systemPrompt:
                timeAndLocation +
                'Du beantwortest Fragen zu Smart-Home-Verbrauchsdaten anhand der katalogisierten Objekte. ' +
                'Zeitangaben fuer getHistory/compareTimeframes sind IMMER Unix-Millisekunden relativ zur oben genannten aktuellen Zeit. ' +
                'Bevorzuge getPeriodTotal/comparePeriods, sobald fuer ein Objekt ein valueKind bekannt ist (siehe listCatalog), ' +
                'da diese automatisch die passende Rechenoperation fuer Momentanwerte, Zaehler und Schalter anwenden. ' +
                 'Nutze in deiner Antwort IMMER die "description" aus den Werkzeug-Ergebnissen (getHistory/compareTimeframes) statt der rohen sourceId, damit die Ausgabe fuer den Nutzer lesbar ist. ' +
                 'Falls der Nutzer nach seinem Standort oder der aktuellen Uhrzeit/Zeitzone fragt, nutze die oben genannten Angaben. ' +
                 'Falls der Nutzer eine offene Rueckfrage zu einem unsicheren Objekt beantwortet (du kannst offene Rueckfragen mit ' +
                 'listCatalog({needsReviewOnly: true}) einsehen), aktualisiere den Eintrag mit updateCatalogEntry. ' +
                 'Wenn der Nutzer mehrere Geräte erklärt oder eine bestehende Zuordnung korrigiert, nutze updateCatalogEntries. ' +
                 'Rufe dieses Schreibwerkzeug nur nach einer ausdruecklichen Nutzerangabe auf, fasse die gespeicherten Zuordnungen danach kurz zusammen ' +
                 'und verwende für die Antwort weiterhin die gepflegte description statt der rohen sourceId.',
            userMessage: question,
            priorMessages,
        });

        await recordUsage(this, usage, 'chat');
        await this.appendHistoryFailureReports();
        this.log.silly(`Chat: Antwort gesendet: ${finalText.slice(0, 200)}`);

        return appendChatMessage(this, 'assistant', finalText);
    }

    /**
     * Zentrale Ausfuehrung eines UI-Befehls (sendTo-Pfad UND State-Bridge-Pfad).
     * Wirft im Fehlerfall; der jeweilige Transport verpackt die Fehlermeldung selbst.
     */
    async dispatchAdapterCommand(command, message) {
        if (command === 'chatQuestion') {
            const question = message && message.text;
            if (typeof question !== 'string' || !question.trim()) {
                throw new Error('Leere Frage');
            }
            this.log.silly(`Chat: Frage erhalten: ${question.slice(0, 200)}`);
            return this.processChatQuestion(question);
        }

        const adminCommandHandlers = {
            listProviderModels: () => adminCommands.listProviderModels(this, message),
            listCatalogEntries: () => adminCommands.listCatalogEntries(this),
            updateCatalogEntryAdmin: () => adminCommands.updateCatalogEntryAdmin(this, message),
            removeCatalogEntry: () => adminCommands.removeCatalogEntry(this, message),
            runDiscoveryNow: () => adminCommands.runDiscoveryNow(this),
            runDiscoveryOnly: () => adminCommands.runDiscoveryOnly(this),
            runProactiveCheckNow: () => adminCommands.runProactiveCheckNow(this),
        };

        const handler = adminCommandHandlers[command];
        if (!handler) {
            throw new Error(`Unbekannter Befehl: ${command}`);
        }
        return handler();
    }

    async onMessage(obj) {
        if (!obj || !obj.command) return;
        if (
            obj.command !== 'chatQuestion' &&
            obj.command !== 'listProviderModels' &&
            !adminBridge.ALLOWED_COMMANDS.includes(obj.command)
        )
            return;

        try {
            const result = await this.dispatchAdapterCommand(obj.command, obj.message);
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, result, obj.callback);
            }
        } catch (error) {
            if (obj.command === 'chatQuestion') {
                this.log.error(`Chat-Anfrage fehlgeschlagen: ${error.message}`);
            } else {
                this.log.error(`Admin-Befehl ${obj.command} fehlgeschlagen: ${error.message}`);
            }
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
            }
        }
    }

    async onBridgeStateChange(id, state) {
        try {
            await adminBridge.handleBridgeStateChange(this, id, state, (command, message) =>
                this.dispatchAdapterCommand(command, message)
            );
        } catch (error) {
            this.log.error(`Admin-Bridge: Verarbeitung fehlgeschlagen: ${error && error.message ? error.message : String(error)}`);
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
    const createAdapter = options => new AiAnalytics(options);
    createAdapter.AiAnalytics = AiAnalytics;
    module.exports = createAdapter;
} else {
    new AiAnalytics();
}
