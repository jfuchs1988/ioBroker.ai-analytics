# ADR-0012: Isolierter Git-Worktree für die Implementierung

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen (Maßnahme abgeschlossen)
**Datum:** 2026-08-21

## Kontext

Die 13-Task-Implementierung sollte den zu diesem Zeitpunkt einzigen Branch (`master`) nicht direkt verändern, solange die Arbeit nicht abgeschlossen und reviewt war.

## Entscheidung

Die gesamte Implementierung lief in einem isolierten Git-Worktree (`worktree-ai-analytics-impl`), abgezweigt von `master`. Nach Abschluss (alle Tasks + finales Review + Fix-Welle grün) wurde lokal in `master` gemergt, gepusht, und Worktree/Branch gelöscht.

## Konsequenzen

- `master` blieb während der gesamten Implementierung unberührt und funktionsfähig.
- Nach Abschluss wurde `develop` als dauerhafter Arbeits-Branch für die Weiterentwicklung eingeführt (siehe [ADR-0016](0016-git-branching-modell.md)) — der isolierte Worktree war ein einmaliges Mittel für die initiale Implementierung, kein Dauerzustand.

## Verworfene Alternativen

- Direkt auf `master` entwickeln.
