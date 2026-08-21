# ADR-0008: Kein Vendor-SDK, direkte REST-Aufrufe via fetch

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Für die LLM-Anbindung stehen offizielle SDKs zur Verfügung (`@anthropic-ai/sdk`, `openai`-npm-Paket). Node.js >= 18 bringt bereits ein eingebautes `fetch` mit.

## Entscheidung

Provider-Clients rufen die REST-APIs direkt über das globale `fetch` auf, ohne Vendor-SDK-Abhängigkeit (siehe [ADR-0009](0009-reines-javascript-kein-typescript.md) zur allgemeinen Abhängigkeits-Zurückhaltung).

## Konsequenzen

- Minimale Abhängigkeiten, kleinerer Angriffs-/Wartungsaufwand (keine SDK-Versionsupdates verfolgen).
- Volle Kontrolle über Request/Response-Mapping in das normalisierte interne Nachrichtenformat (siehe [Querschnittliche Konzepte](../architecture/08-querschnittliche-konzepte.md#81-nachrichtenformat-zwischen-agenttoolsprovidern-normalisiert)).
- Muss API-Änderungen der Provider selbst nachziehen, statt dass ein SDK das übernimmt — vertretbares Risiko bei zwei stabilen, gut dokumentierten APIs (Anthropic Messages API, OpenAI Chat Completions API).

## Verworfene Alternativen

- `@anthropic-ai/sdk`, `openai`-npm-Paket.
