# Deep Security Hardening

## Ziel

Der Adapter muss untrusted LLM-, History-, CSV- und Chat-Eingaben begrenzen und sicher darstellen. Parallele kostenpflichtige Operationen dürfen keine Quoten, Zustände oder Chat-Historien beschädigen.

## Anforderungen

- Markdown-Ausgabe darf auch in Tabellen kein HTML ausführen.
- Provider-Aufrufe müssen zeitlich begrenzt und bei Timeout abgebrochen werden.
- Agent-Werkzeuge validieren Argumente zur Laufzeit und begrenzen Tool-Aufrufe, Zeiträume und Batch-Größen. Für mehrjährige Monatsvergleiche sind bis zu 72 Zeiträume je Werkzeug und 256 je Lauf erlaubt.
- Proaktive Prüfungen erhalten ausschließlich lesende Werkzeuge.
- Chat- und proaktive Läufe dürfen pro Instanz nicht überlappen; die tägliche eingeschränkte Chat-Nutzung wird vor dem Modellaufruf reserviert.
- Chat-Fortschritt verwendet einen eigenen State und endet auch bei Fehlern zuverlässig.
- Die aktuelle Nutzerfrage darf dem Modell nur einmal übergeben werden.
- History-Ausfälle dürfen nicht als gesunder Lauf mit „Keine Auffälligkeiten“ gemeldet werden.
- Scheduler-Intervalle werden auf den sicheren Timerbereich begrenzt.
- Usage-, Katalog-, Onboarding- und CSV-Werte werden robust validiert; CSV-Exporte neutralisieren Tabellenformeln.
- Fehler aus Providern und Werkzeugen werden gegenüber UI und Modell sanitisiert.

## Nicht-Ziele

- Vollständige Ablösung der ioBroker-State-Bridge; deren Zugriffsschutz bleibt zusätzlich von ioBroker-ACLs abhängig.
- Auswahl einer bestimmten History-Instanz.
- Behebung transitiver Audit-Befunde im ausschließlich entwicklungsseitigen `@iobroker/testing`, solange keine sichere kompatible Version verfügbar ist.

## Abnahme

- Regressionstests für jeden bestätigten Fehler.
- `npm test`, `npm run lint`, `npm run build:admin` und Paketinhalt-Prüfung erfolgreich.
