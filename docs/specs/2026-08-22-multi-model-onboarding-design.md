# Multi-Model-Onboarding + Start-Selbstprüfung — Design

[← Doku-Übersicht](../README.md)

**Status:** Genehmigt (Brainstorming abgeschlossen 2026-08-22), bereit für Implementierungsplan.

## Kontext

Der Adapter nutzt aktuell einen einzigen LLM-Provider (`this.provider` in `main.js`, erzeugt via `createProvider(config)` aus `lib/providers/index.js`) für alle drei Aufrufarten: Onboarding-Klassifikation (`lib/onboarding.js`), Chat-Q&A und proaktive Prüfung. Der Nutzer hat vorgeschlagen, für das (potenziell teure, batch-lastige) Onboarding ein anderes — typischerweise günstigeres — Modell nutzen zu können als für Chat/Prüfung, plus eine automatische Prüfung beim Adapter-Start, ob die konfigurierten Modelle tatsächlich erreichbar/gültig sind.

Ursprünglich vorgeschlagen (Backlog [Punkt 12](../adr/backlog.md)) als "mehrere/wählbare Modelle mit automatischer Sparsamkeits-/Qualitäts-Selbstprüfung". Im Brainstorming wurde der Umfang bewusst verengt:

- **Kein** automatisches Auswählen unter mehreren Kandidatenmodellen — stattdessen genau ein fest konfiguriertes Modell pro Zweck (Onboarding vs. Chat/Prüfung), vom Nutzer explizit gewählt.
- **Keine** Kosten-/Qualitäts-Bewertung beim Start — nur ein Erreichbarkeits-/Gültigkeitscheck (funktioniert der konfigurierte Provider überhaupt). Kostenschätzung/-Reporting ist Thema von Backlog [Punkt 13](../adr/backlog.md) (Token-Kosten-Tab), nicht dieser Spec.

Diese Spec deckt damit einen Teil von Punkt 12 ab (Modell-Trennung + Erreichbarkeitscheck); der ursprünglich weitergehende Umfang (Auto-Auswahl, Kosten/Qualitäts-Ranking) ist explizit **nicht** Ziel dieser Runde.

## Ziele

1. Onboarding kann ein anderes Provider/Modell nutzen als Chat/Prüfung.
2. Bestehende Installationen brechen nicht — ohne neue Config verhält sich der Adapter exakt wie heute.
3. Fehlkonfiguration (falscher Key, falscher Modellname, Provider nicht erreichbar) wird beim Start erkannt und klar gemeldet, statt erst beim ersten echten Nutzungsversuch mitten im Betrieb aufzufallen.
4. Ein fehlgeschlagener Check für einen Zweck blockiert nicht den anderen, funktionierenden Zweig.

## Nicht-Ziele

- Automatische Auswahl unter mehreren Kandidatenmodellen.
- Kosten- oder Qualitäts-Bewertung/-Ranking der Modelle.
- Anzeige der neuen Status-States im Geräte-Tab/Admin-UI (State existiert, UI-Anzeige ist ein möglicher Folge-Schritt, nicht Teil dieser Runde).
- Wiederholte/periodische Selbstprüfung während der Laufzeit — der Check läuft ausschließlich einmal in `onReady`.

## Config-Schema

Bestehende native Felder in `io-package.json` (`providerType`, `apiKey`, `model`, `baseUrl`) bleiben unverändert in Name und Bedeutung und gelten ab jetzt explizit für **Chat/Prüfung**.

Vier neue, optionale native Felder für **Onboarding**:

```json
"onboardingProviderType": "",
"onboardingApiKey": "",
"onboardingModel": "",
"onboardingBaseUrl": ""
```

- Ist `onboardingProviderType` leer/nicht gesetzt, verhält sich der Adapter wie heute: Onboarding nutzt dieselbe Provider-Config wie Chat/Prüfung (Fallback, kein Bruch bestehender Installationen).
- Ist `onboardingProviderType` gesetzt, wird ein eigener, unabhängiger Provider für Onboarding erzeugt (eigener Typ möglich, z. B. `local` für Onboarding + `anthropic` für Chat).
- `onboardingApiKey` wird in `io-package.json` zu `encryptedNative` und `protectedNative` hinzugefügt, analog zu `apiKey`.

**Admin-Formular (`admin/jsonConfig.json`):** neuer Abschnitt/Panel "Onboarding-Modell (optional, sonst wie Chat/Prüfung)" mit denselben vier Feldtypen (Dropdown Provider-Typ, Passwort-Feld API-Key, Text Modellname, Text Base-URL) wie der bestehende Provider-Block, direkt darunter platziert.

## Provider-Instanziierung (`main.js`)

`main.js` instanziiert beim Start zwei Provider statt einem:

```js
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
```

`runOnboarding(adapter, provider, discoveredObjects)` (Signatur bleibt gleich) wird ab jetzt mit `this.onboardingProvider` aufgerufen statt implizit mit dem einzigen `this.provider`. Alle Aufrufstellen von Chat/Prüfung (`onMessage('chatQuestion', ...)`, Scheduler-Callback) nutzen `this.chatProvider`.

## Start-Selbstprüfung

