# ADR-0019: Feature-/Bugfix-Branch pro Umsetzungsplan-Task, lokal nach develop gemergt

[← ADR-Übersicht](adr-index.md)

> **Hinweis:** Diese ADR beschreibt den früheren lokalen `develop`-Merge als historische Prozessentscheidung. Die aktuelle versionierte Arbeitsanweisung steht in [CONTRIBUTING.md](../../CONTRIBUTING.md) und im [Entwicklungsworkflow](../agents/development-workflow.md).

**Status:** Angenommen
**Datum:** 2026-08-22

## Kontext

[ADR-0016](0016-git-branching-modell.md) legte fest, dass `develop` der dauerhafte Arbeits-Branch ist und `master` nur auf ausdrücklichen Wunsch aktualisiert wird. Bisher landete dabei jeder Commit direkt auf `develop` — kein Branch-Layer zwischen einzelnem Task und `develop`. Der Nutzer wollte stattdessen pro Aufgabe einen eigenen Branch, der lokal nach `develop` gemergt wird, bevor irgendetwas gepusht wird.

## Entscheidung

Granularität ist **ein Branch pro Task im Umsetzungsplan** (`docs/plans/*.md`), nicht pro einzelnem Commit:

1. Für jeden Plan-Task wird von `develop` aus ein Branch erstellt (`feature/<kurzbeschreibung>` bzw. `fix/<kurzbeschreibung>` je nach Art des Tasks).
2. Der TDD-Zyklus für diesen Task (roter Test-Commit, grüner Implementierungs-Commit, ggf. weitere) läuft vollständig auf diesem Branch.
3. Nach Abschluss des Tasks (inkl. `npm test` grün) wird lokal nach `develop` gemergt (`git merge --no-ff`, damit die Task-Historie im Merge-Commit sichtbar bleibt) und der Branch anschließend gelöscht.
4. Gepusht wurde weiterhin nur auf ausdrücklichen Wunsch — dieses ADR änderte nichts an der `develop`/`master`-Freigabelogik aus ADR-0016, es fügte nur eine lokale Zwischenebene zwischen einzelnem Task und `develop` ein.

Bugfixes/Tippfehler/kleine Refactorings ohne Plan-Task (siehe [CONTRIBUTING.md](../../CONTRIBUTING.md)) blieben von dieser Entscheidung unberührt — dafür blieb es bei direkten Commits auf `develop`, ein Branch für eine Ein-Zeilen-Korrektur war unverhältnismäßiger Overhead.

## Konsequenzen

- `develop`s Verlauf zeigt pro Task einen Merge-Commit statt einer flachen Commit-Folge — leichter nachvollziehbar, welche Commits zusammengehören, und ein Task lässt sich bei Bedarf komplett zurückrollen (`git reset`/`revert` auf den Merge-Commit).
- Etwas mehr Zeremonie pro Task (Branch anlegen, mergen, löschen) — bewusst in Kauf genommen für die bessere Nachvollziehbarkeit.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) wird um diesen Ablauf ergänzt.

## Verworfene Alternativen

- **Ein Branch pro einzelnem Commit** (auch getrennt für den roten Test-Commit und den grünen Implementierungs-Commit): unüblich, erzeugt Branch-Overhead ohne echten Nutzen, da die Branches ohnehin sofort wieder verschwinden — vom Nutzer nach Rückfrage verworfen.
- **Beibehaltung des Status quo** (jeder Commit direkt auf `develop`): vom Nutzer explizit als Änderungswunsch vorgebracht, keine Alternative mehr.
