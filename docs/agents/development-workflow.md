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
8. Jeder Merge nach `master` läuft über einen Pull Request: Branch pushen,
   Pull Request eröffnen, Pull Request mergen. Kein direkter Push/Merge nach
   `master`.
9. Auf jeden gemergten Pull Request folgt immer ein Release (Version,
   `CHANGELOG.md`, `io-package.json`, Paketbau, Tag, GitHub-Release) — das
   ist kein separater Auftrag.

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
- `.github/workflows/test.yml` (Lint/Test/Admin-Build) und `codeql.yml`
  (Security-Scan) laufen automatisch bei Push/PR auf `master`
  (siehe [Backlog-Punkt 5](../adr/backlog.md)). Der Release selbst bleibt ein
  manueller Schritt direkt nach jedem gemergten Pull Request, kein separater
  Auftrag nötig.
- `AGENTS.md` und `CLAUDE.md` bleiben lokal und sind über `.gitignore` sowie
  `.npmignore` von Repository und Paket ausgeschlossen.
