# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Versionierung nach [SemVer](https://semver.org/).

## [0.0.1-beta.44] - 2026-09-04

### Behoben
- Settings-CSV-Import übernimmt jetzt zuverlässig alle importierten Werte; zuvor gingen bei vielen gleichzeitig geänderten Feldern fast alle Werte verloren und der Speichern-Button reagierte nicht.

## [0.0.1-beta.43] - 2026-09-04

### Hinzugefügt
- Tokenzähler und Usage-Historie können in den Einstellungen zurückgesetzt werden.
- Chat- und Onboarding-Kosten werden live aus Tokenzahlen und aktuell eingetragenen Preisen berechnet; Kostenwerte werden nicht gespeichert.

## [0.0.1-beta.42] - 2026-09-04

### Behoben
- OpenCode-Zen-Muse-Modelle verwenden jetzt die korrekte Responses API statt Chat Completions.

## [0.0.1-beta.41] - 2026-09-04

### Geändert
- Limits für KI-Schritte, Werkzeug-Aufrufe und Zeiträume sind auf der Settings-Seite konfigurierbar.
- Fehlermeldungen nennen jetzt benötigte Anzahl, aktuelles Limit und Differenz.

## [0.0.1-beta.40] - 2026-09-04

### Hinzugefügt
- OpenCode Zen als Anbieter mit automatischem Endpoint und sechs kostenlosen Modellvorschlägen ergänzt.
- Benutzerdefinierte Modellnamen bleiben als Freitext möglich.

## [0.0.1-beta.39] - 2026-09-04

### Sicherheit und Zuverlässigkeit
- Tiefes Code-Review mit Hardening für Provider, Agent-Werkzeuge, Admin-Ausgabe, CSV-Verarbeitung, Zustände, History-Zugriffe und parallele Operationen abgeschlossen.
- Produktionsabhängigkeiten ohne `npm audit`-Befund; verbleibende Audit-Hinweise betreffen ausschließlich Entwicklungs-Testwerkzeuge.

## [0.0.1-beta.38] - 2026-09-04

### Hinzugefügt
- Der Chat zeigt während der Datenzusammenstellung und Antwortgenerierung einen Status mit Prozentanzeige.

## [0.0.1-beta.37] - 2026-09-04

### Geändert
- Historisierte Datenpunkte wieder in einen eigenen Tab innerhalb der Adapter-Einstellungen verschoben.

## [0.0.1-beta.36] - 2026-09-04

### Behoben
- Einstellungsseite, Settings-CSV-Import und gebündelte Katalogbearbeitung verbessert.
- Markdown-Antworten der KI werden im Chat formatiert dargestellt.

## [0.0.1-beta.35] - 2026-09-04

### Geändert
- Node.js-Mindestversion von `>=18` auf `>=22` angehoben (aktuelle ioBroker-Empfehlung); CI- und Release-Workflow, README (EN/DE) und Architektur-Randbedingungen entsprechend aktualisiert.
- Alle Abhängigkeiten auf die neueste mit Node 22 kompatible Version angehoben: `@iobroker/gui-components`, `@types/react-dom`, `mocha` (11 → 12).
- ESLint von 8.x auf 10.x angehoben; dabei von der Legacy-`.eslintrc.cjs`-Konfiguration auf die verbindliche Flat-Config (`eslint.config.js`, neue Dependencies `@eslint/js` + `globals`) migriert. Ein dadurch aufgedeckter echter `no-useless-assignment`-Befund in `lib/license.js` behoben (totes `= false`-Initial in `evaluateLicense`).

### Bekannt/bewusst nicht geändert
- `chai` bleibt auf `^4.5.0` (bereits neueste 4.x-Version): `chai` 5/6 ist ESM-only und würde das `require('chai')` in allen bestehenden CommonJS-Testdateien brechen — außerhalb des Umfangs dieses Tasks.
- `@module-federation/vite@1.21.3` ließ `vite build --config src-admin/vite.config.mjs` beim Modul-Transform ohne Fehlermeldung hängenbleiben (reproduziert, live vom Nutzer bestätigt); auf `^1.21.2` zurückgesetzt (bereits vorher gepinnte Version), Build läuft wieder in ~25s durch.
- `npm audit` meldet 6 Schwachstellen, alle transitiv unterhalb von `@iobroker/testing@5.3.0` (bereits neueste Version) und nur in dessen intern gebündeltem Test-Tooling (mocha/diff/serialize-javascript/esbuild), nicht im Adapter-Laufzeitcode. Kein Fix von unserer Seite möglich, vorbestehend.

