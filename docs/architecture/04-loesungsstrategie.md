# 4. Lösungsstrategie

[← zurück zur Architektur-Übersicht](arc42-index.md)

Fünf Grundentscheidungen prägen das System und lösen zusammen die in [Abschnitt 1](01-einfuehrung-und-ziele.md) genannten Qualitätsziele:

- **Ein Analyse-Kern für zwei Features**: Sowohl Chat-Q&A als auch proaktive Prüfung laufen über denselben Tool-Calling-Agent-Loop (`lib/agent.js`), nur mit unterschiedlichem System-Prompt/Ziel. Das vermeidet Doppelimplementierung und hält Verhalten konsistent. Löst Qualitätsziel 3 (geringer Overhead durch einen statt zwei Code-Pfade) mit.
- **Katalog als Gedächtnisschicht**: Statt bei jeder Anfrage den Objektbaum neu zu scannen und Bedeutungen neu zu erraten, klassifiziert ein einmaliger (danach inkrementeller) Onboarding-Lauf jedes geloggte Objekt und speichert das Ergebnis. Das hält Folgeanfragen günstig und schnell — direkt für Qualitätsziel 3.
- **Kuratierte Werkzeuge statt Rohzugriff**: Die KI bekommt nie direkten Query-Sprachzugriff (Flux/InfluxQL), sondern nur `getHistory`, `compareTimeframes`, `listCatalog` — sicherer, portabler zwischen Backends, vorhersagbarer. Trägt Qualitätsziel 2.
- **Provider-Abstraktion über REST**: Kein Vendor-SDK, eigene dünne Clients für Anthropic- und OpenAI-kompatibles Format (letzteres deckt OpenAI, OpenRouter und lokale Server ab) — minimiert Abhängigkeiten, maximiert Portabilität. Trägt Qualitätsziel 4.
- **TDD + Task-graduierte Subagenten-Entwicklung**: Der Implementierungsplan zerlegt das System in 13 unabhängig testbare Tasks; jede wird von einem Haiku-Implementierer nach striktem Test-zuerst-Vorgehen gebaut und von einem Sonnet-Reviewer gegen Spec und Codequalität geprüft, bevor der nächste Task startet. Details im [Implementierungsplan](../plans/2026-08-21-ai-analytics-implementation.md) und [CONTRIBUTING.md](../../CONTRIBUTING.md).

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [3. Kontextabgrenzung](03-kontextabgrenzung.md) · weiter zu [5. Bausteinsicht](05-bausteinsicht.md)
