# Arbeitsstand

Dieser kurze Handoff-Stand wird während jedes Tasks live gepflegt. Er soll eine sichere Wiederaufnahme nach Abbruch, Fehler oder Sitzungswechsel ermöglichen.

## WIP

- Branch: `feature/daily-budget-in-eur`
- Ziel: Nutzer-Feedback: Tagesbudget-Feld (`dailyTokenBudget`) war eine rohe Tokenzahl, wurde aber als EUR-Betrag missverstanden ("5" gesetzt und sofort erschöpft); Kosten sollten überall mit €-Zeichen angezeigt werden; Reset-Button im Admin schien zu fehlen (Code-Review ergab: Komponente ist korrekt implementiert/gebaut/referenziert — vermutlich veralteter Bundle-/Deploy-Stand auf der Live-Instanz, kein Codefehler); Budget-Anzeige zeigte "(kein Limit)", obwohl ein Wert gesetzt war (Ursache: `usage.todaySummary` wurde nur bei Verbrauch/Reset neu berechnet, nicht beim Adapterstart nach einer Konfigurationsänderung).
- Entscheidung ([ADR-0028](docs/adr/0028-tagesbudget-in-eur-statt-token.md)): Feld umbenannt zu `dailyBudgetEur`, als EUR-Limit interpretiert; `isBudgetExceeded` vergleicht die aus Preisen berechneten Ist-Kosten des Tages statt Rohtokens. Ohne gesetzten Preis kann das Limit nichts bewirken (Kosten bleiben 0) — Admin-UI-Validator (`validatorNoSaveOnError`) verhindert deshalb das Speichern eines Budgets > 0 ohne Preis. Neue Funktion `refreshTodaySummary(adapter)` wird in `onReady` aufgerufen, damit die Anzeige nach Neustart sofort aktuell ist.
- Alle Kostenanzeigen (Settings-Zusammenfassung `lib/usage.js`, Chat-Tab-Budgetzeile/Verbrauchszeile/Kosten-im-Zeitraum in `admin/tab.js`) zeigen jetzt € mit deutscher Zahlenformatierung, unverändert 4 bzw. 6 Nachkommastellen (kein Runden auf 2 Nachkommastellen wie beim `Intl.NumberFormat`-Currency-Style-Default).
- Rename betrifft: `io-package.json` (native default), `admin/jsonConfig.json` (Feld + Hilfetext + Validator), `lib/usage.js`, `main.js` (Log-/Fehlertexte "Tagesbudget an Tokens" → "Tagesbudget (EUR)"), `lib/onboarding.js` (dito), `src-admin/src/Components.jsx` (CSV-Import/Export-Spalte), `admin/tab.js` (`formatBudgetLine` nutzt jetzt den Tages-History-Eintrag + Preise statt `usage.today`).
- Verifiziert: 373 Unit-Tests, 1 Adaptertest, ESLint und Admin-Build erfolgreich.
- Reset-Button-Befund für den Nutzer: Quellcode, jsonConfig-Referenz und gebautes Bundle wurden geprüft und sind korrekt; falls der Button auf der Live-Instanz weiterhin fehlt, deutet das auf einen alten Bundle-/Deploy-Stand hin, nicht auf einen Code-Fehler.

- Branch: `fix/budget-summary-readability`
- Ziel: Nutzer-Feedback zu "Aktuelles Budget (heute)" in den Settings: Tokenzahlen ohne Tausendertrennzeichen kaum lesbar, keine Trennung Chat/Onboarding, keine berechneten Kosten, Reset-Ergebnis (0-Verbrauch) nicht klar erkennbar.
- Fix: `formatTodaySummary(todayEntry, dailyTokenBudget, prices)` in `lib/usage.js` umgebaut — nutzt `Intl.NumberFormat('de-DE')` für Tausenderpunkte, zeigt Chat- und Onboarding-Tokens getrennt inkl. aus den konfigurierten Preisen live berechneter Kosten (gleiche Rechenweise wie `admin/tab.js: computeCost`). `recordHistoryEntry` gibt jetzt den Tageseintrag zurück, damit `recordUsageUnlocked`/`resetUsageUnlocked` ihn zusammen mit `pricesFromConfig(adapter.config)` an `formatTodaySummary` übergeben können. `admin/jsonConfig.json`: `budgetSummary`-Feld auf volle Breite gesetzt (Text ist jetzt länger) und `sponsorLink` bekommt `newLine: true`, damit es nicht mehr neben das jetzt breitere Feld gequetscht wird.
- Verifiziert: 370 Unit-Tests, 1 Adaptertest, ESLint erfolgreich. Kein Admin-Build nötig (nur `lib/usage.js` und `admin/jsonConfig.json` geändert, kein `src-admin`).
- PR #11 gegen `master` erstellt und gemergt; Release `0.0.1-beta.45` manuell auf GitHub veröffentlicht (kein Tarball-Asset). DONE.

