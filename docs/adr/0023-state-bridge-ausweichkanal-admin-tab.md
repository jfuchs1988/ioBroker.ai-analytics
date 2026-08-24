# ADR-0023: State-Bridge als Ausweichkanal für Admin-Tab-Befehle

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-24

## Kontext

Der Admin-Tab kommuniziert seit [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md) ausschließlich über ioBrokers `sendTo` mit dem Adapter (`main.js`s `onMessage`). Die Live-Diagnose am 2026-08-22 (Admin v7.8.23, js-controller 7.2.2) und Nutzerberichte vom 2026-08-24 zeigen jedoch: aus dem Legacy-HTML-Tab-Kontext erreicht ein `socket.emit('sendTo', ...)` den Adapter **nie** — ohne Fehlermeldung und ohne Callback-Antwort. Der React-Admin stellt Legacy-Tabs keinen privilegierten Socket mehr bereit (`window.parent.socket` existiert nicht), der same-origin-`io.connect()`-Fallback authentifiziert sich zwar korrekt, aber `sendTo` wird auf diesem Weg trotzdem nicht zugestellt. Lesende Befehle (`getState`) funktionieren über dieselbe Verbindung nachweislich einwandfrei.

Die Folge war eine stumm hängende UI: leere Geräteliste ohne Fehlermeldung, Chat-Senden-Button dauerhaft deaktiviert. Der bereits umgesetzte `adminUI.tab: "html"`-Fix allein behebt das Zustellproblem nicht.

Eine reine Diagnose-Verzögerung (weiter auf den `sendTo`-Pfad warten) ist nicht akzeptabel, weil die Kernfunktionen (Chat, Geräte-Verwaltung, manuelle Trigger) davon abhängen.

## Entscheidung

Befehle aus dem Admin-Tab laufen über einen zentralen Transport (`callAdapter` in `admin/tab.js`) mit zwei Kanälen:

1. **Schnelle Befehle** (`listCatalogEntries`, `updateCatalogEntryAdmin`, `removeCatalogEntry`): weiterhin zuerst per `sendTo` mit 12-s-Timeout.
2. **Ausweichkanal State-Bridge** (neu, `lib/adminBridge.js`): bei ausbleibender Antwort — sowie grundsätzlich für langlaufende Befehle (`chatQuestion`, `runDiscoveryNow`, `runProactiveCheckNow`, um Doppel-Ausführung zu vermeiden) — schreibt der Tab die Anfrage als JSON (`{id, command, message}`) mit `ack:false` in den State `ai-analytics.<instanz>.admin.bridge`. Der Adapter verarbeitet sie im `stateChange`-Handler und schreibt die Antwort (`{id, ok, result|error}`) mit `ack:true` in denselben State zurück; der Tab pollt auf die passende `id`.

Randbedingungen:

- **Whitelist:** Nur die sechs bekannten Befehle (`ALLOWED_COMMANDS`) werden verarbeitet; alles andere wird verworfen und geloggt.
- **Echo-Schutz:** Eigene Antworten des Adapters tragen `ack:true` und werden beim Wiedereintreffen ignoriert — nur `ack:false` zählt als Anfrage.
- **Serialisierung:** Der Tab arbeitet Anfragen nacheinander ab (Promise-Kette), damit sich Request/Antwort-Austausch am einzelnen Bridge-State nicht überlappen.
- **Kein neues Vertrauensmodell:** Wer diesen State beschreiben kann, kann ohnehin alle States dieser Instanz schreiben und hätte denselben Befehl auch direkt über den Message-Bus senden können (siehe Vertrauensbetrachtung in [Querschnittliche Konzepte §8.3](../architecture/08-querschnittliche-konzepte.md)). [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md)s Trennung von LLM-Tool- und Admin-Pfad bleibt unverändert.

## Konsequenzen

- Chat, Geräte-Tab und manuelle Trigger funktionieren auch dann, wenn `sendTo` aus dem Tab-Kontext nicht zustellt — solange `getState`/`setState` funktionieren (live bestätigt).
- Alle Transport-/Verarbeitungsfehler sind jetzt sichtbar (Fehlerbubble im Chat bzw. Statuszeile im Geräte-Tab); kein Button hängt mehr stumm.
- Die Antwort eines Bridge-Befehls liegt maximal so lange im State, bis der nächste Befehl sie überschreibt; es gibt keine Anfragen-Historie. Gleichzeitige Bedienung durch mehrere Admin-Tabs wird durch die Serialisierung pro Tab entschärft, aber nicht vollständig abgedeckt (bewusst akzeptiert, Single-Admin-Annahme).
- `admin.bridge` erscheint als sichtbarer State im Objektbaum — dokumentiertes Design, kein Versteckversuch.
- Der `sendTo`-Pfad bleibt erhalten (idiomatisch, keine Polling-Latenz für schnelle Befehle), die Bridge ist der verlässliche Rückfallebenen-Kanal.
- Live-Bestätigung auf einer realen Instanz steht noch aus (siehe [Risiken](../architecture/11-risiken-und-schulden.md)).

## Verworfene Alternativen

- **Nur weiter auf den `sendTo`-Pfad setzen** (auf einen künftigen Admin-Fix hoffen): lässt die Kernfunktionen unbegrenzt kaputt; kein kontrollierbarer Zeitrahmen.
- **Ausschließlich State-Bridge für alle Befehle**: würde die bewährte `sendTo`-Route unnötig aufgeben und jedem schnellen Befehl Polling-Latenz aufburden.
- **WebSocket-eigene Lösung / eigener Express-Endpunkt im Adapter**: neuer Server-Prozess, neue Authentifizierungsfrage (Adapter-Modus `daemon` betreibt keinen Webserver), deutlich größerer Eingriff als nötig.
