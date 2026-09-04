# Admin-Oberfläche

[← Agent-Fachkontext](README.md)

## Zwei Oberflächen

- `admin/jsonConfig.json` definiert Einstellungen und bindet Custom Components
  ein.
- `src-admin/` enthält deren React-Quellen. Änderungen erfordern
  `npm run build:admin`; das Ergebnis liegt im ausgelieferten Admin-Bundle.
- `admin/tab.html` und `admin/tab.js` bilden den separaten Chat-Tab ohne React.

## Kommunikation

Kurze Adminbefehle versuchen `sendTo`. Bei Zustellfehlern und für Langläufer
dient `admin.bridge` als State-basierter Ausweichkanal. Eine Bridge-Antwort ist
nur mit `ack:true` gültig; dieselbe Request-ID allein unterscheidet Anfrage und
Antwort nicht.

## Custom Components

Module Federation erwartet den Komponentencontainer als Default-Export. Bei
Importen mit mehreren Feldänderungen `onChangeAsync` verwenden, damit jede
Änderung vom Elternzustand übernommen wurde, bevor die nächste folgt.

## Live-Prüfung

Nach Adapterupdates den ioBroker-Admin-Tab hart neu laden. Der Module-
Federation-Loader kann einen fehlgeschlagenen Remote-Load bis zum Reload im
Browser-Tab cachen. UI-Änderungen auf Desktop und schmaler Breite prüfen.
