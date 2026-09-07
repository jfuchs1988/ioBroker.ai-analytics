# Energiebilanz — signierte Datenpunkte und KI-gestützte Rollenzuweisung

Status: Approved for implementation
Datum: 2026-09-07
Vorgänger: [Energie-Korrelation — Energiebilanz-Anomalie](2026-09-05-energie-korrelation-energiebilanz.md)

## Ziel

Reale Wechselrichter-/Speicher-Hardware (Recherche am Beispiel Huawei SUN2000,
siehe unten) liefert Energiewerte in unterschiedlicher Form: getrennte
Lifetime-Zähler pro Richtung (z. B. `totalCharge`/`totalDischarge`), aber auch
signierte Momentanleistungswerte (z. B. Netz-/Batterieleistung, positiv/negativ
je nach Richtung). Das bestehende Energiebilanz-Modell
(`docs/specs/2026-09-05-energie-korrelation-energiebilanz.md`) geht implizit
von Zähler-artigen Werten aus, prüft das aber nicht — eine versehentliche
Rollenzuweisung an einen signierten Leistungswert führt heute zu einem
stillen `NaN` im Bilanz-Residuum. Dieses Spec schließt diese Lücke, ergänzt
zwei neue Rollen für Spitzenlast-Auswertung, und lässt das KI-Onboarding
passende Rollen vorschlagen, statt sie ausschließlich manuell im Geräte-Tab
zu pflegen.

## Recherche-Hintergrund (informativ, kein Implementierungsdetail)

Huawei SUN2000 (Modbus, `ioBroker.sun2000`) liefert für Netz und Batterie
jeweils beides parallel:

- Getrennte, unsignierte Lifetime-Zähler: Netz-Einspeisung/-Bezug
  (`H:37119`/`H:37121`), Batterie `totalCharge`/`totalDischarge`
  (`H:37066`/`H:37068`) — passen direkt in die bestehenden vier Rollen
  (`grid_import`, `grid_feed_in`, `battery_charge`, `battery_discharge`).
- Ein signiertes Momentanleistungsregister je Richtung (Netz `H:37113`,
  Batterie `H:37765`) — `gauge`, kein Zähler, positiv/negativ je nach
  Richtung.

Eine echte Tagesenergie aus dem signierten Leistungswert zu integrieren
(Watt × Zeit), wurde bewusst **verworfen**: Bei lückenhaftem oder
unregelmäßigem Logging verzerrt eine Integration die Tagessumme systematisch,
und genau diese Tagessummen fließen in die Bilanz-Anomalieerkennung ein —
eine ungenaue Eingabe dort produziert Fehlalarme. Zähler-Deltas
(Ende−Anfang, wie im bestehenden `cumulative_total`) sind robust gegen
Logging-Lücken, weil die Aufsummierung schon im Gerät passiert ist.

## A) Validierungssperre: Bilanz-Rollen erfordern zähler-artigen `valueKind`

`validateCatalogEntry` (`lib/catalog.js`) und `validateCatalogUpdate`
(`lib/adminCommands.js`) prüfen zusätzlich: Ist `derivedMetricRole` eine der
sechs Bilanz-Rollen (`pv_generation`, `grid_import`, `grid_feed_in`,
`consumption`, `battery_charge`, `battery_discharge`), muss `valueKind`
`'daily_reset_counter'` oder `'cumulative_total'` sein (`event_count` bleibt
weiterhin ausgeschlossen, wie schon in der Sub-A-Spec für
`pv_generation`/`grid_feed_in` festgelegt). Sonst: Fehler, Katalogeintrag wird
nicht gespeichert (analog zur bestehenden `hvacRole`-Prüfung, die
`valueKind: 'boolean_state'` verlangt).

Betrifft nur die sechs Bilanz-Rollen — `grid_power`/`battery_power` (siehe
B) haben die entgegengesetzte Anforderung.

## B) Neue Rollen `grid_power`/`battery_power` für Spitzenlast-Auswertung

Zwei neue Werte in `DERIVED_METRIC_ROLES`: `grid_power`, `battery_power`.
Nur gültig für `valueKind: 'gauge'` (Gegenstück zu A). **Kein** Bestandteil
von `REQUIRED_ROLES`/`BATTERY_ROLES` in `lib/energyBalance.js` — die
Bilanz-Residuum-Berechnung bleibt unverändert, diese zwei Rollen laufen
lediglich unter derselben `derivedMetricGroupId` mit, ohne von
`resolveGroupRoles` nachgeschlagen zu werden.

Neues optionales Feld `derivedMetricInverted` (boolean), nur zusammen mit
`derivedMetricRole: 'grid_power'` oder `'battery_power'` gültig (sonst
Fehler, analog zur `derivedMetricRole`/`derivedMetricGroupId`-Kopplung).
Legt die Vorzeichen-Konvention fest:

- `grid_power`, `derivedMetricInverted: false` (Standard): positiv = Bezug,
  negativ = Einspeisung.
- `battery_power`, `derivedMetricInverted: false` (Standard): positiv =
  Laden, negativ = Entladen.
