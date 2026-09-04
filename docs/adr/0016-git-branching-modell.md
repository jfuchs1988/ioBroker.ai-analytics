# ADR-0016: Git-Branching-Modell — develop/master mit manueller Freigabe

[← ADR-Übersicht](adr-index.md)

> **Hinweis:** Diese ADR dokumentiert den früheren develop-first-Workflow als historische Entscheidungsgrundlage. Die aktuelle versionierte Arbeitsanweisung steht in [CONTRIBUTING.md](../../CONTRIBUTING.md) und im [Entwicklungsworkflow](../agents/development-workflow.md).

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Nach Abschluss der initialen Implementierung (siehe [ADR-0012](0012-isolierter-git-worktree.md)) musste ein Branching-Modell für die Weiterentwicklung festgelegt werden.

## Entscheidung

`develop` war der dauerhafte Arbeits-Branch für alle Änderungen. `master` wurde nur auf ausdrücklichen Wunsch des Nutzers aktualisiert (kein automatisches Mergen nach jedem Commit) — der Nutzer entschied bewusst, wann ein Stand in `master` landete.

## Konsequenzen

- `master` spiegelte immer einen vom Nutzer bewusst freigegebenen Stand wider, nicht jeden Zwischenschritt.
- Erforderte, dass explizit "merge nach master" angefragt wird — ohne diese Anfrage blieben Änderungen auf `develop`.
- Releases/Tags wurden typischerweise auf `master` gesetzt, nachdem ein Merge angefragt wurde.

## Verworfene Alternativen

- Jeden `develop`-Commit automatisch nach `master` mergen (ursprüngliches, vom Nutzer korrigiertes Verhalten).
