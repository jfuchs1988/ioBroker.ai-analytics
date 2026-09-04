# Tests und Verifikation

[← Agent-Fachkontext](README.md) · [Testkonzept](../architecture/08-querschnittliche-konzepte.md#84-testkonzept)

## Befehle

```bash
npm test               # Unit-Tests (main.js + Fachmodule) + Admin-Komponententests
npm run test:unit      # nur Fachmodule/main.js (Mocha)
npm run test:admin     # nur Admin-UI (Vitest)
npm run test:e2e       # echter js-controller-E2E-Test (manuell, siehe unten)
npm run lint
npm run build:admin
npx mocha test/unit/<name>.test.js
npx vitest run test/admin/<name>.test.jsx
```

## Teststrategie

- Fachmodule werden mit Mocha, Chai und Sinon isoliert getestet.
- `main.js`-Orchestrierung wird über Proxyquire und eine Fake-Adapter-API
  geprüft.
- Admin-UI (`src-admin/`) wird mit Vitest, `@testing-library/react` und jsdom
  getestet: reine Helferfunktionen per echtem ESM-Import, `ConfigGeneric`-
  Komponenten durch echtes Rendern mit einem minimalen `oContext`-Fake (kein
  echter Socket). Tests liegen unter `test/admin/*.test.jsx`.
- Ein echter End-to-End-Test (`test/e2e/adapter.e2e.test.js`, `npm run
  test:e2e`) installiert über `@iobroker/testing`s `tests.integration` einen
  echten js-controller in ein Temp-Verzeichnis, startet die Adapterinstanz als
  echten Prozess und prüft über das `stateChange`-Event des Harness reale
  States (`info.chatProviderReachable`, `info.onboardingProviderReachable`;
  ein direkter DB-Read direkt nach dem Start ist nicht zuverlässig). Läuft
  **nicht** in `npm test` (dauert
  Minuten, braucht Netzzugriff für die js-controller-Installation) und macht
  bewusst keinen LLM-Provider-Aufruf (kein `apiKey` konfiguriert). Manueller
  Pre-Release-Schritt, siehe `CONTRIBUTING.md`.
- Neue Verhaltensänderungen beginnen mit einem reproduzierenden roten Test.
- Fehlerpfade, Grenzen und ungültige persistierte Daten gehören zu jedem
  relevanten Vertrag.

## Bekannte Grenze

Kein Playwright-/Browser-E2E-Test der Admin-Oberfläche gegen eine laufende
ioBroker-Installation; das bleibt manuelle Live-Abnahme (siehe
`WORKLOG.md`-TODO). Der js-controller-E2E-Test deckt Adapter-Lifecycle und
Objekt-/State-Verträge ab, nicht die KI-Pfade (die bleiben Unit-getestet mit
Fake-Providern).

Die jeweils aktuelle Anzahl erfolgreicher Tests kommt aus der Testausgabe und
wird nicht in dauerhaften Dokumenten festgeschrieben.
