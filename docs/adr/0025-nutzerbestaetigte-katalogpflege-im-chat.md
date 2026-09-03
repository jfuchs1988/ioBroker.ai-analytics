# ADR-0025: Nutzerbestätigte Katalogpflege im Chat

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-09-03

## Kontext

Das bestehende LLM-Werkzeug kann nur einzelne Einträge mit `needsReview=true` ändern. Dadurch kann der Nutzer weder mehrere gleichartige Geräte in einer Erklärung pflegen noch bereits klassifizierte, aber falsch benannte Einträge korrigieren.

## Entscheidung

Der Chat-Agent erhält ein Batch-Werkzeug für bestehende Katalogeinträge. Es darf nur nach einer ausdrücklichen Nutzererklärung aufgerufen werden und nur `description`, `category` und `room` ändern. Vor dem ersten Schreibzugriff werden alle Objekt-IDs und Änderungen validiert. Jeder gespeicherte Eintrag wird als nutzerbestätigt markiert.

## Konsequenzen

- Nutzererklärungen werden direkt in der Geräte-Tabelle wirksam.
- Bereits klassifizierte Einträge können im Chat korrigiert werden.
- Der Agent kann weder neue Einträge erzeugen noch fremde ioBroker-Objekte verändern.
- Die Herkunft der Zuordnung bleibt im Katalog nachvollziehbar.

## Verworfene Alternativen

- Fremde `common.name`-Felder verändern: Adapter können diese Werte überschreiben.
- Unbegrenzten State-Schreibzugriff bereitstellen: unnötig und sicherheitskritisch.
- Für jeden Eintrag einen eigenen Werkzeugdurchlauf erzwingen: skaliert bei Gruppenangaben schlecht.
