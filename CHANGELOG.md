# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach [SemVer](https://semver.org/).

## [0.0.1-beta.3] - 2026-08-22

### Hinzugefügt
- Geräte-Tab im Admin-UI (Sub-Navigation neben Chat und Budget, ein Tab "AI Analytics" — `io-package.json` erlaubt nur einen `adminTab` pro Adapter): editierbare Tabelle aller katalogisierten Objekte (Kategorie, Raum), Ignorieren/Aktivieren, Entfernen, Text-Filter/Suche.
- Manuelle Trigger: "Geräte neu einlesen" (Re-Discovery) und "Prüfung jetzt ausführen" (proaktive Prüfung), ohne auf das konfigurierte Intervall warten zu müssen.
- Token-Budget-Anzeige (heutiger Verbrauch vs. konfiguriertes Tageslimit), berücksichtigt korrekt einen Tageswechsel (zeigt sonst fälschlich den Vortageswert).
- Neues Modul `lib/adminCommands.js`: Admin-Message-Bus mit vollem Katalog-Schreibzugriff, bewusst getrennte Vertrauensgrenze vom needsReview-beschränkten LLM-Tool (siehe [ADR-0020](docs/adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md)).
- Neue Katalog-Eigenschaft `ignored`; ignorierte Objekte werden von Chat-Analysen und der proaktiven Prüfung ausgeschlossen (auch aus dem `needsReviewOnly`-Pfad), bleiben aber sichtbar/reaktivierbar.
- Raum wird beim Onboarding, wenn möglich, deterministisch aus `enum.rooms.*` übernommen statt nur vom LLM geraten.
- Löst die bekannten Lücken "Onboarding-Rückfragen nicht auflösbar" und "kein manueller Re-Discovery-Trigger" (siehe [11-risiken-und-schulden.md](docs/architecture/11-risiken-und-schulden.md)).

### Behoben
- Fehlende Fehlerbehandlung im neuen Admin-Message-Bus (main.js): ein Fehler hätte die UI dauerhaft hängen lassen und war ein Absturzrisiko (unhandled rejection) — gefunden im abschließenden Whole-Branch-Review.

### Diagnostiziert, nicht abschließend bestätigt
- Admin-Tab-Verbindungsproblem: Live-Diagnose an einer echten Instanz (2026-08-22) hat den Root Cause identifiziert (fehlende `adminUI.tab: "html"`-Deklaration in `io-package.json`) und einen Fix angewendet — die endgültige Bestätigung erfordert einen Redeploy auf eine erreichbare Instanz, siehe [11-risiken-und-schulden.md](docs/architecture/11-risiken-und-schulden.md).

## [0.0.1-beta.2] - 2026-08-22

### Hinzugefügt
- Admin-Chat-Tab: defensive Verbindungs-Fallback-Kette (ersetzt die nicht-existente `adapterNamespace`-Abhängigkeit) + Chat-Bubble-UI mit Zeitstempeln und Lade-Indikator.
- Neues, eng begrenztes Schreib-Werkzeug `updateCatalogEntry` — der Chat-Agent kann Onboarding-Rückfragen (`needsReview`-Objekte) jetzt direkt im Chat auflösen (siehe [ADR-0017](docs/adr/0017-scoped-catalog-write-capability.md)).
- Konversationsgedächtnis: Chat-Fragen laufen jetzt mit den letzten 10 Nachrichten aus der Historie im Kontext.
- Tägliches Token-Budget (`dailyTokenBudget`, Default 0 = kein Limit) für Chat und proaktive Prüfung.
- `silly`-Level-Logging für Discovery, Onboarding, Agent-Aufrufe (Senden/Empfangen) und Chat-/Prüf-Läufe.

### Geändert
- Dev-Dependencies aktualisiert: mocha 10 → 11, sinon 17 → 22, `@iobroker/testing` 4 → 5. `chai` bewusst auf 4.x belassen (5/6 ist ESM-only, würde `require('chai')` brechen).

