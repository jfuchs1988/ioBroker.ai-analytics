# 12. Glossar

[← zurück zur Architektur-Übersicht](arc42-index.md)

| Begriff | Bedeutung |
|---|---|
| Katalog | Persistierte, semantisch angereicherte Liste aller historisierten Objekte (State-Speicher unter `catalog.*`) |
| Katalogeintrag / Entry | Ein JSON-Objekt im Katalog mit den Feldern `sourceId, description, unit, category, room, confidence, needsReview, active, historyInstance, lastSeen` |
| Onboarding | Einmaliger (danach inkrementeller) Klassifizierungslauf für neu entdeckte Objekte |
| Historisiertes Objekt | ioBroker-Objekt mit aktivem Logging in influxdb/history/sql (`common.custom[...].enabled === true`) |
| Tool-Calling-Agent | LLM-Aufruf-Loop, bei dem das Modell selbst entscheidet, welche Werkzeuge (Datenabfragen) es wann aufruft |
| Werkzeug / Tool | Eine der drei kuratierten Funktionen, die der Agent aufrufen kann: `listCatalog`, `getHistory`, `compareTimeframes` |
| Proaktive Prüfung | Periodischer, KI-getriebener Hintergrundlauf ohne feste Regeln, der Auffälligkeiten meldet |
| needsReview | Katalog-Flag für Objekte, deren Bedeutung die KI nicht sicher einordnen konnte |
| Confidence / Vertrauensgrad | `"high"` oder `"low"` — Selbsteinschätzung der KI bei der Onboarding-Klassifizierung eines Objekts |
| Batch | Gruppe von max. 20 unklassifizierten Objekten, die zusammen in einem Onboarding-Prompt an den Provider geschickt werden |
| Provider | Austauschbarer LLM-Client hinter einer einheitlichen Schnittstelle (`createProvider`) — Anthropic, OpenAI, OpenRouter oder ein lokaler OpenAI-kompatibler Server |
| Retry-mit-Backoff | Automatische Wiederholung eines fehlgeschlagenen LLM-API-Aufrufs (bis zu 3 Versuche, steigende Wartezeit) |
| ADR (Architecture Decision Record) | Kurzes Dokument, das eine einzelne Architekturentscheidung mit Kontext, Entscheidung und Konsequenzen festhält — siehe [ADR-Übersicht](../adr/adr-index.md) |
| MOC (Map of Content) | Obsidian-Konvention für eine "Hub"-Notiz, die auf verwandte Notizen verlinkt statt deren Inhalt zu wiederholen — hier: [docs/README.md](../README.md), [arc42-index.md](arc42-index.md), [adr-index.md](../adr/adr-index.md) |

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [11. Risiken und technische Schulden](11-risiken-und-schulden.md)
