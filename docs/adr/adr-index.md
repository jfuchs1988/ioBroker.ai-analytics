# Architecture Decision Records — Übersicht

[← zurück zur Dokumentations-Übersicht](../README.md) · [← zurück zur Architektur-Übersicht](../architecture/arc42-index.md)

Jede Zeile ist eine eigene Entscheidung im [Nygard-Format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (Kontext, Entscheidung, Konsequenzen). Noch nicht entschiedene, aber architekturrelevante Fragen stehen im [Backlog](backlog.md), nicht hier.

| # | Titel | Status | Datum |
|---|---|---|---|
| [0001](0001-eigener-adapter-statt-erweiterung.md) | Eigener Adapter statt Erweiterung eines bestehenden KI-Adapters | Angenommen | 2026-08-21 |
| [0002](0002-datenzugriff-nur-historisierte-objekte.md) | Datenzugriff nur auf Objekte mit aktivem History-Logging | Angenommen | 2026-08-21 |
| [0003](0003-tool-calling-agent-statt-precompute-oder-raw-query.md) | Tool-Calling-Agent statt vorberechneter Zusammenfassungen oder roher Query-Generierung | Angenommen | 2026-08-21 |
| [0004](0004-onboarding-katalog-phase.md) | Onboarding-/Katalog-Phase vor jeder Analyse | Angenommen | 2026-08-21 |
| [0005](0005-proaktive-pruefung-ohne-regeln.md) | Proaktive Prüfung: KI bewertet Daten komplett selbst, keine festen Regeln | Angenommen | 2026-08-21 |
| [0006](0006-default-bestaetigung-posten.md) | Default-Verhalten bei ergebnislosem Prüflauf: Bestätigung posten | Angenommen | 2026-08-21 |
| [0007](0007-mehrere-llm-provider-konfigurierbar.md) | Mehrere LLM-Provider konfigurierbar statt fest auf einen Provider | Angenommen | 2026-08-21 |
| [0008](0008-kein-vendor-sdk.md) | Kein Vendor-SDK, direkte REST-Aufrufe via fetch | Angenommen | 2026-08-21 |
| [0009](0009-reines-javascript-kein-typescript.md) | Reines JavaScript (CommonJS), kein TypeScript, kein Build-Schritt | Angenommen | 2026-08-21 |
| [0010](0010-ausgabekanal-v1-nur-chat-tab.md) | Ausgabekanal v1: nur Admin-Chat-Tab | Angenommen | 2026-08-21 |
| [0011](0011-subagent-driven-development.md) | Entwicklung via subagent-driven-development: Haiku für Implementierung, teures Modell für Review/Denken | Angenommen | 2026-08-21 |
| [0012](0012-isolierter-git-worktree.md) | Isolierter Git-Worktree für die Implementierung | Angenommen (abgeschlossen) | 2026-08-21 |
| [0013](0013-api-key-verschluesselung.md) | API-Key wird über encryptedNative/protectedNative verschlüsselt/geschützt | Angenommen | 2026-08-21 |
| [0014](0014-zeitanker-in-system-prompts.md) | Beide LLM-System-Prompts enthalten einen expliziten Zeitanker | Angenommen | 2026-08-21 |
| [0015](0015-dokumentationsstruktur.md) | Dokumentationsstruktur: arc42 Multi-File + ADRs + Obsidian-MOCs | Angenommen | 2026-08-21 |
| [0016](0016-git-branching-modell.md) | Git-Branching-Modell: develop/master mit manueller Freigabe | Angenommen | 2026-08-21 |
| [0017](0017-scoped-catalog-write-capability.md) | Scoped Catalog Write Capability für Onboarding-Rückfragen | Angenommen | 2026-08-21 |
| [0018](0018-lizenzmodell-beta-frei-danach-sponsoring.md) | Lizenzmodell — Beta frei, danach Sponsoring-Pflicht (Vorbild evcc) | Angenommen (Phase 1 von 2) | 2026-08-22 |
| [0019](0019-feature-branch-pro-task.md) | Feature-/Bugfix-Branch pro Umsetzungsplan-Task, lokal nach develop gemergt | Angenommen | 2026-08-22 |
| [0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md) | Admin-Message-Bus bekommt vollen Katalog-Schreibzugriff (unabhängig von needsReview) | Angenommen | 2026-08-22 |
| [0021](0021-getrennte-provider-pro-zweck.md) | Getrennte LLM-Provider pro Zweck (Onboarding vs. Chat/Prüfung) mit Fallback und Start-Selbstprüfung | Angenommen | 2026-08-22 |
| [0022](0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md) | Manuell gepflegte Preise statt automatischer Preisliste, unbegrenzte tägliche Verbrauchs-Historie | Angenommen | 2026-08-23 |
| [0023](0023-state-bridge-ausweichkanal-admin-tab.md) | State-Bridge (`admin.bridge`) als Ausweichkanal für Admin-Tab-Befehle, wenn `sendTo` aus dem Tab nicht zustellt | Angenommen | 2026-08-24 |
