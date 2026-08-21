# ADR-0003: Tool-Calling-Agent statt vorberechneter Zusammenfassungen oder roher Query-Generierung

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Im Brainstorming wurden drei Ansätze verglichen, wie die KI an Verbrauchsdaten kommt:

- **A — Tool-Calling-Agent**: KI ruft kuratierte Werkzeuge (`getHistory`, `compareTimeframes`, `listCatalog`) iterativ auf.
- **B — Precompute-Only**: Ein Hintergrundjob berechnet feste Aggregate, KI bekommt nur fertige Zusammenfassungen.
- **C — Raw-Query-Generierung**: KI schreibt selbst InfluxQL/Flux-Queries.

## Entscheidung

Ansatz A (Tool-Calling-Agent) wurde gewählt.

## Konsequenzen

- KI kann bei offenen Fragen frei explorieren (z. B. "warum" nachforschen), statt auf vorab bedachte Aggregate beschränkt zu sein.
- Kein direkter Query-Sprachzugriff — sicherer und portabel zwischen InfluxDB/History/SQL (Ansatz C hätte das nicht geboten).
- Erfordert einen Agent-Loop (`lib/agent.js`) mit Mehrfach-Aufrufen pro Anfrage — mehr Implementierungsaufwand als ein Single-Shot-Prompt (Ansatz B).
- Token-/Kostenverbrauch pro Anfrage ist weniger vorhersagbar als bei B, da die Anzahl der Tool-Aufrufe variiert (siehe [Backlog](backlog.md) zum fehlenden Kosten-/Token-Budget).

## Verworfene Alternativen

- **B (Precompute-Only)**: zu starr, KI kann nur beantworten was vorher bedacht wurde.
- **C (Raw-Query)**: unsicher (KI-generierte Queries könnten fehlerhaft/teuer sein), bindet an eine konkrete Query-Sprache/Datenbank.
