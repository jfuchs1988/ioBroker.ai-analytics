# Geräteliste-Redesign: fehlende Analyse-Rollen, Sortierung, Bulk-Edit — Design

Status: Approved (Brainstorming abgeschlossen)
Datum: 2026-09-05
Löst den in [2026-08-22-geraete-tab-design.md](2026-08-22-geraete-tab-design.md#nicht-ziele-dieser-iteration)
zurückgestellten Punkt "Bulk-Aktionen (Mehrfachauswahl)" sowie zwei seither neu
entstandene Lücken auf: die Analyse-Rollenfelder der Korrelations-Features
([2026-09-05-energie-korrelation-energiebilanz.md](2026-09-05-energie-korrelation-energiebilanz.md),
[2026-09-05-hvac-korrelation-fenster-heizung.md](2026-09-05-hvac-korrelation-fenster-heizung.md))
sind nur per CSV-Export/Import setzbar, und das bestehende
Auswahl-Checkbox/Speichern-Modell ist funktional irreführend.

## Kontext

Seit den letzten Ausbaustufen (Energiebilanz-Korrelation, HVAC-Korrelation,
abgeleitete Kennzahlen) hängen mehrere Analysefunktionen von Katalogfeldern
ab, die die Geräte-Tabelle im Admin-UI (`src-admin/src/Components.jsx`,
`CatalogDevicesComponent`) nicht als Eingabesteuerung anbietet:
`derivedMetricRole`, `derivedMetricGroupId` (Energiebilanz) und `hvacRole`
(Fenster/Heizung). Backend (`lib/catalog.js`, `lib/adminCommands.js`) unterstützt
alle drei vollständig; der einzige Weg, sie zu setzen, ist CSV-Export,
Bearbeitung außerhalb des Adapters und Re-Import. Zusätzlich fehlt jede
Spaltensortierung (nur ein Volltext-Filter existiert).

Eine zweite, unabhängig gemeldete Lücke betrifft das bestehende
Editier-Modell: Checkboxen pro Zeile sind zwar technisch mit einer Aktion
verknüpft (`saveSelected`), aber der Zusammenhang ist nicht ersichtlich.
Klicks auf "Ignorieren"/"Aktivieren" ändern nur einen internen Entwurf
(`draft`) und wirken erst, wenn zusätzlich die Checkbox gesetzt und oben auf
"Auswahl speichern" geklickt wird. Unmarkierte Zeilenänderungen gehen beim
Verlassen der Seite stillschweigend verloren. Der CSV-Import speichert davon
abweichend sofort pro Zeile — zwei inkonsistente Speicherpfade auf derselben
Seite.

Dieses Spec behebt beides in einem Aufwasch, da die Bulk-Edit-Anforderung
(mehrere Einträge gleichzeitig anpassen) ohnehin ein neues, klares
Interaktionsmodell für Checkbox-Auswahl braucht.

## 1. Speicherlogik: sofortiges Speichern statt Entwurf+Auswahl

Der bestehende Entwurf-State (`state.drafts`) entfällt vollständig. Jede
Feldänderung in einer Zeile ruft sofort `updateCatalogEntryAdmin` auf:

- Dropdowns (Kategorie, Verhalten, Update-Frequenz, Vollständigkeit,
  Energie-Rolle, HVAC-Rolle) speichern per `onChange`.
- Textfelder (Beschreibung, Raum, neue Gruppen-ID) speichern per `onBlur`
  bzw. Enter-Taste, nicht pro Tastenanschlag.
- Erfolg/Fehler wird inline an der jeweiligen Zeile angezeigt (kurzer Text
  unter dem Feld, verschwindet nach ca. 3s oder bei nächster Änderung),
  kein globaler Status-Text mehr für Einzeländerungen.
- "Ignorieren"/"Aktivieren" und "Entfernen" bleiben Sofort-Aktionen wie
  heute (Entfernen erforderte schon immer keine Auswahl).

Checkboxen verlieren damit ihre bisherige Doppelbedeutung
(Persistenz-Gate) und dienen ab sofort ausschließlich der neuen
Bulk-Toolbar (Abschnitt 3). CSV-Import bleibt unverändert (war bereits
Sofort-Speichern) und ist damit erstmals konsistent mit dem Rest der Seite.

## 2. Analyse-Rollen: aufklappbares Detail-Panel statt weiterer Spalten

Die Haupttabelle hat bereits 10 Spalten; mit den drei fehlenden
Rollenfeldern wären es 13+. Statt die Tabelle weiter zu verbreitern, bekommt
jede Zeile einen Aufklapp-Umschalter (▸/▾) vor der Checkbox. Das Detail-Panel
zeigt und editiert:

- **Energie-Rolle** (`derivedMetricRole`, Dropdown der sechs bekannten Werte
  + "keine") und **Energiebilanz-Gruppe** (`derivedMetricGroupId`, siehe
  `GroupIdPicker` in Abschnitt 4) — beide zusammen sichtbar, da laut
  `lib/catalog.js` nur gemeinsam gültig.
- **HVAC-Rolle** (`hvacRole`, Dropdown `window`/`heating`/"keine") — nur
  aktivierbar, wenn `valueKind` der Zeile `boolean_state` ist (Frontend
  deaktiviert das Feld sonst mit Tooltip-Hinweis, Backend validiert
  ohnehin serverseitig in `lib/catalog.js`/`adminCommands.js`).
- Update-Frequenz und Vollständigkeit wandern ebenfalls ins Detail-Panel
  (aktuell Spalten in der Haupttabelle) — reine Umsortierung, keine
  Verhaltensänderung dieser beiden Felder.

**Zurücksetzen auf "keine":** Weder `lib/adminCommands.js` noch der
bestehende CSV-Import können `derivedMetricRole`/`derivedMetricGroupId`/
`hvacRole` aktuell wieder löschen (ein einmal gesetztes Feld bleibt
bestehen; leere CSV-Zellen werden beim Import stillschweigend übersprungen).
Damit die "keine"-Option tatsächlich wirkt, bekommt
`updateCatalogEntryAdminUnlocked` einen Lösch-Sentinel: der leere String
`''` bedeutet ab jetzt "Feld entfernen" (statt "nicht ändern", was weiterhin
`undefined` bedeutet). `derivedMetricRole: ''` löscht `derivedMetricRole`
**und** `derivedMetricGroupId` zusammen (die UI schickt beim Zurücksetzen
kein `derivedMetricGroupId` mehr mit); `hvacRole: ''` löscht nur `hvacRole`.
`validateCatalogUpdate` überspringt für den Sentinel-Wert die
Enum-/Paar-Prüfung. `lib/catalog.js`s `validateCatalogEntry` braucht dafür
keine Änderung, da ein Eintrag ohne diese Schlüssel bereits heute gültig
ist. CSV-Import bleibt bewusst unverändert (Nicht-Ziel, siehe unten) — der
Sentinel ist nur über die neuen Dropdowns erreichbar.

Haupttabelle behält: Auswahl, Objekt-ID, Beschreibung, Kategorie, Verhalten,
Einheit, Schreibbar, Raum, Status, Aktionen — plus die neue Sortierung
(Abschnitt 5).

## 3. Bulk-Edit-Toolbar

Erscheint oberhalb der Tabelle, sobald `state.selected.length > 0`, ersetzt
den heutigen "Auswahl speichern"-Button:

- **Feld + Wert setzen**: Auswahl-Dropdown für eines der Felder Kategorie,
  Raum, Verhalten, Update-Frequenz, Vollständigkeit, Energie-Rolle
  (+ Gruppen-ID-Picker daneben, wenn Energie-Rolle gewählt wurde), HVAC-Rolle
  — dann Werteingabe passend zum Feldtyp, dann Button "Auf N ausgewählte
  Geräte anwenden". Ruft `updateCatalogEntryAdmin` für jede `sourceId` in
  `state.selected` mit demselben Wert auf, sequenziell wie im bestehenden
  `saveSelected`-Muster.
- **Ignorieren / Aktivieren / Löschen**: drei Buttons, wirken direkt auf die
  gesamte Auswahl (kein zusätzlicher Wert nötig). Löschen fragt einmal
  `window.confirm` mit der Anzahl betroffener Geräte (nicht pro Gerät).
- Nach jeder Bulk-Aktion: Sammel-Statusmeldung "N gespeichert, M
  fehlgeschlagen" (analog zum bestehenden `saveSelected`); fehlgeschlagene
  `sourceId`s bleiben ausgewählt, erfolgreiche werden abgewählt.

Kein neuer Backend-Command nötig — `updateCatalogEntryAdmin` und
`removeCatalogEntry` unterstützen bereits alle beteiligten Felder (inkl. des
neuen Lösch-Sentinels aus Abschnitt 2 für die "keine"-Fälle).

## 4. Gruppen-Auswahl (`derivedMetricGroupId`)

`derivedMetricGroupId` ist Freitext, muss aber zwischen den Geräten einer
Energiebilanz-Gruppe exakt übereinstimmen (z. B. PV-Erzeugung und
Netzeinspeisung derselben Anlage). Ein neues `GroupIdPicker`-Element ersetzt
das bisherige (in der Tabelle noch gar nicht vorhandene) Freitextfeld:

- Dropdown mit allen `derivedMetricGroupId`-Werten, die aktuell im geladenen
  `state.entries` vorkommen (Client-seitig aus der bereits geladenen Liste
  abgeleitet, keine neue Backend-Anfrage).
- Letzter Eintrag immer "Neue Gruppe …" — öffnet ein Textfeld für eine neue
  ID (gleiche Validierung wie heute serverseitig: Pflichtfeld, max. 128
  Zeichen, keine Steuerzeichen).
- Wird sowohl im Detail-Panel (Abschnitt 2) als auch im Bulk-Panel
  (Abschnitt 3) verwendet — eine Komponente, zwei Einsatzorte.

## 5. Sortierung

Die Kernspalten-Header (Objekt-ID, Beschreibung, Kategorie, Verhalten, Raum,
Status) werden klickbar: erster Klick sortiert aufsteigend, zweiter Klick
absteigend, dritter Klick hebt die Sortierung auf (zurück zur
Ladereihenfolge). Rein Client-seitig auf der bereits gefilterten Liste,
analog zum bestehenden Text-Filter — keine Backend-Änderung. Sortierung und
Filter kombinieren sich (Filter zuerst, dann Sortierung auf das gefilterte
Ergebnis).

## 6. Komponentenaufbau

`CatalogDevicesComponent` wird aus `Components.jsx` in einen eigenen Ordner
extrahiert, um die wachsende Feldmenge testbar zu halten (bisher eine
635-Zeilen-Datei mit allen Admin-Komponenten):

- `src-admin/src/CatalogDevices/CatalogDevicesComponent.jsx` — Orchestrierung:
  Laden/Speichern über die Bridge (`callAdapter`), Auswahl-State, kombinierte
  Sortierung/Filterung, Bulk-Toolbar-Einbindung.
- `src-admin/src/CatalogDevices/DeviceRow.jsx` — eine Tabellenzeile inkl.
  Detail-Panel-Toggle und Sofort-Speichern pro Feld.
- `src-admin/src/CatalogDevices/BulkEditToolbar.jsx` — Abschnitt 3.
- `src-admin/src/CatalogDevices/GroupIdPicker.jsx` — Abschnitt 4.
- `src-admin/src/CatalogDevices/catalogTableUtils.js` — reine Funktionen für
  Sortierung/Filterung (ohne React-Abhängigkeit, isoliert testbar).
- CSV-Helfer (`csvEscape`, `parseCsv`, `normalizeHeader`, `validateFile`,
  `parseBoolean`, `validateCatalogImportValue`) bleiben unverändert in
  `Components.jsx` bzw. wandern unverändert mit, falls sich das Modul dabei
  aufräumen lässt — keine Verhaltensänderung an CSV-Import/-Export in dieser
  Iteration.
- `Components.jsx` re-exportiert `CatalogDevicesComponent` aus dem neuen
  Ordner; `Components.js` (Module-Federation-Barrel) bleibt unverändert.

## 7. Fehlerbehandlung

- Einzel-Speicherung: Fehler wird inline an der Zeile angezeigt (siehe
  Abschnitt 1), Feldwert bleibt auf dem zuletzt eingegebenen (nicht editierten)
  Wert stehen, kein automatisches Zurücksetzen auf den Serverstand nötig, da
  kein Entwurf-State mehr existiert, der divergieren könnte.
- Bulk-Aktionen: Sammel-Statusmeldung + fehlgeschlagene bleiben ausgewählt
  (Abschnitt 3), analog zum bestehenden `saveSelected`-Fehlerpfad.
- HVAC-Rolle bei falschem `valueKind`: Frontend verhindert die Eingabe
  präventiv (deaktiviertes Dropdown mit Hinweistext), Backend-Validierung in
  `lib/catalog.js`/`lib/adminCommands.js` bleibt zusätzlich als Schutz
  bestehen (keine Änderung an der bestehenden Validierung nötig).

## 8. Testkonzept

Erweiterung von `test/unit/adminCommands.test.js` (Mocha):

- Lösch-Sentinel `derivedMetricRole: ''` entfernt `derivedMetricRole` und
  `derivedMetricGroupId` aus dem gespeicherten Eintrag.
- Lösch-Sentinel `hvacRole: ''` entfernt nur `hvacRole`, lässt `valueKind`
  unverändert und prüft in diesem Fall nicht auf `boolean_state`.
- Bestehende Enum-/Paar-Validierung bleibt für alle Nicht-Sentinel-Werte
  unverändert (Regressionstest).

Neue Vitest-Dateien unter `test/admin/`:

- `catalogTableUtils.test.js` — Sortierung (auf/ab/zurücksetzen je Spalte),
  Filterung, Kombination beider.
- `deviceRow.test.jsx` — Sofort-Speichern bei Dropdown-`onChange` und
  Text-`onBlur`, Fehlerpfad-Anzeige, Detail-Panel-Toggle, HVAC-Rolle-Sperre
  bei falschem `valueKind`.
- `bulkEditToolbar.test.jsx` — Wert auf Auswahl anwenden (Erfolg und
  Teilfehlschlag), Ignorieren/Aktivieren/Löschen für Auswahl,
  Confirm-Dialog vor Löschen.
- `groupIdPicker.test.jsx` — bestehende Gruppen aus Einträgen ableiten, neue
  Gruppe anlegen, Validierungsfehler (leer, zu lang) anzeigen.

Kein Playwright-/Browser-E2E (bekannte Grenze, siehe
[docs/agents/testing.md](../agents/testing.md)) — manuelle Live-Abnahme
ergänzt den automatisierten Test analog zum Vorgehen in
[2026-08-22-geraete-tab-design.md](2026-08-22-geraete-tab-design.md#10-testkonzept):
Sortierung je Spalte, Detail-Panel öffnen/schließen, Bulk-Wert setzen für
mehrere Geräte, Bulk-Ignorieren/Löschen, neue Energiebilanz-Gruppe über den
Picker anlegen.

## 9. Dokumentations-Auswirkungen

- [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md):
  neuer gelöster Punkt "Analyse-Rollenfelder (Energie-/HVAC-Korrelation) nur
  per CSV setzbar" sowie "Checkbox/Speichern-Modell der Geräteliste war
  irreführend", beide mit Verweis auf dieses Spec, sobald umgesetzt.
- [05-bausteinsicht.md](../architecture/05-bausteinsicht.md): Eintrag zu
  `src-admin/`/Geräte-Ansicht um den neuen `CatalogDevices/`-Ordner und die
  Sofort-Speichern-Logik ergänzen.
- Kein neues ADR nötig: Der Schreibzugriff selbst (`updateCatalogEntryAdmin`,
  voller Admin-Bus-Zugriff) ist bereits durch
  [ADR-0020](../adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md)
  abgedeckt; dieses Spec ändert nur, welche Felder die UI anbietet und wie sie
  gespeichert werden, nicht die Zugriffsgrenze selbst.

## Nicht-Ziele dieser Iteration

- Serverseitige Sortierung/Pagination bei sehr großen Installationen — bleibt
  Client-seitige Sortierung/Filterung auf der vollständig geladenen Liste,
  konsistent mit dem bestehenden Backlog-Punkt "Katalog-Vorfilterung bei sehr
  großen Installationen" (siehe
  [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md)).
- Gruppierte/eingeklappte Darstellung nach Raum oder Kategorie — das
  aufklappbare Detail-Panel (Abschnitt 2) löst das eigentliche Platzproblem;
  eine zusätzliche Raum-Gruppierung wäre ein separater, unabhängiger Schritt.
- Undo/Revert für bereits gespeicherte Einzeländerungen — Sofort-Speichern
  bedeutet bewusst kein Zwischenzustand; ein Revert müsste den vorherigen
  Katalogwert kennen, den der Client nach dem Speichern nicht mehr vorhält.
- Änderungen an CSV-Import/-Export selbst (Format, Spalten) — bleibt
  unverändert, war bereits konsistent mit dem neuen Sofort-Speichern-Modell.
