# ADR-0029: Progressive Disclosure für Session-Kontext

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-09-04

## Kontext

Die bisherige `AGENTS.md` enthielt gleichzeitig Architekturdetails,
veränderlichen Projektstatus, Prozessregeln und Releasehistorie. Neue Sitzungen
erhielten dadurch viel nicht aufgabenbezogenen Kontext, während einzelne
Statusaussagen veralteten. Der lange `WORKLOG.md` vermischte Übergabe und
Historie zusätzlich.

## Entscheidung

- `AGENTS.md` ist ein kurzer, lokal gehaltener Session-Einstieg.
- Aufgabenbezogenes Wissen wird unter `docs/agents/` versioniert und über eine
  Routing-Tabelle nur bei Bedarf geladen.
- `WORKLOG.md` enthält ausschließlich aktuelle Arbeit, nächste Schritte und
  den letzten Prüferfolg.
- Version, Testanzahl und abgeschlossene Historie werden aus `package.json`,
  Testausgabe, `CHANGELOG.md` und Git bezogen, nicht in Agentenregeln kopiert.
- Ein Test prüft relative Markdown-Links und verhindert fest codierte
  README-Versionsstände.

## Konsequenzen

- Neue Sitzungen starten mit weniger, aber verbindlichem Kontext.
- Fachwissen bleibt auffindbar und reviewbar, ohne jede Sitzung zu belasten.
- Der Einstieg muss bei neuen Fachgebieten nur um einen Routing-Eintrag ergänzt
  werden.
- Lokale Agentenanweisungen bleiben bewusst außerhalb veröffentlichter Pakete
  und des Git-Repositories; die referenzierten Fachinformationen sind dagegen
  versioniert.
