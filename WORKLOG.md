# Arbeitsstand

Dieser kurze Handoff-Stand wird während jedes Tasks live gepflegt. Er soll eine sichere Wiederaufnahme nach Abbruch, Fehler oder Sitzungswechsel ermöglichen.

## WIP

- Kein laufender Task.

## TODO

- Beim nächsten Task Branch (`feature/*` oder `fix/*`) und Ziel festlegen.
- Relevante Tests, Build und gegebenenfalls Live-Abnahme ausführen.

## DONE

- Prozessregeln auf Branch, Zwischen-Commits, Push, Merge nach `master` und GitHub-Release ausgerichtet.
- `master` als tatsächlichen Integrationsbranch dokumentiert; ältere `develop`-Regeln bleiben historische ADRs.
- `npm test` erfolgreich: 229 Unit-Tests und 1 Adaptertest.
- Release-Stand für `0.0.1-beta.15` vorbereitet.

## Übergabehinweise

- Bei laufender Arbeit hier Branch, letzten sicheren Commit, aktuelle Änderung, Blocker und nächste Aktion eintragen.
- Secrets und lokale Testartefakte niemals in den Worklog oder in Git aufnehmen.
