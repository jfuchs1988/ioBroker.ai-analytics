# ioBroker.ai-analytics — Architekturdokumentation (arc42)

Status: v0.0.1-beta released; manueller Abnahmetest läuft — Installation/Start/Discovery/Katalog bestätigt funktionierend, Admin-Chat-Tab bestätigt defekt (Diagnose unterbrochen, wird fortgesetzt) — siehe Abschnitt 11 für Details
Datum: 2026-08-21 (zuletzt aktualisiert während des laufenden manuellen Abnahmetests)
Quellen: [Design-Spec](../superpowers/specs/2026-08-21-ioBroker-ai-analytics-design.md), [Implementierungsplan](../superpowers/plans/2026-08-21-ai-analytics-implementation.md)

## 1. Einführung und Ziele

### 1.1 Aufgabenstellung

`ioBroker.ai-analytics` ist ein neuer ioBroker-Adapter, der zwei Fähigkeiten kombiniert:

1. **Chat-Q&A**: Der Nutzer stellt in natürlicher Sprache Fragen zu historischen Verbrauchs-/Nutzungsdaten (z. B. "Wie hat sich mein Stromverbrauch verändert und warum?"). Das System beantwortet sie anhand der in InfluxDB/History/SQL geloggten Objekte im ioBroker-Objektbaum.
2. **Proaktive Prüfungen**: Ein periodischer Hintergrundlauf lässt eine KI eigenständig auf Auffälligkeiten prüfen (Gerätenutzung, Lampen die lange an sind, Verbrauchsspitzen, ungewöhnlich niedrige PV-Einspeisung) und meldet Ergebnisse im Chat.

Auslöser war die Frage des Nutzers, welche KI/AI-Adapter es für ioBroker bereits gibt (AI Toolbox, AI Assistant von ToGe3688) — keiner davon deckte den konkreten Wunsch ab: Fragen zu historischen Daten mit Ursachenanalyse plus freie, KI-getriebene proaktive Überwachung. Daraus entstand die Entscheidung, einen eigenen, schlanken Adapter zu bauen.

### 1.2 Qualitätsziele

| Priorität | Qualitätsziel | Begründung/Szenario |
|---|---|---|
| 1 | **Nachvollziehbarkeit** | Jede Chat-Antwort und jede proaktive Meldung muss sich auf konkrete Werte/Vergleichszeiträume stützen — keine vagen Vermutungen (explizite Nutzeranforderung, siehe Spec §Fehlerbehandlung). |
| 2 | **Kontrollierter KI-Datenzugriff** | Die KI bekommt nie rohen Datenbank-Query-Zugriff, sondern nur kuratierte Werkzeuge — begrenzt Fehl-/Missbrauchsrisiko und hält das System portabel zwischen InfluxDB/History/SQL. |
| 3 | **Geringe Kosten/Overhead** | Katalog-Caching (einmaliges Onboarding statt Neu-Klassifizierung bei jeder Anfrage), kein Rohdaten-Dump in den LLM-Kontext. |
| 4 | **Provider-Flexibilität** | Austauschbare LLM-Provider (Anthropic, OpenAI, OpenRouter, lokal) ohne Codeänderung — Nutzerpräferenz aus dem Brainstorming. |
| 5 | **Betreibbarkeit für einen Einzelnutzer** | Kein Overengineering für Multi-Tenant/Public-SaaS-Anforderungen (bewusstes YAGNI, siehe Abschnitt 9). |

### 1.3 Stakeholder

| Rolle | Erwartung |
|---|---|
| Johannes Fuchs (Nutzer/Betreiber) | Adapter läuft in der eigenen ioBroker-Instanz, beantwortet Fragen zuverlässig, meldet proaktiv Auffälligkeiten, ohne zu spammen. |
| Zukünftige Wartung (auch: zukünftige Claude-Code-Sessions) | Code und Entscheidungen müssen ohne Rückfragen beim Nutzer nachvollziehbar sein — daher dieses Dokument. |

## 2. Randbedingungen

### 2.1 Technische Randbedingungen (verbindlich, aus dem Implementierungsplan)

