# Onboarding-Qualitaetsgate

**Status:** Entwurf zur Umsetzung

## Ziel

Das Onboarding darf keine fachlich unsichere Katalogklassifikation als belastbar
speichern. Vor dem Schreiben werden technische Metadaten, Stichprobenergebnis,
Datenfrische, Einheit und vorgeschlagene Rollen gegeneinander geprüft.

## Regeln

- `valueKind` kennt numerische, boolesche, Ereignis- sowie benannte Textzustände.
- Fehlende, widersprüchliche oder veraltete Daten erzwingen `needsReview` und
  werden mit maschinenlesbaren `reviewReasons` gespeichert.
- Eine vom Modell abweichend vorgeschlagene Einheit wird nicht übernommen; die
  Quell-Einheit bleibt maßgeblich und erzeugt `unit_conflict`.
- Energie- und HVAC-Rollen werden nur bei gültigem `valueKind` und ohne Duplikat
  akzeptiert. Netzrichtung und Vorzeichen bleiben bei `grid_power` immer eine
  manuelle Bestätigung (`needsReview`).
- Unbekannte Kategorien, Rollen, Confidence-Werte und Felder werden verworfen
  oder als unsicher markiert; sie dürfen keinen Katalogschreibfehler erzeugen.
- Admin und das ausdrücklich bestätigte Katalogwerkzeug können Einheit, Rollen,
  Vorzeichen und `valueKind` ändern. Jede solche Änderung setzt die Quelle auf
  `manual` und leert die Reviewgründe.
- Stale-/Gap-Daten werden diagnostiziert, aber nicht durch das Katalogwerkzeug
  repariert.

## Nicht-Ziel

Keine Token- oder Promptkompression; die Onboarding-Ausgabe bleibt in diesem
Task unverändert groß.
