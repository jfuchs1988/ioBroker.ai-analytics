# ADR-0005: Proaktive Prüfung — KI bewertet Daten komplett selbst, keine festen Regeln

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Für die proaktive Prüfung wurden im Brainstorming drei Varianten erwogen: (1) fest programmierte Schwellwert-Regeln, KI nur zur Formulierung der Meldung; (2) Hybrid — Regeln für Standardfälle, KI nur für Tiefenanalyse auf Anfrage; (3) KI bewertet die Rohdaten komplett selbst, ohne feste Regeln. Der Nutzer wurde auf den Trade-off hingewiesen (teurer, weniger vorhersagbar als eine Regel-Engine) und hat sich trotzdem bewusst für Variante 3 entschieden.

## Entscheidung

Die proaktive Prüfung (`runProactiveCheck` in `main.js`) übergibt der KI keine festen Schwellwerte. Sie bekommt Zugriff auf dieselben Werkzeuge wie der Chat-Agent und entscheidet komplett selbst, was sie als auffällig einstuft.

## Konsequenzen

- Erkennt auch unerwartete Muster, die keine Regel vorhergesehen hätte.
- Kosten pro Prüflauf und Vorhersagbarkeit der Ergebnisse sind geringer als bei einer Regel-Engine — akzeptierter Trade-off.
- Kein Kosten-/Token-Budget für diese Läufe existiert aktuell (siehe [Backlog](backlog.md)) — bei ungünstiger Konfiguration (z. B. sehr kurzes Intervall) potenziell teuer.
- Nachvollziehbarkeit wird durch Prompt-Vorgabe sichergestellt (Begründung mit konkreten Werten verlangt, siehe [Querschnittliche Konzepte](../architecture/08-querschnittliche-konzepte.md)), nicht durch deterministische Regeln.

## Verworfene Alternativen

- Regelbasiert + KI nur zur Formulierung.
- Hybrid: Regeln für Standardfälle, KI nur für Tiefenanalyse auf Anfrage.
