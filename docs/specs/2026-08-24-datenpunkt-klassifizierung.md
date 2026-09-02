# Datenpunkt-Klassifizierung (`valueKind`) + typ-bewusste Auswertungs-Werkzeuge — Design

Status: Approved (Brainstorming abgeschlossen)
Datum: 2026-08-24
Löst einen live beobachteten Korrektheitsfehler: Für eine Ein-Tages-Frage rief der Agent `compareTimeframes` auf (zwei unnötige DB-Anfragen statt einer) und summierte die Rohwerte eines monoton steigenden Tageszählers (`sun2000.0.collected.dailyEnergyYield`) — Ergebnis: 624,97 kWh statt eines plausiblen Tageswerts. Baut auf dem `getHistory`-Truncation-Fix (v0.0.1-beta.9, siehe [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md)) auf, der das Datenverlust-Risiko bei rohen Abfragen behoben hat, aber nicht die falsche Aggregations-*Semantik*.

## Kontext

`getHistory`/`compareTimeframes` liefern rohe bzw. serverseitig gebündelte Messwerte; welche Rechenoperation (Durchschnitt, Summe, letzter Wert, Delta) für eine konkrete Frage richtig ist, muss die KI aktuell selbst aus dem Objektnamen erschließen — ohne verlässliche Grundlage. Das funktioniert für offensichtliche Fälle (Momentanwerte), scheitert aber bei Zählern: ein monoton steigender Tageszähler mit Mitternachts-Reset darf nicht summiert werden (Summe aller Messpunkte ist bedeutungslos), sondern nur der letzte/maximale Wert des Tages zählt. Ein Lebenszeit-Zähler (nie resettend) braucht stattdessen die Differenz zweier Ablesungen. Boolesche Schalter brauchen Zustandsdauer/Schaltzahl statt Durchschnitt. Diese Unterscheidung existiert nirgends im System — der Katalog kennt nur `category` (fachliche Domäne: consumption/generation_pv/lighting/device_usage/environment), keine Achse für das *Verhalten* der Werte.

Die Grunddaten: 05-bausteinsicht.md ↔ `lib/catalog.js` (Katalog-CRUD), `lib/onboarding.js` (LLM-Klassifikation neuer Objekte, batchweise), `lib/dataAccess.js` (History-Abruf, seit v0.0.1-beta.9 mit explizitem `count`), `lib/tools.js` (Werkzeug-Definitionen für den Agenten), `admin/tab.js` (Geräte-Tab-Tabelle).

## 1. Datenmodell (`lib/catalog.js`)

Katalogeinträge bekommen drei neue Felder:

| Feld | Typ | Werte | Bedeutung |
|---|---|---|---|
| `valueKind` | string | `gauge` \| `boolean_state` \| `daily_reset_counter` \| `cumulative_total` \| `event_count` | siehe Tabelle unten |
| `valueKindConfidence` | string | `high` \| `low` | analog zum bestehenden `confidence`-Feld; `low` macht den Eintrag im Geräte-Tab als prüfbedürftig sichtbar |
| `valueKindSource` | string | `metadata` \| `sampled` \| `manual` | woher die Klassifizierung stammt; `manual` verhindert, dass ein späterer automatischer Lauf eine Nutzer-Korrektur überschreibt |

Bedeutung der `valueKind`-Werte (bestimmt, welche Rechenoperation für "Wert im Zeitraum X" richtig ist, und was `getPeriodTotal`/`comparePeriods` aus Abschnitt 3 pro Periode zurückgeben):

