# 5. Bausteinsicht

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 5.1 Ebene 1 — Gesamtsystem

```
lib/
├── discovery.js       Findet Objekte mit aktivierter History-Anbindung
├── catalog.js          Persistiert/liest semantische Metadaten pro Objekt
├── dataAccess.js        Liest historische Werte (getHistory) + Zeitraumvergleich
├── historyHealth.js      Persistenter Fehlerstatus und abgestufte History-Retries
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
├── valueKindClassifier.js  Klassifiziert Datenpunkt-Verhalten für typbewusste Auswertung
├── dataQualityClassifier.js Klassifiziert Schreibbarkeit/-muster/-frequenz/Vollstaendigkeit
└── scheduler.js           Periodischer Trigger für proaktive Prüfung

main.js                  Verdrahtet alles: Adapter-Lifecycle, Katalog-Sync,
                          Chat-Message-Handler, Admin-Message-Bus, Scheduler-Start/Stop
admin/
├── jsonConfig.json        Admin-Konfigurationsformular
├── tab.html / tab.js       Custom Tab "AI Analytics" mit Sub-Navigation
                             (Chat / Budget), gemeinsame Socket-Verbindung
├── custom/                 Gebündelte JSON-Config-Custom-Komponente für die Geräteverwaltung
```

## 5.2 Komponentenverantwortung (Whitebox)