- Node.js >= 18 (nutzt das eingebaute globale `fetch`, keine HTTP-Client-Abhängigkeit).
- Reines JavaScript (CommonJS `require`/`module.exports`), kein TypeScript, kein Build-Schritt/Bundler.
- Keine offiziellen Vendor-SDKs für LLM-Provider — Provider-Clients rufen die REST-APIs direkt über `fetch` auf.
- Historische Daten werden ausschließlich über ioBrokers generische Message-API gelesen: `adapter.sendToAsync(historyInstance, 'getHistory', { id, options: { start, end, aggregate } })`. Keine direkte InfluxDB-/SQL-Treiber-Abhängigkeit.
- Geloggte Objekte werden ausschließlich über `obj.common.custom["<influxdb|history|sql>.N"].enabled === true` erkannt.
- Katalogeinträge werden als Adapter-States unter `catalog.<sourceId>` mit JSON-kodiertem String-Wert gespeichert.
- Keine regelbasierten Schwellwerte für proaktive Prüfungen — die KI bewertet die Daten frei (bewusste Nutzerentscheidung, siehe Abschnitt 9, Trade-off dokumentiert).
- Teststack: mocha + chai + sinon für Unit-Tests, `@iobroker/testing` für den Adapter-Startup-Smoke-Test.

### 2.2 Organisatorische Randbedingungen

- Entwicklung erfolgte über den `subagent-driven-development`-Workflow: pro Task ein frischer Implementierer-Subagent (Modell: Haiku, günstig/schnell) + ein Task-Review (Modell: Sonnet, das aktuelle/teure Sitzungsmodell), abschließend eine Whole-Branch-Review (Modell: Opus, stärkstes verfügbares Modell) mit einer einzigen Fix-Welle für die dort gefundenen Punkte — feste Nutzervorgabe für die Modellwahl, siehe Abschnitt 9.
- Implementierung erfolgte in einem isolierten Git-Worktree (`worktree-ai-analytics-impl`), damit der `master`-Branch während der Entwicklung unberührt blieb. Der Branch wurde nach Abschluss lokal in `master` gemergt, gepusht, und Worktree/Branch anschließend gelöscht. Weiterentwicklung findet seither auf dem Branch `develop` statt.
- Privates GitHub-Repository `jfuchs1988/ioBroker.ai-analytics`.

## 3. Kontextabgrenzung

### 3.1 Fachlicher Kontext

```
┌─────────────┐   Frage (Chat-Tab)    ┌────────────────────┐
│   Nutzer     │ ─────────────────────▶│                     │
│ (Admin-UI)   │◀───────────────────── │  ioBroker.ai-analytics│
└─────────────┘   Antwort/Meldung      │                     │
                                        └─────────┬───────────┘
                                                   │ getHistory (sendTo)
                                                   ▼
                                   ┌───────────────────────────────┐
                                   │ influxdb.X / history.X / sql.X │
                                   │  (bestehende ioBroker-Adapter)  │
                                   └───────────────────────────────┘
                                                   │
                                                   ▼
                                        historisierte Objekte
                                     (Verbrauch, PV, Lampen, Geräte, Umgebung)

                                                   │ REST (fetch)
                                                   ▼
                                   ┌───────────────────────────────┐
                                   │  LLM-Provider (konfigurierbar)  │
                                   │  Anthropic / OpenAI / OpenRouter│
                                   │  / lokal (LM Studio o.ä.)       │
                                   └───────────────────────────────┘
```

### 3.2 Technischer Kontext

| Schnittstelle | Partner | Protokoll/Format |
|---|---|---|
| Chat-Frage/-Antwort | Admin-Chat-Tab (Browser) | ioBroker-Socket (`sendTo`, `getState`) |
| Historische Daten | influxdb-/history-/sql-Adapterinstanz | ioBroker `sendTo` Message-API, Kommando `getHistory` |
| LLM-Aufrufe | Anthropic Messages API / OpenAI-kompatible Chat-Completions API | HTTPS/REST, JSON, `fetch` |
| Konfiguration | ioBroker Admin (JSON Config) | `io-package.json` `native`-Felder |

## 4. Lösungsstrategie

