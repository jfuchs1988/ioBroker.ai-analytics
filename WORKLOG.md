# Arbeitsstand

Kurzer Übergabestand für die nächste Sitzung. Abgeschlossene Historie steht in
`CHANGELOG.md` und Git, dauerhafte Risiken in
`docs/architecture/11-risiken-und-schulden.md`.

## WIP

- Branch: `feature/abgeleitete-kennzahlen-eigenverbrauch`
- Ziel: Sub-Projekt A der Korrelations-/Kennzahlen-Zerlegung (Laufzeit +
  Eigenverbrauch), siehe
  Spec `docs/specs/2026-09-04-abgeleitete-kennzahlen-laufzeit-eigenverbrauch.md`,
  Plan `docs/plans/2026-09-04-abgeleitete-kennzahlen-laufzeit-eigenverbrauch.md`.
- Stand: Code + Tests + Doku fertig. `npm test` (398 Unit- + 8 Admin-Tests),
  `npm run lint`, `npm run build:admin` grün. Laufzeit brauchte keinen neuen
  Code — bereits durch den bestehenden Test `'calculates on-duration and
  switch count for boolean states'` (`test/unit/tools.test.js`) abgedeckt.
  Noch offen: Commit/Merge/Push.

## TODO

- Nächste Produktaufgabe (nach dieser): aktuellen Adapterstand auf einer
  echten ioBroker-Installation live abnehmen.
- Sub-Projekt C (HVAC-Korrelation) und B (Energie-Korrelation) folgen laut
  `docs/specs/2026-09-04-korrelation-und-abgeleitete-kennzahlen-uebersicht.md`.
- Vor jedem künftigen Release `npm run test:e2e` einmal manuell ausführen
  (js-controller-Installation kann mehrere Minuten dauern).

## DONE

- Abgeleitete Kennzahlen (Sub-Projekt A): neue Katalogfelder
  `derivedMetricRole`/`derivedMetricGroupId` (validiert in `catalog.js` und
  `adminCommands.js`); neues LLM-Werkzeug `getSelfConsumption` in
  `tools.js`; rein namensbasierte Onboarding-Heuristik
  (`suggestSelfConsumptionPair`) schlägt ein PV-Erzeugung/Netzeinspeisung-
  Paar vor, wenn eindeutig; Admin-UI-CSV-Spalten ergänzt.
- Hybride Anomalieerkennung Phase 2: `lib/periodValue.js` aus `lib/tools.js`
  extrahiert (Wiederverwendung der typbewussten Periodenberechnung);
  `lib/anomalyDetector.js` um `detectDailyAggregateAnomaly` sowie
  Zähler-/Boolean-Kandidaten (Tagesvergleich: letzter vollständiger
  Kalendertag gegen 7 Kalendertage davor) erweitert; `main.js`-Systemprompt
  kind-neutral formuliert.
- CI-Aufräumung und Teststrategie (main.js + Admin-UI, echter
  ioBroker-E2E-Test) sind auf `master` gemergt und gepusht. Details:
  `docs/adr/backlog.md` Punkte 3 und 5, `docs/specs/2026-09-04-*`.

Ältere abgeschlossene Historie (Dokumentationskonsolidierung, Lizenzaudit,
Releases beta.47/beta.48) steht in `CHANGELOG.md` und Git.
