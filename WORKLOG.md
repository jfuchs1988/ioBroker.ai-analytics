# Arbeitsstand

Kurzer Übergabestand für die nächste Sitzung. Abgeschlossene Historie steht in
`CHANGELOG.md` und Git, dauerhafte Risiken in
`docs/architecture/11-risiken-und-schulden.md`.

## WIP

- Branch: `feature/hvac-korrelation-fenster-heizung`
- Ziel: Sub-Projekt C der Korrelations-/Kennzahlen-Zerlegung (Fenster offen
  bei laufender Heizung), siehe
  Spec `docs/specs/2026-09-05-hvac-korrelation-fenster-heizung.md`,
  Plan `docs/plans/2026-09-05-hvac-korrelation-fenster-heizung.md`.
- Stand: Code + Tests + Doku fertig. `npm test` (418 Unit- + 8 Admin-Tests),
  `npm run lint`, `npm run build:admin` grün. Noch offen: Commit/Merge/Push.

## TODO

- Nächste Produktaufgabe (nach dieser): aktuellen Adapterstand auf einer
  echten ioBroker-Installation live abnehmen.
- Sub-Projekt B (Energie-Korrelation) folgt laut
  `docs/specs/2026-09-04-korrelation-und-abgeleitete-kennzahlen-uebersicht.md`.
- Spätere Ausbaustufen (bewusst zurückgestellt): Wirkungsgrad (Sub-Projekt A),
  Temperatur-Stagnations-Regel (Sub-Projekt C).
- Vor jedem künftigen Release `npm run test:e2e` einmal manuell ausführen
  (js-controller-Installation kann mehrere Minuten dauern).

## DONE

- HVAC-Korrelation (Sub-Projekt C, erste Ausbaustufe): neues Katalogfeld
  `hvacRole` (`window`/`heating`, nur für `boolean_state`, validiert in
  `catalog.js`/`adminCommands.js`); neues fokussiertes Modul
  `lib/hvacCorrelation.js` (Zustands-Overlap-Regel statt Baseline-Vergleich,
  eigenständig von `anomalyDetector.js`) erkennt pro eindeutigem
  Fenster/Heizung-Raumpaar eine Überlappung >= 15 Minuten am letzten
  vollständigen Kalendertag; in `main.js` in die bestehende
  `anomalyCandidates`-Liste eingespeist (`totalFailedCount` statt
  Hidden-Array-Property, da zwei Kandidatenlisten zusammengeführt werden);
  rein namensbasierte Onboarding-Heuristik (`suggestHvacRoles`); Admin-UI-
  CSV-Spalte ergänzt.
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
