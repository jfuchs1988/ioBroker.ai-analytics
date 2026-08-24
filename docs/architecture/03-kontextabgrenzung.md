# 3. Kontextabgrenzung

[← zurück zur Architektur-Übersicht](arc42-index.md)

## 3.1 Fachlicher Kontext

```
┌─────────────┐   Frage (Chat-Tab)    ┌────────────────────┐
│   Nutzer     │ ─────────────────────▶│                     │
│ (Admin-UI)   │◀───────────────────── │  ioBroker.ai-analytics│
└─────────────┘   Antwort/Meldung      │                     │
                                        └─────────┬───────────┘
                                                   │ getHistory (sendTo)
                                                   ▼
                                   ┌───────────────────────────────┐
                                   │ influxdb.X / history.X / sql.X │
                                   │  (bestehende ioBroker-Adapter)  │
                                   └───────────────────────────────┘
                                                   │
                                                   ▼
                                        historisierte Objekte
                                     (Verbrauch, PV, Lampen, Geräte, Umgebung)

                                                   │ REST (fetch)
                                                   ▼
                                   ┌───────────────────────────────┐
                                   │  LLM-Provider (konfigurierbar)  │
                                   │  Anthropic / OpenAI / OpenRouter│
                                   │  / lokal (LM Studio o.ä.)       │
                                   └───────────────────────────────┘
```

## 3.2 Technischer Kontext

| Schnittstelle | Partner | Protokoll/Format |
|---|---|---|
| Chat-Frage/-Antwort, Admin-Befehle | Admin-Chat-Tab (Browser) | ioBroker-Socket: `sendTo`/`getState`, bei Nichtzustellung von `sendTo` zusätzlich State-Bridge `admin.bridge` (`setState`/Polling, siehe [ADR-0023](../adr/0023-state-bridge-ausweichkanal-admin-tab.md)) |
| Historische Daten | influxdb-/history-/sql-Adapterinstanz | ioBroker `sendTo` Message-API, Kommando `getHistory` |
| LLM-Aufrufe | Anthropic Messages API / OpenAI-kompatible Chat-Completions API | HTTPS/REST, JSON, `fetch` |
| Konfiguration | ioBroker Admin (JSON Config) | `io-package.json` `native`-Felder |

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [2. Randbedingungen](02-randbedingungen.md) · weiter zu [4. Lösungsstrategie](04-loesungsstrategie.md)
