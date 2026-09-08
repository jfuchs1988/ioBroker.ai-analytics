# Whole-Application-Review-Fixes

## Ziel

Die im Whole-Application-Review gefundenen konkreten Funktions-, Sicherheits-
und Konsistenzfehler werden behoben, ohne den read-only Datenzugriff oder den
scoped Katalog-Schreibvertrag aufzuweiten.

## Leitplanken

- State-Bridge-Befehle bleiben auf erlaubte Admin-Kommandos beschränkt und
  benötigen eine nachvollziehbare Admin-Berechtigung.
- Providerfehler dürfen keine Secrets oder vollständigen kontrollierten
  Antworttexte loggen.
- History-Ergebnisse weisen auf Truncation oder unvollständige Analyse hin.
- Counter, Gauges und Boolean-Zustände behalten ihre typgerechte Semantik.
- Admin-UI und CSV-Import verwenden dieselben Wertebereiche wie das Backend.
- Keine Änderung an fremden ioBroker-Objekten außer explizit scoped Katalogdaten.
