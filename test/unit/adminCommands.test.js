const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

function loadAdminCommandsWithStubs({ getAllCatalogEntries, setCatalogEntry, removeCatalogEntry, listModels } = {}) {
    const stubs = {
        './catalog': { getAllCatalogEntries, setCatalogEntry, removeCatalogEntry },
    };
    if (listModels) stubs['./providers'] = { listModels };
    return proxyquire('../../lib/adminCommands', stubs);
}

describe('adminCommands', () => {
    describe('listProviderModels', () => {
        it('returns sorted autocomplete options and labels free models', async () => {
            const listModels = sinon.stub().resolves([
                { id: 'z-model', name: 'Zulu', isFree: false },
                { id: 'a-model', name: 'Alpha', isFree: true },
            ]);
            const { listProviderModels } = loadAdminCommandsWithStubs({ listModels });

            const result = await listProviderModels({ log: { warn: sinon.stub() } }, {
                providerType: 'openrouter',
                apiKey: 'secret',
                baseUrl: '',
            });

            expect(listModels.calledOnceWith({ type: 'openrouter', apiKey: 'secret', baseUrl: '' })).to.equal(true);
            expect(result).to.deep.equal([
                { value: 'a-model', label: 'Alpha (kostenlos)' },
                { value: 'z-model', label: 'Zulu' },
            ]);
        });

        it('returns an empty list and never logs the API key when discovery fails', async () => {
            const warn = sinon.stub();
            const { listProviderModels } = loadAdminCommandsWithStubs({
                listModels: sinon.stub().rejects(new Error('Request with secret-key failed')),
            });

            const result = await listProviderModels({ log: { warn } }, {
                providerType: 'openrouter',
                apiKey: 'secret-key',
            });

            expect(result).to.deep.equal([]);
            expect(warn.calledOnce).to.equal(true);
            expect(warn.firstCall.args[0]).not.to.include('secret-key');
        });
    });

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

        it('updates description when provided and leaves existing description untouched when omitted', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'lighting', room: 'Keller', description: 'Alte Beschreibung', ignored: false, active: true };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', description: 'Neue Beschreibung' });

            expect(result.entry).to.deep.include({ description: 'Neue Beschreibung', sourceId: 'javascript.0.x' });
            expect(setCatalogEntry.calledOnce).to.equal(true);

            // Also verify that omitting description leaves it unchanged
            setCatalogEntry.resetHistory();
            const result2 = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', category: 'device_usage' });
            expect(result2.entry).to.deep.include({ description: 'Alte Beschreibung' });
        });

        it('returns an error for an unknown sourceId instead of throwing', async () => {
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([]),
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'unknown' });

            expect(result).to.deep.equal({ error: 'Unbekanntes Objekt: unknown' });
        });

        it('updates valueKind and marks the source as manual', async () => {
            const existing = {
                sourceId: 'javascript.0.x',
                category: 'lighting',
                valueKind: 'gauge',
                valueKindConfidence: 'low',
                valueKindSource: 'metadata',
            };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', valueKind: 'daily_reset_counter' });

            expect(result.entry).to.deep.include({
                valueKind: 'daily_reset_counter',
                valueKindSource: 'manual',
            });
        });

    it('leaves valueKind untouched when not provided', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'lighting', valueKind: 'gauge', valueKindSource: 'sampled' };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', room: 'Keller' });

            expect(result.entry).to.deep.include({ valueKind: 'gauge', valueKindSource: 'sampled' });
        });

        it('updates data quality values manually', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'device_usage', updateFrequency: 'unknown', dataCompleteness: 'unknown' };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, {
                sourceId: 'javascript.0.x', updateFrequency: 'hourly', dataCompleteness: 'complete',
            });

            expect(result.entry).to.include({ updateFrequency: 'hourly', dataCompleteness: 'complete' });
        });

        for (const [field, value] of [
            ['category', 'other'],
            ['valueKind', 'script'],
            ['updateFrequency', 'sometimes'],
            ['dataCompleteness', 'maybe'],
            ['ignored', 'true'],
            ['room', 'x'.repeat(201)],
            ['description', 'x'.repeat(2001)],
            ['derivedMetricRole', 'not-a-role'],
            ['hvacRole', 'not-a-role'],
        ]) {
            it(`rejects an invalid ${field}`, async () => {
                const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                    getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'lighting' }]),
                    setCatalogEntry: sinon.stub().resolves(),
                });

                let error;
                try {
                    await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', [field]: value });
                } catch (caught) {
                    error = caught;
                }
                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.include(field);
            });
        }

        it('rejects missing and oversized source IDs before reading the catalog', async () => {
            const getAllCatalogEntries = sinon.stub().resolves([]);
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({ getAllCatalogEntries });

            for (const sourceId of [undefined, '', 'x'.repeat(513)]) {
                let error;
                try {
                    await updateCatalogEntryAdmin({}, { sourceId });
                } catch (caught) {
                    error = caught;
                }
                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.include('sourceId');
            }
            expect(getAllCatalogEntries.notCalled).to.equal(true);
        });

        it('rejects an unknown derivedMetricRole even when paired with a groupId', async () => {
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'lighting' }]),
            });

            let error;
            try {
                await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'nope', derivedMetricGroupId: 'g1' });
            } catch (caught) {
                error = caught;
            }
            expect(error.message).to.include('derivedMetricRole');
        });

        it('rejects derivedMetricGroupId without derivedMetricRole', async () => {
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'lighting' }]),
            });

            let error;
            try {
                await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricGroupId: 'g1' });
            } catch (caught) {
                error = caught;
            }
            expect(error.message).to.include('derivedMetricRole');
        });

        it('accepts and stores a valid derivedMetricRole/derivedMetricGroupId pair', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'generation_pv' };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' });

            expect(result.entry).to.deep.include({ derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' });
            expect(setCatalogEntry.calledOnce).to.equal(true);
        });

        it('rejects hvacRole when the existing entry is not boolean_state', async () => {
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'device_usage', valueKind: 'gauge' }]),
            });

            let error;
            try {
                await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', hvacRole: 'window' });
            } catch (caught) {
                error = caught;
            }
            expect(error.message).to.include('hvacRole');
        });

        it('accepts and stores a valid hvacRole on a boolean_state entry', async () => {
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([{ sourceId: 'javascript.0.x', category: 'device_usage', valueKind: 'boolean_state' }]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', hvacRole: 'heating' });

            expect(result.entry).to.deep.include({ hvacRole: 'heating' });
            expect(setCatalogEntry.calledOnce).to.equal(true);
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

    describe('runDiscoveryOnly', () => {
        function makeLog() {
            return { silly: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
        }

        it('calls adapter.syncCatalog({ skipClassification: true }), logs before/after, and returns its summary', async () => {
            const log = makeLog();
            const summary = { foundCount: 5, newCount: 0, reactivatedCount: 2, skipped: 'classification' };
            const adapter = {
                log,
                syncCatalog: sinon.stub().resolves(summary),
            };
            const { runDiscoveryOnly } = require('../../lib/adminCommands');

            const result = await runDiscoveryOnly(adapter);

            expect(result).to.deep.equal(summary);
            expect(adapter.syncCatalog.calledOnceWith({ skipClassification: true })).to.equal(true);
            expect(log.silly.calledTwice).to.equal(true);
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
