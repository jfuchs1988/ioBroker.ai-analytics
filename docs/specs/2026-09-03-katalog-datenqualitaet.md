# Katalog-Datenqualität: Schreibbarkeit, Schreibmuster/Update-Frequenz, Datenvollständigkeit — Design

Status: Approved (Brainstorming abgeschlossen)
Datum: 2026-09-03

Erstes umgesetztes Teilprojekt aus Priorität 3 der Markt- und Bedarfsanalyse (siehe [01-einfuehrung-und-ziele.md §1.4](../architecture/01-einfuehrung-und-ziele.md), Punkt 15 "Semantische Datenqualität"). Von den dort genannten fünf Feldern (Schreibbarkeit, Sicherheitsklasse, Update-Frequenz, Synonyme, Datenvollständigkeit) werden hier bewusst nur die drei rein technisch berechenbaren umgesetzt — Sicherheitsklasse hat ohne den noch fehlenden sicheren Aktionsrahmen (Punkt 13) keinen Verwendungszweck, Synonyme bräuchten einen zusätzlichen LLM-Klassifizierungsschritt und bleiben ein späteres Teilprojekt.

## Kontext

Der Katalog kennt bisher `category`, `room`, `unit` und (seit ADR-0024) `valueKind` als Verhaltensklasse. Für zuverlässige Antworten und spätere Automationsvorschläge fehlt aber, ob ein Objekt überhaupt schreibbar ist, wie regelmäßig es Werte liefert und ob seine History-Daten vollständig sind oder Lücken haben. Letzteres ist nicht trivial: viele ioBroker-Datenpunkte schreiben **on-change** (nur bei tatsächlicher Wertänderung, z. B. Fensterkontakte) — eine wochenlange Funkstille ist dort normal und keine Lücke. Andere Datenpunkte schreiben **kontinuierlich** in festem Takt, auch wenn sich der Wert nicht ändert (z. B. viele Sensoren, die alle paar Sekunden denselben Wert erneut in die InfluxDB schreiben). Eine naive Lückenerkennung ("keine Daten seit X Minuten = Lücke") würde bei on-change-Objekten ständig falsch positiv melden.

Betroffene Bausteine: `lib/catalog.js` (Datenmodell), `lib/onboarding.js` (Einhängung für neue Objekte), `main.js` (Backfill für Bestandsobjekte, analog `backfillValueKinds`), `lib/tools.js` (Sichtbarkeit für den Agenten), `admin/jsonConfig.json`/`src-admin/src/Components.jsx` (Geräte-Tab, CSV-Export).

## 1. Datenmodell (`lib/catalog.js`)

Katalogeinträge bekommen vier neue Felder:

| Feld | Typ | Werte | Bedeutung |
|---|---|---|---|
| `writable` | boolean | `true`/`false` | direkt aus `common.write` des ioBroker-Objekts, keine Berechnung nötig |
| `writePattern` | string | `continuous` \| `on_change` \| `unknown` | wie regelmäßig das Objekt tatsächlich schreibt (siehe Abschnitt 2) |
| `updateFrequency` | string | `seconds` \| `minutes` \| `hourly` \| `daily` \| `weekly_or_slower` \| `event_driven` \| `unknown` | bei `writePattern: continuous` aus dem Median-Schreibintervall gebucketed; bei `on_change` fest `event_driven` |
| `dataCompleteness` | string | `complete` \| `gaps` \| `stale` \| `unknown` | siehe Abschnitt 2 — Bedeutung von `stale` hängt vom `writePattern` ab |

Alle vier Felder sind **rein berechnet**, kein manuelles Override im Geräte-Tab (im Unterschied zu `valueKind`). Fehlen sie (älterer Katalogeintrag, Backfill noch nicht gelaufen), behandeln Werkzeuge und UI sie wie `unknown`/`writable: undefined` — kein Blocker, keine Fehlermeldung.

## 2. Klassifizierung (`lib/dataQualityClassifier.js`, neues Modul)

Geschwistermodul zu `lib/valueKindClassifier.js`, gleiches Grundmuster (Metadaten sofort, Datenprobe mit eskalierendem Lookback), aber ohne die Verhaltens-Mustererkennung von dort — hier geht es um Schreibrhythmus statt Wertverlauf.

**`writable`** — deterministisch aus `obj.common.write`, kein History-Aufruf.

**`writePattern`/`updateFrequency`/`dataCompleteness`** — Datenprobe über `getHistory(..., aggregate='none')` (Rohpunkte mit echten Zeitstempeln). Start: 24h Lookback. Weniger als `MIN_SAMPLE_POINTS` (5) verwertbare Punkte → Eskalation auf 3 Tage → 7 Tage; danach `unknown` für alle drei Felder.

Aus den Rohpunkten werden die Zeit-Deltas zwischen aufeinanderfolgenden Punkten berechnet:

