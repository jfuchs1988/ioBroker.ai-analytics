# ADR-0026: Schreibmuster-bewusste Datenvollständigkeits-Erkennung

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-09-03

## Kontext

Katalogeinträge sollten laut Markt-Bedarfsanalyse ([01-einfuehrung-und-ziele.md §1.4](../architecture/01-einfuehrung-und-ziele.md), Punkt 15) auch Schreibbarkeit, Update-Frequenz und Datenvollständigkeit abbilden. Eine naive Lückenerkennung ("keine neuen Daten seit X Minuten = Lücke") funktioniert aber nicht für on-change-Objekte (z. B. Fensterkontakte): lange Funkstille ist dort normal, keine Lücke.

## Entscheidung

Die Klassifizierung (`lib/dataQualityClassifier.js`) erkennt zunächst das Schreibmuster eines Objekts (`continuous` vs. `on_change`) aus dem Variationskoeffizienten seiner Schreib-Zeitabstände — ein niedriger Koeffizient bedeutet festen Takt, unabhängig davon, ob sich der Wert dabei ändert. Datenvollständigkeit wird danach unterschiedlich bewertet: bei `continuous` gegen das Median-Intervall (5-facher Schwellwert), bei `on_change` gegen die größte historisch beobachtete Lücke des Objekts selbst (3-facher Schwellwert, mit 24h-Mindestschwelle). `writable` kommt direkt aus `common.write`. Alle vier Felder sind rein berechnet, kein manuelles Override, kein LLM-Aufruf.

## Konsequenzen

- Der Chat-Agent und das Geräte-Tab können zwischen "Objekt liefert gerade keine Daten" und "Objekt hat seit langem denselben Wert, das ist normal" unterscheiden.
- Bestehende Katalogeinträge ohne diese Felder werden wie `unknown` behandelt (kein Blocker); ein optionaler, standardmäßig deaktivierter Backfill klassifiziert sie nach.
- Sicherheitsklasse und Synonyme (die übrigen zwei Felder aus Punkt 15 der Analyse) bleiben spätere, eigene Teilprojekte.

## Verworfene Alternativen

- Eine einzige, musterunabhängige Lückenerkennung (fixer Zeitschwellwert) wäre bei on-change-Objekten systematisch falsch positiv.
- Eine LLM-gestützte Bewertung der Vollständigkeit wäre teurer und für ein rein statistisches Muster nicht nötig.
