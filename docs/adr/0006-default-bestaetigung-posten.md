# ADR-0006: Default-Verhalten bei ergebnislosem Prüflauf — Bestätigung posten

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Wenn die proaktive Prüfung nichts Auffälliges findet, muss entschieden werden, ob trotzdem eine Chat-Nachricht gepostet wird. Der Nutzer wurde dazu explizit befragt.

## Entscheidung

Standardmäßig postet ein ergebnisloser Prüflauf eine kurze Bestätigung ("Keine Auffälligkeiten") statt zu schweigen — Begründung des Nutzers: "zeigt, dass das System aktiv läuft". Über `silentIfNothingFound` in der Admin-Konfiguration abschaltbar.

## Konsequenzen

- Nutzer hat sichtbare Bestätigung, dass der Adapter aktiv arbeitet, statt sich zu fragen ob überhaupt geprüft wurde.
- Mehr Chat-Nachrichten als bei einem rein stillen Verhalten — bei kurzem Prüfintervall potenziell "Rauschen" (durch `silentIfNothingFound` konfigurierbar).

## Verworfene Alternativen

- Stiller Lauf ohne Nachricht als Default.
