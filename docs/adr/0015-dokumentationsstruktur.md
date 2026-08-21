# ADR-0015: Dokumentationsstruktur — arc42 Multi-File + ADRs + Obsidian-MOCs

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Die Architekturdokumentation lag zunächst als eine einzelne `arc42.md`-Datei vor, mit Architekturentscheidungen als komprimierte Tabelle in Abschnitt 9. Der Nutzer öffnet dieses Repository außerdem als Obsidian-Vault (erkennbar am `.obsidian/`-Konfigurationsordner im Repo-Root) und wollte eine navigierbare Struktur statt einer langen Datei, ohne dafür einen separaten Doku-Generator einzuführen. Der `docs/superpowers/`-Pfadanteil für Spec/Plan war zudem ein Artefakt der verwendeten KI-Tooling-Erweiterung, keine bewusste Struktur.

Eine Recherche (u. a. arc42.org, docs.arc42.org/section-9, adr.github.io, npryce/adr-tools, obsidian.rocks) wurde herangezogen, bevor die Struktur festgelegt wurde.

## Entscheidung

- arc42 wird nach der offiziellen arc42-Multi-Page-Markdown-Edition in 12 Dateien (eine pro Kapitel) unter `docs/architecture/` aufgeteilt — nicht tiefer als Kapitelebene.
- Architekturentscheidungen werden aus arc42 §9 herausgelöst in einzelne ADR-Dateien unter `docs/adr/` im Nygard-Format, mit einer tabellarischen Übersicht (`adr-index.md`).
- Noch nicht getroffene, aber architekturrelevante Entscheidungen leben in einem separaten `docs/adr/backlog.md`, nicht als ADR (ein Backlog-Eintrag wird erst nach der Entscheidung zu einer eigenen ADR).
- Spec/Plan ziehen von `docs/superpowers/{specs,plans}/` nach `docs/specs/`, `docs/plans/`.
- Drei Map-of-Content-Hubs verlinken alles: `docs/README.md` (Haupteinstieg), `docs/architecture/arc42-index.md`, `docs/adr/adr-index.md`.
- Alle internen Links nutzen Standard-Markdown-Syntax (`[text](pfad.md)`), keine Obsidian-Wikilinks — damit die Dokumentation sowohl in Obsidian als auch auf GitHub korrekt rendert.
- `CONTRIBUTING.md` im Repo-Root beschreibt den Entwicklungsprozess (Branching-Modell, wann Spec/Plan/ADR nötig sind, TDD-Erwartung).

## Konsequenzen

- Deutlich mehr Dateien (12 arc42-Kapitel + 16 ADRs + Backlog + 3 MOCs) statt 3 großer Dateien — mehr Navigationsaufwand beim ersten Überblick, aber gezieltes Verlinken/Backlinking in Obsidian wird möglich.
- Jede zukünftige Architekturentscheidung bekommt eine eigene, klein gehaltene ADR-Datei statt einer wachsenden Tabellenzeile — konsistent mit arc42s eigener Empfehlung.
- Erfordert Disziplin, die MOCs bei neuen Dokumenten mitzupflegen, sonst veralten sie (Risiko, siehe [Backlog](backlog.md)-Kandidat, falls das zum Problem wird).
- Kein Doc-Generator (MkDocs/Docusaurus) eingeführt — bewusst, da Obsidian bereits der Renderer ist und ein Build-Schritt die Dateien in der Vault-Ansicht nicht besser lesbar machen würde.

## Verworfene Alternativen

- Eine einzelne arc42.md-Datei beibehalten (zu unübersichtlich für Obsidian-Navigation bei wachsendem Inhalt).
- Doc-Generator (MkDocs, Docusaurus, docsify) einführen (unnötiger Build-Schritt, Obsidian ist bereits der Reader).
- Wikilink-Syntax (`[[...]]`) für interne Links (rendert auf GitHub nicht als Link).
- Tiefere Unterteilung als Kapitelebene (z. B. jede Tabelle als eigene Datei) — mehr Overhead als Nutzen bei dieser Projektgröße.
