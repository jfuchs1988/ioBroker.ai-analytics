# Arbeitsstand

Dieser kurze Handoff-Stand wird während jedes Tasks live gepflegt. Er soll eine sichere Wiederaufnahme nach Abbruch, Fehler oder Sitzungswechsel ermöglichen.

## WIP

- Branch: `feature/test-main-admin-coverage`
- Ziel: Proxyquire-basierte Testabdeckung für `main.js`-Lifecycle/Dispatcher und Admin-Kommandos ergänzen.
- Letzter sicherer Commit: `7543d37 test: cover main adapter orchestration paths`.
- Aktueller Stand: Proxyquire-/Sinon-Tests für Dispatch, Callback-/Fehlerpfade, Bridge-Verdrahtung, Unload und Datenqualitäts-Backfills ergänzt; 276 Unit-Tests, ESLint und Admin-Build grün. Release-Vorbereitung für `0.0.1-beta.20` läuft.
- Nächster Schritt: Release-Vorbereitung committen, Branch nach `master` integrieren und `v0.0.1-beta.20` veröffentlichen.

## TODO

- Architekturentscheidung für die Release-Policy nach der Beta treffen.

## DONE

- Spezifikation, Plan und ADR für nutzerbestätigte Gerätepflege im Chat angelegt.
- Batch-Schreibwerkzeug und adapterbezogene Onboarding-Defaults implementiert; Tests ergänzt.
- 238 Unit-Tests, ESLint und Admin-Build erfolgreich; GitHub-Actions-CI für Tests, Linting, Build und Dependency-Audit ergänzt.
- History-Health-Status mit Meldung nach drei Fehlern, Retries nach 12/24/48 Stunden und Reset nach Erfolg implementiert; 241 Unit-Tests erfolgreich.
- Release `0.0.1-beta.18` erstellt, nach `master` gemergt, als `v0.0.1-beta.18` getaggt, gepusht und auf GitHub veröffentlicht.
- GitHub Actions CI für `master` erfolgreich: Linting, Tests, Admin-Build und Dependency-Audit.
- Prozessregeln auf Branch, Zwischen-Commits, Push, Merge nach `master` und GitHub-Release ausgerichtet.
- `master` als tatsächlichen Integrationsbranch dokumentiert; ältere `develop`-Regeln bleiben historische ADRs.
- `npm test` erfolgreich: 229 Unit-Tests und 1 Adaptertest.
- Release-Stand für `0.0.1-beta.15` vorbereitet.
- Datenqualitäts-Feature in `master` integriert.
- Datenqualitäts-Feature als `v0.0.1-beta.19` veröffentlicht; GitHub-Release erstellt und Branch bereinigt.

## Übergabehinweise

- Bei laufender Arbeit hier Branch, letzten sicheren Commit, aktuelle Änderung, Blocker und nächste Aktion eintragen.
- Secrets und lokale Testartefakte niemals in den Worklog oder in Git aufnehmen.
