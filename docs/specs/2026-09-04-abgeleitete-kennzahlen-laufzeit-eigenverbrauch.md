# Abgeleitete Kennzahlen — Laufzeit und Eigenverbrauch

Status: Approved for implementation
Datum: 2026-09-04
Vorgänger: [Übersicht Korrelation/Kennzahlen](2026-09-04-korrelation-und-abgeleitete-kennzahlen-uebersicht.md)
(Sub-Projekt A)

## Ziel

Erste Ausbaustufe der abgeleiteten Kennzahlen: Laufzeit und
Eigenverbrauchsquote. Validiert dabei im kleinstmöglichen Fall (ein
Objektpaar) das Gruppierungsmuster, das die späteren Sub-Projekte B
(Energie-Korrelation) und C (HVAC-Korrelation) brauchen werden.

## Laufzeit — bereits vorhanden, kein neuer Code

Die Einschaltdauer eines `boolean_state`-Objekts ist bereits über das
bestehende Werkzeug `getPeriodTotal` verfügbar (`computePeriodValue` liefert
`{onDurationMs, switchCount}` für diesen `valueKind`, siehe
`lib/periodValue.js`). Dieser Teil der Kennzahl braucht keine
Implementierung — nur eine manuelle Prüfung, dass eine Chat-Frage wie "Wie
lange lief die Pumpe gestern?" bereits sinnvoll beantwortet wird, und einen
Vermerk im WORKLOG.

## Eigenverbrauchsquote — neu

### Datenmodell

Zwei neue optionale Katalogfelder, analog zu `category`/`room`:

- `derivedMetricRole`: `'pv_generation' | 'grid_feed_in'` (kleines,
  festes Vokabular; weitere Rollen kommen erst mit Sub-Projekt B)
- `derivedMetricGroupId`: beliebiger String (max. 128 Zeichen), verbindet
  ein Objektpaar

Beide Felder werden nur zusammen gesetzt (beide vorhanden oder beide
`undefined`). Validierung in `lib/catalog.js` (`validateCatalogEntry`) und
`lib/adminCommands.js` (`validateCatalogUpdate`), analog zur bestehenden
`valueKind`-Prüfung. Keine Cross-Entry-Prüfung bei jedem Schreibvorgang
(würde Race-/Konsistenzprobleme bei verteilten Schreibzugriffen riskieren);
stattdessen validiert das neue Werkzeug (`getSelfConsumption`, siehe unten)
die Gruppenintegrität zum Abfragezeitpunkt mit einer klaren Fehlermeldung.

### Vorschlag beim Onboarding (Heuristik, kein LLM-Aufruf)

`lib/onboarding.js` bekommt einen zusätzlichen, rein
namensbasierten Heuristik-Schritt (kein zusätzlicher LLM-Aufruf, kein
Kostenrisiko): Wenn nach der Klassifizierung genau ein katalogisiertes
Objekt mit `category: 'generation_pv'` und `valueKind` in
(`cumulative_total`, `daily_reset_counter`, `event_count`) existiert, dessen
Beschreibung/sourceId auf Erzeugung hindeutet, UND genau ein Objekt mit
passendem Namensmuster für Netzeinspeisung existiert, UND beide noch kein
`derivedMetricGroupId` haben, werden beide automatisch mit einer neuen
gemeinsamen `derivedMetricGroupId` und der passenden `derivedMetricRole`
versehen. Wie bei `category`/`room` ist das ein **Vorschlag, keine
Bestätigungspflicht** — sichtbar und änderbar im Geräte-Tab (Tabelle + CSV),
genau wie jedes andere Katalogfeld. Kein neuer Bestätigungsmechanismus
nötig (kein Konflikt mit `needsReview`, das an `valueKind`-Konfidenz
gebunden bleibt).

Bei Mehrdeutigkeit (mehr als ein Kandidat je Rolle) wird **nichts**
automatisch vorgeschlagen — der Nutzer weist die Rollen manuell im
Geräte-Tab zu.