## [0.0.1-beta.34] - 2026-09-04

### Behoben
- `common.keywords` in `io-package.json` enthielt `ioBroker` und löste damit den Repository-Checker-Befund `W1068` aus (dieses Keyword ist dort explizit verboten, im Gegensatz zu `package.json`, wo es empfohlen ist); Keyword entfernt. Redundantes Duplikat `iobroker`/`ioBroker` in `package.json`-Keywords bereinigt.

## [0.0.1-beta.33] - 2026-09-03

### Behoben
- Finale Repository-Checker-Bereinigung: aktuelle `adapter-core`-Version, korrekte Secret-Feldplatzierung, vollständige Übersetzungen, `tier` und `ioBroker`-Keyword ergänzt.

## [0.0.1-beta.32] - 2026-09-03

### Behoben
- Verbleibende Repository-Checker-Befunde behoben: Repository-/Keywords-Metadaten, SPDX-/Lizenzmetadaten, News-Anzahl, Connection-/DataSource-Metadaten, Mindestversionen und Paketinhalt.

## [0.0.1-beta.31] - 2026-09-03

### Behoben
- Veröffentlichungs- und Paketkonsistenz verbessert: Lockfile synchronisiert, Admin-Global-Dependency ergänzt, JWS-Claims um Audience/Tokenversion erweitert und Entwicklungsdateien aus dem npm-Tarball ausgeschlossen.

## [0.0.1-beta.30] - 2026-09-03

### Dokumentation
- Veröffentlichungsanforderungen vorbereitet: vollständige englische README, deutsche README, Installations-/Konfigurations-/Datenschutzdokumentation, Changelog-Verweise und Adapter-Icon ergänzt. GitHub-Topics wurden gesetzt.

## [0.0.1-beta.29] - 2026-09-03

### Hinzugefügt
- Offline prüfbares Ed25519-JWS-Entitlement-Modul mit Beta-Guard, 35-Tage-Token, 30-Tage-Grace und täglichem Chat-Fallback vorbereitet. Das leere öffentliche Schlüsselregister hält die technische Sperre bis zur Anbindung der Ausstellungs-Webanwendung dormant.
- Geschütztes Tokenfeld und persistente Lizenzstatus-/Chat-Tages-States ergänzt.

## [0.0.1-beta.28] - 2026-09-03

### Dokumentation
- Entitlement-Architektur finalisiert: Beta-Ende bei `0.1.0`, Ed25519-signiertes JWS, separate Ausstellungs-Webanwendung, 35-Tage-Token, 30 Tage Sponsoring, 30 Tage Grace, keine Instanzbindung und eine Chat-Anfrage pro Tag nach Ablauf.

## [0.0.1-beta.27] - 2026-09-03

### Dokumentation
- Sponsoring-Entitlement-Regeln festgelegt: 35-Tage-Token, 30 Tage Sponsoring, 30 Tage Grace-Period, keine Instanzbindung, Offline-Prüfung und eine Chat-Anfrage pro Tag nach Ablauf. Beta-Ende, Tokenformat und Webanwendung bleiben offen.

## [0.0.1-beta.26] - 2026-09-03

### Geändert
- Lizenzmodell auf einen MIT-Kern mit separat dokumentierten sponsor-pflichtigen KI-Komponenten nach evcc-Vorbild umgestellt. Die technische Entitlement-Prüfung bleibt ein separater Folgetask.

## [0.0.1-beta.25] - 2026-09-03

### Behoben
- Die statistische Anomalievoranalyse schreibt jetzt pro geprüftem Gauge-Objekt Fortschritt und aktuelle Objekt-ID in den `catalogSync`-State; dadurch bleibt die manuelle Prüfungsanzeige auch während langer History-Läufe sichtbar in Bewegung.

## [0.0.1-beta.24] - 2026-09-03

