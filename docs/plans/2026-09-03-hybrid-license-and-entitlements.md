# Plan: Hybrides Lizenzmodell und Entitlements

1. Lizenzumfang mit MIT-Kern und sponsor-required Komponenten dokumentieren.
2. Admin- und Paketmetadaten auf das Hybridmodell umstellen.
3. Sponsoring-Entitlement mit signiertem Ed25519-JWS, separater
   Ausstellungs-Webanwendung, 35-Tage-Token, 30-Tage-Sponsoring,
   30-Tage-Grace-Period, Offline-Prüfung und täglichem Chat-Fallback
   spezifizieren.
4. Vor `0.1.0` technische Prüfung, Trial und
   Fehlermodi implementieren und testen.

## Status

Schritte 1 bis 3 sind spezifiziert. Ein dormant-fähiges `lib/license.js`-
Prüfmodul und die geschützte Token-Konfiguration sind als Vorbereitung
umgesetzt. Die produktive Sperre bleibt bis zur Ausstellungs-Webanwendung und
der Veröffentlichung von `0.1.0` deaktiviert.

## Festgelegte Entitlement-Regeln

- keine Instanzbindung
- Token-Ausgabe über eine separate Webanwendung
- Tokenformat: JWS/JWT mit `EdDSA`/Ed25519 und `kid` zur Schlüsselrotation
- 35 Tage technische Token-Gültigkeit
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

Mit Veröffentlichung von `0.1.0` wird die technische Entitlement-Prüfung
aktiviert. Bis dahin bleiben alle Beta-Versionen vollständig frei.