- `derivedMetricInverted: true` kehrt die jeweilige Konvention um (für
  Hardware/Verdrahtung mit umgekehrtem Vorzeichen).

Kein neuer Berechnungscode: `getPeriodTotal`/`compareTimeframes`
(`lib/tools.js`) liefern für `valueKind: 'gauge'` bereits `avg`/`min`/`max`
pro angefragtem Zeitraum — `min`/`max` eines signierten Werts sind bereits
die Spitzenlast in beide Richtungen. Die neue Rolle dient ausschließlich der
Auffindbarkeit (die KI kann im Katalog gezielt nach `grid_power`/
`battery_power` einer Gruppe suchen), nicht der Berechnung. Der
Systemprompt (`main.js`) bekommt einen kurzen Hinweis, wie `min`/`max` bei
diesen zwei Rollen unter Berücksichtigung von `derivedMetricInverted` zu
benennen sind (z. B. „Spitzenbezug" vs. „Spitzeneinspeisung").

## C) KI-Onboarding schlägt Rollen vor

### Adapter-Instanz-Batching

`adapterTypeOf` in `lib/onboarding.js` wechselt von Adapter-**Typ**
(`sourceId.split('.')[0]`, z. B. `sun2000`) auf Adapter-**Instanz**
(`sourceId.split('.').slice(0, 2).join('.')`, z. B. `sun2000.0`). Betrifft
nur die Batch-Gruppierung (`buildBatches`) und die neue
`derivedMetricGroupId`-Ableitung (siehe unten) — die Batch-Größe
(`BATCH_SIZE = 20`) bleibt unverändert; überschreitet eine Instanz die
Batch-Größe, wird weiterhin in mehrere Batches gesplittet (unkritisch, siehe
Erfolgskriterien).

### Prompt-Erweiterung