### Behoben
- Admin-JSON-Konfiguration validiert wieder korrekt: dem Onboarding-Header fehlte das Pflichtfeld `size`.
- Die Fortschrittsanzeige der manuellen proaktiven Prüfung blieb bei `0%`, weil das Polling nach der schnellen Start-Antwort beendet wurde; sie läuft nun bis zum tatsächlichen Prüfungsende weiter.

## [0.0.1-beta.23] - 2026-09-03

### Hinzugefügt
- Hybride statistische Anomalievoranalyse für numerische Gauge-Zeitreihen: robuste Median/MAD-Abweichungen, Datenlücken-Kandidaten und ein LLM-Gate, das unauffällige Objekte ohne Modellaufruf überspringt.

## [0.0.1-beta.22] - 2026-09-03

### Dokumentation
- Globale, nach Nutzwert priorisierte Produkt-Roadmap mit Markt-/Bedarfsanalyse, Nutzerwünschen, offenen Produktlücken, Nicht-Zielen und empfohlenem nächsten Entwicklungsschritt ergänzt.

## [0.0.1-beta.21] - 2026-09-03

### Geändert
- Ein isolierter Fake-Adapter-Durchflusstest führt Discovery, echtes Onboarding und Katalog-State-Persistenz über `syncCatalog()` zusammen.
- Die Testdokumentation unterscheidet jetzt klar zwischen dem neuen isolierten Durchflusstest und einem noch offenen echten ioBroker-End-to-End-Test.

## [0.0.1-beta.20] - 2026-09-03

### Geändert
- Proxyquire-/Sinon-Tests decken zentrale `main.js`-Orchestratorpfade ab: Admin-Dispatcher, Erfolgs-/Fehlerantworten, State-Bridge-Verdrahtung, Unload und Datenqualitäts-Backfills.
- Die verbleibende Testlücke ist in der Architektur- und Risikodokumentation präzisiert: echter End-to-End-Test und DOM-Tests der Admin-UI stehen weiterhin aus.

## [0.0.1-beta.19] - 2026-09-03

### Hinzugefügt
- Katalogeinträge bekommen automatisch berechnete Datenqualitäts-Felder: Schreibbarkeit, Schreibmuster (kontinuierlich/ereignisgetrieben), Update-Frequenz und Datenvollständigkeit — mit schreibmuster-bewusster Lückenerkennung, damit on-change-Objekte nicht fälschlich als lückenhaft gelten.
- Geräte-Tab zeigt die neuen Felder als zusätzliche Spalten; optionaler Backfill für Bestandsobjekte.
- Chat-Agent benennt in seinen Antworten, wenn die zugrundeliegenden Daten lückenhaft oder veraltet sind.

## [0.0.1-beta.18] - 2026-09-03

### Hinzugefügt
- Chat-Agent: ausdrückliche Nutzererklärungen können mehrere Gerätezuordnungen dauerhaft in der Gerätetabelle aktualisieren.
- Onboarding: sichere Standardzuordnungen für PV/Wärmepumpe, Shelly, Homematic und UniFi-Anwesenheitserkennung.
- History-Health: Ausfälle werden nach drei Fehlern einmalig gemeldet und nach 12, 24 und 48 Stunden erneut versucht.
- CI mit Tests, ESLint, Admin-Build und Dependency-Audit.

### Behoben
- History-Instanzen mit wiederholtem Ausfall werden während der Wartezeit aus weiteren Prüfungen herausgehalten.

## [0.0.1-beta.17] - 2026-09-03

### Geändert
- Sponsor-Links in Einstellungen und Custom-Tab optisch vereinheitlicht und als GitHub Sponsors beschriftet.

## [0.0.1-beta.16] - 2026-09-03

### Behoben
- Settings-CSV-Import aktualisiert jetzt das komplette native Konfigurationsobjekt, damit die sichtbaren Felder korrekt gefüllt werden.

## [0.0.1-beta.15] - 2026-09-03

### Geändert
- Verbindlicher Entwicklungsablauf dokumentiert: eigener Feature-/Bugfix-Branch, live gepflegter WIP/TODO/DONE-Worklog, Tests, Push, Merge nach `master` und GitHub-Release.
- `WORKLOG.md` als Übergabepunkt für Abbrüche, Blocker und Wiederaufnahme ergänzt.

## [0.0.1-beta.14] - 2026-09-03

