# Backlog offener Architekturentscheidungen

[← ADR-Übersicht](adr-index.md) · [← Architektur-Übersicht](../architecture/arc42-index.md)

Architekturrelevante Fragen, die noch **nicht** entschieden wurden. Jeder Eintrag wird erst zu einer eigenen ADR unter `docs/adr/`, sobald eine Entscheidung getroffen ist. Sortiert nach grober Priorität (dringend/blockierend zuerst).

_Aktualisiert 2026-09-16: Releases `0.1.0` bis `0.1.2` sind veröffentlicht; die frühere Beta-/Release-Entscheidung ist erledigt. Historische Nummern bleiben für Querverweise erhalten._

_Aktualisiert 2026-08-22: der manuelle Re-Discovery-Trigger aus Punkt 1 und der vormalige Punkt 12 (manueller Trigger für die proaktive Prüfung) sind durch den Geräte-Tab ([Spec](../specs/2026-08-22-geraete-tab-design.md), [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md)) aufgelöst — Punkt 12 entfällt, Punkt 1 ist auf die verbleibende Instanz-Auswahl-Frage verengt._

_Aktualisiert 2026-08-22: Punkt 12 durch [ADR-0021](0021-getrennte-provider-pro-zweck.md) auf die verbleibende Frage der automatischen Kandidaten-Auswahl verengt._

_Aktualisiert 2026-09-03: Der Nutzer bestätigt, dass die History-Adapter-Auswahl zunächst nicht erweitert werden muss; die aktuelle Unterstützung von `influxdb`, `history` und `sql` bleibt ausreichend. Mehrinstanz-Unterstützung soll global bleiben. Katalog-Backup/Restore, WhatsApp/Alexa und automatische Modellauswahl werden nicht benötigt._

_Aktualisiert 2026-09-04: Punkt 3 (Teststrategie) und Punkt 5 (CI-Aktivierung) sind gelöst — Nummern bleiben als stabile Anker für bestehende Querverweise (z. B. [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md) auf Punkt 8) erhalten, keine Neunummerierung._

## 1. Auswahl der History-Adapterinstanz(en) — zurückgestellt

Aktuell werden automatisch alle aktiven `influxdb`/`history`/`sql`-Instanzen berücksichtigt. Eine Erweiterung auf weitere History-Adapter oder eine Instanz-Auswahl ist zunächst nicht erforderlich.

## 2. Deduplizierung und abgestufte Wiederholung von Ausfallmeldungen

Implementiert: pro History-Instanz wird ein persistenter Health-Status mit
Fehlerzähler, Meldungszustand, Retry-Zeitpunkten und endgültigem `exhausted`-
Zustand geführt. Erfolgreiche Abfragen setzen den Status zurück.

## 3. Teststrategie für main.js und die Admin-UI — gelöst

Umgesetzt: `test/e2e/adapter.e2e.test.js` mit `tests.integration` aus
`@iobroker/testing` (echter js-controller, echte Adapterinstanz,
`npm run test:e2e`, manuell verifiziert). Admin-UI: Vitest +
`@testing-library/react` + jsdom (`npm run test:admin`, Teil von `npm test`).
Details: `docs/specs/2026-09-04-teststrategie-main-und-admin-ui.md`.

## 4. Technische Durchsetzung des Lizenz-/Sponsoring-Modells (Referenzprojekt)

Durch [ADR-0018](0018-lizenzmodell-beta-frei-danach-sponsoring.md) und [ADR-0027](0027-hybrid-lizenzmodell-referenzprojekt.md) entschieden: MIT-Kern mit sponsor-pflichtigen KI-Komponenten. Die technische Token-/Entitlement-Spec ist festgelegt: separate Webanwendung, Ed25519-JWS mit definierten Audience-/Version-Claims, technischer Tokenablauf = `sponsorUntil` (korrigiert 2026-09-10, siehe ADR-0027-Korrektur und Backend-ADR 0004; vormals fälschlich als separates 35-Tage-Fenster dokumentiert), 30 Tage Sponsoring, 30 Tage Grace-Period, keine Instanzbindung, Offline-Signaturprüfung und danach eine Chat-Anfrage pro Tag. Offen bleiben Hosting/Details der Webanwendung sowie Trial-/Contributor-Entitlements. Die Backend-Gegenseite (Aktivierung, OAuth, Persistenz) ist jetzt in `ioBroker.AiAnalytics.Backend` spezifiziert (Phase 0, 2026-09-10).

