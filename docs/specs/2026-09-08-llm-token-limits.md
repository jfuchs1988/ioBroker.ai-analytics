# LLM Token-Limits — Input-/Output-Begrenzung je Modell

Status: Approved for implementation
Datum: 2026-09-08

## Ziel

Zwei bestehende Lücken schließen, die heute zu Provider-Fehlern statt
verständlichen Meldungen führen können:

1. `lib/providers/openaiCompatible.js` sendet gar kein Ausgabe-Längenlimit
   an den Provider — bei OpenRouter/OpenCode/lokalen Modellen ist die
   Antwortlänge komplett unbegrenzt.
2. `lib/providers/anthropic.js` sendet ein hartkodiertes `max_tokens: 2048`
   (Fallback, da `config.maxTokens` nirgends gesetzt wird) — nicht
   modellabhängig, nicht einstellbar.
3. Es gibt keinerlei Bewusstsein für die Größe einer ausgehenden Anfrage
   (Kontextfenster) — eine zu lange Anfrage scheitert erst beim Provider mit
   dessen eigener, oft kryptischer Fehlermeldung.

Beide Modell-Rollen (Chat/proaktive Prüfung und Onboarding) bekommen
eigene, einstellbare Grenzen — sie können unterschiedliche Provider/Modelle
mit unterschiedlichen Kontextfenstern nutzen.

## Nicht-Ziele

- Keine exakte Tokenzählung (kein Tokenizer als neue Abhängigkeit) — reine
  Zeichen-Heuristik für die Vorab-Sicherheitsmarge. Die bereits vorhandene,
  exakte Kosten-/Budgetberechnung (`lib/usage.js`) bleibt unverändert und
  nutzt weiterhin die von der Provider-API zurückgegebene `usage`.
- Kein Aufteilen ("Splitten") einer Anfrage in mehrere unabhängige
  LLM-Aufrufe — der Agent braucht bei jedem Aufruf den vollständigen
  bisherigen Kontext, um kohärent weiterzuarbeiten.
- Keine Kompression der aktuell laufenden Werkzeug-Aufruf-Sequenz einer
  einzelnen Frage (innerhalb einer `runAgent`-Ausführung) — nur
  abgeschlossene, bereits persistierte Chat-Runden (`chat.history`) werden
  komprimiert. Eine Kompression mitten in einer Werkzeug-Aufruf-Sequenz
  könnte `tool_use`/`tool_result`-Paarungen brechen (Anthropic- und
  OpenAI-kompatible APIs verlangen strikte Paarung). Wird die aktuelle
  Sequenz allein zu groß (in der Praxis selten, da `maxToolCalls`/
  `maxPeriodsPerRequest` das schon begrenzen), greift direkt der
  Abschnitt "Fehlerverhalten" unten.
- Keine automatische Ermittlung des Kontextfensters aus der Modell-Liste
  der Provider — der Nutzer trägt die Werte selbst ein (Provider-Typen und
  Modelle sind zu heterogen für eine verlässliche automatische Zuordnung,
  siehe die bereits bestehende, bewusst manuelle `chatPricePerMillionInputTokens`
  aus demselben Grund).

## Datenmodell — neue Einstellungen

Vier neue Felder in `admin/jsonConfig.json`, gespiegelt für Chat/Onboarding
wie die bestehenden Preisfelder (`chatPricePerMillionInputTokens` /
`onboardingPricePerMillionInputTokens`):

| Feld | Default | Grenzen | Bedeutung |
|---|---|---|---|
| `chatMaxInputTokens` | 100000 | 1000–1000000 | Sicherheitsmarge für die geschätzte Eingabegröße (Chat/proaktive Prüfung) |
| `chatMaxOutputTokens` | 4096 | 256–32768 | An den Provider gesendetes Ausgabe-Limit (Chat/proaktive Prüfung) |
| `onboardingMaxInputTokens` | 100000 | 1000–1000000 | Sicherheitsmarge für die geschätzte Eingabegröße (Onboarding-Klassifikation) |
| `onboardingMaxOutputTokens` | 4096 | 256–32768 | An den Provider gesendetes Ausgabe-Limit (Onboarding-Klassifikation) |