### Hinzugefügt
- Settings-CSV: Einstellungen können vollständig exportiert und wieder importiert werden.
- Geräte-Tab: Live-Fortschritt in Prozent für Geräteeinlesen, Nur-Updates-Synchronisierung und proaktive Prüfungen.

### Behoben
- Geräte-Tab: Die React-Konfigurationskomponente nutzt jetzt die Admin-State-Bridge und bleibt nicht mehr dauerhaft bei „Geräte werden geladen ...“ hängen.

## [0.0.1-beta.13] - 2026-09-03

### Hinzugefügt
- Geräte-Tab: CSV-Export des Katalogs und CSV-Import zum Bulk-Bearbeiten von Beschreibung/Kategorie/Raum/Auspraegung/Ignoriert-Status bestehender Eintraege.
- Geräte-Tab: Button "Nur Updates einlesen" — synchronisiert aktiv/inaktiv-Status und neue Objekte, ohne die (Token-kostende) KI-Klassifizierung neuer Objekte auszuloesen.
- Einstellungen- und Geräte-Tab: kompakte Kopfzeile mit Live-Budgetanzeige und Sponsor-Link statt vollbreitem Button.

### Geändert
- Einstellungen-Seite: Modell-Feld (Chat und Onboarding) ist jetzt ein einfaches Textfeld statt einer dynamischen Modell-Autocomplete, die einen bereits gesetzten Wert teils nicht anzeigte. Felder haben jetzt responsive Breiten statt 100% Seitenbreite, die OpenRouter-/OpenCode-Zen-Links sind kompakter und stehen oben in der Chat-Modell-Gruppe, Feldreihenfolge je Provider-Gruppe ist jetzt Provider → URL → Modell → API-Key → Preise.

## [0.0.1-beta.12] - 2026-09-03

### Hinzugefügt
- Live-Budgetanzeige oberhalb des Chats (mit aufklappbaren Details) statt eigenem Budget-Tab; Budget zusätzlich live auf der Einstellungen-Seite sichtbar (`usage.todaySummary`).

### Behoben
- Geräte-Tab in den Adapter-Einstellungen lud nicht (Modul-Federation-Komponente ohne Default-Export).
- Einstellungen-Seite in logische Gruppen (Chat-Modell / Onboarding / Betrieb & Budget) unterteilt.
- Budget-Verbrauchsdiagramm zeigte bei wenigen Tagen Historie nur eine einfarbige Fläche statt eines Balkendiagramms.

## [0.0.1-beta.11] - 2026-09-02

### Hinzugefügt
- Live-Fortschrittsanzeige im Geräte-Tab für Re-Scan und Backfill, inklusive laufender Aktualisierung der Geräteliste.

### Behoben
- InfluxDB-History-Samples für die `valueKind`-Klassifizierung vermeiden jetzt Rohdaten-Typkonflikte (`bool != float`) durch bucketed Sampling.

## [0.0.1-beta.10] - 2026-09-02

### Hinzugefügt
- `valueKind`-Klassifizierung aus Metadaten und History-Datenprobe, sichtbar und manuell korrigierbar im Geräte-Tab.
- Typbewusste Werkzeuge `getPeriodTotal` und `comparePeriods`, die für Zähler, Schalter und Momentanwerte die passende Aggregation verwenden.
- Optionaler Backfill für bestehende Katalogeinträge.
- Dynamische Modellvorschläge in der Admin-Konfiguration; OpenRouter zeigt automatisch nur aktuell kostenlose Modelle mit Tool-Calling, andere Provider und lokale Endpunkte ihre gemeldeten Modelle. Manuelle Modell-IDs bleiben möglich.
- Direkte Einstiegslinks zu OpenRouter und OpenCode Zen sowie GitHub-Sponsors-Links in Konfiguration und Custom-Tab.
- `.github/FUNDING.yml` und npm-`funding`-Metadaten für den GitHub-Sponsor-Button.
- Geräteübersicht als dynamische Custom-Komponente in den Adapter-Einstellungen; der separate Custom-Tab ist dadurch auf Chat und Budget reduziert.

### Behoben
- OpenRouter verwendete ohne manuell gesetzte Basis-URL fälschlich den OpenAI-Endpunkt; Standard ist jetzt `https://openrouter.ai/api/v1`.

## [0.0.1-beta.9] - 2026-08-24

