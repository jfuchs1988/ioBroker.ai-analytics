# Backlog offener Architekturentscheidungen

[← ADR-Übersicht](adr-index.md) · [← Architektur-Übersicht](../architecture/arc42-index.md)

Architekturrelevante Fragen, die noch **nicht** entschieden wurden. Jeder Eintrag wird erst zu einer eigenen ADR unter `docs/adr/`, sobald eine Entscheidung getroffen ist. Sortiert nach grober Priorität (dringend/blockierend zuerst).

_Aktualisiert 2026-08-21: die vorherigen Punkte 1 (Chat-Tab-Technologie), 2 (Onboarding-Rückfragen), 3 (Konversationsgedächtnis) und 5 (Kosten-/Token-Budget) sind durch [ADR-0017](0017-scoped-catalog-write-capability.md) und die zugehörige [Spec](../specs/2026-08-21-chat-fixes-and-safeguards.md) aufgelöst. Die verbleibenden Punkte wurden entsprechend neu nummeriert._

_Aktualisiert 2026-08-22: der manuelle Re-Discovery-Trigger aus Punkt 1 und der vormalige Punkt 12 (manueller Trigger für die proaktive Prüfung) sind durch den Geräte-Tab ([Spec](../specs/2026-08-22-geraete-tab-design.md), [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md)) aufgelöst — Punkt 12 entfällt, Punkt 1 ist auf die verbleibende Instanz-Auswahl-Frage verengt._

_Aktualisiert 2026-08-22: Punkt 12 durch [ADR-0021](0021-getrennte-provider-pro-zweck.md) auf die verbleibende Frage der automatischen Kandidaten-Auswahl verengt._

_Aktualisiert 2026-09-03: Der Nutzer bestätigt, dass die History-Adapter-Auswahl zunächst nicht erweitert werden muss; die aktuelle Unterstützung von `influxdb`, `history` und `sql` bleibt ausreichend. Mehrinstanz-Unterstützung soll global bleiben. Katalog-Backup/Restore, WhatsApp/Alexa und automatische Modellauswahl werden nicht benötigt._

## 1. Auswahl der History-Adapterinstanz(en) — zurückgestellt

Aktuell werden automatisch alle aktiven `influxdb`/`history`/`sql`-Instanzen berücksichtigt. Eine Erweiterung auf weitere History-Adapter oder eine Instanz-Auswahl ist zunächst nicht erforderlich.

## 2. Deduplizierung und abgestufte Wiederholung von Ausfallmeldungen

Implementiert: pro History-Instanz wird ein persistenter Health-Status geführt. Nach drei aufeinanderfolgenden Fehlern wird einmalig im Chat gemeldet und die Instanz wird aus den Prüfungen genommen. Wiederholungen erfolgen nach 12, 24 und 48 Stunden. Nach dem letzten erfolglosen Retry wird die Instanz nicht weiter automatisch belastet. Eine erfolgreiche Abfrage setzt den Status zurück.

## 3. Teststrategie für main.js und die Admin-UI

`test/adapter.test.js` ist durch eine veraltete `@iobroker/testing`-Verhaltensänderung faktisch wirkungslos (bestätigt weiterhin der Fall auch nach dem Dependency-Bump auf v5.3.0). Zu klären: `tests.integration` (echter js-controller, schwerer, näher an der Realität) oder ein proxyquire-basierter Fake-Adapter-Test (leichter, aber weniger realistisch)?

## 4. Technische Durchsetzung des Lizenz-/Sponsoring-Modells (evcc-Vorbild)

Durch [ADR-0018](0018-lizenzmodell-beta-frei-danach-sponsoring.md) entschieden: kein `npm publish`, keine Aufnahme in den offiziellen ioBroker-Katalog, Lizenz ist ab jetzt textlich (nicht technisch) an ein Sponsoring nach der Beta-Phase gebunden. Offen ist die **technische Durchsetzung** (Phase 2 der ADR): was genau markiert "Beta-Ende" (Versionsnummer? Datum?), Format/Ausgabe eines Sponsoring-Tokens über GitHub Sponsors, Online- vs. Offline-Prüfung im Adapter, welche Funktionen bei fehlendem Token gesperrt werden, Zeitfenster bis zur Sperre (Nutzer nannte 1 Monat als Zielgröße).

## 5. CI-/Linting-/Dependency-Scanning-Stack (konkrete Tool-Wahl)

Bereits als Folge-Plan angekündigt (GitHub Actions, ESLint+Prettier, `@iobroker/adapter-dev`-Checker, CHANGELOG-Pflege, Dependabot/Renovate), aber noch keine konkreten Konfigurationsentscheidungen (z. B. welche ESLint-Regelbasis, welcher Node-Versionsmatrix in CI).

## 6. Versionierungs-/Release-Policy nach der Beta-Phase — TODO

Wann wird aus `0.0.x-beta` eine `0.1.0`? Nach welchen Kriterien (alle bekannten Lücken behoben? erfolgreicher Langzeit-Betrieb?). Noch nicht festgelegt.

## 7. Katalog-Skalierung bei großen Installationen — TODO

Von der Spec als spätere Optimierung markiert. Zu klären: Vorfilterung nach Kategorie/Raum, Embedding-basierte Relevanzsuche, oder einfache Paginierung — sobald eine reale Installation mit vielen hundert Objekten das nötig macht.

## 8. Sicherheitsmodell für zukünftige schreibende Werkzeuge

[ADR-0017](0017-scoped-catalog-write-capability.md) hat die erste, eng begrenzte Schreibfähigkeit des **LLM-Tools** (`updateCatalogEntry`, nur für `needsReview`-Einträge) eingeführt. [ADR-0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md) hat den **Admin-Message-Bus**-Pfad (Mensch über Admin-UI, voller Katalog-Schreibzugriff) als separate, bereits geklärte Vertrauensgrenze definiert. Offen bleibt das generelle Modell für künftige, weitergehende **LLM**-Schreibzugriffe (z. B. Geräte schalten): reicht eine enge, feld-/status-beschränkte Freigabe wie bei ADR-0017 weiterhin, oder braucht es ab einem bestimmten Wirkungsgrad eine explizite Nutzerbestätigung pro Schreibaktion?

## 9. Mehrinstanz-Unterstützung — Entscheidung: global

Mehrere Instanzen dürfen global über alle historisierten Objekte arbeiten. Eine Einschränkung nach Räumen oder Objektgruppen ist nicht vorgesehen. Die technische Mehrinstanz-Isolation der ioBroker-Namespaces bleibt bestehen.

## 10. Katalog-Backup/-Restore — entfällt

Wird aktuell nicht benötigt. Der Geräte-Tab bietet bereits CSV-Export/-Import für die praktische Bearbeitung bestehender Einträge.

## 11. WhatsApp-/Alexa-Anbindung — später

Bleibt eine spätere Erweiterung und wird derzeit nicht geplant.

## 12. Automatische Kandidaten-Auswahl unter mehreren LLM-Modellen — entfällt

Es wird ein Provider/Modell pro Zweck konfiguriert. Eine automatische Kosten-/Qualitätsauswahl wird nicht benötigt.