- **Ein Analyse-Kern für zwei Features**: Sowohl Chat-Q&A als auch proaktive Prüfung laufen über denselben Tool-Calling-Agent-Loop (`lib/agent.js`), nur mit unterschiedlichem System-Prompt/Ziel. Das vermeidet Doppelimplementierung und hält Verhalten konsistent.
- **Katalog als Gedächtnisschicht**: Statt bei jeder Anfrage den Objektbaum neu zu scannen und Bedeutungen neu zu erraten, klassifiziert ein einmaliger (danach inkrementeller) Onboarding-Lauf jedes geloggte Objekt und speichert das Ergebnis. Das hält Folgeanfragen günstig und schnell.
- **Kuratierte Werkzeuge statt Rohzugriff**: Die KI bekommt nie direkten Query-Sprachzugriff (Flux/InfluxQL), sondern nur `getHistory`, `compareTimeframes`, `listCatalog` — sicherer, portabler zwischen Backends, vorhersagbarer.
- **Provider-Abstraktion über REST**: Kein Vendor-SDK, eigene dünne Clients für Anthropic- und OpenAI-kompatibles Format (letzteres deckt OpenAI, OpenRouter und lokale Server ab) — minimiert Abhängigkeiten, maximiert Portabilität.
- **TDD + Task-graduierte Subagenten-Entwicklung**: Der Implementierungsplan zerlegt das System in 13 unabhängig testbare Tasks; jede wird von einem Haiku-Implementierer nach striktem Test-zuerst-Vorgehen gebaut und von einem Sonnet-Reviewer gegen Spec und Codequalität geprüft, bevor der nächste Task startet.

## 5. Bausteinsicht

### 5.1 Ebene 1 — Gesamtsystem

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

### 5.2 Komponentenverantwortung (Whitebox)

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

## 6. Laufzeitsicht

### 6.1 Onboarding (beim Adapterstart und danach inkrementell)

1. `discovery.findHistorizedObjects` ermittelt alle Objekte mit aktivem Logging.
2. `catalog.getAllCatalogEntries` liefert bereits bekannte Objekte. Nicht mehr gefundene werden auf `active:false` gesetzt. Objekte, die wieder auftauchen (History-Instanz neu gestartet, `custom` aus- und wieder eingeschaltet) oder deren `historyInstance` sich geändert hat, werden reaktiviert (`active:true`) und mit aktuellem `lastSeen`/`historyInstance` neu geschrieben — sonst blieben sie dauerhaft von Analysen ausgeschlossen.
3. `onboarding.runOnboarding` klassifiziert die verbleibenden unbekannten Objekte in Batches (max. 20) über einen einmaligen Prompt an den Provider (kein Tool-Loop nötig, da nur vorhandene Metadaten verwendet werden). Eine fehlgeschlagene Klassifizierung eines einzelnen Objekts (z. B. ungültige Kategorie) verwirft nur diesen einen Eintrag, nicht den gesamten Batch.
4. Objekte mit niedrigem Vertrauensgrad werden gesammelt und als **eine gebündelte** Chat-Nachricht als Rückfrage gepostet (nicht einzeln, um den Nutzer nicht zu fluten). **Bekannte Lücke:** diese Rückfrage ist aktuell nicht beantwortbar — der Chat-Agent hat keine schreibenden Werkzeuge, siehe Abschnitt 11.
5. Ist kein API-Key konfiguriert (Erstinstallation), überspringt `onReady` Katalog-Sync und Scheduler komplett und loggt eine Warnung, statt zahllose fehlschlagende Erstversuche auszulösen.

### 6.2 Chat-Q&A

1. Nutzerfrage kommt über den Chat-Tab als `sendTo`-Message (`chatQuestion`) an `main.js`.
2. `appendChatMessage` loggt die Frage, `runAgent` startet mit der Frage als Ziel.
3. Der Agent ruft iterativ `listCatalog`/`getHistory`/`compareTimeframes` auf, bis genug Datengrundlage vorliegt.
4. Finale Antwort wird geloggt und als Socket-Antwort an den Chat-Tab zurückgegeben.

### 6.3 Proaktive Prüfung

1. `scheduler.startProactiveScheduler` löst nach konfigurierbarem Intervall (Default 24h) `runProactiveCheck` aus.
2. Derselbe Agent-Loop läuft mit einem Prüfauftrags-Prompt statt einer Nutzerfrage.
3. Ergebnis wird geloggt — bei "keine Auffälligkeiten" nur, wenn `silentIfNothingFound` **nicht** gesetzt ist (Default: Bestätigung posten, siehe Nutzerentscheidung in Abschnitt 9).

## 7. Verteilungssicht