| `valueKind` | Beispiel | Korrekte Periodenauswertung | Rückgabe pro Periode |
|---|---|---|---|
| `gauge` | Temperatur, aktuelle Leistung | Durchschnitt/Min/Max über den Zeitraum (nutzt `computeIntervalCount` aus `lib/dataAccess.js` für die Bucket-Anzahl) | `{avg, min, max}` |
| `boolean_state` | Schalter an/aus | Zustandsdauer/Schaltzahl aus Änderungspunkten (`aggregate='onchange'`) | `{onDurationMs, switchCount}` |
| `daily_reset_counter` | "heutiger Ertrag", Tageszähler mit Mitternachts-Reset | letzter/maximaler Wert **des jeweiligen Kalendertags** (`aggregate='minmax'`, 1 Bucket) | `{total}` |
| `cumulative_total` | Lebenszeit-Zähler ohne Reset | letzter Wert am Periodenende minus letzter Wert vor Periodenbeginn | `{total}` (= die Differenz) |
| `event_count` | Werte, die tatsächlich pro Intervall aufaddiert werden sollen | Summe der Intervallwerte (der einzige Fall, in dem die heutige `compareTimeframes`-Summenlogik korrekt ist) | `{total}` |

`comparePeriods` bettet pro Periode dieselbe Struktur ein und ergänzt `deltaTotal`/`deltaPercent` (bei `gauge` bezogen auf `avg`) zwischen aufeinanderfolgenden Perioden bzw. zur per `baselineIndex` markierten Basisperiode.

Fehlt `valueKind` (älterer Katalogeintrag vor diesem Feature, oder Objekt noch nicht klassifiziert), behandeln alle neuen Werkzeuge (Abschnitt 3) das Objekt wie `gauge` (sicherster Fehlerfall) und markieren die Antwort intern als unsicher.

## 2. Klassifizierung (`lib/valueKindClassifier.js`, neues Modul)

Zweistufig, wie mit dem Nutzer abgestimmt:

**Stufe 1 — deterministisch aus Metadaten** (kein API-Call):
- `common.type === 'boolean'` → `boolean_state`, `confidence: high`, fertig (keine Datenprobe nötig).
- Objekt-ID/Name/Rolle enthält Hinweise auf einen Tageswert (z. B. "heute", "today", "daily", "Tages") → Verdacht `daily_reset_counter`.
- Rolle deutet auf einen Zähler ohne Tagesbezug hin (z. B. `value.power.consumption` kombiniert mit "gesamt"/"total") → Verdacht `cumulative_total`.
- Sonst → Verdacht `gauge` (Default, da der sicherste Fehlerfall).

**Stufe 2 — Datenprobe zur Bestätigung** (nur für numerische, nicht bereits sicher als `boolean_state` klassifizierte Objekte): Abruf der jüngsten Historie über `getHistory` (nutzt bereits den `count`-sicheren Pfad aus v0.0.1-beta.9). Start: 48h Lookback. Reicht die Datenmenge nicht zur eindeutigen Mustererkennung (zu wenige Punkte, kein klares Verhalten), Eskalation auf 7 Tage → 30 Tage → 365 Tage; danach Abbruch.

Mustererkennung auf den Proben-Werten:
- Nur zwei verschiedene Werte im gesamten Fenster → `boolean_state` (überschreibt den Metadaten-Verdacht).
- Monoton nicht-fallend mit erkennbaren Resets nahe lokaler Mitternacht (Zeitzone aus `lib/promptContext.js`) → `daily_reset_counter`.
- Monoton nicht-fallend über das **gesamte** Beobachtungsfenster, keinerlei Reset erkennbar, UND das Fenster umfasst mindestens 5 Tage (Mindestspanne, um einen einfach noch nicht beobachteten täglichen Reset auszuschließen) → `cumulative_total`.
- Schwankt frei (steigt und fällt) → `gauge`.
- Bleibt es bis zur 365-Tage-Grenze uneindeutig (z. B. brandneues Objekt ohne Historie) → deterministischer Verdacht aus Stufe 1 bleibt stehen, `valueKindConfidence: low`.

`event_count` wird **nicht** automatisch erkannt (kein zuverlässiges Datenmuster dafür) — dieser Wert ist ausschließlich manuell im Geräte-Tab setzbar.

Ein echter LLM-Aufruf ist nur nötig, wenn Stufe 1+2 zusammen keine eindeutige Antwort liefern und eine Graufall-Bewertung durch das Modell sinnvoll erscheint (z. B. mehrdeutiger Name + mehrdeutiges Datenmuster) — nur dieser Fall zählt gegen `dailyTokenBudget`. Reine History-Abrufe zur Mustererkennung sind kostenlos.

