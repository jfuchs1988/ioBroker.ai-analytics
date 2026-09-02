# Geräte-Tab, Tab-Verbindungsfix, manuelle Trigger, Budget-Anzeige — Implementierungsplan

> **Status: abgeschlossen (2026-09-02).** Geräteverwaltung, manuelle Trigger, Budgetanzeige, State-Bridge und die Verlagerung der Geräteübersicht in die Adapter-Einstellungen sind umgesetzt. Die verbleibende Live-Abnahme ist in den Risiken dokumentiert.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erkannte (historisierte) Objekte im Admin-UI verwalten können (Kategorie/Raum ändern, ignorieren, entfernen), plus manuelle Trigger für Re-Scan und proaktive Prüfung, plus eine Token-Budget-Anzeige — alles über einen reparierten, um Sub-Navigation erweiterten Custom-Admin-Tab, mit `silly`-Logging für jede Aktion.

**Architecture:** Neues Modul `lib/adminCommands.js` bündelt die schreibende/auslösende Logik hinter testbaren, reinen Funktionen (Adapter als Parameter, kein `this`-Zugriff auf die Adapter-Klasse) — `main.js`s `onMessage` wird nur zum dünnen Dispatcher. `lib/catalog.js`, `lib/onboarding.js`, `lib/tools.js` bekommen kleine, gezielte Erweiterungen (Hard-Delete, Enum-Raum-Hinweis, Ignore-Filter). Der bestehende Custom-Tab (`admin/tab.html`/`tab.js`) wird von einem reinen Chat-Tab zu einem Tab mit interner Sub-Navigation (Chat/Geräte/Budget) ausgebaut, nachdem seine Verbindungsdiagnose abgeschlossen ist.

**Tech Stack:** Node.js (CommonJS, kein Build-Schritt — [ADR-0009](../adr/0009-reines-javascript-kein-typescript.md)), Mocha/Chai/Sinon/Proxyquire für Unit-Tests, Vanilla-JS/HTML für den Admin-Tab (kein Framework), ioBroker Admin-`sendTo`/Socket.IO-Message-Bus.

**Spec:** [docs/specs/2026-08-22-geraete-tab-design.md](../specs/2026-08-22-geraete-tab-design.md)

## Global Constraints

- `npm test` (= `test:unit` + `test:adapter`) muss vor jedem Commit auf `develop` grün sein.
- Neue `lib/*`-Module bekommen eigene Unit-Tests mit gemockter Adapter-API (kein echter DB-/LLM-/Socket-Zugriff in Tests).
- Kein TypeScript, kein Build-Schritt, reines CommonJS ([ADR-0009](../adr/0009-reines-javascript-kein-typescript.md)).
- Pro Task ein eigener Branch (`feature/<name>` bzw. `fix/<name>`), von `develop` abgezweigt, TDD-Commits darauf, danach lokal per `git merge --no-ff` zurück nach `develop`, Branch löschen ([ADR-0019](../adr/0019-feature-branch-pro-task.md)).
- Kein `git push` in diesem Plan — bleibt expliziter, gesonderter Schritt außerhalb dieses Plans.
- Jede neue schreibende/auslösende Admin-Aktion loggt via `adapter.log.silly` (keine API-Keys/Auth-Header, keine vollständigen LLM-Antworten in diesen Log-Zeilen).
- `io-package.json` erlaubt nur **einen** `adminTab` (Singleton) — Chat und Geräte-Verwaltung teilen sich eine Seite mit interner Sub-Navigation, kein zweiter Tab.
- Commit-Nachrichten erklären das Warum, mit `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Task 1: `lib/catalog.js` — `removeCatalogEntry` (harter Delete)

**Files:**
- Modify: `lib/catalog.js`
- Test: `test/unit/catalog.test.js`

**Interfaces:**
- Produces: `removeCatalogEntry(adapter, sourceId) => Promise<void>` — löscht State und Objekt unter `catalog.<sourceId>` vollständig. Wird von Task 4 (`lib/adminCommands.js`) konsumiert.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/catalog-remove-entry
```

- [ ] **Step 2: Fehlschlagenden Test schreiben**

In `test/unit/catalog.test.js`, `removeCatalogEntry` zum Import hinzufügen:

```js
const {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    removeCatalogEntry,
    catalogStateId,
    CATEGORIES,
} = require('../../lib/catalog');
```

Neue Tests am Ende der `describe('catalog', ...)`-Suite ergänzen (vor der letzten `});`):

```js
    it('removeCatalogEntry deletes the state and the object', async () => {
        const adapter = makeAdapter();
        adapter.delStateAsync = sinon.stub().resolves();
        adapter.delObjectAsync = sinon.stub().resolves();

        await removeCatalogEntry(adapter, 'javascript.0.x');

        expect(adapter.delStateAsync.calledOnceWith('catalog.javascript.0.x')).to.equal(true);
        expect(adapter.delObjectAsync.calledOnceWith('catalog.javascript.0.x')).to.equal(true);
    });

    it('removeCatalogEntry tolerates a missing state and still deletes the object', async () => {
        const adapter = makeAdapter();
        adapter.delStateAsync = sinon.stub().rejects(new Error('not found'));
        adapter.delObjectAsync = sinon.stub().resolves();

        await removeCatalogEntry(adapter, 'javascript.0.x');

        expect(adapter.delObjectAsync.calledOnce).to.equal(true);
    });
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/catalog.test.js`
Expected: FAIL — `removeCatalogEntry is not a function`

- [ ] **Step 4: Minimale Implementierung**

In `lib/catalog.js`, nach `markInactive` einfügen:

```js
async function removeCatalogEntry(adapter, sourceId) {
    const id = catalogStateId(sourceId);
    await adapter.delStateAsync(id).catch(() => {});
    await adapter.delObjectAsync(id);
}
```

`module.exports` erweitern:

```js
module.exports = {
    getCatalogEntry,
    getAllCatalogEntries,
    setCatalogEntry,
    markInactive,
    removeCatalogEntry,
    catalogStateId,
    CATEGORIES,
};
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/catalog.test.js`
Expected: PASS (alle Tests in der Datei)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/catalog.js test/unit/catalog.test.js
git commit -m "$(cat <<'EOF'
feat: add removeCatalogEntry for hard-deleting catalog entries

Needed by the upcoming admin device-management commands ("Entfernen"
button) — a hard delete, not a tombstone; a still-historized object
reappears on the next re-scan.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/catalog-remove-entry -m "Merge feature/catalog-remove-entry into develop"
git branch -d feature/catalog-remove-entry
```

---

## Task 2: `lib/onboarding.js` — Enum-Raum-Override + `ignored: false`-Default

**Files:**
- Modify: `lib/onboarding.js`
- Test: `test/unit/onboarding.test.js`

**Interfaces:**
- Consumes: nichts Neues von anderen Tasks.
- Produces: Katalogeinträge aus `runOnboarding` haben ab jetzt immer `ignored: false`; `room` wird deterministisch mit `enum.rooms.*`-Mitgliedschaft überschrieben, falls vorhanden.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/onboarding-room-enum
```

- [ ] **Step 2: Fehlschlagende Tests schreiben**

