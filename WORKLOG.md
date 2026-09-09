# Arbeitsstand

Kurzer Übergabestand für die nächste Sitzung. Abgeschlossene Historie steht in
`CHANGELOG.md` und Git, dauerhafte Risiken in
`docs/architecture/11-risiken-und-schulden.md`.

## WIP

- Branch: `master`.
- Status: Discovery-Bridge-Timeout-Fix als beta.53 veröffentlicht; die
  konfigurierbaren LLM-Token-Limits sind als beta.54 veröffentlicht; der
  JSON-Schema-Fix ist als beta.55 veröffentlicht; Gauge-PV-Unterstützung ist
  als beta.56 veröffentlicht; Gerätefilter und Rollenlegende sind als beta.57
  veröffentlicht; Statusaktionen sind als beta.58 veröffentlicht; Foundry-
  Responses-Unterstützung ist als beta.59 veröffentlicht; Output-Limit-
  Erweiterung ist als beta.60 veröffentlicht; Foundry-Toolcall-Fix ist als
  beta.61 veröffentlicht; `resetUsage` ist als beta.62 korrigiert; die erste
  Whole-Review-Fixwelle ist als beta.63 veröffentlicht; die zweite Welle ist
  als beta.64 veröffentlicht; Findings 1 bis 13 sind als beta.65 behoben;
  Resthärtung 1 bis 6 ist als beta.66 veröffentlicht; Deep-Review-Fixes sind
  für beta.67 vorbereitet.

## TODO

- Nächste Produktaufgabe: Geräteliste-UI auf einer echten ioBroker-Installation
  zusätzlich manuell abnehmen (Sortierung, Detail-Panel, Bulk-Toolbar).
- Review-Fixwelle nach dem Claude-Session-Limit abgeschlossen: Bulk-Status wird
  im Parent angezeigt, Einzel-Erfolge erscheinen ca. 3 Sekunden inline,
  Gruppen-IDs werden im Picker auf Länge/Steuerzeichen validiert, ungültige
  Bulk-Platzhalter bleiben deaktiviert und die Architektur-Dokumentation nennt
  die echten `src-admin/src/`-Pfade.
- Namens-/Herstellerheuristiken aus Onboarding und Value-Kind-Klassifikation
  entfernt; verbindliche Regel in `docs/architecture/11-risiken-und-schulden.md`.
- Alle drei Sub-Projekte der Korrelations-Zerlegung (A, B, C) haben jetzt
  eine erste Ausbaustufe. Spätere Ausbaustufen (bewusst zurückgestellt):
  Wirkungsgrad (A), Temperatur-Stagnations-Regel (C), bidirektionaler
  Netzzähler-Support (B).

## DONE

- Findings 1 bis 13 für beta.65 vorbereitet: History-/Counter-Auswertung,
  Provider-Modelllisten, HVAC-Grenzen, Katalog-/Bridge-Rennen, CSV-Atomicity,
  Leerwerte und Formularaktionen korrigiert; 481 Unit- und 60 Admin-Tests,
  E2E, Lint, Admin-Build und Paketbau erfolgreich.

- Zweite Review-Fixwelle für beta.64 vorbereitet: lokale Tagesgrenzen,
  deterministische Discovery, Gauge-Vergleiche, strikte Onboarding-Antworten,
  Katalog-Synchronisierung und Bulk-Fehlerdetails korrigiert; Tests, E2E,
  Lint, Admin-Build und Paketbau erfolgreich.

- Whole-Review-Fixwelle für beta.63 vorbereitet: 481 Unit- und 60 Admin-Tests,
  Lint und Admin-Build grün; korrigiert wurden History-/Zähler-/Boolean-
  Semantik, Provider-/Onboarding-Grenzen, Bridge-/Lifecycle-Robustheit,
  Bulk-/CSV-Verhalten und Accessibility-Grundlagen; E2E und Paketbau
  erfolgreich.

- `resetUsage` für beta.62 im zentralen Admin-Dispatcher verdrahtet und mit
  Routing-/Usage-Tests abgesichert; E2E und Paketbau erfolgreich.

- Foundry-Toolcall-Fix für beta.61 vorbereitet: Assistant-Text und
  Function-Calls werden gemeinsam in Responses-History serialisiert; 478 Unit-
  und 60 Admin-Tests, E2E und Lint grün.

- Output-Token-Limit für beta.60 vorbereitet: Chat und Onboarding erlauben bis
  zu `128000`; Tests, E2E, Lint, Admin-Build und Paketbau erfolgreich.

- Microsoft-Foundry-Unterstützung für beta.59 vorbereitet: Azure-Foundry-
  Basen werden auf `/openai/v1` normalisiert und über die Responses API
  angesprochen; 476 Unit- und 60 Admin-Tests, E2E, Lint, Admin-Build und
  Paketbau erfolgreich.