### Behoben
- `getHistory` konnte bei rohen Aggregaten (`aggregate:'none'`/`'onchange'`) Daten lautlos abschneiden: die ioBroker-History-API begrenzt Ergebnisse ohne explizites `count` standardmäßig auf 2000 Werte — bei sekündlich loggenden Objekten fehlten so über 96% eines Tages, ohne jede Fehlermeldung. `getHistory` übergibt jetzt immer ein explizites `count` (bei gebündelten Aggregaten wie `average`/`minmax` aus dem angefragten Zeitraum berechnet — stündliche/tägliche/wöchentliche Buckets, gedeckelt auf 500 — bei rohen Aggregaten der bisherige Default 2000) und loggt eine Warnung, wenn ein rohes Ergebnis das Limit erreicht (möglicher Datenverlust).

## [0.0.1-beta.8] - 2026-08-24

### Hinzugefügt
- Onboarding-Klassifikations-Batches werden jetzt nach Adaptertyp gruppiert (nie zwei Adaptertypen in einem Batch), damit die KI pro Anfrage konsistenten Kontext hat, welchem Adapter die Objekte entstammen (`lib/onboarding.js`, neue Funktionen `buildBatches`/`adapterTypeOf`).
- `getHistory` loggt vor jedem Abruf silly die exakte Anfrage an die History-Adapter-Instanz (Ziel-Instanz, sourceId, Zeitraum als ISO+ms, Aggregation), damit sich die tatsächlich ausgeführte Abfrage nachvollziehen lässt (`lib/dataAccess.js`).
- Saubere Beschreibungen statt roher Datenpunkt-IDs im Chat: die KI wird beim Onboarding angewiesen, Beschreibungen auf Deutsch in Alltagssprache zu formulieren; `getHistory`/`compareTimeframes` liefern `description`/`room`/`unit` aus dem Katalogeintrag mit ans Modell zurück; die Systemprompts weisen das Modell an, in der Antwort die Beschreibung statt der rohen sourceId zu verwenden.
- `description` ist jetzt im Geräte-Tab editierbar, analog zu Kategorie und Raum.

### Behoben
- Geräte-Tab (Liste/Bearbeiten/Entfernen) reagierte nicht (`[Fehler] Keine Antwort auf 'listCatalogEntries' nach 12000 ms`): `callAdapter()` im Admin-Tab fiel bei einem sendTo-Timeout nur für die "langsamen" Befehle (Chat, Re-Scan, Prüfung) auf die State-Bridge zurück, nicht aber für Geräteliste/-Bearbeitung/-Entfernen — obwohl sendTo aus dem Legacy-Tab-Kontext bereits als nicht zuverlässig dokumentiert war. Fällt jetzt für alle Befehle automatisch auf die Bridge zurück.

## [0.0.1-beta.7] - 2026-08-24

### Hinzugefügt
- Chat-Agent kennt jetzt Standort (aus `system.config`) und lokale Zeitzone des ioBroker-Hosts (neues Modul `lib/promptContext.js`) — vorher enthielt der Systemprompt nur die UTC-Zeit ohne jeden Zeitzonen- oder Standortbezug, der Agent musste raten oder aus dem Gesprächsverlauf schließen.

### Behoben
- Admin-Chat-Tab: Antworten (und die eigene gesendete Frage) erschienen erst nach einem Tab-Wechsel, nicht direkt nach dem Senden — live reproduziert und zwei Ursachen im State-Bridge-Pfad gefunden: (1) das Antwort-Polling in `admin/tab.js` konnte die eigene, gerade erst geschriebene Anfrage nicht von der echten Antwort unterscheiden (beide teilen dieselbe `id`) und wertete sie fast immer fälschlich als Fehler; (2) `chatQuestion` liefert die Chat-History bei Erfolg direkt als Array, die UI prüfte aber auf ein `{history:[...]}`-Objekt und verwarf die Antwort stillschweigend. Betraf denselben Bridge-Pfad wie „Geräte neu einlesen“/„Prüfung jetzt ausführen“.
- Lizenz-Dialog im Admin beim Anlegen einer Instanz zeigte die Admin-HTML-Seite statt des Lizenztexts: Für Adapter ohne `extIcon`/`readme` bleibt die Lizenz-URL leer (`fetch('')` lädt die aktuelle Seite), und ein GitHub-Fallback scheitert am privaten Repo. Neu: Kopie der Lizenz in `admin/LICENSE` (wird mit dem Adapter-Upload ausgeliefert) plus `common.licenseInformation` mit Link `/adapter/ai-analytics/LICENSE` — der Dialog zeigt jetzt den echten Lizenztext.
- `LICENSE`-Datei war laut [ADR-0018](docs/adr/0018-lizenzmodell-beta-frei-danach-sponsoring.md) entschieden und lag lokal im Repo-Root, wurde aber nie committet — Folge: der Lizenz-Dialog des Admin beim Installieren aus Fremdquellen fand keinen Lizenztext auf GitHub (404) und zeigte HTML-Müll statt der Vereinbarung. Datei ist jetzt Teil des Repos.