In `test/unit/onboarding.test.js`, am Ende der `describe('runOnboarding', ...)`-Suite (vor der letzten `});`) ergänzen:

```js
    it('overrides the guessed room with the ioBroker room enum when the object is a member', async () => {
        const discovered = [
            { id: 'javascript.0.lampe', historyInstance: 'influxdb.0', common: { name: 'Lampe', role: 'switch.light', unit: '' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.lampe', description: 'Lampe', unit: '', category: 'lighting', room: 'geraten', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const adapter = {
            getForeignObjectsAsync: sinon.stub().resolves({
                'enum.rooms.wohnzimmer': { common: { name: 'Wohnzimmer', members: ['javascript.0.lampe'] } },
            }),
        };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding(adapter, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry.room).to.equal('Wohnzimmer');
    });

    it('falls back to the LLM-guessed room when there is no enum match', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: 'Keller', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const adapter = { getForeignObjectsAsync: sinon.stub().resolves({}) };
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding(adapter, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry.room).to.equal('Keller');
    });

    it('works without a getForeignObjectsAsync method on the adapter (defensive default)', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: 'Keller', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding({}, provider, discovered);

        expect(setCatalogEntry.calledOnce).to.equal(true);
    });

    it('sets ignored=false by default on newly classified entries', async () => {
        const discovered = [
            { id: 'javascript.0.x', historyInstance: 'influxdb.0', common: { name: 'x' } },
        ];
        const provider = {
            chat: sinon.stub().resolves({
                role: 'assistant',
                content: JSON.stringify([
                    { sourceId: 'javascript.0.x', description: 'x', unit: '', category: 'consumption', room: '', confidence: 'high' },
                ]),
                toolCalls: [],
                stopReason: 'end_turn',
            }),
        };
        const setCatalogEntry = sinon.stub().resolves();
        const { runOnboarding } = loadOnboardingWithStubs({
            getAllCatalogEntries: sinon.stub().resolves([]),
            setCatalogEntry,
        });

        await runOnboarding({}, provider, discovered);

        const [, entry] = setCatalogEntry.firstCall.args;
        expect(entry.ignored).to.equal(false);
    });
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: FAIL — `entry.room` bleibt `'geraten'` statt `'Wohnzimmer'`; `entry.ignored` ist `undefined` statt `false`.

- [ ] **Step 4: Implementierung**

In `lib/onboarding.js`, nach den `require`s eine neue Hilfsfunktion einfügen:

```js
async function buildRoomLookup(adapter) {
    const roomLookup = new Map();
    if (!adapter || !adapter.getForeignObjectsAsync) {
        return roomLookup;
    }

    let enums;
    try {
        enums = await adapter.getForeignObjectsAsync('enum.rooms.*', 'enum');
    } catch (error) {
        return roomLookup;
    }

    for (const enumObj of Object.values(enums || {})) {
        const roomName = enumObj && enumObj.common && enumObj.common.name;
        const members = (enumObj && enumObj.common && enumObj.common.members) || [];
        if (!roomName) continue;
        for (const member of members) {
            roomLookup.set(member, roomName);
        }
    }

    return roomLookup;
}
```

In `runOnboarding`, vor der Batch-Schleife den Lookup einmalig aufbauen:

```js
async function runOnboarding(adapter, provider, discoveredObjects) {
    const existing = await getAllCatalogEntries(adapter);
    const knownIds = new Set(existing.map((entry) => entry.sourceId));
    const unclassified = discoveredObjects.filter((obj) => !knownIds.has(obj.id));
    const roomLookup = await buildRoomLookup(adapter);

    const needsReview = [];
```

Beim Bauen des `entry`-Objekts (im inneren `for`-Loop) `room` und `ignored` anpassen:

```js
            const entry = {
                sourceId: classification.sourceId,
                description: classification.description,
                unit: classification.unit || source.common.unit || '',
                category: classification.category,
                room: roomLookup.get(source.id) || classification.room || '',
                confidence: classification.confidence,
                needsReview: classification.confidence === 'low',
                active: true,
                ignored: false,
                historyInstance: source.historyInstance,
                lastSeen: new Date().toISOString(),
            };
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/onboarding.test.js`
Expected: PASS (alle Tests in der Datei, inkl. der bereits bestehenden)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/onboarding.js test/unit/onboarding.test.js
git commit -m "$(cat <<'EOF'
feat: derive room from ioBroker room enums during onboarding

If a newly discovered object is a member of an enum.rooms.* enum, use
that room name deterministically instead of the LLM's name-based guess.
Also default new entries to ignored=false so the admin device table has
a stable field to toggle.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/onboarding-room-enum -m "Merge feature/onboarding-room-enum into develop"
git branch -d feature/onboarding-room-enum
```

---

## Task 3: `lib/tools.js` — `ignored`-Einträge aus `listCatalog` filtern

**Files:**
- Modify: `lib/tools.js`
- Test: `test/unit/tools.test.js`

**Interfaces:**
- Consumes: `entry.ignored` (Boolean, aus Task 2 defaultet auf `false`).
- Produces: keine neue Schnittstelle — nur geänderte Filterlogik innerhalb der bestehenden `listCatalog`-Tool-Ausführung.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/tools-ignored-filter
```

- [ ] **Step 2: Fehlschlagenden Test schreiben**

In `test/unit/tools.test.js`, nach dem Test `'listCatalog excludes inactive and needsReview entries, ...'` einfügen:

```js
    it('listCatalog also excludes ignored entries', async () => {
        const entries = [
            { sourceId: 'a', category: 'lighting', active: true, needsReview: false, ignored: false },
            { sourceId: 'b', category: 'lighting', active: true, needsReview: false, ignored: true },
        ];
        const { buildTools } = loadToolsWithStubs({
            getAllCatalogEntries: sinon.stub().resolves(entries),
        });

        const { execute } = buildTools({});
        const result = await execute('listCatalog', {});

        expect(result.map((e) => e.sourceId)).to.deep.equal(['a']);
    });
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/tools.test.js`
Expected: FAIL — `result` enthält noch `'b'`.

- [ ] **Step 4: Implementierung**

In `lib/tools.js`, in `execute('listCatalog', ...)` die letzte Zeile anpassen:

```js
            return filtered.filter((entry) => entry.active !== false && !entry.needsReview && !entry.ignored);
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/tools.test.js`
Expected: PASS (alle Tests in der Datei)

- [ ] **Step 6: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/tools.js test/unit/tools.test.js
git commit -m "$(cat <<'EOF'
feat: hide ignored catalog entries from the chat/proactive-check agent

Devices marked ignored in the admin device table must stay invisible
to listCatalog, consistent with how needsReview/inactive already work.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/tools-ignored-filter -m "Merge feature/tools-ignored-filter into develop"
git branch -d feature/tools-ignored-filter
```

---

## Task 4: `lib/adminCommands.js` — neues Modul + ADR-0020

**Files:**
- Create: `lib/adminCommands.js`
- Create: `test/unit/adminCommands.test.js`
- Create: `docs/adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md`
- Modify: `docs/adr/adr-index.md`

**Interfaces:**
- Consumes: `getAllCatalogEntries`, `setCatalogEntry` aus `lib/catalog.js`; `removeCatalogEntry` aus `lib/catalog.js` (Task 1) — intern umbenannt zu `deleteCatalogEntry`, um Namenskollision mit der eigenen Export-Funktion zu vermeiden. `adapter.syncCatalog()` und `adapter.runProactiveCheck()` (bestehende `main.js`-Methoden, werden in Task 5 verdrahtet — hier nur als Adapter-Methoden vorausgesetzt und über einen Test-Stub simuliert).
- Produces (von Task 5 in `main.js` konsumiert):
  - `listCatalogEntries(adapter) => Promise<{entries: object[]}>`
  - `updateCatalogEntryAdmin(adapter, {sourceId, category?, room?, ignored?}) => Promise<{entry: object} | {error: string}>`
  - `removeCatalogEntry(adapter, {sourceId}) => Promise<{removed: true} | {error: string}>`
  - `runDiscoveryNow(adapter) => Promise<{foundCount, newCount, reactivatedCount}>` (erwartet `adapter.syncCatalog()` mit ebendieser Rückgabeform, siehe Task 5)
  - `runProactiveCheckNow(adapter) => {triggered: true}` (synchron, löst `adapter.runProactiveCheck()` fire-and-forget aus)

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/admin-commands-module
```

- [ ] **Step 2: Fehlschlagende Tests schreiben**

Neue Datei `test/unit/adminCommands.test.js`:

```js
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
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/adminCommands.test.js`
Expected: FAIL — `Cannot find module '../../lib/adminCommands'`

- [ ] **Step 4: Implementierung**

Neue Datei `lib/adminCommands.js`:

```js
'use strict';

const { getAllCatalogEntries, setCatalogEntry, removeCatalogEntry: deleteCatalogEntry } = require('./catalog');

async function findEntry(adapter, sourceId) {
    const entries = await getAllCatalogEntries(adapter);
    return entries.find((entry) => entry.sourceId === sourceId);
}

async function listCatalogEntries(adapter) {
    const entries = await getAllCatalogEntries(adapter);
    return { entries };
}

async function updateCatalogEntryAdmin(adapter, { sourceId, category, room, ignored } = {}) {
    const entry = await findEntry(adapter, sourceId);
    if (!entry) {
        return { error: `Unbekanntes Objekt: ${sourceId}` };
    }

    const updated = { ...entry };
    if (category !== undefined) {
        updated.category = category;
        updated.needsReview = false;
    }
    if (room !== undefined) {
        updated.room = room;
    }
    if (ignored !== undefined) {
        updated.ignored = ignored;
    }
    updated.lastSeen = new Date().toISOString();

    await setCatalogEntry(adapter, updated);

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(
            `Admin: Katalogeintrag aktualisiert: ${sourceId} -> category=${updated.category}, room=${updated.room}, ignored=${updated.ignored}`
        );
    }

    return { entry: updated };
}