## 3. Neue Werkzeuge (`lib/tools.js`)

Zwei neue, `valueKind`-bewusste Werkzeuge ergänzen (nicht ersetzen) `getHistory`/`compareTimeframes`:

- **`getPeriodTotal(sourceId, periods: [{start, end}])`**: pro angefragtem Zeitraum (typischerweise ein Kalendertag, lokale Zeitzone aus `promptContext.js`) wird abhängig von `valueKind` automatisch die richtige Operation gewählt (Tabelle in Abschnitt 1). Ersetzt das fehleranfällige Muster "rohe Werte abrufen, KI rechnet selbst".
- **`comparePeriods(sourceId, ranges: [{start, end}], baselineIndex?)`**: nutzt intern denselben typ-bewussten Wert wie `getPeriodTotal` pro Periode, liefert Differenz und Prozent zwischen den Perioden bzw. relativ zu einer als Basis markierten Periode (`baselineIndex`). Deckt "diese Woche vs. letzte Woche" und "Tage im Vergleich, ± % zum Basistag" ab.

System-Prompt (`main.js`, beide Vorkommen) bekommt eine zusätzliche Instruktion: `getPeriodTotal`/`comparePeriods` bevorzugen, sobald `valueKind` für das betroffene Objekt bekannt ist (aus `listCatalog`-Ergebnis ersichtlich); `getHistory`/`compareTimeframes` bleiben für Ad-hoc-Fragen ohne bekannten `valueKind` oder für rohe Zeitreihen-Darstellung verfügbar.

## 4. Einhängung in bestehende Abläufe (`main.js`, `lib/onboarding.js`)

- **Neue Objekte**: `runOnboarding` ruft nach der bestehenden Beschreibung/Kategorie-Klassifizierung zusätzlich `valueKindClassifier` für dieselben Objekte auf (gleicher Batch, kein zusätzlicher Discovery-Durchlauf).
- **Bestehende Objekte ohne `valueKind`**: `syncCatalog()` (in `main.js`, läuft bereits bei `onReady` **und** bei `runDiscoveryNow`/"Geräte neu einlesen") sammelt zusätzlich alle aktiven, nicht ignorierten Katalogeinträge ohne `valueKind` und schickt sie durch **nur** die `valueKindClassifier`-Klassifizierung (nicht die volle Onboarding-Klassifizierung — Beschreibung/Kategorie bleiben unangetastet). Läuft **nur**, wenn der neue Admin-Schalter `enableValueKindBackfill` aktiviert ist (siehe Abschnitt 6), gedeckelt auf `BATCH_SIZE` (20) Objekte pro Lauf — Rest folgt beim nächsten Neustart/Re-Scan.

## 5. Admin-Konfiguration (`admin/jsonConfig.json`)

Neues Feld, gleiches Muster wie das bestehende `silentIfNothingFound`:

```json
"enableValueKindBackfill": {
  "type": "checkbox",
  "label": "Bestehende Datenpunkte nachtraeglich auf Auspraegung (valueKind) pruefen",
  "default": false
}
```

Default **aus** — bestehende Installationen mit vielen Katalogeinträgen bekommen keinen ungefragten Kosten-/Zeitschub direkt nach dem Update.

## 6. Frontend: Geräte-Tab (`admin/tab.js`)

Zwei neue Spalten in der bestehenden Tabelle:
- **Verhalten**: Dropdown (`gauge`/`boolean_state`/`daily_reset_counter`/`cumulative_total`/`event_count`), editierbar wie das bestehende Kategorie-Dropdown. Speichern setzt `valueKindSource: 'manual'`.
- **Einheit**: reine Anzeige aus `common.unit` (kein Editierfeld — kommt zuverlässig aus den Objekt-Metadaten, im Unterschied zu den semantisch geratenen Feldern).

`updateCatalogEntryAdmin` (`lib/adminCommands.js`) wird um `valueKind` erweitert (gleiches Muster wie die kürzlich hinzugefügte `description`-Unterstützung).

## 7. Fehlerbehandlung