## [0.0.1-beta.6] - 2026-08-24

### Hinzugefügt
- Neues ADR-0023 dokumentiert den State-Bridge-Ausweichkanal für Admin-Tab-Befehle, siehe [ADR-0023](docs/adr/0023-state-bridge-ausweichkanal-admin-tab.md).

### Behoben
- Admin-Tab: Befehle aus dem Tab (Chat-Frage, Geräteliste, Re-Scan, Prüfung, Katalog-Änderungen) erreichen den Adapter jetzt auch dann, wenn `sendTo` aus dem Legacy-Tab-Kontext nicht ankommt (React-Admin v7 stellt Legacy-HTML-Tabs keinen privilegierten Socket bereit; Lesezugriffe funktionieren dort nachweislich). Neu: State-Bridge über den State `ai-analytics.<instanz>.admin.bridge` (`lib/adminBridge.js`) — schnelle Befehle laufen weiterhin zuerst per `sendTo` mit Timeout und weichen automatisch aus; langlaufende Befehle (Chat, Re-Scan, Prüfung) gehen direkt per Bridge, um Doppel-Ausführung zu vermeiden.
- Admin-Tab: still hängende UI-Zustände beseitigt — ein ausbleibender Callback ließ die Senden-Schaltfläche dauerhaft deaktiviert und die Geräteliste stumm leer. Jetzt führt jeder Transport-/Verarbeitungsfehler sichtbar zur Fehleranzeige (Chat-Fehlerbubble bzw. Statuszeile im Geräte-Tab), und die Senden-Schaltfläche wird in jedem Fall wieder freigegeben.
- Admin-Tab: `chat.history` mit ungültigem JSON-Inhalt wirft keinen Laufzeitfehler mehr beim Öffnen des Tabs.

## [0.0.1-beta.5] - 2026-08-23

### Hinzugefügt
- Token-Kosten-Tab: Erweiterung des bestehenden Budget-Bereichs um eine Verbrauchs-Historie (Balkendiagramm, wählbar 30 Tage/gesamt), berechnete Kosten getrennt nach Chat/Prüfung und Onboarding, sowie eine heuristische Tages-/Stunden-Limit-Empfehlung.
- Vier neue, manuell gepflegte Preis-Felder (Preis pro 1 Mio. Input-/Output-Tokens, je Chat und Onboarding).
- Neuer State `usage.history` (unbegrenzte, tägliche, nach Zweck getrennte Verbrauchs-Historie).
- Neues ADR-0022 dokumentiert die Preis-/Historie-Entscheidung, siehe [ADR-0022](docs/adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md).

### Behoben
- Onboarding-Token-Verbrauch wurde bisher nirgends erfasst (weder im Tagesbudget noch in irgendeiner Anzeige) — `runOnboarding` ruft jetzt korrekt `recordUsage` auf.

## [0.0.1-beta.4] - 2026-08-22

### Hinzugefügt
- Onboarding kann jetzt einen eigenen, vom Chat/Prüfungs-Provider unabhängigen LLM-Provider nutzen (neue optionale Admin-Config-Felder `onboardingProviderType`/`onboardingApiKey`/`onboardingModel`/`onboardingBaseUrl`) — leer gelassen, verhält sich der Adapter wie bisher (ein gemeinsamer Provider).
- Start-Selbstprüfung: beim Adapter-Start wird die Erreichbarkeit beider konfigurierten Provider per minimalem Test-Call geprüft (`lib/providerHealthCheck.js`), Ergebnis als States `info.chatProviderReachable`/`info.onboardingProviderReachable` sichtbar. Ein fehlgeschlagener Check blockiert nur die betroffene Funktion (Onboarding-Klassifikation bzw. Chat/proaktive Prüfung), nicht den gesamten Adapter.
- Neues ADR-0021 dokumentiert die Zwei-Provider-Architektur, siehe [ADR-0021](docs/adr/0021-getrennte-provider-pro-zweck.md).

