# Geräteliste: Ignorierte Geräte und Energierollen

## Ziel

Die Geräteliste soll im Normalfall übersichtlich bleiben und ignorierte
Katalogeinträge ausblenden. Gleichzeitig sollen die Energie- und
Leistungsrollen direkt auf der Seite verständlich erklärt werden.

## Verhalten

- Ignorierte Geräte sind standardmäßig ausgeblendet.
- Ein Schalter `Ignorierte Geräte anzeigen` blendet sie ein und wieder aus.
- Die Einstellung wird je Adapter-Instanz im Browser gespeichert.
- Volltextfilter, Sortierung, Auswahl und `Alle auswählen` arbeiten auf der
  aktuell sichtbaren Menge.
- Das Ausblenden ändert keine Katalogdaten.
- Die Legende erklärt alle Rollen: PV-Erzeugung, Netzbezug,
  Netzeinspeisung, Verbrauch, Batterieladung, Batterieentladung,
  Netzleistung und Batterieleistung. Sie nennt ausdrücklich den Unterschied
  zwischen Energiezählern und Gauge-Leistungswerten.