- Statusaktionen für beta.58 vorbereitet: `needsReview` kann pro Zeile und
  über die Mehrfachauswahl gesetzt oder erledigt werden; Backend, Tests, Lint
  und Admin-Build grün; E2E und Paketbau erfolgreich.

- Gerätefilter und Energierollen-Legende für beta.57 vorbereitet: ignorierte
  Einträge sind standardmäßig verborgen, der Schalter wird je Instanz
  gespeichert; 474 Unit- und 59 Admin-Tests, E2E, Lint, Admin-Build und
  Paketbau waren erfolgreich.

- Gauge-PV-Unterstützung für beta.56 vorbereitet: `pv_generation` akzeptiert
  Gauge-Werte für Leistungsstatistiken; Energiebilanz und Eigenverbrauch
  ignorieren diese Werte als Nicht-Zähler; Tests, E2E, Lint, Build und Paketbau
  waren erfolgreich.

- Admin-JSON-Schema-Fix für beta.55 vorbereitet: nicht unterstützte
  `urlField`-Attribute entfernt, OpenCode-Zen-Autofill in der Komponente
  erhalten; Tests, Lint, E2E, Build und Paketbau grün.

- LLM-Token-Limits für beta.54 integriert: vier neue Admin-Felder für Chat und
  Onboarding sowie Eingabe-/Ausgabe-Begrenzung in der Laufzeit; Tests, E2E,
  Build und Paketbau waren erfolgreich.

- Release `0.0.1-beta.53` (2026-09-08): Discovery-Befehle der Admin-Geräteliste
  erhalten bis zu 10 Minuten für die State-Bridge-Antwort; `npm test`, Lint,
  Admin-Build, echter E2E-Test und Paketbau waren erfolgreich.

- LLM-Token-Limits (2026-09-08): neues fokussiertes Modul `lib/tokenLimits.js`
  (`getTokenLimits`, `estimateTokens`/`estimateRequestTokens`, zeichenbasierte
  Heuristik ohne Tokenizer-Abhaengigkeit) loest zwei Luecken: OpenAI-kompatible
  Provider sendeten bisher gar kein Ausgabe-Limit, Anthropic nutzte einen
  unsichtbaren, nicht einstellbaren Fallback (2048). Vier neue Einstellungen
  (`chatMaxInputTokens`/`chatMaxOutputTokens`/`onboardingMaxInputTokens`/
  `onboardingMaxOutputTokens`) je Chat-/Onboarding-Modell. `runAgent`
  (`lib/agent.js`) schaetzt vor jeder Anfrage die Eingabegroesse; bei
  Ueberschreitung mit mindestens zwei abgeschlossenen Chat-Runden in der
  Historie wird genau ein Kompressionsversuch unternommen (aelteste Haelfte
  der Runden wird zusammengefasst und der verbleibenden ersten Nutzer-Nachricht
  vorangestellt — nie als eigene Nachricht, um die user/assistant-Alternierung
  nicht zu brechen); reicht das nicht oder gibt es keine kompaktierbare
  Historie, ein klar definierter Fehler statt der kryptischen Provider-Meldung.
  Bewusst keine Kompression der laufenden Werkzeug-Aufruf-Sequenz einer
  einzelnen Frage (Risiko fuer `tool_use`/`tool_result`-Paarung). Onboarding
  bekommt denselben Eingabe-Check ohne Kompression (kein Gespraechsverlauf
  zum Zusammenfassen) — ueberschreitet ein Batch das Limit, wird er wie jeder
  andere Batch-Fehler geloggt und uebersprungen. Siehe
  [Spec](docs/specs/2026-09-08-llm-token-limits.md).
- Energiebilanz-Rollen gegen `valueKind` abgesichert und um Spitzenlast-Rollen
  erweitert (2026-09-07): `derivedMetricRole` fuer die sechs Bilanz-Rollen
  verlangt jetzt `daily_reset_counter`/`cumulative_total` (verhindert stilles
  `NaN` im Residuum bei versehentlicher Zuweisung an einen `gauge`-Datenpunkt);
  zwei neue Rollen `grid_power`/`battery_power` (nur `gauge`) plus
  `derivedMetricInverted` fuer Spitzenlast-Auswertung ueber die bestehenden
  `getPeriodTotal`/`compareTimeframes`-Werkzeuge, ausserhalb der
  Bilanz-Pflichtrollen. KI-Onboarding schlaegt jetzt zusaetzlich zu `category`
  auch `derivedMetricRole`/`hvacRole` vor (Batching jetzt pro
  Adapter-**Instanz** statt Adapter-Typ), mit Vorpruefung gegen die neue Regel
  (inkompatible/doppelte Vorschlaege werden verworfen statt den ganzen
  Katalogeintrag abzulehnen) und erzwungenem `needsReview` bei jedem
  Rollenvorschlag. Bewusst NICHT gebaut: eine Leistungs-Integration fuer
  Tagesenergie aus einem signierten Momentanleistungswert (Genauigkeitsrisiko
  bei lueckenhaftem Logging), siehe
  `docs/architecture/11-risiken-und-schulden.md`. Siehe
  [Spec](docs/specs/2026-09-07-energiebilanz-signierte-datenpunkte.md).
