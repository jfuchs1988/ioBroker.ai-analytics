// test/e2e/adapter.e2e.test.js
//
// Echter End-to-End-Test: installiert einen echten js-controller in ein
// Temp-Verzeichnis, legt eine echte Adapterinstanz an und startet sie als
// echten Prozess (siehe docs/specs/2026-09-04-teststrategie-main-und-admin-ui.md).
// Läuft nicht in `npm test` (Minuten-lang, Netzzugriff für die
// js-controller-Installation) — separater `npm run test:e2e`, manueller
// Pre-Release-Schritt.
//
// Kein LLM-Provider-Aufruf: `native.apiKey` bleibt leer, main.js überspringt
// die Erreichbarkeitsprüfung dann bewusst (main.js#checkProviderConfigured).
//
// Verifikation erfolgt über `harness.on('stateChange', ...)`, nicht über
// einen direkten DB-Read nach dem Start: Ein `harness.states.getState(...)`
// direkt nach `startAdapterAndWait()` lieferte im ersten Testlauf `null`
// zurück, obwohl main.js den State nachweislich (Log-Ausgabe) gesetzt hatte —
// vermutlich eine separate Verbindung/Race auf der Redis-Emulation der
// Testumgebung. Das offizielle Harness-Event ist der dokumentierte Weg,
// State-Änderungen aus dem laufenden Adapterprozess zuverlässig zu beobachten.
const path = require('path');
const { expect } = require('chai');
const { tests } = require('@iobroker/testing');

tests.integration(path.join(__dirname, '..', '..'), {
    defineAdditionalTests({ suite }) {
        suite('Adapterstart gegen echten js-controller', getHarness => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it(
                'startet ohne Fehler und meldet die Provider-Health-States, ohne einen LLM-Aufruf zu machen',
                () =>
                    new Promise((resolve, reject) => {
                        const adapterId = `${harness.adapterName}.0`;
                        const seen = {};

                        harness.on('stateChange', (id, state) => {
                            if (id === `${adapterId}.info.chatProviderReachable`) seen.chat = state;
                            if (id === `${adapterId}.info.onboardingProviderReachable`) seen.onboarding = state;
                            if (seen.chat && seen.onboarding) {
                                try {
                                    expect(seen.chat.val).to.equal(false);
                                    expect(seen.onboarding.val).to.equal(false);
                                    expect(harness.isAdapterRunning()).to.equal(true);
                                    resolve();
                                } catch (error) {
                                    reject(error);
                                }
                            }
                        });

                        harness.startAdapterAndWait().catch(reject);
                    })
            ).timeout(120000);

            after(async () => {
                await harness.stopAdapter();
            });
        });
    },
});
