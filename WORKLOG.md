# Arbeitsstand

Kurzer Übergabestand für die nächste Sitzung. Abgeschlossene Historie steht in
`CHANGELOG.md` und Git, dauerhafte Risiken in
`docs/architecture/11-risiken-und-schulden.md`.

## WIP

- Branch: `master`.
- Status: Energie-Korrelation (Sub-Projekt B) committed (`16ea154`), nach
  `master` gemergt (`17f02a5`) und nach `origin/master` gepusht.
  Feature-Branch gelöscht. Damit haben alle drei Sub-Projekte der
  Korrelations-Zerlegung (A, B, C) eine erste Ausbaustufe.

## TODO

- Nächste Produktaufgabe (nach dieser): aktuellen Adapterstand auf einer
  echten ioBroker-Installation live abnehmen.
- Alle drei Sub-Projekte der Korrelations-Zerlegung (A, B, C) haben jetzt
  eine erste Ausbaustufe. Spätere Ausbaustufen (bewusst zurückgestellt):
  Wirkungsgrad (A), Temperatur-Stagnations-Regel (C), bidirektionaler
  Netzzähler-Support (B).
- Vor jedem künftigen Release `npm run test:e2e` einmal manuell ausführen
  (js-controller-Installation kann mehrere Minuten dauern).

## DONE

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