**Bewusste Verhaltensänderung:** Der heutige faktische Anthropic-Output-Cap
ist 2048 (hartkodierter Fallback in `lib/providers/anthropic.js`, da
`config.maxTokens` nie gesetzt wird). Der neue Default 4096 gibt
bestehenden Anthropic-Nutzern mehr Spielraum pro Antwort — niemand konnte
sich bisher auf 2048 verlassen haben, da der Wert nicht sichtbar/einstellbar
war.

Neues fokussiertes Modul `lib/tokenLimits.js` (analog zu `lib/limits.js`):
`getTokenLimits(config, role)` mit `role` = `'chat'` oder `'onboarding'`,
liest `config[`${role}MaxInputTokens`]`/`config[`${role}MaxOutputTokens`]`,
normalisiert/begrenzt wie `getLimits` (ungültiger Wert → Default, sonst auf
die Grenzen geclampt).

## Verwendung in `main.js`

Beim Aufbau von `chatProviderConfig`/`onboardingProviderConfig` (siehe
`main.js`, Konstruktion beider Provider-Konfigurationen) werden
`maxInputTokens`/`maxOutputTokens` aus `getTokenLimits(this.config, 'chat')`
bzw. `getTokenLimits(this.config, 'onboarding')` ergänzt. Fällt Onboarding
mangels eigenem `onboardingProviderType` auf die Chat-Konfiguration zurück
(bestehendes Verhalten, `onboardingProviderConfig = chatProviderConfig`),
gilt automatisch auch dasselbe Token-Limit — konsistent mit `apiKey`/
`model`/`baseUrl`, die im selben Fall ebenfalls übernommen werden.

## B) Output-Begrenzung durchsetzen

- `lib/providers/anthropic.js`: `max_tokens: config.maxTokens || 2048`
  bleibt strukturell — `config.maxTokens` wird jetzt tatsächlich aus der
  neuen Einstellung befüllt statt nie gesetzt zu sein.
- `lib/providers/openaiCompatible.js`: ergänzt `max_tokens: config.maxTokens`
  im Request-Body (fehlt heute komplett), für beide Anfrageformen (`chat/completions`
  und `responses`, dort als `max_output_tokens`).

## C) Input-Schätzung

Neue Funktion `estimateTokens(text)` in `lib/tokenLimits.js`:
`Math.ceil(text.length / 4)` — grobe, branchenübliche Zeichen-Heuristik
ohne Tokenizer-Abhängigkeit. Wird ausschließlich für die
Sicherheitsmarge verwendet, nie für Kosten-/Budgetanzeigen.

Neue Funktion `estimateRequestTokens({ system, messages, tools })`:
Summiert `estimateTokens` über den System-Prompt, `JSON.stringify(messages)`
und `JSON.stringify(tools || [])` — deckt System-Prompt, Gesprächsverlauf/
Werkzeug-Ergebnisse und Werkzeug-Schemas ab, die alle Teil jeder
ausgehenden Anfrage sind.

## D) Kompression (nur abgeschlossene Chat-Historie)

Betrifft ausschließlich `lib/agent.js`s `runAgent`, konkret nur
`priorMessages` (die bis zu 10 aus `chat.history` geladenen, bereits
abgeschlossenen Runden — garantiert alternierende, reine
`user`/`assistant`-Paare ohne Werkzeug-Nachrichten, siehe
`lib/chatLog.js`: `appendChatMessage` akzeptiert nur diese zwei Rollen).

Ablauf, vor Eintritt in die bestehende Iterations-Schleife:

