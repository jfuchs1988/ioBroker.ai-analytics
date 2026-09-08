# PV-Leistungsrolle als Gauge

## Ziel

Ein historisierter PV-Leistungswert (`gauge`, zum Beispiel Watt) soll im
Katalog die Rolle `pv_generation` erhalten können.

## Verhalten

- `pv_generation` akzeptiert `daily_reset_counter`, `cumulative_total` oder
  `gauge`.
- Counter-PV bleibt für Energiebilanz und Eigenverbrauchsquote verwendbar.
- Gauge-PV wird nicht als Energie über den Tag summiert.
- Gauge-PV bleibt über die typbewussten Periodenwerkzeuge für Tages-`min`,
  `max` und `avg` abfragbar.
- Eine Energiebilanzgruppe mit Gauge-PV wird übersprungen und erzeugt keine
  falsche Bilanz.
- Eine Eigenverbrauchsabfrage mit Gauge-PV wird mit einer klaren Fehlermeldung
  abgelehnt.
