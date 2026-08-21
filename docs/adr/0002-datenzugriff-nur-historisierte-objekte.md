# ADR-0002: Datenzugriff nur auf Objekte mit aktivem History-Logging

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Der Adapter braucht eine klare Regel, welche der potenziell tausenden ioBroker-Objekte für Analyse/Chat relevant sind. Explizite Nutzeranforderung: "nur Werte die in DB/Influx/History gespeichert werden sind relevant."

## Entscheidung

Ein Objekt gilt nur dann als relevant, wenn `obj.common.custom["<influxdb|history|sql>.N"].enabled === true` — geprüft durch `lib/discovery.js`. Kein anderer Mechanismus (z. B. Rollen, Enums, States-Muster) wird zur Auswahl herangezogen.

## Konsequenzen

- Klar abgegrenzte, vom Nutzer bereits getroffene Vorauswahl (er entscheidet durch Aktivieren des History-Loggings, was relevant ist) — kein zusätzlicher Konfigurationsschritt im Adapter nötig für v1.
- Objekte ohne History-Logging sind für den Adapter unsichtbar, selbst wenn sie fachlich interessant wären.
- Aktuell keine Möglichkeit, die Auswahl auf bestimmte History-Adapterinstanzen einzuschränken (z. B. nur `influxdb.0`, nicht `sql.0`) — siehe [Backlog](backlog.md).

## Verworfene Alternativen

- Zugriff auf beliebige States (zu breit, kein Filter für Relevanz).