1. `estimateRequestTokens({ system: systemPrompt, messages: [...priorMessages, {role:'user', content: userMessage}], tools: tools.definitions })`
   gegen `limits.maxInputTokens` prüfen. `runAgent` selbst ändert sich dafür
   nicht strukturell — beide bestehenden Aufrufstellen in `main.js`
   (`executeProactiveCheck`, `processChatQuestion`) übergeben schon heute
   `limits: this.runtimeLimits`. `this.runtimeLimits` wird beim Adapterstart
   um `getTokenLimits(this.config, 'chat')` erweitert
   (`this.runtimeLimits = { ...getLimits(this.config), ...getTokenLimits(this.config, 'chat') }`),
   sodass `maxInputTokens`/`maxOutputTokens` einfach zwei weitere Felder auf
   demselben, bereits durchgereichten Objekt sind — `buildTools`, das
   dasselbe Objekt für andere Zwecke liest, ignoriert unbekannte Felder
   bereits heute stillschweigend.
2. Passt es: normal weiter, keine Änderung am bestehenden Ablauf.
3. Passt es nicht UND `priorMessages.length >= 4` (mindestens 2
   abgeschlossene Runden vorhanden — mit nur 1 Runde gibt es keine
   sinnvoll komprimierbare "ältere Hälfte", siehe unten): **ein**
   Kompressionsversuch.
   - Runden bilden: `priorMessages` ist bereits garantiert eine Folge
     von `[user, assistant]`-Paaren; Runde *i* = Nachrichten `2i`/`2i+1`.
   - Älteste `Math.floor(Runden.length / 2)` Runden auswählen (mit
     `Runden.length >= 2` immer mindestens 1 Runde, immer mindestens
     1 verbleibende Runde).
   - Einen zusätzlichen `provider.chat()`-Aufruf ausführen: System-Prompt
     bittet um eine kurze, sachliche Zusammenfassung der ausgewählten
     Runden (wichtige Fakten, bereits geklärte Zuordnungen, gestellte
     Rückfragen beibehalten), `messages` = die ausgewählten Runden,
     `tools: []`.
   - Die zurückgegebene Zusammenfassung wird **nicht** als eigene
     Nachricht eingefügt (würde die strikte user/assistant-Alternierung
     brechen), sondern dem `content` der ersten **verbleibenden**
     `user`-Nachricht vorangestellt (z. B.
     `[Zusammenfassung des bisherigen Verlaufs]: <Text>\n\n<Original-Text>`).
   - Der Token-Verbrauch dieses Zusatzaufrufs wird in `runAgent`s
     ohnehin vorhandenem `usage`-Akkumulator mitgezählt (fließt damit
     automatisch in die bestehende `recordUsage(adapter, usage, 'chat')`-
     Aufzeichnung in `main.js` ein — keine neue Verkabelung nötig).
   - Neu schätzen (Schritt 1 mit den jetzt gekürzten `priorMessages`).
     Passt es jetzt: weiter wie gewohnt. Passt es immer noch, oder
     schlägt der Kompressions-Aufruf selbst fehl (Provider-Fehler,
     ungültige Antwort): Abschnitt "Fehlerverhalten".
4. Passt es nicht UND `priorMessages.length < 4`: direkt Abschnitt
   "Fehlerverhalten" — es gibt keine sinnvoll komprimierbare Historie.

Innerhalb der bestehenden Iterations-Schleife (wachsende
Werkzeug-Aufruf-Sequenz der aktuellen Frage) wird vor jedem weiteren
`provider.chat()`-Aufruf erneut nach Schritt 1 geschätzt — hier **ohne**
weiteren Kompressionsversuch (siehe Nicht-Ziele): bei Überschreitung
direkt Abschnitt "Fehlerverhalten".

## E) Onboarding-Pfad

`lib/onboarding.js` nutzt `runAgent` nicht (ein einzelner, nicht
mehrstufiger Klassifizierungsaufruf pro Batch, kein Gesprächsverlauf).
Vor dem bestehenden `provider.chat(...)`-Aufruf in `runOnboarding`:
`estimateRequestTokens({ system: '...', messages: [{role:'user', content: prompt}], tools: [] })`
gegen `getTokenLimits(adapter.config, 'onboarding').maxInputTokens` prüfen.

