# KI-Laufzeit

[← Agent-Fachkontext](README.md)

## Providervertrag

`lib/providers/index.js` erzeugt einen providerunabhängigen Client mit
`chat({ system, messages, tools })`. Anthropic und OpenAI-kompatible Endpunkte
werden ohne Vendor-SDK über `fetch` angesprochen. Providerfehler müssen zwischen
retry-fähigen Transportfehlern und permanenten Payload-/Konfigurationsfehlern
unterscheiden.

Chat/Prüfung und Onboarding können getrennte Provider verwenden. Das Onboarding
fällt nur dann auf den Chatprovider zurück, wenn kein eigener Provider
konfiguriert ist.

## Agent und Werkzeuge

- `lib/agent.js` führt einen begrenzten Tool-Use-Loop aus.
- Toolnamen, Eingabeschemas und Dispatcher müssen gemeinsam geändert werden.
- Toolausgaben und Providerpayloads bleiben größenbegrenzt.
- Proaktive Läufe erhalten ausschließlich read-only Werkzeuge.
- Katalogänderungen durch das Modell bleiben auf den bestätigten,
  katalogbezogenen Schreibvertrag beschränkt.

## Prompts

Beide Systemprompts enthalten aktuellen Zeitanker, lokale Zeitzone und die in
ioBroker hinterlegten Standortdaten. Prompts erklären Unix-Millisekunden und
fordern belegbare Aussagen statt erfundener Werte.

## Nutzung

Providerantworten liefern Input- und Output-Token. `lib/usage.js` persistiert
die Nutzung getrennt nach Chat und Onboarding und berechnet Kosten aus den
konfigurierten Preisen. Das Tageslimit ist ein EUR-Betrag, keine Tokenzahl.