- **Schreibmuster**: Variationskoeffizient (Stdabw. / Mittelwert) der Deltas. `CV < 0.5` (regelmäßiger Takt, unabhängig davon ob sich der Wert ändert — deckt genau den Fall "schreibt alle paar Sekunden denselben Wert") → `continuous`. `CV >= 0.5` → `on_change`.
- **Update-Frequenz** (nur bei `continuous`): Median-Delta gebucketed — < 2 Min. → `seconds`, < 2 Std. → `minutes`, < 2 Tage → `hourly`, < 14 Tage → `daily`, sonst → `weekly_or_slower`. Bei `on_change` fest `event_driven` (keine Ereignisraten-Berechnung — YAGNI, siehe Nicht-Ziele).
- **Datenvollständigkeit**:
  - Bei `continuous`: größte Lücke im Beobachtungsfenster **und** die Zeit seit dem letzten Punkt bis jetzt werden gegen `GAP_MULTIPLIER × Median-Delta` (Default 5×) geprüft. Überschreitet eine davon den Schwellwert → `gaps`, sonst `complete`.
  - Bei `on_change`: die größte historisch beobachtete Lücke im Beobachtungsfenster (`maxHistoricalGapMs`) ist der Maßstab für "normale Funkstille" dieses Objekts. Ist die Zeit seit dem letzten Punkt bis jetzt größer als `STALE_MULTIPLIER × maxHistoricalGapMs` (Default 3×, mit einer Mindestschwelle von 24h, damit Objekte mit nur 1-2 historischen Ereignissen nicht sofort als `stale` markiert werden) → `stale`, sonst `complete`.
  - Bei `writePattern: unknown` → `dataCompleteness: unknown`.

Kein LLM-Aufruf, keine Kosten gegen `dailyTokenBudget` — reine History-Abfragen, wie bereits bei der `valueKind`-Datenprobe.

## 3. Einhängung in bestehende Abläufe

- **Neue Objekte** (`lib/onboarding.js`): `runOnboarding` ruft die neue Klassifizierung direkt neben `classifyValueKind` für dieselben Objekte auf (gleicher Batch).
- **Bestehende Objekte ohne (oder mit `unknown`) `writePattern`** (`main.js`): neue Methode `backfillDataQuality(entries)`, strukturell identisch zu `backfillValueKinds` — gedeckelt auf `DATA_QUALITY_BACKFILL_BATCH_SIZE` (20) Objekte pro Lauf. Im Unterschied zum `valueKind`-Backfill werden auch bereits klassifizierte, aber `unknown` gebliebene Einträge erneut versucht (reine History-Reads, kein Kostenrisiko, und ein zunächst zu junges Objekt kann beim nächsten Lauf genug Datenpunkte haben). Läuft **nur**, wenn der neue Admin-Schalter `enableDataQualityBackfill` aktiviert ist, an derselben Stelle in `syncCatalog()` wie der bestehende `valueKind`-Backfill.

## 4. Admin-Konfiguration (`admin/jsonConfig.json`)

Neues Feld, gleiches Muster wie `enableValueKindBackfill`:

```json
"enableDataQualityBackfill": {
  "type": "checkbox",
  "label": "Bestehende Datenpunkte nachtraeglich auf Schreibbarkeit/Update-Frequenz/Vollstaendigkeit pruefen",
  "default": false
}
```

Default **aus** — analog zur bestehenden Begründung: bestehende Installationen mit vielen Katalogeinträgen bekommen keinen ungefragten Zeitschub direkt nach dem Update.

## 5. Werkzeuge (`lib/tools.js`)

Die drei berechneten Felder (nicht `writable`, siehe unten) fließen in dieselben Objekt-Zusammenfassungen ein, die bereits `valueKind`/`valueKindUnknown` zurückgeben:

- `getPeriodTotal`/`comparePeriods`: Ergebnis bekommt zusätzlich `writePattern`, `updateFrequency`, `dataCompleteness` (analog zu `valueKind`/`valueKindUnknown` — fehlt ein Feld, wird `unknown` zurückgegeben statt es wegzulassen).
- `listCatalog`: liefert ohnehin die vollständigen Katalogeinträge, keine Änderung nötig — `writable` ist darüber bereits sichtbar.
- System-Prompt (`main.js`, beide Vorkommen) bekommt eine zusätzliche Instruktion: bei `dataCompleteness: gaps` oder `stale` soll die Unsicherheit in der Antwort benannt werden statt sie zu verschweigen; `writable: false` soll berücksichtigt werden, falls der Agent (in einer späteren Iteration) je Schreibaktionen vorschlägt.

`writable` wird bewusst **nicht** zusätzlich in die `getHistory`/`compareTimeframes`/`getPeriodTotal`/`comparePeriods`-Ergebnisse aufgenommen — diese Werkzeuge sind reine Lesepfade, für die Schreibbarkeit keine Rolle spielt; das Feld ist über `listCatalog` bereits erreichbar.

## 6. Frontend: Geräte-Tab (`src-admin/src/Components.jsx`)

