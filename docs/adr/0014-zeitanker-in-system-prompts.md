# ADR-0014: Beide LLM-System-Prompts enthalten einen expliziten Zeitanker

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

In der finalen Whole-Branch-Review wurde als Critical-Finding entdeckt: Weder der Chat-Q&A- noch der proaktive-Prüfungs-Prompt teilten dem Modell die aktuelle Uhrzeit mit, obwohl die Werkzeuge `getHistory`/`compareTimeframes` Unix-Millisekunden-Zeitfenster erwarten. Ohne Anker musste das Modell relative Zeitfenster ("letzte Woche") anhand seines Trainingsstands schätzen — potenziell leere oder falsche Datenbereiche.

## Entscheidung

Beide System-Prompts (`onMessage`, `runProactiveCheck` in `main.js`) beginnen mit der aktuellen Zeit als ISO-String und Unix-Millisekunden, plus einem expliziten Hinweis, dass Zeitangaben für die Werkzeuge relativ zu diesem Anker zu verstehen sind.

## Konsequenzen

- Zeitraumbezogene Fragen ("letzte Woche", "heute") werden korrekt relativ zur tatsächlichen aktuellen Zeit aufgelöst.
- Der Anker wird bei jedem Aufruf neu berechnet (`new Date()`), keine zusätzliche Konfiguration nötig.
- Noch nicht durch einen automatisierten Test abgesichert (siehe [Testkonzept](../architecture/08-querschnittliche-konzepte.md#84-testkonzept) zur fehlenden `main.js`-Testabdeckung).

## Verworfene Alternativen

- Kein Zeitanker (ursprünglicher Stand, führte zu leeren/falschen Zeiträumen).
