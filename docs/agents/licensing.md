# Lizenz und Entitlements

[← Agent-Fachkontext](README.md) · [Lizenzübersicht](../../LICENSES/README.md)

Third-party dependency attribution is summarized in
`LICENSES/THIRD-PARTY-NOTICES.md`; the exact dependency inventory is
`package-lock.json`.

## Modell

- Der allgemeine Adapterkern steht unter MIT.
- Die in `LICENSES/SPONSOR-REQUIRED.md` aufgeführten KI-Komponenten sind vom
  MIT-Umfang ausgenommen und tragen einen Dateikopf mit diesem Hinweis.
- Auch Beta-Versionen benötigen für Chat, Onboarding und proaktive Analysen ein
  gespeichertes, gültiges Sponsoring-Entitlement.
- Die produktive Durchsetzung ist seit `0.1.0` aktiv; die separate
  Ausstellungs-Webanwendung und der öffentliche Ed25519-Schlüssel sind produktiv
  angebunden.

## Technischer Vertrag

`lib/license.js` enthält die aktive Offline-Prüfung für
Ed25519-JWS, Claims, die 30-tägige Grace-Period und den täglichen
Chat-Fallback. Die Ausstellungs-Webanwendung muss beim Erzeugen des Tokens
`exp = sponsorUntil` durchsetzen (30 Tage Sponsoring, keine separate
technische Pufferfrist; siehe Backend-ADR 0004). Auch Beta-Versionen passieren
keinen Versions-Bypass.

## Änderungsregeln

- Neue sponsor-pflichtige Dateien in `LICENSES/SPONSOR-REQUIRED.md` aufnehmen
  und mit dem vorhandenen Lizenzhinweis versehen.
- Keine privaten Schlüssel in Adapter, Repository oder Paket aufnehmen.
- Entitlement-Tokens wie API-Schlüssel behandeln: geschützt, verschlüsselt,
  nicht exportieren und nicht protokollieren.
- Änderungen an Claims, Fristen oder Zugriffsumfang benötigen Spec, ADR und
  Sicherheitstests.
- Die Lizenztexte sind nicht anwaltlich geprüft.