Der Adapter läuft als einzelner Node.js-Prozess innerhalb der bestehenden ioBroker-Installation (js-controller, Adapter-Modus `daemon`). Keine separate Infrastruktur, keine Container, keine externe Datenbank außer der bereits vorhandenen influxdb/history/sql-Adapterinstanz. Ausgehende Netzwerkverbindungen: nur zum konfigurierten LLM-Provider (HTTPS).

## 8. Querschnittliche Konzepte

### 8.1 Nachrichtenformat zwischen Agent/Tools/Providern (normalisiert)

```
{ role: 'user'|'assistant'|'tool', content, toolCalls?: [{id,name,input}], toolCallId?, name? }
```

Jeder Provider-Client übersetzt dieses normalisierte Format in sein eigenes Wire-Format (Anthropic content-blocks vs. OpenAI `tool_calls`) und zurück — der Agent-Loop selbst kennt kein Provider-spezifisches Detail.

### 8.2 Fehlerbehandlung

- LLM-API-Fehler: Retry mit Backoff (`withRetry`, 3 Versuche, 500ms-Basis-Backoff) transparent im Provider, bevor der Fehler den Aufrufer erreicht.
- Datenzugriffsfehler (`getHistory` schlägt fehl): als Tool-Fehler an den Agenten zurückgegeben (`{error: message}`), der Agent kann das in seiner Antwort berücksichtigen statt abzustürzen.
- Unklare Objekte: bleiben `needsReview:true`, werden von Analysen ausgeschlossen bis der Nutzer sie im Chat klärt.
- Entfernte History-Objekte: Katalogeintrag wird `active:false`, nicht gelöscht (siehe auch Reaktivierung in Abschnitt 6.1).
- Korrupte/handbearbeitete Katalog-States: `getAllCatalogEntries` überspringt und loggt einen einzelnen kaputten Eintrag statt beim `JSON.parse` den kompletten Adapterstart abzubrechen.
- Leere/fehlende Chat-Frage: wird vor der Verarbeitung abgelehnt (`{error: 'Leere Frage'}`) statt einen fehlerhaften LLM-Request auszulösen.
- Ungültiges Prüfintervall (`checkIntervalHours` negativ, 0 oder nicht-numerisch): fällt auf 24h zurück statt ein Intervall nahe 0ms zu erzeugen, das die KI in einer engen Schleife aufrufen würde. Zusätzlich in der Admin-Konfiguration mit `min:1` abgesichert.
- Beide LLM-System-Prompts (Chat-Q&A und proaktive Prüfung) enthalten einen expliziten Zeitanker (aktuelle ISO-Zeit + Unix-Millisekunden), da die Werkzeuge `getHistory`/`compareTimeframes` relative Zeitfenster sonst nicht korrekt bestimmen könnten.

### 8.3 Sicherheits-/Zugriffskonzept

- Die KI hat **nie** direkten Datenbank-Query-Zugriff — nur die drei kuratierten Werkzeuge.
- Der API-Key wird in `io-package.json` über `encryptedNative`/`protectedNative` als verschlüsselt und geschützt markiert — js-controller verschlüsselt ihn in der Objekte-DB und sendet ihn nicht an Nicht-Admin-Clients. Das `password`-Feld in der Admin-JSON-Config maskiert zusätzlich nur die Eingabe im Browser; die eigentliche Absicherung von Speicherung/Transport kommt von `encryptedNative`/`protectedNative`.
- Adapter schreibt nur in seinen eigenen State-Namespace (`catalog.*`, `chat.*`) — keine Schreibzugriffe auf fremde Objekte im aktuellen Funktionsumfang (nur Lesezugriff auf historisierte Werte).
- **Vertrauensgrenze des Chat-Message-Handlers:** `onMessage` (in `main.js`) ist nur über ioBrokers internen Adapter-Message-Bus erreichbar (`adapter.on('message', ...)`) — aufgerufen entweder von der Admin-UI (bereits Admin-authentifiziert) oder von anderen Adaptern/Scripts in derselben ioBroker-Instanz, die ohnehin vollen Zugriff auf alle States und beliebigen Node-Code-Zugriff haben. Es gibt hier keine Privilegiengrenze, die eine zusätzliche Autorisierungsprüfung verteidigen müsste — der Handler gewährt strikt *weniger* Zugriff (nur lesend, katalog-gebunden) als jeder Aufrufer ohnehin schon besitzt. Diese Einschätzung wurde in der finalen Whole-Branch-Review bewusst geprüft, nachdem ein automatischer Security-Scanner "fehlende Autorisierung" als generischen Befund gemeldet hatte (falsch-positiv relativ zu diesem Vertrauensmodell).

