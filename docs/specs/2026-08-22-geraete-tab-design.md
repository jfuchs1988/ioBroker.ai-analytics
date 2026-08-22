# Geräte-Tab, Tab-Verbindungsfix, manuelle Trigger, Token-Budget-Anzeige — Design

Status: Approved (Brainstorming abgeschlossen)
Datum: 2026-08-22
Löst Backlog-Punkte [1, 12](../adr/backlog.md) auf, sowie die bekannte Lücke "Onboarding-Rückfragen sind nicht auflösbar" (siehe [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md)).

## Kontext

Der Nutzer will die erkannten (historisierten) Objekte im Admin-UI einsehen und verwalten können: Raum verschieben, ignorieren, entfernen, Re-Scan manuell auslösen — jede Aktion mit `silly`-Log-Eintrag zur Nachprüfbarkeit. Provider/Modell/API-Key sind bereits als Felder in `admin/jsonConfig.json` vorhanden, hier nicht verändert.

Der bestehende Custom-Admin-Tab (aktuell nur "Chat") ist laut Risiken-Doku bestätigt kaputt: er rendert, aber Nachrichten lassen sich nicht abschicken. Die offene Browser-Konsolen-Diagnose wurde nie geliefert. Da `io-package.json` pro Adapter nur **einen** `adminTab` (Singleton) erlaubt, kann die neue Geräte-Ansicht nicht als zweiter Tab existieren — sie wird Teil derselben Seite, mit interner Sub-Navigation. Ein belastbarer Verbindungsfix ist damit Voraussetzung für dieses gesamte Feature, nicht nur für den Chat.

## 1. Voraussetzung: Tab-Verbindungsfix

Vor der Umsetzung wird die Diagnose, die beim letzten Anlauf offen blieb, tatsächlich durchgeführt (Browser-Devtools an einer laufenden ioBroker-Admin-Instanz: `typeof parent.socket`, `typeof io`, tatsächliche Fehlermeldung beim Verbindungsversuch). Der bereits umgesetzte defensive Fallback (`parent.socket` → eigener `io.connect()` → sichtbarer Fehler) bleibt die Basis; die Diagnose bestätigt, welcher Pfad greift, oder deckt einen bisher unbekannten Fehler auf, der gezielt behoben wird. Kein blindes Rate-Fixing.

## 2. Tab-Struktur: Sub-Navigation

`io-package.json`s `adminTab.name` wechselt von `"Chat"` zu `"AI Analytics"`. `admin/tab.html`/`tab.js` bekommen eine einfache interne Navigation (z. B. zwei Pill-Buttons oben: "Chat", "Geräte") mit Client-seitigem Umschalten der sichtbaren Sektion — kein Routing-Framework, kein Reload. Die Verbindungsherstellung (`resolveConnection()`, `namespace`-Auflösung) wird einmal beim Laden ausgeführt und von beiden Sektionen geteilt.

Ein dritter, kleiner Bereich zeigt die Token-Budget-Anzeige (siehe Abschnitt 7) — entweder als eigene Pill oder als kompakte Kopfzeile über der Geräte-Tabelle; Detailentscheidung bleibt der Umsetzung überlassen.

## 3. Datenmodell-Änderungen

**`lib/catalog.js`:**
- Katalogeinträge bekommen ein neues Feld `ignored` (boolean, Default `false` bei neuen Einträgen).
- Neue Funktion `removeCatalogEntry(adapter, sourceId)`: löscht State und Objekt unter `catalog.<sourceId>` vollständig (harter Delete, kein Tombstone). Bleibt das Quellobjekt weiterhin historisiert, findet der nächste Re-Scan es erneut als "neu" und onboarded es neu — das ist der bewusst gewählte "Weg zurück".

**`lib/onboarding.js`:**
- Vor dem Klassifizieren wird `enum.rooms.*` einmal pro Onboarding-Lauf gelesen (`adapter.getForeignObjectsAsync('enum.rooms.*', 'enum')`), daraus eine Zuordnung `sourceId → Raumname` gebaut (Raumname = `common.name` des Enum-Objekts, z. B. "Wohnzimmer" aus `enum.rooms.wohnzimmer`, sofern das Quellobjekt in dessen `common.members` enthalten ist).
- Nach dem Parsen der LLM-Klassifizierung überschreibt ein gefundener Enum-Raum deterministisch das vom LLM geratene `room`-Feld. Ohne Enum-Treffer bleibt der bisherige namensbasierte LLM-Ratemechanismus unverändert.
- Das `room`-Feld bleibt danach in jedem Fall Freitext und über die Admin-Tabelle frei editierbar (kein Zwang, bei einem der gepflegten ioBroker-Räume zu bleiben).

## 4. Backend: neue Message-Commands (`main.js`)

