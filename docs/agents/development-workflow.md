# Entwicklungsworkflow

[← Agent-Fachkontext](README.md) · [CONTRIBUTING.md](../../CONTRIBUTING.md)

## Ablauf

1. `WORKLOG.md`, Branch, Status, Diff und letzte Commits prüfen.
2. Relevante Fachdateien, Spec, Plan, ADR und Risiken laden.
3. Task-Branch von aktuellem `master` erstellen.
4. Bei Features oder Verhalten zuerst Spec und Plan, bei Architektur zusätzlich
   eine ADR schreiben.
5. Änderung testgetrieben umsetzen und Dokumentation synchron halten.
6. Status, Diff und Log prüfen; Tests, Lint und erforderlichen Build ausführen.
7. Nur auf ausdrücklichen Auftrag committen oder veröffentlichen.

## Dokumentationsquellen

| Information | Kanonische Quelle |
|---|---|
| Aktuelle Arbeit und nächste Aktion | `WORKLOG.md` |
| Version | `package.json` |
| Veröffentlichte Änderungen | `CHANGELOG.md` und Git-Releases |
| Dauerhafte Risiken | `docs/architecture/11-risiken-und-schulden.md` |
| Architekturentscheidung | `docs/adr/` |
| Produktpriorität | `docs/roadmap.md` |

Keine Testzahlen, Versionen oder erledigte Taskhistorie in Session-Regeln
duplizieren.

## Umgebungshinweise

- Das Repository kann parallel geänderte Dateien enthalten. Unbekannte
  Änderungen nie verwerfen oder überschreiben.
- Admin-Quellen unter `src-admin/` sind nicht Teil des Releasepakets; das
  gebaute Bundle unter `admin/` muss aktuell sein.
- GitHub-Actions-Workflows sind derzeit nicht im Repository. Releases werden
  deshalb nur auf ausdrücklichen Auftrag und nach lokaler Verifikation erstellt.
- `AGENTS.md` und `CLAUDE.md` bleiben lokal und sind über `.gitignore` sowie
  `.npmignore` von Repository und Paket ausgeschlossen.
