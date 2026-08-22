# ADR-0018: Lizenzmodell — Beta frei, danach Sponsoring-Pflicht (Vorbild evcc)

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen (Phase 1 von 2 — siehe Konsequenzen)
**Datum:** 2026-08-22

## Kontext

Das Paket war als `MIT` deklariert, ohne dass eine `LICENSE`-Datei existierte
— ein Versehen, kein bewusster Entschluss. Das gab Anlass, die Lizenzfrage
grundsätzlich zu klären: [ADR-Backlog Punkt 4](backlog.md) sah die
npm-/Katalog-Veröffentlichung als offene Entscheidung vor.

Der Nutzer möchte die Software während der Beta-Phase kostenlos anbieten,
danach aber eine Nutzungsgebühr von ca. 0,99 EUR/Monat verlangen — als
Vorbild genannt wurde das Lizenz-/Sponsoring-Modell von
[evcc](https://github.com/evcc-io/evcc): quelloffener Kern, der nach einer
Testphase ohne aktives Sponsoring (via GitHub Sponsors) nicht mehr
weiterläuft.

## Entscheidung

Zweiphasiges Vorgehen:

1. **Jetzt (diese ADR):** Lizenzmodell rechtlich/textlich festlegen, aber
   **nicht technisch durchsetzen**. Neue `LICENSE`-Datei im Repo-Root:
   kostenlose Nutzung für alle `-beta`-Versionen, danach Pflicht zu einem
   aktiven Sponsoring ab 0,99 EUR/Monat (Kanal: GitHub Sponsors). Kein
   Code-seitiger Check, keine Zahlungs-Infrastruktur.
2. **Später (eigene Spec/Plan, noch nicht terminiert):** technische
   Durchsetzung nach evcc-Vorbild — Adapter läuft nach Beta-Ende eine
   begrenzte Zeit (Zielgröße laut Nutzer: 1 Monat) ohne gültiges
   Sponsoring-Token, danach Funktionssperre, Freischaltung über ein via
   GitHub Sponsors bezogenes Token. Details (Trigger für "Beta-Ende",
   Token-Format, Online- vs. Offline-Prüfung, welche Funktionen gesperrt
   werden) sind **nicht** Teil dieser Entscheidung und offen — siehe
   [Backlog](backlog.md).

Damit einher geht die Entscheidung **gegen** eine Aufnahme in den
offiziellen ioBroker-Adapter-Katalog: der Katalog verlangt eine echte
Open-Source-Lizenz, ein zeitlich begrenztes, sponsoring-pflichtiges Modell
erfüllt das nicht. Verteilung bleibt privat (GitHub-Release/`.tgz`).

`package.json` und `io-package.json` werden von `"license": "MIT"` auf
`"license": "SEE LICENSE IN LICENSE"` umgestellt.

## Konsequenzen

- `LICENSE`-Datei ersetzt die vorher fehlerhafte `MIT`-Deklaration.
- Kein `npm publish`, keine Aufnahme in den offiziellen ioBroker-Katalog —
  [ADR-Backlog Punkt 4](backlog.md) damit beantwortet und aus dem Backlog
  entfernt.
- Bis zur Umsetzung von Phase 2 ist die Sponsoring-Pflicht **nicht
  technisch erzwungen** — reine Vertrauens-/Rechtsbasis. Das ist ein
  bewusstes Zwischenstadium, kein Endzustand.
- Phase 2 (technische Durchsetzung) ist neuer Backlog-Punkt — architektur-
  relevant (neue Komponente: Lizenz-/Token-Prüfung), braucht eigene
  Spec+Plan vor Implementierung gemäß [CONTRIBUTING.md](../../CONTRIBUTING.md).
- Der Lizenztext wurde nicht anwaltlich geprüft (siehe Hinweis in der
  `LICENSE`-Datei selbst).

## Verworfene Alternativen

- **MIT bleibt, Monetarisierung nur über freiwilliges Sponsoring**: hätte
  Katalog-Aufnahme ermöglicht, setzt aber keine Pflichtgebühr durch — vom
  Nutzer explizit abgelehnt.
- **Sofortige technische Durchsetzung (Lizenzserver, Zahlungsanbieter)**:
  zu diesem Zeitpunkt zurückgestellt, da vor Beta-Ende noch nicht
  benötigt und ein eigenständiges, größeres Vorhaben (Zahlungsanbieter-
  Anbindung, Token-Ausgabe, Prüf-Mechanismus im Adapter).
