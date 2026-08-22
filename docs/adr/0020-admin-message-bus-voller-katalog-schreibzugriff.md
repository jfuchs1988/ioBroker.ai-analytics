# ADR-0020: Admin-Message-Bus bekommt vollen Katalog-Schreibzugriff (unabhängig von needsReview)

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-22

## Kontext

[ADR-0017](0017-scoped-catalog-write-capability.md) hat dem Chat-Agenten (LLM-gesteuert) eine eng begrenzte Schreibfähigkeit gegeben: `updateCatalogEntry` funktioniert nur für Einträge mit `needsReview: true`. Für die Geräte-Verwaltung im Admin-Tab ([Spec](../specs/2026-08-22-geraete-tab-design.md)) reicht das nicht — ein Nutzer muss auch bereits verifizierte Einträge editieren können (Raum verschieben, ignorieren), nicht nur unsichere.

## Entscheidung

`lib/adminCommands.js`s `updateCatalogEntryAdmin` und `removeCatalogEntry` haben vollen Schreibzugriff auf alle Katalogeinträge, unabhängig von `needsReview`. Das ist bewusst ein **separater Pfad** vom LLM-Tool `updateCatalogEntry`:

- Der Admin-Message-Bus (`main.js`s `onMessage`, angesprochen ausschließlich über `sendTo` aus dem Admin-UI) ist eine andere Vertrauensgrenze als der LLM-Tool-Calling-Loop — kein Modell entscheidet hier autonom, ein Mensch klickt im Admin-Tab.
- Die Einschränkung aus ADR-0017 (nur `needsReview`-Einträge) bleibt für das LLM-Tool unverändert bestehen — sie schützt vor autonomen KI-Überschreibungen, nicht vor menschlicher Admin-Bedienung.

## Konsequenzen

- Zwei Schreibpfade zu `lib/catalog.js` mit unterschiedlichem Vertrauensmodell: `lib/tools.js`s `updateCatalogEntry` (LLM, nur `needsReview`) und `lib/adminCommands.js`s `updateCatalogEntryAdmin`/`removeCatalogEntry` (Mensch über Admin-UI, uneingeschränkt).
- [Backlog-Punkt 8](backlog.md) ("Sicherheitsmodell für zukünftige schreibende Werkzeuge") bleibt für weitergehende **LLM**-Schreibzugriffe offen — diese ADR beantwortet nur den Admin-UI-Pfad, nicht das generelle LLM-Sicherheitsmodell.

## Verworfene Alternativen

- **`updateCatalogEntryAdmin` ebenfalls auf `needsReview`-Einträge beschränken**: hätte die Kernanforderung (Raum verschieben, ignorieren für beliebige, auch bereits verifizierte Geräte) verfehlt.