async function removeCatalogEntry(adapter, { sourceId } = {}) {
    const entry = await findEntry(adapter, sourceId);
    if (!entry) {
        return { error: `Unbekanntes Objekt: ${sourceId}` };
    }

    await deleteCatalogEntry(adapter, sourceId);

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(`Admin: Katalogeintrag entfernt: ${sourceId}`);
    }

    return { removed: true };
}

async function runDiscoveryNow(adapter) {
    if (adapter.log && adapter.log.silly) {
        adapter.log.silly('Admin: manueller Re-Scan gestartet');
    }

    const summary = await adapter.syncCatalog();

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(
            `Admin: manueller Re-Scan beendet: ${summary.newCount} neu, ${summary.reactivatedCount} reaktiviert`
        );
    }

    return summary;
}

function runProactiveCheckNow(adapter) {
    if (adapter.log && adapter.log.silly) {
        adapter.log.silly('Admin: manuelle proaktive Pruefung ausgeloest');
    }

    adapter.runProactiveCheck().catch((error) => {
        if (adapter.log) {
            adapter.log.error(`Manuelle proaktive Pruefung fehlgeschlagen: ${error.message}`);
        }
    });

    return { triggered: true };
}

module.exports = {
    listCatalogEntries,
    updateCatalogEntryAdmin,
    removeCatalogEntry,
    runDiscoveryNow,
    runProactiveCheckNow,
};
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/adminCommands.test.js`
Expected: PASS (alle 9 Tests)

- [ ] **Step 6: ADR-0020 schreiben**

Neue Datei `docs/adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md`:

```markdown
# ADR-0020: Admin-Message-Bus bekommt vollen Katalog-Schreibzugriff (unabhängig von needsReview)

[← ADR-Übersicht](adr-index.md)

**Status:** Angenommen
**Datum:** 2026-08-22

## Kontext

[ADR-0017](0017-scoped-catalog-write-capability.md) hat dem Chat-Agenten (LLM-gesteuert) eine eng begrenzte Schreibfähigkeit gegeben: `updateCatalogEntry` funktioniert nur für Einträge mit `needsReview: true`. Für die Geräte-Verwaltung im Admin-Tab ([Spec](../specs/2026-08-22-geraete-tab-design.md)) reicht das nicht — ein Nutzer muss auch bereits verifizierte Einträge editieren können (Raum verschieben, ignorieren), nicht nur unsichere.

## Entscheidung

`lib/adminCommands.js`s `updateCatalogEntryAdmin` und `removeCatalogEntry` haben vollen Schreibzugriff auf alle Katalogeinträge, unabhängig von `needsReview`. Das ist bewusst ein **separater Pfad** vom LLM-Tool `updateCatalogEntry`:

- Der Admin-Message-Bus (`main.js`s `onMessage`, angesprochen ausschließlich über `sendTo` aus dem Admin-UI) ist eine andere Vertrauensgrenze als der LLM-Tool-Calling-Loop — kein Modell entscheidet hier autonom, ein Mensch klickt im Admin-Tab.
- Die Einschränkung aus ADR-0017 (nur `needsReview`-Einträge) bleibt für das LLM-Tool unverändert bestehen — sie schützt vor autonomen KI-Überschreibungen, nicht vor menschlicher Admin-Bedienung.

## Konsequenzen

- Zwei Schreibpfade zu `lib/catalog.js` mit unterschiedlichem Vertrauensmodell: `lib/tools.js`s `updateCatalogEntry` (LLM, nur `needsReview`) und `lib/adminCommands.js`s `updateCatalogEntryAdmin`/`removeCatalogEntry` (Mensch über Admin-UI, uneingeschränkt).
- [Backlog-Punkt 8](backlog.md) ("Sicherheitsmodell für zukünftige schreibende Werkzeuge") bleibt für weitergehende **LLM**-Schreibzugriffe offen — diese ADR beantwortet nur den Admin-UI-Pfad, nicht das generelle LLM-Sicherheitsmodell.

## Verworfene Alternativen

