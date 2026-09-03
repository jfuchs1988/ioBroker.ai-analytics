# ioBroker.ai-analytics

`ioBroker.ai-analytics` verbindet historische Smart-Home-Analytics mit einer
proaktiven KI-Prüfung. Der Adapter findet ioBroker-Datenpunkte, die bereits
über History, InfluxDB oder SQL aufgezeichnet werden, baut daraus einen
semantischen Katalog, beantwortet Fragen zu den Daten und erklärt
ungewöhnliche Beobachtungen.

## Funktionen

- Fragen in natürlicher Sprache zu Verbrauch und Gerätenutzung
- Zeitraumvergleiche für Messwerte, Schalter, Tageszähler, Gesamtzähler und
  Ereigniszähler
- Automatische Discovery von Datenpunkten mit aktivem History-Logging
- Semantisches Onboarding mit Rückfrage bei unsicheren Objekten
- Proaktive Prüfung mit statistischer Anomalievoranalyse vor dem LLM-Aufruf
- Datenqualitätsfelder für Schreibbarkeit, Schreibmuster, Frequenz und
  Vollständigkeit
- Geräte- und Katalogverwaltung im ioBroker-Admin
- CSV-Export/-Import für die Katalogpflege
- Anthropic, OpenAI, OpenRouter und lokale OpenAI-kompatible Provider
- Optional eigener Provider für das Onboarding
- Tagesbudget und Verbrauchshistorie für Tokens
- Offline-fähige Grundlage für die spätere Sponsoring-Entitlement-Prüfung

## Voraussetzungen

- ioBroker mit JavaScript-Controller 5 oder neuer
- Node.js 18 oder neuer
- Mindestens eine aktive `history`-, `influxdb`- oder `sql`-Logging-Instanz
- API-Key für einen unterstützten Cloud-Provider oder ein erreichbarer lokaler
  OpenAI-kompatibler Endpunkt, z. B. Ollama, LM Studio oder LocalAI

Es werden ausschließlich Datenpunkte analysiert, für die bereits History-
Logging aktiviert ist. Der Adapter aktiviert kein Logging und verändert keine
fremden ioBroker-Objekte.

## Installation

Nach Aufnahme in das ioBroker-Repository erfolgt die Installation direkt über
die Adapterliste im Admin. Während der Entwicklung kann ein GitHub-Release-
Archiv oder lokales Paket verwendet werden:

```bash
npm install
npm run pack:release
```

Das erzeugte Archiv kann über den ioBroker-URL-/Datei-Installer installiert
werden.

## Konfiguration

Im ioBroker-Admin konfigurierbar:

- Chat-/Prüfungsprovider, Modell, API-Key und optionale Basis-URL
- Optional eigener Onboarding-Provider
- Prüfintervall und Verhalten bei keinem Fund
- Tagesbudget und manuell gepflegte Tokenpreise
- Optionale valueKind- und Datenqualitäts-Backfills
- Sponsoring-Entitlement-Token für die spätere stabile Release-Policy

Das Tokenfeld wird von ioBroker geschützt und verschlüsselt. Es wird nicht in
den Settings-CSV-Export aufgenommen.

## Provider und Datenschutz

OpenRouter ist ein einfacher Einstieg für aktuell kostenlose, toolfähige
Modelle. Verfügbarkeit, Limits und Datenschutzregeln können sich ändern.
OpenCode Zen ist als Alternative verlinkt, wird aber nicht dauerhaft als
kostenlos klassifiziert. Lokale OpenAI-kompatible Endpunkte verhindern die
Übertragung von Smart-Home-Daten an einen Cloud-Anbieter.

Der Adapter gibt dem Modell keine rohen Datenbank-Abfragesprachen, sondern nur
kuratierte Werkzeuge und Katalogmetadaten. Datenschutz- und
Aufbewahrungsbedingungen des jeweiligen Providers müssen vor der Nutzung
geprüft werden.

## Unterstützte History-Quellen

Der Adapter verwendet die generische ioBroker-History-API und unterstützt
aktives Logging über History, InfluxDB und SQL:

- [ioBroker History](https://github.com/ioBroker/ioBroker.history)
- [ioBroker InfluxDB](https://github.com/ioBroker/ioBroker.influxdb)
- [ioBroker SQL](https://github.com/ioBroker/ioBroker.sql)

## Sponsoring und Lizenz

Das Repository enthält einen MIT-lizenzierten Kern und separat dokumentierte
`sponsor-required`-KI-Komponenten. Alle `-beta`-Versionen bleiben kostenlos.
Die technische Entitlement-Policy startet mit `0.1.0`: Eine separate
Sponsoring-Webanwendung stellt Ed25519-signierte JWS-Tokens aus. Sie sind
technisch 35 Tage gültig, stehen für 30 Tage Sponsoring und haben eine
30-tägige Grace-Period. Danach bleibt eine Chat-Anfrage pro lokalem Tag
möglich; proaktive KI-Prüfungen werden deaktiviert. Tokens sind nicht an eine
Instanz gebunden.

Das Projekt kann über [GitHub Sponsors](https://github.com/sponsors/jfuchs1988)
unterstützt werden. Siehe [LICENSE](LICENSE), die
[sponsor-required Bedingungen](LICENSES/SPONSOR-REQUIRED.md) und die
[Entitlement-Architektur](docs/specs/2026-09-03-hybrid-license-and-entitlements.md).

## Entwicklung

```bash
npm install
npm test
npm run lint
npm run build:admin
```

`npm test` führt die Unit-Tests und den Adaptertest aus. Zusätzlich enthält
das Repository Proxyquire-basierte Tests für Orchestrierung und Adapterfluss.

## Dokumentation

- [Dokumentationsindex](docs/README.md)
- [Produkt-Roadmap](docs/roadmap.md)
- [Architektur](docs/architecture/arc42-index.md)
- [Changelog](CHANGELOG.md)
- [Beitragsleitfaden](CONTRIBUTING.md)

## Status

Aktuelle Entwicklungsversion: `0.0.1-beta.30`. Der Adapter befindet sich in
der Beta-Phase; eine manuelle Abnahme auf einer echten ioBroker-Installation
gehört weiterhin zum Releaseprozess.

English documentation: [README.md](README.md).
