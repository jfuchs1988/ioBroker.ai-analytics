# Tests und Verifikation

[← Agent-Fachkontext](README.md) · [Testkonzept](../architecture/08-querschnittliche-konzepte.md#84-testkonzept)

## Befehle

```bash
npm test
npm run lint
npm run build:admin
npx mocha test/unit/<name>.test.js
```

## Teststrategie

- Fachmodule werden mit Mocha, Chai und Sinon isoliert getestet.
- `main.js`-Orchestrierung wird über Proxyquire und eine Fake-Adapter-API
  geprüft.
- Admin-Helfer werden soweit möglich ohne DOM getestet.
- Neue Verhaltensänderungen beginnen mit einem reproduzierenden roten Test.
- Fehlerpfade, Grenzen und ungültige persistierte Daten gehören zu jedem
  relevanten Vertrag.

## Bekannte Grenze

`test/adapter.test.js` basiert auf einem deprecated Verhalten von
`@iobroker/testing` und ist kein echter js-controller-End-to-End-Test. Es gibt
keine vollständige automatisierte DOM-Abdeckung der Admin-Oberfläche. Diese
Grenzen nicht als fehlende gesamte `main.js`-Abdeckung beschreiben; die
Orchestratorpfade besitzen fokussierte Unit-Tests.

Die jeweils aktuelle Anzahl erfolgreicher Tests kommt aus der Testausgabe und
wird nicht in dauerhaften Dokumenten festgeschrieben.
