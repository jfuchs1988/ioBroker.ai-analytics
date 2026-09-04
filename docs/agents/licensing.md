# Lizenz und Entitlements

[← Agent-Fachkontext](README.md) · [Lizenzübersicht](../../LICENSES/README.md)

Third-party dependency attribution is summarized in
`LICENSES/THIRD-PARTY-NOTICES.md`; the exact dependency inventory is
`package-lock.json`.

## Modell

- Der allgemeine Adapterkern steht unter MIT.
- Die in `LICENSES/SPONSOR-REQUIRED.md` aufgeführten KI-Komponenten sind vom
  MIT-Umfang ausgenommen und tragen einen Dateikopf mit diesem Hinweis.
- Alle Beta-Versionen erlauben deren kostenlose Nutzung.
- Die produktive Durchsetzung beginnt frühestens mit `0.1.0` und erst nach
  Bereitstellung der separaten Ausstellungs-Webanwendung und öffentlicher
  Ed25519-Schlüssel.

## Technischer Vertrag

`lib/license.js` enthält bereits die dormant-fähige Offline-Prüfung für
Ed25519-JWS, Claims, die 30-tägige Grace-Period und den täglichen
Chat-Fallback. Die Ausstellungs-Webanwendung muss die vertraglichen 30 Tage
Sponsoring und 35 Tage Tokenlaufzeit beim Erzeugen des Tokens durchsetzen.
Während der Beta gewährt der Versionsguard Vollzugriff.

## Änderungsregeln

- Neue sponsor-pflichtige Dateien in `LICENSES/SPONSOR-REQUIRED.md` aufnehmen
  und mit dem vorhandenen Lizenzhinweis versehen.
- Keine privaten Schlüssel in Adapter, Repository oder Paket aufnehmen.
- Entitlement-Tokens wie API-Schlüssel behandeln: geschützt, verschlüsselt,
  nicht exportieren und nicht protokollieren.
- Änderungen an Claims, Fristen oder Zugriffsumfang benötigen Spec, ADR und
  Sicherheitstests.
- Die Lizenztexte sind nicht anwaltlich geprüft.