- **`updateCatalogEntryAdmin` ebenfalls auf `needsReview`-Einträge beschränken**: hätte die Kernanforderung (Raum verschieben, ignorieren für beliebige, auch bereits verifizierte Geräte) verfehlt.
```

`docs/adr/adr-index.md` um eine Zeile ergänzen (nach der ADR-0019-Zeile):

```markdown
| [0020](0020-admin-message-bus-voller-katalog-schreibzugriff.md) | Admin-Message-Bus bekommt vollen Katalog-Schreibzugriff (unabhängig von needsReview) | Angenommen | 2026-08-22 |
```

- [ ] **Step 7: Vollständige Testsuite + Commit**

```bash
npm test
git add lib/adminCommands.js test/unit/adminCommands.test.js docs/adr/0020-admin-message-bus-voller-katalog-schreibzugriff.md docs/adr/adr-index.md
git commit -m "$(cat <<'EOF'
feat: add lib/adminCommands.js for the admin device-management message bus

New module bundling the five admin-facing catalog actions (list, update,
remove, manual re-scan, manual proactive-check trigger) as adapter-mockable
functions main.js's onMessage will dispatch to. Full catalog write access
here is a deliberate, separate trust boundary from the needsReview-scoped
LLM tool from ADR-0017 — see ADR-0020.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/admin-commands-module -m "Merge feature/admin-commands-module into develop"
git branch -d feature/admin-commands-module
```

---

## Task 5: `main.js` — `syncCatalog()`-Rückgabewert + `onMessage`-Erweiterung

**Files:**
- Modify: `main.js`

**Interfaces:**
- Consumes: `lib/adminCommands.js`s fünf Funktionen (Task 4).
- Produces: `syncCatalog()` gibt jetzt `{foundCount, newCount, reactivatedCount}` zurück (vorher `undefined`) — wird von `runDiscoveryNow` (Task 4) konsumiert. Fünf neue `onMessage`-Commands: `listCatalogEntries`, `updateCatalogEntryAdmin`, `removeCatalogEntry`, `runDiscoveryNow`, `runProactiveCheckNow`.

**Hinweis zur Testabdeckung:** `main.js` instanziiert `utils.Adapter` und hat laut [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md) effektiv keine automatisierte Testabdeckung ([Backlog-Punkt 3](../adr/backlog.md) dazu ist offen). Dieser Task fügt bewusst **keinen** neuen Test hinzu, um dieses Problem nicht ad hoc mit einer Einzellösung zu "lösen" — die eigentliche Logik ist bereits über `test/unit/adminCommands.test.js` (Task 4) abgedeckt, hier geht es nur um dünnes Verdrahten. Verifikation erfolgt im manuellen Abnahmetest (Task 9).

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/main-admin-commands-wiring
```

- [ ] **Step 2: `require` ergänzen**

In `main.js`, nach der bestehenden `require('./lib/usage')`-Zeile:

```js
const adminCommands = require('./lib/adminCommands');
```

- [ ] **Step 3: `syncCatalog()` um Rückgabewert erweitern**

`syncCatalog()` komplett ersetzen durch:

```js
    async syncCatalog() {
        const discovered = await findHistorizedObjects(this);
        const existing = await getAllCatalogEntries(this);
        const existingById = new Map(existing.map((entry) => [entry.sourceId, entry]));
        const discoveredIds = new Set(discovered.map((obj) => obj.id));

        for (const entry of existing) {
            if (!discoveredIds.has(entry.sourceId) && entry.active !== false) {
                await markInactive(this, entry.sourceId);
            }
        }

        let reactivatedCount = 0;
        for (const obj of discovered) {
            const entry = existingById.get(obj.id);
            if (entry && (entry.active === false || entry.historyInstance !== obj.historyInstance)) {
                await setCatalogEntry(this, {
                    ...entry,
                    active: true,
                    historyInstance: obj.historyInstance,
                    lastSeen: new Date().toISOString(),
                });
                reactivatedCount += 1;
            }
        }

        const { classifiedCount, needsReview } = await runOnboarding(this, this.provider, discovered);

        try {
            if (needsReview.length > 0) {
                const question = needsReview
                    .map((entry) => `- ${entry.sourceId}: wofuer steht dieser Wert?`)
                    .join('\n');
                await appendChatMessage(this, 'assistant', `Ich bin mir bei folgenden Objekten unsicher:\n${question}`);
            }
        } catch (error) {
            this.log.warn(`Konnte Rueckfrage nicht im Chat protokollieren: ${error.message}`);
        }

        return { foundCount: discovered.length, newCount: classifiedCount, reactivatedCount };
    }
```

- [ ] **Step 4: `onMessage` um die fünf neuen Commands erweitern**

Die bestehende `onMessage`-Methode komplett ersetzen durch:

```js
    async onMessage(obj) {
        if (!obj || !obj.command) return;

        if (obj.command === 'chatQuestion') {
            const question = obj.message && obj.message.text;

            if (typeof question !== 'string' || !question.trim()) {
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { error: 'Leere Frage' }, obj.callback);
                }
                return;
            }

            this.log.silly(`Chat: Frage erhalten: ${question.slice(0, 200)}`);

            if (await isBudgetExceeded(this)) {
                this.log.warn('Chat: Tagesbudget an Tokens ist erschoepft, Frage wird nicht beantwortet.');
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { error: 'Tagesbudget an Tokens ist erschoepft.' }, obj.callback);
                }
                return;
            }

            try {
                await appendChatMessage(this, 'user', question);
                const priorEntries = await getRecentChatHistory(this, 10);
                const priorMessages = priorEntries.map((entry) => ({ role: entry.role, content: entry.text }));

                const { finalText, usage } = await runAgent({
                    provider: this.provider,
                    tools: this.tools,
                    systemPrompt:
                        `Aktuelle Zeit: ${new Date().toISOString()} (${Date.now()} ms seit Epoch, Unix-Millisekunden). ` +
                        'Du beantwortest Fragen zu Smart-Home-Verbrauchsdaten anhand der katalogisierten Objekte. ' +
                        'Zeitangaben fuer getHistory/compareTimeframes sind IMMER Unix-Millisekunden relativ zur oben genannten aktuellen Zeit. ' +
                        'Falls der Nutzer eine offene Rueckfrage zu einem unsicheren Objekt beantwortet (du kannst offene Rueckfragen mit ' +
                        'listCatalog({needsReviewOnly: true}) einsehen), aktualisiere den Eintrag mit updateCatalogEntry.',
                    userMessage: question,
                    priorMessages,
                });

                await recordUsage(this, usage);
                this.log.silly(`Chat: Antwort gesendet: ${finalText.slice(0, 200)}`);

                const history = await appendChatMessage(this, 'assistant', finalText);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { history }, obj.callback);
                }
            } catch (error) {
                this.log.error(`Chat-Anfrage fehlgeschlagen: ${error.message}`);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                }
            }
            return;
        }

        if (obj.command === 'listCatalogEntries') {
            const result = await adminCommands.listCatalogEntries(this);
            if (obj.callback) this.sendTo(obj.from, obj.command, result, obj.callback);
            return;
        }

        if (obj.command === 'updateCatalogEntryAdmin') {
            const result = await adminCommands.updateCatalogEntryAdmin(this, obj.message);
            if (obj.callback) this.sendTo(obj.from, obj.command, result, obj.callback);
            return;
        }

        if (obj.command === 'removeCatalogEntry') {
            const result = await adminCommands.removeCatalogEntry(this, obj.message);
            if (obj.callback) this.sendTo(obj.from, obj.command, result, obj.callback);
            return;
        }

        if (obj.command === 'runDiscoveryNow') {
            const result = await adminCommands.runDiscoveryNow(this);
            if (obj.callback) this.sendTo(obj.from, obj.command, result, obj.callback);
            return;
        }

        if (obj.command === 'runProactiveCheckNow') {
            const result = adminCommands.runProactiveCheckNow(this);
            if (obj.callback) this.sendTo(obj.from, obj.command, result, obj.callback);
            return;
        }
    }
```

