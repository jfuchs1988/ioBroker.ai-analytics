# Multi-Model-Onboarding + Start-Selbstprüfung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding kann ein eigenes, vom Chat/Prüfungs-Provider unabhängiges LLM-Modell nutzen; beim Adapter-Start wird die Erreichbarkeit beider konfigurierten Provider geprüft, und ein fehlgeschlagener Check blockiert nur die betroffene Funktion (Onboarding-Klassifikation bzw. Chat/proaktive Prüfung), nicht den ganzen Adapter.

**Architecture:** Ein neues, eigenständiges Modul `lib/providerHealthCheck.js` kapselt den Erreichbarkeits-Test-Call und die zwei neuen State-Objekte. `main.js` instanziiert zwei Provider (`this.chatProvider`, `this.onboardingProvider`, Fallback auf den Chat-Provider wenn keine eigene Onboarding-Config gesetzt ist), prüft beide beim Start und speichert das Ergebnis in `this.chatProviderOk`/`this.onboardingProviderOk`. `syncCatalog()` und `runProactiveCheck()` (und damit auch die manuellen Admin-Trigger `runDiscoveryNow`/`runProactiveCheckNow`, die diese Methoden direkt aufrufen) prüfen diese Flags selbst und überspringen nur ihren jeweiligen LLM-Aufruf, wenn der zuständige Provider nicht erreichbar ist — Discovery/Reaktivierung im Katalog läuft davon unberührt weiter.

**Tech Stack:** Node.js/CommonJS (keine neuen Abhängigkeiten), Mocha/Chai/Sinon/Proxyquire für Tests, ioBroker `jsonConfig`-Format für die Admin-UI.

**Spec:** [docs/specs/2026-08-22-multi-model-onboarding-design.md](../specs/2026-08-22-multi-model-onboarding-design.md)

## Global Constraints

- Bestehende native Felder `providerType`/`apiKey`/`model`/`baseUrl` bleiben unverändert benannt und gelten ab jetzt explizit für Chat/Prüfung.
- Neue Onboarding-Felder (`onboardingProviderType`, `onboardingApiKey`, `onboardingModel`, `onboardingBaseUrl`) sind optional; leer/nicht gesetzt = Onboarding nutzt automatisch dieselbe Config wie Chat (kein Bruch bestehender Installationen).
- Kein automatisches Auswählen unter mehreren Kandidatenmodellen, keine Kosten-/Qualitäts-Bewertung — der Selbstcheck testet ausschließlich Erreichbarkeit (ein minimaler Chat-Call ohne Tools).
- Die Selbstprüfung läuft ausschließlich einmal in `onReady`, kein periodischer Re-Check während der Laufzeit.
- Ein fehlgeschlagener Check blockiert nur die betroffene Funktion; der jeweils andere Zweig läuft normal weiter.
- `npm test` muss vor jedem Commit auf `develop` grün sein.
- Ein Branch pro Task ([ADR-0019](../adr/0019-feature-branch-pro-task.md)): von `develop` abgezweigt, TDD-Commits darauf, nach grünem `npm test` lokal per `git merge --no-ff` zurück nach `develop`, danach Branch löschen.
- Keine Netzwerk-Calls in Tests — Provider werden wie im gesamten Projekt üblich gemockt (Sinon-Stubs).

---

### Task 1: `lib/providerHealthCheck.js` — Erreichbarkeits-Check + States

**Files:**
- Create: `lib/providerHealthCheck.js`
- Test: `test/unit/providerHealthCheck.test.js`

**Interfaces:**
- Produces: `checkProviderReachable(provider) => Promise<{reachable: boolean, error?: string}>`, `ensureReachabilityStates(adapter) => Promise<void>`, exportierte Konstanten `CHAT_STATE = 'info.chatProviderReachable'`, `ONBOARDING_STATE = 'info.onboardingProviderReachable'`.
- Consumes: nichts aus anderen Tasks — eigenständiges Modul, analog zu `lib/usage.js`.

- [ ] **Step 1: Failing Tests schreiben**

Erstelle `test/unit/providerHealthCheck.test.js`:

