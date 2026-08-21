# ADR-0007: Mehrere LLM-Provider konfigurierbar statt fest auf einen Provider

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Bestehende ioBroker-KI-Adapter (AI Toolbox, AI Assistant) unterstützen bereits mehrere LLM-Provider konfigurierbar. Der Nutzer wollte dieses Muster übernehmen, u. a. um kostenlose/lokale Optionen (OpenRouter-Freemodelle, lokale Server) offenzuhalten.

## Entscheidung

`lib/providers/index.js` unterstützt vier Provider-Typen über eine einheitliche Schnittstelle: `anthropic`, `openai`, `openrouter`, `local` (OpenAI-kompatibel). Auswahl + Zugangsdaten über die Admin-Konfiguration.

## Konsequenzen

- Nutzer ist nicht an einen Anbieter/dessen Preismodell gebunden, kann auch komplett lokal/kostenlos betreiben.
- Zwei separate Provider-Client-Implementierungen (`anthropic.js`, `openaiCompatible.js`) statt einer — mehr Code, aber `openaiCompatible.js` deckt drei der vier Typen gemeinsam ab.
- Jeder neue Provider-Typ mit eigenem Wire-Format bräuchte einen weiteren Client.

## Verworfene Alternativen

- Festlegung auf einen einzelnen Provider.
