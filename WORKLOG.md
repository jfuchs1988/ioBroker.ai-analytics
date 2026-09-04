# Arbeitsstand

Kurzer Übergabestand für die nächste Sitzung. Abgeschlossene Historie steht in
`CHANGELOG.md` und Git, dauerhafte Risiken in
`docs/architecture/11-risiken-und-schulden.md`.

## WIP

- Branch: `feature/session-context-docs`
- Status: Release `0.0.1-beta.48` vorbereitet, noch nicht veröffentlicht.
- Spec: `docs/specs/2026-09-04-session-kontext-und-dokumentation.md`
- Plan: `docs/plans/2026-09-04-session-kontext-und-dokumentation.md`

## TODO

- Release `0.0.1-beta.48` committen, pushen, mergen, taggen und veröffentlichen.

## DONE

- Bestehende Struktur mit einem Referenzprojekt verglichen und veraltete bzw.
  doppelte Statusangaben identifiziert.
- Lokale `AGENTS.md` auf Session-Start, Pflichtregeln und aufgabenbezogenes
  Laden reduziert; versionierte Fachkontexte unter `docs/agents/` ergänzt.
- README, Entwicklungsprozess, Architekturstatus und `LICENSES/` konsolidiert.
- Dokumentationstest für relative Links, volatile README-Versionen und die
  Übereinstimmung von Sponsor-Inventar und Dateiköpfen ergänzt.
- Verifiziert: 378 Unit-Tests und 1 Adaptertest erfolgreich, ESLint und
  Admin-Build erfolgreich, Releasepaket per `npm pack --dry-run` geprüft.
- Lizenzaudit durchgeführt: kein Hinweis auf kopierten Anwendungscode des
  Referenzprojekts;
  Third-Party-Notices für gebündelte Admin-Abhängigkeiten und weitere
  Lizenzfamilien ergänzt. `@iobroker`- und `cropperjs`-Hinweise bleiben im
  Bundle erhalten.
- Release `0.0.1-beta.47` committed, nach `master` gemergt, getaggt und als
  GitHub-Release veröffentlicht.
