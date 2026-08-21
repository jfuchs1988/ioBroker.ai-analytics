# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach [SemVer](https://semver.org/).

## [0.0.1-beta] - 2026-08-21

Erste Beta-Version. Alle 13 Implementierungs-Tasks abgeschlossen, einzeln reviewt, plus finales Whole-Branch-Review mit Fix-Welle (Zeitanker in LLM-Prompts, API-Key-Verschlüsselung, Katalog-Reaktivierung, u.a.). 43/43 automatisierte Tests grün.

### Hinzugefügt
- Chat-Q&A: Fragen zu historischen Verbrauchs-/Nutzungsdaten über einen Tool-Calling-LLM-Agenten.
- Proaktive Prüfungen: periodischer, KI-getriebener Hintergrundlauf auf Auffälligkeiten (Gerätenutzung, Beleuchtung, Verbrauch, PV-Einspeisung).
- Discovery + Katalog: automatisches Erkennen und semantisches Klassifizieren aller Objekte mit aktivem InfluxDB-/History-/SQL-Logging, inkl. Rückfrage im Chat bei Unsicherheit.
- Provider-Abstraktion: Anthropic, OpenAI, OpenRouter, lokale OpenAI-kompatible Server (z. B. LM Studio) — austauschbar über die Admin-Konfiguration.
- Admin-Konfigurationsformular und Admin-Chat-Tab.

### Bekannte Lücken (siehe [arc42-Dokument](docs/arc42/arc42.md), Abschnitt 11, für Details)
- **Admin-Chat-Tab bestätigt nicht funktionsfähig** (Abnahmetest 2026-08-21): Tab rendert, Nachrichten können nicht abgeschickt werden. Diagnose läuft.
- `main.js` und die Admin-UI haben keine automatisierte Integrationstestabdeckung.
- Onboarding-Rückfragen im Chat sind aktuell nicht beantwortbar (kein Schreibzugriff des Chat-Agenten auf den Katalog).
- Keine Konversationshistorie über mehrere Chat-Fragen hinweg.
- Keine Auswahl der History-Adapterinstanz(en) und kein manueller Re-Discovery-Trigger in der Konfiguration.
- Kein Kosten-/Token-Budget für LLM-Aufrufe.
- Keine CI/Linting/Dependency-Scanning (geplant für einen Folge-Plan).

Vor produktivem Einsatz: manueller Abnahmetest an einer echten ioBroker-Instanz erforderlich.
