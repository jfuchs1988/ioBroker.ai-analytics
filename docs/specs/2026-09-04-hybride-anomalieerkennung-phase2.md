# Hybride Anomalieerkennung — Phase 2 (Zähler und Boolean-Zustände)

Status: Approved for implementation
Datum: 2026-09-04
Vorgänger: [Phase 1](2026-09-03-hybride-anomalieerkennung.md)

## Ziel

Die statistische Voranalyse aus Phase 1 deckt nur `valueKind: gauge` ab.
Phase 2 erweitert sie um Zähler (`daily_reset_counter`, `cumulative_total`,
`event_count`) und `boolean_state`, damit die proaktive Prüfung auch für
Verbrauchszähler und Schalter/Sensoren ohne blinden LLM-Aufruf auf jedes
Objekt auskommt. Die statistische Voranalyse verursacht keine LLM-Kosten
(reine History-Abfragen gegen die lokale ioBroker-Instanz) — Kostenaspekte
sind für dieses Feature nicht relevant.

## Phase 2 Umfang

- Katalogisierte, aktive, nicht ignorierte Objekte mit `valueKind` in
  `daily_reset_counter`, `cumulative_total`, `event_count`, `boolean_state`
- Tagesausrichtung statt rollierendem 24h-Fenster (siehe Begründung unten):
  aktueller Zeitraum = letzter vollständiger Kalendertag (lokale Zeitzone),
  Referenzfenster = die 7 vollständigen Kalendertage davor
- Zähler-Metrik: Tages-`total` aus `computePeriodValue` (bereits vorhandene
  kind-spezifische Aggregation aus `getPeriodTotal`/`comparePeriods`)
- Boolean-Metrik: tägliche Einschaltdauer `onDurationMs` aus
  `computePeriodValue`
- Gleiche robuste Statistik wie Phase 1 (Median, MAD, IQR-Fallback), aber für
  einen einzelnen aktuellen Tageswert gegen 7 Baseline-Tageswerte statt vieler
  Rohpunkte gegen viele Rohpunkte
- Gleiche Schwellenwerte wie Phase 1 (`robustZ >= 3.5` oder relative
  Abweichung `>= 50 %`)
- Fehlende/staler aktueller Tageswert wird wie in Phase 1 als `missing_data`
  markiert, nicht als `deviation`

## Nicht in Phase 2

- Schalthäufigkeit/Flapping-Erkennung bei `boolean_state` (nur Einschaltdauer
  wird bewertet)
- Korrelation mehrerer Datenpunkte (eigener, größerer Roadmap-Punkt)
- feste Nutzer-Schwellenwerte
- automatische Alarmzustände, Cooldowns oder Bestätigungen

## Warum Tagesausrichtung statt rollierendem Fenster

Phase 1 vergleicht ein rollierendes 24h-Fenster gegen sieben Tage davor —
passend für Momentanwerte ohne Reset-Semantik. `daily_reset_counter` und
teilweise `cumulative_total` haben aber eine kalendertägliche Reset- bzw.
Ablese-Semantik; ein rollierendes Fenster würde Teiltage vermischen und
falsche Ausreißer erzeugen (z. B. wäre der "heutige" Zählerstand am Vormittag
systematisch niedriger als ein voller Vortag). Phase 2 vergleicht deshalb
ausschließlich vollständige Kalendertage. Konsequenz: Ein Ausreißer von
gestern wird frühestens beim nächsten Lauf nach Mitternacht erkannt — bei der
konfigurierbaren periodischen Prüfung (Standard 24 h) akzeptabel.

## Wiederverwendung: `lib/periodValue.js`

`computePeriodValue(adapter, entry, period)` existiert aktuell als private
Funktion in `lib/tools.js` (genutzt von den LLM-Werkzeugen `getPeriodTotal`
und `comparePeriods`). Sie wird nach `lib/periodValue.js` extrahiert und von
`tools.js` sowie dem neuen Phase-2-Code in `lib/anomalyDetector.js`
importiert. Verhalten bleibt unverändert (reiner Verschieben-Refactor,
abgesichert durch die bestehenden `tools.test.js`-Tests).

