# ADR-0013: API-Key wird über encryptedNative/protectedNative verschlüsselt/geschützt

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-21

## Kontext

In der finalen Whole-Branch-Review wurde als Critical-Finding entdeckt: der LLM-API-Key wurde nur über ein `password`-Feld in der Admin-JSON-Config maskiert. Das schützt lediglich die Eingabe im Browser — nicht Speicherung (der Key lag im Klartext in der Objekte-DB) oder Transport (der Key wurde an jeden Socket-Client gesendet, der die Instanz-Objekte liest, nicht nur an Admin-Clients).

## Entscheidung

`io-package.json` markiert `apiKey` in `common.encryptedNative` und `common.protectedNative`. js-controller verschlüsselt den Wert dadurch automatisch in der Objekte-DB und sendet ihn nicht an Nicht-Admin-Clients. `@iobroker/adapter-core` entschlüsselt transparent — `this.config.apiKey` bleibt im Adaptercode unverändert nutzbar.

## Konsequenzen

- API-Key ist weder im Klartext gespeichert noch für beliebige Clients einsehbar.
- Kein Codeeingriff nötig über die zwei `io-package.json`-Felder hinaus.
- Bei einem Adapter-Update/Migration muss diese Markierung erhalten bleiben — sonst regressiert die Sicherheit stillschweigend.

## Verworfene Alternativen

- Nur `password`-Feld ohne zusätzliche Verschlüsselung (ursprünglicher Stand, als unsicher erkannt).
