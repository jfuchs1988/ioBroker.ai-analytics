# Arbeitsstand

Kurzer Übergabestand für die nächste Sitzung. Abgeschlossene Historie steht in
`CHANGELOG.md` und Git, dauerhafte Risiken in
`docs/architecture/11-risiken-und-schulden.md`.

## WIP

- Branch: `master`.
- Status: Beide Tasks committed (`2038af6`, `8d15f38`), nach `master`
  gemergt (`fbb8fa5`) und nach `origin/master` gepusht. Feature-Branch
  gelöscht.

## TODO

- Nächste Produktaufgabe: aktuellen Adapterstand auf einer echten ioBroker-
  Installation live abnehmen.
- Vor jedem künftigen Release `npm run test:e2e` einmal manuell ausführen
  (js-controller-Installation kann mehrere Minuten dauern).

## DONE

- CI: Ungenutzte, seit 2026-09-04 deaktivierte GitHub-Actions-Workflows
  (`CI`, `Release`) entfernt statt reaktiviert vorgehalten; `CONTRIBUTING.md`
  und `docs/agents/development-workflow.md` an den tatsächlichen Zustand
  (keine Workflow-Dateien mehr, rein manuelle Verifikation) angepasst.
- Teststrategie (Spec `docs/specs/2026-09-04-teststrategie-main-und-admin-ui.md`,
  Umsetzung `docs/plans/2026-09-04-teststrategie-main-und-admin-ui.md`):
  - Admin-UI: Vitest + `@testing-library/react` + jsdom eingeführt; alte
    String-Slicing-Tests (`test/unit/adminComponents.test.js`) durch echten
    ESM-Import ersetzt; neuer Komponententest für `ProviderSelectComponent`
    (`test/admin/`). `npm run test:admin`, Teil von `npm test`.
  - Echter E2E-Test: `test/adapter.test.js` (deprecated `tests.unit`) entfernt,
    ersetzt durch `test/e2e/adapter.e2e.test.js` mit `tests.integration` aus
    `@iobroker/testing` — echter js-controller, echte Adapterinstanz, prüft
    über `harness.on('stateChange', ...)` die Provider-Health-States, kein
    LLM-Aufruf. `npm run test:e2e`, manuell verifiziert (2 passing, ~57s nach
    einmaliger js-controller-Installation), nicht Teil von `npm test`.
  - Verifiziert: `npm test` (372 Unit-Tests + 8 Admin-Tests), `npm run lint`,
    `npm run build:admin`, `npm run test:e2e` — alle grün.
- Nach `master` gemergt und nach `origin/master` gepusht.

Ältere abgeschlossene Historie (Dokumentationskonsolidierung, Lizenzaudit,
Releases beta.47/beta.48) steht in `CHANGELOG.md` und Git.
