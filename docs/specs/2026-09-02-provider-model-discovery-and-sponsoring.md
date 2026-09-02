# Provider-Modellerkennung und Sponsoring

## Kontext

Nutzer sollen den Adapter ohne vorherige Kenntnis konkreter Modell-IDs konfigurieren können. Besonders wichtig ist ein auffindbarer Einstieg zu kostenlos nutzbaren APIs. Gleichzeitig soll auf allen Admin-Oberflächen sichtbar sein, wie das Projekt über GitHub Sponsors unterstützt werden kann.

OpenRouter ist der bevorzugte kostenlose Einstieg, weil dessen Modell-API Preise und Tool-Unterstützung maschinenlesbar liefert. OpenCode Zen wird als Alternative verlinkt, aber nicht als verlässliche Gratisquelle behandelt: Gratisangebote sind zeitlich begrenzt, der Modell-Endpunkt kennzeichnet Preise nicht vollständig und einzelne Gratisangebote dürfen Eingaben zum Training verwenden.

## Verhalten

### Modell-Auswahl

- Die Modellfelder für Chat/Prüfung und Onboarding sind Autocomplete-Felder mit weiterhin möglicher manueller Eingabe.
- Beim Wechsel von Provider, API-Key oder Basis-URL fragt die Admin-Konfiguration die verfügbaren Modelle erneut beim Adapter ab.
- OpenRouter verwendet ohne manuelle Basis-URL `https://openrouter.ai/api/v1`.
- Bei OpenRouter werden ausschließlich Modelle angeboten, deren Modellmetadaten sowohl kostenlose Text-Ein- und Ausgabe als auch Tool-Calling ausweisen. Die manuelle Eingabe anderer Modell-IDs bleibt möglich.
- OpenAI, Anthropic und lokale OpenAI-kompatible Endpunkte listen ihre gemeldeten Modelle ohne Kostenklassifikation auf.
- Ein lokaler Provider benötigt eine Basis-URL. Fehlt der `/models`-Endpunkt oder schlägt der Abruf fehl, bleibt die manuelle Modelleingabe nutzbar.
- API-Keys werden nur für den unmittelbaren Provider-Aufruf verwendet, weder geloggt noch persistiert oder an den Custom-Tab weitergegeben.

### Anbieter-Links

- Die Admin-Konfiguration verlinkt auf die OpenRouter-Key-Erstellung und kennzeichnet OpenRouter als Empfehlung für automatisch erkannte kostenlose Tool-Modelle.
- OpenCode Zen wird als alternative, möglicherweise zeitlich begrenzt kostenlose API verlinkt.
- Die Dokumentation nennt Limits und Datenschutz als vom jeweiligen Anbieter abhängige Eigenschaften und verspricht keine dauerhafte kostenlose Verfügbarkeit.

### Sponsoring

- Die GitHub-Sponsors-URL ist `https://github.com/sponsors/jfuchs1988`.
- Der Custom-Tab zeigt den Link dauerhaft in der Navigation, damit er in Chat, Geräte und Budget sichtbar bleibt.
- Die JSON-Konfiguration zeigt einen Sponsoring-Link.
- `.github/FUNDING.yml` aktiviert nach Freischaltung des GitHub-Sponsors-Profils den Sponsor-Button im Repository.
- `package.json` veröffentlicht dieselbe URL als `funding`-Metadatum.

## Fehlerverhalten

- Modelllisten verwenden einen kurzen Netzwerk-Timeout.
- HTTP-, Netzwerk- und Formatfehler liefern eine leere Vorschlagsliste und eine bereinigte Warnung. Das Konfigurationsformular bleibt durch freie Texteingabe bedienbar.
- Ein fehlender API-Key verhindert nur bei Providern den Abruf, die ihn verlangen. Lokale Endpunkte erhalten keinen leeren Authorization-Header.

## Nicht-Ziele

- Keine Garantie, dass ein extern als kostenlos bezeichnetes Modell dauerhaft oder ohne Konto-/Rate-Limit nutzbar bleibt.
- Keine automatische Auswahl eines Modells und keine automatische Änderung gespeicherter Konfiguration.
- Keine Preisermittlung für Provider ohne maschinenlesbare Preisdaten.
- Keine technische Prüfung des Sponsoring-Status.
- Keine automatische Einrichtung oder Freischaltung des persönlichen GitHub-Sponsors-Profils.
