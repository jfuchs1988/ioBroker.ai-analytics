# Backlog offener Architekturentscheidungen

[← ADR-Übersicht](adr-index.md) · [← Architektur-Übersicht](../architecture/arc42-index.md)

Architekturrelevante Fragen, die noch **nicht** entschieden wurden. Jeder Eintrag wird erst zu einer eigenen ADR unter `docs/adr/`, sobald eine Entscheidung getroffen ist. Sortiert nach grober Priorität (dringend/blockierend zuerst).

## 1. Admin-Chat-Tab: reparieren oder migrieren?

Der Chat-Tab (`admin/tab.html`/`tab.js`, Legacy-Tab-Muster) ist im Abnahmetest bestätigt nicht funktionsfähig — vermutlich weil `adapterNamespace` kein reales Admin-Global ist. Zwei Optionen: (a) den Legacy-Tab reparieren (Namespace/Instanz aus `window.location.search` oder `parent.socket` ableiten), oder (b) auf einen modernen React-basierten Admin-Tab (`@iobroker/adapter-react-v5`) migrieren, wie es aktuelle ioBroker-Adapter-Vorlagen nutzen. (a) ist der kleinere Eingriff, (b) ist zukunftssicherer aber deutlich mehr Aufwand (Build-Schritt, React-Abhängigkeit — Konflikt mit [ADR-0009](0009-reines-javascript-kein-typescript.md)). **Blockiert die gesamte Chat-Funktionalität, höchste Priorität.**

## 2. Wie werden Onboarding-Rückfragen beantwortbar?

Aktuell postet das System eine Rückfrage im Chat, aber es gibt keinen Schreibkanal zurück in den Katalog. Optionen: ein neues, schreibendes Werkzeug für den Chat-Agenten (`updateCatalogEntry`); ein eigenes Message-Kommando (`catalogAnswer`) außerhalb des normalen Chat-Flows; oder ein Formular in der Admin-Konfiguration statt im Chat. Berührt auch Punkt 12 (Sicherheitsmodell für schreibende Werkzeuge).

## 3. Konversationsgedächtnis im Chat

`runAgent` startet jede Frage ohne vorherige Nachrichten im Kontext. Zu klären: wie viele vorherige Nachrichten aus `chat.history` werden mitgegeben, gibt es eine Token-/Zeit-Grenze, wird bei Bedarf zusammengefasst (Summarization) statt alles roh mitzugeben?

## 4. Auswahl der History-Adapterinstanz(en) + manueller Re-Discovery-Trigger

Aktuell werden automatisch alle aktiven `influxdb`/`history`/`sql`-Instanzen berücksichtigt. Zu klären: soll die Admin-Konfiguration eine Instanz-Auswahl anbieten (Mehrfachauswahl-Feld)? Soll es einen Button/Message-Kommando geben, das `syncCatalog()` manuell ohne Adapter-Neustart auslöst (auch nützlich zum Testen der proaktiven Prüfung, siehe Punkt 16 unten — eigentlich derselbe Mechanismus).

## 5. Kosten-/Token-Budget für LLM-Aufrufe

Keine Obergrenze, wie oft/teuer proaktive Prüfungen oder Chat-Fragen werden. Zu klären: harte Tages-/Monats-Obergrenze? Nur eine Warnung? Ein State mit kumulierten Token-/Kostenschätzungen, den der Nutzer beobachten kann?

## 6. Deduplizierung wiederholter Ausfallmeldungen

Spec verlangt "einmalig melden, nicht bei jedem Lauf erneut" bei komplettem Ausfall einer History-Instanz. Zu klären: welcher Zustand wird persistiert, um "bereits gemeldet" zu erkennen, und wann gilt eine Meldung als "erledigt" (nächster erfolgreicher Lauf? manuelles Zurücksetzen?).

## 7. Teststrategie für main.js und die Admin-UI

