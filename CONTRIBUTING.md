# Entwicklungsprozess

Kurzreferenz, wie an `ioBroker.ai-analytics` gearbeitet wird. Details/Begründungen stehen in den einzelnen [ADRs](docs/adr/adr-index.md), insbesondere [ADR-0011](docs/adr/0011-subagent-driven-development.md), [ADR-0016](docs/adr/0016-git-branching-modell.md) und [ADR-0019](docs/adr/0019-feature-branch-pro-task.md).

## Branching-Modell

- Für jede Aufgabe wird ein eigener Branch angelegt (`feature/<kurzbeschreibung>` bzw. `fix/<kurzbeschreibung>`), vom aktuellen Integrationsstand abgezweigt.
- Nach grünem `npm test` wird der Task lokal per `git merge --no-ff` nach `master` gemergt und der Branch gelöscht.
- `master` ist damit der Integrations- und Abschlussstand für Aufgaben; Releases/Tags werden auf `master` gesetzt, wenn ein Merge gewünscht ist.

## Wann Spec / Plan / ADR nötig sind

| Änderungsart | Nötig |
|---|---|
| Neues Feature, Verhaltensänderung | Spec (`docs/specs/`) + Implementierungsplan (`docs/plans/`) vor dem Code |
| Architekturrelevante Entscheidung (Technologie, Datenmodell, Sicherheitsmodell) | Eigene ADR (`docs/adr/`) — offene Fragen vorher im [Backlog](docs/adr/backlog.md) sammeln |
| Bugfix, Tippfehler, kleines Refactoring | Eigener `fix/<kurzbeschreibung>`-Branch, wenn als Task bearbeitet; kleine Ad-hoc-Korrekturen nur nach Absprache direkt |

## Implementierungs-Workflow (bei Spec+Plan-pflichtigen Änderungen)

1. **Brainstorming** — Anforderungen klären, Ansätze vergleichen, mit dem Nutzer abstimmen.
2. **Spec** — abgestimmtes Design schriftlich festhalten (`docs/specs/YYYY-MM-DD-<thema>.md`).
3. **Plan** — in einzelne, TDD-taugliche Tasks zerlegen (`docs/plans/YYYY-MM-DD-<thema>.md`).
4. **TDD-Implementierung** — pro Task: Test zuerst (rot), dann Implementierung (grün), dann Commit.
5. **Review** — pro Task ein Review gegen Spec-Konformität und Code-Qualität; bei größeren Änderungen zusätzlich ein abschließendes Whole-Branch-Review.

## Modellwahl bei KI-gestützter Entwicklung

- Implementierung (Code schreiben, Tests ausführen): günstiges/schnelles Modell (aktuell: Haiku), wenn der Plan bereits detailliert genug ist.
- Review, Denken, Architekturentscheidungen: das jeweils teuerste verfügbare Modell der Sitzung.
- Details/Begründung: [ADR-0011](docs/adr/0011-subagent-driven-development.md).

## Tests

- `npm test` muss vor jedem Commit grün sein (aktuell: 222 Unit-Tests + 1 Adapter-Smoke-Test — Hinweis zur eingeschränkten Aussagekraft des Smoke-Tests in [Testkonzept](docs/architecture/08-querschnittliche-konzepte.md#84-testkonzept)).
- Neue `lib/*`-Module bekommen eigene Unit-Tests mit gemockter Adapter-API.

## Dokumentation aktuell halten

Bei jeder Änderung, die eines der folgenden betrifft, wird die entsprechende Doku im selben Commit/PR mit aktualisiert:

- Neues Modul/geänderte Schnittstelle → [Bausteinsicht](docs/architecture/05-bausteinsicht.md)
- Neuer bekannter Mangel/gelöste Lücke → [Risiken und technische Schulden](docs/architecture/11-risiken-und-schulden.md)
- Architekturentscheidung getroffen → neue Datei in `docs/adr/`, Eintrag aus dem [Backlog](docs/adr/backlog.md) entfernen (falls dort vorhanden), [adr-index.md](docs/adr/adr-index.md) ergänzen
- Release → [CHANGELOG.md](CHANGELOG.md)

## Commits

Commit-Nachrichten erklären das *Warum*, nicht nur das *Was*. KI-unterstützte Commits sind mit `Co-Authored-By:` gekennzeichnet.
