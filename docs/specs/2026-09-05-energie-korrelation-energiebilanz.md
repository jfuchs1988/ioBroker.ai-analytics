# Energie-Korrelation — Energiebilanz-Anomalie

Status: Approved for implementation
Datum: 2026-09-05
Vorgänger: [Übersicht Korrelation/Kennzahlen](2026-09-04-korrelation-und-abgeleitete-kennzahlen-uebersicht.md)
(Sub-Projekt B, höchstes Risiko der drei Teile)

## Ziel

PV-Erzeugung, Netzbezug, Netzeinspeisung, Batterie und Verbrauch gemeinsam
auf eine unstimmige Energiebilanz prüfen (z. B. Verbrauch steigt, ohne dass
PV, Netzbezug oder Batterie das erklären — mögliches defektes Gerät oder ein
unerfasster Verbraucher).

## Vereinfachung gegenüber der Übersicht

Die Übersicht ging von einem eigenen N-er-Gruppen-/Rollenmodell aus. Es
reicht, das bestehende `derivedMetricRole`/`derivedMetricGroupId`-Feld aus
Sub-Projekt A um vier Rollen zu erweitern (`grid_import`,
`battery_charge`, `battery_discharge`, `consumption`, zusätzlich zu den
bestehenden `pv_generation`/`grid_feed_in`). Ein Haushalt nutzt eine
einzige Energie-Gruppe für beide Zwecke — Eigenverbrauch (Sub-A) und
Energiebilanz (dieses Spec). `getSelfConsumption` sucht in einer Gruppe
weiterhin nur seine zwei Rollen und bleibt von den vier neuen Rollen
unberührt.

Ebenso wird statt eines neuen, willkürlichen Schwellenwert-Konzepts die
bestehende `detectDailyAggregateAnomaly`-Funktion aus Phase 2 der
Anomalieerkennung (`lib/anomalyDetector.js`) wiederverwendet: letzter
vollständiger Kalendertag gegen 7 Baseline-Kalendertage, robuste
Z-Score-Schwelle (identisch zu Phase 2, keine neue Konstante).

## Datenmodell

`DERIVED_METRIC_ROLES` (`lib/catalog.js`, `lib/adminCommands.js`,
`src-admin/src/Components.jsx`) um vier Werte erweitern:
`grid_import`, `battery_charge`, `battery_discharge`, `consumption`.
Bestehende Validierungsregeln (nur zusammen mit `derivedMetricGroupId`
gesetzt) bleiben unverändert — sie gelten bereits generisch für jede Rolle.

Keine Constraint auf `valueKind` über die bestehende
`counter-artig`-Beschränkung hinaus, die schon für `pv_generation`/
`grid_feed_in` gilt (siehe Sub-A-Spec: nur `daily_reset_counter`,
`cumulative_total`, `event_count`) — dieselbe Beschränkung gilt für die vier
neuen Rollen.

## Umfang der ersten Ausbaustufe

- Pflichtrollen pro Energie-Gruppe: `pv_generation`, `grid_import`,
  `grid_feed_in`, `consumption` (je genau ein Objekt).
- Optionale Rollen: `battery_charge`, `battery_discharge` (fehlend = 0 in
  der Bilanzformel). Eine Gruppe mit nur einer der beiden Batterie-Rollen
  wird übersprungen (unvollständige Batterie-Erfassung ist nicht
  aussagekräftig).
- Mehrfachbelegung einer Pflichtrolle in derselben Gruppe → Gruppe wird
  übersprungen (mehrdeutig), analog zu Sub-A/C.
- Kein Support für einen einzelnen bidirektionalen Netzzähler (nur
  getrennte Bezug-/Einspeisungszähler) — bewusstes Nicht-Ziel.
- Keine Onboarding-Heuristik für die vier neuen Rollen — nur manuelle
  Zuweisung im Geräte-Tab (CSV). Vier neue Rollen zuverlässig aus
  Objektnamen zu erraten (stark unterschiedliche Namenskonventionen je
  Hersteller: Shelly, SolarEdge, Fronius, Growatt, Sonnen,
  Tesla Powerwall) wäre genau das Risiko, vor dem die Roadmap für dieses
  Sub-Projekt warnt.

## Berechnung

Neues fokussiertes Modul `lib/energyBalance.js`:

```
residual = (pvTotal + gridImportTotal + batteryDischargeTotal)
         - (gridFeedInTotal + batteryChargeTotal + consumptionTotal)
```

