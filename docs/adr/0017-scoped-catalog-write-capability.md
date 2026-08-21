# ADR-0017: Scoped Catalog Write Capability for Resolving Onboarding Rückfragen

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Onboarding-Rückfragen zu unsicheren Objekten (`needsReview: true`) waren bis hierhin nicht beantwortbar — der Chat-Agent hatte nur lesende Werkzeuge (siehe [ADR-0002](0002-datenzugriff-nur-historisierte-objekte.md)). Der Nutzer wollte Rückfragen direkt im selben Chat beantworten können.

## Entscheidung

Der Chat-Agent bekommt ein einziges, eng begrenztes Schreib-Werkzeug (`updateCatalogEntry`), das ausschließlich Katalogeinträge mit `needsReview: true` bearbeiten darf. Ein Zugriffsversuch auf einen bereits geklärten Eintrag wird abgelehnt. Das Werkzeug kann `description`, `category`, `room` setzen und löscht danach `needsReview`.

## Konsequenzen

- Erste Schreibfähigkeit der KI überhaupt — bewusst auf den kleinstmöglichen Anwendungsfall begrenzt (nur unsichere, noch ungeklärte Einträge).
- Kein Zugriff auf bereits validierte Katalogeinträge oder andere ioBroker-States.
- Öffnet den Weg für künftige, ähnlich eng begrenzte Schreib-Werkzeuge (siehe [Backlog](backlog.md) Punkt 12 zum generellen Sicherheitsmodell für Schreibzugriffe).

## Verworfene Alternativen

- Ein Formular in der Admin-Konfiguration statt im Chat.
- Ein separates Message-Kommando außerhalb des normalen Chat-Flows.
