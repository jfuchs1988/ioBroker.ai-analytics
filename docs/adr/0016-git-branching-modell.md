# ADR-0016: Git-Branching-Modell — develop/master mit manueller Freigabe

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Nach Abschluss der initialen Implementierung (siehe [ADR-0012](0012-isolierter-git-worktree.md)) musste ein Branching-Modell für die Weiterentwicklung festgelegt werden.

## Entscheidung

`develop` ist der dauerhafte Arbeits-Branch für alle Änderungen. `master` wird nur auf ausdrücklichen Wunsch des Nutzers aktualisiert (kein automatisches Mergen nach jedem Commit) — der Nutzer entscheidet bewusst, wann ein Stand in `master` landet.

## Konsequenzen

- `master` spiegelt immer einen vom Nutzer bewusst freigegebenen Stand wider, nicht jeden Zwischenschritt.
- Erfordert, dass explizit "merge nach master" angefragt wird — ohne diese Anfrage bleiben Änderungen auf `develop`.
- Releases/Tags werden typischerweise auf `master` gesetzt, nachdem ein Merge angefragt wurde.

## Verworfene Alternativen

- Jeden `develop`-Commit automatisch nach `master` mergen (ursprüngliches, vom Nutzer korrigiertes Verhalten).
