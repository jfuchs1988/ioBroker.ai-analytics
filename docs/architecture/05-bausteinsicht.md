# 5. Bausteinsicht

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 5.1 Ebene 1 — Gesamtsystem

```
lib/
├── discovery.js       Findet Objekte mit aktivierter History-Anbindung
├── catalog.js          Persistiert/liest semantische Metadaten pro Objekt
├── dataAccess.js        Liest historische Werte (getHistory) + Zeitraumvergleich
├── providers/
│   ├── anthropic.js      Anthropic-Messages-API-Client
│   ├── openaiCompatible.js  OpenAI/OpenRouter/lokal-Client
│   └── index.js           Provider-Auswahl + Retry-mit-Backoff
├── tools.js             Werkzeug-Definitionen (JSON-Schema) + Dispatcher
├── adminCommands.js      Admin-Message-Bus: Geräte-Verwaltung, manuelle Trigger
├── adminBridge.js          State-Bridge: Admin-Befehle aus dem Tab ohne sendTo-Kanal
├── agent.js              Provider-agnostischer Tool-Calling-Loop
├── chatLog.js            Gedeckelte Chat-Historie (State-Speicher)
├── usage.js              Taeglicher Token-Verbrauch (Budget-Check) + unbegrenzte Verlaufs-Historie pro Zweck
├── onboarding.js          Klassifiziert neu entdeckte Objekte (Batch-Prompt)
├── providerHealthCheck.js Erreichbarkeits-Selbstpruefung der konfigurierten Provider
├── promptContext.js        Standort (system.config) + lokale Zeitzone für Systemprompts
└── scheduler.js           Periodischer Trigger für proaktive Prüfung

main.js                  Verdrahtet alles: Adapter-Lifecycle, Katalog-Sync,
                          Chat-Message-Handler, Admin-Message-Bus, Scheduler-Start/Stop
admin/
├── jsonConfig.json        Admin-Konfigurationsformular
├── tab.html / tab.js       Custom Tab "AI Analytics" mit Sub-Navigation
                            (Chat / Geräte / Budget), gemeinsame Socket-Verbindung
```

## 5.2 Komponentenverantwortung (Whitebox)