- Merge und Release `0.0.1-beta.50` (2026-09-06): `master` enthält das
  Geräteliste-Redesign; E2E-Test gegen echten js-controller und Paketbau waren
  erfolgreich. GitHub-Tag und Release folgen nach dem Push.
- Merge und Release `0.0.1-beta.51` (2026-09-06): neue Katalogeinträge werden
  ohne KI-Provider als `needsReview` angelegt; lokalisierte Metadaten sind
  robust; alle Tabellenfelder sind ein-/ausblendbar und direkt bearbeitbar.

- Geräteliste im Admin-UI neu strukturiert (2026-09-05): Sofort-Speichern für
  jedes Einzelfeld statt Entwurf+Auswahl-Modell, aufklappbares Detail-Panel für
  `derivedMetricRole`/`derivedMetricGroupId`/`hvacRole` inkl. Zurücksetzen auf
  "keine" (neuer Lösch-Sentinel im Backend), klickbare Spaltensortierung
  (aufsteigend/absteigend/zurückgesetzt), Bulk-Edit-Toolbar für
  Mehrfachauswahl (Kategorie, Analyse-Rollen, Ignorieren/Aktivieren/Löschen).
  Struktur: `CatalogDevicesComponent` + Subkomponenten (`DeviceRow`,
  `BulkEditToolbar`, `GroupIdPicker`) in `src-admin/src/CatalogDevices/`,
  CSV-Helfer in `src-admin/src/csvHelpers.js`. Siehe
  [Spec](docs/specs/2026-09-05-geraeteliste-redesign.md) und
  [Plan](docs/plans/2026-09-05-geraeteliste-redesign.md).
- Energie-Korrelation (Sub-Projekt B, erste Ausbaustufe): `derivedMetricRole`
  um vier Rollen erweitert (`grid_import`, `battery_charge`,
  `battery_discharge`, `consumption`) — dieselbe Energie-Gruppe wie
  `getSelfConsumption` (Sub-A), keine neue Gruppierungs-Infrastruktur. Neues
  fokussiertes Modul `lib/energyBalance.js` berechnet die Energiebilanz-
  Residuen der letzten 8 Kalendertage und nutzt `detectDailyAggregateAnomaly`
  aus Phase 2 der Anomalieerkennung wieder (keine neue Schwelle). Pflicht-
  rollen `pv_generation`/`grid_import`/`grid_feed_in`/`consumption`,
  Batterie-Rollen optional (fehlend = 0). Bewusst keine Onboarding-
  Heuristik für die vier neuen Rollen (zu hohe Fehlerquote bei
  herstellerspezifischen Namenskonventionen) — nur manuelle Zuweisung im
  Geräte-Tab.
- HVAC-Korrelation (Sub-Projekt C, erste Ausbaustufe): neues Katalogfeld
  `hvacRole` (`window`/`heating`, nur für `boolean_state`, validiert in
  `catalog.js`/`adminCommands.js`); neues fokussiertes Modul
  `lib/hvacCorrelation.js` (Zustands-Overlap-Regel statt Baseline-Vergleich,
  eigenständig von `anomalyDetector.js`) erkennt pro eindeutigem
  Fenster/Heizung-Raumpaar eine Überlappung >= 15 Minuten am letzten
  vollständigen Kalendertag; in `main.js` in die bestehende
  `anomalyCandidates`-Liste eingespeist (`totalFailedCount` statt
  Hidden-Array-Property, da mehrere Kandidatenlisten zusammengeführt
  werden); rein namensbasierte Onboarding-Heuristik (`suggestHvacRoles`);
  Admin-UI-CSV-Spalte ergänzt.
- Abgeleitete Kennzahlen (Sub-Projekt A): neue Katalogfelder
  `derivedMetricRole`/`derivedMetricGroupId` (validiert in `catalog.js` und
  `adminCommands.js`); neues LLM-Werkzeug `getSelfConsumption` in
  `tools.js`; rein namensbasierte Onboarding-Heuristik
  (`suggestSelfConsumptionPair`) schlägt ein PV-Erzeugung/Netzeinspeisung-
  Paar vor, wenn eindeutig; Admin-UI-CSV-Spalten ergänzt.
- Hybride Anomalieerkennung Phase 2 sowie CI-Aufräumung und Teststrategie
  (main.js + Admin-UI, echter ioBroker-E2E-Test) sind auf `master` gemergt
  und gepusht. Details: `docs/adr/backlog.md` Punkte 3 und 5,
  `docs/specs/2026-09-04-*`.

Ältere abgeschlossene Historie (Dokumentationskonsolidierung, Lizenzaudit,
Releases beta.47/beta.48) steht in `CHANGELOG.md` und Git.
