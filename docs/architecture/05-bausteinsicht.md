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
├── agent.js              Provider-agnostischer Tool-Calling-Loop
├── chatLog.js            Gedeckelte Chat-Historie (State-Speicher)
├── onboarding.js          Klassifiziert neu entdeckte Objekte (Batch-Prompt)
└── scheduler.js           Periodischer Trigger für proaktive Prüfung

main.js                  Verdrahtet alles: Adapter-Lifecycle, Katalog-Sync,
                          Chat-Message-Handler, Scheduler-Start/Stop
admin/
├── jsonConfig.json        Admin-Konfigurationsformular
├── tab.html / tab.js       Custom Chat-Tab (Legacy-Adapter-Tab-Muster)
```

## 5.2 Komponentenverantwortung (Whitebox)

| Baustein | Verantwortung | Schnittstelle nach außen |
|---|---|---|
| `discovery.js` | Objektbaum nach `common.custom[...].enabled` durchsuchen | `findHistorizedObjects(adapter) => [{id, historyInstance, common}]` |
| `catalog.js` | CRUD auf Katalogeinträgen (Adapter-States) | `getCatalogEntry`, `getAllCatalogEntries`, `setCatalogEntry`, `markInactive`, `CATEGORIES` |
| `dataAccess.js` | Rohdatenabruf + Aggregation über die generische History-API | `getHistory`, `compareTimeframes` |
| `providers/*` | LLM-Aufruf hinter einheitlicher Schnittstelle, inkl. Retry | `createProvider(config) => {chat({system,messages,tools})}` |
| `tools.js` | Bindet Katalog + Datenzugriff als vom Agenten aufrufbare Werkzeuge | `buildTools(adapter) => {definitions, execute}` |
| `agent.js` | Iterativer Tool-Use-Loop bis zur finalen Antwort | `runAgent({provider,tools,systemPrompt,userMessage}) => {finalText,messages}` |
| `chatLog.js` | Persistiert Chat-/Meldungsverlauf, gedeckelt auf 200 Einträge | `ensureChatHistoryState`, `appendChatMessage` |
| `onboarding.js` | Klassifiziert unbekannte Objekte, markiert unsichere als `needsReview` | `runOnboarding(adapter,provider,discoveredObjects) => {classifiedCount,needsReview}` |
| `scheduler.js` | Ruft `runCheck` periodisch auf, fängt Fehler ab | `startProactiveScheduler(adapter,{intervalMs,runCheck}) => stopFn` |
| `main.js` | Orchestriert alle Bausteine über den ioBroker-Adapter-Lifecycle | ioBroker-Standard (`onReady`, `onMessage`, `onUnload`) |

Das System bleibt bei Ebene 1 (Whitebox der `lib/*`-Module) — bei der aktuellen Größe (10 Module, jeweils 20–100 Zeilen, siehe [Known Gaps](11-risiken-und-schulden.md) zu Wachstum von `main.js`) liefert eine Ebene-2-Zerlegung (z. B. Whitebox von `providers/`) keinen zusätzlichen Erkenntnisgewinn.

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [4. Lösungsstrategie](04-loesungsstrategie.md) · weiter zu [6. Laufzeitsicht](06-laufzeitsicht.md)
