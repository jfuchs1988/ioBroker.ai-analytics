# ADR-0022: Manuell gepflegte Preise statt automatischer Preisliste, unbegrenzte tägliche Verbrauchs-Historie

[← ADR-Übersicht](adr-index.md)

## Status

Angenommen (2026-08-23)

## Kontext

Backlog [Punkt 13](backlog.md) wollte eine grafische Kosten-Übersicht "anhand von Azure-Preisen". Es gibt weder einen eigenen Azure-Providertyp noch eine praktikable Möglichkeit, Preise für beliebig viele Provider/Modell-Kombinationen (inkl. kostenloser lokaler Modelle) automatisch aktuell zu halten. Details: [Design-Spec](../specs/2026-08-22-token-kosten-tab-design.md).

## Entscheidung

1. Preise pro 1 Mio. Input-/Output-Tokens werden vom Nutzer manuell in der Admin-Config hinterlegt (vier Felder: Chat/Onboarding × Input/Output), Default 0.
2. Der Token-Verbrauch wird täglich granular UND nach Zweck getrennt (Chat/Prüfung vs. Onboarding) in einem neuen, unbegrenzt wachsenden State `usage.history` gespeichert, zusätzlich zum bestehenden `usage.today`-Tageszähler.
3. Kosten werden stets mit den *aktuell* konfigurierten Preisen berechnet, auch rückwirkend für vergangene Tage — keine Preis-Snapshots pro Tag.
4. Onboarding-Verbrauch (bisher nirgends erfasst) wird ab jetzt ebenfalls über `recordUsage` erfasst und zählt korrekt gegen `dailyTokenBudget`.

## Konsequenzen

**Positiv:** funktioniert für jeden Provider/jedes Modell ohne Wartungslast im Code; Preisänderungen wirken sofort; schließt eine Lücke, durch die Onboarding-Verbrauch bisher weder budgetiert noch sichtbar war.

**Negativ:** Nutzer muss Preise selbst pflegen und bei Änderungen nachtragen; `usage.history` wächst unbegrenzt (bei täglicher Granularität klein — ca. 150 Bytes/Tag, mehrere Jahrzehnte bis das relevant wird); rückwirkende Kosten sind nur eine Näherung mit aktuellen Preisen, keine historisch korrekte Abrechnung.