### 8.4 Testkonzept

- Unit-Tests (mocha/chai/sinon) für jedes `lib/*`-Modul mit gemockter Adapter-API — kein echter DB- oder LLM-Zugriff nötig. Stand: 42 Unit-Tests, alle grün.
- Admin-UI (JSON Config, Chat-Tab) hat keine automatisierten Tests — dafür ein manueller Abnahmetest an einer echten ioBroker-Instanz (siehe Plan, Abschnitt "Post-Implementation Manual Acceptance Test").
- **Bekannte Lücke, in der finalen Review entdeckt:** `test/adapter.test.js` nutzt `@iobroker/testing`s `tests.unit`, das in der installierten v4-Version ein deprecated No-Op ist (druckt nur eine Warnung, lädt `main.js` nie, ruft nie `onReady`/`onUnload` auf). `main.js` — der Orchestrator mit der gesamten Lifecycle-, Konfigurations- und Fehlerbehandlungslogik — hat dadurch effektiv **keine** automatisierte Testabdeckung; jedes `lib/*`-Modul ist nur isoliert getestet, nie im Zusammenspiel (`runOnboarding` → `syncCatalog` → Katalog-States als ein durchgängiger Test existiert nicht). Siehe Abschnitt 11.

## 9. Architekturentscheidungen (ADRs, komprimiert)

| # | Entscheidung | Begründung | Alternative verworfen |
|---|---|---|---|
| 1 | Eigener Adapter statt Erweiterung eines bestehenden KI-Adapters (ai-toolbox/ai-assistant) | Keiner deckte "Fragen zu historischen Daten + freie proaktive Prüfung" ab; beide sind zudem noch im Test-Status | Fork/Erweiterung eines bestehenden Adapters |
| 2 | Datenzugriff nur auf Objekte mit aktivem History-Logging | Nutzeranforderung: "nur Werte die in DB/Influx/History gespeichert werden sind relevant" | Zugriff auf beliebige States |
| 3 | Tool-Calling-Agent (Ansatz A) statt vorberechnete Zusammenfassungen (B) oder rohe Query-Generierung (C) | Erlaubt der KI freie Exploration bei offenen Fragen, bleibt aber sicher/portabel (kein Query-Zugriff) | Precompute-Only (B): zu starr; Raw-Query (C): unsicher, DB-gebunden |
| 4 | Onboarding-/Katalog-Phase vor jeder Analyse | Nutzeranforderung: KI soll Objekte einmal "einlesen", verstehen, bei Unklarheit nachfragen, danach schneller/günstiger arbeiten | Bedeutung bei jeder Anfrage neu erraten lassen |
| 5 | Proaktive Prüfung: KI bewertet Daten komplett selbst, keine festen Schwellwert-Regeln | Explizite Nutzerentscheidung trotz erläutertem Trade-off (teurer, weniger vorhersagbar als Regel-Engine) | Regelbasiert + KI nur zur Formulierung; Hybrid-Ansatz |
| 6 | Default-Verhalten bei ergebnislosem Prüflauf: kurze Bestätigung posten (nicht still) | Explizite Nutzerentscheidung nach Rückfrage — "zeigt, dass das System aktiv läuft" | Stiller Lauf ohne Nachricht |
| 7 | Mehrere LLM-Provider konfigurierbar (Anthropic/OpenAI/OpenRouter/lokal) statt fest auf einen Provider | Explizite Nutzerentscheidung, spiegelt Muster bestehender ioBroker-KI-Adapter | Festlegung auf einen Provider |
| 8 | Kein Vendor-SDK, direkte REST-Aufrufe via `fetch` | Minimiert Abhängigkeiten, Node >=18 hat `fetch` eingebaut | `@anthropic-ai/sdk`, `openai`-npm-Paket |
| 9 | Reines JavaScript (CommonJS), kein TypeScript, kein Build-Schritt | YAGNI — Adapter-Größe rechtfertigt keinen Build-Prozess | TypeScript + Compile-Schritt |
| 10 | Ausgabekanal v1: nur Admin-Chat-Tab; WhatsApp/Alexa als spätere Erweiterung | Explizite Nutzerentscheidung ("erst mal einfach im Adapter-Tab") | Sofortige Multi-Channel-Anbindung |
| 11 | Entwicklung via `subagent-driven-development`: Haiku für Implementierung, Sonnet für Review/Denken | Explizite, als Dauerregel gespeicherte Nutzervorgabe (siehe Memory `feedback_haiku_for_implementation`) | Ein Modell für alles |
| 12 | Isolierter Git-Worktree für die gesamte Implementierung | Schützt den `master`-Branch, Standard-Vorgehen dieses Workflows | Direkt auf `master` entwickeln |
| 13 | API-Key wird über `encryptedNative`/`protectedNative` in `io-package.json` verschlüsselt/geschützt statt nur per `password`-Feld maskiert | In der finalen Whole-Branch-Review als Critical-Finding entdeckt: `password`-Feld maskiert nur die Browser-Eingabe, schützt aber nicht Speicherung/Transport | Nur `password`-Feld ohne zusätzliche Verschlüsselung (ursprünglicher Stand, als unsicher erkannt) |
| 14 | Beide LLM-System-Prompts enthalten einen expliziten Zeitanker (aktuelle Zeit als ISO + Unix-ms) | In der finalen Whole-Branch-Review als Critical-Finding entdeckt: ohne Anker hat das Modell keine Grundlage, relative Zeitfenster für `getHistory`/`compareTimeframes` korrekt zu berechnen | Kein Zeitanker (ursprünglicher Stand, führte zu leeren/falschen Zeiträumen) |

