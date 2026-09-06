# Arbeitsstand

Kurzer Übergabestand für die nächste Sitzung. Abgeschlossene Historie steht in
`CHANGELOG.md` und Git, dauerhafte Risiken in
`docs/architecture/11-risiken-und-schulden.md`.

## WIP

- Branch: `master`.
- Status: Geräteliste-UI-Redesign (Tasks 1-7) gemergt und als `0.0.1-beta.50`
  veröffentlicht; automatisierte Verifikation und E2E-Test sind grün.

## TODO

- Nächste Produktaufgabe: Geräteliste-UI auf einer echten ioBroker-Installation
  zusätzlich manuell abnehmen (Sortierung, Detail-Panel, Bulk-Toolbar).
- Review-Fixwelle nach dem Claude-Session-Limit abgeschlossen: Bulk-Status wird
  im Parent angezeigt, Einzel-Erfolge erscheinen ca. 3 Sekunden inline,
  Gruppen-IDs werden im Picker auf Länge/Steuerzeichen validiert, ungültige
  Bulk-Platzhalter bleiben deaktiviert und die Architektur-Dokumentation nennt
  die echten `src-admin/src/`-Pfade.
- Alle drei Sub-Projekte der Korrelations-Zerlegung (A, B, C) haben jetzt
  eine erste Ausbaustufe. Spätere Ausbaustufen (bewusst zurückgestellt):
  Wirkungsgrad (A), Temperatur-Stagnations-Regel (C), bidirektionaler
  Netzzähler-Support (B).

## DONE

- Merge und Release `0.0.1-beta.50` (2026-09-06): `master` enthält das
  Geräteliste-Redesign; E2E-Test gegen echten js-controller und Paketbau waren
  erfolgreich. GitHub-Tag und Release folgen nach dem Push.

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