```js
// test/unit/providerHealthCheck.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const {
    checkProviderReachable,
    ensureReachabilityStates,
    CHAT_STATE,
    ONBOARDING_STATE,
} = require('../../lib/providerHealthCheck');

function makeAdapter() {
    return {
        setObjectNotExistsAsync: sinon.stub().resolves(),
    };
}

describe('providerHealthCheck', () => {
    it('state constants point at the expected info.* paths', () => {
        expect(CHAT_STATE).to.equal('info.chatProviderReachable');
        expect(ONBOARDING_STATE).to.equal('info.onboardingProviderReachable');
    });

    describe('checkProviderReachable', () => {
        it('returns reachable: true when the provider responds successfully', async () => {
            const provider = {
                chat: sinon.stub().resolves({ role: 'assistant', content: 'OK', toolCalls: [], stopReason: 'end_turn' }),
            };

            const result = await checkProviderReachable(provider);

            expect(result).to.deep.equal({ reachable: true });
            expect(provider.chat.calledOnce).to.equal(true);
            const call = provider.chat.firstCall.args[0];
            expect(call.tools).to.deep.equal([]);
            expect(call.messages).to.have.lengthOf(1);
            expect(call.messages[0].role).to.equal('user');
        });

        it('returns reachable: false with the error message when the provider call throws', async () => {
            const provider = { chat: sinon.stub().rejects(new Error('401 Unauthorized')) };

            const result = await checkProviderReachable(provider);

            expect(result).to.deep.equal({ reachable: false, error: '401 Unauthorized' });
        });
    });

    describe('ensureReachabilityStates', () => {
        it('creates both state objects', async () => {
            const adapter = makeAdapter();

            await ensureReachabilityStates(adapter);

            expect(adapter.setObjectNotExistsAsync.calledTwice).to.equal(true);
            const ids = adapter.setObjectNotExistsAsync.getCalls().map((call) => call.args[0]);
            expect(ids).to.include(CHAT_STATE);
            expect(ids).to.include(ONBOARDING_STATE);
        });
    });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/providerHealthCheck.test.js`
Expected: FAIL mit "Cannot find module '../../lib/providerHealthCheck'"

- [ ] **Step 3: Modul implementieren**

Erstelle `lib/providerHealthCheck.js`:

```js
'use strict';

const CHAT_STATE = 'info.chatProviderReachable';
const ONBOARDING_STATE = 'info.onboardingProviderReachable';

async function ensureReachabilityStates(adapter) {
    await adapter.setObjectNotExistsAsync(CHAT_STATE, {
        type: 'state',
        common: {
            name: 'Chat/Pruefungs-Modell erreichbar',
            type: 'boolean',
            role: 'indicator.reachable',
            read: true,
            write: false,
        },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(ONBOARDING_STATE, {
        type: 'state',
        common: {
            name: 'Onboarding-Modell erreichbar',
            type: 'boolean',
            role: 'indicator.reachable',
            read: true,
            write: false,
        },
        native: {},
    });
}

async function checkProviderReachable(provider) {
    try {
        await provider.chat({
            system: 'Antworte ausschließlich mit dem Wort OK.',
            messages: [{ role: 'user', content: 'OK?' }],
            tools: [],
        });
        return { reachable: true };
    } catch (error) {
        return { reachable: false, error: error.message };
    }
}

module.exports = { checkProviderReachable, ensureReachabilityStates, CHAT_STATE, ONBOARDING_STATE };
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/providerHealthCheck.test.js`
Expected: PASS, 4 passing

- [ ] **Step 5: Branch, Commit, Merge**

```bash
git checkout -b feature/provider-health-check develop
git add lib/providerHealthCheck.js test/unit/providerHealthCheck.test.js
git commit -m "feat: add provider reachability self-check module"
npm test
git checkout develop
git merge --no-ff feature/provider-health-check
git branch -d feature/provider-health-check
```

---

### Task 2: Config-Schema — Onboarding-Provider-Felder

**Files:**
- Modify: `io-package.json`
- Modify: `admin/jsonConfig.json`

