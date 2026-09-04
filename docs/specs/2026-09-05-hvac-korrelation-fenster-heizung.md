# HVAC-Korrelation — Fenster offen bei laufender Heizung

Status: Approved for implementation
Datum: 2026-09-05
Vorgänger: [Übersicht Korrelation/Kennzahlen](2026-09-04-korrelation-und-abgeleitete-kennzahlen-uebersicht.md)
(Sub-Projekt C, erste Ausbaustufe)

## Ziel

Erste Ausbaustufe der HVAC-Korrelation: pro Raum erkennen, ob ein Fenster
über eine relevante Dauer gleichzeitig geöffnet war, während die Heizung
lief (Energieverschwendung, vergessenes Fenster). Temperatur-Stagnation
("Heizung an, Temperatur bewegt sich nicht") ist eine spätere Ausbaustufe
mit anderer Formelform (Trendvergleich statt Zustands-Overlap).

## Korrektur gegenüber der Übersicht

Die Übersicht ging davon aus, dass das bestehende `room`-Feld allein für die
Gruppierung reicht. Das stimmt für die Zuordnung "diese Objekte gehören zum
selben Raum", aber nicht für die Unterscheidung *welche Funktion* ein
`boolean_state`-Objekt im Raum hat (Fenster vs. Heizungsaktor). Es braucht
deshalb doch ein kleines neues Feld — deutlich leichter als das
N-er-Gruppenmodell aus Sub-Projekt B, da `room` weiterhin die Gruppierung
übernimmt und nur eine Rollenmarkierung pro Objekt hinzukommt.

## Datenmodell

Neues optionales Katalogfeld `hvacRole`: `'window' | 'heating'`. Nur gültig
für `valueKind: 'boolean_state'` (Validierungsfehler sonst). Kein
Gruppen-ID-Feld nötig — `room` ist bereits die Gruppierung.

Validierung in `lib/catalog.js` (`validateCatalogEntry`) und
`lib/adminCommands.js` (`validateCatalogUpdate`), analog zu
`derivedMetricRole` aus Sub-Projekt A.

## Umfang der ersten Ausbaustufe

- Nur Räume mit **genau einem** `hvacRole: 'heating'`- und **genau einem**
  `hvacRole: 'window'`-Objekt. Mehrdeutige Räume (mehrere Fenster, mehrere
  Heizungsaktoren) werden übersprungen — spätere Ausbaustufe kann mehrere
  Fenster per Oder-Verknüpfung zusammenfassen.
- Zeitraum: letzter vollständiger Kalendertag (lokale Zeitzone), gleiche
  Tagesausrichtung wie Phase 2 der Anomalieerkennung.
- Metrik: Überlappungsdauer der Intervalle "Heizung an" und "Fenster offen"
  am Tag.
- Schwelle: Kandidat bei Überlappung >= 15 Minuten.

## Berechnung

Neues Modul `lib/hvacCorrelation.js` (nicht `anomalyDetector.js` — das ist
eine Zustands-Overlap-Regel, kein Baseline-Vergleich, verdient ein eigenes
fokussiertes Modul):

- `computeOverlapMs(pointsA, pointsB, periodStart, periodEnd)`: mergt zwei
  `onchange`-Punktreihen zu einer Zeitleiste und summiert die Dauer, in der
  beide Zustände `true` sind. Gleiche Konvention wie
  `periodValue.js#computePeriodValue` für `boolean_state`: Zustand vor
  `periodStart` gilt als `false` (Vereinfachung, konsistent mit der
  bestehenden Einschaltdauer-Berechnung).
- `findHvacCorrelationCandidates(adapter, entries, now)`: gruppiert
  eligible Einträge (`active !== false`, `!ignored`, `valueKind ===
  'boolean_state'`, `hvacRole` gesetzt, `room` gesetzt) nach `room`, filtert
  auf eindeutige Heizung/Fenster-Paare, holt `onchange`-History für den
  letzten vollständigen Kalendertag für beide Objekte, berechnet den
  Overlap, meldet einen Kandidaten ab der Schwelle. Kein
  Progress-Reporting (deutlich weniger Räume als Gesamtobjekte, YAGNI).
  Rückgabe: `{ candidates: [...], failedCount }` (bewusst ein Plain Object,
  nicht die Hidden-Property-auf-Array-Konvention aus `anomalyDetector.js`,
  da diese beim Zusammenführen zweier Kandidatenlisten nicht mehr
  neu gesetzt werden kann — `Object.defineProperty` ohne `configurable:
  true` lässt sich nicht überschreiben).

Kandidatenform:

```js
{
    room,
    reason: 'window_open_while_heating',
    heatingSourceId, heatingDescription,
    windowSourceId, windowDescription,
    overlapMs,
    periodStart, periodEnd,
}
```

## Integration in main.js

`executeProactiveCheck` ruft nach der bestehenden
`findAnomalyCandidates`-Voranalyse zusätzlich `findHvacCorrelationCandidates`
auf, hängt deren `candidates` an die bestehende `anomalyCandidates`-Liste an
und addiert `failedCount` in eine lokale Variable (statt sich auf die
Hidden-Property des Arrays zu verlassen — die bisherigen Codepfade, die
`anomalyCandidates.failedCount` lesen, werden auf diese lokale Variable
umgestellt). Systemprompt bekommt einen kurzen Zusatz, dass Kandidaten auch
raumbezogene Korrelationen (`reason: 'window_open_while_heating') enthalten
können.

## Zuweisung von `hvacRole`

Wie bei `derivedMetricRole`: manuell im Geräte-Tab (CSV-Spalte) plus eine
rein namensbasierte Onboarding-Heuristik (kein LLM-Aufruf), die pro Raum nur
bei eindeutigem Kandidaten je Rolle vorschlägt (Namensmuster für Fenster:
`fenster|kontakt|window`; für Heizung: `heizung|thermostat|ventil|heating`,
nur unter den `boolean_state`-Objekten des jeweiligen Raums).

## Nicht-Ziele

- Keine Temperatur-Stagnations-Regel in dieser Runde.
- Keine Mehrfach-Fenster-Oder-Verknüpfung — nur eindeutige 1:1-Räume.
- Keine automatischen Aktionen (Heizung abschalten o. Ä.) — nur Meldung.
- Keine Änderung an `derivedMetricRole`/Sub-Projekt A.

## Erfolgskriterien

- Ein Raum mit überlappenden "Fenster offen" + "Heizung an"-Intervallen
  >= 15 Minuten am letzten vollständigen Kalendertag liefert einen
  Kandidaten mit korrekter `overlapMs`.
- Kein Overlap oder Overlap unter der Schwelle liefert keinen Kandidaten.
- Ein Raum mit mehreren Fenstern oder mehreren Heizungsaktoren wird
  übersprungen, nicht fehlerhaft ausgewertet.
- Ein History-Fehler für ein Raumpaar wird geloggt und übersprungen, ohne
  den gesamten Analysepfad zu beenden.
- Bestehende Phase-1/2-Anomalieerkennung bleibt unverändert (eigenes Modul).
