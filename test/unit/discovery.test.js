const { expect } = require('chai');
const sinon = require('sinon');
const { findHistorizedObjects } = require('../../lib/discovery');

describe('findHistorizedObjects', () => {
    it('returns only objects with an enabled history/influxdb/sql logging instance', async () => {
        const adapter = {
            getForeignObjectsAsync: sinon.stub().resolves({
                'javascript.0.verbrauch.gesamt': {
                    common: {
                        name: 'Gesamtverbrauch',
                        custom: { 'influxdb.0': { enabled: true } },
                    },
                },
                'javascript.0.verbrauch.disabled': {
                    common: {
                        name: 'Nicht geloggt',
                        custom: { 'history.0': { enabled: false } },
                    },
                },
                'javascript.0.sonstwas': {
                    common: { name: 'Kein Logging' },
                },
            }),
        };

        const result = await findHistorizedObjects(adapter);

        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.deep.equal({
            id: 'javascript.0.verbrauch.gesamt',
            historyInstance: 'influxdb.0',
            common: {
                name: 'Gesamtverbrauch',
                custom: { 'influxdb.0': { enabled: true } },
            },
        });
    });
});
