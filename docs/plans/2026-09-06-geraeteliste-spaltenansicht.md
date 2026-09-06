# Plan: Geräteliste-Spaltenansicht

1. Spalten-Definitionen mit Schlüssel, Label und Sortierbarkeit zentralisieren.
2. `CatalogDevicesComponent` um gespeicherte Sichtbarkeit und Auswahlsteuerung
   ergänzen.
3. `DeviceRow` um bedingte Zellen für alle Katalogfelder erweitern, ohne den
   bestehenden Detail-Panel- und Sofort-Speicherpfad zu brechen.
4. Admin-Tests für initiale Darstellung, Ausblenden und lokale Persistenz
   ergänzen.
5. `npm test`, `npm run lint` und `npm run build:admin` ausführen.
