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

## 1.4 Markt- und Bedarfsanalyse (Stand 2026-09-02)

Eine Recherche in GitHub, im ioBroker-Forum und in öffentlichen Feature-Requests bestätigt eine erkennbare Produktlücke: Es gibt Projekte für historischen Chat, allgemeine Gerätesteuerung oder statistische Anomalieerkennung, aber kein etabliertes Projekt verbindet automatische ioBroker-History-Discovery, semantisches Onboarding, Chat-Q&A, typgerechte Zeitraumvergleiche und proaktive Prüfungen in einem Produkt.

### Vergleichbare Projekte

| Projekt | Relevante Fähigkeiten | Abgrenzung zu `ai-analytics` |
|---|---|---|
| [ioBroker.ai-assistant](https://github.com/ToGe3688/ioBroker.ai-assistant) | States lesen/schreiben, Trigger, Zeitpläne, mehrere Provider | Keine automatische Erschließung und Analyse historisierter Daten |
| [ioBroker.ai-autopilot](https://github.com/stephan77/iobroker.ai-autopilot) | Geplante Baselines, Trends, Berichte und Telegram-Ausgabe | Früher Prototyp, kein allgemeiner historischer Chat-Agent |
| [Extended OpenAI Conversation](https://github.com/jekalmin/extended_openai_conversation) | Home-Assistant-Steuerung sowie History- und SQL-Abfragen | Kein semantisches Onboarding und kein eingebautes proaktives Monitoring |
| [influx-mcp](https://github.com/nickcheban/influx-mcp) | InfluxDB-Werkzeuge und statistische Anomaliesuche | Daten-Backend statt fertiger Smart-Home-Chat- und Monitoring-Lösung |
| [Jeeves Agent](https://github.com/bulldoguk/jeeves-agent) | Baselines, Deduplizierung, Meldung neu aufgetretener und behobener Probleme | Kein allgemeines Chat-Q&A; früher Prototyp |
| [Argus](https://github.com/krzyl2/argus) | Kontinuierliche statistische Anomalieerkennung mit Scores und Hysterese | Keine LLM-Erklärung und kein Chat |
| [Home LLM](https://github.com/acon96/home-llm) | Lokaler Sprach-/Chat-Agent und Gerätesteuerung | Aktueller Zustand und Steuerung statt historischer Analytics |

`ioBroker.insights` enthält zum Recherchezeitpunkt noch keine nennenswerte Implementierung. Der funktional ähnlich beschriebene `ioBroker.ai-autopilot` ist bisher vor allem ein experimentelles Konzept. Die belastbare Positionierung von `ai-analytics` bleibt daher: **providerunabhängiger ioBroker-Analytics-Agent, der historisierte Daten semantisch erschließt, dazu Fragen beantwortet und dieselben Daten proaktiv auf erklärbare Auffälligkeiten prüft.**

### Beobachteter Nutzerbedarf

Wiederkehrende öffentliche Anfragen betreffen insbesondere:

- Tages-, Wochen- und Monatsberichte zu Energie, Wasser, Heizung und PV
- Vergleiche mit vorherigen Zeiträumen und Erkennung ungewöhnlichen Verhaltens
- verständliche proaktive Meldungen über Telegram, Pushover oder andere ioBroker-Kanäle
- gemeinsame Betrachtung aktueller Zustände und historischer Verläufe
- lokale Modelle, Datenschutz, Providerfreiheit und konfigurierbare Timeouts
- begrenzbare Kosten, Tokenverbrauch und Kontextgröße
- nachvollziehbare Aussagen mit verwendeten Datenpunkten, Zeiträumen und Kennzahlen
- semantische Erschließung großer, schlecht dokumentierter Objektbäume
- Vorschläge für neue Automationen; autonome Aktorsteuerung wird dagegen deutlich zurückhaltender bewertet

Wichtige Quellen:

- [ioBroker AdapterRequest #834: ChatGPT/OpenAI](https://github.com/ioBroker/AdapterRequests/issues/834)
- [ioBroker-Forum: Test Adapter AI Assistant](https://forum.iobroker.net/topic/78918/test-adapter-ai-assistant-v0-1-3-github-latest)
- [ioBroker-Forum: 10 Ideen generative KI im Smart Home](https://forum.iobroker.net/topic/81092/10-ideen-generative-ki-im-smart-home-einsetzen)
- [ioBroker-Forum: Zeigt her eure KI-Projekte](https://forum.iobroker.net/topic/83856/zeigt-her-eure-ki-projekte)
- [AI Toolbox Issue #35: Ollama-Unterstützung](https://github.com/ToGe3688/ioBroker.ai-toolbox/issues/35)
- [AI Assistant Issue #25: konfigurierbarer Timeout für lokale Modelle](https://github.com/ToGe3688/ioBroker.ai-assistant/issues/25)

### Abgeleitete Funktionslücken

Die folgenden Punkte sind Rechercheergebnisse und noch keine beschlossenen Anforderungen. Neue Verhaltensänderungen benötigen weiterhin Spec, Plan und gegebenenfalls ADR.

#### Priorität 1: Verlässliche Analytics und Warnungen

1. **Hybride Anomalieerkennung:** Statistische Voranalyse für Baselines, Trends, Streuung, Ausreißer, Staleness und Datenlücken; nur auffällige Kandidaten werden dem LLM zur Erklärung vorgelegt. Das reduziert Kosten und freie LLM-Fehlinterpretationen.
2. **Alarm-Lebenszyklus:** Persistente Ereignis-ID, Schweregrad, erster/letzter Zeitpunkt, Deduplizierung, Cooldown, Bestätigung und Meldung, wenn ein Problem behoben ist. Dies erweitert den bereits bekannten Bedarf nach deduplizierten History-Ausfallmeldungen auf alle Auffälligkeiten.
3. **Belege pro Aussage:** Verwendete Datenpunkte, Zeit- und Vergleichszeiträume, Kennzahlen, Datenvollständigkeit sowie optional kleine Verlaufsgrafiken direkt an jeder Meldung.
4. **Robuster History-Zugriff:** Vollständige Verarbeitung dichter Zeitreihen statt des verbleibenden 2.000-Rohwert-Risikos, klare Unterscheidung zwischen fehlenden Daten und Adapterausfällen sowie korrekte Anfangszustände bei Boolean-Auswertungen.
5. **Aktueller Zustand plus Historie:** Eng begrenztes Werkzeug für den aktuellen Wert katalogisierter Objekte, damit Fragen und Warnungen den momentanen Zustand zuverlässig mit dem Verlauf verbinden können.

#### Priorität 2: Produktnutzen und Bedienbarkeit

6. **Strukturierte Berichte:** Konfigurierbare Tages-, Wochen- und Monatsberichte statt ausschließlich freier Auffälligkeitsmeldungen.
7. **Weitere Ausgabekanäle:** Mindestens Telegram und ein generischer ioBroker-`sendTo`-Kanal; der Admin-Chat allein reicht für proaktive Meldungen nicht aus.
8. **Nutzerfeedback zu Warnungen:** Aktionen wie „hilfreich“, „Fehlalarm“, „ignorieren“ und „später erinnern“, aus denen sich objektspezifische Empfindlichkeit, Ruhezeiten und Unterdrückungen ergeben können.
9. **Objektgruppen, Korrelationen und abgeleitete Kennzahlen:** Gemeinsame Auswertung beispielsweise von PV, Netzbezug, Batterie und Verbrauchern oder von Raumtemperatur, Heizung und Fensterzuständen.
10. **Automatische inkrementelle Re-Discovery und Skalierung:** Periodische Erkennung neuer historisierter Objekte, Auswahl der History-Instanzen sowie Vorfilterung großer Kataloge vor dem LLM-Aufruf.
11. **Komfort für lokale Provider:** Voreinstellungen für Ollama, LM Studio, LocalAI und OpenWebUI, Betrieb ohne API-Key-Zwang, konfigurierbare Timeouts und aussagekräftige Verbindungsdiagnose.
12. **Strukturierte Weiterverarbeitung:** Analyseergebnisse zusätzlich als States sowie JSON-/CSV-Export für Skripte, VIS, Grafana und Benachrichtigungsadapter.

#### Priorität 3: Sicherheit, lokale Nutzung und Qualitätssicherung

13. **Sicherer Aktionsrahmen:** Lesen bleibt der Standard. Schreibaktionen benötigen Scopes, Vorschau, Bestätigung, erlaubte/gesperrte Datenpunkte, Grenzwerte und ein Audit-Log. Zeitlich begrenzte Aktionen und Rollback sollten für kosten- oder sicherheitsrelevante Zustände vorgesehen werden. Allgemeine freie CLI- oder Aktorsteuerung ist kein geeigneter Default für diesen Analytics-Adapter.
14. **Lokale Modelle mit Cloud-Fallback:** Ollama, LM Studio und LocalAI sollten ohne API-Key-Zwang einfach konfigurierbar sein. Für Cloud-Provider braucht es sichtbare Datenschutz-, Kosten- und Datenfluss-Hinweise sowie ein definiertes Verhalten bei Timeout, Kontingentüberschreitung oder fehlender Internetverbindung.
15. **Semantische Datenqualität:** Katalogeinträge sollten neben Kategorie, Raum, Einheit und Wertart auch Schreibbarkeit, Sicherheitsklasse, Aktualisierungsfrequenz, Synonyme und Datenvollständigkeit abbilden. Das ist die Grundlage für zuverlässige Antworten, MCP-Integrationen und spätere Automationsvorschläge.
16. **Simulation und Evaluation:** Historische Daten sollten für einen Trockentest wiedergegeben werden können. Aktionen, JSON-Ausgaben, Kosten, Latenz, Fehlerrate und unerlaubte State-Änderungen müssen prüfbar sein, bevor eine AI-Automation produktiv verwendet wird.
17. **Provider- und Kostenrouting:** Bei mehreren konfigurierten Modellen fehlen weiterhin einheitliche Preis-/Fähigkeitsprofile, Budgetgrenzen, Cache-Strategien und ein nachvollziehbarer Fallback. Ein automatisches Kosten-/Qualitäts-Ranking bleibt eine spätere Entscheidung und benötigt zuerst reproduzierbare Testfälle.

Diese Ergänzungen schärfen die Positionierung gegenüber bestehenden Projekten wie `ioBroker.ai-assistant`, `ioBroker.ai-toolbox`, `ioBroker.ai-usage` und jungen MCP-Gateways: Der Differenzierer sollte nicht ein weiterer allgemeiner Chat oder eine unkontrollierte Gerätesteuerung sein, sondern nachvollziehbare Analytics mit sicherem, begrenztem und testbarem AI-Einsatz.

### Bewusste Abgrenzung

Allgemeine Gerätesteuerung, Code-/Blockly-Erzeugung, ein permanenter Sprachassistent und Kameraanalyse sind sichtbar nachgefragt, werden aber bereits von anderen Adaptern bedient. Sie sollten nicht vor den Analytics-Kernfunktionen priorisiert werden. Auch Energieoptimierung sollte das LLM primär für Konfiguration und Erklärung einsetzen; sicherheits- oder kostenrelevante Regelung bleibt besser deterministisch und eng begrenzt.

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · weiter zu [2. Randbedingungen](02-randbedingungen.md)