Neues Modul `lib/providerHealthCheck.js`:

```js
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

module.exports = { checkProviderReachable };
```

In `main.js`'s `onReady`, nach der Provider-Instanziierung (vor Discovery/Scheduler-Start):

```js
const chatCheck = await checkProviderReachable(this.chatProvider);
await this.setStateAsync('info.chatProviderReachable', { val: chatCheck.reachable, ack: true });
if (!chatCheck.reachable) {
    this.log.error(`Chat/Prüfungs-Modell nicht erreichbar: ${chatCheck.error}`);
}
this.chatProviderOk = chatCheck.reachable;

const onboardingCheck = this.onboardingProvider === this.chatProvider
    ? chatCheck
    : await checkProviderReachable(this.onboardingProvider);
await this.setStateAsync('info.onboardingProviderReachable', { val: onboardingCheck.reachable, ack: true });
if (!onboardingCheck.reachable) {
    this.log.error(`Onboarding-Modell nicht erreichbar: ${onboardingCheck.error}`);
}
this.onboardingProviderOk = onboardingCheck.reachable;
```

(Teilen sich Chat und Onboarding denselben Provider, wird nur ein Test-Call gemacht — kein doppelter Aufruf für dieselbe Config.)

Neue States (Objekte via `setObjectNotExistsAsync`, `type: state, common.type: boolean, common.role: indicator.reachable, read: true, write: false`):
- `<namespace>.info.chatProviderReachable`
- `<namespace>.info.onboardingProviderReachable`

## Ablösung des bestehenden API-Key-Checks

`main.js`'s heutiger `onReady` bricht komplett ab (`return`), wenn kein `apiKey` gesetzt ist (Zeilen 37–42), und überspringt dabei sowohl Katalog-Synchronisierung als auch proaktive Prüfung pauschal — ohne echten Erreichbarkeitstest und ohne zwischen Onboarding und Chat/Prüfung zu unterscheiden. Dieser grobe Guard wird durch den granularen Selbstprüfungs-Flow ersetzt: statt nur auf das Vorhandensein eines API-Keys zu prüfen (was z. B. bei `providerType: 'local'` ohnehin nicht aussagekräftig ist), macht `checkProviderReachable` einen echten Test-Call pro Provider, und `syncCatalog()`/proaktive Prüfung werden einzeln je nach Ergebnis übersprungen statt beide pauschal beim Adapter-Start.

## Fehlerverhalten

- **Chat-Provider nicht erreichbar:** `onMessage('chatQuestion', ...)` antwortet sofort mit einer Fehlermeldung ("Chat-Modell derzeit nicht erreichbar, siehe Log/Admin-Konfiguration.") statt den Agenten-Loop zu starten. Der Scheduler überspringt den proaktiven Prüfungslauf für die gesamte Laufzeit dieses Adapter-Starts (kein Retry ohne Neustart).
- **Onboarding-Provider nicht erreichbar:** `syncCatalog()` überspringt den Klassifikations-Schritt (`runOnboarding`) komplett; neu entdeckte, aber unklassifizierte Objekte bleiben unverändert im Discovery-Ergebnis und werden beim nächsten erfolgreichen Adapter-Start (bzw. manuellen Re-Scan über den Geräte-Tab) nachgeholt. Discovery selbst (Objekte finden) läuft unverändert weiter.
- Der jeweils andere, funktionierende Zweig ist von einem Fehler im anderen Zweig nicht betroffen.
- Da der Check nur einmal pro Adapter-Start läuft, ist keine Dedup-Logik wie bei Backlog-Punkt 2 (wiederholte History-Ausfallmeldungen) nötig.

## Testing-Ansatz

- `test/unit/providerHealthCheck.test.js` (neu): `checkProviderReachable` mit gemocktem Provider — Erfolgsfall (`reachable: true`), Fehlerfall (Provider wirft, `reachable: false` + Fehlermeldung durchgereicht).
- `test/unit/onboarding.test.js`: bestehender Test angepasst/erweitert, dass `runOnboarding` den übergebenen `provider`-Parameter nutzt (bereits heute so signaturkompatibel — Test stellt sicher, dass kein impliziter globaler Provider mehr vorausgesetzt wird).
- Kein Test macht einen echten Netzwerk-Call — Provider werden wie überall im Projekt gemockt.

## ADR

Die Zwei-Provider-Architektur (getrennte, unabhängige Config pro Zweck mit Fallback-Verhalten) ist architekturrelevant genug für eine eigene ADR (**ADR-0021**, wird als Teil des Implementierungsplans erstellt, analog zu ADR-0020 im Geräte-Tab-Plan).

## Bezug zum Backlog

Löst Backlog [Punkt 12](../adr/backlog.md) **teilweise**: Modell-Trennung nach Zweck und Erreichbarkeits-Selbstprüfung sind umgesetzt; automatische Kandidaten-Auswahl und Kosten-/Qualitäts-Bewertung bleiben bewusst außerhalb dieser Runde (siehe Nicht-Ziele) und werden beim Abschluss dieses Plans aus dem Backlog-Eintrag herausgelöst bzw. der Eintrag entsprechend präzisiert.
