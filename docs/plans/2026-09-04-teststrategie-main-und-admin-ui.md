# Teststrategie für main.js und Admin-UI — Umsetzung

Spec: `docs/specs/2026-09-04-teststrategie-main-und-admin-ui.md`

Umgesetzt inline in einer Session (kein Subagent-Handoff nötig, da der
Kontext bereits vorhanden war). Dieses Dokument hält die Umsetzung fest.

## Admin-UI (Vitest)

- Neue Dev-Dependencies: `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- `vitest.config.mjs` (Repo-Root): jsdom-Umgebung, `test/admin/**/*.test.jsx`,
  Setup-Datei registriert `@testing-library/jest-dom` und explizites
  `afterEach(cleanup)`.
- `test/unit/adminComponents.test.js` (String-Slicing + `vm.runInNewContext`)
  entfernt, ersetzt durch `test/admin/csvHelpers.test.jsx` mit echtem
  ESM-Import der Helferfunktionen aus `Components.jsx`.
- Neu: `test/admin/providerSelectComponent.test.jsx` — rendert
  `ProviderSelectComponent` (eine echte `ConfigGeneric`-Unterklasse) mit
  React Testing Library gegen einen minimalen `oContext`-Fake. Zwei
  empirisch verifizierte Verhaltensdetails, die beim Schreiben des Tests
  entdeckt wurden:
  - `props.onChange` wird von `ConfigGeneric` mit der Signatur
    `(data, undefined, callback)` aufgerufen (voller zusammengeführter
    Datensatz), nicht `(attr, value)`.
  - Zwei aufeinanderfolgende `onChange`-Aufrufe innerhalb desselben
    Event-Handlers (Provider wechseln + `urlField` setzen) basieren beide auf
    denselben, nicht aktualisierten `props.data` — kein Zwischen-Rerender.
    Das ist reales Komponentenverhalten, kein Testartefakt.
- `npm run test:admin` (Vitest); in `npm test` aufgenommen
  (`test:unit && test:admin`).

## Echter E2E-Test

- `test/adapter.test.js` (deprecated `tests.unit`) entfernt.
- Neu: `test/e2e/adapter.e2e.test.js` mit `tests.integration` aus
  `@iobroker/testing`. Startet einen echten js-controller + echte
  Adapterinstanz und prüft über `harness.on('stateChange', ...)`
  `info.chatProviderReachable === false` sowie
  `info.onboardingProviderReachable === false` (kein `apiKey` konfiguriert →
  `main.js#checkProviderConfigured` überspringt die Erreichbarkeitsprüfung
  bewusst, kein LLM-Netzaufruf). Zwei beim Ausführen entdeckte reale
  Eigenschaften, keine Testartefakte:
  - Kein `info.connection`-State: Dieser Adapter hält keine dauerhafte
    externe Verbindung, `main.js` setzt diesen State bewusst nicht.
  - Ein direkter `harness.states.getState(...)`-Read unmittelbar nach
    `startAdapterAndWait()` lieferte `null`, obwohl der State laut Log
    bereits gesetzt war (vermutlich Race auf der Redis-Emulation der
    Testumgebung) — der Test verifiziert stattdessen über das
    dokumentierte `stateChange`-Event des Harness.
- `npm run test:e2e` (`mocha test/e2e/**/*.test.js --timeout 1800000
  --exit`), nicht Teil von `npm test`.
- Einmal manuell ausgeführt zur Verifikation (Ergebnis im WORKLOG
  festgehalten).

## Dokumentation

- `docs/agents/testing.md`: Teststrategie-Abschnitt und Befehle aktualisiert,
  bekannte Grenze auf Admin-Browser-E2E präzisiert.
- `CONTRIBUTING.md`: Release-Ablauf um `npm run test:e2e` ergänzt.

## Nicht umgesetzt (bewusst, siehe Spec "Nicht-Ziele")

- Kein Playwright-/Browser-E2E-Test der Admin-Oberfläche.
- Keine LLM-Provider-Integration im E2E-Test.
