# Backlog offener Architekturentscheidungen

[← ADR-Übersicht](adr-index.md) · [← Architektur-Übersicht](../architecture/arc42-index.md)

Architekturrelevante Fragen, die noch **nicht** entschieden wurden. Jeder Eintrag wird erst zu einer eigenen ADR unter `docs/adr/`, sobald eine Entscheidung getroffen ist. Sortiert nach grober Priorität (dringend/blockierend zuerst).

_Aktualisiert 2026-08-21: die vorherigen Punkte 1 (Chat-Tab-Technologie), 2 (Onboarding-Rückfragen), 3 (Konversationsgedächtnis) und 5 (Kosten-/Token-Budget) sind durch [ADR-0017](0017-scoped-catalog-write-capability.md) und die zugehörige [Spec](../specs/2026-08-21-chat-fixes-and-safeguards.md) aufgelöst. Die verbleibenden Punkte wurden entsprechend neu nummeriert._

_Aktualisiert 2026-08-22: der manuelle Re-Discovery-Trigger aus Punkt 1 und der vormalige Punkt 12 (manueller Trigger für die proaktive Prüfung) sind durch den Geräte-Tab ([Spec](../specs/2026-08-22-geraete-tab-design.md), [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md)) aufgelöst — Punkt 12 entfällt, Punkt 1 ist auf die verbleibende Instanz-Auswahl-Frage verengt._

_Aktualisiert 2026-08-22: Punkt 12 durch [ADR-0021](0021-getrennte-provider-pro-zweck.md) auf die verbleibende Frage der automatischen Kandidaten-Auswahl verengt._

_Aktualisiert 2026-08-23: Punkt 13 durch [ADR-0022](0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md) und den Token-Kosten-Tab aufgelöst — entfällt._

## 1. Auswahl der History-Adapterinstanz(en)

Aktuell werden automatisch alle aktiven `influxdb`/`history`/`sql`-Instanzen berücksichtigt. Zu klären: soll die Admin-Konfiguration eine Instanz-Auswahl anbieten (Mehrfachauswahl-Feld)?

## 2. Deduplizierung wiederholter Ausfallmeldungen

Spec verlangt "einmalig melden, nicht bei jedem Lauf erneut" bei komplettem Ausfall einer History-Instanz. Zu klären: welcher Zustand wird persistiert, um "bereits gemeldet" zu erkennen, und wann gilt eine Meldung als "erledigt" (nächster erfolgreicher Lauf? manuelles Zurücksetzen?).

## 3. Teststrategie für main.js und die Admin-UI

`test/adapter.test.js` ist durch eine veraltete `@iobroker/testing`-Verhaltensänderung faktisch wirkungslos (bestätigt weiterhin der Fall auch nach dem Dependency-Bump auf v5.3.0). Zu klären: `tests.integration` (echter js-controller, schwerer, näher an der Realität) oder ein proxyquire-basierter Fake-Adapter-Test (leichter, aber weniger realistisch)?

## 4. Technische Durchsetzung des Lizenz-/Sponsoring-Modells (evcc-Vorbild)

Durch [ADR-0018](0018-lizenzmodell-beta-frei-danach-sponsoring.md) entschieden: kein `npm publish`, keine Aufnahme in den offiziellen ioBroker-Katalog, Lizenz ist ab jetzt textlich (nicht technisch) an ein Sponsoring nach der Beta-Phase gebunden. Offen ist die **technische Durchsetzung** (Phase 2 der ADR): was genau markiert "Beta-Ende" (Versionsnummer? Datum?), Format/Ausgabe eines Sponsoring-Tokens über GitHub Sponsors, Online- vs. Offline-Prüfung im Adapter, welche Funktionen bei fehlendem Token gesperrt werden, Zeitfenster bis zur Sperre (Nutzer nannte 1 Monat als Zielgröße).

## 5. CI-/Linting-/Dependency-Scanning-Stack (konkrete Tool-Wahl)

Bereits als Folge-Plan angekündigt (GitHub Actions, ESLint+Prettier, `@iobroker/adapter-dev`-Checker, CHANGELOG-Pflege, Dependabot/Renovate), aber noch keine konkreten Konfigurationsentscheidungen (z. B. welche ESLint-Regelbasis, welcher Node-Versionsmatrix in CI).

## 6. Versionierungs-/Release-Policy nach der Beta-Phase

Wann wird aus `0.0.x-beta` eine `0.1.0`? Nach welchen Kriterien (alle bekannten Lücken behoben? erfolgreicher Langzeit-Betrieb?). Noch nicht festgelegt.

## 7. Katalog-Skalierung bei großen Installationen

Von der Spec als spätere Optimierung markiert. Zu klären: Vorfilterung nach Kategorie/Raum, Embedding-basierte Relevanzsuche, oder einfache Paginierung — sobald eine reale Installation mit vielen hundert Objekten das nötig macht.

## 8. Sicherheitsmodell für zukünftige schreibende Werkzeuge

[ADR-0017](0017-scoped-catalog-write-capability.md) hat die erste, eng begrenzte Schreibfähigkeit des **LLM-Tools** (`updateCatalogEntry`, nur für `needsReview`-Einträge) eingeführt. [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md) hat den **Admin-Message-Bus**-Pfad (Mensch über Admin-UI, voller Katalog-Schreibzugriff) als separate, bereits geklärte Vertrauensgrenze definiert. Offen bleibt das generelle Modell für künftige, weitergehende **LLM**-Schreibzugriffe (z. B. Geräte schalten): reicht eine enge, feld-/status-beschränkte Freigabe wie bei ADR-0017 weiterhin, oder braucht es ab einem bestimmten Wirkungsgrad eine explizite Nutzerbestätigung pro Schreibaktion?

## 9. Mehrinstanz-Unterstützung

Können mehrere Instanzen dieses Adapters gleichzeitig laufen (z. B. für unterschiedliche Objektgruppen oder Räume)? Bisher nicht bedacht, `catalog.*`/`chat.*` sind pro Instanz getrennt, aber Discovery ist global über alle historisierten Objekte.

## 10. Katalog-Backup/-Restore

Geht der State-Speicher verloren (z. B. Objekte-DB-Reset), muss das komplette Onboarding neu laufen — bei großen Installationen potenziell teuer. Zu klären: Export/Import-Mechanismus für den Katalog?

## 11. WhatsApp-/Alexa-Anbindung — technische Richtung

Laut [ADR-0010](0010-ausgabekanal-v1-nur-chat-tab.md) als spätere Erweiterung vorgesehen, aber keine technische Richtung entschieden (eigene Bridge? bestehender Telegram-/WhatsApp-Adapter als Zwischenschicht? Alexa Smart Home Skill?).

## 12. Automatische Kandidaten-Auswahl unter mehreren LLM-Modellen (Kosten/Qualität)

Durch [ADR-0021](0021-getrennte-provider-pro-zweck.md) teilweise gelöst: Onboarding und Chat/Prüfung können jetzt unabhängige, fest konfigurierte Provider nutzen, inkl. Start-Selbstprüfung der Erreichbarkeit. Weiterhin offen: automatisches Auswählen unter mehreren vom Nutzer eingetragenen Kandidatenmodellen anhand von Kosten/Qualität — bewusst nicht umgesetzt (siehe [Design-Spec](../specs/2026-08-22-multi-model-onboarding-design.md), Nicht-Ziele). Falls später gewünscht: Format der Bewertung (Testklassifikationen mit bekanntem Ergebnis? Kosten-pro-Objekt-Schätzung aus Provider-Preislisten?), Persistenz der automatischen Wahl, Override-UI.

