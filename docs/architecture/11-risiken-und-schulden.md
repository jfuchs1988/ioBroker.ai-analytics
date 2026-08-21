# 11. Risiken und technische Schulden

[← zurück zur Architektur-Übersicht](arc42-index.md)

Aus dem Implementierungsplan übernommen (siehe [Plan, Abschnitt "Known Gaps"](../plans/2026-08-21-ai-analytics-implementation.md)):

- **Keine deduplizierten Ausfallmeldungen**: Ein kompletter Ausfall der History-Instanz sollte laut Spec "einmalig gemeldet, nicht bei jedem Lauf erneut" werden. Aktuell werden `getHistory`-Fehler nur als Tool-Fehler an den Agenten zurückgegeben, der sie in Worten einbaut — es gibt keinen persistenten "bereits gemeldet"-Zustand, der Wiederholungen unterdrückt. Vorgesehen für einen Folge-Plan, sobald reales Ausfallverhalten beobachtbar ist.
- **Keine Katalog-Vorfilterung bei sehr großen Installationen**: Bei stark wachsender Objektzahl könnte der volle Katalog als LLM-Kontext zu groß werden. Von der Spec explizit als spätere Optimierung markiert, kein Blocker für v1.
- **Kein Kosten-/Token-Budget für LLM-Aufrufe**: Aktuell keine Obergrenze, wie oft/teuer die proaktive Prüfung pro Tag wird. Siehe [Offene Architekturentscheidungen](../adr/backlog.md).
- **Keine CI/Linting/Dependency-Scanning**: bewusst auf einen Folge-Plan verschoben, um zuerst die Kernfunktionalität fertigzustellen.
- **Onboarding-Rückfragen sind nicht auflösbar:** Für Objekte mit `needsReview: true` postet das System eine Rückfrage im Chat, aber es gibt aktuell keinen Weg, eine Nutzerantwort zurück in den Katalog zu schreiben — der Chat-Q&A-Agent hat nur lesende Werkzeuge. Objekte bleiben dauerhaft `needsReview: true` und von Analysen ausgeschlossen. Für v1 als Limitierung akzeptiert; siehe [Offene Architekturentscheidungen](../adr/backlog.md).
- **Keine Konversationshistorie im Chat-Agenten:** Jede Chat-Frage startet den Agenten ohne vorherige Nachrichten im Kontext, obwohl die Spec Folgefragen mit erhaltenem Kontext vorsieht. `chat.history` ist aktuell nur ein Anzeige-Log. Siehe [Offene Architekturentscheidungen](../adr/backlog.md).
- **Keine Auswahl der History-Adapterinstanz(en) und kein manueller Re-Discovery-Trigger:** Die Spec sieht beides in der Admin-Konfiguration vor; aktuell werden automatisch alle aktiven influxdb/history/sql-Instanzen berücksichtigt, und ein Neu-Einlesen erfordert einen Adapter-Neustart. Siehe [Offene Architekturentscheidungen](../adr/backlog.md).
- **Main.js und die Admin-UI haben effektiv keine automatisierte Testabdeckung:** siehe [Testkonzept](08-querschnittliche-konzepte.md#84-testkonzept) — der Adapter-Smoke-Test ist durch eine veraltete `@iobroker/testing`-v4-Verhaltensänderung ein No-Op.
- **Zwei kleinere, in der Fix-Wellen-Nachprüfung bewusst zurückgestellte Punkte:** (a) `lastSeen` wird bei der Katalog-Reaktivierung nur bei tatsächlicher Reaktivierung oder Instanzwechsel aktualisiert, nicht bei jedem "unverändert weiterhin gesehen"-Sync — kein vollständiger Heartbeat; (b) die Reaktivierungs-`setCatalogEntry`-Aufrufe in `syncCatalog` sind nicht wie der übrige Abschnitt in try/catch abgesichert (geringes Risiko, da nur bereits validierte Felder per Spread übernommen werden). Beide Minor, für die CI-/Hardening-Folge-Runde vorgesehen.

## Manueller Abnahmetest (gestartet 2026-08-21, auf einer echten ioBroker-Instanz `iobroker-001`, Redis-Backend, js-controller 7.2.2, Node 22.23.2, Installation via `.tgz`)

Bestätigt funktionierend:
- Installation via `iobroker url <pfad>.tgz` läuft sauber durch (unrelated `node-gyp`-Fehler bei anderen, bereits installierten Adaptern — nicht unser Paket, das hat keine nativen Build-Abhängigkeiten).
- Adapter startet mehrfach fehlerfrei, `onReady` läuft vollständig durch (`ai-analytics adapter ready` im Log, keine Fehler, kein Absturz), auch nach mehreren Neustarts.
- Discovery + Katalog-Sync + Onboarding funktionieren gegen echte Objekte: Katalogeinträge wurden unter `ai-analytics.0.catalog.<sourceId>` angelegt (die verschachtelte, dem Quellobjekt-Pfad nachempfundene Struktur im Objektbaum ist beabsichtigt, kein Fehler).

Bestätigt **nicht** funktionierend:
- **Admin-Chat-Tab**: rendert, aber Nachrichten können nicht abgeschickt werden. Ursachenhypothese (noch nicht per Browser-Konsole verifiziert): `admin/tab.js`s `init()` läuft nur, wenn `typeof adapterNamespace !== 'undefined'`; `adapterNamespace` ist vermutlich kein reales ioBroker-Admin-Global (Fehler im ursprünglichen Plan-Code), wodurch `init()` nie läuft und die Klick-Handler nie angehängt werden. Nächster Schritt (mit Nutzer vereinbart, noch ausstehend): im Browser F12 auf dem Tab prüfen — `typeof adapterNamespace`, `typeof io`, `window.location.href`, `typeof parent.socket` — um die tatsächlich verfügbaren Admin-Globals zu ermitteln, bevor ein gezielter Fix geschrieben wird (kein blindes Rate-Fixing wie beim vorherigen Versuch).

Noch nicht geprüft: Qualität der KI-Klassifizierung (Katalogeintrag-Inhalt wurde noch nicht im Detail angeschaut), Chat-Q&A-Funktionalität (blockiert durch den Chat-Tab-Fehler), proaktive Prüfung (kein manueller Trigger vorhanden, siehe [Offene Architekturentscheidungen](../adr/backlog.md)).

---
[← zurück zur Architektur-Übersicht](arc42-index.md) · [10. Qualitätsanforderungen](10-qualitaetsanforderungen.md) · weiter zu [12. Glossar](12-glossar.md)
