# ADR-0024: Zweistufige `valueKind`-Klassifizierung

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-24

## Kontext

Die KI summierte historische Rohwerte eines monoton steigenden Tageszählers und erzeugte dadurch einen physikalisch falschen Wert. Der Katalog kannte bisher nur die fachliche Kategorie, nicht das Verhalten eines Datenpunkts.

## Entscheidung

Die Klassifizierung erfolgt zweistufig und ohne LLM-Aufruf:

1. Metadaten (`type`, `role`, Name und Objekt-ID) liefern eine sofortige Vorklassifizierung.
2. Eine Datenprobe über `getHistory` prüft das Verhalten mit eskalierendem Lookback von 48 Stunden, 7, 30 und 365 Tagen.

Die Ergebnisse werden als `valueKind`, `valueKindConfidence` und `valueKindSource` im Katalog gespeichert. `event_count` bleibt eine manuelle Auswahl, da es kein zuverlässiges automatisches Muster gibt. Der Backfill bestehender Einträge ist standardmäßig deaktiviert.

## Konsequenzen

- `getPeriodTotal` und `comparePeriods` können abhängig vom Wertverhalten korrekt aggregieren.
- Fehlende Klassifizierung wird sicherheitshalber wie `gauge` behandelt und als unsicher markiert.
- Die Klassifizierung verursacht keine zusätzlichen LLM-Kosten, benötigt aber History-Abfragen.

## Verworfene Alternativen

- Eine reine LLM-Klassifizierung wäre teurer und für Zeitreihenmuster weniger zuverlässig.
- Eine Reset-Erkennung ausschließlich anhand lokaler Mitternacht wäre unnötig empfindlich gegenüber verzögerten oder abweichenden Resets.
