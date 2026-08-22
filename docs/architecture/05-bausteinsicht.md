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
├── agent.js              Provider-agnostischer Tool-Calling-Loop
├── chatLog.js            Gedeckelte Chat-Historie (State-Speicher)
├── usage.js              Taeglicher Token-Verbrauch (Budget-Check) + unbegrenzte Verlaufs-Historie pro Zweck
├── onboarding.js          Klassifiziert neu entdeckte Objekte (Batch-Prompt)
├── providerHealthCheck.js Erreichbarkeits-Selbstpruefung der konfigurierten Provider
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
| `dataAccess.js` | Rohdatenabruf + Aggregation über die generische History-API | `getHistory`, `compareTimeframes` |
| `providers/*` | LLM-Aufruf hinter einheitlicher Schnittstelle, inkl. Retry | `createProvider(config) => {chat({system,messages,tools})}` |
| `tools.js` | Bindet Katalog + Datenzugriff als vom Agenten aufrufbare Werkzeuge (`listCatalog` blendet `ignored`/`needsReview`/inaktive Einträge aus) | `buildTools(adapter) => {definitions, execute}` |
| `adminCommands.js` | Geräte-Liste/-Update/-Entfernen, manueller Re-Scan/Prüf-Trigger für den Admin-Tab — voller Katalog-Schreibzugriff, separate Vertrauensgrenze vom LLM-Tool (siehe [ADR-0020](../adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md)) | `listCatalogEntries`, `updateCatalogEntryAdmin`, `removeCatalogEntry`, `runDiscoveryNow`, `runProactiveCheckNow` |
| `agent.js` | Iterativer Tool-Use-Loop bis zur finalen Antwort | `runAgent({provider,tools,systemPrompt,userMessage}) => {finalText,messages}` |
| `chatLog.js` | Persistiert Chat-/Meldungsverlauf, gedeckelt auf 200 Einträge | `ensureChatHistoryState`, `appendChatMessage` |
| `usage.js` | Verfolgt taeglichen Token-Verbrauch fuers Budget (`dailyTokenBudget`) und eine unbegrenzte, nach Chat/Pruefung vs. Onboarding getrennte Tages-Historie fuer den Kosten-Tab (siehe [ADR-0022](../adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md)) | `ensureUsageState`, `recordUsage(adapter,usage,purpose='chat')`, `getTodayUsage`, `getUsageHistory`, `isBudgetExceeded` |
| `onboarding.js` | Klassifiziert unbekannte Objekte, markiert unsichere als `needsReview`; übernimmt den Raum deterministisch aus `enum.rooms.*`, falls das Objekt dort Mitglied ist | `runOnboarding(adapter,provider,discoveredObjects) => {classifiedCount,needsReview}` |
| `providerHealthCheck.js` | Minimaler Test-Call pro konfiguriertem Provider beim Start, persistiert Ergebnis als State | `checkProviderReachable(provider) => {reachable,error?}`, `ensureReachabilityStates(adapter)` |
| `scheduler.js` | Ruft `runCheck` periodisch auf, fängt Fehler ab | `startProactiveScheduler(adapter,{intervalMs,runCheck}) => stopFn` |
| `main.js` | Orchestriert alle Bausteine über den ioBroker-Adapter-Lifecycle | ioBroker-Standard (`onReady`, `onMessage`, `onUnload`) |

Das System bleibt bei Ebene 1 (Whitebox der `lib/*`-Module) — bei der aktuellen Größe (12 Module, jeweils 20–100 Zeilen, siehe [Known Gaps](11-risiken-und-schulden.md) zu Wachstum von `main.js`) liefert eine Ebene-2-Zerlegung (z. B. Whitebox von `providers/`) keinen zusätzlichen Erkenntnisgewinn.

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [4. Lösungsstrategie](04-loesungsstrategie.md) · weiter zu [6. Laufzeitsicht](06-laufzeitsicht.md)
