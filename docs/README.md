# Dokumentation — ioBroker.ai-analytics

[← zurück zum Projekt-Root](../README.md)

Diese Seite ist der zentrale Einstiegspunkt (Map of Content) in die gesamte Projektdokumentation.

## Architektur

- **[arc42-Architekturdokumentation](architecture/arc42-index.md)** — vollständiger Überblick über Ziele, Bausteine, Laufzeitverhalten, Randbedingungen, Risiken
- **[Architekturentscheidungen (ADRs)](adr/adr-index.md)** — jede Entscheidung einzeln, mit Kontext und Konsequenzen
- **[Backlog offener Architekturentscheidungen](adr/backlog.md)** — architekturrelevante Fragen, die noch diskutiert werden müssen
- **[Produkt-Roadmap und globale TODO-Liste](roadmap.md)** — priorisierte Nutzerwünsche, Produktlücken und empfohlene nächste Schritte

## Specs

- [2026-08-21 — ai-analytics Design](specs/2026-08-21-ai-analytics-design.md) — das ursprüngliche, mit dem Nutzer abgestimmte Design
- [2026-09-02 — Provider-Modellerkennung und Sponsoring](specs/2026-09-02-provider-model-discovery-and-sponsoring.md) — kostenlose API-Einstiege, dynamische Modellvorschläge und sichtbare Sponsoring-Links
- [2026-09-02 — Geräteübersicht in den Adapter-Einstellungen](specs/2026-09-02-geraete-in-einstellungen.md) — dynamische Katalogverwaltung in der JSON-Konfiguration
- [2026-09-03 — Hybride Anomalieerkennung](specs/2026-09-03-hybride-anomalieerkennung.md) — statistische Kandidatenstufe vor der proaktiven LLM-Prüfung
- [2026-09-03 — Hybrides Lizenzmodell und Entitlements](specs/2026-09-03-hybrid-license-and-entitlements.md) — MIT-Kern und sponsor-required KI-Komponenten

## Pläne

- [2026-08-21 — ai-analytics Implementierung](plans/2026-08-21-ai-analytics-implementation.md) — die 13 TDD-Tasks, aus denen der Adapter gebaut wurde (Status: abgeschlossen)
- [2026-09-02 — Provider-Modellerkennung und Sponsoring](plans/2026-09-02-provider-model-discovery-and-sponsoring.md) — **abgeschlossen**, Modelllisten und GitHub Sponsors
- [2026-09-02 — Geräteübersicht in den Adapter-Einstellungen](plans/2026-09-02-geraete-in-einstellungen.md) — **umgesetzt**, Custom-Config-Komponente und Verlagerung aus dem Custom-Tab
- [2026-09-03 — Hybride Anomalieerkennung](plans/2026-09-03-hybride-anomalieerkennung-implementation.md) — **Phase 1 umgesetzt**, robuste Voranalyse numerischer Gauge-Zeitreihen
- [2026-09-03 — Hybrides Lizenzmodell und Entitlements](plans/2026-09-03-hybrid-license-and-entitlements.md) — **Schritte 1 und 2 umgesetzt**, technische Entitlement-Prüfung offen

## Prozess

- [CONTRIBUTING.md](../CONTRIBUTING.md) — Branching-Modell, wann Spec/Plan/ADR nötig sind, TDD-/Review-Erwartung
- [WORKLOG.md](../WORKLOG.md) — aktueller WIP/TODO/DONE-Arbeitsstand für Übergaben und Wiederaufnahme

## Änderungen

- [CHANGELOG.md](../CHANGELOG.md) — Versionshistorie
