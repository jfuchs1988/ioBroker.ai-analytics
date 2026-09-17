# Einmalige Wertpruefung beim Neu-Einlesen

**Status:** Umsetzung

## Ziel

Ein manueller Discovery-Lauf soll auf Wunsch die vorhandene Klassifikation
bestehender Datenpunkte anhand aktueller History-Daten erneut pruefen koennen.
Die Option ist eine Einmalaktion und wird nach einem erfolgreich abgeschlossenen
Prueflauf automatisch deaktiviert.

## Regeln

- `recheckValuesOnNextDiscovery` ist standardmaessig deaktiviert.
- Die Option wird bei `runDiscoveryNow` und `runDiscoveryOnly` verarbeitet.
- `valueKind` und Datenqualitaet werden fuer alle aktiven, nicht ignorierten
  Katalogeintraege erneut klassifiziert.
- Manuell bestaetigte Eintraege (`valueKindSource: manual`,
  `dataQualitySource: manual` oder `classificationSource: user`) bleiben
  unveraendert.
- Die Pruefung verwendet die vorhandenen History-Klassifizierer und keinen
  zusaetzlichen KI-Aufruf.
- Nach erfolgreicher Wert- und Datenqualitaetspruefung wird die Option
  persistent auf `false` gesetzt.
- Bei einem Laufabbruch vor Abschluss bleibt die Option aktiviert und wird beim
  naechsten Lauf erneut verarbeitet.

## Nicht-Ziel

- Keine dauerhafte Erweiterung der normalen Discovery-Pruefung.
- Keine Ueberschreibung manueller Katalogentscheidungen.
- Keine Begrenzung auf die bestehenden 20er-Backfill-Batches bei der expliziten
  Einmalaktion.