**Interfaces:**
- Produces: native Config-Felder `onboardingProviderType` (string, default `""`), `onboardingApiKey` (string, default `""`, verschlüsselt), `onboardingModel` (string, default `""`), `onboardingBaseUrl` (string, default `""`) — von Task 3 als `this.config.onboarding*` gelesen.
- Consumes: nichts.

Reines Config-/UI-Schema ohne Programmlogik — kein TDD-Zyklus, kein neuer Test (analog zu den `io-package.json`/`jsonConfig.json`-Änderungen im Geräte-Tab-Plan). `npm test` läuft trotzdem zur Regressionsabsicherung.

- [ ] **Step 1: `io-package.json` erweitern**

In `io-package.json`, im `common`-Objekt, `encryptedNative` und `protectedNative` erweitern:

```json
    "encryptedNative": ["apiKey", "onboardingApiKey"],
    "protectedNative": ["apiKey", "onboardingApiKey"],
```

Im `native`-Objekt, nach `"baseUrl": "",` einfügen:

```json
    "onboardingProviderType": "",
    "onboardingApiKey": "",
    "onboardingModel": "",
    "onboardingBaseUrl": "",
```

- [ ] **Step 2: `admin/jsonConfig.json` erweitern**

Nach dem `baseUrl`-Item (vor `checkIntervalHours`) einfügen:

```json
    "onboardingHeader": {
      "type": "header",
      "text": "Onboarding-Modell (optional, sonst wie oben)"
    },
    "onboardingProviderType": {
      "type": "select",
      "label": "LLM-Provider (Onboarding)",
      "options": [
        { "label": "Wie oben (Chat/Pruefung)", "value": "" },
        { "label": "Anthropic", "value": "anthropic" },
        { "label": "OpenAI", "value": "openai" },
        { "label": "OpenRouter", "value": "openrouter" },
        { "label": "Lokal (OpenAI-kompatibel)", "value": "local" }
      ]
    },
    "onboardingApiKey": {
      "type": "password",
      "label": "API-Key (Onboarding)"
    },
    "onboardingModel": {
      "type": "text",
      "label": "Modell (Onboarding)"
    },
    "onboardingBaseUrl": {
      "type": "text",
      "label": "Basis-URL (Onboarding, nur fuer OpenRouter/Lokal)"
    },
```

- [ ] **Step 3: Beide Dateien auf gültiges JSON prüfen**

