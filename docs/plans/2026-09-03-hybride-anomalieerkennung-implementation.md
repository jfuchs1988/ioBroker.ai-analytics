# Hybride Anomalieerkennung — Implementierungsplan

**Spec:** [2026-09-03-hybride-anomalieerkennung.md](../specs/2026-09-03-hybride-anomalieerkennung.md)

## Ziel

Eine testbare statistische Kandidatenstufe vor der proaktiven LLM-Prüfung
einführen, ohne bestehende Chat- oder Schreibpfade zu verändern.

## Schritte

1. `lib/anomalyDetector.js` mit reinen Funktionen für Filterung, Median,
   MAD, robuste Abweichung und Kandidatenentscheidung anlegen.
2. `test/unit/anomalyDetector.test.js` zuerst rot, danach grün umsetzen:
   gleichmäßige Reihe, Ausreißer, relative Abweichung, fehlende Daten und
   unzureichende Stichprobe.
3. History-Orchestrierung als `findAnomalyCandidates(adapter, entries, now)`
   ergänzen. Pro Objekt werden aktuelles 24h-Fenster und historische Referenz
   abgefragt; Fehler werden isoliert behandelt.
4. `main.js` bzw. den proaktiven Prüfpfad so verdrahten, dass Kandidaten vor
   dem Agentenlauf ermittelt und als kompakter Kontext übergeben werden.
5. Tests für die Orchestrierung und den proaktiven Guard ergänzen.
6. Systemprompt so erweitern, dass Kandidaten nur erklärt, nicht statistisch
   neu erfunden werden dürfen.
7. Architektur- und Risikodokumentation sowie CHANGELOG aktualisieren.
8. `npm test`, `npm run lint` und `npm run build:admin` ausführen.

## Grenzen

Die erste Iteration klassifiziert keine Zähler, Boolean-Zustände oder
Mehrpunkt-Korrelationen. Diese Erweiterungen bekommen bei Bedarf eigene Specs,
weil sie andere erwartete Verläufe und Fehlerschwellen benötigen.
