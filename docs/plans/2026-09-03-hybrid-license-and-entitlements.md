# Plan: Hybrides Lizenzmodell und Entitlements

1. Lizenzumfang mit MIT-Kern und sponsor-required Komponenten dokumentieren.
2. Admin- und Paketmetadaten auf das Hybridmodell umstellen.
3. Sponsoring-Entitlement mit signiertem Ed25519-JWS, separater
   Ausstellungs-Webanwendung, `exp = sponsorUntil`, 30-Tage-Sponsoring,
   30-Tage-Grace-Period, Offline-Prüfung und täglichem Chat-Fallback
   spezifizieren.
4. Vor `0.1.0` technische Prüfung, Trial und
   Fehlermodi implementieren und testen.

## Status

Die Spec und der Implementierungsplan sind umgesetzt. `lib/license.js` prüft
Entitlements aktiv, die Token-Konfiguration ist geschützt und die separate
Ausstellungs-Webanwendung ist produktiv angebunden.

## Festgelegte Entitlement-Regeln

- keine Instanzbindung
- Token-Ausgabe über eine separate Webanwendung
- Tokenformat: JWS/JWT mit `EdDSA`/Ed25519, `kid` zur Schlüsselrotation und
  den Claims `tokenVersion`, `iss`, `aud`, `licenseId`, `iat`, `nbf`, `exp` und
  `sponsorUntil`
- `exp = sponsorUntil`; keine separate technische Pufferfrist
- 30 Tage offizielle Sponsoring-Periode
- 30 Tage Grace-Period ab Sponsoring-Ablauf; die fünf zusätzlichen Token-Tage
  liegen innerhalb dieser Grace-Period
- danach eine Chat-Anfrage pro Tag; keine proaktiven KI-Läufe
- Offline-Signaturprüfung im Adapter statt dauerhafter Online-Prüfung

## Ausstellungs-Webanwendung

- separates Repository/Deployment, nicht Bestandteil des ioBroker-Adapters
- GitHub-OAuth für den Antragsteller
- Sponsoring-Abgleich über GitHub-Sponsors-Daten oder administrativen
  Freigabeprozess
- private Ed25519-Schlüssel ausschließlich serverseitig in Secret Storage
- Token als Kopieren/Download; keine ioBroker-Daten und keine API-Keys
- Audit-Log, Rate-Limiting und Schlüsselrotation über `kid`

## Festgelegte Beta-Regel

Die technische Entitlement-Prüfung ist seit `0.1.0` aktiv; Beta-Versionen sind
nicht ausgenommen.
