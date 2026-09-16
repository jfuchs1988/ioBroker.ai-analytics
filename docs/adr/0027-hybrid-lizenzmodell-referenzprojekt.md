# ADR-0027: Hybrides Lizenzmodell nach Referenzprojekt

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen und produktiv umgesetzt
**Datum:** 2026-09-03

## Kontext

Das bisherige Modell stellte den gesamten Adapter unter eine proprietäre
Lizenz. Als Referenz für die weitere Monetarisierung dient ein Referenzprojekt: Ein nutzbarer
Open-Source-Kern bleibt frei, während klar abgegrenzte, wertschöpfende
Integrationen sponsor-pflichtig sind.

## Entscheidung

- Der allgemeine Adapterkern wird unter MIT veröffentlicht.
- KI-Ausführung und KI-gestützte Analyse werden als sponsor-required
  Komponenten ausgenommen und in `LICENSES/SPONSOR-REQUIRED.md` festgehalten.
- Alle Versionen benötigen für diese Komponenten ein aktives Sponsoring oder
  eine andere ausgestellte Entitlement.
- Der Sponsor-Link ist GitHub Sponsors unter
  `https://github.com/sponsors/jfuchs1988`.
- Token, Trial-Entitlements und technische Durchsetzung sind in der
  Entitlement-Spec und der produktiven Backend-Integration festgelegt.
- Die Entitlement-Spec legt verbindlich fest: Token-Ausgabe über eine separate
  Webanwendung, JWS/JWT mit EdDSA/Ed25519, 30 Tage technische Token-Gültigkeit,
  30 Tage Sponsoring, 30 Tage Grace-Period ab Sponsoring-Ablauf, keine
  Instanzbindung, Offline-Signaturprüfung und danach eine Chat-Anfrage pro Tag
  statt proaktiver KI-Läufe.
- Die aktive Offline-Prüfung ist in `lib/license.js` umgesetzt; die
  Ausstellungs-Webanwendung und der öffentliche Signaturschlüssel sind
  produktiv angebunden.

## Konsequenzen

- `package.json` und `io-package.json` können den Adapter als MIT-lizenziert
  ausweisen, mit dokumentierter Ausnahme für sponsor-required Komponenten.
- Der Adapter kann grundsätzlich als Open-Source-Projekt verteilt werden.
- Jede spätere geschützte Datei muss in `LICENSES/SPONSOR-REQUIRED.md`
  ergänzt und mit einem Lizenzheader versehen werden.
- Die technische Freischaltung muss offline-fähig, testbar und unabhängig von
  der Speicherung von API-Schlüsseln umgesetzt werden.
- `0.1.0` ist die erste stabile Version; die Entitlement-Prüfung gilt bereits
  für Beta-Versionen.
- Die Lizenztexte sind nicht anwaltlich geprüft.

## Abgrenzung zu ADR-0018

ADR-0018 wird für die Gesamt-Lizenzierung durch diese Entscheidung ersetzt.
Die dort beschlossene technische Nichtdurchsetzung bleibt bis zur neuen
Entitlement-Spezifikation als Zwischenstand bestehen.

## Korrektur (2026-09-10)

Die "35 Tage technische Token-Gültigkeit" oben ist durch das Backend-Team
verworfen worden (Backend-ADR 0004): Der technische Tokenablauf (`exp`)
entspricht jetzt exakt `sponsorUntil`, ohne separaten Pufferzeitraum. Kein
Codechange in diesem Repository nötig, da `lib/license.js` Grace bereits aus
`sponsorUntil` statt `exp` berechnet. Siehe
[Spec](../specs/2026-09-03-hybrid-license-and-entitlements.md) und
`docs/agents/licensing.md` für den aktuellen Stand.
