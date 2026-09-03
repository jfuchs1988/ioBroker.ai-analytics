# 8. Querschnittliche Konzepte

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 8.1 Nachrichtenformat zwischen Agent/Tools/Providern (normalisiert)

```
{ role: 'user'|'assistant'|'tool', content, toolCalls?: [{id,name,input}], toolCallId?, name? }
```

Jeder Provider-Client übersetzt dieses normalisierte Format in sein eigenes Wire-Format (Anthropic content-blocks vs. OpenAI `tool_calls`) und zurück — der Agent-Loop selbst kennt kein Provider-spezifisches Detail.

## 8.2 Fehlerbehandlung

- LLM-API-Fehler: Retry mit Backoff (`withRetry`, 3 Versuche, 500ms-Basis-Backoff) transparent im Provider, bevor der Fehler den Aufrufer erreicht.
- Datenzugriffsfehler (`getHistory` schlägt fehl): als Tool-Fehler an den Agenten zurückgegeben (`{error: message}`), der Agent kann das in seiner Antwort berücksichtigen statt abzustürzen.
- Unklare Objekte: bleiben `needsReview:true`, werden von Analysen ausgeschlossen bis der Nutzer sie im Chat klärt (siehe bekannte Lücke in [Risiken](11-risiken-und-schulden.md)).
- Entfernte History-Objekte: Katalogeintrag wird `active:false`, nicht gelöscht (siehe auch Reaktivierung in [Laufzeitsicht §6.1](06-laufzeitsicht.md#61-onboarding-beim-adapterstart-und-danach-inkrementell)).
- Korrupte/handbearbeitete Katalog-States: `getAllCatalogEntries` überspringt und loggt einen einzelnen kaputten Eintrag statt beim `JSON.parse` den kompletten Adapterstart abzubrechen.
- Leere/fehlende Chat-Frage: wird vor der Verarbeitung abgelehnt (`{error: 'Leere Frage'}`) statt einen fehlerhaften LLM-Request auszulösen.
- Ungültiges Prüfintervall (`checkIntervalHours` negativ, 0 oder nicht-numerisch): fällt auf 24h zurück statt ein Intervall nahe 0ms zu erzeugen, das die KI in einer engen Schleife aufrufen würde. Zusätzlich in der Admin-Konfiguration mit `min:1` abgesichert.
- Beide LLM-System-Prompts (Chat-Q&A und proaktive Prüfung) enthalten einen expliziten Zeitanker (aktuelle ISO-Zeit + Unix-Millisekunden), da die Werkzeuge `getHistory`/`compareTimeframes` relative Zeitfenster sonst nicht korrekt bestimmen könnten (siehe [ADR-0014](../adr/0014-zeitanker-in-system-prompts.md)).

## 8.3 Sicherheits-/Zugriffskonzept

- Die KI hat **nie** direkten Datenbank-Query-Zugriff — nur die kuratierten Werkzeuge.
- Seit [ADR-0017](../adr/0017-scoped-catalog-write-capability.md) hat die KI eine einzige, eng begrenzte Schreibfähigkeit: `updateCatalogEntry` darf ausschließlich Katalogeinträge mit `needsReview: true` bearbeiten, um im Chat geklärte Rückfragen aufzulösen. Kein anderer Schreibzugriff existiert.
- Der API-Key wird in `io-package.json` über `encryptedNative`/`protectedNative` als verschlüsselt und geschützt markiert — js-controller verschlüsselt ihn in der Objekte-DB und sendet ihn nicht an Nicht-Admin-Clients. Das `password`-Feld in der Admin-JSON-Config maskiert zusätzlich nur die Eingabe im Browser; die eigentliche Absicherung von Speicherung/Transport kommt von `encryptedNative`/`protectedNative` (siehe [ADR-0013](../adr/0013-api-key-verschluesselung.md)).
- Adapter schreibt nur in seinen eigenen State-Namespace (`catalog.*`, `chat.*`) — keine Schreibzugriffe auf fremde Objekte im aktuellen Funktionsumfang (nur Lesezugriff auf historisierte Werte). Sollte sich das künftig ändern (z. B. ein Werkzeug, das Geräte schaltet), ist das eine eigene, noch offene Architekturentscheidung — siehe [Offene Architekturentscheidungen](../adr/backlog.md).
- **Vertrauensgrenze der UI-Befehls-Handler:** Befehle aus dem Admin-Tab erreichen `main.js` über zwei Kanäle mit derselben Vertrauensgrenze: den Adapter-Message-Bus (`adapter.on('message', ...)`, seit [ADR-0020](../adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md) inkl. vollem Katalog-Schreibzugriff für Menschen) und — als Ausweichkanal — den State `admin.bridge` ([ADR-0023](../adr/0023-state-bridge-ausweichkanal-admin-tab.md), Whitelist auf dieselben sechs Befehle). Aufrufer sind entweder die Admin-UI (bereits Admin-authentifiziert, `sendTo`/`setState` setzen eine gültige Admin-Session voraus) oder andere Adapter/Scripts in derselben ioBroker-Instanz, die ohnehin vollen Zugriff auf alle States und beliebigen Node-Code-Zugriff haben. Es gibt hier keine Privilegiengrenze, die eine zusätzliche Autorisierungsprüfung verteidigen müsste. Diese Einschätzung wurde in der finalen Whole-Branch-Review bewusst geprüft, nachdem ein automatischer Security-Scanner "fehlende Autorisierung" als generischen Befund gemeldet hatte (falsch-positiv relativ zu diesem Vertrauensmodell); mit ADR-0023 kam der Bridge-Kanal unter dieselbe Betrachtung.

## 8.4 Testkonzept

- Unit-Tests (mocha/chai/sinon) für jedes `lib/*`-Modul mit gemockter Adapter-API — kein echter DB- oder LLM-Zugriff nötig. Zusätzlich prüfen Proxyquire-/Sinon-Tests zentrale `main.js`-Orchestratorpfade. Stand: 276 Unit-Tests + 1 Adapter-Smoke-Test, alle grün (Stand 2026-09-03).
- Admin-UI (JSON Config, Chat-Tab) hat keine automatisierten Tests — dafür ein manueller Abnahmetest an einer echten ioBroker-Instanz (läuft aktuell, siehe [Risiken](11-risiken-und-schulden.md)).
- **Verbleibende Lücke:** `test/adapter.test.js` nutzt `@iobroker/testing`s `tests.unit`, das in der installierten v4-Version ein deprecated No-Op ist (druckt nur eine Warnung, lädt `main.js` nie, ruft nie `onReady`/`onUnload` auf). Ein echter End-to-End-Test von `runOnboarding` über `syncCatalog` bis zu Katalog-States sowie automatisierte DOM-Tests der Admin-UI existieren weiterhin nicht.

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [7. Verteilungssicht](07-verteilungssicht.md) · weiter zu [9. Architekturentscheidungen](09-architekturentscheidungen.md)
