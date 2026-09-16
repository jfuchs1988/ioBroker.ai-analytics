# ADR-0030: Aufnahme in die offizielle ioBroker-Adapter-Liste

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-09-16

## Kontext

[ADR-0018](0018-lizenzmodell-beta-frei-danach-sponsoring.md) hat 2026-08-22
explizit **gegen** eine Aufnahme in den offiziellen ioBroker-Adapter-Katalog
entschieden: "der Katalog verlangt eine echte Open-Source-Lizenz, ein
zeitlich begrenztes, sponsoring-pflichtiges Modell erfüllt das nicht."
Verteilung sollte privat über GitHub-Release/`.tgz` erfolgen;
[ADR-Backlog Punkt 4](backlog.md) wurde damit als beantwortet aus dem Backlog
entfernt.

[ADR-0027](0027-hybrid-lizenzmodell-referenzprojekt.md) hat das
Lizenzmodell selbst am 2026-09-03 ersetzt: MIT-Kern, klar abgegrenzte
sponsor-pflichtige KI-Komponenten (Referenzvorbild: evcc). ADR-0027 hält
bereits fest, dass der Adapter "grundsätzlich als Open-Source-Projekt
verteilt werden" kann, hat die Katalog-Frage aus ADR-0018 aber nicht erneut
explizit aufgegriffen — die Ablehnung der Katalog-Aufnahme blieb formal
unwidersprochen stehen, obwohl ihre Begründung (kein echtes Open-Source-Modell
möglich) durch ADR-0027 bereits entkräftet war.

Der Nutzer verfolgt jetzt aktiv die Aufnahme in die offizielle Liste
(`ioBroker/ioBroker.repositories`, "latest"-Repository) und hat dafür
`LICENSE`, `package.json` und `io-package.json` auf das evcc-Muster
umgestellt: reiner, unveränderter MIT-Lizenztext; sponsor-pflichtige
Komponenten ausschließlich in `LICENSES/` und per Datei-Header dokumentiert,
nicht im Lizenztext selbst; `licenseInformation.type` korrekt als `limited`
(nicht `commercial`) deklariert.

## Entscheidung

Die Katalog-Ablehnung aus ADR-0018 wird aufgehoben. `ioBroker.ai-analytics`
strebt die Aufnahme in die offizielle "latest"-Liste an.

Begründung: Das evcc-Muster — vollständiger, unveränderter MIT-Lizenztext im
Repository-Root, mit sponsor-pflichtigen Ausnahmen ausschließlich in
separaten Dokumenten und Datei-Headern — erfüllt die Lizenzanforderung des
Katalogs technisch (GitHub erkennt die Lizenz korrekt als MIT,
`@iobroker/repochecker` akzeptiert `licenseInformation.type: "limited"` für
genau dieses Muster). Die ursprüngliche Prämisse aus ADR-0018 ("ein
sponsoring-pflichtiges Modell erfüllt das nicht") war an das damalige,
inzwischen durch ADR-0027 ersetzte Lizenzmodell gebunden, nicht an eine
grundsätzliche Unvereinbarkeit von Sponsoring und Katalog-Aufnahme.

Offen und außerhalb dieser ADR zu klären: `ioBroker.repositories` beschreibt
für "Commercial Adapters Requiring a License" eine Umsatzbeteiligung
(30 % bei Verkauf über die offizielle ioBroker-Website, 15 % Servicegebühr
bei eigenem Vertrieb) und verweist auf Kontaktaufnahme mit
`info@iobroker.net`. Ob und in welcher Form das für ein `limited`-Modell mit
rein freiwilligem GitHub-Sponsoring (kein Verkauf über die ioBroker-Website)
gilt, ist vor der Einreichung mit ioBroker GmbH zu klären.

## Konsequenzen

- [ADR-Backlog](backlog.md) bekommt die Katalog-Einreichung als neuen,
  offenen Punkt (vorher als "beantwortet" entfernt).
- Vor der PR-Einreichung an `ioBroker.repositories` sind zusätzlich zu
  erledigen: Test-Workflow in `.github/workflows/` (aktuell nur
  `codeql.yml`), `npm publish` inkl. ioBroker-Org als NPM-Owner, Klärung mit
  `info@iobroker.net` zum Sponsoring-/Umsatzmodell, Lauf des offiziellen
  Checkers (`adapter-check.iobroker.in`).
- `docs/agents/licensing.md` enthält die technischen Repochecker-
  Konsistenzregeln (Lizenz-Sync, unveränderte `LICENSE`-Datei,
  `common.news`-Pflege), die diese ADR voraussetzt.
- Bis zur endgültigen Klärung mit ioBroker GmbH bleibt der Adapter parallel
  über GitHub-Release/`.tgz` installierbar; die Katalog-Aufnahme ist ein
  zusätzlicher, kein exklusiver Vertriebsweg.

## Abgrenzung zu ADR-0018 und ADR-0027

Diese ADR ersetzt ausschließlich den Katalog-Ablehnungs-Abschnitt aus
ADR-0018 ("Damit einher geht die Entscheidung gegen eine Aufnahme in den
offiziellen ioBroker-Adapter-Katalog … Verteilung bleibt privat"). Das
Lizenzmodell selbst bleibt unverändert durch ADR-0027 bestimmt.