## 10. Qualitätsanforderungen (Auszug als Szenarien)

| Szenario | Anforderung |
|---|---|
| Nutzer fragt "Warum ist der Verbrauch gestiegen?" | Antwort nennt konkrete Objekte, Werte und Vergleichszeiträume — keine pauschale Vermutung. |
| Ein unbekanntes Objekt taucht neu im Objektbaum auf (History aktiviert) | Wird beim nächsten inkrementellen Scan erkannt, klassifiziert, bei Unsicherheit im Chat nachgefragt — nicht stillschweigend ignoriert oder falsch eingeordnet. |
| LLM-API ist kurzzeitig nicht erreichbar | Automatischer Retry mit Backoff; erst danach sichtbarer Fehler. |
| History-Adapterinstanz fällt komplett aus | Bekannte Lücke (siehe Abschnitt 11) — aktuell keine Deduplizierung wiederholter Ausfallmeldungen. |
| Provider wird gewechselt (z. B. Anthropic → lokal) | Nur Konfigurationsänderung nötig, kein Codeeingriff. |
| Adapter wird frisch installiert, noch kein API-Key hinterlegt | Startet trotzdem sauber, überspringt Katalog-Sync und proaktive Prüfung mit einer Log-Warnung, statt Hunderte fehlschlagender Erstversuche auszulösen. |
| Nutzer fragt "Wie war mein Verbrauch letzte Woche?" | Agent bestimmt den Zeitraum korrekt relativ zur tatsächlichen aktuellen Zeit (System-Prompt enthält einen Zeitanker), nicht relativ zum Trainingsstand des Modells. |

## 11. Risiken und technische Schulden

Aus dem Implementierungsplan übernommen (`docs/superpowers/plans/2026-08-21-ai-analytics-implementation.md`, Abschnitt "Known Gaps"):