## 5. CI-Aktivierung — reaktiviert für die Katalog-Einreichung (2026-09-16)

Die Entscheidung vom 2026-09-04 (GitHub-Actions-Workflows vollständig
entfernt, Prüfung dauerhaft manuell) ist durch [ADR-0030](0030-aufnahme-offizielle-adapter-liste.md)
überholt: `ioBroker.repositories` verlangt für die Aufnahme in die
"latest"-Liste einen Test-Workflow via GitHub Actions. `test.yml` führt
`npm test`, `npm run lint` und `npm run build:admin` bei Push/PR auf
`master` aus; `codeql.yml` (Security-Scan) war bereits vorhanden. Release
bleibt weiterhin manuell (siehe [CONTRIBUTING.md](../../CONTRIBUTING.md)).

## 6. Versionierungs-/Release-Policy nach der Beta-Phase — gelöst

`0.1.0` wurde am 2026-09-16 als stabile Version veröffentlicht. Die
Entitlement-Prüfung ist aktiv; bekannte Produkt- und Live-Abnahmelücken bleiben
als Folgeaufgaben dokumentiert.

## 7. Katalog-Skalierung bei großen Installationen — TODO

Von der Spec als spätere Optimierung markiert. Zu klären: Vorfilterung nach Kategorie/Raum, Embedding-basierte Relevanzsuche, oder einfache Paginierung — sobald eine reale Installation mit vielen hundert Objekten das nötig macht.

## 8. Sicherheitsmodell für zukünftige schreibende Werkzeuge

[ADR-0017](0017-scoped-catalog-write-capability.md) hat die erste, eng begrenzte Schreibfähigkeit des **LLM-Tools** eingeführt. Das Werkzeug darf zusätzlich `valueKind` nach ausdrücklicher Nutzerangabe korrigieren; zentrale Enum-/Rollenvalidierung bleibt aktiv. [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md) definiert weiterhin den separaten Admin-Message-Bus. Offen bleiben weitergehende LLM-Schreibzugriffe wie Geräte schalten.

## 9. Mehrinstanz-Unterstützung — Entscheidung: global

Mehrere Instanzen dürfen global über alle historisierten Objekte arbeiten. Eine Einschränkung nach Räumen oder Objektgruppen ist nicht vorgesehen. Die technische Mehrinstanz-Isolation der ioBroker-Namespaces bleibt bestehen.

## 10. Katalog-Backup/-Restore — entfällt

Wird aktuell nicht benötigt. Der Geräte-Tab bietet bereits CSV-Export/-Import für die praktische Bearbeitung bestehender Einträge.

## 11. WhatsApp-/Alexa-Anbindung — später

Bleibt eine spätere Erweiterung und wird derzeit nicht geplant.

## 12. Automatische Kandidaten-Auswahl unter mehreren LLM-Modellen — entfällt

Es wird ein Provider/Modell pro Zweck konfiguriert. Eine automatische Kosten-/Qualitätsauswahl wird nicht benötigt.

## 13. Offene Schritte zur Katalog-Einreichung (ADR-0030)

Vor der PR an `ioBroker.repositories`: `npm publish` inkl. ioBroker-Org als
NPM-Owner; Klärung mit `info@iobroker.net` zum Sponsoring-/Umsatzmodell für
Adapter mit Bezahlpflicht-Funktionen; Lauf des offiziellen Checkers
(`adapter-check.iobroker.in`) gegen den finalen Stand. Punkt 5 (CI) ist
bereits erledigt.

