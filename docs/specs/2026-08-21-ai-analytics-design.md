# ioBroker AI-Analytics-Adapter — Design

Status: Approved (Brainstorming abgeschlossen)
Datum: 2026-08-21

## Zweck

Ein neuer ioBroker-Adapter, der zwei Fähigkeiten kombiniert:

1. **Chat-Q&A**: Der Nutzer kann in natürlicher Sprache Fragen zu historischen
   Verbrauchs-/Nutzungsdaten stellen (z. B. "Wie hat sich mein
   Stromverbrauch verändert und warum?"), die das System anhand der in
   InfluxDB/History/SQL geloggten Objekte im ioBroker-Objektbaum
   beantwortet.
2. **Proaktive Prüfungen**: Ein periodischer Hintergrundlauf lässt die KI
   eigenständig auf Auffälligkeiten prüfen (Gerätenutzung, Lampen die lange
   an sind, Verbrauchsspitzen, ungewöhnlich niedrige PV-Einspeisung) und
   meldet Ergebnisse im Chat.

Beide Fähigkeiten teilen sich denselben Analyse-Kern (Katalog +
Datenzugriffsschicht + Tool-Calling-Agent).

## Nicht-Ziele (v1)

- Kein WhatsApp-/Alexa-Anbindung (als Erweiterung für später vorgesehen,
  siehe "Zukünftige Erweiterungen").
- Keine regelbasierte Schwellwert-Engine — die KI bewertet die Daten
  bei proaktiven Prüfungen vollständig selbst (bewusste Design-Entscheidung
  des Nutzers, inkl. akzeptiertem Trade-off bzgl. Kosten/Vorhersagbarkeit).
- Keine rohe Query-Sprache (Flux/InfluxQL) wird der KI direkt zugänglich
  gemacht — nur kuratierte Werkzeuge.

## Architektur

```
                    ┌─────────────────────────┐
                    │   Provider-Abstraktion   │  (Anthropic/OpenAI/
                    │  (konfigurierbares LLM)  │   OpenRouter/lokal)
                    └────────────┬─────────────┘
                                 │
   ┌───────────────┐   ┌────────▼─────────┐   ┌──────────────────┐
   │ Discovery      │   │  Tool-Calling-    │   │ Proaktiver        │
   │ Service        │──▶│  Agent            │◀──│ Prüf-Scheduler    │
   │ (History-Scan) │   │  (Chat + Checks)  │   │ (Cron)            │
   └───────┬────────┘   └────────┬─────────┘   └──────────────────┘
           │                     │
   ┌───────▼────────┐   ┌────────▼─────────┐
   │ Onboarding-     │   │ Datenzugriffs-    │
   │ Agent           │   │ schicht           │
   └───────┬────────┘   │ (getHistory-API)  │
           │             └────────┬─────────┘
   ┌───────▼─────────────────────▼─────────┐
   │         Katalog (State-Speicher)        │
   └──────────────────────────────────────────┘
```

### Komponenten

1. **Discovery Service** — scannt den Objektbaum nach Objekten mit
   aktivierter History-Anbindung (`common.custom["influxdb.X"|"history.X"|"sql.X"].enabled === true`).
   Nur diese Objekte sind für das System relevant. Läuft initial vollständig,
   danach inkrementell (z. B. täglich) um neue/entfernte Objekte zu erkennen.

2. **Onboarding-Agent** — für jedes neu entdeckte Objekt: sammelt
   vorhandene ioBroker-Metadaten (`common.name`, `common.role`,
   `common.unit`, Enum-Zugehörigkeit zu Raum/Funktion) und lässt die KI
   eine Klassifizierung vornehmen (Kategorie, Kurzbeschreibung,
   Vertrauensgrad). Objekte mit niedrigem Vertrauensgrad werden
   gebündelt (nicht einzeln) als Rückfrage im Chat-Tab gestellt. Die
   Nutzerantwort aktualisiert den Katalogeintrag.

3. **Katalog** — ein State pro erkanntem Quellobjekt mit strukturierten
   Metadaten:
   ```json
   {
     "sourceId": "javascript.0.verbrauch.gesamt",
     "description": "Gesamtstromverbrauch Haus",
     "unit": "kWh",
     "category": "consumption",
     "room": "gesamt",
     "confidence": "high",
     "needsReview": false,
     "active": true,
     "lastSeen": "2026-08-21T10:00:00Z"
   }
   ```
   Kategorien (v1): `consumption`, `generation_pv`, `lighting`,
   `device_usage`, `environment`. Objekte mit `needsReview: true` werden
   vom Agenten als "nicht verifiziert" behandelt und nicht automatisch in
   Aussagen einbezogen. Entfernte History-Objekte werden auf
   `active: false` gesetzt statt gelöscht.

4. **Datenzugriffsschicht** — kapselt den Zugriff auf historische Werte
   über ioBrokers generische `sendTo(<historyInstanz>, 'getHistory', ...)`-
   Message-API, unabhängig davon ob influxdb, history oder sql als Backend
   läuft. Bietet dem Agenten kontrollierte Werkzeuge:
   - `getHistory(sourceId, start, end, aggregation?)`
   - `compareTimeframes(sourceId, periodA, periodB)`
   - `listCatalog(filter?)`

5. **Tool-Calling-Agent** — iterativer Loop: Modell ruft Werkzeuge auf,
   bekommt Ergebnisse zurück, entscheidet über weitere Aufrufe, bis genug
   Datengrundlage für eine Antwort/Meldung vorliegt. Wird sowohl für
   Chat-Fragen als auch für proaktive Prüfungen verwendet, jeweils mit
   unterschiedlichem System-Prompt/Ziel.

6. **Proaktiver Prüf-Scheduler** — konfigurierbares Intervall (Default:
   täglich). Startet den Agenten mit dem Auftrag, katalogisierte Objekte
   auf Auffälligkeiten zu sichten. Postet nach jedem Lauf eine
   Chat-Nachricht — bei Auffälligkeiten mit konkreter Begründung
   (Werte/Vergleichszeiträume), sonst eine kurze Bestätigung ("keine
   Auffälligkeiten gefunden"). Dieses Verhalten ist über die
   Adapter-Konfiguration umschaltbar (still vs. Bestätigung), Default ist
   Bestätigung.

7. **Chat-Tab (Admin-UI)** — einziger Ausgabe-/Interaktionskanal in v1.
   Zeigt Konversationshistorie inkl. Onboarding-Rückfragen und
   proaktiver Meldungen.

8. **Provider-Abstraktion** — austauschbarer LLM-Client
   (Anthropic/OpenAI/OpenRouter/lokal via LM Studio o. ä.), analog zum
   Muster bestehender ioBroker-KI-Adapter (ai-toolbox/ai-assistant).

## Datenflüsse

### Onboarding
1. Discovery Service ermittelt alle geloggten Objekte ohne Katalogeintrag.
2. Metadaten pro Objekt sammeln → Onboarding-Agent klassifiziert.
3. Niedriger Vertrauensgrad → gebündelte Rückfrage im Chat.
4. Nutzerantwort aktualisiert Katalog.
5. Danach inkrementell im Hintergrund (neue/entfernte Objekte).

### Chat-Q&A
1. Nutzerfrage + vollständiger Katalog (nur Metadaten, kompakt) als
   Kontext an den Agenten.
2. Agent plant selbst, ruft `getHistory`/`compareTimeframes` iterativ auf.
3. Antwort mit Begründung im Chat, Konversation bleibt für Folgefragen im
   Kontext erhalten.

### Proaktive Prüfung
1. Scheduler triggert Agent mit Prüfauftrag über aktive Katalogobjekte.
2. Agent bewertet Daten selbst (keine festen Regeln), nutzt dieselben
   Werkzeuge.
3. Ergebnis (Auffälligkeit oder Bestätigung) als Chat-Nachricht.

## Fehlerbehandlung

- **LLM-API-Fehler** (Timeout/Rate-Limit/Auth): 1–2 Retries mit Backoff,
  danach System-Fehlermeldung im Chat statt Adapter-Absturz.
- **DB-Instanz nicht erreichbar**: Tool-Fehler wird dem Agenten
  zurückgegeben, fließt in die Antwort ein; Komplettausfall wird einmalig
  gemeldet, nicht bei jedem Lauf erneut.
- **Ungeklärte Objekte**: bleiben `needsReview: true`, werden von Analysen
  ausgeschlossen bis geklärt.
- **Entfernte History-Objekte**: Katalogeintrag wird `active: false`
  statt gelöscht.
- **Großer Katalog**: Vorfilterung nach Kategorie/Raum je nach
  Fragestellung als spätere Optimierung vorgesehen, kein Blocker für v1.
- **Halluzinationsrisiko** (bewusst gewählte freie KI-Bewertung ohne
  Regel-Engine): System-Prompt verlangt konkrete Werte/Vergleichszeiträume
  als Begründung, keine vagen Vermutungen.

## Konfiguration (Admin-UI)

- LLM-Provider + API-Key/Endpoint (mehrere Provider wählbar)
- History-Adapterinstanz(en), die berücksichtigt werden sollen
- Intervall für proaktive Prüfungen
- Stille vs. Bestätigungs-Modus für ergebnislose Prüfläufe (Default:
  Bestätigung)
- Manueller Trigger "Objekte neu einlesen" (Re-Discovery)

## Testkonzept

- Unit-Tests für Discovery-Logik und Datenzugriffsschicht mit gemockten
  ioBroker-Objekten/States (kein echter DB-/LLM-Zugriff).
- Agent-Tool-Loop-Tests mit gemockten LLM-Antworten (Fixtures) für
  Steuerlogik und Fehlerpfade, ohne API-Kosten in CI.
- Adapter-Grundgerüst getestet mit `@iobroker/testing`.
- Manueller Abnahmetest an echter Instanz: Onboarding-Lauf,
  Beispielfrage, ein proaktiver Prüflauf.

## Zukünftige Erweiterungen (out of scope v1)

- Zusätzliche Ausgabekanäle: WhatsApp-Chat, Alexa-Benachrichtigung.
- Vorfilterung/Kompression des Katalogs bei sehr großer Objektzahl.
