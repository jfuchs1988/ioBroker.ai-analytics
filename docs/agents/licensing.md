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

## Repochecker-Konsistenz (Voraussetzung für die offizielle Adapter-Liste)

`@iobroker/repochecker` prüft strikt:

- `package.json` `license` und `io-package.json`
  `common.licenseInformation.license` müssen exakt gleich sein (SPDX-Wert, z. B.
  `MIT`). `common.licenseInformation.type` muss `free`/`paid`/`commercial`/
  `limited` sein — `limited` passt für "MIT-Kern, einzelne Funktionen
  sponsor-pflichtig" (Referenz: evcc-Modell), nicht `commercial` (das steht für
  "nur bei kommerzieller Nutzung lizenzpflichtig").
- Die Root-`LICENSE`-Datei muss reiner, unveränderter Lizenztext sein (siehe
  GitHub-Lizenzerkennung: ein angehängter Sonderabschnitt lässt GitHub die
  Lizenz als "other" statt "MIT" erkennen). Sponsor-Ausnahmen gehören
  ausschließlich in `LICENSES/exclusions.md`/`SPONSOR-REQUIRED.md` und in die
  Datei-Header der betroffenen Quellen.
- `io-package.json` `common.news` braucht einen Eintrag für die aktuelle
  `common.version` und darf nicht über ~20 Einträge wachsen (harter Fehler);
  der Repository-Builder kappt ohnehin bei 7 Einträgen. Bei jedem
  Versionswechsel: neuen Eintrag ergänzen, ältesten entfernen.

Diese drei Punkte vor jeder Prüfung mit dem offiziellen Checker
(`adapter-check.iobroker.in` bzw. `@iobroker/repochecker`) gegenlesen.

## Änderungsregeln

- Neue sponsor-pflichtige Dateien in `LICENSES/SPONSOR-REQUIRED.md` aufnehmen
  und mit dem vorhandenen Lizenzhinweis versehen.
- Keine privaten Schlüssel in Adapter, Repository oder Paket aufnehmen.
- Entitlement-Tokens wie API-Schlüssel behandeln: geschützt, verschlüsselt,
  nicht exportieren und nicht protokollieren.
- Änderungen an Claims, Fristen oder Zugriffsumfang benötigen Spec, ADR und
  Sicherheitstests.
- Die Lizenztexte sind nicht anwaltlich geprüft.
