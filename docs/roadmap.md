# Produkt-Roadmap und globale TODO-Liste

Stand: 2026-09-03

Diese Liste bündelt die Nutzerwünsche und die in der Markt- und Bedarfsanalyse
identifizierten Produktlücken. Sie ist nach erwartetem Nutzwert, Risiko und
Abhängigkeiten sortiert. Die Reihenfolge ist eine Priorisierung, noch keine
Freigabe für die Umsetzung. Neue Verhaltensänderungen brauchen weiterhin eine
eigene Spec, einen Plan und bei Architekturentscheidungen eine ADR.

Quelle: [Markt- und Bedarfsanalyse](architecture/01-einfuehrung-und-ziele.md#14-markt-und-bedarfsanalyse-stand-2026-09-02),
[Design](specs/2026-08-21-ai-analytics-design.md),
[Architektur-Backlog](adr/backlog.md).

## Positionierung

Die zentrale Lücke, die `ai-analytics` schließt, ist die Verbindung von:

- automatischer Discovery historisierter ioBroker-Objekte
- semantischem Onboarding schlecht dokumentierter Objektbäume
- Chat-Q&A über historische Daten
- typgerechten Zeitraumberechnungen
- proaktiver Prüfung derselben Daten auf erklärbare Auffälligkeiten

Der Differenzierer ist damit nicht ein weiterer allgemeiner Chat oder eine
unkontrollierte Gerätesteuerung, sondern nachvollziehbare Analytics mit
begrenztem und testbarem KI-Einsatz.

## Priorisierte TODOs

### 0. Aktuellen Kern live abnehmen

**Nutzen: sehr hoch · Risiko: niedrig · Status: offen**

- `v0.0.1-beta.21` auf einer echten ioBroker-Instanz installieren
- Discovery, Onboarding und Katalogeinträge prüfen
- Chat-Fragen mit Tages-/Wochenvergleich prüfen
- proaktive Prüfung und Datenqualitätsfelder prüfen
- Geräte-Tab, Backfill, CSV und Provider-Konfiguration prüfen

Warum zuerst: Die Kernpositionierung ist implementiert, aber ein echter Betrieb
zeigt schneller als weitere Features, ob Datenqualität, Antworten und Bedienung
den versprochenen Nutzen tatsächlich liefern.

### 1. Hybride Anomalieerkennung

**Nutzen: sehr hoch · Risiko: mittel · Status: Phase 1 umgesetzt**

- statistische Voranalyse für Baselines, Trends, Streuung, Ausreißer,
  Staleness und Datenlücken
- nur auffällige Kandidaten an das LLM zur Erklärung geben
- Schwellenwerte und Verfahren nachvollziehbar dokumentieren

Das ist der größte funktionale Schritt über den heutigen freien Prüf-Prompt
hinaus und reduziert Kosten sowie Fehlinterpretationen.

Phase 1 ist seit `v0.0.1-beta.23` umgesetzt. Sie umfasst numerische
Gauge-Zeitreihen, robuste Abweichungen, Datenlücken-Kandidaten und das
LLM-Gate. Zähler, Boolean-Zustände und Korrelationen bleiben Folgearbeiten.

### 2. Belege und Nachvollziehbarkeit pro Aussage

**Nutzen: sehr hoch · Risiko: mittel · Status: teilweise vorbereitet**

- verwendete Datenpunkte, Zeiträume und Kennzahlen in Meldungen ausweisen
- Datenvollständigkeit und Unsicherheit sichtbar machen
- optional kleine Verlaufsgrafiken oder strukturierte Belegdaten ergänzen
- Ergebnisse zusätzlich maschinenlesbar als JSON/States bereitstellen

Das stärkt den wichtigsten Qualitätsanspruch: keine vagen KI-Vermutungen.

### 3. Alarm-Lebenszyklus

**Nutzen: sehr hoch · Risiko: mittel · Status: offen**

- persistente Ereignis-ID und Schweregrad
- Deduplizierung und Cooldown gegen Spam
- Bestätigung, Ignorieren und „später erinnern“
- Meldung, wenn ein Problem behoben ist
- History-Ausfälle und fachliche Auffälligkeiten über dasselbe Modell führen

### 4. Strukturierte Berichte

**Nutzen: hoch · Risiko: niedrig bis mittel · Status: offen**

- konfigurierbare Tages-, Wochen- und Monatsberichte
- Energie, Wasser, Heizung und PV als zentrale Anwendungsfälle
- Vergleich mit vorherigen Zeiträumen
- Ausgabe im Chat und später über Benachrichtigungskanäle

### 5. Aktueller Zustand plus Historie

**Nutzen: hoch · Risiko: niedrig · Status: offen**

- eng begrenztes Read-only-Werkzeug für den aktuellen Wert katalogisierter
  Objekte
- aktuelle Situation mit historischem Verlauf und Auffälligkeit verbinden
- Schreibbarkeit bleibt dabei nur Metadateninformation

### 6. Weitere Ausgabekanäle

**Nutzen: hoch · Risiko: mittel · Status: zurückgestellt**

- zuerst generischer ioBroker-`sendTo`-Kanal
- danach Telegram oder Pushover anhand realer Nutzung priorisieren
- Chat bleibt der Diagnose- und Rückfragekanal

### 7. Korrelationen und abgeleitete Kennzahlen

**Nutzen: hoch · Risiko: hoch · Status: offen**

- PV, Netzbezug, Batterie und Verbraucher gemeinsam analysieren
- Raumtemperatur, Heizung und Fensterzustände korrelieren
- abgeleitete Kennzahlen wie Eigenverbrauch, Laufzeit oder Wirkungsgrad

### 8. Semantische Datenqualität vervollständigen

**Nutzen: mittel bis hoch · Risiko: mittel · Status: teilweise umgesetzt**

Bereits umgesetzt: `writable`, `writePattern`, `updateFrequency`,
`dataCompleteness`.

Offen:

- Sicherheitsklasse
- Synonyme und alternative Bezeichnungen
- Nutzung der Informationen für spätere Automationsvorschläge

### 9. Simulation und Evaluation

**Nutzen: hoch · Risiko: mittel · Status: offen**

- historische Daten in einem Trockentest wiedergeben
- Antworten, Warnungen, Kosten und Latenz messen
- unerlaubte State-Änderungen sicher erkennen
- Grundlage für belastbare Modell- und Promptvergleiche

### 10. Discovery und Skalierung

**Nutzen: mittel · Risiko: mittel · Status: teilweise umgesetzt**

- automatische inkrementelle Re-Discovery
- Umgang mit sehr großen Katalogen
- Vorfilterung nach Kategorie, Raum oder Relevanz vor dem LLM-Aufruf
- History-Instanz-Auswahl bleibt vorerst zurückgestellt

### 11. Lokale Provider und Datenschutz

**Nutzen: mittel bis hoch · Risiko: mittel · Status: teilweise umgesetzt**

- komfortable Voreinstellungen für Ollama, LM Studio, LocalAI und OpenWebUI
- konfigurierbare Timeouts
- sichtbare Datenfluss-, Datenschutz- und Kostenhinweise bei Cloud-Modellen
- definierte Reaktion auf Timeout, Kontingentüberschreitung und Offline-Betrieb

### 12. Sicherer Aktionsrahmen

**Nutzen: potenziell sehr hoch · Risiko: sehr hoch · Status: bewusst später**

- Scopes und erlaubte/gesperrte Datenpunkte
- Vorschau und explizite Nutzerbestätigung
- Grenzwerte, zeitlich begrenzte Aktionen und Audit-Log
- Rollback für kosten- oder sicherheitsrelevante Zustände

Freie allgemeine Aktorsteuerung ist kein geeigneter Default dieses Analytics-
Adapters. Sie darf erst nach einer eigenen Sicherheitsentscheidung beginnen.

### 13. Provider- und Kostenrouting

**Nutzen: mittel · Risiko: hoch · Status: zurückgestellt**

- einheitliche Preis- und Fähigkeitsprofile
- Cache-Strategien und nachvollziehbarer Fallback
- automatische Kosten-/Qualitätsauswahl nur bei reproduzierbaren Testfällen

Die automatische Kandidatenauswahl ist derzeit ausdrücklich nicht erforderlich.

### 14. Release- und Beta-Entscheidung

**Nutzen: mittel · Risiko: niedrig · Status: offen**

- Kriterien für `0.1.0` festlegen
- erfolgreicher Langzeitbetrieb und Live-Abnahme berücksichtigen
- bekannte kritische Lücken und Qualitätsziele bewerten

## Bewusste Nicht-Ziele

Diese Wünsche wurden dokumentiert, aber nicht als nächster Produktfokus
priorisiert:

- WhatsApp-/Alexa-Anbindung
- allgemeine Gerätesteuerung ohne Analytics-Bezug
- Code-/Blockly-Erzeugung
- permanenter Sprachassistent
- Kameraanalyse
- Katalog-Backup/-Restore, da CSV-Export/-Import vorhanden ist
- automatische Auswahl unter mehreren LLM-Kandidaten

## Nächster empfohlener Entwicklungsschritt

Nach der Live-Abnahme ist **hybride Anomalieerkennung** der beste nächste
Produkt-Task. Sie schließt die größte verbleibende Nutzwertlücke, verbessert
gleichzeitig Kosten und Zuverlässigkeit und bildet die technische Grundlage für
Belege, Alarm-Lebenszyklus und strukturierte Berichte.
