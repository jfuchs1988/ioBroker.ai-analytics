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
