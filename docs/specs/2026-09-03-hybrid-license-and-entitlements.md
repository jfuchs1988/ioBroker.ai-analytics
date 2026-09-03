# Hybrides Lizenzmodell und Entitlements

## Kontext

Der Adapter soll wie evcc einen frei nutzbaren Open-Source-Kern mit klar
abgegrenzten sponsor-pflichtigen Mehrwertfunktionen verbinden.

## Verhalten

- Der Adapterkern wird unter MIT veröffentlicht.
- KI-Provider, Agent, KI-Onboarding sowie proaktive/anomaliebasierte Analyse
  sind sponsor-required und in `LICENSES/SPONSOR-REQUIRED.md` aufgelistet.
- Alle Beta-Versionen dürfen die sponsor-required Komponenten kostenlos nutzen.
- Nach dem noch festzulegenden Beta-Ende benötigen diese Komponenten ein
  gültiges Sponsoring-Entitlement.
- Der Lizenzstatus darf API-Schlüssel und Nutzerdaten nicht protokollieren oder
  an einen Lizenzdienst übertragen.
- Tokens werden über eine geplante Webanwendung ausgestellt.
- Eine Token-Gültigkeit von 35 Tagen wird verwendet; sie deckt die offizielle
  Sponsoring-Periode von 30 Tagen mit einem technischen Übergangspuffer ab.
- Nach Ablauf des Sponsorings gilt eine Grace-Period von 30 Tagen.
- Nach Ablauf von Token und Grace-Period bleibt eine Chat-Anfrage pro Tag
  möglich. Proaktive KI-Prüfungen werden in diesem eingeschränkten Zustand
  nicht ausgeführt.
- Tokens werden nicht an eine ioBroker-Instanz gebunden.
- Die erste technische Prüfung soll offline anhand eines signierten Tokens
  erfolgen; eine dauerhafte Online-Prüfung im Adapter ist nicht vorgesehen.

## Noch festzulegen

- Tokenformat und Aussteller
- konkrete Webanwendung und ihr Sponsoring-Abgleich
- Trial- und Contributor-Entitlements
- Verhalten bei abgelaufenem oder nicht erreichbarem Entitlement-Dienst
- Definition des Beta-Endes: fixes Datum oder erste stabile Version `0.1.0`

## Nicht-Ziele

- Keine Sperre während der Beta-Phase
- Keine Zahlungsabwicklung im Adapter
- Keine technische Durchsetzung in diesem Task
- Keine Bindung an eine einzelne ioBroker-Instanz