`buildClassificationPrompt` fragt zusätzlich zu `category` optional
`derivedMetricRole` (alle acht Werte: die sechs Bilanz-Rollen plus
`grid_power`/`battery_power`, oder `null`) und `hvacRole` (`window`/
`heating`, oder `null`) ab — Sprachverständnis über `sourceId`/`name`/`role`/
`unit` des jeweiligen Objekts, keine hartkodierte Adapter-Erkennung im Code
(erlaubte Ausnahme von der verbindlichen Regel in
`docs/architecture/11-risiken-und-schulden.md:7-15`, dort ausdrücklich als
„KI-Onboarding" vorgesehen).

`derivedMetricGroupId` wird **nicht** von der KI vorgeschlagen, sondern vom
Code deterministisch aus der Adapter-Instanz-Kennung gesetzt (z. B.
`sun2000.0`), sobald mindestens ein Objekt der Instanz eine der acht Rollen
zugewiesen bekommt. Verhindert erfundene/inkonsistente Gruppen-IDs und stellt
sicher, dass alle Objekte einer Installation dieselbe Gruppe erhalten, auch
über mehrere Batches hinweg.

### Validierung vor dem Schreiben (Robustheit)

`runOnboarding` prüft die von der KI vorgeschlagene Rollen-/`valueKind`-
Kombination (Ergebnis aus `classifyValueKind`, das zeitlich nach der
KI-Klassifikation läuft) **vor** `setCatalogEntry`: passt `valueKind` nicht
zur Rolle (Verstoß gegen A oder das `gauge`-Erfordernis aus B), wird nur
`derivedMetricRole`/`derivedMetricGroupId`/`hvacRole` verworfen und
`needsReview: true` gesetzt — der restliche Katalogeintrag (Kategorie,
Beschreibung, Einheit, Raum) wird trotzdem gespeichert. Ohne diese Prüfung
würde `setCatalogEntry` den kompletten Eintrag ablehnen (`validateCatalogEntry`
wirft atomar für das gesamte Objekt), und der Datenpunkt bliebe an dem Tag
komplett unkatalogisiert.

### Duplikat-Handling

Schlägt die KI innerhalb derselben Adapter-Instanz für zwei Objekte dieselbe
Rolle vor, wird die Rolle bei **beiden** Objekten verworfen (wie beim
`valueKind`-Konflikt oben) und `needsReview: true` gesetzt, statt eine
willkürliche Wahl zu treffen oder zwei Katalogeinträge mit identischer Rolle
stehen zu lassen. `resolveGroupRoles` (`lib/energyBalance.js:26-38`) würde
eine solche Gruppe ohnehin beim Lesen überspringen — das ist zusätzlich eine
frühere, sichtbare Rückmeldung im Geräte-Tab statt eines stillen
Überspringens erst bei der proaktiven Prüfung.

### Vertrauensregel

Das bestehende `confidence`-Feld im KI-Antwortobjekt bewertet nur die
`category`-Einschätzung (unverändert). Für `derivedMetricRole`/`hvacRole`
gilt unabhängig davon eine eigene, strengere Regel: **jeder** von der KI
vorgeschlagene Rollenwert (unabhängig vom `confidence`-Wert des Objekts)
setzt `needsReview: true` für den gesamten Eintrag. Begründung: eine falsche
Kategorie ist niedrigschwellig korrigierbar, eine falsche Bilanz-Rolle
fließt automatisiert in die Anomalieerkennung ein — das rechtfertigt einmal
manuelles Bestätigen im Geräte-Tab, selbst bei einer im Wortlaut eindeutigen
Objektbezeichnung. Der Katalogeintrag wird trotzdem inklusive Rolle
gespeichert (nicht blockiert) — `needsReview` macht ihn im Geräte-Tab nur
prominent sichtbar, bis er bestätigt oder korrigiert wird. Danach bleibt die
Rolle wie gehabt jederzeit überschreib-/löschbar (bestehender
Lösch-Sentinel).

Betrifft ausschließlich Objekte, die noch **nicht** im Katalog sind
(`unclassified`, `lib/onboarding.js:121`) — bestehende, manuell zugewiesene
Rollen werden nie überschrieben.

## Datenmodell — betroffene Stellen

`DERIVED_METRIC_ROLES` ist an fünf Stellen dupliziert (Set/Array-Literal),
alle müssen um `grid_power`/`battery_power` ergänzt werden:

- `lib/catalog.js` (kanonisch, exportiert `DERIVED_METRIC_ROLES`)
- `lib/adminCommands.js`
- `src-admin/src/csvHelpers.js`
- `src-admin/src/CatalogDevices/DeviceRow.jsx`
- `src-admin/src/CatalogDevices/BulkEditToolbar.jsx`

`derivedMetricInverted` ist ein neues Feld, das an denselben Stellen wie
`derivedMetricRole`/`derivedMetricGroupId` mitgeführt werden muss:
Validierung (`lib/catalog.js`, `lib/adminCommands.js`), CSV-Spalten
(`src-admin/src/csvHelpers.js`: `CSV_COLUMNS`/`CSV_EDITABLE_COLUMNS`), sowie
Anzeige/Eingabe im Geräte-Tab (`DeviceRow.jsx`).

## Nicht-Ziele

- Kein `grid_net`/`battery_net`-artiges Feature, das eine Tagesenergie aus
  einem signierten Leistungswert integriert — bewusst verworfen (siehe
  Recherche-Hintergrund).
- Kein EV-/Wallbox-Ladeleistungs-Rolle.
- Keine Änderung an `REQUIRED_ROLES`/`BATTERY_ROLES`/der Bilanzformel in
  `lib/energyBalance.js`.
- Keine Konsolidierung der fünf duplizierten `DERIVED_METRIC_ROLES`-Stellen
  in eine gemeinsame Quelle — außerhalb des Umfangs dieser Änderung, betrifft
  Frontend-Build-Grenzen (separates Bundle für `src-admin`).
- Kein hartkodiertes Adapter-Pattern-Matching (z. B. `sourceId.startsWith
  ('sun2000.')`) — ausschließlich KI-Onboarding-Vorschläge.

## Erfolgskriterien

- Ein `gauge`-Objekt mit `derivedMetricRole: 'grid_import'` (oder einer der
  anderen fünf Bilanz-Rollen) wird beim Speichern abgelehnt.
- Ein `daily_reset_counter`/`cumulative_total`-Objekt mit `derivedMetricRole:
  'grid_power'`/`'battery_power'` wird beim Speichern abgelehnt.
- `derivedMetricInverted` ohne `derivedMetricRole: 'grid_power'`/
  `'battery_power'` wird abgelehnt.
- `getPeriodTotal` für ein `grid_power`-Objekt mit `dayOffset: -1` liefert
  `min`/`max` wie für jeden anderen `gauge`-Datenpunkt (kein Sonderpfad).
- Onboarding für eine simulierte SUN2000-Instanz mit `totalCharge`/
  `totalDischarge`/Netz-Zählern schlägt die passenden vier Bilanz-Rollen vor
  und setzt für alle Objekte dieselbe `derivedMetricGroupId`.
- Onboarding für ein Objekt, dessen KI-vorgeschlagene Rolle nicht zum
  klassifizierten `valueKind` passt, speichert den Katalogeintrag trotzdem
  (ohne Rolle, mit `needsReview: true`) statt den gesamten Eintrag zu
  verwerfen.
- Zwei gleichzeitig vorgeschlagene Duplikate derselben Rolle in einer
  Instanz führen bei beiden Objekten zu einem Katalogeintrag ohne Rolle,
  aber mit `needsReview: true`.
- Ein Objekt mit einer eindeutigen, korrekten KI-Rollenzuweisung wird
  trotzdem mit `needsReview: true` gespeichert (Rolle selbst bleibt
  gesetzt).
- Eine Adapter-Instanz mit mehr als `BATCH_SIZE` relevanten Objekten wird
  über mehrere Batches hinweg korrekt derselben `derivedMetricGroupId`
  zugeordnet.
- Bestehende Energiebilanz-, Eigenverbrauch-, HVAC-Korrelations- und
  Onboarding-Tests (Kategorie-Klassifikation) bleiben unverändert grün.
