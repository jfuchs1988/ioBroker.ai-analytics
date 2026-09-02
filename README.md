# ioBroker.ai-analytics

Ein ioBroker-Adapter, der zwei Fähigkeiten kombiniert:

1. **Chat-Q&A** — Fragen in natürlicher Sprache zu historischen Verbrauchs-/Nutzungsdaten (z. B. "Wie hat sich mein Stromverbrauch verändert und warum?"), beantwortet anhand der in InfluxDB/History/SQL geloggten Objekte.
2. **Proaktive Prüfungen** — ein periodischer Hintergrundlauf lässt eine KI eigenständig auf Auffälligkeiten prüfen (Gerätenutzung, Beleuchtung, Verbrauch, PV-Einspeisung) und meldet Ergebnisse im Chat.

Nur Objekte mit aktivem History-/InfluxDB-/SQL-Logging werden berücksichtigt. Ein einmaliger (danach inkrementeller) Onboarding-Lauf klassifiziert jedes gefundene Objekt semantisch und fragt bei Unklarheit im Chat nach, statt zu raten.

## Dokumentation

Zentraler Einstiegspunkt: **[docs/README.md](docs/README.md)**.

- [Architekturdokumentation (arc42)](docs/architecture/arc42-index.md) — vollständiger Überblick über Ziele, Bausteine, Laufzeitverhalten, Entscheidungen und offene Risiken.
- [Architekturentscheidungen (ADRs)](docs/adr/adr-index.md) und [Backlog offener Entscheidungen](docs/adr/backlog.md).
- [Design-Spec](docs/specs/2026-08-21-ai-analytics-design.md) — das ursprüngliche, mit dem Nutzer abgestimmte Design.
- [Implementierungsplan](docs/plans/2026-08-21-ai-analytics-implementation.md) — die 13 TDD-Tasks, aus denen der Adapter gebaut wurde, inkl. "Known Gaps"-Abschnitt für offene Punkte.
- [CONTRIBUTING.md](CONTRIBUTING.md) — unser Entwicklungsprozess (Branching, wann Spec/Plan/ADR nötig sind, TDD-Erwartung).

## Status

v0.0.1-beta.10 released. Alle 13 ursprünglichen Implementierungs-Tasks sind abgeschlossen und reviewt. Installation, Start, Discovery, Katalog und die reparierten Admin-Transportwege wurden auf einer echten ioBroker-Instanz geprüft. Siehe [Risiken und technische Schulden](docs/architecture/11-risiken-und-schulden.md) für verbleibende Lücken.

## Voraussetzungen

- Node.js >= 18
- Eine laufende ioBroker-Instanz mit mindestens einer aktiven `influxdb`-, `history`- oder `sql`-Adapterinstanz
- Ein API-Key für mindestens einen unterstützten LLM-Provider (Anthropic, OpenAI, OpenRouter) — oder ein lokal erreichbarer OpenAI-kompatibler Server (z. B. LM Studio)

## Entwicklung

```bash
npm install
npm test
```

`npm test` führt sowohl die Unit-Tests (`test/unit/**/*.test.js`) als auch den Adapter-Smoke-Test (`test/adapter.test.js`, über `@iobroker/testing`) aus.

## Konfiguration

Über die ioBroker-Admin-Oberfläche einstellbar: LLM-Provider und API-Key, Modell, Basis-URL (für OpenRouter/lokale Server), Intervall der proaktiven Prüfung, Verhalten bei ergebnislosem Prüflauf (still vs. Bestätigung). Die Modellfelder laden Vorschläge direkt beim Provider; eine Modell-ID kann weiterhin manuell eingetragen werden.

### Kostenlose API-Modelle

[OpenRouter](https://openrouter.ai/settings/keys) ist der empfohlene Einstieg. Bei ausgewähltem Provider `OpenRouter` lädt die Modell-Auswahl automatisch nur aktuell kostenlos ausgewiesene Modelle, die Tool-Calling unterstützen. Die Erkennung basiert auf dem Live-Modellkatalog von OpenRouter; Verfügbarkeit und Rate-Limits können sich jederzeit ändern. Ohne eigene Basis-URL verwendet der Adapter automatisch `https://openrouter.ai/api/v1`.

[OpenCode Zen](https://opencode.ai/auth) ist als Alternative in der Admin-Konfiguration verlinkt. Dort angebotene Gratis-Modelle sind laut Anbieter teilweise zeitlich begrenzt und im Modell-Endpunkt nicht zuverlässig als kostenlos gekennzeichnet. Außerdem gelten je Gratis-Modell unterschiedliche Regeln zur Speicherung oder Trainingsnutzung. Deshalb nimmt der Adapter Zen nicht in die automatische Gratis-Erkennung auf. Bei Nutzung mit einer benutzerdefinierten OpenAI-kompatiblen Basis-URL dürfen nur die von Zen für `/chat/completions` ausgewiesenen Modelle gewählt werden.

Kostenlos bedeutet nicht unbegrenzt: Konten, Tageslimits und Datenschutzbedingungen werden vom jeweiligen Anbieter festgelegt. Private Smart-Home-Daten sollten nur an einen Anbieter gesendet werden, dessen Bedingungen der Betreiber geprüft und akzeptiert hat.

### Eigenes Modell fürs Onboarding (optional)

Die einmalige Klassifizierung neu gefundener Objekte kann einen komplett eigenen Provider nutzen — z. B. ein günstiges oder lokales Modell fürs Onboarding und ein starkes für Chat/Prüfung. Dafür gibt es vier zusätzliche, optionale Felder in derselben Form wie oben: `onboardingProviderType`, `onboardingApiKey`, `onboardingModel`, `onboardingBaseUrl`. Bleibt `onboardingProviderType` leer, wird die Chat-Konfiguration mitbenutzt; ist er gesetzt, gilt die Onboarding-Konfiguration vollständig eigenständig (kein feldweiser Rückfall auf die Chat-Werte). Hintergrund: [ADR-0021](docs/adr/0021-getrennte-provider-pro-zweck.md).

Beim Adapterstart wird jeder der beiden Provider einmalig auf Erreichbarkeit geprüft. Das Ergebnis steht in den States `ai-analytics.<instanz>.info.chatProviderReachable` und `ai-analytics.<instanz>.info.onboardingProviderReachable`. Eine fehlgeschlagene Prüfung blockiert jeweils nur die betroffene Funktion (Klassifizierung bzw. Chat/proaktive Prüfung), nicht den gesamten Adapter.

### Token-Kosten-Tab

Der Budget-Bereich im Admin-Tab zeigt neben dem heutigen Verbrauch auch eine Verlaufs-Historie (Balkendiagramm, wählbar 30 Tage/gesamt), berechnete Kosten getrennt nach Chat/Prüfung und Onboarding sowie eine heuristische Tages-/Stunden-Limit-Empfehlung. Die Preise pro 1 Mio. Input-/Output-Tokens werden manuell in der Admin-Config gepflegt (vier zusätzliche Felder, Default 0 — z. B. für lokale, kostenlose Modelle). Hintergrund: [ADR-0022](docs/adr/0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md).

## Projekt unterstützen

Das Projekt kann über [GitHub Sponsors](https://github.com/sponsors/jfuchs1988) unterstützt werden. Der Link ist auch dauerhaft im AI-Analytics-Tab und in der Adapter-Konfiguration sichtbar. GitHub zeigt zusätzlich einen Sponsor-Button im Repository, sobald das Sponsors-Profil für `jfuchs1988` freigeschaltet ist.