Alle neuen Commands sind Teil des bestehenden `onMessage`-Handlers (analog zum bestehenden `chatQuestion`-Muster: `obj.command`, Antwort über `this.sendTo(obj.from, obj.command, result, obj.callback)`), vertrauenswürdiger Admin-Message-Bus (kein LLM dazwischen):

| Command | Eingabe | Wirkung | Antwort |
|---|---|---|---|
| `listCatalogEntries` | – | `getAllCatalogEntries` inkl. inaktiver/ignorierter Einträge (im Unterschied zum agenten-seitigen `listCatalog`-Tool, das filtert) | `{entries}` |
| `updateCatalogEntryAdmin` | `{sourceId, category?, room?, ignored?}` | Voller Schreibzugriff, **nicht** auf `needsReview`-Einträge beschränkt (im Unterschied zum LLM-Tool `updateCatalogEntry` aus [ADR-0017](../adr/0017-scoped-catalog-write-capability.md)); übernommene Felder werden gemerged, `needsReview` wird auf `false` gesetzt sobald `category` mitgeschickt wird, `lastSeen` wird aktualisiert | `{entry}` oder `{error}` |
| `removeCatalogEntry` | `{sourceId}` | ruft `removeCatalogEntry` aus `lib/catalog.js` | `{removed: true}` oder `{error}` |
| `runDiscoveryNow` | – | ruft `this.syncCatalog()` direkt auf (derselbe Pfad wie beim Adapterstart), wartet den Lauf ab | `{foundCount, newCount, reactivatedCount}` |
| `runProactiveCheckNow` | – | ruft `this.runProactiveCheck()` fire-and-forget auf (nicht abgewartet, da LLM-Lauf dauern kann); Ergebnis erscheint wie gewohnt als Chat-Nachricht in `chat.history`, sobald fertig | `{triggered: true}` sofort |

`syncCatalog()` wird minimal erweitert, um die Zählwerte (`newCount`, `reactivatedCount`) zurückzugeben statt sie zu verwerfen — reine Rückgabewert-Ergänzung, keine Verhaltensänderung.

## 5. Agenten-Sichtbarkeit (`lib/tools.js`)

`listCatalog` (das Tool, das der Chat-/Proaktiv-Agent sieht) filtert zusätzlich `ignored`-Einträge heraus, analog zur bestehenden `active`/`needsReview`-Filterung:
```js
return filtered.filter((entry) => entry.active !== false && !entry.needsReview && !entry.ignored);
```
`getHistory`/`compareTimeframes` bleiben unverändert (kein zusätzlicher Guard) — konsistent damit, dass auch `needsReview`-Objekte dort heute nicht separat blockiert werden; der Schutz entsteht dadurch, dass der Agent das Objekt über `listCatalog` gar nicht erst zu sehen bekommt.

## 6. Frontend: Geräte-Ansicht

Tabelle mit einer Zeile pro Katalogeintrag (`listCatalogEntries` beim Öffnen der Sektion geladen):

- Spalten: Objekt-ID (`sourceId`), Beschreibung, Kategorie (Dropdown, `CATEGORIES`), Raum (Text-Input), Status (aktiv/inaktiv/ignoriert als Badge), needsReview-Hinweis (Badge, falls `true`).
- Pro Zeile: "Speichern" (sendet `updateCatalogEntryAdmin` mit den editierten Feldern), "Ignorieren"/"Aktivieren" (Toggle-Button, sendet `updateCatalogEntryAdmin` mit `ignored`), "Entfernen" (sendet `removeCatalogEntry`, danach Zeile aus der Tabelle entfernen).
- Inaktive Einträge (`active: false`) werden ausgegraut angezeigt, bleiben aber bearbeitbar/entfernbar.
- Client-seitiges Filter/Such-Feld über die bereits geladene Liste (Kategorie, Raum, needsReview, aktiv/inaktiv) — keine zusätzliche Backend-Anfrage, reine Array-Filterung im Browser.
- Zwei Buttons oberhalb der Tabelle: "Geräte neu einlesen" (→ `runDiscoveryNow`, danach Tabelle neu laden, kurze Erfolgsmeldung mit den Zählwerten) und "Prüfung jetzt ausführen" (→ `runProactiveCheckNow`, kurzer Hinweis "Prüfung gestartet, Ergebnis erscheint im Chat").

## 7. Frontend: Token-Budget-Anzeige

Rein lesend, kein neuer Backend-Command nötig — analog zu `tab.js`s bestehendem Muster (`socket.emit('getState', ...)`):
- `socket.emit('getState', '<namespace>.usage.today', cb)` liefert `{date, tokensToday}`.
- `socket.emit('getObject', 'system.adapter.<namespace>', cb)` liefert `native.dailyTokenBudget`.
- Anzeige: "Heute genutzt: X Tokens" bzw. "X / Y Tokens (Budget)" falls ein Budget gesetzt ist (`> 0`), sonst "kein Limit".

