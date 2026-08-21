# 2. Randbedingungen

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 2.1 Technische Randbedingungen (verbindlich, aus dem Implementierungsplan)

- Node.js >= 18 (nutzt das eingebaute globale `fetch`, keine HTTP-Client-Abhängigkeit).
- Reines JavaScript (CommonJS `require`/`module.exports`), kein TypeScript, kein Build-Schritt/Bundler.
- Keine offiziellen Vendor-SDKs für LLM-Provider — Provider-Clients rufen die REST-APIs direkt über `fetch` auf.
- Historische Daten werden ausschließlich über ioBrokers generische Message-API gelesen: `adapter.sendToAsync(historyInstance, 'getHistory', { id, options: { start, end, aggregate } })`. Keine direkte InfluxDB-/SQL-Treiber-Abhängigkeit.
- Geloggte Objekte werden ausschließlich über `obj.common.custom["<influxdb|history|sql>.N"].enabled === true` erkannt.
- Katalogeinträge werden als Adapter-States unter `catalog.<sourceId>` mit JSON-kodiertem String-Wert gespeichert.
- Keine regelbasierten Schwellwerte für proaktive Prüfungen — die KI bewertet die Daten frei (bewusste Nutzerentscheidung, siehe [ADR-0005](../adr/0005-proaktive-pruefung-ohne-regeln.md)).
- Teststack: mocha + chai + sinon für Unit-Tests, `@iobroker/testing` für den Adapter-Startup-Smoke-Test (siehe [Testkonzept](08-querschnittliche-konzepte.md#84-testkonzept) für eine bekannte Einschränkung dieses Smoke-Tests).

## 2.2 Organisatorische Randbedingungen

- Entwicklung erfolgt über einen Spec → Plan → TDD-Implementierung → Review-Workflow, dokumentiert in [CONTRIBUTING.md](../../CONTRIBUTING.md).
- Git-Branching: `develop` ist der Arbeits-Branch, `master` wird nur auf ausdrücklichen Wunsch aktualisiert (siehe [ADR-0016](../adr/0016-git-branching-modell.md)).
- Privates GitHub-Repository `jfuchs1988/ioBroker.ai-analytics`. Noch nicht auf npm veröffentlicht und nicht im offiziellen ioBroker-Adapter-Katalog gelistet (offene Entscheidung, siehe [Offene Architekturentscheidungen](../adr/backlog.md)).

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [1. Einführung und Ziele](01-einfuehrung-und-ziele.md) · weiter zu [3. Kontextabgrenzung](03-kontextabgrenzung.md)
