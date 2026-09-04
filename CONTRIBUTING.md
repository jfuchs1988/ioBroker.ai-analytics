# Entwicklungsprozess

Kurzreferenz, wie an `ioBroker.ai-analytics` gearbeitet wird. Details/Begründungen stehen in den einzelnen [ADRs](docs/adr/adr-index.md), insbesondere [ADR-0011](docs/adr/0011-subagent-driven-development.md), [ADR-0016](docs/adr/0016-git-branching-modell.md) und [ADR-0019](docs/adr/0019-feature-branch-pro-task.md).

## Branching- und Release-Modell

- Der aktuelle Integrationsbranch heißt in diesem Repository `master` und ist damit der operative „Main“-Branch. Ältere Hinweise auf `develop` oder `main` sind historischer Kontext.
- Für jedes Feature wird ein eigener `feature/<kurzbeschreibung>`-Branch, für jeden Bugfix ein eigener `fix/<kurzbeschreibung>`-Branch vom aktuellen `master` angelegt.
- Die Lösung wird auf dem Task-Branch umgesetzt. Wenn Commits beauftragt sind,
  werden sie in sinnvolle, thematisch geschlossene Zwischenstände geteilt.
- Nach erfolgreicher Verifikation wird nur auf ausdrücklichen Auftrag committed,
  gepusht, nach `master` gemergt oder veröffentlicht.
- Releases werden bewusst manuell erstellt; es gibt keine GitHub-Actions-
  Workflows im Repository. Ein Release-Task aktualisiert Version,
  `CHANGELOG.md` und `io-package.json`, baut das Paket lokal und erstellt danach
  Tag und GitHub-Release.

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
4. **TDD-Implementierung** — pro Task: Test zuerst (rot), dann Implementierung
   (grün); bei beauftragten Commits anschließend einen geschlossenen
   Zwischenstand erstellen.
5. **Review** — pro Task ein Review gegen Spec-Konformität und Code-Qualität; bei größeren Änderungen zusätzlich ein abschließendes Whole-Branch-Review.

## Tests

- `npm test` muss vor jedem Commit grün sein. Die aktuelle Testanzahl kommt aus
  der Testausgabe; die eingeschränkte Aussagekraft des Adaptertests steht im
  [Testkonzept](docs/architecture/08-querschnittliche-konzepte.md#84-testkonzept).
- Neue `lib/*`-Module bekommen eigene Unit-Tests mit gemockter Adapter-API.
- `npm run lint` gehört zur Abschlussprüfung. Änderungen unter `src-admin/`
  erfordern zusätzlich `npm run build:admin`.

## Dokumentation aktuell halten

Der laufende Arbeitsstand wird während jedes Tasks in [WORKLOG.md](WORKLOG.md) gepflegt:

- `WIP`: Was gerade bearbeitet wird und welcher Branch aktiv ist.
- `TODO`: Offene nächste Schritte, Tests, Review- oder Release-Aktionen.
- `DONE`: Bereits abgeschlossene Schritte und ihre Prüfergebnisse.
- Bei Abbruch oder Fehlern: Blocker, letzter sicherer Commit und nächste Aktion eintragen.

Bei jeder Änderung, die eines der folgenden betrifft, wird die entsprechende Doku im selben Commit/PR mit aktualisiert:

- Neues Modul/geänderte Schnittstelle → [Bausteinsicht](docs/architecture/05-bausteinsicht.md)
- Neuer bekannter Mangel/gelöste Lücke → [Risiken und technische Schulden](docs/architecture/11-risiken-und-schulden.md)
- Architekturentscheidung getroffen → neue Datei in `docs/adr/`, Eintrag aus dem [Backlog](docs/adr/backlog.md) entfernen (falls dort vorhanden), [adr-index.md](docs/adr/adr-index.md) ergänzen
- Release → [CHANGELOG.md](CHANGELOG.md)

## Verbindlicher Ablauf

1. `WORKLOG.md` auf `WIP` setzen und Branch/Status/Dokumentation prüfen.
2. `feature/*` oder `fix/*` erstellen und Lösung implementieren.
3. Worklog und betroffene Fach-/Architekturdokumentation live aktualisieren.
4. Zwischenstände und den vollständigen Stand vor einer angeforderten
   Veröffentlichung committen.
5. `npm test`, Build und bei UI-Änderungen die Live-Abnahme durchführen.
6. Auf ausdrücklichen Auftrag Branch pushen, nach `master` mergen und Branch
   löschen.
7. Bei einem Release-Auftrag Version/Changelog aktualisieren, Paket prüfen,
   `npm run test:e2e` einmal manuell ausführen (echter js-controller-Test,
   siehe `docs/agents/testing.md`), Tag pushen und GitHub-Release manuell
   erstellen.
8. `WORKLOG.md` auf `DONE` setzen und Status sauber hinterlassen.

## Commits

Commit-Nachrichten erklären das *Warum*, nicht nur das *Was*. Keine Secrets,
lokalen Zugangsdaten oder generierten Testartefakte committen.
