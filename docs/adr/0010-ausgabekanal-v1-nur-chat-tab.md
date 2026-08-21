# ADR-0010: Ausgabekanal v1 — nur Admin-Chat-Tab

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

Denkbare Ausgabekanäle für Chat-Antworten und proaktive Meldungen: Admin-Chat-Tab, WhatsApp, Alexa-Benachrichtigung, Telegram. Nutzerentscheidung: "erst mal einfach im Adapter-Tab", weitere Kanäle explizit als spätere Erweiterung benannt.

## Entscheidung

v1 implementiert ausschließlich einen Admin-Chat-Tab (`admin/tab.html`/`tab.js`) als Ein-/Ausgabekanal. Keine Multi-Channel-Anbindung.

## Konsequenzen

- Kleinerer Funktionsumfang für v1, schneller lieferbar.
- **Bestätigt im Abnahmetest (2026-08-21):** Der Chat-Tab ist aktuell der einzige Kanal — und er ist zugleich der Teil, der bestätigt nicht funktioniert (siehe [Risiken](../architecture/11-risiken-und-schulden.md)). Solange das nicht behoben ist, hat der Adapter effektiv keinen nutzbaren Ausgabekanal, obwohl die zugrundeliegende Logik (Katalog, Onboarding) funktioniert.
- WhatsApp-/Alexa-Anbindung würde eine eigene Bridge/Integration erfordern — nicht bedacht, siehe [Backlog](backlog.md).

## Verworfene Alternativen

- Sofortige Multi-Channel-Anbindung (WhatsApp, Alexa) parallel zum Chat-Tab.
