# ADR-0009: Reines JavaScript (CommonJS), kein TypeScript, kein Build-Schritt

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Moderne ioBroker-Adapter werden häufig in TypeScript geschrieben (via `@iobroker/create-adapter`-Vorlage). Dieses Projekt ist ein einzelner, überschaubarer Adapter (10 `lib/*`-Module, ~700 Zeilen Produktionscode).

## Entscheidung

Reines JavaScript (CommonJS `require`/`module.exports`), kein TypeScript, kein Bundler/Build-Schritt — YAGNI-Prinzip.

## Konsequenzen

- Kein Compile-Schritt vor Tests/Deployment — einfacherer Entwicklungs-Loop.
- Kein statisches Typsystem — Tippfehler in Objekt-Shapes werden erst zur Laufzeit/durch Tests gefunden, nicht durch den Compiler.
- Für die aktuelle Projektgröße als vertretbar eingeschätzt; bei deutlichem Wachstum (siehe [Bausteinsicht §5.2](../architecture/05-bausteinsicht.md) zur Beobachtung, dass `main.js` wächst) wäre eine spätere TypeScript-Migration oder zumindest JSDoc-Typannotationen eine Option — nicht aktuell entschieden.

## Verworfene Alternativen

- TypeScript + Compile-Schritt.
