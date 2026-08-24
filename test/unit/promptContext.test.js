const { expect } = require('chai');
const sinon = require('sinon');
const { buildTimeAndLocationContext } = require('../../lib/promptContext');

describe('buildTimeAndLocationContext', () => {
    const now = new Date('2026-08-24T11:58:00.000Z');

    it('includes city/country and lat/long from system.config when set', async () => {
        const adapter = {
            getForeignObjectAsync: sinon.stub().resolves({
                common: { city: 'Kriftel', country: 'Germany', latitude: 50.0794, longitude: 8.4659 },
            }),
        };

        const context = await buildTimeAndLocationContext(adapter, now);

        expect(context).to.include('Kriftel');
        expect(context).to.include('Germany');
        expect(context).to.include('50.0794');
        expect(context).to.include('8.4659');
    });

    it('always includes the UTC ISO time, epoch millis, and a local timezone name', async () => {
        const adapter = {
            getForeignObjectAsync: sinon.stub().resolves({ common: {} }),
        };

        const context = await buildTimeAndLocationContext(adapter, now);

        expect(context).to.include('2026-08-24T11:58:00.000Z');
        expect(context).to.include(String(now.getTime()));
        expect(context).to.match(/Zeitzone [A-Za-z_/+\-0-9]+/);
    });

    it('omits the location line when system.config has no city/country configured', async () => {
        const adapter = {
            getForeignObjectAsync: sinon.stub().resolves({ common: {} }),
        };

        const context = await buildTimeAndLocationContext(adapter, now);

        expect(context).to.not.include('Standort');
    });

    it('does not throw when system.config is missing entirely', async () => {
        const adapter = {
            getForeignObjectAsync: sinon.stub().resolves(null),
        };

        const context = await buildTimeAndLocationContext(adapter, now);

        expect(context).to.include(String(now.getTime()));
    });
});