### Neues LLM-Werkzeug: `getSelfConsumption`

```js
{
    name: 'getSelfConsumption',
    description:
        'Berechnet die Eigenverbrauchsquote (Anteil der PV-Erzeugung, der nicht ins Netz eingespeist wurde) ' +
        'fuer ein per derivedMetricGroupId verknuepftes Objektpaar (PV-Erzeugung + Netzeinspeisung). ' +
        'groupId kann entfallen, wenn genau eine Gruppe im Katalog existiert.',
    inputSchema: {
        type: 'object',
        properties: {
            groupId: { type: 'string' },
            periods: { /* wie getPeriodTotal: start/end oder dayOffset */ },
        },
        required: ['periods'],
        additionalProperties: false,
    },
}
```

Verhalten:

1. `groupId` fehlt: genau eine `derivedMetricGroupId` mit vollständigem
   Rollenpaar im Katalog → diese verwenden. Keine oder mehrdeutig viele →
   Fehler mit der Liste der verfügbaren `groupId`s.
2. `groupId` vorhanden: Gruppe muss genau ein Objekt mit
   `derivedMetricRole: 'pv_generation'` und genau eines mit
   `'grid_feed_in'` enthalten, sonst Fehler mit konkreter Ursache (fehlende
   Rolle, doppelte Rolle).
3. Je Zeitraum: `pvTotal`/`feedInTotal` über `computePeriodValue` (wie
   `getPeriodTotal`); `selfConsumptionRatio = (pvTotal - feedInTotal) / pvTotal`.
4. `pvTotal <= 0`: `selfConsumptionRatio: null` statt Division durch null,
   mit `note: 'Keine PV-Erzeugung in diesem Zeitraum.'`.
5. Rückgabe je Zeitraum: `{ start, end, pvTotal, feedInTotal, selfConsumptionRatio, note? }`
   plus `description`/`room` beider beteiligter Objekte für lesbare
   Chat-Antworten (wie bei den bestehenden Werkzeugen).

### Admin-UI

Nur CSV, keine neue Tabellenspalte: Die Geräte-Tab-Tabelle hat bereits neun
Spalten plus Aktionen; ein Objektpaar für Eigenverbrauch ist eine seltene,
einmalige Einrichtung (typisch 0 oder 1 Paar pro Installation), kein
Feld, das ständig sichtbar sein muss. `src-admin/src/Components.jsx`
(`CatalogDevicesComponent`): `derivedMetricRole` und `derivedMetricGroupId`
zu `CSV_COLUMNS`/`CSV_EDITABLE_COLUMNS` ergänzen; `validateCatalogImportValue`
bekommt einen Fall für die neue Rollen-Enum. Zuweisung/Änderung läuft über
CSV-Export → Bearbeiten → Import, wie bereits für seltenere Felder üblich.

## Nicht-Ziele

- Kein Wirkungsgrad/COP in dieser Runde (eigene Formelform, siehe
  Übersichts-Spec).
- Keine automatische Erkennung bei mehrdeutigen Kandidaten — nur manuelle
  Zuweisung.
- Keine Leistungsintegration für Gauge-Objekte — beide Partner müssen
  zählerartig sein.
- Keine Änderung an `needsReview`/dessen Bedeutung.

## Erfolgskriterien

- Ein PV-Erzeugungs- und ein Netzeinspeisungs-Objekt mit gesetztem Paar
  liefern über `getSelfConsumption` eine korrekte Quote für mehrere
  Zeiträume.
- Eine Anfrage ohne `groupId` bei genau einer vollständigen Gruppe im
  Katalog funktioniert ohne weitere Angabe.
- Eine unvollständige oder mehrdeutige Gruppe liefert eine klare
  Fehlermeldung statt eines falschen Ergebnisses.
- `pvTotal <= 0` erzeugt `null` statt eines Rechenfehlers oder `Infinity`.
- Bestehende Katalog-/Onboarding-/Admin-UI-Tests bleiben unverändert grün.