Je Energie-Gruppe: Tageswerte (`computePeriodValue` aus `periodValue.js`,
`.total`) für den letzten vollständigen Kalendertag sowie die 7
Kalendertage davor (gleiche Tagesausrichtung wie Phase 2 und
HVAC-Korrelation). `residual` wird für jeden der 8 Tage berechnet, dann:

```js
detectDailyAggregateAnomaly({
    currentValue: residualOfLastCompleteDay,
    baselineValues: residualsOfSevenBaselineDays,
    dataCompleteness: worstDataCompletenessOfRequiredRoles,
})
```

(`detectDailyAggregateAnomaly` wird aus `lib/anomalyDetector.js`
importiert — keine eigene Statistik-Implementierung.)

`dataCompleteness` je Tag: das "schlechteste" `dataCompleteness` der vier
Pflichtrollen-Objekte (`stale` > `gaps` > `unknown`/`complete`), damit ein
bekanntes Datenproblem als `missing_data` erkannt wird statt als falsche
Abweichung.

## Ergebnis

`detectDailyAggregateAnomaly` liefert generisch `reason: 'deviation' |
'missing_data'` — das wird auf `'energy_balance_deviation'` bzw.
`'energy_balance_missing_data'` umgemappt, damit die Kandidaten in der
gemeinsamen `anomalyCandidates`-Liste eindeutig von Gauge-/Zähler-Kandidaten
unterscheidbar sind (die JSON-Liste geht ungefiltert an das LLM):

```js
{
    groupId,
    reason: 'energy_balance_deviation' | 'energy_balance_missing_data',
    currentResidual, baselineMedianResidual, robustZ, relativeChange,
    currentCount, baselineCount, dataCompleteness,
    hasBattery: boolean,
    pvSourceId, pvDescription,
    gridImportSourceId, gridImportDescription,
    gridFeedInSourceId, gridFeedInDescription,
    consumptionSourceId, consumptionDescription,
}
```

## Integration in main.js

Wie bei HVAC-Korrelation: `findEnergyBalanceCandidates(adapter, catalogEntries, now)`
liefert `{ candidates, failedCount }`, wird in `executeProactiveCheck` nach
dem bestehenden HVAC-Aufruf ergänzt (eigener, separater try/catch — ein
Fehler in einem Korrelationspfad darf die anderen nicht mitreißen), Ergebnis
an die bestehende `anomalyCandidates`-Liste angehängt,
`totalFailedCount` entsprechend erweitert. Systemprompt bekommt einen
kurzen Zusatz für `reason: 'energy_balance_deviation'`.

## Fehlerbehandlung

Wie HVAC-Korrelation: History-Fehler pro Gruppe werden geloggt und
übersprungen (`failedCount`), kein kompletter Abbruch des Analysepfads.

## Nicht-Ziele

- Kein Support für einen einzelnen bidirektionalen Netzzähler.
- Keine Onboarding-Heuristik für die vier neuen Rollen.
- Keine Mehrfach-Energie-Gruppen pro Installation (wie bei
  `getSelfConsumption`: bei mehr als einer vollständigen Gruppe wird keine
  automatisch gewählt — hier zusätzlich: es gibt aktuell keinen
  Werkzeug-Parameter, um eine bestimmte Gruppe für die Bilanzprüfung
  explizit auszuwählen, da diese Prüfung nicht chat-getriggert, sondern nur
  Teil der proaktiven Prüfung ist).
- Keine Änderung an `getSelfConsumption`, `hvacCorrelation.js` oder Phase-1/2
  der Anomalieerkennung.

## Erfolgskriterien

- Eine Energie-Gruppe mit stimmiger Bilanz (residual nahe 0, stabil über
  8 Tage) erzeugt keinen Kandidaten.
- Eine Gruppe mit einem am letzten Tag deutlich abweichenden residual
  gegenüber den 7 Baseline-Tagen erzeugt einen Kandidaten mit korrektem
  `robustZ`/`relativeChange`.
- Eine Gruppe ohne Batterie-Rollen wird korrekt mit
  `batteryCharge = batteryDischarge = 0` berechnet (`hasBattery: false`).
- Eine Gruppe mit nur einer von zwei Batterie-Rollen wird übersprungen.
- Eine Gruppe ohne eine der vier Pflichtrollen wird übersprungen.
- Ein History-Fehler für eine Gruppe wird geloggt und übersprungen, ohne
  den gesamten Analysepfad zu beenden.
- Bestehende `getSelfConsumption`-, HVAC-Korrelations- und
  Phase-1/2-Anomalieerkennungs-Tests bleiben unverändert grün.
