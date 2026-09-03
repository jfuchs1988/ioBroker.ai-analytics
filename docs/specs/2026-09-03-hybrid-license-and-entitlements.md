# Hybrides Lizenzmodell und Entitlements

## Kontext

Der Adapter soll wie evcc einen frei nutzbaren Open-Source-Kern mit klar
abgegrenzten sponsor-pflichtigen Mehrwertfunktionen verbinden.

## Verhalten

- Der Adapterkern wird unter MIT veröffentlicht.
- KI-Provider, Agent, KI-Onboarding sowie proaktive/anomaliebasierte Analyse
  sind sponsor-required und in `LICENSES/SPONSOR-REQUIRED.md` aufgelistet.
- Alle Beta-Versionen dürfen die sponsor-required Komponenten kostenlos nutzen.
- Ab der ersten Version ohne `-beta` benötigen diese Komponenten ein gültiges
  Sponsoring-Entitlement.
- Der Lizenzstatus darf API-Schlüssel und Nutzerdaten nicht protokollieren oder
  an einen Lizenzdienst übertragen.

## Noch festzulegen

- Tokenformat und Aussteller
- Online-/Offline-Prüfung und Caching
- Trial- und Contributor-Entitlements
- Laufzeit- und Installationsbindung
- Verhalten bei abgelaufenem oder nicht erreichbarem Entitlement-Dienst

## Nicht-Ziele

- Keine Sperre während der Beta-Phase
- Keine Zahlungsabwicklung im Adapter
- Keine technische Durchsetzung in diesem Task
