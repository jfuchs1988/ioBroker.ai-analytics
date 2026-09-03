# ADR-0027: Hybrides Lizenzmodell nach evcc

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen (rechtliche Grundlage, technische Durchsetzung offen)  
**Datum:** 2026-09-03

## Kontext

Das bisherige Modell stellte den gesamten Adapter unter eine proprietäre
Lizenz. Als Vorbild für die weitere Monetarisierung dient evcc: Ein nutzbarer
Open-Source-Kern bleibt frei, während klar abgegrenzte, wertschöpfende
Integrationen sponsor-pflichtig sind.

## Entscheidung

- Der allgemeine Adapterkern wird unter MIT veröffentlicht.
- KI-Ausführung und KI-gestützte Analyse werden als sponsor-required
  Komponenten ausgenommen und in `LICENSES/SPONSOR-REQUIRED.md` festgehalten.
- Beta-Versionen dürfen diese Komponenten kostenlos verwenden.
- Ab der ersten stabilen Version `0.1.0` ist für diese Komponenten ein aktives
  Sponsoring oder eine andere ausgestellte Entitlement erforderlich.
- Der Sponsor-Link ist GitHub Sponsors unter
  `https://github.com/sponsors/jfuchs1988`.
- Token, Trial, Contributor-Entitlements und technische Durchsetzung werden
  in einer folgenden Spec und einem eigenen Implementierungs-Task festgelegt.
- Die Entitlement-Spec legt verbindlich fest: Token-Ausgabe über eine separate
  Webanwendung, JWS/JWT mit EdDSA/Ed25519, 35 Tage technische Token-Gültigkeit,
  30 Tage Sponsoring, 30 Tage Grace-Period ab Sponsoring-Ablauf, keine
  Instanzbindung, Offline-Signaturprüfung und danach eine Chat-Anfrage pro Tag
  statt proaktiver KI-Läufe.
- Die aktuelle Umstellung ändert nur die Lizenzabgrenzung; sie sperrt noch
  keine Funktionen.

## Konsequenzen

- `package.json` und `io-package.json` können den Adapter als MIT-lizenziert
  ausweisen, mit dokumentierter Ausnahme für sponsor-required Komponenten.
- Der Adapter kann grundsätzlich als Open-Source-Projekt verteilt werden.
- Jede spätere geschützte Datei muss in `LICENSES/SPONSOR-REQUIRED.md`
  ergänzt und mit einem Lizenzheader versehen werden.
- Die technische Freischaltung muss offline-fähig, testbar und unabhängig von
  der Speicherung von API-Schlüsseln umgesetzt werden.
- Das Beta-Ende ist mit `0.1.0` festgelegt.
- Die Lizenztexte sind nicht anwaltlich geprüft.

## Abgrenzung zu ADR-0018

ADR-0018 wird für die Gesamt-Lizenzierung durch diese Entscheidung ersetzt.
Die dort beschlossene technische Nichtdurchsetzung bleibt bis zur neuen
Entitlement-Spezifikation als Zwischenstand bestehen.