Drei neue, **rein lesende** Spalten (kein Dropdown/Editierfeld wie bei `valueKind`): Schreibbar (✓/–), Update-Frequenz, Datenvollständigkeit. `CSV_COLUMNS` wird um `writable`, `writePattern`, `updateFrequency`, `dataCompleteness` erweitert; `CSV_EDITABLE_COLUMNS` bleibt unverändert (kein Import-Support für diese Felder, da rein berechnet — ein importierter Wert würde beim nächsten Backfill/Onboarding ohnehin überschrieben).

## 7. Fehlerbehandlung

- Fehlender oder nicht erreichbarer History-Zugriff während der Klassifizierung: wie bei `valueKindClassifier` — Fehler wird geloggt (`adapter.log.warn`/`error`), Objekt bleibt bei `unknown`, kein Abbruch des restlichen Batches.
- Zu wenige Datenpunkte auch nach dem letzten Eskalationsschritt (7 Tage): alle drei Felder bleiben `unknown`, kein Fehler.
- Einzelne Fehlschläge während des Backfills werden wie bei `backfillValueKinds` pro Objekt abgefangen und übersprungen.

## 8. Testkonzept

- Neues `test/unit/dataQualityClassifier.test.js`: `writable` aus `common.write`; `writePattern`-Erkennung auf synthetischen Zeitreihen (regelmäßiges Delta + gleicher Wert → `continuous`; unregelmäßiges Delta + wechselnde Werte → `on_change`; zu wenige Punkte → `unknown`); `updateFrequency`-Bucketing für alle Stufen; `dataCompleteness` für `continuous` (künstliche Riesenlücke → `gaps`, gleichmäßige Reihe → `complete`) und für `on_change` (aktuelle Stille deutlich über historischem Maximum → `stale`, normale Stille innerhalb des historischen Rahmens → `complete`, inkl. der 24h-Mindestschwelle bei wenigen historischen Ereignissen); Eskalationslogik (24h → 3d → 7d) mit gemocktem `getHistory`.
- Erweiterung `test/unit/onboarding.test.js`: neue Klassifizierung wird für neue Objekte aufgerufen und im Katalogeintrag gespeichert.
- Erweiterung `test/unit/main.test.js`: `backfillDataQuality` nur bei aktiviertem `enableDataQualityBackfill`, Batch-Deckelung, `unknown`-Einträge werden erneut versucht.
- Erweiterung `test/unit/tools.test.js`: `getPeriodTotal`/`comparePeriods` geben die drei Felder zurück, Fallback `unknown` bei fehlenden Werten.
- Kein automatisierter Test für die neuen Geräte-Tab-Spalten über das bestehende Maß hinaus (DOM-Rendering bleibt manueller Abnahmetest, wie beim Rest von `Components.jsx`).
- Manueller Abnahmetest an echter Instanz: ein kontinuierlich schreibendes Objekt (z. B. ein Shelly-Leistungswert) und ein on-change-Objekt (z. B. ein Fensterkontakt) prüfen, Backfill-Schalter ein/aus, CSV-Export enthält die neuen Spalten, Chat-Antwort benennt eine künstlich erzeugte Lücke.

## 9. Dokumentations-Auswirkungen

- [05-bausteinsicht.md](../architecture/05-bausteinsicht.md): neues Modul `lib/dataQualityClassifier.js` aufnehmen; `catalog.js`-, `tools.js`-, `onboarding.js`-Zeilen um die neuen Felder/Einhängung ergänzen.
- Neue ADR für die Entscheidung (statistische Zweiwege-Klassifizierung continuous/on-change statt einer einzigen naiven Lückenerkennung) — als eigener Task im Umsetzungsplan, analog zu ADR-0024.
- [CHANGELOG.md](../../CHANGELOG.md): Eintrag bei Fertigstellung.
- [01-einfuehrung-und-ziele.md §1.4](../architecture/01-einfuehrung-und-ziele.md): Punkt 15 nach Fertigstellung als (teilweise, siehe Nicht-Ziele) umgesetzt vermerken.

## Nicht-Ziele dieser Iteration

- Sicherheitsklasse und Synonyme (die übrigen zwei Felder aus Punkt 15 der Analyse) — eigene spätere Teilprojekte, siehe `docs/adr/backlog.md`.
- Ereignisraten-Berechnung für `on_change`-Objekte (z. B. "~3 Änderungen/Tag") — `event_driven` als fester Wert reicht für diese Iteration.
- Manuelles Override der drei Felder im Geräte-Tab — rein berechnet, wie bei `unit`.
- Periodische Neu-Berechnung außerhalb bestehender Sync-/Backfill-Trigger (kein neuer Scheduler) — `dataCompleteness` aktualisiert sich nur bei Re-Scan/Onboarding-Läufen, nicht in Echtzeit.
- Nutzung von `writable`/`dataCompleteness` für tatsächliche Schreibaktionen oder Alarmierung — das ist Gegenstand des noch offenen "sicheren Aktionsrahmens" (Punkt 13) bzw. der Alarm-Lebenszyklus-Iteration (P1, Punkt 2).
