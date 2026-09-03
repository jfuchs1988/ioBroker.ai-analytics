# Hybrides Lizenzmodell und Entitlements

## Kontext

Der Adapter soll wie evcc einen frei nutzbaren Open-Source-Kern mit klar
abgegrenzten sponsor-pflichtigen Mehrwertfunktionen verbinden.

## Verhalten

- Der Adapterkern wird unter MIT veröffentlicht.
- KI-Provider, Agent, KI-Onboarding sowie proaktive/anomaliebasierte Analyse
  sind sponsor-required und in `LICENSES/SPONSOR-REQUIRED.md` aufgelistet.
- Alle Beta-Versionen dürfen die sponsor-required Komponenten kostenlos nutzen.
- Ab der ersten stabilen Version `0.1.0` benötigen diese Komponenten ein
  gültiges Sponsoring-Entitlement.
- Der Lizenzstatus darf API-Schlüssel und Nutzerdaten nicht protokollieren oder
  an einen Lizenzdienst übertragen.
- Tokens werden über eine separate Webanwendung ausgestellt.
- Das Format ist ein signiertes JWS/JWT mit `EdDSA` auf Ed25519-Basis. Der
  Adapter enthält nur den öffentlichen Schlüssel.
- Die offizielle Sponsoring-Periode beträgt 30 Tage. Das Token hat 35 Tage
  technische Gültigkeit als Übergangspuffer.
- Die 30-Tage-Grace-Period beginnt mit dem Ende der offiziellen Sponsoring-
  Periode, nicht erst mit dem technischen Tokenablauf. Die fünf zusätzlichen
  Token-Tage liegen damit innerhalb der Grace-Period.
- Nach Ablauf von Token und Grace-Period bleibt eine Chat-Anfrage pro Tag
  möglich. Proaktive KI-Prüfungen werden in diesem eingeschränkten Zustand
  nicht ausgeführt.
- Tokens werden nicht an eine ioBroker-Instanz gebunden.
- Die technische Prüfung erfolgt offline anhand des signierten Tokens; eine
  dauerhafte Online-Prüfung im Adapter ist nicht vorgesehen.
- Die erste Adapterimplementierung darf während der Beta dormant bleiben,
  solange das öffentliche Schlüsselregister noch nicht mit dem Schlüssel der
  Ausstellungs-Webanwendung bestückt ist.

Das JWS-Payload enthält mindestens `tokenVersion: 1`, `iss: "ai-analytics-license"`,
`aud: "ioBroker.ai-analytics"`, `licenseId`, `iat`, `nbf`, `exp` und
`sponsorUntil`. Der Header enthält `alg: "EdDSA"`, `typ: "JWT"` und einen
`kid` für Schlüsselrotation.

## Noch festzulegen

- konkrete Webanwendung und ihr Sponsoring-Abgleich
- Trial- und Contributor-Entitlements
- Verhalten bei abgelaufenem oder nicht erreichbarem Entitlement-Dienst
- Details des Webanwendungs-Hostings und Secrets-Management

## Nicht-Ziele

- Keine Sperre während der Beta-Phase
- Keine Zahlungsabwicklung im Adapter
- Keine technische Durchsetzung in diesem Task
- Keine Bindung an eine einzelne ioBroker-Instanz
