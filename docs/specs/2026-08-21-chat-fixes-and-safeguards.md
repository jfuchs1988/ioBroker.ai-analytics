# Chat-Tab-Fix, Onboarding-Antwortkanal, Konversationsgedächtnis, Token-Budget, Logging — Design

Status: Approved
Datum: 2026-08-21
Löst Backlog-Punkte [1, 2, 3, 5](../adr/backlog.md) auf, plus eine zusätzliche Logging-Anforderung.

## Kontext

Der manuelle Abnahmetest hat bestätigt: der Admin-Chat-Tab rendert, aber Nachrichten können nicht abgeschickt werden (`adapterNamespace` ist vermutlich kein reales Admin-Global). Gleichzeitig hat der Nutzer vier Backlog-Punkte für diese Iteration freigegeben (1, 2, 3, 5) und zusätzlich `silly`-Level-Logging für KI-Nachrichtenverkehr und Objekt-Discovery angefordert.

Da die vereinbarte Browser-Konsolen-Diagnose (`typeof adapterNamespace`, `typeof io`, `window.location.href`, `typeof parent.socket`) nie geliefert wurde, wird der Chat-Tab-Fix **defensiv mit mehreren Fallback-Strategien** umgesetzt statt auf eine einzelne, ungeprüfte Annahme zu setzen — das war explizit vereinbart ("kein blindes Rate-Fixing"), aber der Nutzer hat inzwischen angewiesen weiterzumachen. Die defensive Mehrfach-Strategie reduziert das Risiko einer erneuten Fehlannahme gegenüber einem einzelnen Fix-Versuch.

## 1. Chat-Tab: Verbindung + UI-Politur (löst Backlog #1)

**Verbindungsaufbau (`admin/tab.js`):** Statt der nicht-existenten `adapterNamespace`-Prüfung wird die Verbindung über eine Fallback-Kette hergestellt:

1. Falls `window.parent !== window && window.parent.socket` existiert (Tab läuft eingebettet in einem Frame, dessen Elternfenster bereits einen authentifizierten Socket hält) — diesen wiederverwenden.
2. Sonst, falls `typeof io !== 'undefined'` (unser eigenes `socket.io.js`-Script) — `io.connect()` ohne Argumente aufrufen (verbindet same-origin zum Server, der den Tab ausliefert).
3. Schlägt beides fehl: eine sichtbare Fehlermeldung im Tab anzeigen ("Verbindung zu ioBroker konnte nicht hergestellt werden") statt still nichts zu tun.

Die Instanznummer wird aus `window.location.search` gelesen (Parameter `instance` oder `i`), Default `0` (deckt den weit überwiegenden Einzelinstanz-Fall ab).

Jeder Verbindungsversuch wird über `console.log`/`console.error` protokolliert, damit bei einem erneuten Test in den Browser-Devtools sofort sichtbar ist, welche Strategie gegriffen hat oder warum alle fehlschlugen.

**UI-Politur:** Chat-Bubbles (Nutzer rechts/farbig, Assistent links/grau), Zeitstempel pro Nachricht, Auto-Scroll (bereits vorhanden), ein sichtbarer Lade-Indikator während auf die Antwort gewartet wird.

## 2. Onboarding-Rückfragen beantwortbar machen (löst Backlog #2)

Neues, bewusst eng begrenztes Werkzeug `updateCatalogEntry` für den Chat-Q&A-Agenten:

- Darf **ausschließlich** Katalogeinträge mit `needsReview: true` bearbeiten — ein Versuch, einen bereits geklärten Eintrag zu ändern, wird abgelehnt (Fehler an den Agenten zurück).
- Aktualisiert `description`, `category`, `room`; setzt danach `needsReview: false`, `confidence: 'high'`, `lastSeen` neu.
- `listCatalog` bekommt einen neuen optionalen Parameter `needsReviewOnly` (boolean), damit der Agent gezielt nachfragen kann, welche Einträge noch offen sind.

**Sicherheitsmodell-Änderung:** Dies ist die erste Schreibfähigkeit der KI (bisher rein lesend, siehe [ADR-0002](../adr/0002-datenzugriff-nur-historisierte-objekte.md)). Die Eingrenzung auf ausschließlich `needsReview`-Einträge hält den Blast-Radius klein — die KI kann keine bereits validierten Daten überschreiben und keine anderen ioBroker-States berühren. Wird als neue ADR festgehalten (siehe Plan).

