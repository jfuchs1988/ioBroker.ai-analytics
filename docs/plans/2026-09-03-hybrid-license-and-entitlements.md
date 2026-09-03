# Plan: Hybrides Lizenzmodell und Entitlements

1. Lizenzumfang mit MIT-Kern und sponsor-required Komponenten dokumentieren.
2. Admin- und Paketmetadaten auf das Hybridmodell umstellen.
3. Sponsoring-Entitlement mit 35-Tage-Token, 30-Tage-Sponsoring,
   30-Tage-Grace-Period, Offline-Prüfung und täglichem Chat-Fallback
   spezifizieren.
4. Vor der ersten Nicht-Beta-Version technische Prüfung, Trial und
   Fehlermodi implementieren und testen.

## Status

Schritte 1 bis 3 sind spezifiziert. Schritt 4 bleibt bis zur Entscheidung über
das Beta-Ende und die konkrete Webanwendung offen.

## Festgelegte Entitlement-Regeln

- keine Instanzbindung
- Token-Ausgabe über eine geplante Webanwendung
- 35 Tage technische Token-Gültigkeit
- 30 Tage offizielle Sponsoring-Periode
- 30 Tage Grace-Period nach Sponsoring-Ablauf
- danach eine Chat-Anfrage pro Tag; keine proaktiven KI-Läufe
- Offline-Signaturprüfung im Adapter statt dauerhafter Online-Prüfung

## Offene Entscheidung

Das Beta-Ende ist noch nicht festgelegt: Es kann ein fixes Datum oder die erste
stabile Version `0.1.0` sein. Vor dieser Entscheidung darf keine technische
Sperre aktiv werden.