- [ ] **Step 5: Vollständige Testsuite laufen lassen**

Run: `npm test`
Expected: PASS (keine Regression — dieser Task fügt keine main.js-Tests hinzu, siehe Hinweis oben)

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "$(cat <<'EOF'
feat: wire admin device-management commands into onMessage

syncCatalog() now returns {foundCount, newCount, reactivatedCount} so
the manual re-scan button can report a result. onMessage dispatches
five new commands to lib/adminCommands.js (listCatalogEntries,
updateCatalogEntryAdmin, removeCatalogEntry, runDiscoveryNow,
runProactiveCheckNow), unchanged chatQuestion behavior otherwise.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/main-admin-commands-wiring -m "Merge feature/main-admin-commands-wiring into develop"
git branch -d feature/main-admin-commands-wiring
```

---

## Task 6: Tab-Verbindungsdiagnose + Fix, Tab-Umbenennung

**Files:**
- Modify: `admin/tab.js` (falls die Diagnose einen Fix erfordert)
- Modify: `io-package.json`

**Interfaces:** keine neuen — Voraussetzung dafür, dass Task 7/8 (Sub-Navigation, Geräte-Tabelle) in einem echten Admin-UI überhaupt sichtbar/nutzbar werden.

**Wichtig:** Dieser Task ist interaktiv/diagnostisch, kein reiner TDD-Task. Er braucht Zugriff auf eine laufende, im Browser erreichbare ioBroker-Admin-Instanz mit installiertem `ai-analytics`-Adapter. **Falls beim Ausführen dieses Tasks keine erreichbare Instanz bekannt ist: den Nutzer nach der Admin-URL fragen, bevor fortgefahren wird — nicht raten.** Sub-Skill `superpowers:systematic-debugging` für die Diagnose verwenden.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b fix/tab-connection-and-rename
```

- [ ] **Step 2: `io-package.json` — Tab umbenennen**

In `io-package.json`, `adminTab.name` ändern von:

```json
    "adminTab": {
      "singleton": true,
      "name": { "en": "Chat", "de": "Chat" }
    },
```

zu:

```json
    "adminTab": {
      "singleton": true,
      "name": { "en": "AI Analytics", "de": "AI Analytics" }
    },
```

- [ ] **Step 3: Live-Diagnose der Tab-Verbindung**

Mit den `claude-in-chrome`-Browser-Tools (`ToolSearch` für `tabs_context_mcp`, `navigate`, `computer`, `read_console_messages` laden):

1. Zur Admin-Oberfläche der laufenden ioBroker-Instanz navigieren, zum `ai-analytics`-Instanz-Tab wechseln.
2. `read_console_messages` auslesen, während der Tab lädt — gesucht wird die Ausgabe der bestehenden Logs in `resolveConnection()` (`console.log('[ai-analytics tab] ...')`), die zeigen, welcher Fallback-Pfad greift (`parent.socket`, eigener `io.connect()`, oder keiner mit `console.error`).
3. Ergebnis interpretieren:
   - **`parent.socket` greift, `getState`/`sendTo`-Aufrufe liefern Antworten:** kein Codefix nötig — Task ist eine reine Bestätigung, weiter mit Step 4.
   - **`io.connect()` greift, aber Aufrufe timeout/keine Antwort:** vermutlich fehlt die Instanz-Namespace-Authentifizierung des eigenständigen Sockets — `io.connect()` durch `io.connect({ path: '/socket.io' })` ersetzen und erneut testen; falls weiterhin ohne Antwort, den genauen Netzwerk-Fehler aus `read_network_requests` heranziehen und gezielt beheben.
   - **Kein Pfad greift (`showConnectionError` wird angezeigt):** die exakte `console.error`-Meldung dokumentieren und einen dazu passenden Fix ableiten (z. B. fehlendes `socket.io.js`-Script, falscher relativer Pfad im `<script src="../../socket.io/socket.io.js">` von `admin/tab.html`).
4. Den gefundenen Fix (falls nötig) in `admin/tab.js` umsetzen und im Browser erneut verifizieren: Chat-Nachricht abschicken, Antwort kommt zurück.

- [ ] **Step 4: Vollständige Testsuite laufen lassen**

Run: `npm test`
Expected: PASS (unverändert, da dieser Task primär Konfiguration + ggf. `resolveConnection()`-Logik betrifft, die von `tabFormat.test.js` nicht direkt abgedeckt ist)

- [ ] **Step 5: Commit**

```bash
git add io-package.json admin/tab.js
git commit -m "$(cat <<'EOF'
fix: confirm/repair the admin tab connection, rename tab to "AI Analytics"

Live browser diagnosis of the previously unconfirmed chat-tab connection
fallback chain — see step 3 for what was found and fixed. Tab renamed
since it will host Chat, Geräte, and Budget as one page with internal
sub-navigation (io-package.json only allows one adminTab per adapter).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff fix/tab-connection-and-rename -m "Merge fix/tab-connection-and-rename into develop"
git branch -d fix/tab-connection-and-rename
```

---

## Task 7: Sub-Navigation-Shell + reine Helper-Funktionen (`filterEntries`, `formatBudgetLine`)

**Files:**
- Modify: `admin/tab.js`
- Modify: `admin/tab.html`
- Test: `test/unit/tabFormat.test.js`

**Interfaces:**
- Produces: `filterEntries(entries, query) => object[]` (reine Textfilterung über `sourceId`/`description`/`category`/`room`/Status), `formatBudgetLine(usage, dailyTokenBudget) => string` — beide exportiert, werden von Task 8 (DOM-Verdrahtung) konsumiert.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/tab-subnav-helpers
```

- [ ] **Step 2: Fehlschlagende Tests schreiben**

In `test/unit/tabFormat.test.js`, Import erweitern:

```js
const { formatMessageLine, resolveNamespaceFromQuery, filterEntries, formatBudgetLine } = require('../../admin/tab.js');
```

Neue `describe`-Blöcke am Ende der Datei ergänzen:

```js
describe('filterEntries', () => {
    const entries = [
        { sourceId: 'javascript.0.lampe', description: 'Deckenlampe', category: 'lighting', room: 'Wohnzimmer', active: true, needsReview: false, ignored: false },
        { sourceId: 'javascript.0.steckdose', description: 'Waschmaschine', category: 'device_usage', room: 'Keller', active: false, needsReview: true, ignored: false },
        { sourceId: 'javascript.0.pv', description: 'PV-Einspeisung', category: 'generation_pv', room: '', active: true, needsReview: false, ignored: true },
    ];

    it('returns all entries for an empty query', () => {
        expect(filterEntries(entries, '')).to.deep.equal(entries);
        expect(filterEntries(entries, '   ')).to.deep.equal(entries);
    });

    it('matches by description, case-insensitive', () => {
        const result = filterEntries(entries, 'waschmaschine');
        expect(result.map((e) => e.sourceId)).to.deep.equal(['javascript.0.steckdose']);
    });

    it('matches by category', () => {
        const result = filterEntries(entries, 'lighting');
        expect(result.map((e) => e.sourceId)).to.deep.equal(['javascript.0.lampe']);
    });

    it('matches by room', () => {
        const result = filterEntries(entries, 'keller');
        expect(result.map((e) => e.sourceId)).to.deep.equal(['javascript.0.steckdose']);
    });

    it('matches the synthetic status tokens inactive/needsreview/ignored', () => {
        expect(filterEntries(entries, 'inactive').map((e) => e.sourceId)).to.deep.equal(['javascript.0.steckdose']);
        expect(filterEntries(entries, 'needsreview').map((e) => e.sourceId)).to.deep.equal(['javascript.0.steckdose']);
        expect(filterEntries(entries, 'ignored').map((e) => e.sourceId)).to.deep.equal(['javascript.0.pv']);
    });
});

