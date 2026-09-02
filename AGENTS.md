# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, OpenCode, etc.) when working with code in this repository.

## Was das ist

`ioBroker.ai-analytics` ist ein ioBroker-Adapter, der zwei Fähigkeiten kombiniert: Chat-Q&A über historisierte Smart-Home-Daten (InfluxDB/History/SQL) und eine periodische proaktive Prüfung, die Auffälligkeiten selbstständig im Chat meldet. Nur Objekte mit aktivem History-/InfluxDB-/SQL-Logging werden berücksichtigt; ein Onboarding-Lauf klassifiziert neu gefundene Objekte semantisch und fragt im Chat nach, statt zu raten.

## Commands

```bash
npm install
npm test              # test:unit + test:adapter
npm run test:unit     # mocha test/unit/**/*.test.js
npm run test:adapter  # mocha test/adapter.test.js (Adapter-Smoke-Test via @iobroker/testing)
```

Einzelnen Test ausführen: `npx mocha test/unit/agent.test.js` (oder Datei-Pfad nach Bedarf anpassen).

`npm test` muss vor jedem Commit grün sein. Es gibt aktuell keine CI/Linting (bewusst zurückgestellt, siehe Risiken-Doku).

## Architektur

Der Adapter ist als kleine Menge fokussierter `lib/*`-Module aufgebaut, die `main.js` über den ioBroker-Adapter-Lifecycle (`onReady`, `onMessage`, `onUnload`) verdrahtet:

- `lib/discovery.js` — findet Objekte mit aktiviertem History-Logging (`common.custom[...].enabled`) → `findHistorizedObjects(adapter)`
- `lib/catalog.js` — CRUD auf semantischen Katalogeinträgen, persistiert als Adapter-States unter `ai-analytics.0.catalog.<sourceId>`
- `lib/dataAccess.js` — Rohdatenabruf (`getHistory`) und Zeitraumvergleich über die generische History-API
- `lib/providers/` — einheitliche LLM-Schnittstelle (`createProvider(config) => {chat({system,messages,tools})}`) mit Retry-mit-Backoff sowie `listModels(config)` für Modellvorschläge; konkrete Clients für Anthropic (`anthropic.js`) und OpenAI-kompatible Endpunkte/OpenRouter/lokal (`openaiCompatible.js`), wobei OpenRouter kostenlose Tool-Modelle anhand seiner Live-Metadaten filtert
- `lib/tools.js` — bindet Katalog + Datenzugriff als vom Agenten aufrufbare Werkzeuge (JSON-Schema-Definitionen + Dispatcher)
- `lib/agent.js` — provider-agnostischer, iterativer Tool-Use-Loop bis zur finalen Antwort
- `lib/chatLog.js` — gedeckelte Chat-Historie (State-Speicher, max. 200 Einträge)
- `lib/onboarding.js` — klassifiziert neu entdeckte Objekte per Batch-Prompt, markiert unsichere als `needsReview`
- `lib/usage.js` — Token-Nutzung tracken, tägliches Budget prüfen
- `lib/scheduler.js` — periodischer Trigger für die proaktive Prüfung
- `admin/` — Admin-Konfigurationsformular (`jsonConfig.json`) und Custom-Chat-Tab (`tab.html`/`tab.js`, Legacy-Adapter-Tab-Muster)

Zeitangaben, die an `getHistory`/`compareTimeframes` gehen, sind immer Unix-Millisekunden — beide System-Prompts in `main.js` stellen das dem Agenten explizit klar, relativ zur im Prompt genannten aktuellen Zeit.

Der Adapter bleibt bewusst bei einer Whitebox-Ebene fokussierter `lib/*`-Module; eine tiefere Zerlegung (z. B. Whitebox von `providers/`) wurde als aktuell nicht lohnend bewertet. Details/Begründungen: [docs/architecture/05-bausteinsicht.md](docs/architecture/05-bausteinsicht.md).

## Bekannte Lücken (bei verwandter Arbeit relevant)

Siehe [docs/architecture/11-risiken-und-schulden.md](docs/architecture/11-risiken-und-schulden.md) für die vollständige, aktuell gehaltene Liste. Stand zuletzt geprüft:

- `main.js` und die Admin-UI haben effektiv keine automatisierte Testabdeckung; der Adapter-Smoke-Test ist durch eine `@iobroker/testing`-v4-Verhaltensänderung ein No-Op.
- Die manuelle Live-Abnahme des aktuellen Admin- und Geräte-Einstellungsbereichs steht noch aus; die automatisierte Testabdeckung von `main.js` und UI bleibt gering.
- Eine Auswahl der History-Adapterinstanz(en) in der Admin-Config ist weiterhin offen.

## Entwicklungsprozess

Vollständig in [CONTRIBUTING.md](CONTRIBUTING.md) dokumentiert. Kernpunkte:

- **Branching**: Für jeden Task wird ein neuer Task-Branch vom aktuellen Integrationsstand angelegt. Nach Abschluss wird jeder Task lokal per `git merge --no-ff` nach `master` gemergt. Push, Release und Tags erfolgen nur auf ausdrücklichen Nutzerwunsch.
- **Spec + Plan vor Code** bei neuen Features/Verhaltensänderungen (`docs/specs/`, `docs/plans/`); **eigene ADR** (`docs/adr/`) bei architekturrelevanten Entscheidungen.
- **TDD**: pro Task Test zuerst (rot), dann Implementierung (grün), dann Commit. Neue `lib/*`-Module bekommen eigene Unit-Tests mit gemockter Adapter-API.
- **Dokumentation im selben Commit/PR aktuell halten**: neues Modul/geänderte Schnittstelle → [05-bausteinsicht.md](docs/architecture/05-bausteinsicht.md); neuer/gelöster Mangel → [11-risiken-und-schulden.md](docs/architecture/11-risiken-und-schulden.md); Architekturentscheidung → neue ADR + [adr-index.md](docs/adr/adr-index.md); Release → [CHANGELOG.md](CHANGELOG.md).
- **Modellwahl**: günstiges/schnelles Modell für Implementierung (sofern der Plan schon detailliert genug ist), teuerstes verfügbares Modell für Review/Denken/Architekturentscheidungen (siehe [ADR-0011](docs/adr/0011-subagent-driven-development.md)).

### Verbindlicher Task-Ablauf

Dieser Ablauf gilt für jeden neuen Task, auch in einem neuen Chat-Fenster:

- Vor der Implementierung Branch, Status, letzte Commits und die relevanten Specs, Pläne, Architektur- und Risikodokumente prüfen.
- Für jeden Task einen eigenen Branch anlegen und nach dem Merge nicht für weitere Tasks wiederverwenden.
- Sinnvolle, thematisch geschlossene Zwischenstände als eigene Commits sichern. Tests, Implementierung, Hardening und Dokumentation dürfen getrennte Commits sein.
- Dokumentation live aktualisieren: Spec/Plan, Architektur, Risiken, ADR-Index/Backlog und Changelog müssen vor dem Task-Abschluss den tatsächlichen Code-Stand widerspiegeln.
- Vor dem Merge `git status`, `git diff`, `git log --oneline -10` und `npm test` ausführen; Fehler vor dem Merge beheben.
- Nach erfolgreichem Test jeden Task lokal per `git merge --no-ff` nach `master` mergen und den Task-Branch löschen, sofern er nicht mehr benötigt wird.
- Nach dem Merge den Arbeitsstand erneut prüfen. Keine Änderungen anderer Arbeiten verwerfen und keine fremden Commits amendieren.

Zentraler Doku-Einstiegspunkt: [docs/README.md](docs/README.md).