- **Keine deduplizierten Ausfallmeldungen**: Ein kompletter Ausfall der History-Instanz sollte laut Spec "einmalig gemeldet, nicht bei jedem Lauf erneut" werden. Aktuell werden `getHistory`-Fehler nur als Tool-Fehler an den Agenten zurückgegeben, der sie in Worten einbaut — es gibt keinen persistenten "bereits gemeldet"-Zustand, der Wiederholungen unterdrückt. Vorgesehen für einen Folge-Plan, sobald reales Ausfallverhalten beobachtbar ist.
- **Keine Katalog-Vorfilterung bei sehr großen Installationen**: Bei stark wachsender Objektzahl könnte der volle Katalog als LLM-Kontext zu groß werden. Von der Spec explizit als spätere Optimierung markiert, kein Blocker für v1.
- **Kein Kosten-/Token-Budget für LLM-Aufrufe**: Aktuell keine Obergrenze, wie oft/teuer die proaktive Prüfung pro Tag wird (in der Session mit dem Nutzer als offener Punkt besprochen, noch nicht in Spec/Plan übernommen).
- **Keine CI/Linting/Dependency-Scanning** (siehe Roadmap unten) — bewusst auf einen Folge-Plan verschoben, um zuerst die Kernfunktionalität fertigzustellen.
- **Onboarding-Rückfragen sind nicht auflösbar:** Für Objekte mit `needsReview: true` postet das System eine Rückfrage im Chat, aber es gibt aktuell keinen Weg, eine Nutzerantwort zurück in den Katalog zu schreiben — der Chat-Q&A-Agent hat nur lesende Werkzeuge. Objekte bleiben dauerhaft `needsReview: true` und von Analysen ausgeschlossen. Für v1 als Limitierung akzeptiert; ein Folge-Plan sollte ein Werkzeug/Message-Kommando zum Aktualisieren eines Katalogeintrags ergänzen.
- **Keine Konversationshistorie im Chat-Agenten:** Jede Chat-Frage startet den Agenten ohne vorherige Nachrichten im Kontext, obwohl die Spec Folgefragen mit erhaltenem Kontext vorsieht. `chat.history` ist aktuell nur ein Anzeige-Log. Für v1 als Limitierung akzeptiert; ein Folge-Plan sollte `runAgent` um optionalen `priorMessages`-Kontext erweitern.
- **Keine Auswahl der History-Adapterinstanz(en) und kein manueller Re-Discovery-Trigger:** Die Spec sieht beides in der Admin-Konfiguration vor; aktuell werden automatisch alle aktiven influxdb/history/sql-Instanzen berücksichtigt, und ein Neu-Einlesen erfordert einen Adapter-Neustart. Für v1 als Limitierung akzeptiert.
- **Main.js und die Admin-UI haben effektiv keine automatisierte Testabdeckung:** siehe Abschnitt 8.4 — der Adapter-Smoke-Test ist durch eine veraltete `@iobroker/testing`-v4-Verhaltensänderung ein No-Op. Ein Folge-Plan sollte entweder `tests.integration` (echter js-controller) oder einen proxyquire-basierten Fake-Adapter-Test für `main.js` ergänzen.
- **Admin-Chat-Tab (`admin/tab.js`) bestätigt nicht funktionsfähig (bestätigt im Abnahmetest 2026-08-21):** Der Tab rendert (HTML/CSS wird angezeigt), aber Nachrichten können nicht abgeschickt werden — der Senden-Button reagiert nicht. Ursachenhypothese (noch nicht per Browser-Konsole verifiziert): `admin/tab.js`s `init()` läuft nur, wenn `typeof adapterNamespace !== 'undefined'`; `adapterNamespace` ist vermutlich kein reales ioBroker-Admin-Global (Fehler im ursprünglichen Plan-Code), wodurch `init()` nie läuft und die Klick-Handler nie angehängt werden. Nächster Schritt (mit Nutzer vereinbart, noch ausstehend): im Browser F12 auf dem Tab prüfen — `typeof adapterNamespace`, `typeof io`, `window.location.href`, `typeof parent.socket` — um die tatsächlich verfügbaren Admin-Globals zu ermitteln, bevor ein gezielter Fix geschrieben wird (kein blindes Rate-Fixing wie beim vorherigen Versuch). Voraussichtlicher Fix: Namespace/Instanz aus `window.location.search` oder `parent.socket` ableiten statt aus einem ungeprüften Global.
- **Zwei kleinere, in der Fix-Wellen-Nachprüfung bewusst zurückgestellte Punkte:** (a) `lastSeen` wird bei der Katalog-Reaktivierung (Abschnitt 6.1) nur bei tatsächlicher Reaktivierung oder Instanzwechsel aktualisiert, nicht bei jedem "unverändert weiterhin gesehen"-Sync — kein vollständiger Heartbeat; (b) die neuen Reaktivierungs-`setCatalogEntry`-Aufrufe in `syncCatalog` sind nicht wie der übrige Abschnitt in try/catch abgesichert (geringes Risiko, da nur bereits validierte Felder per Spread übernommen werden). Beide Minor, für die CI-/Hardening-Folge-Runde vorgesehen.

### Fortschritt zum Zeitpunkt dieses Dokuments

