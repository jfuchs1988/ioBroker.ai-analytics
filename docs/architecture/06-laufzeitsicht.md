# 6. Laufzeitsicht

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 6.1 Onboarding (beim Adapterstart und danach inkrementell)

1. `discovery.findHistorizedObjects` ermittelt alle Objekte mit aktivem Logging.
2. `catalog.getAllCatalogEntries` liefert bereits bekannte Objekte. Nicht mehr gefundene werden auf `active:false` gesetzt. Objekte, die wieder auftauchen (History-Instanz neu gestartet, `custom` aus- und wieder eingeschaltet) oder deren `historyInstance` sich geändert hat, werden reaktiviert (`active:true`) und mit aktuellem `lastSeen`/`historyInstance` neu geschrieben — sonst blieben sie dauerhaft von Analysen ausgeschlossen.
3. `onboarding.runOnboarding` klassifiziert die verbleibenden unbekannten Objekte in Batches (max. 20) über einen einmaligen Prompt an den Provider (kein Tool-Loop nötig, da nur vorhandene Metadaten verwendet werden). Eine fehlgeschlagene Klassifizierung eines einzelnen Objekts (z. B. ungültige Kategorie) verwirft nur diesen einen Eintrag, nicht den gesamten Batch.
4. Objekte mit niedrigem Vertrauensgrad werden gesammelt und als **eine gebündelte** Chat-Nachricht als Rückfrage gepostet (nicht einzeln, um den Nutzer nicht zu fluten). **Bekannte Lücke:** diese Rückfrage ist aktuell nicht beantwortbar — der Chat-Agent hat keine schreibenden Werkzeuge, siehe [Risiken](11-risiken-und-schulden.md).
5. Vor Schritt 3 prüft `onReady` beide Provider **unabhängig voneinander** einmalig auf Erreichbarkeit (`providerHealthCheck.checkProviderReachable`, zeitlich begrenzt auf 15 s je Provider) und legt das Ergebnis in `info.chatProviderReachable`/`info.onboardingProviderReachable` ab. Ist noch kein API-Key hinterlegt (Erstinstallation) und der Provider-Typ nicht `local`, entfällt der Netzaufruf ganz; es wird lediglich eine Warnung "noch nicht konfiguriert" geloggt. Eine fehlgeschlagene Prüfung blockiert **nur die betroffene Funktion**, nicht den Adapter: ohne erreichbares Onboarding-Modell entfällt allein Schritt 3/4 (Klassifikation und Rückfrage) — Discovery, Deaktivierung und Reaktivierung aus Schritt 1/2 laufen weiterhin; ohne erreichbares Chat-/Prüfungs-Modell werden proaktive Prüfläufe übersprungen und Chat-Fragen mit einem Hinweis abgelehnt. Der Scheduler startet in beiden Fällen trotzdem. Siehe [ADR-0021](../adr/0021-getrennte-provider-pro-zweck.md).
6. Die Prüfung läuft bewusst **nur beim Start** — kein periodisches Nachprüfen. Als Wiederherstellungspfad nach einem vorübergehenden Ausfall (z. B. lokaler LLM-Server beim Boot noch nicht oben) wiederholen die manuellen Admin-Aktionen "Geräte neu einlesen" und "Prüfung jetzt ausführen" im Geräte-Tab die Prüfung des jeweils betroffenen Providers, bevor sie ihre eigentliche Arbeit starten.

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