## [0.0.1-beta.1] - 2026-08-21

Reine Dokumentations-/Prozess-Version, kein funktionaler Code-Unterschied zu 0.0.1-beta.

### Geändert
- Architekturdokumentation von einer einzelnen `arc42.md` in 12 einzelne, Obsidian-verlinkte Kapiteldateien unter `docs/architecture/` aufgeteilt (arc42-Multi-Page-Konvention).
- Architekturentscheidungen aus arc42 §9 in 16 einzelne ADR-Dateien unter `docs/adr/` extrahiert (Nygard-Format), inkl. Übersichtstabelle.
- `docs/superpowers/{specs,plans}/` zu `docs/specs/`, `docs/plans/` umbenannt (der `superpowers`-Anteil war nur ein Tooling-Artefakt).
- Neue Map-of-Content-Einstiegspunkte: [docs/README.md](docs/README.md), [arc42-index.md](docs/architecture/arc42-index.md), [adr-index.md](docs/adr/adr-index.md).

### Hinzugefügt
- [CONTRIBUTING.md](CONTRIBUTING.md) mit dem dokumentierten Entwicklungsprozess (Branching-Modell, wann Spec/Plan/ADR nötig sind).
- [Backlog offener Architekturentscheidungen](docs/adr/backlog.md) — 16 noch nicht entschiedene, architekturrelevante Fragen, u. a. wie der defekte Admin-Chat-Tab behoben wird.
- Ergebnisse des laufenden manuellen Abnahmetests dokumentiert: Installation/Start/Discovery/Katalog bestätigt funktionierend, Admin-Chat-Tab bestätigt defekt.

## [0.0.1-beta] - 2026-08-21

Erste Beta-Version. Alle 13 Implementierungs-Tasks abgeschlossen, einzeln reviewt, plus finales Whole-Branch-Review mit Fix-Welle (Zeitanker in LLM-Prompts, API-Key-Verschlüsselung, Katalog-Reaktivierung, u.a.). 43/43 automatisierte Tests grün.

### Hinzugefügt
- Chat-Q&A: Fragen zu historischen Verbrauchs-/Nutzungsdaten über einen Tool-Calling-LLM-Agenten.
- Proaktive Prüfungen: periodischer, KI-getriebener Hintergrundlauf auf Auffälligkeiten (Gerätenutzung, Beleuchtung, Verbrauch, PV-Einspeisung).
- Discovery + Katalog: automatisches Erkennen und semantisches Klassifizieren aller Objekte mit aktivem InfluxDB-/History-/SQL-Logging, inkl. Rückfrage im Chat bei Unsicherheit.
- Provider-Abstraktion: Anthropic, OpenAI, OpenRouter, lokale OpenAI-kompatible Server (z. B. LM Studio) — austauschbar über die Admin-Konfiguration.
- Admin-Konfigurationsformular und Admin-Chat-Tab.

### Bekannte Lücken (siehe [arc42 §11](docs/architecture/11-risiken-und-schulden.md) und [Backlog offener Architekturentscheidungen](docs/adr/backlog.md) für Details)
- **Admin-Chat-Tab bestätigt nicht funktionsfähig** (Abnahmetest 2026-08-21): Tab rendert, Nachrichten können nicht abgeschickt werden. Diagnose läuft.
- `main.js` und die Admin-UI haben keine automatisierte Integrationstestabdeckung.
- Onboarding-Rückfragen im Chat sind aktuell nicht beantwortbar (kein Schreibzugriff des Chat-Agenten auf den Katalog).
- Keine Konversationshistorie über mehrere Chat-Fragen hinweg.
- Keine Auswahl der History-Adapterinstanz(en) und kein manueller Re-Discovery-Trigger in der Konfiguration.
- Kein Kosten-/Token-Budget für LLM-Aufrufe.
- Keine CI/Linting/Dependency-Scanning (geplant für einen Folge-Plan).

Vor produktivem Einsatz: manueller Abnahmetest an einer echten ioBroker-Instanz erforderlich.
