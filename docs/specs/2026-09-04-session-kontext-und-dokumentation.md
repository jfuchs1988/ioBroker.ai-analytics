# Session-Kontext und Dokumentationsstruktur

## Ziel

Neue Entwicklungssitzungen sollen die verbindlichen Regeln und den aktuellen
Arbeitsstand sicher finden, ohne die gesamte Projektgeschichte oder irrelevante
Fachdetails in den Kontext zu laden.

## Struktur

- Die lokale `AGENTS.md` bleibt ein kurzer Einstieg mit Projektzweck,
  Pflichtablauf, Sicherheitsregeln und einer aufgabenbezogenen Lesetabelle.
- Versionierte Fachinformationen liegen unter `docs/agents/` und werden nur bei
  passender Arbeit geladen.
- `WORKLOG.md` enthält nur den aktuellen Übergabestand. Abgeschlossene Historie
  gehört in `CHANGELOG.md` und Git.
- `README.md` und `README.de.md` richten sich an Nutzer und verlinken auf die
  tiefergehende Dokumentation, statt Entwicklungsdetails zu duplizieren.
- `LICENSE` und `LICENSES/` trennen Hauptlizenz, Ausnahmen, Abhängigkeiten und
  Projektassets nachvollziehbar.

## Aktualität

- Versionsnummern werden nicht als Freitext in der README dupliziert.
- Testzahlen werden nicht in dauerhaften Arbeitsanweisungen festgeschrieben.
- Relative Markdown-Links werden automatisiert geprüft.
- Statusaussagen nennen die kanonische Quelle, statt an mehreren Stellen
  unabhängig gepflegt zu werden.

## Nicht-Ziele

- Keine Änderung des bestehenden Lizenzmodells.
- Keine Veröffentlichung der lokal gehaltenen `AGENTS.md`.
- Keine neue Endnutzer-Dokumentationswebsite.
- Keine nachträgliche Umschreibung historischer Planinhalte.
