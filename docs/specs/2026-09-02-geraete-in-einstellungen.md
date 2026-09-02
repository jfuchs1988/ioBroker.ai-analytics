# Geräteübersicht in den Adapter-Einstellungen

**Status:** Angenommen
**Datum:** 2026-09-02

## Entscheidung

Die katalogisierten, historisierten Datenpunkte werden in einem eigenen Reiter der JSON-Adapterkonfiguration angezeigt. Die bisherige Geräte-Unterseite des separaten Custom-Tabs entfällt; der Custom-Tab bleibt für Chat und Budget zuständig.

Die Tabelle bleibt dynamisch und liest den Katalog über den bestehenden Admin-Message-Bus. Sie unterstützt weiterhin Filter, Re-Scan, Prüfung, Beschreibung, Kategorie, Raum, `valueKind`, Ignorieren und Entfernen.

## Technische Umsetzung

- `admin/jsonConfig.json` bindet eine ioBroker-JSON-Config-Custom-Komponente ein.
- `src-admin/` enthält die React-Komponente und den Vite/Module-Federation-Build.
- Das gebaute Modul liegt unter `admin/custom/` und wird mit dem Adapter ausgeliefert.
- Der separate Geräte-Reiter in `admin/tab.html` und die zugehörigen Initialisierungen in `admin/tab.js` werden entfernt.

## Akzeptanzkriterien

- Die Geräteübersicht erscheint unter den Adapter-Einstellungen im Reiter „Geräte“.
- Änderungen werden über `listCatalogEntries`, `updateCatalogEntryAdmin`, `removeCatalogEntry`, `runDiscoveryNow` und `runProactiveCheckNow` an den Adapter gesendet.
- Chat und Budget im separaten Custom-Tab bleiben erreichbar.
- `npm run build:admin` und `npm test` sind erfolgreich.