Implementierung über `subagent-driven-development` in 13 Tasks ist abgeschlossen (siehe Plan); alle Tasks wurden einzeln reviewt und teils in Fix-Runden nachgebessert. Eine finale Whole-Branch-Review hat danach mehrere Befunde aufgedeckt und einen Teil davon in einer Fix-Welle beheben lassen (Zeitanker in den LLM-System-Prompts, API-Key-Verschlüsselung, Katalog-Reaktivierung, negative Prüfintervalle, fehlende Eingabevalidierung, u.a.); ein Teil wurde bewusst als dokumentierte Lücke zurückgestellt (siehe unten und den Implementierungsplan). Release v0.0.1-beta wurde getaggt und als GitHub-Pre-Release veröffentlicht (nicht auf npm — bewusst zurückgestellt bis nach dem Abnahmetest).

**Manueller Abnahmetest (gestartet 2026-08-21, auf einer echten ioBroker-Instanz `iobroker-001`, Redis-Backend, js-controller 7.2.2, Node 22.23.2, Installation via `.tgz`):**

Bestätigt funktionierend:
- Installation via `iobroker url <pfad>.tgz` läuft sauber durch (unrelated `node-gyp`-Fehler bei anderen, bereits installierten Adaptern — nicht unser Paket, das hat keine nativen Build-Abhängigkeiten).
- Adapter startet mehrfach fehlerfrei, `onReady` läuft vollständig durch (`ai-analytics adapter ready` im Log, keine Fehler, kein Absturz), auch nach mehreren Neustarts.
- Discovery + Katalog-Sync + Onboarding funktionieren gegen echte Objekte: Katalogeinträge wurden unter `ai-analytics.0.catalog.<sourceId>` angelegt (die verschachtelte, dem Quellobjekt-Pfad nachempfundene Struktur im Objektbaum ist beabsichtigt, kein Fehler).

Bestätigt **nicht** funktionierend:
- **Admin-Chat-Tab**: rendert, aber Nachrichten können nicht abgeschickt werden. Siehe Detailbefund und Ursachenhypothese in der Known-Gaps-Liste oben. Debugging mit dem Nutzer unterbrochen — wird fortgesetzt (Browser-Konsole-Diagnose vereinbart, noch ausstehend).

Noch nicht geprüft: Qualität der KI-Klassifizierung (Katalogeintrag-Inhalt wurde noch nicht im Detail angeschaut), Chat-Q&A-Funktionalität (blockiert durch den Chat-Tab-Fehler), proaktive Prüfung.

### Roadmap

Vom Nutzer bestätigte Reihenfolge — Stand:
1. ~~Diese arc42-Dokumentation~~ — abgeschlossen.
2. ~~Fertigstellung der 13 Implementierungs-Tasks + finales Review + Fix-Welle~~ — abgeschlossen, gemergt nach `master`, Weiterentwicklung auf `develop`.
3. **Nächster Schritt:** manueller Abnahmetest an einer echten ioBroker-Instanz (siehe Plan, "Post-Implementation Manual Acceptance Test") — insbesondere Admin-Chat-Tab-Initialisierung prüfen (siehe offener Punkt oben).
4. Danach: separater Plan für CI via GitHub Actions (`npm test` bei jedem Push/PR), ESLint + Prettier, `@iobroker/adapter-dev`-Checker, CHANGELOG.md, Dependabot/Renovate — sollte dabei auch die in Abschnitt 11 gelisteten Test- und Hardening-Lücken mit aufnehmen.

## 12. Glossar

| Begriff | Bedeutung |
|---|---|
| Katalog | Persistierte, semantisch angereicherte Liste aller historisierten Objekte (State-Speicher unter `catalog.*`) |
| Onboarding | Einmaliger (danach inkrementeller) Klassifizierungslauf für neu entdeckte Objekte |
| Historisiertes Objekt | ioBroker-Objekt mit aktivem Logging in influxdb/history/sql (`common.custom[...].enabled === true`) |
| Tool-Calling-Agent | LLM-Aufruf-Loop, bei dem das Modell selbst entscheidet, welche Werkzeuge (Datenabfragen) es wann aufruft |
| Proaktive Prüfung | Periodischer, KI-getriebener Hintergrundlauf ohne feste Regeln, der Auffälligkeiten meldet |
| needsReview | Katalog-Flag für Objekte, deren Bedeutung die KI nicht sicher einordnen konnte |