describe('formatBudgetLine', () => {
    it('reports "kein Limit" when the budget is 0 or unset', () => {
        expect(formatBudgetLine({ tokensToday: 150 }, 0)).to.equal('Heute genutzt: 150 Tokens (kein Limit)');
        expect(formatBudgetLine({ tokensToday: 150 }, undefined)).to.equal('Heute genutzt: 150 Tokens (kein Limit)');
    });

    it('reports usage against the configured budget', () => {
        expect(formatBudgetLine({ tokensToday: 150 }, 1000)).to.equal('Heute genutzt: 150 / 1000 Tokens');
    });

    it('defaults to 0 tokens when usage is missing', () => {
        expect(formatBudgetLine(null, 1000)).to.equal('Heute genutzt: 0 / 1000 Tokens');
    });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx mocha test/unit/tabFormat.test.js`
Expected: FAIL — `filterEntries is not a function`

- [ ] **Step 4: Implementierung in `admin/tab.js`**

Nach `formatMessageLine` einfügen:

```js
const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];

function filterEntries(entries, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
        const haystack = [
            entry.sourceId,
            entry.description,
            entry.category,
            entry.room,
            entry.needsReview ? 'needsreview' : '',
            entry.active === false ? 'inactive' : 'active',
            entry.ignored ? 'ignored' : '',
        ]
            .join(' ')
            .toLowerCase();
        return haystack.includes(q);
    });
}

function formatBudgetLine(usage, dailyTokenBudget) {
    const tokensToday = (usage && usage.tokensToday) || 0;
    const budget = Number(dailyTokenBudget) || 0;
    if (budget <= 0) {
        return `Heute genutzt: ${tokensToday} Tokens (kein Limit)`;
    }
    return `Heute genutzt: ${tokensToday} / ${budget} Tokens`;
}
```

Den bestehenden `module.exports`-Block am Dateiende erweitern:

```js
if (typeof module !== 'undefined') {
    module.exports = { formatMessageLine, resolveNamespaceFromQuery, filterEntries, formatBudgetLine, CATEGORIES };
}
```

- [ ] **Step 5: Sub-Navigations-Grundgerüst in `admin/tab.html`**

`admin/tab.html`s `<body>` komplett ersetzen durch:

```html
<body>
    <div id="nav">
        <button class="nav-btn active" data-section="chat">Chat</button>
        <button class="nav-btn" data-section="devices">Geräte</button>
        <button class="nav-btn" data-section="budget">Budget</button>
    </div>

    <div id="section-chat" class="section">
        <div id="chat-messages"></div>
        <div id="chat-input-row">
            <input id="chat-input" type="text" placeholder="Frage stellen..." />
            <button id="chat-send">Senden</button>
        </div>
    </div>

    <div id="section-devices" class="section" hidden>
        <div id="devices-toolbar">
            <button id="devices-rescan">Geräte neu einlesen</button>
            <button id="devices-check-now">Prüfung jetzt ausführen</button>
            <input id="devices-filter" type="text" placeholder="Filtern nach Kategorie, Raum, Status..." />
        </div>
        <div id="devices-status"></div>
        <table id="devices-table">
            <thead>
                <tr><th>Objekt-ID</th><th>Beschreibung</th><th>Kategorie</th><th>Raum</th><th>Status</th><th>Aktionen</th></tr>
            </thead>
            <tbody id="devices-tbody"></tbody>
        </table>
    </div>

    <div id="section-budget" class="section" hidden>
        <div id="budget-display">Lade...</div>
    </div>
