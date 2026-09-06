# Geräteliste: Spaltenansicht

## Ziel

Die Geräte-Tabelle zeigt alle Katalogfelder in auswählbaren Spalten. Nutzer
können einzelne Spalten ein- und ausblenden; die Auswahl bleibt je Admin-
Browser und Adapter-Instanz erhalten.

## Verhalten

- Alle Spalten sind beim ersten Aufruf sichtbar.
- Eine Spaltenauswahl listet alle Felder mit verständlichen Labels.
- `sourceId`, `unit`, `writable`, `active`, `needsReview` und `writePattern`
  sind read-only Metadaten.
- Beschreibung, Kategorie, Verhalten, Raum, Ignorieren, Update-Frequenz,
  Vollständigkeit, Energie-Rolle, Energiebilanz-Gruppe und HVAC-Rolle bleiben
  direkt in der Tabelle bearbeitbar.
- Die Sichtbarkeit wird mit einem versionierten `localStorage`-Schlüssel unter
  `ai-analytics.catalogDevices.columns.<instance>` gespeichert.
- Mindestens eine Spalte bleibt sichtbar; die Auswahl kann auf alle Spalten
  zurückgesetzt werden.