`test/adapter.test.js` ist durch eine veraltete `@iobroker/testing`-v4-Verhaltensänderung faktisch wirkungslos. Zu klären: `tests.integration` (echter js-controller, schwerer, näher an der Realität) oder ein proxyquire-basierter Fake-Adapter-Test (leichter, aber weniger realistisch)? Sollte mit der bestätigt kaputten Admin-Tab-Situation zusammen angegangen werden.

## 8. npm-Veröffentlichung und ioBroker-Katalog-Aufnahme

Aktuell nur GitHub-Release (Pre-Release), kein `npm publish`, keine Aufnahme in den offiziellen ioBroker-Adapter-Katalog. Zu klären: wann (nach erfolgreichem Abnahmetest? nach CI-Einführung? nach Behebung aller bekannten Lücken?) und ob überhaupt eine öffentliche Distribution gewünscht ist, oder ob es ein rein privates Tool bleibt.

## 9. CI-/Linting-/Dependency-Scanning-Stack (konkrete Tool-Wahl)

Bereits als Folge-Plan angekündigt (GitHub Actions, ESLint+Prettier, `@iobroker/adapter-dev`-Checker, CHANGELOG-Pflege, Dependabot/Renovate), aber noch keine konkreten Konfigurationsentscheidungen (z. B. welche ESLint-Regelbasis, welcher Node-Versionsmatrix in CI).

## 10. Versionierungs-/Release-Policy nach der Beta-Phase

Wann wird aus `0.0.x-beta` eine `0.1.0`? Nach welchen Kriterien (alle bekannten Lücken behoben? erfolgreicher Langzeit-Betrieb?). Noch nicht festgelegt.

## 11. Katalog-Skalierung bei großen Installationen

Von der Spec als spätere Optimierung markiert. Zu klären: Vorfilterung nach Kategorie/Raum, Embedding-basierte Relevanzsuche, oder einfache Paginierung — sobald eine reale Installation mit vielen hundert Objekten das nötig macht.

## 12. Sicherheitsmodell für zukünftige schreibende Werkzeuge

Aktuell hat die KI nur Lesezugriff (siehe [ADR-0002](0002-datenzugriff-nur-historisierte-objekte.md), [Querschnittliche Konzepte §8.3](../architecture/08-querschnittliche-konzepte.md#83-sicherheits-zugriffskonzept)). Falls künftig ein schreibendes Werkzeug entsteht (z. B. Punkt 2, oder gar Geräte schalten) — welches Bestätigungs-/Autorisierungsmodell gilt dann? Reicht die aktuelle "Admin-Message-Bus"-Vertrauensgrenze noch, oder braucht es eine explizite Nutzerbestätigung pro Schreibaktion?

## 13. Mehrinstanz-Unterstützung

Können mehrere Instanzen dieses Adapters gleichzeitig laufen (z. B. für unterschiedliche Objektgruppen oder Räume)? Bisher nicht bedacht, `catalog.*`/`chat.*` sind pro Instanz getrennt, aber Discovery ist global über alle historisierten Objekte.

## 14. Katalog-Backup/-Restore

Geht der State-Speicher verloren (z. B. Objekte-DB-Reset), muss das komplette Onboarding neu laufen — bei großen Installationen potenziell teuer. Zu klären: Export/Import-Mechanismus für den Katalog?

## 15. WhatsApp-/Alexa-Anbindung — technische Richtung

Laut [ADR-0010](0010-ausgabekanal-v1-nur-chat-tab.md) als spätere Erweiterung vorgesehen, aber keine technische Richtung entschieden (eigene Bridge? bestehender Telegram-/WhatsApp-Adapter als Zwischenschicht? Alexa Smart Home Skill?).

## 16. Manueller Trigger für die proaktive Prüfung

Aktuell nur über das konfigurierte Intervall (Default 24h) auslösbar — es gibt keinen Weg, sie zu Test-/Debugging-Zwecken sofort anzustoßen. Hängt eng mit Punkt 4 (Re-Discovery-Trigger) zusammen — evtl. derselbe generische "jetzt ausführen"-Mechanismus für beides.