</body>
```

Im `<style>`-Block ergänzen:

```css
        #nav { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid #ddd; }
        .nav-btn { padding: 6px 14px; border: 1px solid #ccc; background: #f5f5f5; cursor: pointer; }
        .nav-btn.active { background: #1976d2; color: #fff; border-color: #1976d2; }
        .section[hidden] { display: none; }
        #devices-toolbar { display: flex; gap: 8px; padding: 8px; align-items: center; }
        #devices-status { padding: 0 8px 8px; font-size: 13px; color: #555; }
        #devices-table { width: 100%; border-collapse: collapse; }
        #devices-table th, #devices-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
        tr.device-inactive { opacity: 0.5; }
        tr.device-ignored { font-style: italic; }
```

- [ ] **Step 6: Test laufen lassen, Erfolg bestätigen**

Run: `npx mocha test/unit/tabFormat.test.js`
Expected: PASS (alle Tests in der Datei, inkl. der bereits bestehenden `formatMessageLine`/`resolveNamespaceFromQuery`-Tests)

- [ ] **Step 7: Vollständige Testsuite + Commit**

```bash
npm test
git add admin/tab.js admin/tab.html test/unit/tabFormat.test.js
git commit -m "$(cat <<'EOF'
feat: add sub-navigation shell and pure filter/budget-format helpers

Chat/Geräte/Budget sections with client-side switching (no reload, no
router). filterEntries and formatBudgetLine are pure and unit-tested;
the actual DOM wiring for the devices table and budget fetch follows
in the next task since it needs a live socket connection to test manually.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/tab-subnav-helpers -m "Merge feature/tab-subnav-helpers into develop"
git branch -d feature/tab-subnav-helpers
```

---

## Task 8: Geräte-Tabelle + Budget-Anzeige — vollständige Verdrahtung

**Files:**
- Modify: `admin/tab.js`

**Interfaces:**
- Consumes: `filterEntries`, `formatBudgetLine`, `CATEGORIES` (Task 7); Backend-Commands `listCatalogEntries`, `updateCatalogEntryAdmin`, `removeCatalogEntry`, `runDiscoveryNow`, `runProactiveCheckNow` (Task 5); `usage.today`-State und `native.dailyTokenBudget` (bestehend, unverändert).

**Hinweis zur Testabdeckung:** DOM-Rendering und Socket-Aufrufe werden hier nicht automatisiert getestet (konsistent mit der bekannten Lücke aus [11-risiken-und-schulden.md](../architecture/11-risiken-und-schulden.md) und Spec-Abschnitt 10) — Verifikation erfolgt im manuellen Abnahmetest (Task 9). Dieser Task darf keine bestehenden Tests brechen.

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b feature/tab-devices-budget-wiring
```

- [ ] **Step 2: Geräte-Tabelle + Budget-Logik implementieren**

In `admin/tab.js`, nach `setLoading` (und vor `loadHistory`) folgende Funktionen einfügen:

```js
let allDeviceEntries = [];

function showDevicesError(message) {
    const status = document.getElementById('devices-status');
    if (status) status.textContent = `[Fehler] ${message}`;
}

function renderDeviceRow(entry) {
    const row = document.createElement('tr');
    const classes = [];
    if (entry.active === false) classes.push('device-inactive');
    if (entry.ignored) classes.push('device-ignored');
    row.className = classes.join(' ');

    const idCell = document.createElement('td');
    idCell.textContent = entry.sourceId;
    row.appendChild(idCell);

    const descCell = document.createElement('td');
    descCell.textContent = entry.description || '';
    row.appendChild(descCell);

    const categorySelect = document.createElement('select');
    CATEGORIES.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        if (category === entry.category) option.selected = true;
        categorySelect.appendChild(option);
    });
    const categoryCell = document.createElement('td');
    categoryCell.appendChild(categorySelect);
    row.appendChild(categoryCell);

    const roomInput = document.createElement('input');
    roomInput.type = 'text';
    roomInput.value = entry.room || '';
    const roomCell = document.createElement('td');
    roomCell.appendChild(roomInput);
    row.appendChild(roomCell);

    const statusCell = document.createElement('td');
    const statusParts = [];
    if (entry.active === false) statusParts.push('inaktiv');
    if (entry.ignored) statusParts.push('ignoriert');
    if (entry.needsReview) statusParts.push('needsReview');
    statusCell.textContent = statusParts.join(', ') || 'aktiv';
    row.appendChild(statusCell);

    const actionsCell = document.createElement('td');

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Speichern';
    saveButton.addEventListener('click', () => {
        socket.emit(
            'sendTo',
            namespace,
            'updateCatalogEntryAdmin',
            { sourceId: entry.sourceId, category: categorySelect.value, room: roomInput.value },
            (response) => {
                if (response && response.error) {
                    showDevicesError(response.error);
                } else {
                    loadDevices();
                }
            }
        );
    });
    actionsCell.appendChild(saveButton);

    const toggleButton = document.createElement('button');
    toggleButton.textContent = entry.ignored ? 'Aktivieren' : 'Ignorieren';
    toggleButton.addEventListener('click', () => {
        socket.emit(
            'sendTo',
            namespace,
            'updateCatalogEntryAdmin',
            { sourceId: entry.sourceId, ignored: !entry.ignored },
            (response) => {
                if (response && response.error) {
                    showDevicesError(response.error);
                } else {
                    loadDevices();
                }
            }
        );
    });
    actionsCell.appendChild(toggleButton);

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Entfernen';
    removeButton.addEventListener('click', () => {
        socket.emit('sendTo', namespace, 'removeCatalogEntry', { sourceId: entry.sourceId }, (response) => {
            if (response && response.error) {
                showDevicesError(response.error);
            } else {
                loadDevices();
            }
        });
    });
    actionsCell.appendChild(removeButton);

    row.appendChild(actionsCell);

    return row;
}

function renderDevicesTable() {
    const filterInput = document.getElementById('devices-filter');
    const visible = filterEntries(allDeviceEntries, filterInput ? filterInput.value : '');
    const tbody = document.getElementById('devices-tbody');
    tbody.innerHTML = '';
    visible.forEach((entry) => tbody.appendChild(renderDeviceRow(entry)));
}

function loadDevices() {
    socket.emit('sendTo', namespace, 'listCatalogEntries', {}, (response) => {
        allDeviceEntries = (response && response.entries) || [];
        renderDevicesTable();
    });
}

function triggerRescan() {
    const status = document.getElementById('devices-status');
    status.textContent = 'Re-Scan laeuft...';
    socket.emit('sendTo', namespace, 'runDiscoveryNow', {}, (response) => {
        if (response && response.error) {
            showDevicesError(response.error);
            return;
        }
        status.textContent = `Re-Scan fertig: ${response.newCount} neu, ${response.reactivatedCount} reaktiviert.`;
        loadDevices();
    });
}

function triggerProactiveCheck() {
    const status = document.getElementById('devices-status');
    socket.emit('sendTo', namespace, 'runProactiveCheckNow', {}, () => {
        status.textContent = 'Pruefung gestartet, Ergebnis erscheint im Chat.';
    });
}

function loadBudget() {
    const display = document.getElementById('budget-display');
    socket.emit('getState', `${namespace}.usage.today`, (usageErr, usageState) => {
        const usage = !usageErr && usageState && usageState.val ? JSON.parse(usageState.val) : { tokensToday: 0 };
        socket.emit('getObject', `system.adapter.${namespace}`, (objErr, instanceObj) => {
            const budget = !objErr && instanceObj && instanceObj.native ? instanceObj.native.dailyTokenBudget : 0;
            display.textContent = formatBudgetLine(usage, budget);
        });
    });
}

function showSection(section) {
    ['chat', 'devices', 'budget'].forEach((name) => {
        const el = document.getElementById(`section-${name}`);
        if (el) el.hidden = name !== section;
    });
    document.querySelectorAll('.nav-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.section === section);
    });
    if (section === 'devices') loadDevices();
    if (section === 'budget') loadBudget();
}
```

- [ ] **Step 3: In `init()` verdrahten**

`init()` erweitern (nach den bestehenden `chat-send`/`chat-input`-Listenern):

```js
    document.querySelectorAll('.nav-btn').forEach((button) => {
        button.addEventListener('click', () => showSection(button.dataset.section));
    });
    document.getElementById('devices-rescan').addEventListener('click', triggerRescan);
    document.getElementById('devices-check-now').addEventListener('click', triggerProactiveCheck);
    document.getElementById('devices-filter').addEventListener('input', renderDevicesTable);
```

- [ ] **Step 4: Vollständige Testsuite laufen lassen**

Run: `npm test`
Expected: PASS (keine Regression — neue Funktionen sind DOM-abhängig und nicht separat unit-getestet, siehe Hinweis oben; die reinen Helper aus Task 7 bleiben grün)

- [ ] **Step 5: Commit**

```bash
git add admin/tab.js
git commit -m "$(cat <<'EOF'
feat: wire the devices table and budget display to the backend

Devices section: load/render/filter the catalog table, per-row save
(category+room)/ignore-toggle/remove, plus manual re-scan and
proactive-check-now buttons. Budget section: read usage.today and
native.dailyTokenBudget directly via the existing socket, no new
backend command needed. Not unit-tested (DOM/socket-dependent,
consistent with the existing known gap) — verified in the manual
acceptance test.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff feature/tab-devices-budget-wiring -m "Merge feature/tab-devices-budget-wiring into develop"
git branch -d feature/tab-devices-budget-wiring
```

---

## Task 9: Dokumentation aktualisieren + Abschluss

**Files:**
- Modify: `docs/architecture/05-bausteinsicht.md`
- Modify: `docs/architecture/11-risiken-und-schulden.md`
- Modify: `docs/adr/backlog.md`
- Modify: `io-package.json` (News-Eintrag)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Branch anlegen**

```bash
git checkout develop
git checkout -b docs/geraete-tab-wrapup
```

- [ ] **Step 2: `05-bausteinsicht.md` aktualisieren**

Die `lib/`-Baumdarstellung um `adminCommands.js` ergänzen (nach der `tools.js`-Zeile):

```
├── tools.js             Werkzeug-Definitionen (JSON-Schema) + Dispatcher
├── adminCommands.js      Admin-Message-Bus: Geräte-Verwaltung, manuelle Trigger
```

Die Komponenten-Tabelle um eine Zeile ergänzen (nach der `tools.js`-Zeile):

```
| `adminCommands.js` | Geräte-Liste/-Update/-Entfernen, manueller Re-Scan/Prüf-Trigger für den Admin-Tab | `listCatalogEntries`, `updateCatalogEntryAdmin`, `removeCatalogEntry`, `runDiscoveryNow`, `runProactiveCheckNow` |
```

`catalog.js`s Schnittstellen-Zeile um `removeCatalogEntry` ergänzen, `onboarding.js`s Verantwortungs-Zeile um den Enum-Raum-Hinweis ergänzen, und den `admin/`-Abschnitt um die Sub-Navigation erwähnen (Chat/Geräte/Budget als ein Tab).

- [ ] **Step 3: `11-risiken-und-schulden.md` aktualisieren**

Folgende Punkte aus der Liste entfernen (durch dieses Feature gelöst):
- "Admin-Chat-Tab bestätigt defekt" — durch Task 6 gelöst.
- "Onboarding-Rückfragen sind derzeit nicht auflösbar" — durch die editierbare Geräte-Tabelle (Task 8) gelöst.
- "Kein manueller Re-Discovery-Trigger und keine Auswahl der History-Adapterinstanz(en)" — der Re-Discovery-Teil ist gelöst; falls die Instanz-Auswahl weiterhin fehlt, den Satz entsprechend kürzen statt komplett zu entfernen.

- [ ] **Step 4: `backlog.md` aktualisieren**

Punkt 1 ("Auswahl der History-Adapterinstanz(en) + manueller Re-Discovery-Trigger") und Punkt 12 ("Manueller Trigger für die proaktive Prüfung") entfernen bzw. auf den verbleibenden Rest kürzen, falls die Instanz-Auswahl aus Punkt 1 weiterhin offen ist (nur der Re-Discovery-Teil wurde in diesem Plan umgesetzt) — die verbleibenden Punkte entsprechend neu nummerieren, analog zum bestehenden Muster im Datei-Kopf ("Aktualisiert ...: die vorherigen Punkte ... sind durch ... aufgelöst").

- [ ] **Step 5: `io-package.json` News-Eintrag ergänzen**

Neuen Eintrag in `common.news` vor dem bestehenden `"0.0.1-beta.2"`-Eintrag einfügen:

```json
      "0.0.1-beta.3": {
        "en": "Device management tab (rename/ignore/remove, manual re-scan and check-now triggers), token-budget display, and a confirmed working admin tab connection.",
        "de": "Geräte-Verwaltungs-Tab (Raum ändern/ignorieren/entfernen, manuelle Re-Scan- und Prüf-Trigger), Token-Budget-Anzeige und eine bestätigt funktionierende Admin-Tab-Verbindung."
      },
```

- [ ] **Step 6: `CHANGELOG.md` ergänzen**

Neuen Abschnitt am Dateianfang (vor dem letzten veröffentlichten Eintrag) einfügen:

```markdown
## [Unreleased]

### Hinzugefügt
- Geräte-Tab im Admin-UI (Sub-Navigation neben Chat): editierbare Tabelle aller katalogisierten Objekte (Kategorie, Raum), Ignorieren/Aktivieren, Entfernen, Filter/Suche.
- Manuelle Trigger: "Geräte neu einlesen" (Re-Discovery) und "Prüfung jetzt ausführen" (proaktive Prüfung), ohne auf das konfigurierte Intervall warten zu müssen.
- Token-Budget-Anzeige (heutiger Verbrauch vs. konfiguriertes Tageslimit).
- Neue Katalog-Eigenschaft `ignored`; ignorierte Objekte werden von Chat-Analysen und der proaktiven Prüfung ausgeschlossen, bleiben aber sichtbar/reaktivierbar.
- Raum wird beim Onboarding, wenn möglich, deterministisch aus `enum.rooms.*` übernommen statt nur vom LLM geraten.

### Behoben
- Admin-Tab-Verbindung diagnostiziert und bestätigt funktionsfähig (bzw. gezielt gefixt, siehe Diagnose-Ergebnis).

### Bekannte Lücken
- Siehe [11-risiken-und-schulden.md](docs/architecture/11-risiken-und-schulden.md) für den aktuellen Stand.
```

- [ ] **Step 7: Vollständige Testsuite laufen lassen**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add docs/architecture/05-bausteinsicht.md docs/architecture/11-risiken-und-schulden.md docs/adr/backlog.md io-package.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: close resolved gaps and record the geräte-tab feature

Removes the now-resolved known gaps (broken admin tab, unresolvable
onboarding follow-ups, missing manual re-discovery trigger) and updates
the backlog, blueprint view, io-package.json news, and changelog.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Nach develop mergen**

```bash
git checkout develop
git merge --no-ff docs/geraete-tab-wrapup -m "Merge docs/geraete-tab-wrapup into develop"
git branch -d docs/geraete-tab-wrapup
```

- [ ] **Step 10: Manueller Abnahmetest (an einer echten Instanz, sobald verfügbar)**

Checkliste (siehe Spec-Abschnitt 10):
1. Admin-Tab öffnen, prüfen dass Chat weiterhin funktioniert (Nachricht senden, Antwort kommt zurück).
2. Zum "Geräte"-Bereich wechseln, Tabelle lädt.
3. Ein Gerät: Raum ändern, speichern, Bestätigung prüfen (Reload zeigt neuen Raum).
4. Ein Gerät ignorieren, prüfen dass es ausgegraut/markiert bleibt aber sichtbar ist; wieder aktivieren.
5. Ein Gerät entfernen, prüfen dass es aus der Tabelle verschwindet; "Geräte neu einlesen" klicken, prüfen dass es (falls weiterhin historisiert) wieder auftaucht.
6. "Prüfung jetzt ausführen" klicken, prüfen dass im Chat eine neue Nachricht erscheint.
7. Zum "Budget"-Bereich wechseln, Anzeige mit dem tatsächlichen `usage.today`-State abgleichen.
8. Alle Aktionen aus 3.–6. im Adapter-Log (silly-Level) nachvollziehen können.

Ergebnis in `docs/architecture/11-risiken-und-schulden.md` unter "Manueller Abnahmetest" protokollieren (analog zum bestehenden Eintrag vom 2026-08-21).

**Kein `git push` in diesem Plan** — bleibt expliziter, gesonderter Schritt.