Bei Überschreitung: **kein** Kompressionsversuch (nichts zum
Zusammenfassen vorhanden), stattdessen wird der Batch wie ein
Provider-Fehler behandelt — geloggt (`adapter.log.warn`, siehe
bestehendes Muster für `Onboarding-Batch fehlgeschlagen`) und
übersprungen, ohne den gesamten Onboarding-Lauf abzubrechen (bestehendes
Verhalten des umgebenden `try`/`catch` in `runOnboarding` bleibt
unverändert nutzbar).

## Fehlerverhalten

Ein neuer, spezifischer Fehler (z. B.
`Anfrage ueberschreitet das konfigurierte Eingabe-Token-Limit (~<geschaetzt> von <limit>).`)
wird geworfen statt die Anfrage an den Provider zu senden. Für den
Chat-Pfad erscheint das wie jeder andere `runAgent`-Fehler als
Fehlermeldung im Chat (bestehendes Verhalten von `processChatQuestion`);
für die proaktive Prüfung wie jeder andere `executeProactiveCheck`-Fehler;
für Onboarding wie jeder andere Batch-Fehler (siehe E). Keine neue
Fehlerbehandlungs-Infrastruktur nötig — der neue Fehler nutzt die
bestehenden Pfade.

## Nicht-Ziele (Ergänzung zu oben)

- Kein neuer Budget-Check speziell für den Kompressions-Zusatzaufruf — der
  bestehende `isBudgetExceeded`-Check vor dem gesamten `runAgent`-Aufruf
  (in `main.js`, sowohl Chat als auch proaktive Prüfung) deckt das bereits
  ab; die Kompression ist ein Implementierungsdetail der ursprünglich
  bereits budgetgeprüften Anfrage.

## Erfolgskriterien

- Ein OpenAI-kompatibler Provider-Aufruf enthält jetzt `max_tokens`
  (bzw. `max_output_tokens` bei der Responses-API) im Request-Body.
- Ein Anthropic-Aufruf mit konfiguriertem `chatMaxOutputTokens: 1000`
  sendet `max_tokens: 1000` statt des Fallbacks 2048.
- Eine `runAgent`-Anfrage, deren geschätzte Größe (System + Historie +
  aktuelle Frage + Werkzeug-Schemas) das konfigurierte Input-Limit
  überschreitet, UND die mindestens 2 abgeschlossene Chat-Runden in der
  Historie hat, löst genau einen Kompressions-Aufruf aus; danach passt
  die Schätzung, und der eigentliche Aufruf läuft normal weiter.
- Dieselbe Situation mit weniger als 2 abgeschlossenen Runden (oder wenn
  die Kompression selbst fehlschlägt oder nicht ausreicht) wirft den
  definierten Fehler, ohne einen Provider-Aufruf für die eigentliche
  Anfrage auszulösen.
- Der Token-Verbrauch des Kompressions-Aufrufs erscheint in der normalen
  Tageskosten-Aufzeichnung (`usage.today`/`usage.history`, Zweck `chat`).
- Eine Werkzeug-Aufruf-Sequenz, die erst *innerhalb* einer laufenden
  `runAgent`-Ausführung zu groß wird (nicht durch alte Historie), löst
  direkt den definierten Fehler aus, ohne einen Kompressionsversuch.
- Ein Onboarding-Batch, dessen Prompt das konfigurierte Onboarding-
  Input-Limit überschreitet, wird geloggt und übersprungen, ohne den
  restlichen Onboarding-Lauf abzubrechen.
- Bestehende Tests für `lib/agent.js`, `lib/providers/*`, `lib/onboarding.js`
  und `main.js` bleiben unverändert grün (keine Breaking Changes am
  bestehenden Verhalten unterhalb der neuen Limits).