| Baustein | Verantwortung | Schnittstelle nach außen |
|---|---|---|
| `discovery.js` | Objektbaum nach `common.custom[...].enabled` durchsuchen | `findHistorizedObjects(adapter) => [{id, historyInstance, common}]` |
| `catalog.js` | CRUD auf Katalogeinträgen (Adapter-States), inkl. hartem Löschen; `derivedMetricRole`/`derivedMetricGroupId` verknüpfen optional zwei Einträge für abgeleitete Kennzahlen (nur zusammen gesetzt) | `getCatalogEntry`, `getAllCatalogEntries`, `setCatalogEntry`, `markInactive`, `removeCatalogEntry`, `CATEGORIES`, `DERIVED_METRIC_ROLES` |
| `dataAccess.js` | Rohdatenabruf + Aggregation über die generische History-API; protokolliert History-Fehler im Health-Modul und setzt den Status bei erfolgreicher Abfrage zurück | `getHistory`, `compareTimeframes`, `computeIntervalCount` |
| `historyHealth.js` | Persistiert Fehler je History-Instanz, meldet nach drei Fehlern einmalig, pausiert die Instanz und erlaubt Retries nach 12, 24 und 48 Stunden | `ensureHealthState`, `recordHistoryFailure`, `recordHistorySuccess`, `isHistoryAvailable`, `consumeFailureReports` |
| `periodValue.js` | Berechnet einen typbewussten Periodenwert je `valueKind` (Momentanwert-Mittel, Tages-Zählerstand, kumulativer Delta oder Ein-Zeit/Schaltzahl bei Boolean); löst `dayOffset`-Perioden über lokale Kalendertag-Grenzen auf. Von `tools.js` (`getPeriodTotal`/`comparePeriods`) und `anomalyDetector.js` (Phase 2) genutzt | `computePeriodValue(adapter,entry,period)`, `resolvePeriod(period,now)` |
| `providers/*` | LLM-Aufruf hinter einheitlicher Schnittstelle, inkl. begrenztem Retry, Abort-Timeout, Response-Limit und URL-/Redirect-Prüfung; Modellauflistung für Anthropic und OpenAI-kompatible APIs | `createProvider(config) => {chat({system,messages,tools,signal})}`, `listModels(config)` |
| `tools.js` | Bindet Katalog + Datenzugriff als Werkzeuge; neben Rohdaten und Legacy-Vergleich stehen typbewusste `getPeriodTotal`/`comparePeriods` (Periodenberechnung aus `periodValue.js`), `getSelfConsumption` (Eigenverbrauchsquote aus einem per `derivedMetricGroupId` verknüpften Objektpaar) sowie nutzerbestätigte Batch-Katalogpflege zur Verfügung. Laufzeitlimits und ein Read-only-Modus schützen autonome Prüfungen | `buildTools(adapter, {readOnly}) => {definitions, execute}` |
| `adminCommands.js` | Provider-Modellvorschläge, Geräte-Liste/-Update/-Entfernen, manueller Re-Scan/Prüf-Trigger für JSON-Konfiguration und Custom-Tab — voller Katalog-Schreibzugriff, separate Vertrauensgrenze vom LLM-Tool (siehe [ADR-0020](../adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md)) | `listProviderModels`, `listCatalogEntries`, `updateCatalogEntryAdmin`, `removeCatalogEntry`, `runDiscoveryNow`, `runProactiveCheckNow` |
| `adminBridge.js` | State-Bridge als Ausweichkanal für den Admin-Tab: Befehle werden als JSON in den State `admin.bridge` geschrieben (`ack:false`), vom Adapter über `stateChange` verarbeitet und mit `ack:true` beantwortet — nötig, weil `sendTo` aus dem Legacy-HTML-Tab im React-Admin nicht zuverlässig beim Adapter ankommt, `getState`/`setState` dagegen schon (siehe [ADR-0023](../adr/0023-state-bridge-ausweichkanal-admin-tab.md)). Nur Whitelist-Befehle; eigene Antworten werden über `ack:true` ignoriert | `ensureBridgeState`, `handleBridgeStateChange(adapter,id,state,dispatch) => boolean`, `parseRequest`, `ALLOWED_COMMANDS`, `BRIDGE_STATE` |
| `agent.js` | Iterativer Tool-Use-Loop bis zur finalen Antwort; übernimmt optional die letzten Chat-Nachrichten und summiert Tokenverbrauch über alle Iterationen | `runAgent({provider,tools,systemPrompt,userMessage,priorMessages}) => {finalText,messages,usage}` |
| `chatLog.js` | Persistiert Chat-/Meldungsverlauf, gedeckelt auf 200 Einträge; liefert den Kontext für Folgefragen | `ensureChatHistoryState`, `appendChatMessage`, `getRecentChatHistory` |
| `usage.js` | Verfolgt taeglichen Token-Verbrauch und eine unbegrenzte, nach Chat/Pruefung vs. Onboarding getrennte Tages-Historie fuer den Kosten-Tab (siehe [ADR-0022](../adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md)); das Tagesbudget (`dailyBudgetEur`) ist ein EUR-Betrag, der gegen die aus Preisen berechneten Ist-Kosten des Tages geprueft wird (siehe [ADR-0028](../adr/0028-tagesbudget-in-eur-statt-token.md)) | `ensureUsageState`, `recordUsage(adapter,usage,purpose='chat')`, `getTodayUsage`, `getUsageHistory`, `isBudgetExceeded`, `refreshTodaySummary` |
| `onboarding.js` | Klassifiziert unbekannte Objekte, markiert unsichere als `needsReview`, wendet sichere Defaults für PV/Wärmepumpe, Shelly, Homematic und UniFi an, übernimmt den Raum deterministisch aus `enum.rooms.*`, falls das Objekt dort Mitglied ist; Klassifikations-Batches werden nach Adaptertyp gruppiert. Nach jedem Lauf schlägt eine rein namensbasierte Heuristik (kein LLM-Aufruf) ein PV-Erzeugung/Netzeinspeisung-Paar für `getSelfConsumption` vor, wenn genau ein eindeutiger Kandidat je Rolle existiert — sichtbar/änderbar im Geräte-Tab | `runOnboarding(adapter,provider,discoveredObjects) => {classifiedCount,needsReview}`, `buildBatches(objects,batchSize) => object[][]`, `adapterTypeOf(sourceId) => string`, `suggestSelfConsumptionPair(entries)` |
| `providerHealthCheck.js` | Minimaler Test-Call pro konfiguriertem Provider beim Start, persistiert Ergebnis als State | `checkProviderReachable(provider) => {reachable,error?}`, `ensureReachabilityStates(adapter)` |
| `promptContext.js` | Liest Standort (`system.config.common.city/country/latitude/longitude`) und ermittelt die lokale Zeitzone des Host-Prozesses (`Intl`), formatiert beides zusammen mit aktueller UTC-/Unix-Zeit als Kontextblock für Agent-Systemprompts und berechnet lokale Kalendertag-Grenzen | `buildTimeAndLocationContext(adapter, now=new Date()) => string`, `getSystemLocation`, `getLocalTimeZone`, `formatLocalTime`, `getLocalDayBoundaries` |
| `valueKindClassifier.js` | Zweistufige Klassifizierung aus Metadaten und Datenprobe mit Lookback 48h/7d/30d/365d; fuer InfluxDB-Samples werden bucketed `average`-Abfragen genutzt, um Rohdaten-Typkonflikte zu vermeiden | `classifyValueKind(adapter,obj,historyInstance)`, `classifyFromMetadata`, `detectPatternFromSamples`, `VALUE_KINDS` |
| `dataQualityClassifier.js` | Erkennt Schreibmuster (`continuous`/`on_change`) aus der Regelmäßigkeit der Schreibabstände und bewertet Datenvollständigkeit dazu passend (Median-Abstand bei `continuous`, eigene historische Maximallücke bei `on_change`); `writable` kommt direkt aus `common.write` | `classifyDataQuality(adapter,obj,historyInstance)`, `computeWritable`, `detectWritePattern`, `bucketUpdateFrequency`, `detectDataCompleteness` |
| `anomalyDetector.js` | Statistische Voranalyse vor der proaktiven LLM-Prüfung; berechnet robuste Abweichungen und filtert unauffällige Objekte heraus. Gauges: rollierendes 24h-Fenster gegen 7 Tage davor (Rohpunkte). Zähler/`boolean_state`: letzter vollständiger Kalendertag gegen 7 Kalendertage davor (Tageswerte aus `periodValue.js`) | `findAnomalyCandidates(adapter,entries,now)`, `detectSeriesAnomaly`, `detectDailyAggregateAnomaly`, `median`, `medianAbsoluteDeviation` |
| `license.js` | Offline-Entitlement-Prüfung für signierte Ed25519-JWS-Tokens; Beta-Guard, Sponsoring-Grace und tägliches Chat-Fallback | `evaluateLicense`, `canUseChat`, `canRunProactive`, `ensureLicenseStates` |
| `scheduler.js` | Ruft `runCheck` periodisch auf, fängt Fehler ab | `startProactiveScheduler(adapter,{intervalMs,runCheck}) => stopFn` |
| `main.js` | Orchestriert alle Bausteine über den ioBroker-Adapter-Lifecycle; serialisiert laufende Operationen und schreibt getrennte `catalogSync`-/`chatProgress`-States | ioBroker-Standard (`onReady`, `onMessage`, `onUnload`) |

Das System bleibt bei Ebene 1 (Whitebox der `lib/*`-Module) — bei der aktuellen Größe (20 Module, jeweils fokussiert, siehe [Known Gaps](11-risiken-und-schulden.md) zu Wachstum von `main.js`) liefert eine Ebene-2-Zerlegung (z. B. Whitebox von `providers/`) keinen zusätzlichen Erkenntnisgewinn.

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [4. Lösungsstrategie](04-loesungsstrategie.md) · weiter zu [6. Laufzeitsicht](06-laufzeitsicht.md)