### Geändert
- Der bisherige grobe `if (!apiKey) return;`-Start-Guard in `onReady` ist entfallen, ersetzt durch die granulare, tatsächlich testende Selbstprüfung oben.

## [0.0.1-beta.3] - 2026-08-22

### Hinzugefügt
- Geräte-Tab im Admin-UI (Sub-Navigation neben Chat und Budget, ein Tab "AI Analytics" — `io-package.json` erlaubt nur einen `adminTab` pro Adapter): editierbare Tabelle aller katalogisierten Objekte (Kategorie, Raum), Ignorieren/Aktivieren, Entfernen, Text-Filter/Suche.
- Manuelle Trigger: "Geräte neu einlesen" (Re-Discovery) und "Prüfung jetzt ausführen" (proaktive Prüfung), ohne auf das konfigurierte Intervall warten zu müssen.
- Token-Budget-Anzeige (heutiger Verbrauch vs. konfiguriertes Tageslimit), berücksichtigt korrekt einen Tageswechsel (zeigt sonst fälschlich den Vortageswert).
- Neues Modul `lib/adminCommands.js`: Admin-Message-Bus mit vollem Katalog-Schreibzugriff, bewusst getrennte Vertrauensgrenze vom needsReview-beschränkten LLM-Tool (siehe [ADR-0020](docs/adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md)).
- Neue Katalog-Eigenschaft `ignored`; ignorierte Objekte werden von Chat-Analysen und der proaktiven Prüfung ausgeschlossen (auch aus dem `needsReviewOnly`-Pfad), bleiben aber sichtbar/reaktivierbar.
- Raum wird beim Onboarding, wenn möglich, deterministisch aus `enum.rooms.*` übernommen statt nur vom LLM geraten.
- Löst die bekannten Lücken "Onboarding-Rückfragen nicht auflösbar" und "kein manueller Re-Discovery-Trigger" (siehe [11-risiken-und-schulden.md](docs/architecture/11-risiken-und-schulden.md)).

### Behoben
- Fehlende Fehlerbehandlung im neuen Admin-Message-Bus (main.js): ein Fehler hätte die UI dauerhaft hängen lassen und war ein Absturzrisiko (unhandled rejection) — gefunden im abschließenden Whole-Branch-Review.

### Diagnostiziert, nicht abschließend bestätigt
- Admin-Tab-Verbindungsproblem: Live-Diagnose an einer echten Instanz (2026-08-22) hat den Root Cause identifiziert (fehlende `adminUI.tab: "html"`-Deklaration in `io-package.json`) und einen Fix angewendet — die endgültige Bestätigung erfordert einen Redeploy auf eine erreichbare Instanz, siehe [11-risiken-und-schulden.md](docs/architecture/11-risiken-und-schulden.md).

## [0.0.1-beta.2] - 2026-08-22

### Hinzugefügt
- Admin-Chat-Tab: defensive Verbindungs-Fallback-Kette (ersetzt die nicht-existente `adapterNamespace`-Abhängigkeit) + Chat-Bubble-UI mit Zeitstempeln und Lade-Indikator.
- Neues, eng begrenztes Schreib-Werkzeug `updateCatalogEntry` — der Chat-Agent kann Onboarding-Rückfragen (`needsReview`-Objekte) jetzt direkt im Chat auflösen (siehe [ADR-0017](docs/adr/0017-scoped-catalog-write-capability.md)).
- Konversationsgedächtnis: Chat-Fragen laufen jetzt mit den letzten 10 Nachrichten aus der Historie im Kontext.
- Tägliches Token-Budget (`dailyTokenBudget`, Default 0 = kein Limit) für Chat und proaktive Prüfung.
- `silly`-Level-Logging für Discovery, Onboarding, Agent-Aufrufe (Senden/Empfangen) und Chat-/Prüf-Läufe.

