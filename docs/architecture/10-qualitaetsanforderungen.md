# 10. Qualitätsanforderungen

[← zurück zur Architektur-Übersicht](arc42-index.md)

Auszug als Szenarien (verbindliches Qualitätsmodell würde ein volles Qualitätsbaum-Diagramm brauchen — bei diesem Projektumfang reicht die Szenario-Tabelle, siehe [ADR-0015](../adr/0015-dokumentationsstruktur.md) zur bewusst schlanken Dokumentationstiefe).

| Szenario | Anforderung |
|---|---|
| Nutzer fragt "Warum ist der Verbrauch gestiegen?" | Antwort nennt konkrete Objekte, Werte und Vergleichszeiträume — keine pauschale Vermutung. |
| Ein unbekanntes Objekt taucht neu im Objektbaum auf (History aktiviert) | Wird beim nächsten inkrementellen Scan erkannt, klassifiziert, bei Unsicherheit im Chat nachgefragt — nicht stillschweigend ignoriert oder falsch eingeordnet. |
| LLM-API ist kurzzeitig nicht erreichbar | Automatischer Retry mit Backoff; erst danach sichtbarer Fehler. |
| History-Adapterinstanz fällt komplett aus | Bekannte Lücke (siehe [Risiken](11-risiken-und-schulden.md)) — aktuell keine Deduplizierung wiederholter Ausfallmeldungen. |
| Provider wird gewechselt (z. B. Anthropic → lokal) | Nur Konfigurationsänderung nötig, kein Codeeingriff. |
| Adapter wird frisch installiert, noch kein API-Key hinterlegt | Startet trotzdem sauber, überspringt Katalog-Sync und proaktive Prüfung mit einer Log-Warnung, statt Hunderte fehlschlagender Erstversuche auszulösen. |
| Nutzer fragt "Wie war mein Verbrauch letzte Woche?" | Agent bestimmt den Zeitraum korrekt relativ zur tatsächlichen aktuellen Zeit (System-Prompt enthält einen Zeitanker), nicht relativ zum Trainingsstand des Modells. |
| Installation wächst auf mehrere hundert historisierte Objekte | Bekannte Lücke (siehe [Risiken](11-risiken-und-schulden.md)) — Katalog wird komplett als Kontext an die KI gegeben, keine Vorfilterung. |
| Nutzer möchte den Chat-Tab öffnen und eine Frage stellen | **Aktuell nicht erfüllt** — im Abnahmetest 2026-08-21 bestätigt: Tab rendert, Senden funktioniert nicht. Siehe [Risiken](11-risiken-und-schulden.md). |

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [9. Architekturentscheidungen](09-architekturentscheidungen.md) · weiter zu [11. Risiken und technische Schulden](11-risiken-und-schulden.md)