| Baustein | Verantwortung | Schnittstelle nach außen |
|---|---|---|
| `discovery.js` | Objektbaum nach `common.custom[...].enabled` durchsuchen | `findHistorizedObjects(adapter) => [{id, historyInstance, common}]` |
| `catalog.js` | CRUD auf Katalogeinträgen (Adapter-States), inkl. hartem Löschen | `getCatalogEntry`, `getAllCatalogEntries`, `setCatalogEntry`, `markInactive`, `removeCatalogEntry`, `CATEGORIES` |
| `dataAccess.js` | Rohdatenabruf + Aggregation über die generische History-API; loggt vor jedem Abruf silly die exakte Anfrage (Ziel-Instanz, sourceId, Zeitraum, Aggregation, `count`) zur Nachvollziehbarkeit; übergibt bei gebündelten Aggregaten (`average`/`min`/`max`/`minmax`/`total`/`percentile`) immer ein aus dem Zeitraum berechnetes `count` (stündliche/tägliche/wöchentliche Buckets, gedeckelt auf 500), statt sich auf den unbekannten Adapter-Default zu verlassen; warnt bei rohen Aggregaten (`none`/`onchange`), wenn das Ergebnis das `count`-Limit erreicht (moegliche stille Datenlücke, siehe [Known Gaps](11-risiken-und-schulden.md)) | `getHistory`, `compareTimeframes`, `computeIntervalCount` |
| `providers/*` | LLM-Aufruf hinter einheitlicher Schnittstelle, inkl. Retry | `createProvider(config) => {chat({system,messages,tools})}` |
| `tools.js` | Bindet Katalog + Datenzugriff als vom Agenten aufrufbare Werkzeuge (`listCatalog` blendet `ignored`/`needsReview`/inaktive Einträge aus); `getHistory`/`compareTimeframes` reichern das Ergebnis um `description`/`room`/`unit` aus dem Katalogeintrag an, damit der Agent im Chat die Beschreibung statt der rohen sourceId nennen kann | `buildTools(adapter) => {definitions, execute}` |
| `adminCommands.js` | Geräte-Liste/-Update/-Entfernen, manueller Re-Scan/Prüf-Trigger für den Admin-Tab — voller Katalog-Schreibzugriff, separate Vertrauensgrenze vom LLM-Tool (siehe [ADR-0020](../adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md)) | `listCatalogEntries`, `updateCatalogEntryAdmin`, `removeCatalogEntry`, `runDiscoveryNow`, `runProactiveCheckNow` |
| `adminBridge.js` | State-Bridge als Ausweichkanal für den Admin-Tab: Befehle werden als JSON in den State `admin.bridge` geschrieben (`ack:false`), vom Adapter über `stateChange` verarbeitet und mit `ack:true` beantwortet — nötig, weil `sendTo` aus dem Legacy-HTML-Tab im React-Admin nicht zuverlässig beim Adapter ankommt, `getState`/`setState` dagegen schon (siehe [ADR-0023](../adr/0023-state-bridge-ausweichkanal-admin-tab.md)). Nur Whitelist-Befehle; eigene Antworten werden über `ack:true` ignoriert | `ensureBridgeState`, `handleBridgeStateChange(adapter,id,state,dispatch) => boolean`, `parseRequest`, `ALLOWED_COMMANDS`, `BRIDGE_STATE` |
| `agent.js` | Iterativer Tool-Use-Loop bis zur finalen Antwort | `runAgent({provider,tools,systemPrompt,userMessage}) => {finalText,messages}` |
| `chatLog.js` | Persistiert Chat-/Meldungsverlauf, gedeckelt auf 200 Einträge | `ensureChatHistoryState`, `appendChatMessage` |
| `usage.js` | Verfolgt taeglichen Token-Verbrauch fuers Budget (`dailyTokenBudget`) und eine unbegrenzte, nach Chat/Pruefung vs. Onboarding getrennte Tages-Historie fuer den Kosten-Tab (siehe [ADR-0022](../adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md)) | `ensureUsageState`, `recordUsage(adapter,usage,purpose='chat')`, `getTodayUsage`, `getUsageHistory`, `isBudgetExceeded` |
| `onboarding.js` | Klassifiziert unbekannte Objekte, markiert unsichere als `needsReview`; übernimmt den Raum deterministisch aus `enum.rooms.*`, falls das Objekt dort Mitglied ist; Klassifikations-Batches werden nach Adaptertyp gruppiert (nie zwei Adaptertypen in einem Batch) und die KI wird angewiesen, Beschreibungen auf Deutsch in Alltagssprache zu formulieren | `runOnboarding(adapter,provider,discoveredObjects) => {classifiedCount,needsReview}`, `buildBatches(objects,batchSize) => object[][]`, `adapterTypeOf(sourceId) => string` |
| `providerHealthCheck.js` | Minimaler Test-Call pro konfiguriertem Provider beim Start, persistiert Ergebnis als State | `checkProviderReachable(provider) => {reachable,error?}`, `ensureReachabilityStates(adapter)` |
| `promptContext.js` | Liest Standort (`system.config.common.city/country/latitude/longitude`) und ermittelt die lokale Zeitzone des Host-Prozesses (`Intl`), formatiert beides zusammen mit aktueller UTC-/Unix-Zeit als Kontextblock für Agent-Systemprompts — ohne das wusste der Agent nur die UTC-Zeit, nicht Standort oder Zeitzone des Nutzers | `buildTimeAndLocationContext(adapter, now=new Date()) => string`, `getSystemLocation`, `getLocalTimeZone`, `formatLocalTime` |
| `scheduler.js` | Ruft `runCheck` periodisch auf, fängt Fehler ab | `startProactiveScheduler(adapter,{intervalMs,runCheck}) => stopFn` |
| `main.js` | Orchestriert alle Bausteine über den ioBroker-Adapter-Lifecycle | ioBroker-Standard (`onReady`, `onMessage`, `onUnload`) |

Das System bleibt bei Ebene 1 (Whitebox der `lib/*`-Module) — bei der aktuellen Größe (14 Module, jeweils 20–100 Zeilen, siehe [Known Gaps](11-risiken-und-schulden.md) zu Wachstum von `main.js`) liefert eine Ebene-2-Zerlegung (z. B. Whitebox von `providers/`) keinen zusätzlichen Erkenntnisgewinn.

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [4. Lösungsstrategie](04-loesungsstrategie.md) · weiter zu [6. Laufzeitsicht](06-laufzeitsicht.md)
