# ADR-0011: Entwicklung via subagent-driven-development — günstiges Modell für Implementierung, teures für Review/Denken

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Alle 13 Implementierungs-Tasks sowie das finale Whole-Branch-Review wurden über einen Subagenten-Workflow gebaut. Es musste entschieden werden, welches KI-Modell für welche Rolle eingesetzt wird.

## Entscheidung

Implementierungs-Subagenten laufen auf einem günstigen/schnellen Modell (Haiku), da detaillierte, bereits mit exaktem Code spezifizierte Pläne eher Transkription als Problemlösung sind. Review, Denken und Planung laufen auf dem jeweils teuersten verfügbaren Modell der Sitzung (Sonnet für Task-Reviews, Opus für das finale Whole-Branch-Review) — festgelegt als Dauerregel des Nutzers.

## Konsequenzen

- Deutlich günstigere Gesamtkosten für die Implementierung bei gleichbleibender Qualität, solange Pläne detailliert genug sind.
- Reviewer müssen aktiv gegenprüfen statt Implementierer-Berichten zu vertrauen — ein günstiges Modell weicht bei mehrdeutigen Stellen eher unbemerkt vom Plan ab.
- In der Praxis bestätigt: die finale Whole-Branch-Review (Opus) fand mehrere reale Probleme (z. B. fehlender Zeitanker, unverschlüsselter API-Key), die in den günstigeren Task-Reviews nicht auffielen — der teurere Blick am Ende zahlt sich aus.

## Verworfene Alternativen

- Ein einheitliches Modell für alle Rollen.