### Geändert
- Dev-Dependencies aktualisiert: mocha 10 → 11, sinon 17 → 22, `@iobroker/testing` 4 → 5. `chai` bewusst auf 4.x belassen (5/6 ist ESM-only, würde `require('chai')` brechen).

## [0.0.1-beta.1] - 2026-08-21

Reine Dokumentations-/Prozess-Version, kein funktionaler Code-Unterschied zu 0.0.1-beta.

### Geändert
- Architekturdokumentation von einer einzelnen `arc42.md` in 12 einzelne, Obsidian-verlinkte Kapiteldateien unter `docs/architecture/` aufgeteilt (arc42-Multi-Page-Konvention).
- Architekturentscheidungen aus arc42 §9 in 16 einzelne ADR-Dateien unter `docs/adr/` extrahiert (Nygard-Format), inkl. Übersichtstabelle.
- `docs/superpowers/{specs,plans}/` zu `docs/specs/`, `docs/plans/` umbenannt (der `superpowers`-Anteil war nur ein Tooling-Artefakt).
- Neue Map-of-Content-Einstiegspunkte: [docs/README.md](docs/README.md), [arc42-index.md](docs/architecture/arc42-index.md), [adr-index.md](docs/adr/adr-index.md).

### Hinzugefügt
- [CONTRIBUTING.md](CONTRIBUTING.md) mit dem dokumentierten Entwicklungsprozess (Branching-Modell, wann Spec/Plan/ADR nötig sind).
- [Backlog offener Architekturentscheidungen](docs/adr/backlog.md) — 16 noch nicht entschiedene, architekturrelevante Fragen, u. a. wie der defekte Admin-Chat-Tab behoben wird.
- Ergebnisse des laufenden manuellen Abnahmetests dokumentiert: Installation/Start/Discovery/Katalog bestätigt funktionierend, Admin-Chat-Tab bestätigt defekt.

## [0.0.1-beta] - 2026-08-21

Erste Beta-Version. Alle 13 Implementierungs-Tasks abgeschlossen, einzeln reviewt, plus finales Whole-Branch-Review mit Fix-Welle (Zeitanker in LLM-Prompts, API-Key-Verschlüsselung, Katalog-Reaktivierung, u.a.). 43/43 automatisierte Tests grün.

### Hinzugefügt
- Chat-Q&A: Fragen zu historischen Verbrauchs-/Nutzungsdaten über einen Tool-Calling-LLM-Agenten.
- Proaktive Prüfungen: periodischer, KI-getriebener Hintergrundlauf auf Auffälligkeiten (Gerätenutzung, Beleuchtung, Verbrauch, PV-Einspeisung).
- Discovery + Katalog: automatisches Erkennen und semantisches Klassifizieren aller Objekte mit aktivem InfluxDB-/History-/SQL-Logging, inkl. Rückfrage im Chat bei Unsicherheit.
- Provider-Abstraktion: Anthropic, OpenAI, OpenRouter, lokale OpenAI-kompatible Server (z. B. LM Studio) — austauschbar über die Admin-Konfiguration.
- Admin-Konfigurationsformular und Admin-Chat-Tab.

### Bekannte Lücken (siehe [arc42 §11](docs/architecture/11-risiken-und-schulden.md) und [Backlog offener Architekturentscheidungen](docs/adr/backlog.md) für Details)
- **Admin-Chat-Tab bestätigt nicht funktionsfähig** (Abnahmetest 2026-08-21): Tab rendert, Nachrichten können nicht abgeschickt werden. Diagnose läuft.
- `main.js` und die Admin-UI haben keine automatisierte Integrationstestabdeckung.
- Onboarding-Rückfragen im Chat sind aktuell nicht beantwortbar (kein Schreibzugriff des Chat-Agenten auf den Katalog).
- Keine Konversationshistorie über mehrere Chat-Fragen hinweg.
- Keine Auswahl der History-Adapterinstanz(en) und kein manueller Re-Discovery-Trigger in der Konfiguration.
- Kein Kosten-/Token-Budget für LLM-Aufrufe.
- Keine CI/Linting/Dependency-Scanning (geplant für einen Folge-Plan).

Vor produktivem Einsatz: manueller Abnahmetest an einer echten ioBroker-Instanz erforderlich.
