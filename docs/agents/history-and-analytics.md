# History und Analytics

[← Agent-Fachkontext](README.md)

## Datenzugriff

- Discovery berücksichtigt nur Objekte mit aktiviertem Logging in
  `common.custom` für aktive `history`, `influxdb` oder `sql`-Instanzen.
- Datenzugriff erfolgt über die generische ioBroker-History-API, nicht über rohe
  SQL- oder Influx-Abfragen des Modells.
- Zeitgrenzen an History- und Vergleichswerkzeuge sind Unix-Millisekunden.
- Rohwertabfragen benötigen explizite Limits; mögliche Abschneidung darf nicht
  stillschweigend als vollständiges Ergebnis behandelt werden.

## Semantischer Katalog

Der Katalog verbindet Quell-ID und technische Metadaten mit Beschreibung,
Kategorie, Raum, `valueKind`, Reviewstatus und Datenqualitätsfeldern. Neue oder
unsichere Einträge werden klassifiziert bzw. zur Prüfung markiert, nicht
erraten.

## Typgerechte Auswertung

- Gauges verwenden zeitgewichtete bzw. aggregierte Messwerte.
- Tageszähler verwenden Periodensummen.
- Kumulative Zähler verwenden Differenzen.
- Schalter verwenden Laufzeit oder Zustandsanteile.
- Ereignisdaten verwenden Anzahlen.

Änderungen an diesen Regeln müssen mit der
[Datenpunkt-Klassifizierung](../specs/2026-08-24-datenpunkt-klassifizierung.md)
und den Tool-Schemas in `lib/tools.js` konsistent bleiben.

## Proaktive Prüfung

Die statistische Voranalyse filtert auffällige Kandidaten, bevor das LLM eine
Erklärung erzeugt. Proaktive Werkzeuge bleiben read-only. History-Ausfälle und
Datenlücken sind von fachlichen Auffälligkeiten zu unterscheiden.
