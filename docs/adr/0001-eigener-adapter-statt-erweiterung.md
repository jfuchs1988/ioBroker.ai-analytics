# ADR-0001: Eigener Adapter statt Erweiterung eines bestehenden KI-Adapters

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Vor Projektstart wurde geprüft, welche KI/AI-Adapter für ioBroker bereits existieren: AI Toolbox und AI Assistant (beide von ToGe3688). Beide sind allgemeine LLM-Integrationen, aber keiner deckt den konkreten Wunsch ab — Fragen zu historischen Daten mit Ursachenanalyse plus freie, KI-getriebene proaktive Überwachung. Beide sind zudem noch im Test-Status.

## Entscheidung

Ein neuer, eigener, schlanker Adapter (`ioBroker.ai-analytics`) wird gebaut statt einen bestehenden Adapter zu forken oder zu erweitern.

## Konsequenzen

- Voller Gestaltungsspielraum für die Katalog-/Onboarding-Architektur, die kein bestehender Adapter bietet.
- Kein Rückgriff auf bereits gehärteten Code — alles wird neu getestet (13-Task-TDD-Plan).
- Doppelarbeit zu AI Toolbox/AI Assistant in Grundfunktionen (Provider-Abstraktion, Chat-UI) ist bewusst in Kauf genommen.

## Verworfene Alternativen

- Fork/Erweiterung von AI Toolbox oder AI Assistant.