## 8. Logging

Jede der oben genannten Backend-Aktionen loggt via `adapter.log.silly` vor/nach der Wirkung, konsistent zum bestehenden Muster in `main.js`/`lib/*`:
- `Admin: Katalogeintrag aktualisiert: <sourceId> -> category=..., room=..., ignored=...`
- `Admin: Katalogeintrag entfernt: <sourceId>`
- `Admin: manueller Re-Scan gestartet` / `... beendet: N neu, M reaktiviert`
- `Admin: manuelle proaktive Pruefung ausgeloest`

Keine API-Keys/Auth-Header, keine vollständigen LLM-Antworten in diesen neuen Log-Zeilen (nur IDs/Kurzwerte), konsistent mit der bestehenden Logging-Konvention.

## 9. Fehlerbehandlung

- Unbekannte `sourceId` bei `updateCatalogEntryAdmin`/`removeCatalogEntry`: `{error: 'Unbekanntes Objekt: <sourceId>'}` statt Absturz, analog zum bestehenden `findCatalogEntry`-Fehlerpfad in `tools.js`.
- `runDiscoveryNow`/`runProactiveCheckNow` während bereits ein Lauf aktiv ist: kein zusätzlicher Lock in dieser Iteration (Race Cases sind selten bei manueller Bedienung durch einen einzelnen Admin-Nutzer) — bewusst einfach gehalten, kein Blocker.
- Frontend zeigt Backend-`{error}`-Antworten inline an der jeweiligen Zeile/dem jeweiligen Button an, kein globaler Fehlerdialog.

## 10. Testkonzept

- Unit-Tests für `catalog.js` (`removeCatalogEntry`), `onboarding.js` (Enum-Raum-Override, mit gemocktem `getForeignObjectsAsync`), `tools.js` (`listCatalog` filtert `ignored`).
- Unit-Tests für die neuen `main.js`-Message-Commands mit gemocktem Adapter (Erfolg + Fehlerpfad je Command), analog zum bestehenden `chatQuestion`-Testmuster, sofern vorhanden — sonst neu angelegt (schließt teilweise auch die bekannte Lücke fehlender `main.js`-Testabdeckung für den betroffenen Teil).
- Kein automatisierter Test für `admin/tab.js`-Frontend-Logik über das bereits bestehende Maß hinaus (bleibt manueller Abnahmetest, siehe bekannte Lücke in [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md)).
- Manueller Abnahmetest an echter Instanz: Verbindungsdiagnose (Abschnitt 1), Raum ändern, ignorieren/aktivieren, entfernen + Re-Scan-Bestätigung dass es zurückkommt, beide manuellen Trigger, Budget-Anzeige.

## 11. Dokumentations-Auswirkungen

- [05-bausteinsicht.md](../architecture/05-bausteinsicht.md): `catalog.js`-Schnittstelle um `removeCatalogEntry` ergänzen, `onboarding.js`-Beschreibung um Enum-Raum-Override ergänzen, `admin/`-Zeile um Sub-Navigation/Geräte-Ansicht ergänzen.
- [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md): Punkte "Admin-Chat-Tab bestätigt defekt", "Onboarding-Rückfragen nicht auflösbar" und "Kein manueller Re-Discovery-Trigger" als gelöst markieren/entfernen, sofern die manuelle Abnahme das bestätigt.
- [backlog.md](../adr/backlog.md): Punkte 1 und 12 entfernen (durch dieses Feature aufgelöst).
- Neue ADR nötig für den erweiterten Schreibzugriff (`updateCatalogEntryAdmin` mit vollem Zugriff statt nur `needsReview`) — Erweiterung/Nachfolger von [ADR-0017](../adr/0017-scoped-catalog-write-capability.md), da dieser Pfad bewusst *nicht* durch das LLM geht, sondern ein direkter Admin-Bus-Zugriff ist. Wird im Umsetzungsplan als eigener Task geführt.

## Nicht-Ziele dieser Iteration

- Bulk-Aktionen (Mehrfachauswahl) in der Geräte-Tabelle — separater Folge-Punkt, kein unmittelbarer Bedarf erkennbar.
- Raum als `enum.rooms`-Dropdown in der Tabelle selbst — Enum wird nur beim Erst-Onboarding als Hinweis genutzt (Abschnitt 3), Editier-UI bleibt Freitext.
- Katalog-Export/Import (Backup/Restore) — eigenständiges Thema, Backlog-Punkt 10, eigener Spec bei Bedarf.
- Dedupliziertes Ausfall-Reporting, Katalog-Vorfilterung bei sehr großen Installationen, CI/Linting — unverändert bestehende Backlog-Punkte, hier nicht angefasst.
