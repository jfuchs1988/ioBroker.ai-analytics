# 7. Verteilungssicht

[← zurück zur Architektur-Übersicht](arc42-index.md)

Der Adapter läuft als einzelner Node.js-Prozess innerhalb der bestehenden ioBroker-Installation (js-controller, Adapter-Modus `daemon`). Keine separate Infrastruktur, keine Container, keine externe Datenbank außer der bereits vorhandenen influxdb/history/sql-Adapterinstanz. Ausgehende Netzwerkverbindungen: nur zum konfigurierten LLM-Provider (HTTPS).

```
┌───────────────────────────────────────────────────────────┐
│ ioBroker-Host (z. B. Linux-Server, Redis-Backend möglich)   │
│                                                               │
│  ┌───────────────┐   sendTo    ┌─────────────────────────┐  │
│  │ js-controller  │◀──────────▶│ ai-analytics.0 (Node.js) │  │
│  │ + States/Objects DB (Redis/│ │  main.js + lib/*          │  │
│  │   Jsonl, je nach Setup)     │ └─────────────┬─────────────┘  │
│  └───────────────┘             │               │                │
│  ┌───────────────┐             │               │                │
│  │ influxdb.0 /   │◀────────────┘               │                │
│  │ history.0 / …  │                             │                │
│  └───────────────┘                             │ HTTPS          │
└──────────────────────────────────────────────────┼────────────┘
                                                     ▼
                                     LLM-Provider (Cloud oder lokal
                                     im selben Netz, z. B. LM Studio)
```

Bestätigt im Abnahmetest (2026-08-21): Adapter läuft fehlerfrei auf einer Instanz mit Redis-basiertem States-/Objects-Backend (js-controller 7.2.2, Node.js 22.23.2) — kein spezifisches Backend vorausgesetzt, da nur die generische Adapter-API genutzt wird.

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [6. Laufzeitsicht](06-laufzeitsicht.md) · weiter zu [8. Querschnittliche Konzepte](08-querschnittliche-konzepte.md)
