# 1. Einführung und Ziele

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 1.1 Aufgabenstellung

`ioBroker.ai-analytics` ist ein ioBroker-Adapter, der zwei Fähigkeiten kombiniert:

1. **Chat-Q&A**: Der Nutzer stellt in natürlicher Sprache Fragen zu historischen Verbrauchs-/Nutzungsdaten (z. B. "Wie hat sich mein Stromverbrauch verändert und warum?"). Das System beantwortet sie anhand der in InfluxDB/History/SQL geloggten Objekte im ioBroker-Objektbaum.
2. **Proaktive Prüfungen**: Ein periodischer Hintergrundlauf lässt eine KI eigenständig auf Auffälligkeiten prüfen (Gerätenutzung, Lampen die lange an sind, Verbrauchsspitzen, ungewöhnlich niedrige PV-Einspeisung) und meldet Ergebnisse im Chat.

Auslöser war die Frage des Nutzers, welche KI/AI-Adapter es für ioBroker bereits gibt (AI Toolbox, AI Assistant von ToGe3688) — keiner davon deckte den konkreten Wunsch ab: Fragen zu historischen Daten mit Ursachenanalyse plus freie, KI-getriebene proaktive Überwachung. Daraus entstand die Entscheidung, einen eigenen, schlanken Adapter zu bauen (siehe [ADR-0001](../adr/0001-eigener-adapter-statt-erweiterung.md)).

## 1.2 Qualitätsziele

| Priorität | Qualitätsziel | Begründung/Szenario |
|---|---|---|
| 1 | **Nachvollziehbarkeit** | Jede Chat-Antwort und jede proaktive Meldung muss sich auf konkrete Werte/Vergleichszeiträume stützen — keine vagen Vermutungen (explizite Nutzeranforderung, siehe [Spec §Fehlerbehandlung](../specs/2026-08-21-ai-analytics-design.md)). |
| 2 | **Kontrollierter KI-Datenzugriff** | Die KI bekommt nie rohen Datenbank-Query-Zugriff, sondern nur kuratierte Werkzeuge — begrenzt Fehl-/Missbrauchsrisiko und hält das System portabel zwischen InfluxDB/History/SQL. |
| 3 | **Geringe Kosten/Overhead** | Katalog-Caching (einmaliges Onboarding statt Neu-Klassifizierung bei jeder Anfrage), kein Rohdaten-Dump in den LLM-Kontext. |
| 4 | **Provider-Flexibilität** | Austauschbare LLM-Provider (Anthropic, OpenAI, OpenRouter, lokal) ohne Codeänderung — Nutzerpräferenz aus dem Brainstorming. |
| 5 | **Betreibbarkeit für einen Einzelnutzer** | Kein Overengineering für Multi-Tenant/Public-SaaS-Anforderungen (bewusstes YAGNI, siehe [Architekturentscheidungen](09-architekturentscheidungen.md)). |

## 1.3 Stakeholder

| Rolle | Erwartung |
|---|---|
| Johannes Fuchs (Nutzer/Betreiber) | Adapter läuft in der eigenen ioBroker-Instanz, beantwortet Fragen zuverlässig, meldet proaktiv Auffälligkeiten, ohne zu spammen. |
| Zukünftige Wartung (auch: zukünftige Claude-Code-Sessions) | Code und Entscheidungen müssen ohne Rückfragen beim Nutzer nachvollziehbar sein — daher diese Dokumentation. |

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · weiter zu [2. Randbedingungen](02-randbedingungen.md)
