# ADR-0004: Onboarding-/Katalog-Phase vor jeder Analyse

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Explizite Nutzeranforderung: Die KI soll Objekte einmal "einlesen" und verstehen, bei Unklarheit nachfragen, und danach schneller/günstiger arbeiten — nicht bei jeder Anfrage die Bedeutung der Objekte neu erraten.

## Entscheidung

Ein einmaliger (danach inkrementeller) Onboarding-Lauf klassifiziert jedes historisierte Objekt semantisch und speichert das Ergebnis dauerhaft im Katalog (`lib/catalog.js`, `lib/onboarding.js`). Chat-Q&A und proaktive Prüfung greifen ausschließlich auf diesen Katalog zu, nie auf rohe Objektmetadaten.

## Konsequenzen

- Folgeanfragen sind günstig — die KI muss Objektbedeutungen nicht wiederholt erraten.
- Neue Objekte werden inkrementell nachklassifiziert, nicht bei jedem Adapterstart alle neu.
- Erfordert einen zusätzlichen Zustand (Katalog) mit eigenem Lebenszyklus (aktiv/inaktiv, Reaktivierung) — mehr Komplexität als "immer live nachschauen".
- Unsichere Klassifizierungen (`needsReview`) brauchen einen Klärungsweg — aktuell nur eine Rückfrage ohne Antwortkanal (siehe [Backlog](backlog.md)).

## Verworfene Alternativen

- Bedeutung bei jeder Anfrage neu erraten lassen (kein Katalog).
