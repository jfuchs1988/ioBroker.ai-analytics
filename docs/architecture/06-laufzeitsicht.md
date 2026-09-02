# 6. Laufzeitsicht

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 6.1 Onboarding (beim Adapterstart und danach inkrementell)

1. `discovery.findHistorizedObjects` ermittelt alle Objekte mit aktivem Logging.
2. `catalog.getAllCatalogEntries` liefert bereits bekannte Objekte. Nicht mehr gefundene werden auf `active:false` gesetzt. Objekte, die wieder auftauchen (History-Instanz neu gestartet, `custom` aus- und wieder eingeschaltet) oder deren `historyInstance` sich geändert hat, werden reaktiviert (`active:true`) und mit aktuellem `lastSeen`/`historyInstance` neu geschrieben — sonst blieben sie dauerhaft von Analysen ausgeschlossen.
3. `onboarding.runOnboarding` klassifiziert die verbleibenden unbekannten Objekte in nach Adaptertyp gruppierten Batches (max. 20) über einen einmaligen Prompt an den Provider. Zusätzlich wird jedes Objekt zweistufig als `valueKind` klassifiziert: zunächst aus Metadaten, danach bei Bedarf über eine History-Datenprobe. Eine fehlgeschlagene Klassifizierung eines einzelnen Objekts verwirft nur diesen einen Eintrag, nicht den gesamten Batch.
4. Objekte mit niedrigem Vertrauensgrad werden gesammelt und als **eine gebündelte** Chat-Nachricht als Rückfrage gepostet. Der Chat-Agent kann offene Katalogeinträge mit `updateCatalogEntry` auflösen; alternativ ist die Korrektur im Geräte-Reiter möglich.
5. Vor Schritt 3 prüft `onReady` beide Provider **unabhängig voneinander** einmalig auf Erreichbarkeit (`providerHealthCheck.checkProviderReachable`, zeitlich begrenzt auf 15 s je Provider) und legt das Ergebnis in `info.chatProviderReachable`/`info.onboardingProviderReachable` ab. Ist noch kein API-Key hinterlegt (Erstinstallation) und der Provider-Typ nicht `local`, entfällt der Netzaufruf ganz; es wird lediglich eine Warnung "noch nicht konfiguriert" geloggt. Eine fehlgeschlagene Prüfung blockiert **nur die betroffene Funktion**, nicht den Adapter: ohne erreichbares Onboarding-Modell entfällt allein Schritt 3/4 (Klassifikation und Rückfrage) — Discovery, Deaktivierung und Reaktivierung aus Schritt 1/2 laufen weiterhin; ohne erreichbares Chat-/Prüfungs-Modell werden proaktive Prüfläufe übersprungen und Chat-Fragen mit einem Hinweis abgelehnt. Der Scheduler startet in beiden Fällen trotzdem. Siehe [ADR-0021](../adr/0021-getrennte-provider-pro-zweck.md).
6. Die Prüfung läuft bewusst **nur beim Start** — kein periodisches Nachprüfen. Als Wiederherstellungspfad nach einem vorübergehenden Ausfall (z. B. lokaler LLM-Server beim Boot noch nicht oben) wiederholen die manuellen Admin-Aktionen "Geräte neu einlesen" und "Prüfung jetzt ausführen" im Geräte-Tab die Prüfung des jeweils betroffenen Providers, bevor sie ihre eigentliche Arbeit starten.

**Bestätigt im Abnahmetest (2026-08-21):** Discovery, Katalog-Sync und Onboarding laufen auf einer echten ioBroker-Instanz wie hier beschrieben.

## 6.2 Chat-Q&A

1. Nutzerfrage kommt über den Chat-Tab an `main.js` — Transport zentral über `callAdapter()`: langlaufende Befehle (Chat-Frage, Re-Scan, Prüfung) direkt über die State-Bridge (`admin.bridge`, `stateChange`-Handler), schnelle Befehle zuerst per `sendTo` mit Timeout und Bridge-Ausweichkanal, siehe [ADR-0023](../adr/0023-state-bridge-ausweichkanal-admin-tab.md). Beide Pfade laufen in denselben Dispatcher (`dispatchAdapterCommand`) — das Verhalten ab Schritt 2 ist identisch.
2. `appendChatMessage` loggt die Frage. `getRecentChatHistory` lädt bis zu zehn vorherige Nachrichten, die `runAgent` vor der neuen Frage in den Kontext übernimmt.
3. Der Agent ruft iterativ Katalog-, Rohdaten- und typbewusste Periodenwerkzeuge auf, bis genug Datengrundlage vorliegt. `getPeriodTotal` und `comparePeriods` werden für bekannte `valueKind`-Einträge bevorzugt.
4. Finale Antwort wird geloggt und als Socket-Antwort (bzw. Bridge-Antwort-State) an den Chat-Tab zurückgegeben; Fehler erscheinen sichtbar als Fehlerbubble im Chat.

**Abnahmetest-Status:** der ursprünglich ausschließlich `sendTo`-basierte Ablauf war auf der Testinstanz blockiert. Mit dem State-Bridge-Ausweichkanal und den korrigierten Antwort-/Polling-Formaten (2026-08-24) existiert ein funktionsfähiger Weg; ein erneuter Live-Test nach dem aktuellen Deployment bleibt als manueller Abnahmepunkt offen.

## 6.3 Proaktive Prüfung

1. `scheduler.startProactiveScheduler` löst nach konfigurierbarem Intervall (Default 24h) `runProactiveCheck` aus.
2. Derselbe Agent-Loop läuft mit einem Prüfauftrags-Prompt statt einer Nutzerfrage.
3. Ergebnis wird geloggt und nach `recordUsage` im Token-Verbrauch erfasst — bei "keine Auffälligkeiten" nur, wenn `silentIfNothingFound` **nicht** gesetzt ist (Default: Bestätigung posten, siehe [ADR-0006](../adr/0006-default-bestaetigung-posten.md)).

Noch nicht im aktuellen Abnahmetest geprüft; der manuelle Trigger „Prüfung jetzt ausführen“ ist inzwischen vorhanden.

## 6.4 Modellvorschläge in der Admin-Konfiguration

1. Das `autocompleteSendTo`-Feld sendet Provider-Typ, API-Key und optionale Basis-URL direkt an `listProviderModels`.
2. `providers.listModels` ruft den Modell-Endpunkt des gewählten Providers mit einem 15-Sekunden-Timeout auf. Der API-Key wird nur für diesen Aufruf verwendet und nicht geloggt oder persistiert.
3. OpenRouter verwendet standardmäßig `https://openrouter.ai/api/v1/models` und liefert nur Modelle zurück, deren Live-Metadaten kostenlose Ein-/Ausgabe und Tool-Calling ausweisen. Andere Provider liefern ihre verfügbaren Modelle ohne Kostenklassifikation.
4. Bei Fehlern erhält die UI eine leere Vorschlagsliste. `freeSolo:true` erlaubt weiterhin die manuelle Eingabe einer Modell-ID.

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [5. Bausteinsicht](05-bausteinsicht.md) · weiter zu [7. Verteilungssicht](07-verteilungssicht.md)