- Branch: `fix/settings-csv-import-loses-changes`
- Ziel: Beim Settings-CSV-Import gehen fast alle importierten Werte verloren; Speichern-Button und Formularfelder reagieren nicht.
- Letzter sicherer Commit: `3fccf0a release: 0.0.1-beta.43`.
- Root Cause (per Live-Debugging in Chrome verifiziert): `SettingsCsvComponent.handleFileSelected` (`src-admin/src/Components.jsx`) ruft für jede importierte Spalte `await this.onChange(key, value)` auf. `ConfigGeneric.onChange()` aus `@iobroker/json-config` löst sein zurückgegebenes Promise sofort auf, ohne auf den echten Callback zu warten, der erst feuert, wenn der übergeordnete State die Änderung tatsächlich übernommen hat. Bei vielen schnellen Aufrufen hintereinander überschreiben sich die Änderungen gegenseitig anhand veralteter Datenschnappschüsse; nur die letzte Spalte kommt (zufällig) teilweise an. Reproduziert im Browser: Import mit 1 Spalte funktioniert, Import mit 19 Spalten verliert fast alle Werte.
- Fix: `this.onChangeAsync(key, value)` statt `this.onChange(key, value)` verwenden — wartet korrekt auf den echten Callback, bevor die nächste Spalte importiert wird.
- Test: `test/unit/settingsCsvImport.test.js` extrahiert die JSX-freien Teile von `SettingsCsvComponent` per VM-Sandbox (wie in `adminComponents.test.js`) und simuliert das reale Framework-Zeitverhalten (verzögerter Callback via Promise/Timer), um den Datenverlust reproduzierbar zu machen.
- Verifiziert: 368 Unit-Tests, 1 Adaptertest, ESLint und Admin-Build erfolgreich.
- Nebeneffekt aus dem Debugging (kein Code-Bug, aber wichtig): Beim Live-Test im Browser wurde versehentlich ein Test-API-Key gespeichert und der echte Chat-API-Key von `system.adapter.ai-analytics.0` überschrieben. Nutzer wurde informiert, muss den echten Key manuell neu eintragen.
- PR #10 gegen `master` erstellt und gemergt; Release `0.0.1-beta.44` manuell auf GitHub veröffentlicht (ohne Tarball-Asset — GitHub-Actions-Release-Workflow ist deaktiviert, Release wird ab jetzt manuell per `gh release create` ohne `.tgz`-Anhang erstellt). DONE.
- Aktueller Stand: In Arbeit. CSV-Import korrigiert, geschützte API-Schlüssel werden nicht mehr als unbrauchbare verschlüsselte Werte exportiert/importiert. Geräte-Komponente nutzt Auswahl plus Sammelspeicherung; Kategorie, Raum, Verhalten, Update-Frequenz, Vollständigkeit und Ignorieren sind editierbar. Automatische Keller-Zuordnung für PV, Wärmepumpen, Heizungs- und Weichwasseranlagen erweitert. Markdown-Renderer und Tests ergänzt.
- Verifiziert: `npm test` mit 300 Unit-Tests und 1 Adaptertest, ESLint und `npm run build:admin` erfolgreich. Admin-Bundle neu gebaut.
- PR #1 gegen `master` erstellt und gemergt; Release `0.0.1-beta.36` veröffentlicht. GitHub-Actions-CI bleibt deaktiviert.
- Aktueller Stand: Katalogverwaltung aus der Einstellungsseite herausgelöst und als eigener Tab `Historisierte Datenpunkte` ergänzt.
- Verifiziert: 301 Unit-Tests, 1 Adaptertest, Lint und Admin-Build erfolgreich.
- PR #2 gegen `master` erstellt und gemergt; Release `0.0.1-beta.37` veröffentlicht.
- PR #3 gegen `master` erstellt und gemergt; Release `0.0.1-beta.38` veröffentlicht.
- PR #4 gegen `master` erstellt und gemergt; Release `0.0.1-beta.39` veröffentlicht.
- PR #5 gegen `master` erstellt und gemergt; Release `0.0.1-beta.40` veröffentlicht.
- Aktueller Stand: OpenCode Zen nutzt für die vier Chat-Modelle `/chat/completions` und für beide Muse-Modelle `/responses`; Wire-Format und Response-Mapping getestet.
- PR #7 gegen `master` erstellt und gemergt; Release `0.0.1-beta.42` veröffentlicht.
- Aktueller Stand: Antworten speichern nur Input-/Output-Tokens; Kosten werden live aus den aktuellen Chatpreisen berechnet. Chat und Onboarding bleiben getrennt. Token-Reset-Button und Admin-Befehl ergänzen.
- Verifiziert: 367 Unit-Tests, 1 Adaptertest, ESLint und Admin-Build erfolgreich.
- PR #9 gegen `master` erstellt und gemergt. Release `0.0.1-beta.43` wird direkt veröffentlicht.
- PR #6 gegen `master` erstellt und gemergt. Release `0.0.1-beta.41` wird direkt veröffentlicht.
- Erkenntnis für künftige Sessions: Bash-Tool-Aufrufe in diesem Environment sind für npm-/node_modules-lastige Befehle (Git-Bash/POSIX-Emulation auf OneDrive-Pfad) spürbar langsamer als natives PowerShell — bei Hängern zuerst mit dem PowerShell-Tool gegenprüfen, bevor man von einem echten Bug ausgeht. Nach mehreren Backgroundcommand-Läufen können verwaiste `node`/`vite`-Prozesse übrig bleiben (`ps aux`), die neue Läufe zusätzlich ausbremsen.
- Bekannter Nebeneffekt (aus vorherigem Task, bewusst nicht angefasst): `docs/adr/0016-git-branching-modell.md` und `docs/adr/0019-feature-branch-pro-task.md` verlinken `AGENTS.md` — die Links zeigen auf GitHub künftig ins Leere, da die Datei dort nicht mehr existiert. ADR-Historie wurde nicht nachträglich verändert.
- Offen/Rückfrage an Nutzer: `[E250]`/`[E999]`/`[W401]` aus dem Repository-Checker hängen daran, dass der Adapter nie `npm publish`t und nie beim offiziellen ioBroker-Repository eingereicht wurde — das war in ADR-0018 eine bewusste Entscheidung, die aber durch ADR-0027 (MIT-Kern) inzwischen technisch möglich wäre. Keine ADR hat bisher entschieden, das tatsächlich zu tun; nicht ungefragt umgesetzt.

## TODO

- Technische Entitlement-/Sponsor-Token-Spezifikation und Implementierungsplan erstellen.

## DONE

- Tagesbudget-Anzeige mit Tausendertrennzeichen, Chat/Onboarding-Aufteilung und live berechneten Kosten aus konfigurierten Preisen versehen; PR #11 gemergt, Release `0.0.1-beta.45` veröffentlicht.
- Settings-CSV-Import-Bug behoben (`this.onChangeAsync` statt `this.onChange` in `SettingsCsvComponent.handleFileSelected`), Regressionstest ergänzt; PR #10 gemergt, Release `0.0.1-beta.44` veröffentlicht.
- Admin-Einstellungen, CSV-Import, gebündelte Katalogbearbeitung und Markdown-Chatdarstellung verbessert; PR #1 gemergt.
- Historisierte Datenpunkte als eigener Tab in den Adapter-Einstellungen wiederhergestellt; PR #2 gemergt.

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
