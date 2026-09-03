# Arbeitsstand

Dieser kurze Handoff-Stand wird während jedes Tasks live gepflegt. Er soll eine sichere Wiederaufnahme nach Abbruch, Fehler oder Sitzungswechsel ermöglichen.

## WIP

- Branch: `feature/entitlement-architecture-decisions`
- Ziel: Beta-Ende, JWS-Tokenformat und Ausstellungs-Webanwendung als verbindliche Entitlement-Architektur festlegen.
- Letzter sicherer Commit: `3095f0a docs: finalize entitlement architecture decisions`.
- Aktueller Stand: Beta-Ende `0.1.0`, Ed25519-JWS und separate Webanwendung sind dokumentiert; Release-Vorbereitung für `0.0.1-beta.28` läuft.
- Nächster Schritt: Release-Vorbereitung committen, Branch nach `master` integrieren und `v0.0.1-beta.28` veröffentlichen.

## TODO

- Technische Entitlement-/Sponsor-Token-Spezifikation und Implementierungsplan erstellen.

## DONE

- Spezifikation, Plan und ADR für nutzerbestätigte Gerätepflege im Chat angelegt.
- Batch-Schreibwerkzeug und adapterbezogene Onboarding-Defaults implementiert; Tests ergänzt.
- 238 Unit-Tests, ESLint und Admin-Build erfolgreich; GitHub-Actions-CI für Tests, Linting, Build und Dependency-Audit ergänzt.
- History-Health-Status mit Meldung nach drei Fehlern, Retries nach 12/24/48 Stunden und Reset nach Erfolg implementiert; 241 Unit-Tests erfolgreich.
- Release `0.0.1-beta.18` erstellt, nach `master` gemergt, als `v0.0.1-beta.18` getaggt, gepusht und auf GitHub veröffentlicht.
- GitHub Actions CI für `master` erfolgreich: Linting, Tests, Admin-Build und Dependency-Audit.
- Globale Produkt-Roadmap mit priorisierten Findings und empfohlenem nächsten Entwicklungsschritt dokumentiert.
- Phase 1 der hybriden Anomalieerkennung implementiert: robuste Voranalyse und LLM-Gate für Gauge-Zeitreihen.
- Release `0.0.1-beta.23` erstellt, nach `master` gemergt, als `v0.0.1-beta.23` getaggt, gepusht und auf GitHub veröffentlicht.
- Admin-JSON- und Prüf-Fortschrittsanzeige-Fix integriert.
- Release `0.0.1-beta.24` erstellt, nach `master` gemergt, als `v0.0.1-beta.24` getaggt, gepusht und auf GitHub veröffentlicht.
- Fortschritts-Callback für die statistische Anomalievoranalyse ergänzt.
- Release `0.0.1-beta.25` erstellt, nach `master` gemergt, als `v0.0.1-beta.25` getaggt, gepusht und auf GitHub veröffentlicht.
- Release `0.0.1-beta.22` erstellt, nach `master` gemergt, als `v0.0.1-beta.22` getaggt, gepusht und auf GitHub veröffentlicht.
- Durchflusstest für Discovery → Onboarding → Katalog-State-Persistenz ergänzt.
- Release `0.0.1-beta.21` erstellt, nach `master` gemergt, als `v0.0.1-beta.21` getaggt, gepusht und auf GitHub veröffentlicht.
- GitHub Actions CI für `master` erfolgreich: Linting, Tests, Admin-Build und Dependency-Audit.
- Prozessregeln auf Branch, Zwischen-Commits, Push, Merge nach `master` und GitHub-Release ausgerichtet.
- `master` als tatsächlichen Integrationsbranch dokumentiert; ältere `develop`-Regeln bleiben historische ADRs.
- `npm test` erfolgreich: 229 Unit-Tests und 1 Adaptertest.
- Release-Stand für `0.0.1-beta.15` vorbereitet.
- Datenqualitäts-Feature in `master` integriert.
- Datenqualitäts-Feature als `v0.0.1-beta.19` veröffentlicht; GitHub-Release erstellt und Branch bereinigt.
- Main-/Admin-Orchestrator-Tests ergänzt; 276 Unit-Tests, ESLint und Admin-Build erfolgreich.
- Release `0.0.1-beta.20` erstellt, nach `master` gemergt, als `v0.0.1-beta.20` getaggt, gepusht und auf GitHub veröffentlicht.
- GitHub Actions CI für `master` erfolgreich: Linting, Tests, Admin-Build und Dependency-Audit.
- Hybrid-Lizenzgrundlage als MIT-Kern mit separat dokumentierten sponsor-pflichtigen KI-Komponenten veröffentlicht.
- Sponsoring-Entitlement-Regeln dokumentiert: 35-Tage-Token, 30 Tage Sponsoring, 30 Tage Grace, keine Instanzbindung, Offline-Prüfung und eine Chat-Anfrage pro Tag.
- Release `0.0.1-beta.27` erstellt, nach `master` gemergt, als `v0.0.1-beta.27` getaggt, gepusht und auf GitHub veröffentlicht.

## Übergabehinweise

- Bei laufender Arbeit hier Branch, letzten sicheren Commit, aktuelle Änderung, Blocker und nächste Aktion eintragen.
- Secrets und lokale Testartefakte niemals in den Worklog oder in Git aufnehmen.
