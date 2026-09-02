const { expect } = require('chai');
const sinon = require('sinon');
const { buildTimeAndLocationContext, getLocalDayBoundaries } = require('../../lib/promptContext');

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

describe('getLocalDayBoundaries', () => {
    it('returns the UTC-ms boundaries of a calendar day in Europe/Berlin during DST (UTC+2)', () => {
        // 2026-08-21 12:00 UTC is 2026-08-21 14:00 in Berlin (summer time, UTC+2)
        const noonUtc = Date.UTC(2026, 7, 21, 12, 0, 0);
        const { start, end } = getLocalDayBoundaries(noonUtc, 'Europe/Berlin');

        expect(new Date(start).toISOString()).to.equal('2026-08-20T22:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-08-21T22:00:00.000Z');
    });

    it('returns the UTC-ms boundaries of a calendar day in Europe/Berlin during standard time (UTC+1)', () => {
        // 2026-01-15 12:00 UTC is 2026-01-15 13:00 in Berlin (winter time, UTC+1)
        const noonUtc = Date.UTC(2026, 0, 15, 12, 0, 0);
        const { start, end } = getLocalDayBoundaries(noonUtc, 'Europe/Berlin');

        expect(new Date(start).toISOString()).to.equal('2026-01-14T23:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-01-15T23:00:00.000Z');
    });

    it('returns the same boundaries for any two timestamps within the same local day', () => {
        const morning = Date.UTC(2026, 7, 21, 4, 0, 0);
        const evening = Date.UTC(2026, 7, 21, 20, 0, 0);

        expect(getLocalDayBoundaries(morning, 'Europe/Berlin')).to.deep.equal(
            getLocalDayBoundaries(evening, 'Europe/Berlin')
        );
    });

    it('spans 23 hours on a spring-forward (DST start) day in Europe/Berlin', () => {
        const noonOnDstStart = Date.UTC(2026, 2, 29, 12, 0, 0); // 2026-03-29
        const { start, end } = getLocalDayBoundaries(noonOnDstStart, 'Europe/Berlin');

        expect(new Date(start).toISOString()).to.equal('2026-03-28T23:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-03-29T22:00:00.000Z');
        expect(end - start).to.equal(23 * 3600 * 1000);
    });

    it('spans 25 hours on a fall-back (DST end) day in Europe/Berlin', () => {
        const noonOnDstEnd = Date.UTC(2026, 9, 25, 12, 0, 0); // 2026-10-25
        const { start, end } = getLocalDayBoundaries(noonOnDstEnd, 'Europe/Berlin');

        expect(new Date(start).toISOString()).to.equal('2026-10-24T22:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-10-25T23:00:00.000Z');
        expect(end - start).to.equal(25 * 3600 * 1000);
    });

    it('spans exactly 24 hours on a day with no DST transition (UTC has none, ever)', () => {
        const fixedNoonUtc = Date.UTC(2026, 5, 15, 12, 0, 0);
        const { start, end } = getLocalDayBoundaries(fixedNoonUtc, 'UTC');
        expect(end - start).to.equal(24 * 3600 * 1000);
    });

    it('defaults to UTC boundaries for the UTC timezone', () => {
        const noonUtc = Date.UTC(2026, 7, 21, 12, 0, 0);
        const { start, end } = getLocalDayBoundaries(noonUtc, 'UTC');

        expect(new Date(start).toISOString()).to.equal('2026-08-21T00:00:00.000Z');
        expect(new Date(end).toISOString()).to.equal('2026-08-22T00:00:00.000Z');
    });
});
