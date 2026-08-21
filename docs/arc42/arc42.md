# ioBroker.ai-analytics — Architekturdokumentation (arc42)

Status: laufende Implementierung (siehe Abschnitt 11 für aktuellen Fortschritt)
Datum: 2026-08-21
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

- Entwicklung erfolgt über den `subagent-driven-development`-Workflow: pro Task ein frischer Implementierer-Subagent (Modell: Haiku, günstig/schnell) + ein Task-Review (Modell: Sonnet, das aktuelle/teure Sitzungsmodell) — feste Nutzervorgabe, siehe Abschnitt 9.
- Isolierter Git-Worktree (`worktree-ai-analytics-impl`) für die gesamte Implementierung, damit der `master`-Branch des Repos unberührt bleibt.
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
2. `catalog.getAllCatalogEntries` liefert bereits bekannte Objekte; bekannte werden übersprungen, nicht mehr gefundene auf `active:false` gesetzt.
3. `onboarding.runOnboarding` klassifiziert unbekannte Objekte in Batches (max. 20) über einen einmaligen Prompt an den Provider (kein Tool-Loop nötig, da nur vorhandene Metadaten verwendet werden).
4. Objekte mit niedrigem Vertrauensgrad werden gesammelt und als **eine gebündelte** Chat-Nachricht als Rückfrage gepostet (nicht einzeln, um den Nutzer nicht zu fluten).

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
- Entfernte History-Objekte: Katalogeintrag wird `active:false`, nicht gelöscht.

### 8.3 Sicherheits-/Zugriffskonzept

- Die KI hat **nie** direkten Datenbank-Query-Zugriff — nur die drei kuratierten Werkzeuge.
- API-Keys werden über ein `password`-Feld in der Admin-JSON-Config gehalten (nicht im Klartext-Textfeld).
- Adapter schreibt nur in seinen eigenen State-Namespace (`catalog.*`, `chat.*`) — keine Schreibzugriffe auf fremde Objekte im aktuellen Funktionsumfang (nur Lesezugriff auf historisierte Werte).

### 8.4 Testkonzept

- Unit-Tests (mocha/chai/sinon) für jedes `lib/*`-Modul mit gemockter Adapter-API — kein echter DB- oder LLM-Zugriff nötig.
- Adapter-Lifecycle-Smoke-Test über `@iobroker/testing`.
- Admin-UI (JSON Config, Chat-Tab) hat keine automatisierten Tests — dafür ein manueller Abnahmetest an einer echten ioBroker-Instanz (siehe Plan, Abschnitt "Post-Implementation Manual Acceptance Test").

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

## 10. Qualitätsanforderungen (Auszug als Szenarien)

| Szenario | Anforderung |
|---|---|
| Nutzer fragt "Warum ist der Verbrauch gestiegen?" | Antwort nennt konkrete Objekte, Werte und Vergleichszeiträume — keine pauschale Vermutung. |
| Ein unbekanntes Objekt taucht neu im Objektbaum auf (History aktiviert) | Wird beim nächsten inkrementellen Scan erkannt, klassifiziert, bei Unsicherheit im Chat nachgefragt — nicht stillschweigend ignoriert oder falsch eingeordnet. |
| LLM-API ist kurzzeitig nicht erreichbar | Automatischer Retry mit Backoff; erst danach sichtbarer Fehler. |
| History-Adapterinstanz fällt komplett aus | Bekannte Lücke (siehe Abschnitt 11) — aktuell keine Deduplizierung wiederholter Ausfallmeldungen. |
| Provider wird gewechselt (z. B. Anthropic → lokal) | Nur Konfigurationsänderung nötig, kein Codeeingriff. |

## 11. Risiken und technische Schulden

Aus dem Implementierungsplan übernommen (`docs/superpowers/plans/2026-08-21-ai-analytics-implementation.md`, Abschnitt "Known Gaps"):

- **Keine deduplizierten Ausfallmeldungen**: Ein kompletter Ausfall der History-Instanz sollte laut Spec "einmalig gemeldet, nicht bei jedem Lauf erneut" werden. Aktuell werden `getHistory`-Fehler nur als Tool-Fehler an den Agenten zurückgegeben, der sie in Worten einbaut — es gibt keinen persistenten "bereits gemeldet"-Zustand, der Wiederholungen unterdrückt. Vorgesehen für einen Folge-Plan, sobald reales Ausfallverhalten beobachtbar ist.
- **Keine Katalog-Vorfilterung bei sehr großen Installationen**: Bei stark wachsender Objektzahl könnte der volle Katalog als LLM-Kontext zu groß werden. Von der Spec explizit als spätere Optimierung markiert, kein Blocker für v1.
- **Kein Kosten-/Token-Budget für LLM-Aufrufe**: Aktuell keine Obergrenze, wie oft/teuer die proaktive Prüfung pro Tag wird (in der Session mit dem Nutzer als offener Punkt besprochen, noch nicht in Spec/Plan übernommen).
- **Keine CI/Linting/Dependency-Scanning** (siehe Roadmap unten) — bewusst auf einen Folge-Plan verschoben, um zuerst die Kernfunktionalität fertigzustellen.

### Fortschritt zum Zeitpunkt dieses Dokuments

Implementierung läuft über `subagent-driven-development` in 13 Tasks (siehe Plan). Stand bei Erstellung dieses Dokuments: Tasks 1–6 abgeschlossen und reviewt (Approved, keine offenen Findings) — Adapter-Grundgerüst, Discovery Service, Katalog-Speicherung, Datenzugriffsschicht, LLM-Provider-Abstraktion (Anthropic + OpenAI-kompatibel inkl. Retry), Tool-Definitionen & Dispatcher. Ausstehend: Tool-Calling-Agent-Loop, Chat-History-Speicherung, Onboarding-Flow, Main.js-Verdrahtung, Proaktiver Scheduler, Admin-Konfiguration, Admin-Chat-Tab (Tasks 7–13), sowie die finale Whole-Branch-Review.

### Roadmap (nach Abschluss der 13 Tasks, als separater Folge-Plan)

Vom Nutzer bestätigt, in dieser Reihenfolge:
1. Diese arc42-Dokumentation (dieses Dokument) — abgeschlossen.
2. Fertigstellung der laufenden 13 Implementierungs-Tasks + finales Review.
3. Separater Plan für: CI via GitHub Actions (`npm test` bei jedem Push/PR), ESLint + Prettier, `@iobroker/adapter-dev`-Checker, CHANGELOG.md, Dependabot/Renovate.

## 12. Glossar

| Begriff | Bedeutung |
|---|---|
| Katalog | Persistierte, semantisch angereicherte Liste aller historisierten Objekte (State-Speicher unter `catalog.*`) |
| Onboarding | Einmaliger (danach inkrementeller) Klassifizierungslauf für neu entdeckte Objekte |
| Historisiertes Objekt | ioBroker-Objekt mit aktivem Logging in influxdb/history/sql (`common.custom[...].enabled === true`) |
| Tool-Calling-Agent | LLM-Aufruf-Loop, bei dem das Modell selbst entscheidet, welche Werkzeuge (Datenabfragen) es wann aufruft |
| Proaktive Prüfung | Periodischer, KI-getriebener Hintergrundlauf ohne feste Regeln, der Auffälligkeiten meldet |
| needsReview | Katalog-Flag für Objekte, deren Bedeutung die KI nicht sicher einordnen konnte |