Der System-Prompt für `onMessage` wird um einen Hinweis ergänzt, dass offene Rückfragen im selben Chat beantwortet werden können.

## 3. Konversationsgedächtnis (löst Backlog #3)

- `lib/chatLog.js` bekommt eine neue, rein lesende Funktion `getRecentChatHistory(adapter, limit)`, die die letzten `limit` Einträge aus `chat.history` liefert.
- `lib/agent.js`s `runAgent` bekommt einen neuen optionalen Parameter `priorMessages` (bereits normalisierte `{role, content}`-Nachrichten), die vor der aktuellen Nutzerfrage in die Message-Liste eingefügt werden.
- `main.js`s `onMessage` liest die letzten 10 Chat-History-Einträge (vor dem Anhängen der neuen Frage), wandelt sie in das normalisierte Format um (`role` bleibt `user`/`assistant`, `text` wird zu `content`) und übergibt sie als `priorMessages`.

Kein Zusammenfassungs-/Kompressionsmechanismus für sehr lange Historien in dieser Iteration — 10 Nachrichten sind bei der aktuellen Nutzung ausreichend knapp für den Kontext eines LLM-Aufrufs; das ist bewusst einfach gehalten und kein Blocker.

## 4. Kosten-/Token-Budget (löst Backlog #5)

- Beide Provider-Clients (`anthropic.js`, `openaiCompatible.js`) extrahieren zusätzlich die `usage`-Angaben aus der API-Antwort (Anthropic: `usage.input_tokens`/`usage.output_tokens`; OpenAI-kompatibel: `usage.prompt_tokens`/`usage.completion_tokens`) und hängen sie als `usage: {inputTokens, outputTokens}` an die zurückgegebene Assistant-Message an (fehlt `usage` in der Antwort, wird `{inputTokens: 0, outputTokens: 0}` angenommen, kein Fehler).
- `runAgent` summiert `usage` über alle Iterationen eines Laufs und gibt die Summe im Rückgabewert mit zurück (`{finalText, messages, usage}`).
- Neues Modul `lib/usage.js`: `recordUsage(adapter, usage)` addiert zum heutigen Zähler-State (`usage.tokensToday`, mit gespeichertem Datum; bei Datumswechsel wird auf 0 zurückgesetzt), `getTodayUsage(adapter)` liest ihn, `isBudgetExceeded(adapter)` vergleicht gegen `this.config.dailyTokenBudget` (0 = kein Limit).
- `main.js`: vor jedem Agent-Lauf (Chat wie proaktive Prüfung) wird `isBudgetExceeded` geprüft. Bei Chat: Antwort mit Hinweis auf erschöpftes Tagesbudget statt eines LLM-Aufrufs. Bei proaktiver Prüfung: Lauf wird übersprungen, Warnung geloggt (kein Chat-Spam).
- Admin-Konfiguration: neues Feld `dailyTokenBudget` (Zahl, Default `0` = kein Limit).

## 5. Silly-Level-Logging (zusätzliche Anforderung des Nutzers)

Durchgängig `adapter.log.silly(...)` an folgenden Stellen (keine API-Keys oder Auth-Header loggen):

- `lib/discovery.js`: Start des Scans, Anzahl gefundener historisierter Objekte, pro gefundenem Objekt Id + erkannte History-Instanz.
- `lib/onboarding.js`: Start/Ende jedes Klassifizierungs-Batches, Ergebnis pro klassifiziertem Objekt (Kategorie, Confidence).
- `lib/agent.js`: vor jedem `provider.chat(...)`-Aufruf ("sende Anfrage an Provider, N Nachrichten im Kontext") und nach Erhalt der Antwort ("Antwort erhalten, stopReason=..., N Tool-Aufrufe"), sowie pro ausgeführtem Werkzeug-Aufruf (Name + gekürzte Eingabe).
- `main.js`: Empfang einer Chat-Frage (gekürzt) und die generierte Antwort (gekürzt) im `onMessage`-Handler; Start/Ende jeder proaktiven Prüfung.

## Nicht-Ziele dieser Iteration

- Backlog-Punkte 4, 6–16 bleiben unangetastet.
- Kein Umstieg auf React für den Admin-Tab (siehe Empfehlung, vom Nutzer nicht widersprochen — bleibt vanilla JS).
- Keine Zusammenfassung/Kompression langer Konversationen (nur die letzten 10 Nachrichten).