## Statistik: neue Funktion statt Änderung an Phase 1

`detectSeriesAnomaly` (Phase 1) bleibt unverändert — sie geht von vielen
Rohpunkten in Referenz und aktuellem Fenster aus und ihr Vertrag ist von
Tests abgesichert. Die robuste Kernformel (Median, MAD, IQR-Fallback,
robustZ, relativeChange) wird in eine private Hilfsfunktion extrahiert und
von zwei öffentlichen Funktionen genutzt:

- `detectSeriesAnomaly({ currentValues, baselineValues, dataCompleteness })`
  — Phase 1, unverändert im Vertrag
- `detectDailyAggregateAnomaly({ currentValue, baselineValues, dataCompleteness })`
  — neu, Phase 2: `currentValue` ist ein einzelner Tageswert, `baselineValues`
  sind die 7 Baseline-Tageswerte

## Ergebnis (neue Kandidaten, additiv zu Phase 1)

```js
// Zähler (daily_reset_counter | cumulative_total | event_count)
{
  sourceId, description, room, unit,
  valueKind,
  reason: 'deviation' | 'missing_data',
  currentTotal, baselineMedianTotal,
  robustZ, relativeChange,
  currentCount, baselineCount, // Anzahl vorhandener Tageswerte (0-1 bzw. 0-7)
  dataCompleteness,
}

// boolean_state
{
  sourceId, description, room, unit,
  valueKind: 'boolean_state',
  reason: 'deviation' | 'missing_data',
  currentOnDurationMs, baselineMedianOnDurationMs,
  robustZ, relativeChange,
  currentCount, baselineCount,
  dataCompleteness,
}
```

Phase-1-Kandidaten (`gauge`) bleiben strukturell unverändert; ihnen wird
zusätzlich `valueKind: 'gauge'` beigefügt, damit alle Kandidaten im Prompt
einheitlich per `valueKind` unterscheidbar sind.

## Integration

- `isEligibleCatalogEntry` erweitert um die vier neuen `valueKind`-Werte.
- `findAnomalyCandidates` verzweigt pro Objekt nach `valueKind`: `gauge` nutzt
  weiterhin den Phase-1-Pfad, die vier neuen Kinds nutzen den
  Phase-2-Tagesvergleich.
- `main.js`-Systemprompt: "der letzten 24 Stunden" wird kind-neutral
  umformuliert, da Zähler/Boolean-Kandidaten sich auf den letzten
  vollständigen Kalendertag beziehen, Gauges weiterhin auf das rollierende
  24h-Fenster.

## Fehlerbehandlung

Wie Phase 1: History-Fehler pro Objekt werden geloggt und übersprungen
(`failedCount`), kein kompletter Abbruch des Analysepfads. Bei
`cumulative_total` schlägt eine der bis zu zwei History-Abfragen pro
Tagesperiode fehl, sobald eine fehlschlägt, gilt das Objekt für diesen Lauf
als fehlgeschlagen.

## Erfolgskriterien

- Ein Zähler mit deutlich höherem/niedrigerem Tageswert als in den 7
  Baseline-Tagen wird als Kandidat gemeldet.
- Ein gleichmäßiger Zähler-/Boolean-Verlauf erzeugt keinen Kandidaten.
- Ein fehlender aktueller Tageswert wird als `missing_data` markiert, nicht
  als `deviation`.
- Gauge-Verhalten aus Phase 1 bleibt byteidentisch (bestehende Tests bleiben
  grün ohne Änderung).
- `tools.js`-Verhalten (`getPeriodTotal`/`comparePeriods`) bleibt nach dem
  Refactor nach `lib/periodValue.js` unverändert (bestehende Tests bleiben
  grün ohne Änderung).
