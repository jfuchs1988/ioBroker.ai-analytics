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
        function makeLog() {
            return { silly: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
        }

        it('calls adapter.syncCatalog(), logs before/after, and returns its summary', async () => {
            const log = makeLog();
            const summary = { foundCount: 5, newCount: 2, reactivatedCount: 1, skipped: null };
            const adapter = {
                log,
                onboardingProviderOk: true,
                onboardingProvider: { chat: sinon.stub().resolves({}) },
                syncCatalog: sinon.stub().resolves(summary),
            };
            const { runDiscoveryNow } = require('../../lib/adminCommands');

            const result = await runDiscoveryNow(adapter);

            expect(result).to.deep.equal(summary);
            expect(adapter.syncCatalog.calledOnce).to.equal(true);
            expect(log.silly.calledTwice).to.equal(true);
            // Flag ist bereits true -> kein erneuter Provider-Aufruf
            expect(adapter.onboardingProvider.chat.called).to.equal(false);
        });

        it('re-checks a previously failed onboarding provider and proceeds when it is reachable again', async () => {
            const log = makeLog();
            const setStateAsync = sinon.stub().resolves();
            const summary = { foundCount: 5, newCount: 2, reactivatedCount: 1, skipped: null };
            const adapter = {
                log,
                setStateAsync,
                onboardingProviderOk: false,
                onboardingProvider: { chat: sinon.stub().resolves({}) },
                syncCatalog: sinon.stub().resolves(summary),
            };
            const { runDiscoveryNow } = require('../../lib/adminCommands');

            const result = await runDiscoveryNow(adapter);

            expect(adapter.onboardingProvider.chat.calledOnce).to.equal(true);
            expect(adapter.onboardingProviderOk).to.equal(true);
            expect(setStateAsync.calledOnce).to.equal(true);
            expect(setStateAsync.firstCall.args[0]).to.equal('info.onboardingProviderReachable');
            expect(setStateAsync.firstCall.args[1]).to.deep.equal({ val: true, ack: true });
            expect(result).to.deep.equal(summary);
        });

        it('returns a skipReason when the re-check fails and the sync skipped classification', async () => {
            const log = makeLog();
            const adapter = {
                log,
                setStateAsync: sinon.stub().resolves(),
                onboardingProviderOk: false,
                onboardingProvider: { chat: sinon.stub().rejects(new Error('ECONNREFUSED')) },
                syncCatalog: sinon.stub().resolves({ foundCount: 5, newCount: 0, reactivatedCount: 3, skipped: 'onboardingProvider' }),
            };
            const { runDiscoveryNow } = require('../../lib/adminCommands');

            const result = await runDiscoveryNow(adapter);

            expect(adapter.onboardingProviderOk).to.equal(false);
            expect(result.skipped).to.equal('onboardingProvider');
            expect(result.skipReason).to.include('ECONNREFUSED');
            expect(result.reactivatedCount).to.equal(3);
        });

        it('reports that a restart is required when the onboarding provider was never constructed', async () => {
            const log = makeLog();
            const adapter = {
                log,
                onboardingProviderOk: false,
                onboardingProvider: undefined,
                syncCatalog: sinon.stub().resolves({ foundCount: 1, newCount: 0, reactivatedCount: 0, skipped: 'onboardingProvider' }),
            };
            const { runDiscoveryNow } = require('../../lib/adminCommands');

            const result = await runDiscoveryNow(adapter);

            expect(result.skipReason).to.include('neu starten');
            expect(adapter.syncCatalog.calledOnce).to.equal(true);
        });
    });

    describe('runProactiveCheckNow', () => {
        function makeLog() {
            return { silly: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
        }

        it('triggers adapter.runProactiveCheck() fire-and-forget and returns immediately', async () => {
            const log = makeLog();
            const adapter = { log, chatProviderOk: true, runProactiveCheck: sinon.stub().resolves({ skipped: false }) };
            const { runProactiveCheckNow } = require('../../lib/adminCommands');

            const result = await runProactiveCheckNow(adapter);

            expect(result).to.deep.equal({ triggered: true });
            expect(adapter.runProactiveCheck.calledOnce).to.equal(true);
            expect(log.silly.calledOnce).to.equal(true);
        });

        it('logs an error if the triggered run rejects, without throwing', async () => {
            const log = makeLog();
            const adapter = {
                log,
                chatProviderOk: true,
                runProactiveCheck: sinon.stub().rejects(new Error('boom')),
            };
            const { runProactiveCheckNow } = require('../../lib/adminCommands');

            const result = await runProactiveCheckNow(adapter);
            expect(result).to.deep.equal({ triggered: true });

            await new Promise((resolve) => setImmediate(resolve));

            expect(log.error.calledOnce).to.equal(true);
            expect(log.error.firstCall.args[0]).to.include('boom');
        });

        it('re-checks a previously failed chat provider and starts the run when it is reachable again', async () => {
            const log = makeLog();
            const setStateAsync = sinon.stub().resolves();
            const adapter = {
                log,
                setStateAsync,
                chatProviderOk: false,
                chatProvider: { chat: sinon.stub().resolves({}) },
                runProactiveCheck: sinon.stub().resolves({ skipped: false }),
            };
            const { runProactiveCheckNow } = require('../../lib/adminCommands');

            const result = await runProactiveCheckNow(adapter);

            expect(result).to.deep.equal({ triggered: true });
            expect(adapter.chatProviderOk).to.equal(true);
            expect(setStateAsync.firstCall.args[0]).to.equal('info.chatProviderReachable');
            expect(adapter.runProactiveCheck.calledOnce).to.equal(true);
        });

        it('does not start the run and reports why when the chat provider is still unreachable', async () => {
            const log = makeLog();
            const adapter = {
                log,
                setStateAsync: sinon.stub().resolves(),
                chatProviderOk: false,
                chatProvider: { chat: sinon.stub().rejects(new Error('401 Unauthorized')) },
                runProactiveCheck: sinon.stub().resolves(),
            };
            const { runProactiveCheckNow } = require('../../lib/adminCommands');

            const result = await runProactiveCheckNow(adapter);

            expect(result.triggered).to.equal(false);
            expect(result.reason).to.include('401 Unauthorized');
            expect(adapter.runProactiveCheck.called).to.equal(false);
            expect(adapter.chatProviderOk).to.equal(false);
        });

        it('reports that a restart is required when the chat provider was never constructed', async () => {
            const log = makeLog();
            const adapter = {
                log,
                chatProviderOk: false,
                chatProvider: undefined,
                runProactiveCheck: sinon.stub().resolves(),
            };
            const { runProactiveCheckNow } = require('../../lib/adminCommands');

            const result = await runProactiveCheckNow(adapter);

            expect(result.triggered).to.equal(false);
            expect(result.reason).to.include('neu starten');
            expect(adapter.runProactiveCheck.called).to.equal(false);
        });
    });
});
