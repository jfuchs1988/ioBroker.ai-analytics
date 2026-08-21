# 6. Laufzeitsicht

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 6.1 Onboarding (beim Adapterstart und danach inkrementell)

1. `discovery.findHistorizedObjects` ermittelt alle Objekte mit aktivem Logging.
2. `catalog.getAllCatalogEntries` liefert bereits bekannte Objekte. Nicht mehr gefundene werden auf `active:false` gesetzt. Objekte, die wieder auftauchen (History-Instanz neu gestartet, `custom` aus- und wieder eingeschaltet) oder deren `historyInstance` sich geändert hat, werden reaktiviert (`active:true`) und mit aktuellem `lastSeen`/`historyInstance` neu geschrieben — sonst blieben sie dauerhaft von Analysen ausgeschlossen.
3. `onboarding.runOnboarding` klassifiziert die verbleibenden unbekannten Objekte in Batches (max. 20) über einen einmaligen Prompt an den Provider (kein Tool-Loop nötig, da nur vorhandene Metadaten verwendet werden). Eine fehlgeschlagene Klassifizierung eines einzelnen Objekts (z. B. ungültige Kategorie) verwirft nur diesen einen Eintrag, nicht den gesamten Batch.
4. Objekte mit niedrigem Vertrauensgrad werden gesammelt und als **eine gebündelte** Chat-Nachricht als Rückfrage gepostet (nicht einzeln, um den Nutzer nicht zu fluten). **Bekannte Lücke:** diese Rückfrage ist aktuell nicht beantwortbar — der Chat-Agent hat keine schreibenden Werkzeuge, siehe [Risiken](11-risiken-und-schulden.md).
5. Ist kein API-Key konfiguriert (Erstinstallation), überspringt `onReady` Katalog-Sync und Scheduler komplett und loggt eine Warnung, statt zahllose fehlschlagende Erstversuche auszulösen.

**Bestätigt im Abnahmetest (2026-08-21):** Discovery, Katalog-Sync und Onboarding laufen auf einer echten ioBroker-Instanz wie hier beschrieben.

## 6.2 Chat-Q&A

1. Nutzerfrage kommt über den Chat-Tab als `sendTo`-Message (`chatQuestion`) an `main.js`.
2. `appendChatMessage` loggt die Frage, `runAgent` startet mit der Frage als Ziel.
3. Der Agent ruft iterativ `listCatalog`/`getHistory`/`compareTimeframes` auf, bis genug Datengrundlage vorliegt.
4. Finale Antwort wird geloggt und als Socket-Antwort an den Chat-Tab zurückgegeben.

**Bestätigt im Abnahmetest (2026-08-21): dieser Ablauf ist aktuell blockiert.** Der Admin-Chat-Tab rendert, aber Nachrichten können nicht abgeschickt werden — der Ablauf 1–4 wurde serverseitig nie erreicht. Details und Ursachenhypothese in [Risiken](11-risiken-und-schulden.md).

## 6.3 Proaktive Prüfung

1. `scheduler.startProactiveScheduler` löst nach konfigurierbarem Intervall (Default 24h) `runProactiveCheck` aus.
2. Derselbe Agent-Loop läuft mit einem Prüfauftrags-Prompt statt einer Nutzerfrage.
3. Ergebnis wird geloggt — bei "keine Auffälligkeiten" nur, wenn `silentIfNothingFound` **nicht** gesetzt ist (Default: Bestätigung posten, siehe [ADR-0006](../adr/0006-default-bestaetigung-posten.md)).

Noch nicht im Abnahmetest geprüft (Testlauf würde bis zu 24h nach Adapterstart dauern, oder erfordert einen manuellen Trigger, den es aktuell nicht gibt — siehe [Offene Architekturentscheidungen](../adr/backlog.md)).

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [5. Bausteinsicht](05-bausteinsicht.md) · weiter zu [7. Verteilungssicht](07-verteilungssicht.md)
