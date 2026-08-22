const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadAdminCommandsWithStubs({ getAllCatalogEntries, setCatalogEntry, removeCatalogEntry }) {
    return proxyquire('../../lib/adminCommands', {
        './catalog': { getAllCatalogEntries, setCatalogEntry, removeCatalogEntry },
    });
}

describe('adminCommands', () => {
    describe('listCatalogEntries', () => {
        it('returns all catalog entries unfiltered', async () => {
            const entries = [{ sourceId: 'a' }, { sourceId: 'b', ignored: true, active: false }];
            const { listCatalogEntries } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves(entries),
            });

            const result = await listCatalogEntries({});

            expect(result).to.deep.equal({ entries });
        });
    });

    describe('updateCatalogEntryAdmin', () => {
        it('updates category/room/ignored, clears needsReview, and logs silly', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'lighting', room: 'Keller', needsReview: true, ignored: false, active: true };
            const setCatalogEntry = sinon.stub().resolves();
            const sillyStub = sinon.stub();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const adapter = { log: { silly: sillyStub } };
            const result = await updateCatalogEntryAdmin(adapter, {
                sourceId: 'javascript.0.x',
                category: 'device_usage',
                room: 'Wohnzimmer',
                ignored: true,
            });

            expect(result.entry).to.deep.include({
                sourceId: 'javascript.0.x',
                category: 'device_usage',
                room: 'Wohnzimmer',
                ignored: true,
                needsReview: false,
            });
            expect(setCatalogEntry.calledOnce).to.equal(true);
            expect(sillyStub.calledOnce).to.equal(true);
            expect(sillyStub.firstCall.args[0]).to.include('javascript.0.x');
        });

        it('allows a partial update (only ignored, no category/room change)', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'lighting', room: 'Keller', needsReview: false, ignored: false, active: true };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', ignored: true });

            expect(result.entry).to.deep.include({ category: 'lighting', room: 'Keller', ignored: true, needsReview: false });
        });

        it('returns an error for an unknown sourceId instead of throwing', async () => {
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([]),
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'unknown' });

            expect(result).to.deep.equal({ error: 'Unbekanntes Objekt: unknown' });
        });
    });

    describe('removeCatalogEntry', () => {
        it('deletes the entry and logs silly', async () => {
            const existing = { sourceId: 'javascript.0.x' };
            const removeCatalogEntryStub = sinon.stub().resolves();
            const sillyStub = sinon.stub();
            const { removeCatalogEntry } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                removeCatalogEntry: removeCatalogEntryStub,
            });

            const adapter = { log: { silly: sillyStub } };
            const result = await removeCatalogEntry(adapter, { sourceId: 'javascript.0.x' });

            expect(result).to.deep.equal({ removed: true });
            expect(removeCatalogEntryStub.calledOnceWith(adapter, 'javascript.0.x')).to.equal(true);
            expect(sillyStub.calledOnce).to.equal(true);
        });

        it('returns an error for an unknown sourceId instead of throwing', async () => {
            const { removeCatalogEntry } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([]),
            });

            const result = await removeCatalogEntry({}, { sourceId: 'unknown' });

            expect(result).to.deep.equal({ error: 'Unbekanntes Objekt: unknown' });
        });
    });

    describe('runDiscoveryNow', () => {
        it('calls adapter.syncCatalog(), logs before/after, and returns its summary', async () => {
            const sillyStub = sinon.stub();
            const summary = { foundCount: 5, newCount: 2, reactivatedCount: 1 };
            const adapter = { log: { silly: sillyStub }, syncCatalog: sinon.stub().resolves(summary) };
            const { runDiscoveryNow } = require('../../lib/adminCommands');

            const result = await runDiscoveryNow(adapter);

            expect(result).to.deep.equal(summary);
            expect(adapter.syncCatalog.calledOnce).to.equal(true);
            expect(sillyStub.calledTwice).to.equal(true);
        });
    });

    describe('runProactiveCheckNow', () => {
        it('triggers adapter.runProactiveCheck() fire-and-forget and returns immediately', () => {
            const sillyStub = sinon.stub();
            const adapter = { log: { silly: sillyStub }, runProactiveCheck: sinon.stub().resolves() };
            const { runProactiveCheckNow } = require('../../lib/adminCommands');

            const result = runProactiveCheckNow(adapter);

            expect(result).to.deep.equal({ triggered: true });
            expect(adapter.runProactiveCheck.calledOnce).to.equal(true);
            expect(sillyStub.calledOnce).to.equal(true);
        });

        it('logs an error if the triggered run rejects, without throwing', async () => {
            const errorStub = sinon.stub();
            const adapter = {
                log: { silly: sinon.stub(), error: errorStub },
                runProactiveCheck: sinon.stub().rejects(new Error('boom')),
            };
            const { runProactiveCheckNow } = require('../../lib/adminCommands');

            const result = runProactiveCheckNow(adapter);
            expect(result).to.deep.equal({ triggered: true });

            await new Promise((resolve) => setImmediate(resolve));

            expect(errorStub.calledOnce).to.equal(true);
            expect(errorStub.firstCall.args[0]).to.include('boom');
        });
    });
});