- Fehlt `valueKind` bei einem Objekt, das `getPeriodTotal`/`comparePeriods` anfragt (z. B. Backfill deaktiviert oder Klassifizierung noch nicht gelaufen): Werkzeug behandelt es als `gauge` (Durchschnitt/Min/Max) und liefert zusätzlich ein `valueKindUnknown: true`-Flag im Ergebnis, damit die KI die Unsicherheit in der Antwort kommunizieren kann, statt sie zu verschweigen.
- Datenprobe ohne jede Historie (brandneues Objekt): Klassifizierung bleibt beim deterministischen Verdacht mit `confidence: low`, kein Fehler, kein Blocker für den restlichen Sync-Lauf.
- Fehlschläge einzelner Objekte während des Backfills (z. B. History-Instanz nicht erreichbar) werden geloggt (`adapter.log.error`) und übersprungen, der Lauf für die übrigen Objekte im Batch läuft weiter — analog zum bestehenden Fehlerpfad in `runOnboarding`.

## 8. Testkonzept

- Unit-Tests für `lib/valueKindClassifier.js`: Mustererkennung (boolean/daily-reset/cumulative/gauge) auf synthetischen Zeitreihen, Eskalationslogik (48h → 7d → 30d → 365d) mit gemocktem `getHistory`, deterministische Metadaten-Vorklassifizierung.
- Unit-Tests für `getPeriodTotal`/`comparePeriods` in `lib/tools.js`: korrekte Operation pro `valueKind`, Fallback-Verhalten bei fehlendem `valueKind`.
- Unit-Tests für die `syncCatalog()`-Erweiterung: Backfill nur bei aktiviertem `enableValueKindBackfill`, `BATCH_SIZE`-Deckelung, `manual`-Quelle wird nicht überschrieben.
- Unit-Test für `updateCatalogEntryAdmin` mit `valueKind` (analog zum bestehenden `description`-Test).
- Kein automatisierter Test für die neue Geräte-Tab-Spalte über das bestehende Maß hinaus (DOM-Rendering bleibt manueller Abnahmetest, wie beim Rest von `admin/tab.js`).
- Manueller Abnahmetest an echter Instanz: Klassifizierung eines neuen Objekts jeder Art (boolean/Tageszähler/Lebenszeit-Zähler/Gauge), Backfill-Schalter ein/aus, manuelle Korrektur im Geräte-Tab, `getPeriodTotal`/`comparePeriods` im Chat gegen den ursprünglichen Bug-Fall (`sun2000.0.collected.dailyEnergyYield`, "gestern"/"diese Woche vs. letzte Woche").

## 9. Dokumentations-Auswirkungen

- [05-bausteinsicht.md](../architecture/05-bausteinsicht.md): neues Modul `lib/valueKindClassifier.js` aufnehmen; `catalog.js`-, `tools.js`-, `onboarding.js`-Zeilen um die neuen Felder/Werkzeuge/Einhängung ergänzen.
- [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md): den live beobachteten Bug-Fall (falsche Summe für `dailyEnergyYield`) als Ursache dokumentieren und bei Fertigstellung als gelöst markieren.
- Neue ADR nötig für die Klassifizierungs-Entscheidung (zweistufig deterministisch+Datenprobe statt reiner LLM-Klassifikation, Backfill standardmäßig deaktiviert) — wird im Umsetzungsplan als eigener Task geführt, analog zum Vorgehen beim Geräte-Tab-Feature (ADR-0020).
- [CHANGELOG.md](../../CHANGELOG.md): Eintrag bei Fertigstellung.

## Nicht-Ziele dieser Iteration

- Automatische Erkennung von `event_count` — bleibt manuell, da kein zuverlässiges Datenmuster dafür existiert.
- Rückwirkende Korrektur bereits im Chat gegebener falscher Antworten — nur die zukünftige Berechnung wird richtig.
- Multi-Objekt-Aggregation (z. B. "Summe aller PV-Wechselrichter") — eigenständiges Thema, hier nicht angefasst.
- Konfigurierbare Eskalationsstufen (48h/7d/30d/365d) — Werte sind vorerst fest im Code, keine Admin-Einstellung dafür in dieser Iteration.
