# Plan: Onboarding-Qualitaetsgate

1. `valueKindClassifier` um String-/Enum-Stichproben und sichere Metadaten-
   Fallbacks erweitern.
2. Eigenes Validierungsmodul für Onboarding-Ausgaben mit Reviewgründen,
   Einheiten-, Kategorie-, Rollen- und Datenfrischeprüfung erstellen.
3. `runOnboarding` auf das Gate umstellen und nur geprüfte Felder speichern.
4. Katalogschema, Admin-Dispatcher, CSV und LLM-Katalogwerkzeuge um Einheit,
   Rollen, Vorzeichen und neue `valueKind`-Werte ergänzen.
5. Fokus- und Regressionstests für unsichere Einheiten, Netzrichtung,
   Textzustände, stale/gaps, Rollenduplikate und manuelle Bestätigung ergänzen.
6. `npm test`, `npm run lint` und bei Admin-Änderungen `npm run build:admin`
   ausführen.
