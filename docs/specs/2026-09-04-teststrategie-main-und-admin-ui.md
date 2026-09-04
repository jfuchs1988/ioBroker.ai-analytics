# Teststrategie für main.js und Admin-UI

## Ziel

Die Testabdeckung schließt zwei bekannte Lücken (siehe
`docs/agents/testing.md`, "Bekannte Grenze"):

1. `test/adapter.test.js` ist kein echter js-controller-End-to-End-Test,
   sondern nutzt das deprecated `tests.unit`-Verhalten von
   `@iobroker/testing`.
2. Die Admin-Oberfläche (`src-admin/`) hat keine automatisierte
   DOM-/Komponentenabdeckung; Pure-Function-Helfer werden aktuell per
   String-Slicing und `vm.runInNewContext` aus der `.jsx`-Quelle isoliert.

Beide Lücken werden geschlossen, ohne die bestehende, funktionierende
Unit-Teststrategie für Fachmodule und `main.js`-Orchestrierung zu ersetzen.

## Kontext

- `@iobroker/testing@5.3.0` stellt neben `tests.unit` auch
  `tests.integration` bereit. Das installiert einen echten js-controller in
  ein Temp-Verzeichnis, legt eine echte Adapterinstanz an und startet sie als
  echten Prozess; ein Harness erlaubt Zugriff auf echte States/Objects. Das
  ist die einzige verfügbare echte End-to-End-Prüfung für einen
  ioBroker-Adapter.
- CI-Workflows werden im Rahmen einer separaten Aufräumaktion aus dem Repo
  entfernt (siehe WORKLOG); Verifikation bleibt manuell. Ein E2E-Lauf, der
  einen js-controller installiert (Minuten, Netzzugriff), passt nicht in den
  schnellen `npm test`-Zyklus vor jedem Commit und wird daher als separater,
  manuell ausgeführter Schritt geführt statt automatisch bei jedem Commit zu
  laufen.
- `src-admin/` nutzt React 19 und Vite; es gibt noch keinen
  Komponenten-Test-Runner. Vitest teilt sich die bestehende Vite-Konfiguration
  (JSX-Transform, Module-Auflösung) und bringt jsdom mit, was für
  React-Testing-Library-Tests benötigt wird.

## Entwurf

### main.js / echter E2E-Test

- Neuer Test `test/e2e/adapter.e2e.test.js` mit `tests.integration` aus
  `@iobroker/testing`. Prüft: Adapterinstanz startet gegen einen echten
  js-controller, meldet `info.connection`, legt erwartete States an, fährt
  sauber herunter (kein offener Prozess/Handle).
- Kein LLM-Provider-Aufruf im E2E-Test: Es wird keine Konfiguration mit
  echtem API-Key gesetzt, damit kein Secret in Test-Fixtures nötig ist und
  der Test ohne Netzzugriff zu einem LLM-Anbieter läuft. Der Test deckt
  Adapter-Lifecycle und Objekt-/State-Verträge ab, nicht die KI-Pfade (die
  bleiben Unit-getestet mit Fake-Providern).
- `test/adapter.test.js` (deprecated `tests.unit`) wird entfernt; die
  strukturelle Prüfung, die es bot (io-package/package.json-Konsistenz,
  sauberes Starten/Stoppen), ist im neuen E2E-Test enthalten.
- Neues Skript `test:e2e` in `package.json`, **nicht** Teil von `npm test`.
  Dokumentiert in `docs/agents/testing.md` und `CONTRIBUTING.md` als
  Pre-Release-Schritt.

### Admin-UI

- Vitest + `@testing-library/react` + `jsdom` als Dev-Dependencies, mit
  eigener `vitest.config` (nutzt dieselbe React/JSX-Konfiguration wie
  `src-admin/vite.config.mjs`).
- Tests liegen unter `test/admin/*.test.jsx`.
- Bestehende Pure-Function-Tests aus `test/unit/adminComponents.test.js`
  wandern nach `test/admin/` und werden per echtem Modul-Import statt
  String-Slicing/`vm`-Kontext geladen (setzt voraus, dass die reinen
  Helferfunktionen exportiert sind — sie sind es bereits laut
  `Components.jsx`).
- Neue Komponententests rendern `ProviderSelectComponent` und mindestens
  eine weitere zentrale Komponente über React Testing Library gegen ein
  Fake-`ConfigGeneric`-Umfeld (Props/Callbacks, kein echter ioBroker-Socket).
- Neues Skript `test:admin` (Vitest), aufgenommen in `npm test`
  (`test:unit && test:admin && test:adapter`… `test:adapter` entfällt, siehe
  oben, also `test:unit && test:admin`).

## Nicht-Ziele

- Kein Playwright/Browser-E2E-Test der Admin-Oberfläche in echtem Chrome
  gegen eine laufende ioBroker-Installation — das bleibt manuelle Live-Abnahme
  (siehe WORKLOG-TODO).
- Der E2E-Test prüft keine LLM-Provider-Integration (kein echter API-Call).
- Keine Änderung der bestehenden Unit-Teststrategie für Fachmodule.

## Verifikation

- `npm test` (jetzt `test:unit && test:admin`) grün.
- `npm run test:e2e` einmal manuell erfolgreich ausgeführt und Ergebnis im
  Worklog vermerkt (js-controller-Installation kann mehrere Minuten dauern).
- `npm run lint` und `npm run build:admin` weiterhin grün.
