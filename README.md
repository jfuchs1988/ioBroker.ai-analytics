# ioBroker.ai-analytics

Ein ioBroker-Adapter, der zwei Fähigkeiten kombiniert:

1. **Chat-Q&A** — Fragen in natürlicher Sprache zu historischen Verbrauchs-/Nutzungsdaten (z. B. "Wie hat sich mein Stromverbrauch verändert und warum?"), beantwortet anhand der in InfluxDB/History/SQL geloggten Objekte.
2. **Proaktive Prüfungen** — ein periodischer Hintergrundlauf lässt eine KI eigenständig auf Auffälligkeiten prüfen (Gerätenutzung, Beleuchtung, Verbrauch, PV-Einspeisung) und meldet Ergebnisse im Chat.

Nur Objekte mit aktivem History-/InfluxDB-/SQL-Logging werden berücksichtigt. Ein einmaliger (danach inkrementeller) Onboarding-Lauf klassifiziert jedes gefundene Objekt semantisch und fragt bei Unklarheit im Chat nach, statt zu raten.

## Dokumentation

Zentraler Einstiegspunkt: **[docs/README.md](docs/README.md)**.

- [Architekturdokumentation (arc42)](docs/architecture/arc42-index.md) — vollständiger Überblick über Ziele, Bausteine, Laufzeitverhalten, Entscheidungen und offene Risiken.
- [Architekturentscheidungen (ADRs)](docs/adr/adr-index.md) und [Backlog offener Entscheidungen](docs/adr/backlog.md).
- [Design-Spec](docs/specs/2026-08-21-ai-analytics-design.md) — das ursprüngliche, mit dem Nutzer abgestimmte Design.
- [Implementierungsplan](docs/plans/2026-08-21-ai-analytics-implementation.md) — die 13 TDD-Tasks, aus denen der Adapter gebaut wurde, inkl. "Known Gaps"-Abschnitt für offene Punkte.
- [CONTRIBUTING.md](CONTRIBUTING.md) — unser Entwicklungsprozess (Branching, wann Spec/Plan/ADR nötig sind, TDD-Erwartung).

## Status

v0.0.1-beta released. Alle 13 Implementierungs-Tasks sind abgeschlossen und reviewt. Manueller Abnahmetest läuft: Installation/Start/Discovery/Katalog bestätigt funktionierend, **Admin-Chat-Tab bestätigt defekt** (Diagnose läuft) — siehe [Risiken und technische Schulden](docs/architecture/11-risiken-und-schulden.md) für Details.

## Voraussetzungen

- Node.js >= 18
- Eine laufende ioBroker-Instanz mit mindestens einer aktiven `influxdb`-, `history`- oder `sql`-Adapterinstanz
- Ein API-Key für mindestens einen unterstützten LLM-Provider (Anthropic, OpenAI, OpenRouter) — oder ein lokal erreichbarer OpenAI-kompatibler Server (z. B. LM Studio)

## Entwicklung

```bash
npm install
npm test
```

`npm test` führt sowohl die Unit-Tests (`test/unit/**/*.test.js`) als auch den Adapter-Smoke-Test (`test/adapter.test.js`, über `@iobroker/testing`) aus.

## Konfiguration

Über die ioBroker-Admin-Oberfläche einstellbar: LLM-Provider und API-Key, Modell, Basis-URL (für OpenRouter/lokale Server), Intervall der proaktiven Prüfung, Verhalten bei ergebnislosem Prüflauf (still vs. Bestätigung).
