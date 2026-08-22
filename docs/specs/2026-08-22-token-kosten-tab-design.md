# Token-Kosten-Tab (Historie, Kosten, Limit-Empfehlung) — Design

[← Doku-Übersicht](../README.md)

**Status:** Autonom fertiggestellt (Nutzer bat explizit darum, alles bis zum Push nach `master` selbstständig abzuschließen, während er offline war — "mach alles fertig bis zum push in den master wenn wieder tokens verfügbar sind"). Die normale Abschnitt-für-Abschnitt-Freigabe im Chat war dadurch nicht möglich; alle unten getroffenen Entscheidungen sind als **Ruling** markiert und sollten bei Gelegenheit rückblickend geprüft werden.

## Kontext

Backlog [Punkt 13](../adr/backlog.md): grafische Darstellung des gesamten Token-Verbrauchs, Kostenberechnung, Empfehlung für ein sinnvolles Tages-/Stundenlimit. Überschneidet sich mit dem bestehenden Budget-Bereich im Geräte-Tab (`admin/tab.js`'s `loadBudget`/`formatBudgetLine`), der heute nur den heutigen Verbrauch gegen `dailyTokenBudget` zeigt — keine Historie, keine Kosten.

Bei der Recherche für dieses Feature wurde eine bestehende Lücke gefunden: `lib/onboarding.js`'s `runOnboarding` erfasst den Token-Verbrauch der LLM-Klassifikations-Calls **gar nicht** — `recordUsage` wird nur aus dem Chat- und dem proaktiven-Prüfungs-Pfad in `main.js` aufgerufen. Onboarding-Verbrauch fehlt damit sowohl im Tagesbudget-Check als auch in jeder künftigen Kosten-/Historien-Anzeige. **Ruling:** diese Lücke wird als Teil dieses Plans mitgeschlossen (nicht nur dokumentiert), da eine Kosten-Historie ohne sie von vornherein unvollständig wäre.

## Ziele

1. Verbrauchs-Historie (Tages-Granularität, getrennt nach Chat/Prüfung vs. Onboarding — die beiden können seit [ADR-0021](../adr/0021-getrennte-provider-pro-zweck.md) unterschiedliche Provider/Preise haben) wird dauerhaft gespeichert, nicht nur der heutige Tag.
2. Kostenberechnung auf Basis vom Nutzer selbst gepflegter Preise pro Provider-Zweck.
3. Erweiterung des bestehenden Budget-Bereichs im Geräte-Tab um: Verlaufs-Balkendiagramm, Zeitraum-Auswahl, berechnete Kosten, Tages-/Stunden-Limit-Empfehlung.
4. Onboarding-Verbrauch fließt korrekt ins bestehende Tagesbudget (`dailyTokenBudget`) und in die neue Historie ein.

## Nicht-Ziele

- **Ruling:** keine automatisch gepflegte Preisliste (z. B. per externem API-Abruf) — Preise werden manuell in der Admin-Config hinterlegt (siehe Brainstorming-Antwort: "funktioniert für JEDEN Provider/Modell, bleibt nie veraltet, Nutzer pflegt selbst nach"). Kein Bezug zu einem konkreten "Azure"-Provider — "Azure" aus dem ursprünglichen Vorschlag war ein Platzhalter für "offizielle Preisliste eines Cloud-Anbieters", kein neuer Providertyp.
- **Ruling:** keine Währungsumrechnung/-kennzeichnung — der Preis ist eine vom Nutzer eingegebene Zahl in seiner eigenen Währung (Feldbeschriftung weist darauf hin), keine Symbol-/ISO-Code-Verwaltung.
- **Ruling:** keine rückwirkende Neuberechnung mit historischen Preisen — Kosten werden immer mit den *aktuell* konfigurierten Preisen berechnet, auch für vergangene Tage. Bekannte Vereinfachung, wird in der Doku als solche benannt.
- **Ruling:** kein gestapeltes/mehrfarbiges Balkendiagramm (Chat vs. Onboarding pro Tag visuell getrennt) — ein Balken pro Tag zeigt die Summe. Aufteilung Chat/Onboarding erscheint nur in der Kosten-Textzeile, nicht im Chart. Spätere Erweiterung möglich, hier bewusst einfach gehalten (Zeitbudget).
- **Ruling:** keine neue, tatsächlich *durchgesetzte* Stundenlimit-Funktion — nur eine *Empfehlung* als Text (der ursprüngliche Vorschlag sagt "empfehle", nicht "erzwinge"). Die Enforcement-Logik bleibt unverändert bei `dailyTokenBudget`.
- Kein Chart-Framework/keine externe Bibliothek (siehe UI-Abschnitt) — passt zu [ADR-0009](../adr/0009-reines-javascript-kein-typescript.md) (kein Build-Schritt, `admin/` bündelt keine `node_modules`).

## Datenmodell (`lib/usage.js`)

Neuer State `usage.history` (JSON, unbegrenzt wachsend — **Ruling**, siehe Brainstorming-Antwort "2 und 1 als Auswahl für die Darstellung": Speicherung unbegrenzt, Anzeige im Tab wählbar zwischen 30 Tagen und Gesamt). Ein Eintrag pro Kalendertag:

```json
{ "date": "2026-08-22", "chat": { "inputTokens": 1200, "outputTokens": 340 }, "onboarding": { "inputTokens": 8000, "outputTokens": 500 } }
```

`recordUsage(adapter, usage, purpose = 'chat')` bekommt einen dritten, optionalen Parameter (Default `'chat'` hält die beiden bestehenden Aufrufstellen in `main.js` unverändert lauffähig — **Ruling:** dort trotzdem explizit `'chat'` übergeben, für Lesbarkeit). Aktualisiert wie bisher `usage.today` (Summe über beide Zwecke, unverändertes Verhalten für den Budget-Check) UND legt/aktualisiert den heutigen Eintrag in `usage.history`.

Neue Exportfunktion `getUsageHistory(adapter) => Promise<Array<{date, chat, onboarding}>>`.

`lib/onboarding.js`'s `runOnboarding` ruft nach jedem erfolgreichen Batch-Call `recordUsage(adapter, response.usage, 'onboarding')` auf (bisher wurde `response.usage` komplett verworfen). Erfordert, dass die Provider-Antwort `usage` durchreicht — ist bereits der Fall (`lib/providers/*` liefern `usage: {inputTokens, outputTokens}` in jeder Antwort, siehe `lib/providers/anthropic.js:67-69`).

## Preiskonfiguration (Admin-Config)

Vier neue optionale native Felder (Default `0` = "kein Preis hinterlegt", z. B. für lokale Modelle):

```json
"chatPricePerMillionInputTokens": 0,
"chatPricePerMillionOutputTokens": 0,
"onboardingPricePerMillionInputTokens": 0,
"onboardingPricePerMillionOutputTokens": 0
```

Admin-Formular: vier `number`-Felder, platziert direkt bei den jeweiligen Provider-Blöcken (Chat-Preise unter dem bestehenden Chat-Provider-Block, Onboarding-Preise unter dem Onboarding-Provider-Block), Label-Hinweis "Preis pro 1 Mio. Tokens (in deiner Provider-Währung, z. B. USD)".

## UI — Erweiterung des bestehenden Budget-Bereichs

Der Sub-Nav-Eintrag "Budget" (`admin/tab.js`/`tab.html`, bereits vorhanden neben Chat/Geräte) wird erweitert, nicht ersetzt oder umbenannt (minimaler Eingriff). `#section-budget` bekommt:

1. Zeitraum-Auswahl: zwei Buttons "30 Tage" / "Gesamt" (Default: 30 Tage), togglen eine Client-seitige Neuberechnung — kein neuer Server-Request nötig, die volle Historie wird einmal geladen.
2. Ein einfaches Balkendiagramm (reines DOM: `<div>`s mit prozentualer `height`, kein Canvas/SVG/Chart-Bibliothek — passt zum bestehenden abhängigkeitsfreien Stil von `admin/tab.js`), ein Balken pro Tag im gewählten Zeitraum, Höhe relativ zum Tagesmaximum im Zeitraum.
3. Kosten-Zeile: "Kosten im Zeitraum: `<gesamt>` (Chat: `<chatCost>`, Onboarding: `<onboardingCost>`)" — berechnet aus Historie × aktuell konfigurierten Preisen.
4. Empfehlungs-Zeile: bei ≥ 3 Tagen Historie im gewählten Zeitraum, ein heuristischer Vorschlag: Tageslimit = `max(Tagesverbrauch im Zeitraum) × 1.2` (20 % Puffer, aufgerundet), Stundenlimit = Tageslimit ÷ 24. **Ruling:** bewusst simpel (kein Trend-/Regressionsmodell) — als Text klar als Heuristik gekennzeichnet ("Empfehlung basierend auf deinem bisherigen Verbrauch, kein hartes Limit"). Bei < 3 Tagen: "Noch nicht genug Daten für eine Empfehlung."

Neue, reine (testbare) Funktionen in `admin/tab.js`, exportiert wie die bestehenden `filterEntries`/`formatBudgetLine`:

- `computeRangeHistory(history, days)` — `days` = Zahl oder `null` (= alle); filtert/sortiert die Historie.
- `computeCost(rangeEntries, prices)` — `prices = {chatIn, chatOut, onboardingIn, onboardingOut}` (pro 1 Mio. Tokens); liefert `{chatCost, onboardingCost, totalCost}`.
- `recommendLimits(rangeEntries)` — liefert `{dailyTokens, hourlyTokens}` oder `null` bei < 3 Tagen Daten.
- `formatCostLine(costResult)`, `formatRecommendationLine(recommendation)` — reine String-Formatierung, analog zu `formatBudgetLine`.

Die DOM-Wiring-Teile (Chart-Rendering, Button-Handler) bleiben wie der Rest von `admin/tab.js` ungetestet (bestehende, akzeptierte Projekt-Konvention — nur reine Funktionen werden unit-getestet).

`loadBudget()` wird erweitert: lädt zusätzlich `usage.history` und die vier Preis-Felder aus der Instanz-Config (ein zusätzlicher `getState`-Aufruf), berechnet und rendert die neuen Elemente.

## Testing-Ansatz

- `test/unit/usage.test.js`: erweitert um `recordUsage` mit `purpose`-Parameter (Default-Verhalten unverändert bei fehlendem Parameter), `getUsageHistory`, History-Eintrag-Erstellung/-Fortschreibung am selben Tag, getrennte Aufsummierung nach `chat`/`onboarding`.
- `test/unit/onboarding.test.js`: erweitert um Nachweis, dass `runOnboarding` nach einem erfolgreichen Batch `recordUsage(adapter, usage, 'onboarding')` aufruft (gemockt).
- `test/unit/tabFormat.test.js`: neue Tests für `computeRangeHistory`, `computeCost`, `recommendLimits`, `formatCostLine`, `formatRecommendationLine` — reine Funktionen, keine Mocks nötig außer synthetischen Eingabedaten.

## ADR

Die Kombination "manuell gepflegte Preise statt automatischer Preisliste" + "unbegrenzte, aber grob (Tag-)granulare Verlaufsspeicherung ohne Bereinigung" ist architekturrelevant genug für eine eigene ADR (**ADR-0022**, wird als Teil des Implementierungsplans erstellt).

## Bezug zum Backlog

Löst Backlog [Punkt 13](../adr/backlog.md) vollständig für den beschriebenen Umfang (siehe Nicht-Ziele für bewusst ausgeklammerte Erweiterungen wie gestapelte Charts oder automatische Preislisten) — wird beim Abschluss des Plans aus dem Backlog entfernt.
