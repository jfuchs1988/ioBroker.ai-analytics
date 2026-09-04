# Arbeitsstand

Dieser kurze Handoff-Stand wird während jedes Tasks live gepflegt. Er soll eine sichere Wiederaufnahme nach Abbruch, Fehler oder Sitzungswechsel ermöglichen.

## WIP

- Branch: `feature/admin-settings-and-catalog-editing`
- Ziel: Einstellungen standardmäßig öffnen, Settings-CSV-Import reparieren, Katalogdaten gebündelt editierbar machen und Markdown-Antworten im Chat lesbar darstellen.
- Letzter sicherer Commit: `6d33bae merge: exclude .claude/ session state and eslint.config.js from npm package`.
- Aktueller Stand: In Arbeit. CSV-Import korrigiert, geschützte API-Schlüssel werden nicht mehr als unbrauchbare verschlüsselte Werte exportiert/importiert. Geräte-Komponente nutzt Auswahl plus Sammelspeicherung; Kategorie, Raum, Verhalten, Update-Frequenz, Vollständigkeit und Ignorieren sind editierbar. Automatische Keller-Zuordnung für PV, Wärmepumpen, Heizungs- und Weichwasseranlagen erweitert. Markdown-Renderer und Tests ergänzt.
- Verifiziert: `npm test` mit 300 Unit-Tests und 1 Adaptertest, ESLint und `npm run build:admin` erfolgreich. Admin-Bundle neu gebaut.
- PR #1 gegen `master` erstellt und gemergt. GitHub-Actions-CI bleibt deaktiviert; Tests, Lint und Admin-Build wurden lokal erfolgreich ausgeführt.
- Release `0.0.1-beta.36` wird direkt per Git/GitHub veröffentlicht.
- Erkenntnis für künftige Sessions: Bash-Tool-Aufrufe in diesem Environment sind für npm-/node_modules-lastige Befehle (Git-Bash/POSIX-Emulation auf OneDrive-Pfad) spürbar langsamer als natives PowerShell — bei Hängern zuerst mit dem PowerShell-Tool gegenprüfen, bevor man von einem echten Bug ausgeht. Nach mehreren Backgroundcommand-Läufen können verwaiste `node`/`vite`-Prozesse übrig bleiben (`ps aux`), die neue Läufe zusätzlich ausbremsen.
- Bekannter Nebeneffekt (aus vorherigem Task, bewusst nicht angefasst): `docs/adr/0016-git-branching-modell.md` und `docs/adr/0019-feature-branch-pro-task.md` verlinken `AGENTS.md` — die Links zeigen auf GitHub künftig ins Leere, da die Datei dort nicht mehr existiert. ADR-Historie wurde nicht nachträglich verändert.
- Offen/Rückfrage an Nutzer: `[E250]`/`[E999]`/`[W401]` aus dem Repository-Checker hängen daran, dass der Adapter nie `npm publish`t und nie beim offiziellen ioBroker-Repository eingereicht wurde — das war in ADR-0018 eine bewusste Entscheidung, die aber durch ADR-0027 (MIT-Kern) inzwischen technisch möglich wäre. Keine ADR hat bisher entschieden, das tatsächlich zu tun; nicht ungefragt umgesetzt.

## TODO

- Technische Entitlement-/Sponsor-Token-Spezifikation und Implementierungsplan erstellen.

## DONE

- Admin-Einstellungen, CSV-Import, gebündelte Katalogbearbeitung und Markdown-Chatdarstellung verbessert; PR #1 gemergt.

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
- Beta-Ende `0.1.0`, Ed25519-JWS, separate Token-Webanwendung und die finalen Grace-/Chat-Regeln festgelegt.
- Release `0.0.1-beta.28` erstellt, nach `master` gemergt, als `v0.0.1-beta.28` getaggt, gepusht und auf GitHub veröffentlicht.
- Offline prüfbare Ed25519-JWS-Entitlement-Grundlage mit Beta-Guard, Lizenzstatus-States und täglichem Chat-Fallback integriert.
- Release `0.0.1-beta.29` erstellt, nach `master` gemergt, als `v0.0.1-beta.29` getaggt, gepusht und auf GitHub veröffentlicht.
- Veröffentlichungsanforderungen ohne npm-Publishing vorbereitet: README EN/DE, Icon, Metadaten und GitHub-Topics.
- Release `0.0.1-beta.30` erstellt, nach `master` gemergt, als `v0.0.1-beta.30` getaggt, gepusht und auf GitHub veröffentlicht.
- Systemreview-Fixes für Veröffentlichung und Entitlement-Vertrag integriert.
- Release `0.0.1-beta.31` erstellt, nach `master` gemergt, als `v0.0.1-beta.31` getaggt, gepusht und auf GitHub veröffentlicht.
- Repository-Checker-Fixes für Metadaten, Lizenz, News, Dependencies und Paketinhalt integriert.
- Release `0.0.1-beta.32` erstellt, nach `master` gemergt, als `v0.0.1-beta.32` getaggt, gepusht und auf GitHub veröffentlicht.
- Nach Abbruch in OpenCode fortgesetzt: ungültiges JSON in `io-package.json` (überzähliges Komma im news-Objekt) behoben, das den vorherigen Task blockiert hatte. Release `0.0.1-beta.33` erstellt, nach `master` gemergt, als `v0.0.1-beta.33` getaggt, gepusht und auf GitHub veröffentlicht.
- Repository-Checker-Befund `W1068` behoben (verbotenes `iobroker`-Keyword aus `io-package.json` entfernt). Release `0.0.1-beta.34` erstellt, nach `master` gemergt, als `v0.0.1-beta.34` getaggt, gepusht und auf GitHub veröffentlicht.
- `AGENTS.md`/`CLAUDE.md` aus dem öffentlichen GitHub-Repo entfernt (lokal erhalten). GitHub-Actions-Workflows `CI`/`Release` auf Nutzerwunsch deaktiviert.
- Node.js-Mindestversion auf 22 angehoben, alle Abhängigkeiten auf neueste kompatible Version aktualisiert (ESLint 10 Flat-Config-Migration, mocha 12); `0.0.1-beta.35`, nach `master` gemergt. Kein Release-Tag, da `Release`-Workflow deaktiviert ist.

## Übergabehinweise

- Bei laufender Arbeit hier Branch, letzten sicheren Commit, aktuelle Änderung, Blocker und nächste Aktion eintragen.
- Secrets und lokale Testartefakte niemals in den Worklog oder in Git aufnehmen.
