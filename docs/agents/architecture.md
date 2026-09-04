# Adapterarchitektur

[← Agent-Fachkontext](README.md) · [Bausteinsicht](../architecture/05-bausteinsicht.md)

## Lifecycle

`main.js` verdrahtet `onReady`, `onMessage` und `onUnload`. Fachlogik gehört in
kleine CommonJS-Module unter `lib/`; `main.js` bleibt Orchestrator.

## Kernmodule

| Bereich | Module |
|---|---|
| Discovery und Katalog | `discovery.js`, `catalog.js`, Orchestrierung in `main.js` |
| Daten und Qualität | `dataAccess.js`, `dataQualityClassifier.js`, `valueKindClassifier.js` |
| KI-Laufzeit | `agent.js`, `tools.js`, `providers/`, `promptContext.js` |
| Onboarding und Prüfung | `onboarding.js`, `anomalyDetector.js`, `scheduler.js` |
| Betrieb | `usage.js`, `license.js`, `chatLog.js`, `historyHealth.js` |

Der vollständige und verbindliche Modulvertrag steht in der
[Bausteinsicht](../architecture/05-bausteinsicht.md).

## Persistenz

- Katalogeinträge liegen unter `catalog.<sourceId>` im Instanz-Namespace.
- Chat, Nutzung, Fortschritt, Provider-Health und Lizenzstatus liegen in
  adaptereigenen States.
- Fremde Objekte werden gelesen, aber nicht verändert.
- Secrets liegen ausschließlich in geschützten bzw. verschlüsselten Native-
  Konfigurationsfeldern.

## Nebenläufigkeit und Grenzen

- Chat, proaktive Prüfung und administrative Langläufer werden serialisiert.
- `onUnload` stoppt den Scheduler; bereits laufende Provider- oder
  Analyseaufrufe besitzen derzeit keine allgemeine Abbruchsteuerung.
- Dauerhafte Einschränkungen nicht hier duplizieren, sondern in
  [Risiken und technische Schulden](../architecture/11-risiken-und-schulden.md)
  pflegen.
