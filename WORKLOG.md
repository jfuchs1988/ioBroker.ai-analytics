# Arbeitsstand

Kurzer Übergabestand für die nächste Sitzung. Abgeschlossene Historie steht in
`CHANGELOG.md` und Git, dauerhafte Risiken in
`docs/architecture/11-risiken-und-schulden.md`.

## WIP

- Branch: `feature/anomalieerkennung-phase2`
- Ziel: Hybride Anomalieerkennung Phase 2 (Zähler + `boolean_state`), siehe
  Spec `docs/specs/2026-09-04-hybride-anomalieerkennung-phase2.md`, Plan
  `docs/plans/2026-09-04-hybride-anomalieerkennung-phase2.md`.
- Stand: Code + Tests + Doku fertig, `npm test`/`npm run lint` grün. Noch
  offen: `npm run build:admin` (nicht betroffen, kann übersprungen werden),
  finale Diff-Prüfung, Commit/Merge/Push.

## TODO

- Nächste Produktaufgabe (nach dieser): aktuellen Adapterstand auf einer
  echten ioBroker-Installation live abnehmen.
- Vor jedem künftigen Release `npm run test:e2e` einmal manuell ausführen
  (js-controller-Installation kann mehrere Minuten dauern).

## DONE

- Hybride Anomalieerkennung Phase 2: `lib/periodValue.js` aus `lib/tools.js`
  extrahiert (Wiederverwendung der typbewussten Periodenberechnung);
  `lib/anomalyDetector.js` um `detectDailyAggregateAnomaly` sowie
  Zähler-/Boolean-Kandidaten (Tagesvergleich: letzter vollständiger
  Kalendertag gegen 7 Kalendertage davor) erweitert; `main.js`-Systemprompt
  kind-neutral formuliert. `npm test` (380 Unit-Tests) und `npm run lint`
  grün.
- CI-Aufräumung und Teststrategie (main.js + Admin-UI, echter
  ioBroker-E2E-Test) aus der vorigen Session sind auf `master` gemergt und
  gepusht (`2038af6`, `8d15f38`, `fbb8fa5`, `531fcce`). Details:
  `docs/adr/backlog.md` Punkte 3 und 5, `docs/specs/2026-09-04-*`.

Ältere abgeschlossene Historie (Dokumentationskonsolidierung, Lizenzaudit,
Releases beta.47/beta.48) steht in `CHANGELOG.md` und Git.
