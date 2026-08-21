# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach [SemVer](https://semver.org/).

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
