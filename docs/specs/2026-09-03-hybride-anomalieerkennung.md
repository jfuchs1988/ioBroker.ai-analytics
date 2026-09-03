# Hybride Anomalieerkennung — Design

Status: Approved for implementation
Datum: 2026-09-03

## Ziel

Die proaktive Prüfung soll nicht mehr den vollständigen Katalog blind an das
LLM geben. Eine statistische Voranalyse filtert zuerst unauffällige numerische
Zeitreihen heraus. Das LLM erklärt anschließend nur die auffälligen
Kandidaten in natürlicher Sprache und entscheidet nicht allein, ob ein
Messwert statistisch ungewöhnlich ist.

## Phase 1 Umfang

- Nur katalogisierte, aktive, nicht ignorierte Objekte mit `valueKind: gauge`
- Rohwerte mit endlichen numerischen `val`-Feldern
- Vergleich der aktuellen 24 Stunden mit einem historischen Referenzfenster
  von sieben Tagen davor
- Robuste Kennzahlen: Median, Median Absolute Deviation (MAD), aktuelle
  Medianabweichung und relative Abweichung
- Kandidat bei deutlicher robuster Abweichung oder fehlender/staler Datenreihe
- Keine automatische Aktorsteuerung und keine Zustandsänderung an Quellobjekten
- Keine LLM-Kosten für Objekte, die statistisch unauffällig sind

## Nicht in Phase 1

- Boolesche Zustandswechsel
- Tages- und Lebenszeitzähler
- Korrelation mehrerer Datenpunkte
- feste Nutzer-Schwellenwerte
- automatische Alarmzustände, Cooldowns oder Bestätigungen
- Grafiken und externe Benachrichtigungskanäle

## Statistische Entscheidung

Für jede Zeitreihe werden aus dem Referenzfenster Median und MAD berechnet.
Da MAD bei konstanten Reihen null sein kann, wird zusätzlich eine robuste
Mindeststreuung aus der Interquartilsdifferenz und einem kleinen absoluten
Floor verwendet. Die aktuelle Reihe wird über ihren Median bewertet.

Ein Objekt wird Kandidat, wenn mindestens eine Bedingung gilt:

- robuste Abweichung (`robustZ`) >= 3.5
- relative Abweichung zum Referenzmedian >= 50 %, wenn der Referenzmedian
  nicht nahe null ist
- aktuelle Reihe ist leer oder ihr letzter Wert überschreitet die erwartete
  Aktualisierung deutlich (`dataCompleteness` ist `gaps` oder `stale`)

Bei zu wenigen Referenz- oder aktuellen Punkten lautet das Ergebnis
`insufficient_data` und wird nicht an das LLM weitergereicht.

## Ergebnis

Die Voranalyse liefert je Objekt eine kompakte, deterministische Struktur:

```js
{
  sourceId,
  reason: 'deviation' | 'missing_data',
  currentMedian,
  baselineMedian,
  robustZ,
  relativeChange,
  currentCount,
  baselineCount,
  dataCompleteness
}
```

Diese Kandidaten werden dem proaktiven Systemprompt als Fakten übergeben. Das
LLM darf die Kandidaten erklären und priorisieren, aber keine statistischen
Kennzahlen erfinden. Bei null Kandidaten bleibt die bestehende kurze Antwort
„Keine Auffälligkeiten.“ möglich, ohne einen umfangreichen LLM-Kontext.

## Fehlerbehandlung

- Fehler einzelner History-Abfragen werden pro Objekt geloggt und übersprungen.
- Ein kompletter Ausfall des Analysepfads darf den Adapter nicht beenden.
- History-Fehler und echte Datenlücken bleiben unterscheidbar.
- Die Voranalyse schreibt keine fremden ioBroker-States.

## Erfolgskriterien

- Gleichmäßige Reihen werden nicht als Kandidaten gemeldet.
- Ein synthetischer Ausreißer wird reproduzierbar gefunden.
- Eine leere/stale Reihe wird als Datenproblem markiert.
- Zu wenige Daten werden nicht als Anomalie ausgegeben.
- Der proaktive LLM-Aufruf erhält nur Kandidaten statt den ungefilterten Katalog.