Run: `node -e "JSON.parse(require('fs').readFileSync('io-package.json', 'utf8')); JSON.parse(require('fs').readFileSync('admin/jsonConfig.json', 'utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Tests laufen lassen, Branch, Commit, Merge**

```bash
git checkout -b feature/multi-model-config-schema develop
npm test
git add io-package.json admin/jsonConfig.json
git commit -m "feat: add optional per-purpose config fields for the onboarding provider"
git checkout develop
git merge --no-ff feature/multi-model-config-schema
git branch -d feature/multi-model-config-schema
```

---

### Task 3: `main.js` — Zwei Provider verdrahten, Selbstprüfung, granulares Blockieren

**Files:**
- Modify: `main.js`

**Interfaces:**
- Consumes: `checkProviderReachable`, `ensureReachabilityStates`, `CHAT_STATE`, `ONBOARDING_STATE` aus `lib/providerHealthCheck.js` (Task 1); Config-Felder `onboardingProviderType`/`onboardingApiKey`/`onboardingModel`/`onboardingBaseUrl` (Task 2).
- Produces: `this.chatProvider`, `this.onboardingProvider` (beide Provider-Instanzen, wie von `lib/providers/index.js`'s `createProvider` erzeugt), `this.chatProviderOk`, `this.onboardingProviderOk` (booleans, gesetzt in `onReady`, gelesen in `syncCatalog`/`runProactiveCheck`/`onMessage`). `this.provider` (das bisherige einzelne Feld) entfällt komplett — kein anderes Modul referenziert es (geprüft: nur `main.js` selbst nutzte es).

Kein dediziertes Test-File für `main.js` existiert im Projekt (dokumentierte Lücke, siehe [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md)) — dieser Task ändert daran nichts; Regressionsschutz kommt aus `npm test` (bestehende `lib/*`-Tests + Adapter-Smoke-Test) und der manuellen Prüfung in Step 2.

`test/unit/onboarding.test.js` braucht in diesem Plan keine Änderung: der bestehende Test in `runOnboarding` übergibt bereits ein eigenständiges Mock-Provider-Objekt und prüft `provider.chat` darauf — das deckt "nutzt den übergebenen Provider, nicht global `adapter.provider`" bereits ab, unabhängig davon, ob der Aufrufer in `main.js` ihn jetzt `this.onboardingProvider` statt `this.provider` nennt.

- [ ] **Step 1: `main.js` anpassen**

Am Dateianfang, nach der bestehenden `createProvider`-Import-Zeile, ergänzen:

```js
const { checkProviderReachable, ensureReachabilityStates, CHAT_STATE, ONBOARDING_STATE } = require('./lib/providerHealthCheck');
```

`onReady` komplett ersetzen durch:

```js
    async onReady() {
        await ensureChatHistoryState(this);
        await ensureUsageState(this);
        await ensureReachabilityStates(this);

        this.chatProvider = createProvider({
            type: this.config.providerType,
            apiKey: this.config.apiKey,
            model: this.config.model,
            baseUrl: this.config.baseUrl,
        });
        this.onboardingProvider = this.config.onboardingProviderType
            ? createProvider({
                  type: this.config.onboardingProviderType,
                  apiKey: this.config.onboardingApiKey,
                  model: this.config.onboardingModel,
                  baseUrl: this.config.onboardingBaseUrl,
              })
            : this.chatProvider;
        this.tools = buildTools(this);

        const chatCheck = await checkProviderReachable(this.chatProvider);
        this.chatProviderOk = chatCheck.reachable;
        await this.setStateAsync(CHAT_STATE, { val: chatCheck.reachable, ack: true });
        if (!chatCheck.reachable) {
            this.log.error(`Chat/Pruefungs-Modell nicht erreichbar: ${chatCheck.error}`);
        }

        const onboardingCheck =
            this.onboardingProvider === this.chatProvider ? chatCheck : await checkProviderReachable(this.onboardingProvider);
        this.onboardingProviderOk = onboardingCheck.reachable;
        await this.setStateAsync(ONBOARDING_STATE, { val: onboardingCheck.reachable, ack: true });
        if (!onboardingCheck.reachable) {
            this.log.error(`Onboarding-Modell nicht erreichbar: ${onboardingCheck.error}`);
        }

        await this.syncCatalog();

        const configuredHours = Number(this.config.checkIntervalHours);
        const intervalHours = Number.isFinite(configuredHours) && configuredHours >= 1 ? configuredHours : 24;
        const intervalMs = intervalHours * 3600 * 1000;
        this.stopScheduler = startProactiveScheduler(this, {
            intervalMs,
            runCheck: () => this.runProactiveCheck(),
        });

        this.log.info('ai-analytics adapter ready');
    }
```

(Der bisherige `if (!this.config.apiKey ...) return;`-Guard entfällt ersatzlos — er wird durch die granulare, tatsächlich testende Selbstprüfung oben abgelöst.)

In `syncCatalog()`, die Zeile

```js
        const { classifiedCount, needsReview } = await runOnboarding(this, this.provider, discovered);
```

ersetzen durch (direkt davor eingefügt, danach `this.provider` → `this.onboardingProvider`):

```js
        if (!this.onboardingProviderOk) {
            this.log.warn('Klassifikation neuer Objekte uebersprungen, da das Onboarding-Modell nicht erreichbar ist.');
            return { foundCount: discovered.length, newCount: 0, reactivatedCount };
        }

        const { classifiedCount, needsReview } = await runOnboarding(this, this.onboardingProvider, discovered);
```

In `runProactiveCheck()`, direkt nach der Zeile `this.log.silly('Proaktive Pruefung: Lauf gestartet');` einfügen:

```js
        if (!this.chatProviderOk) {
            this.log.warn('Proaktive Pruefung uebersprungen, da das Chat/Pruefungs-Modell nicht erreichbar ist.');
            return;
        }
```

und in derselben Methode `provider: this.provider,` (im `runAgent`-Aufruf) ersetzen durch `provider: this.chatProvider,`.

In `onMessage`, im `chatQuestion`-Zweig, direkt nach der Zeile `this.log.silly(\`Chat: Frage erhalten: ${question.slice(0, 200)}\`);` einfügen:

```js
            if (!this.chatProviderOk) {
                this.log.warn('Chat: Frage nicht beantwortet, da das Chat/Pruefungs-Modell nicht erreichbar ist.');
                if (obj.callback) {
                    this.sendTo(
                        obj.from,
                        obj.command,
                        { error: 'Chat-Modell derzeit nicht erreichbar, siehe Log/Admin-Konfiguration.' },
                        obj.callback
                    );
                }
                return;
            }
```

und im `runAgent`-Aufruf innerhalb desselben Zweigs `provider: this.provider,` ersetzen durch `provider: this.chatProvider,`.

- [ ] **Step 2: Manuell verifizieren, dass keine `this.provider`-Referenz mehr übrig ist**

Run: `grep -n "this.provider" main.js`
Expected: keine Treffer (leere Ausgabe)

- [ ] **Step 3: Vollständige Testsuite laufen lassen**

Run: `npm test`
Expected: alle bisherigen Tests weiterhin grün (kein `main.js`-spezifischer Test vorhanden, siehe Interfaces-Hinweis oben)

- [ ] **Step 4: Branch, Commit, Merge**

```bash
git checkout -b feature/main-multi-provider-wiring develop
git add main.js
git commit -m "feat: wire separate onboarding/chat providers with startup reachability checks"
npm test
git checkout develop
git merge --no-ff feature/main-multi-provider-wiring
git branch -d feature/main-multi-provider-wiring
```

---

### Task 4: ADR-0021, Dokumentation, Versionsbump

**Files:**
- Create: `docs/adr/0021-getrennte-provider-pro-zweck.md`
- Modify: `docs/adr/adr-index.md`, `docs/adr/backlog.md`, `docs/architecture/05-bausteinsicht.md`, `CHANGELOG.md`, `package.json`, `io-package.json`

**Interfaces:** keine (reine Dokumentation).

- [ ] **Step 1: ADR-0021 erstellen**

Erstelle `docs/adr/0021-getrennte-provider-pro-zweck.md`:

```markdown
# ADR-0021: Getrennte LLM-Provider pro Zweck (Onboarding vs. Chat/Prüfung) mit Fallback und Start-Selbstprüfung

[← ADR-Übersicht](adr-index.md)

## Status

Angenommen (2026-08-22)

## Kontext

Der Adapter nutzte bisher einen einzigen LLM-Provider (`this.provider`) für Onboarding-Klassifikation, Chat-Q&A und proaktive Prüfung gemeinsam. Onboarding läuft batch-lastig über potenziell viele Objekte und hat andere Kosten-/Qualitätsanforderungen als interaktiver Chat. Zusätzlich gab es keinen echten Erreichbarkeitstest der konfigurierten Provider — ein falscher API-Key oder Modellname fiel erst beim ersten echten Nutzungsversuch auf, mitten im Betrieb. Details: [Design-Spec](../specs/2026-08-22-multi-model-onboarding-design.md).

## Entscheidung

1. Zwei unabhängige, vollständige Provider-Configs (Typ, API-Key, Modell, Basis-URL): eine für Chat/Prüfung (bestehende Felder, unverändert), eine optionale für Onboarding. Ist die Onboarding-Config leer, fällt der Adapter auf die Chat-Config zurück (heutiges Verhalten bleibt Default).
2. Keine automatische Auswahl unter mehreren Kandidatenmodellen und keine Kosten-/Qualitäts-Bewertung — bewusst einfacher gehalten als der ursprüngliche Backlog-Vorschlag (Punkt 12).
3. Beim Adapter-Start (`onReady`) wird pro konfiguriertem Provider ein minimaler Test-Call gemacht (`lib/providerHealthCheck.js`), das Ergebnis in `info.chatProviderReachable`/`info.onboardingProviderReachable` persistiert und in `this.chatProviderOk`/`this.onboardingProviderOk` gehalten.
4. Ein fehlgeschlagener Check blockiert nur die betroffene Funktion (Onboarding-Klassifikation bzw. Chat-Antworten bzw. proaktive Prüfung), nicht den gesamten Adapter — und ersetzt damit den bisherigen groben `if (!apiKey) return;`-Guard in `onReady`, der pauschal beides blockierte und keine echte Erreichbarkeit prüfte.
5. Der Check läuft ausschließlich einmal pro Adapter-Start, kein periodischer Re-Check.

## Konsequenzen

**Positiv:**
- Kostengünstigere/lokale Modelle für Massen-Onboarding möglich, ohne die Chat-Qualität zu beeinträchtigen.
- Fehlkonfiguration wird sofort beim Start sichtbar (Log + State), statt erst mitten im Betrieb.
- Teilausfall eines Providers legt nicht den ganzen Adapter lahm.

**Negativ:**
- Zwei Provider-Configs zu pflegen statt einer — mehr Admin-UI-Fläche.
- Kein automatisches Kosten-/Qualitäts-Ranking — der Nutzer muss die Eignung eines Modells weiterhin selbst einschätzen (bewusste Scope-Entscheidung, siehe Design-Spec Nicht-Ziele).
- Ein einmal fehlgeschlagener Check erfordert einen Adapter-Neustart zur erneuten Prüfung (kein Retry zur Laufzeit).
```

- [ ] **Step 2: `docs/adr/adr-index.md` ergänzen**

Neue Zeile am Ende der Tabelle einfügen:

```
| [0021](0021-getrennte-provider-pro-zweck.md) | Getrennte LLM-Provider pro Zweck (Onboarding vs. Chat/Prüfung) mit Fallback und Start-Selbstprüfung | Angenommen | 2026-08-22 |
```

- [ ] **Step 3: `docs/adr/backlog.md` — Punkt 12 verengen**

Punkt 12 (`## 12. Mehrere/wählbare LLM-Modelle fürs Onboarding + automatische Sparsamkeits-/Qualitäts-Selbstprüfung`) ersetzen durch:

```markdown
## 12. Automatische Kandidaten-Auswahl unter mehreren LLM-Modellen (Kosten/Qualität)

Durch [ADR-0021](0021-getrennte-provider-pro-zweck.md) teilweise gelöst: Onboarding und Chat/Prüfung können jetzt unabhängige, fest konfigurierte Provider nutzen, inkl. Start-Selbstprüfung der Erreichbarkeit. Weiterhin offen: automatisches Auswählen unter mehreren vom Nutzer eingetragenen Kandidatenmodellen anhand von Kosten/Qualität — bewusst nicht umgesetzt (siehe [Design-Spec](../specs/2026-08-22-multi-model-onboarding-design.md), Nicht-Ziele). Falls später gewünscht: Format der Bewertung (Testklassifikationen mit bekanntem Ergebnis? Kosten-pro-Objekt-Schätzung aus Provider-Preislisten?), Persistenz der automatischen Wahl, Override-UI.
```

Am Ende der Datei, im Änderungsverlauf-Kommentarblock (oberer Bereich der Datei, `_Aktualisiert ...`-Zeilen), eine neue Zeile ergänzen:

```
_Aktualisiert 2026-08-22: Punkt 12 durch [ADR-0021](0021-getrennte-provider-pro-zweck.md) auf die verbleibende Frage der automatischen Kandidaten-Auswahl verengt._
```

- [ ] **Step 4: `docs/architecture/05-bausteinsicht.md` aktualisieren**

Im Baum (Abschnitt 5.1), nach der Zeile `├── onboarding.js          Klassifiziert neu entdeckte Objekte (Batch-Prompt)` einfügen:

```
├── providerHealthCheck.js Erreichbarkeits-Selbstpruefung der konfigurierten Provider
```

In der Tabelle (Abschnitt 5.2), nach der `onboarding.js`-Zeile eine neue Zeile einfügen:

```
| `providerHealthCheck.js` | Minimaler Test-Call pro konfiguriertem Provider beim Start, persistiert Ergebnis als State | `checkProviderReachable(provider) => {reachable,error?}`, `ensureReachabilityStates(adapter)` |
```

Die `onboarding.js`-Zeile in derselben Tabelle bleibt inhaltlich unverändert (Signatur `runOnboarding(adapter,provider,discoveredObjects)` gilt weiterhin — `provider` ist jetzt der Onboarding-Provider statt des früheren einzigen Providers).

Den Satz am Ende von Abschnitt 5.2 (`Das System bleibt bei Ebene 1 ...`) anpassen: `11 Module` → `12 Module`.

- [ ] **Step 5: `CHANGELOG.md` — neuer Versionseintrag**

Nach der `# Changelog`-Kopfzeile, vor dem bestehenden `## [0.0.1-beta.3]`-Eintrag, einfügen:

```markdown
## [0.0.1-beta.4] - 2026-08-22

### Hinzugefügt
- Onboarding kann jetzt einen eigenen, vom Chat/Prüfungs-Provider unabhängigen LLM-Provider nutzen (neue optionale Admin-Config-Felder `onboardingProviderType`/`onboardingApiKey`/`onboardingModel`/`onboardingBaseUrl`) — leer gelassen, verhält sich der Adapter wie bisher (ein gemeinsamer Provider).
- Start-Selbstprüfung: beim Adapter-Start wird die Erreichbarkeit beider konfigurierten Provider per minimalem Test-Call geprüft (`lib/providerHealthCheck.js`), Ergebnis als States `info.chatProviderReachable`/`info.onboardingProviderReachable` sichtbar. Ein fehlgeschlagener Check blockiert nur die betroffene Funktion (Onboarding-Klassifikation bzw. Chat/proaktive Prüfung), nicht den gesamten Adapter.
- Neues ADR-0021 dokumentiert die Zwei-Provider-Architektur, siehe [ADR-0021](docs/adr/0021-getrennte-provider-pro-zweck.md).

### Geändert
- Der bisherige grobe `if (!apiKey) return;`-Start-Guard in `onReady` ist entfallen, ersetzt durch die granulare, tatsächlich testende Selbstprüfung oben.
```

- [ ] **Step 6: Versionsbump**

In `package.json`, `"version"` von `"0.0.1-beta.3"` auf `"0.0.1-beta.4"` ändern.

In `io-package.json`, `"version"` (im `common`-Objekt) von `"0.0.1-beta.3"` auf `"0.0.1-beta.4"` ändern, und im `news`-Objekt, vor dem bestehenden `"0.0.1-beta.3"`-Eintrag, einfügen:

```json
      "0.0.1-beta.4": {
        "en": "Onboarding can use its own LLM provider (independent from chat/checks). Startup reachability self-check for both providers, blocking only the affected function on failure.",
        "de": "Onboarding kann jetzt einen eigenen LLM-Provider nutzen (unabhaengig von Chat/Pruefung). Start-Selbstpruefung der Erreichbarkeit beider Provider, blockiert bei Fehlschlag nur die betroffene Funktion."
      },
```

- [ ] **Step 7: Tests laufen lassen, Branch, Commit, Merge**

```bash
git checkout -b docs/multi-model-onboarding-wrapup develop
npm test
git add docs/adr/0021-getrennte-provider-pro-zweck.md docs/adr/adr-index.md docs/adr/backlog.md docs/architecture/05-bausteinsicht.md CHANGELOG.md package.json io-package.json
git commit -m "docs: add ADR-0021 and record multi-model onboarding feature (v0.0.1-beta.4)"
git checkout develop
git merge --no-ff docs/multi-model-onboarding-wrapup
git branch -d docs/multi-model-onboarding-wrapup
```

---

## Abschluss

Nach Task 4: `npm test` grün, alle vier Tasks lokal per `--no-ff` in `develop` gemergt, kein Push. Release/Tag auf `master` erfolgt wie bisher erst auf expliziten Nutzerwunsch.
