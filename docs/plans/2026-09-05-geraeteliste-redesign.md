# Geräteliste-Redesign — Implementierungsplan

Spec: `docs/specs/2026-09-05-geraeteliste-redesign.md`

Umgesetzt inline in der laufenden Session. TDD pro Schritt.

## Global Constraints

- Kein `git push`, kein Merge nach `master` in diesem Plan — nur auf
  ausdrücklichen Auftrag (siehe `CONTRIBUTING.md`).
- `npm test` (= `test:unit` + `test:admin`) muss vor jedem Commit grün sein.
  `test:admin` läuft nur Dateien unter `test/admin/**/*.test.jsx` — auch
  reine Helferfunktions-Tests ohne JSX-Syntax müssen die Endung `.test.jsx`
  tragen, sonst werden sie von Vitest gar nicht erfasst.
- Sofort-Speichern: Dropdowns speichern per `onChange`, Textfelder
  (Beschreibung, Raum, neue Gruppen-ID) per `onBlur`/Enter — kein
  Entwurf-State mehr.
- Lösch-Sentinel `''` (leerer String) bedeutet "Feld entfernen"; `undefined`
  bedeutet weiterhin "nicht ändern". `derivedMetricRole: ''` löscht
  `derivedMetricRole` und `derivedMetricGroupId` zusammen.
- `hvacRole` bleibt nur für `valueKind: 'boolean_state'` aktivierbar
  (Frontend deaktiviert das Feld sonst, Backend validiert zusätzlich).
- Keine neuen Backend-Commands — nur `updateCatalogEntryAdmin` und
  `removeCatalogEntry` (bestehend) werden von Bulk-Aktionen wiederholt
  aufgerufen, analog zum bisherigen `saveSelected`-Muster.

---

## Task 1: Backend — Lösch-Sentinel für `derivedMetricRole`/`derivedMetricGroupId`/`hvacRole`

**Dateien:**
- Ändern: `lib/adminCommands.js`
- Test: `test/unit/adminCommands.test.js`

- [ ] **Schritt 1: Rote Tests**

In `test/unit/adminCommands.test.js`, im `describe('updateCatalogEntryAdmin', ...)`-Block direkt vor der letzten `});` (nach dem Test `'accepts and stores a valid hvacRole on a boolean_state entry'`) einfügen:

```js
        it('clears derivedMetricRole and derivedMetricGroupId together via the empty-string sentinel', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'consumption', derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: '' });

            expect(result.entry).to.not.have.property('derivedMetricRole');
            expect(result.entry).to.not.have.property('derivedMetricGroupId');
        });

        it('ignores a derivedMetricGroupId sent alongside the derivedMetricRole clear sentinel', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'consumption', derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', derivedMetricRole: '', derivedMetricGroupId: 'should-be-ignored' });

            expect(result.entry).to.not.have.property('derivedMetricRole');
            expect(result.entry).to.not.have.property('derivedMetricGroupId');
        });

        it('clears only hvacRole via the empty-string sentinel, without a valueKind check', async () => {
            const existing = { sourceId: 'javascript.0.x', category: 'device_usage', valueKind: 'gauge', hvacRole: 'window' };
            const setCatalogEntry = sinon.stub().resolves();
            const { updateCatalogEntryAdmin } = loadAdminCommandsWithStubs({
                getAllCatalogEntries: sinon.stub().resolves([existing]),
                setCatalogEntry,
            });

            const result = await updateCatalogEntryAdmin({}, { sourceId: 'javascript.0.x', hvacRole: '' });

            expect(result.entry).to.not.have.property('hvacRole');
        });
```

- [ ] **Schritt 2:** `npx mocha test/unit/adminCommands.test.js` → FAIL (die drei neuen Tests schlagen fehl: `derivedMetricRole ist ungültig.` bzw. `hvacRole ist ungültig.`, da `''` heute nicht als Sentinel behandelt wird).

- [ ] **Schritt 3: Implementieren**

In `lib/adminCommands.js`, `validateCatalogUpdate` ersetzen durch:

```js
function validateCatalogUpdate(message = {}) {
    if (typeof message.sourceId !== 'string' || !message.sourceId.trim() || message.sourceId.length > MAX_SOURCE_ID_LENGTH) {
        throw new Error(`sourceId muss ein nicht-leerer String mit maximal ${MAX_SOURCE_ID_LENGTH} Zeichen sein.`);
    }
    validateStringField(message, 'room', MAX_ROOM_LENGTH);
    validateStringField(message, 'description', MAX_DESCRIPTION_LENGTH);
    if (message.category !== undefined && !CATEGORIES.includes(message.category)) throw new Error('category ist ungültig.');
    if (message.valueKind !== undefined && !VALUE_KINDS.has(message.valueKind)) throw new Error('valueKind ist ungültig.');
    if (message.ignored !== undefined && typeof message.ignored !== 'boolean') throw new Error('ignored muss ein Boolean sein.');
    if (message.updateFrequency !== undefined && !UPDATE_FREQUENCIES.has(message.updateFrequency)) throw new Error('updateFrequency ist ungültig.');
    if (message.dataCompleteness !== undefined && !DATA_COMPLETENESS.has(message.dataCompleteness)) throw new Error('dataCompleteness ist ungültig.');
    const clearingDerivedMetric = message.derivedMetricRole === '';
    const hasDerivedMetricRole = message.derivedMetricRole !== undefined;
    const hasDerivedMetricGroupId = message.derivedMetricGroupId !== undefined;
    if (!clearingDerivedMetric && hasDerivedMetricRole !== hasDerivedMetricGroupId) {
        throw new Error('derivedMetricRole und derivedMetricGroupId müssen zusammen gesetzt sein.');
    }
    if (hasDerivedMetricRole && !clearingDerivedMetric && !DERIVED_METRIC_ROLES.has(message.derivedMetricRole)) {
        throw new Error('derivedMetricRole ist ungültig.');
    }
    if (hasDerivedMetricGroupId && !clearingDerivedMetric) validateStringField(message, 'derivedMetricGroupId', MAX_DERIVED_METRIC_GROUP_ID_LENGTH);
    if (message.hvacRole !== undefined && message.hvacRole !== '' && !HVAC_ROLES.has(message.hvacRole)) {
        throw new Error('hvacRole ist ungültig.');
    }
    return message;
}
```

In `updateCatalogEntryAdminUnlocked`, den `hvacRole`-Vorab-Check ersetzen durch:

```js
    if (hvacRole !== undefined && hvacRole !== '') {
        const targetValueKind = valueKind !== undefined ? valueKind : entry.valueKind;
        if (targetValueKind !== 'boolean_state') {
            throw new Error('hvacRole ist nur fuer valueKind boolean_state gueltig.');
        }
    }
```

und die Feld-Zuweisungsblöcke für die drei Rollenfelder durch:

```js
    if (derivedMetricRole !== undefined) {
        if (derivedMetricRole === '') {
            delete updated.derivedMetricRole;
            delete updated.derivedMetricGroupId;
        } else {
            updated.derivedMetricRole = derivedMetricRole;
        }
    }
    if (derivedMetricGroupId !== undefined && derivedMetricRole !== '') {
        updated.derivedMetricGroupId = derivedMetricGroupId;
    }
    if (hvacRole !== undefined) {
        if (hvacRole === '') {
            delete updated.hvacRole;
        } else {
            updated.hvacRole = hvacRole;
        }
    }
```

- [ ] **Schritt 4:** `npx mocha test/unit/adminCommands.test.js` → PASS (alle Tests der Datei, inkl. der bereits bestehenden Enum-/Paar-Validierungstests).

- [ ] **Schritt 5:** `npm run test:unit` → PASS (keine Regression in anderen Suiten, die `adminCommands.js` konsumieren).

---

## Task 2: `catalogTableUtils.js` — Sortierung, Filterung, Status-Label

**Dateien:**
- Erstellen: `src-admin/src/CatalogDevices/catalogTableUtils.js`
- Test: `test/admin/catalogTableUtils.test.jsx`

**Produziert** (von Task 6 konsumiert): `statusLabel(entry)`, `filterEntries(entries, query)`, `sortEntries(entries, sort)`, `nextSortState(currentSort, clickedKey)` — `sort` ist `null` oder `{key, direction}` mit `direction` ∈ `'asc'|'desc'`.

- [ ] **Schritt 1: Rote Tests**

Neue Datei `test/admin/catalogTableUtils.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { statusLabel, filterEntries, sortEntries, nextSortState } from '../../src-admin/src/CatalogDevices/catalogTableUtils.js';

describe('statusLabel', () => {
    it('prioritizes ignored over inactive/needsReview', () => {
        expect(statusLabel({ ignored: true, active: false, needsReview: true })).to.equal('ignoriert');
    });
    it('reports inactive when not ignored', () => {
        expect(statusLabel({ active: false })).to.equal('inaktiv');
    });
    it('reports needsReview when active and not ignored', () => {
        expect(statusLabel({ needsReview: true })).to.equal('Prüfung nötig');
    });
    it('defaults to aktiv', () => {
        expect(statusLabel({})).to.equal('aktiv');
    });
});

describe('filterEntries', () => {
    const entries = [
        { sourceId: 'javascript.0.lampe', description: 'Deckenlampe', category: 'lighting', room: 'Wohnzimmer', valueKind: 'boolean_state' },
        { sourceId: 'javascript.0.pv', description: 'PV-Einspeisung', category: 'generation_pv', room: 'Keller', valueKind: 'gauge' },
    ];
    it('returns all entries for an empty query', () => {
        expect(filterEntries(entries, '')).to.deep.equal(entries);
        expect(filterEntries(entries, '   ')).to.deep.equal(entries);
    });
    it('matches case-insensitively across sourceId/description/category/room/valueKind', () => {
        expect(filterEntries(entries, 'keller').map(e => e.sourceId)).to.deep.equal(['javascript.0.pv']);
        expect(filterEntries(entries, 'BOOLEAN_STATE').map(e => e.sourceId)).to.deep.equal(['javascript.0.lampe']);
    });
});

describe('sortEntries', () => {
    const entries = [
        { sourceId: 'b', description: 'Bravo' },
        { sourceId: 'a', description: 'Alpha' },
        { sourceId: 'c', description: 'Charlie' },
    ];
    it('returns entries unchanged when sort is null', () => {
        expect(sortEntries(entries, null)).to.deep.equal(entries);
    });
    it('sorts ascending by the given key', () => {
        expect(sortEntries(entries, { key: 'sourceId', direction: 'asc' }).map(e => e.sourceId)).to.deep.equal(['a', 'b', 'c']);
    });
    it('sorts descending by the given key', () => {
        expect(sortEntries(entries, { key: 'sourceId', direction: 'desc' }).map(e => e.sourceId)).to.deep.equal(['c', 'b', 'a']);
    });
    it('sorts by the computed status label when key is "status"', () => {
        const withStatus = [
            { sourceId: 'x', ignored: true },
            { sourceId: 'y', active: false },
            { sourceId: 'z' },
        ];
        expect(sortEntries(withStatus, { key: 'status', direction: 'asc' }).map(e => e.sourceId)).to.deep.equal(['z', 'y', 'x']);
    });
    it('does not mutate the input array', () => {
        const copy = [...entries];
        sortEntries(entries, { key: 'sourceId', direction: 'asc' });
        expect(entries).to.deep.equal(copy);
    });
});

describe('nextSortState', () => {
    it('starts ascending on a fresh column', () => {
        expect(nextSortState(null, 'sourceId')).to.deep.equal({ key: 'sourceId', direction: 'asc' });
    });
    it('switches an ascending column to descending', () => {
        expect(nextSortState({ key: 'sourceId', direction: 'asc' }, 'sourceId')).to.deep.equal({ key: 'sourceId', direction: 'desc' });
    });
    it('resets a descending column to null', () => {
        expect(nextSortState({ key: 'sourceId', direction: 'desc' }, 'sourceId')).to.equal(null);
    });
    it('switches to ascending when a different column is clicked', () => {
        expect(nextSortState({ key: 'sourceId', direction: 'desc' }, 'room')).to.deep.equal({ key: 'room', direction: 'asc' });
    });
});
```

- [ ] **Schritt 2:** `npx vitest run test/admin/catalogTableUtils.test.jsx` → FAIL (`Cannot find module '.../catalogTableUtils.js'`).

- [ ] **Schritt 3: Implementieren**

Neue Datei `src-admin/src/CatalogDevices/catalogTableUtils.js`:

```js
'use strict';

export function statusLabel(entry) {
    if (entry.ignored) return 'ignoriert';
    if (entry.active === false) return 'inaktiv';
    if (entry.needsReview) return 'Prüfung nötig';
    return 'aktiv';
}

export function filterEntries(entries, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(entry =>
        [entry.sourceId, entry.description, entry.category, entry.room, entry.valueKind]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
    );
}

export function sortEntries(entries, sort) {
    if (!sort) return entries;
    const { key, direction } = sort;
    const factor = direction === 'desc' ? -1 : 1;
    const valueOf = entry => (key === 'status' ? statusLabel(entry) : String(entry[key] || ''));
    return [...entries].sort((a, b) => valueOf(a).localeCompare(valueOf(b), 'de', { sensitivity: 'base' }) * factor);
}

export function nextSortState(currentSort, clickedKey) {
    if (!currentSort || currentSort.key !== clickedKey) return { key: clickedKey, direction: 'asc' };
    if (currentSort.direction === 'asc') return { key: clickedKey, direction: 'desc' };
    return null;
}
```

- [ ] **Schritt 4:** `npx vitest run test/admin/catalogTableUtils.test.jsx` → PASS.

---

## Task 3: `GroupIdPicker.jsx` — Auswahl/Neuanlage von `derivedMetricGroupId`

**Dateien:**
- Erstellen: `src-admin/src/CatalogDevices/GroupIdPicker.jsx`
- Test: `test/admin/groupIdPicker.test.jsx`

**Produziert** (von Task 4, 5 konsumiert): `<GroupIdPicker value existingGroups onChange ariaLabel />` — ruft `onChange(nextGroupId)` mit dem gewählten bzw. neu eingegebenen (getrimmten) Gruppennamen auf; ruft `onChange` **nicht** auf, wenn die Neuanlage-Eingabe leer bleibt.

- [ ] **Schritt 1: Rote Tests**

Neue Datei `test/admin/groupIdPicker.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupIdPicker from '../../src-admin/src/CatalogDevices/GroupIdPicker.jsx';

describe('GroupIdPicker', () => {
    it('lists existing groups and reports a selection', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="pv-1" existingGroups={['pv-1', 'pv-2']} onChange={onChange} />);

        const select = screen.getByLabelText('Gruppe');
        expect(select).toHaveValue('pv-1');
        await user.selectOptions(select, 'pv-2');

        expect(onChange).toHaveBeenCalledWith('pv-2');
    });

    it('reveals a text input for a new group and commits it on blur', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="" existingGroups={['pv-1']} onChange={onChange} />);

        await user.selectOptions(screen.getByLabelText('Gruppe'), '__new__');
        const input = screen.getByLabelText('Gruppe');
        await user.type(input, 'neue-gruppe');
        await user.tab();

        expect(onChange).toHaveBeenCalledWith('neue-gruppe');
    });

    it('does not call onChange when the new-group input is left blank', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="" existingGroups={[]} onChange={onChange} />);

        await user.selectOptions(screen.getByLabelText('Gruppe'), '__new__');
        await user.tab();

        expect(onChange).not.toHaveBeenCalled();
    });

    it('commits the new group on Enter without needing a blur', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="" existingGroups={[]} onChange={onChange} />);

        await user.selectOptions(screen.getByLabelText('Gruppe'), '__new__');
        await user.type(screen.getByLabelText('Gruppe'), 'sofort{Enter}');

        expect(onChange).toHaveBeenCalledWith('sofort');
    });
});
```

- [ ] **Schritt 2:** `npx vitest run test/admin/groupIdPicker.test.jsx` → FAIL (Modul existiert nicht).

- [ ] **Schritt 3: Implementieren**

Neue Datei `src-admin/src/CatalogDevices/GroupIdPicker.jsx`:

```jsx
import React from 'react';

const NEW_GROUP_OPTION = '__new__';

export default class GroupIdPicker extends React.Component {
    constructor(props) {
        super(props);
        this.state = { creating: false, draft: '' };
    }

    handleSelectChange(event) {
        const next = event.target.value;
        if (next === NEW_GROUP_OPTION) {
            this.setState({ creating: true, draft: '' });
            return;
        }
        this.props.onChange(next);
    }

    commitNewGroup() {
        const trimmed = this.state.draft.trim();
        this.setState({ creating: false, draft: '' });
        if (trimmed) this.props.onChange(trimmed);
    }

    render() {
        const { value, existingGroups, ariaLabel } = this.props;
        if (this.state.creating) {
            return (
                <input
                    aria-label={ariaLabel}
                    autoFocus
                    value={this.state.draft}
                    placeholder="Neue Gruppen-ID"
                    onChange={event => this.setState({ draft: event.target.value })}
                    onBlur={() => this.commitNewGroup()}
                    onKeyDown={event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            this.commitNewGroup();
                        }
                    }}
                />
            );
        }
        const options = value && !existingGroups.includes(value) ? [value, ...existingGroups] : existingGroups;
        return (
            <select aria-label={ariaLabel} value={value || ''} onChange={event => this.handleSelectChange(event)}>
                <option value="">keine Gruppe</option>
                {options.map(group => <option key={group} value={group}>{group}</option>)}
                <option value={NEW_GROUP_OPTION}>Neue Gruppe …</option>
            </select>
        );
    }
}
```

- [ ] **Schritt 4:** `npx vitest run test/admin/groupIdPicker.test.jsx` → PASS.

---

## Task 4: `DeviceRow.jsx` — Zeile mit Sofort-Speichern und Detail-Panel

**Dateien:**
- Erstellen: `src-admin/src/CatalogDevices/DeviceRow.jsx`
- Test: `test/admin/deviceRow.test.jsx`

**Konsumiert:** `GroupIdPicker` (Task 3).
**Produziert** (von Task 6 konsumiert): `<DeviceRow entry selected expanded existingGroups onToggleSelected onToggleExpanded onFieldChange onRemove />`. `onFieldChange(fields)` ist eine vom Elternteil bereitgestellte Funktion, die `Promise<{error?: string}>` zurückgibt (leeres Objekt = Erfolg); `DeviceRow` ruft sie mit **einem** Feld-Objekt pro Sofort-Speicherung auf (z. B. `{category: 'lighting'}` oder — beim Setzen einer Energie-Rolle — `{derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1'}` in einem Aufruf).

- [ ] **Schritt 1: Rote Tests**

Neue Datei `test/admin/deviceRow.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeviceRow from '../../src-admin/src/CatalogDevices/DeviceRow.jsx';

function renderRow(overrides = {}) {
    const entry = { sourceId: 'javascript.0.x', description: 'Lampe', category: 'lighting', valueKind: 'gauge', room: 'Keller', ...overrides.entry };
    const props = {
        entry,
        selected: false,
        expanded: false,
        existingGroups: [],
        onToggleSelected: vi.fn(),
        onToggleExpanded: vi.fn(),
        onFieldChange: vi.fn().mockResolvedValue({}),
        onRemove: vi.fn(),
        ...overrides,
    };
    return { ...render(
        <table><tbody><DeviceRow {...props} /></tbody></table>
    ), props };
}

describe('DeviceRow', () => {
    it('saves a dropdown change immediately via onChange', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        await user.selectOptions(screen.getByLabelText('Kategorie für javascript.0.x'), 'device_usage');

        expect(props.onFieldChange).toHaveBeenCalledWith({ category: 'device_usage' });
    });

    it('saves a text field only on blur, not per keystroke', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        const input = screen.getByLabelText('Beschreibung für javascript.0.x');
        await user.clear(input);
        await user.type(input, 'Neue Beschreibung');
        expect(props.onFieldChange).not.toHaveBeenCalled();

        await user.tab();
        expect(props.onFieldChange).toHaveBeenCalledWith({ description: 'Neue Beschreibung' });
    });

    it('does not save on blur when the text field value is unchanged', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        await user.click(screen.getByLabelText('Beschreibung für javascript.0.x'));
        await user.tab();

        expect(props.onFieldChange).not.toHaveBeenCalled();
    });

    it('shows an inline error next to the field when onFieldChange fails', async () => {
        const user = userEvent.setup();
        renderRow({ onFieldChange: vi.fn().mockResolvedValue({ error: 'Server abgelehnt' }) });

        await user.selectOptions(screen.getByLabelText('Kategorie für javascript.0.x'), 'device_usage');

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server abgelehnt'));
    });

    it('toggles the detail panel via onToggleExpanded', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        await user.click(screen.getByLabelText('javascript.0.x Details öffnen'));

        expect(props.onToggleExpanded).toHaveBeenCalled();
    });

    it('disables the HVAC role dropdown unless valueKind is boolean_state', () => {
        renderRow({ expanded: true, entry: { valueKind: 'gauge' } });
        expect(screen.getByLabelText('HVAC-Rolle für javascript.0.x')).toBeDisabled();
    });

    it('enables the HVAC role dropdown for boolean_state and saves the chosen role', async () => {
        const user = userEvent.setup();
        const { props } = renderRow({ expanded: true, entry: { valueKind: 'boolean_state' } });

        const select = screen.getByLabelText('HVAC-Rolle für javascript.0.x');
        expect(select).toBeEnabled();
        await user.selectOptions(select, 'window');

        expect(props.onFieldChange).toHaveBeenCalledWith({ hvacRole: 'window' });
    });

    it('holds a newly chosen energy role until a group is picked, then saves both together', async () => {
        const user = userEvent.setup();
        const { props } = renderRow({ expanded: true, existingGroups: ['pv-1'], entry: { derivedMetricRole: undefined, derivedMetricGroupId: undefined } });

        await user.selectOptions(screen.getByLabelText('Energie-Rolle für javascript.0.x'), 'pv_generation');
        expect(props.onFieldChange).not.toHaveBeenCalled();

        await user.selectOptions(screen.getByLabelText('Energiebilanz-Gruppe für javascript.0.x'), 'pv-1');

        expect(props.onFieldChange).toHaveBeenCalledWith({ derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' });
    });

    it('clears the energy role via the empty-string sentinel when "keine" is chosen', async () => {
        const user = userEvent.setup();
        const { props } = renderRow({ expanded: true, entry: { derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' } });

        await user.selectOptions(screen.getByLabelText('Energie-Rolle für javascript.0.x'), '');

        expect(props.onFieldChange).toHaveBeenCalledWith({ derivedMetricRole: '' });
    });

    it('calls onRemove when the Entfernen button is clicked', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        await user.click(screen.getByLabelText('javascript.0.x entfernen'));

        expect(props.onRemove).toHaveBeenCalled();
    });
});
```

- [ ] **Schritt 2:** `npx vitest run test/admin/deviceRow.test.jsx` → FAIL (Modul existiert nicht).

- [ ] **Schritt 3: Implementieren**

Neue Datei `src-admin/src/CatalogDevices/DeviceRow.jsx`:

```jsx
import React from 'react';
import GroupIdPicker from './GroupIdPicker.jsx';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption'];
const HVAC_ROLES = ['window', 'heating'];
const UPDATE_FREQUENCIES = ['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven'];
const DATA_COMPLETENESS = ['unknown', 'complete', 'gaps', 'stale'];
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ROOM_LENGTH = 200;

function statusLabelOf(entry) {
    if (entry.ignored) return 'ignoriert';
    if (entry.active === false) return 'inaktiv';
    if (entry.needsReview) return 'Prüfung nötig';
    return 'aktiv';
}

export default class DeviceRow extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            description: props.entry.description || '',
            room: props.entry.room || '',
            fieldErrors: {},
            pendingRole: undefined,
        };
    }

    componentDidUpdate(prevProps) {
        if (prevProps.entry !== this.props.entry) {
            this.setState({
                description: this.props.entry.description || '',
                room: this.props.entry.room || '',
                pendingRole: undefined,
            });
        }
    }

    async save(fields) {
        const result = await this.props.onFieldChange(fields);
        const changedKeys = Object.keys(fields);
        this.setState(state => {
            const fieldErrors = { ...state.fieldErrors };
            changedKeys.forEach(key => {
                if (result && result.error) fieldErrors[key] = result.error;
                else delete fieldErrors[key];
            });
            return { fieldErrors };
        });
    }

    handleTextBlur(field, maxLength) {
        const value = this.state[field].slice(0, maxLength);
        if (value === (this.props.entry[field] || '')) return;
        this.save({ [field]: value });
    }

    handleRoleChange(nextRole) {
        if (nextRole === '') {
            this.save({ derivedMetricRole: '' });
            return;
        }
        if (!this.props.entry.derivedMetricGroupId) {
            this.setState({ pendingRole: nextRole });
            return;
        }
        this.save({ derivedMetricRole: nextRole, derivedMetricGroupId: this.props.entry.derivedMetricGroupId });
    }

    handleGroupChange(nextGroup) {
        const role = this.state.pendingRole || this.props.entry.derivedMetricRole;
        this.setState({ pendingRole: undefined });
        this.save({ derivedMetricRole: role, derivedMetricGroupId: nextGroup });
    }

    render() {
        const { entry, selected, expanded, existingGroups } = this.props;
        const { fieldErrors, pendingRole } = this.state;
        const effectiveRole = pendingRole !== undefined ? pendingRole : (entry.derivedMetricRole || '');
        const hvacDisabled = entry.valueKind !== 'boolean_state';

        return (
            <>
                <tr>
                    <td>
                        <button aria-label={`${entry.sourceId} Details ${expanded ? 'schließen' : 'öffnen'}`} onClick={() => this.props.onToggleExpanded()}>
                            {expanded ? '▾' : '▸'}
                        </button>
                        <input type="checkbox" aria-label={`${entry.sourceId} auswählen`} checked={selected} onChange={() => this.props.onToggleSelected()} />
                    </td>
                    <td>{entry.sourceId}</td>
                    <td>
                        <input
                            aria-label={`Beschreibung für ${entry.sourceId}`}
                            maxLength={MAX_DESCRIPTION_LENGTH}
                            value={this.state.description}
                            onChange={event => this.setState({ description: event.target.value })}
                            onBlur={() => this.handleTextBlur('description', MAX_DESCRIPTION_LENGTH)}
                        />
                        {fieldErrors.description ? <span role="alert">{fieldErrors.description}</span> : null}
                    </td>
                    <td>
                        <select aria-label={`Kategorie für ${entry.sourceId}`} value={entry.category || ''} onChange={event => this.save({ category: event.target.value })}>
                            {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                        </select>
                        {fieldErrors.category ? <span role="alert">{fieldErrors.category}</span> : null}
                    </td>
                    <td>
                        <select aria-label={`Verhalten für ${entry.sourceId}`} value={entry.valueKind || ''} onChange={event => this.save({ valueKind: event.target.value })}>
                            <option value="">nicht klassifiziert</option>
                            {VALUE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                        </select>
                        {fieldErrors.valueKind ? <span role="alert">{fieldErrors.valueKind}</span> : null}
                    </td>
                    <td>{entry.unit || ''}</td>
                    <td>{entry.writable === true ? '✓' : entry.writable === false ? '–' : ''}</td>
                    <td>
                        <input
                            aria-label={`Raum für ${entry.sourceId}`}
                            maxLength={MAX_ROOM_LENGTH}
                            value={this.state.room}
                            placeholder="z. B. Keller"
                            onChange={event => this.setState({ room: event.target.value })}
                            onBlur={() => this.handleTextBlur('room', MAX_ROOM_LENGTH)}
                        />
                        {fieldErrors.room ? <span role="alert">{fieldErrors.room}</span> : null}
                    </td>
                    <td>{statusLabelOf(entry)}</td>
                    <td>
                        <button aria-label={`${entry.sourceId} ${entry.ignored ? 'aktivieren' : 'ignorieren'}`} onClick={() => this.save({ ignored: !entry.ignored })}>
                            {entry.ignored ? 'Aktivieren' : 'Ignorieren'}
                        </button>
                        <button aria-label={`${entry.sourceId} entfernen`} onClick={() => this.props.onRemove()}>Entfernen</button>
                    </td>
                </tr>
                {expanded ? (
                    <tr>
                        <td colSpan={10}>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 8 }}>
                                <label>
                                    Update-Frequenz{' '}
                                    <select aria-label={`Update-Frequenz für ${entry.sourceId}`} value={entry.updateFrequency || ''} onChange={event => this.save({ updateFrequency: event.target.value })}>
                                        {UPDATE_FREQUENCIES.map(item => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                </label>
                                <label>
                                    Vollständigkeit{' '}
                                    <select aria-label={`Vollständigkeit für ${entry.sourceId}`} value={entry.dataCompleteness || ''} onChange={event => this.save({ dataCompleteness: event.target.value })}>
                                        {DATA_COMPLETENESS.map(item => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                </label>
                                <label>
                                    Energie-Rolle{' '}
                                    <select aria-label={`Energie-Rolle für ${entry.sourceId}`} value={effectiveRole} onChange={event => this.handleRoleChange(event.target.value)}>
                                        <option value="">keine</option>
                                        {DERIVED_METRIC_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </label>
                                {effectiveRole ? (
                                    <GroupIdPicker
                                        ariaLabel={`Energiebilanz-Gruppe für ${entry.sourceId}`}
                                        value={entry.derivedMetricGroupId}
                                        existingGroups={existingGroups}
                                        onChange={group => this.handleGroupChange(group)}
                                    />
                                ) : null}
                                {fieldErrors.derivedMetricRole ? <span role="alert">{fieldErrors.derivedMetricRole}</span> : null}
                                <label>
                                    HVAC-Rolle{' '}
                                    <select
                                        aria-label={`HVAC-Rolle für ${entry.sourceId}`}
                                        value={entry.hvacRole || ''}
                                        disabled={hvacDisabled}
                                        title={hvacDisabled ? 'Nur für Verhalten boolean_state verfügbar' : undefined}
                                        onChange={event => this.save({ hvacRole: event.target.value })}
                                    >
                                        <option value="">keine</option>
                                        {HVAC_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </label>
                                {fieldErrors.hvacRole ? <span role="alert">{fieldErrors.hvacRole}</span> : null}
                            </div>
                        </td>
                    </tr>
                ) : null}
            </>
        );
    }
}
```

- [ ] **Schritt 4:** `npx vitest run test/admin/deviceRow.test.jsx` → PASS.

---

## Task 5: `BulkEditToolbar.jsx` — Mehrfachauswahl-Aktionen

**Dateien:**
- Erstellen: `src-admin/src/CatalogDevices/BulkEditToolbar.jsx`
- Test: `test/admin/bulkEditToolbar.test.jsx`

**Konsumiert:** `GroupIdPicker` (Task 3).
**Produziert** (von Task 6 konsumiert): `<BulkEditToolbar count existingGroups onApplyField onIgnore onActivate onDelete />`. `onApplyField(fields)`, `onIgnore()`, `onActivate()`, `onDelete()` geben jeweils `Promise<{succeeded: number, failed: number}>` zurück.

- [ ] **Schritt 1: Rote Tests**

Neue Datei `test/admin/bulkEditToolbar.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkEditToolbar from '../../src-admin/src/CatalogDevices/BulkEditToolbar.jsx';

function renderToolbar(overrides = {}) {
    const props = {
        count: 3,
        existingGroups: ['pv-1'],
        onApplyField: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
        onIgnore: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
        onActivate: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
        onDelete: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
        ...overrides,
    };
    render(<BulkEditToolbar {...props} />);
    return props;
}

describe('BulkEditToolbar', () => {
    it('applies a chosen category value to the selection', async () => {
        const user = userEvent.setup();
        const props = renderToolbar();

        await user.selectOptions(screen.getByLabelText('Wert für Bulk-Kategorie'), 'device_usage');
        await user.click(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ }));

        expect(props.onApplyField).toHaveBeenCalledWith({ category: 'device_usage' });
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 gespeichert, 0 fehlgeschlagen.'));
    });

    it('requires both a role and a group before enabling apply for derivedMetricRole', async () => {
        const user = userEvent.setup();
        const props = renderToolbar();

        await user.selectOptions(screen.getByLabelText('Bulk-Feld'), 'derivedMetricRole');
        await user.selectOptions(screen.getByLabelText('Wert für Bulk-Energie-Rolle'), 'pv_generation');
        expect(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ })).toBeDisabled();

        await user.selectOptions(screen.getByLabelText('Wert für Bulk-Energiebilanz-Gruppe'), 'pv-1');
        expect(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ }));
        expect(props.onApplyField).toHaveBeenCalledWith({ derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' });
    });

    it('calls onIgnore/onActivate directly without a value', async () => {
        const user = userEvent.setup();
        const props = renderToolbar();

        await user.click(screen.getByRole('button', { name: 'Ignorieren' }));
        expect(props.onIgnore).toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Aktivieren' }));
        expect(props.onActivate).toHaveBeenCalled();
    });

    describe('delete confirmation', () => {
        beforeEach(() => {
            vi.spyOn(window, 'confirm');
        });
        afterEach(() => {
            window.confirm.mockRestore();
        });

        it('does not call onDelete when the confirm dialog is declined', async () => {
            window.confirm.mockReturnValue(false);
            const user = userEvent.setup();
            const props = renderToolbar();

            await user.click(screen.getByRole('button', { name: 'Löschen' }));

            expect(window.confirm).toHaveBeenCalledWith('3 ausgewählte Geräte wirklich entfernen?');
            expect(props.onDelete).not.toHaveBeenCalled();
        });

        it('calls onDelete when the confirm dialog is accepted', async () => {
            window.confirm.mockReturnValue(true);
            const user = userEvent.setup();
            const props = renderToolbar();

            await user.click(screen.getByRole('button', { name: 'Löschen' }));

            expect(props.onDelete).toHaveBeenCalled();
        });
    });

    it('reports partial failures after a bulk action', async () => {
        const user = userEvent.setup();
        renderToolbar({ onIgnore: vi.fn().mockResolvedValue({ succeeded: 2, failed: 1 }) });

        await user.click(screen.getByRole('button', { name: 'Ignorieren' }));

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 gespeichert, 1 fehlgeschlagen.'));
    });
});
```

- [ ] **Schritt 2:** `npx vitest run test/admin/bulkEditToolbar.test.jsx` → FAIL (Modul existiert nicht).

- [ ] **Schritt 3: Implementieren**

Neue Datei `src-admin/src/CatalogDevices/BulkEditToolbar.jsx`:

```jsx
import React from 'react';
import GroupIdPicker from './GroupIdPicker.jsx';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption'];
const HVAC_ROLES = ['window', 'heating'];
const UPDATE_FREQUENCIES = ['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven'];
const DATA_COMPLETENESS = ['unknown', 'complete', 'gaps', 'stale'];
const MAX_ROOM_LENGTH = 200;
const FIELD_OPTIONS = [
    { value: 'category', label: 'Kategorie' },
    { value: 'room', label: 'Raum' },
    { value: 'valueKind', label: 'Verhalten' },
    { value: 'updateFrequency', label: 'Update-Frequenz' },
    { value: 'dataCompleteness', label: 'Vollständigkeit' },
    { value: 'derivedMetricRole', label: 'Energie-Rolle' },
    { value: 'hvacRole', label: 'HVAC-Rolle' },
];

export default class BulkEditToolbar extends React.Component {
    constructor(props) {
        super(props);
        this.state = { field: 'category', value: '', groupId: '', status: '' };
    }

    async apply() {
        const { field, value, groupId } = this.state;
        const fields = field === 'derivedMetricRole' ? { derivedMetricRole: value, derivedMetricGroupId: groupId } : { [field]: value };
        const result = await this.props.onApplyField(fields);
        this.setState({ status: `${result.succeeded} gespeichert, ${result.failed} fehlgeschlagen.` });
    }

    async runAction(action, label) {
        const result = await action();
        this.setState({ status: `${label}: ${result.succeeded} gespeichert, ${result.failed} fehlgeschlagen.` });
    }

    async handleDelete() {
        if (!window.confirm(`${this.props.count} ausgewählte Geräte wirklich entfernen?`)) return;
        await this.runAction(() => this.props.onDelete(), 'Löschen');
    }

    renderValueInput() {
        const { field, value } = this.state;
        if (field === 'category') {
            return <select aria-label="Wert für Bulk-Kategorie" value={value} onChange={event => this.setState({ value: event.target.value })}>
                <option value="">-</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>;
        }
        if (field === 'valueKind') {
            return <select aria-label="Wert für Bulk-Verhalten" value={value} onChange={event => this.setState({ value: event.target.value })}>
                <option value="">-</option>{VALUE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>;
        }
        if (field === 'updateFrequency') {
            return <select aria-label="Wert für Bulk-Update-Frequenz" value={value} onChange={event => this.setState({ value: event.target.value })}>
                {UPDATE_FREQUENCIES.map(k => <option key={k} value={k}>{k}</option>)}
            </select>;
        }
        if (field === 'dataCompleteness') {
            return <select aria-label="Wert für Bulk-Vollständigkeit" value={value} onChange={event => this.setState({ value: event.target.value })}>
                {DATA_COMPLETENESS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>;
        }
        if (field === 'hvacRole') {
            return <select aria-label="Wert für Bulk-HVAC-Rolle" value={value} onChange={event => this.setState({ value: event.target.value })}>
                <option value="">keine</option>{HVAC_ROLES.map(k => <option key={k} value={k}>{k}</option>)}
            </select>;
        }
        if (field === 'derivedMetricRole') {
            return <>
                <select aria-label="Wert für Bulk-Energie-Rolle" value={value} onChange={event => this.setState({ value: event.target.value, groupId: '' })}>
                    <option value="">keine</option>{DERIVED_METRIC_ROLES.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                {value ? (
                    <GroupIdPicker
                        ariaLabel="Wert für Bulk-Energiebilanz-Gruppe"
                        value={this.state.groupId}
                        existingGroups={this.props.existingGroups}
                        onChange={groupId => this.setState({ groupId })}
                    />
                ) : null}
            </>;
        }
        return <input aria-label="Wert für Bulk-Raum" maxLength={MAX_ROOM_LENGTH} value={value} onChange={event => this.setState({ value: event.target.value })} />;
    }

    render() {
        const { count } = this.props;
        const canApply = this.state.field !== 'derivedMetricRole' || this.state.value === '' || Boolean(this.state.groupId);
        return (
            <div role="region" aria-label="Bulk-Aktionen">
                <span>{count} ausgewählt</span>
                <select aria-label="Bulk-Feld" value={this.state.field} onChange={event => this.setState({ field: event.target.value, value: '', groupId: '' })}>
                    {FIELD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {this.renderValueInput()}
                <button disabled={!canApply} onClick={() => this.apply()}>Auf {count} ausgewählte Geräte anwenden</button>
                <button onClick={() => this.runAction(() => this.props.onIgnore(), 'Ignorieren')}>Ignorieren</button>
                <button onClick={() => this.runAction(() => this.props.onActivate(), 'Aktivieren')}>Aktivieren</button>
                <button onClick={() => this.handleDelete()}>Löschen</button>
                {this.state.status ? <div role="status" aria-live="polite">{this.state.status}</div> : null}
            </div>
        );
    }
}
```

- [ ] **Schritt 4:** `npx vitest run test/admin/bulkEditToolbar.test.jsx` → PASS.

---

## Task 6: `CatalogDevicesComponent.jsx` — Orchestrierung neu aufbauen

**Dateien:**
- Erstellen: `src-admin/src/CatalogDevices/CatalogDevicesComponent.jsx`, `src-admin/src/csvHelpers.js`
- Ändern: `src-admin/src/Components.jsx` (CSV-Helfer aus der Datei entfernen und aus `csvHelpers.js` importieren, CatalogDevicesComponent-Klasse entfernen und aus neuem Ort importieren)
- Test: `test/admin/catalogDevicesComponent.test.jsx` (neu), `test/admin/csvHelpers.test.jsx` (bestehend, unverändert — prüft nur, dass die Re-Exports aus `Components.jsx` weiter funktionieren)

**Konsumiert:** `catalogTableUtils.js` (Task 2), `DeviceRow.jsx` (Task 4), `BulkEditToolbar.jsx` (Task 5). `csvHelpers.js` wird als Teil dieses Tasks neu angelegt (siehe Schritt 3) — eine frühere, eigenständige Extraktion würde die noch nicht entfernte alte `CatalogDevicesComponent`-Klasse in `Components.jsx` zwischenzeitlich mit undefinierten Referenzen (`CATEGORIES`, `CSV_COLUMNS`, …) zurücklassen, da diese Klasse dieselben, dann verschobenen Konstanten nutzt. Beide Änderungen laufen deshalb in einem Schritt.

- [ ] **Schritt 1: Rote Tests**

Neue Datei `test/admin/catalogDevicesComponent.test.jsx` — mit einem minimalen Fake für die State-Bridge (Socket `setState`/`getState`, wie von `callAdapterNow` erwartet):

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CatalogDevicesComponent from '../../src-admin/src/CatalogDevices/CatalogDevicesComponent.jsx';

function makeFakeSocket(responders) {
    let lastRequest = null;
    return {
        setState: vi.fn(async (_id, { val }) => {
            lastRequest = JSON.parse(val);
        }),
        getState: vi.fn(async () => {
            const responder = responders[lastRequest.command];
            const result = typeof responder === 'function' ? responder(lastRequest.message) : responder;
            return { ack: true, val: JSON.stringify({ id: lastRequest.id, ok: true, result }) };
        }),
    };
}

function baseOContext(socket) {
    return { hostInfo: {}, themeType: 'light', adapterName: 'ai-analytics', instance: 0, socket };
}

const ENTRIES = [
    { sourceId: 'javascript.0.b', description: 'Bravo', category: 'lighting', valueKind: 'boolean_state', room: 'Keller' },
    { sourceId: 'javascript.0.a', description: 'Alpha', category: 'consumption', valueKind: 'gauge', room: 'Wohnzimmer' },
];

describe('CatalogDevicesComponent', () => {
    it('loads and renders entries sorted by load order, then re-sorts on header click', async () => {
        const user = userEvent.setup();
        const socket = makeFakeSocket({ listCatalogEntries: () => ({ entries: ENTRIES }) });
        render(<CatalogDevicesComponent schema={{}} data={{}} attr="catalogDevices" onChange={() => {}} onError={() => {}} oContext={baseOContext(socket)} />);

        await waitFor(() => expect(screen.getByText('javascript.0.b')).toBeTruthy());
        const rowsBefore = screen.getAllByRole('row').slice(1).map(row => row.textContent);
        expect(rowsBefore[0]).toContain('javascript.0.b');

        await user.click(screen.getByLabelText('Nach Objekt-ID sortieren'));
        const rowsAfter = screen.getAllByRole('row').slice(1).map(row => row.textContent);
        expect(rowsAfter[0]).toContain('javascript.0.a');
    });

    it('saves a single field change immediately and reloads entries', async () => {
        const user = userEvent.setup();
        const updateSpy = vi.fn(() => ({ entry: { ...ENTRIES[1], category: 'device_usage' } }));
        const socket = makeFakeSocket({
            listCatalogEntries: () => ({ entries: ENTRIES }),
            updateCatalogEntryAdmin: updateSpy,
        });
        render(<CatalogDevicesComponent schema={{}} data={{}} attr="catalogDevices" onChange={() => {}} onError={() => {}} oContext={baseOContext(socket)} />);

        await waitFor(() => expect(screen.getByText('javascript.0.a')).toBeTruthy());
        await user.selectOptions(screen.getByLabelText('Kategorie für javascript.0.a'), 'device_usage');

        await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ sourceId: 'javascript.0.a', category: 'device_usage' }));
    });

    it('shows the bulk toolbar once a row is selected and applies a bulk value', async () => {
        const user = userEvent.setup();
        const updateSpy = vi.fn(() => ({ entry: {} }));
        const socket = makeFakeSocket({
            listCatalogEntries: () => ({ entries: ENTRIES }),
            updateCatalogEntryAdmin: updateSpy,
        });
        render(<CatalogDevicesComponent schema={{}} data={{}} attr="catalogDevices" onChange={() => {}} onError={() => {}} oContext={baseOContext(socket)} />);

        await waitFor(() => expect(screen.getByText('javascript.0.a')).toBeTruthy());
        expect(screen.queryByRole('region', { name: 'Bulk-Aktionen' })).toBeNull();

        await user.click(screen.getByLabelText('javascript.0.a auswählen'));
        expect(screen.getByRole('region', { name: 'Bulk-Aktionen' })).toBeTruthy();

        await user.selectOptions(screen.getByLabelText('Wert für Bulk-Kategorie'), 'lighting');
        await user.click(screen.getByRole('button', { name: /Auf 1 ausgewählte Geräte anwenden/ }));

        await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ sourceId: 'javascript.0.a', category: 'lighting' }));
    });
});
```

- [ ] **Schritt 2:** `npx vitest run test/admin/catalogDevicesComponent.test.jsx` → FAIL (Modul existiert nicht).

- [ ] **Schritt 3: `csvHelpers.js` anlegen**

`CatalogDevicesComponent.jsx` braucht `parseCsv`/`csvEscape`/etc. Diese liegen heute als Funktionen direkt in `Components.jsx`. Ein Reimport aus `Components.jsx` zurück in `CatalogDevices/CatalogDevicesComponent.jsx` würde einen zirkulären Import erzeugen (`Components.jsx` importiert `CatalogDevicesComponent.jsx`, das wiederum aus `Components.jsx` importieren müsste) — eine gemeinsame, abhängigkeitsfreie Datei löst das. `validateSettingImportValue` bleibt unverändert in `Components.jsx` (settings-spezifisch, nutzt dortige `PROVIDER_TYPES`/`SETTINGS_*`-Konstanten, nicht Teil dieser Verschiebung).

Neue Datei `src-admin/src/csvHelpers.js` — Inhalt 1:1 aus `Components.jsx` verschoben (`CATEGORIES`, `VALUE_KINDS`, `DERIVED_METRIC_ROLES`, `HVAC_ROLES`, `UPDATE_FREQUENCIES`, `DATA_COMPLETENESS`, die CSV-Limit-Konstanten, `spreadsheetSafe`, `csvEscape`, `parseCsv`, `normalizeHeader`, `validateFile`, `parseBoolean`, `validateCatalogImportValue`):

```js
'use strict';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption'];
const HVAC_ROLES = ['window', 'heating'];
const UPDATE_FREQUENCIES = ['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven'];
const DATA_COMPLETENESS = ['unknown', 'complete', 'gaps', 'stale'];
const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CSV_ROWS = 10000;
const MAX_CSV_FIELD_LENGTH = 4096;
export const MAX_SOURCE_ID_LENGTH = 512;
const MAX_ROOM_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

function spreadsheetSafe(value) {
    const str = value === null || value === undefined ? '' : String(value);
    return /^[\t\r\n ]*[=+\-@]/.test(str) ? `'${str}` : str;
}

export function csvEscape(value) {
    const str = spreadsheetSafe(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields with embedded commas/quotes/newlines. */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let quoteClosed = false;

    const append = char => {
        field += char;
        if (field.length > MAX_CSV_FIELD_LENGTH) throw new Error(`CSV-Feld überschreitet ${MAX_CSV_FIELD_LENGTH} Zeichen.`);
    };
    const pushRow = () => {
        row.push(field);
        rows.push(row);
        if (rows.length > MAX_CSV_ROWS) throw new Error(`CSV-Datei überschreitet ${MAX_CSV_ROWS} Zeilen.`);
        row = [];
        field = '';
        quoteClosed = false;
    };

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    append('"');
                    i++;
                } else {
                    inQuotes = false;
                    quoteClosed = true;
                }
            } else {
                append(char);
            }
        } else if (quoteClosed && char !== ',' && char !== '\n' && char !== '\r') {
            throw new Error('Ungültige Zeichen nach einem geschlossenen CSV-Feld.');
        } else if (char === '"') {
            if (field.length > 0) throw new Error('Anführungszeichen sind nur am Feldanfang erlaubt.');
            inQuotes = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
            quoteClosed = false;
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            pushRow();
        } else {
            append(char);
        }
    }
    if (inQuotes) throw new Error('CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.');
    if (field.length > 0 || row.length > 0 || quoteClosed) {
        pushRow();
    }
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

export function normalizeHeader(row) {
    const header = row.map(value => value.replace(/^﻿/, '').trim());
    if (new Set(header).size !== header.length) throw new Error('CSV-Header enthält doppelte Spalten.');
    return header;
}

export function validateFile(file) {
    if (file.size > MAX_CSV_FILE_BYTES) throw new Error(`CSV-Datei darf maximal ${MAX_CSV_FILE_BYTES / 1024 / 1024} MB groß sein.`);
}

export function parseBoolean(value, field) {
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'true' && normalized !== 'false') throw new Error(`${field} muss true oder false sein.`);
    return normalized === 'true';
}

export function validateCatalogImportValue(field, value) {
    if (value.length > MAX_CSV_FIELD_LENGTH) throw new Error(`${field} ist zu lang.`);
    if (field === 'description' && value.length > MAX_DESCRIPTION_LENGTH) throw new Error(`description darf maximal ${MAX_DESCRIPTION_LENGTH} Zeichen enthalten.`);
    if (field === 'room' && value.length > MAX_ROOM_LENGTH) throw new Error(`room darf maximal ${MAX_ROOM_LENGTH} Zeichen enthalten.`);
    if (field === 'category' && !CATEGORIES.includes(value)) throw new Error(`Ungültige category: ${value}`);
    if (field === 'valueKind' && !VALUE_KINDS.includes(value)) throw new Error(`Ungültiger valueKind: ${value}`);
    if (field === 'derivedMetricRole' && !DERIVED_METRIC_ROLES.includes(value)) throw new Error(`Ungültige derivedMetricRole: ${value}`);
    if (field === 'hvacRole' && !HVAC_ROLES.includes(value)) throw new Error(`Ungültige hvacRole: ${value}`);
    if (field === 'updateFrequency' && !UPDATE_FREQUENCIES.includes(value)) throw new Error(`Ungültige updateFrequency: ${value}`);
    if (field === 'dataCompleteness' && !DATA_COMPLETENESS.includes(value)) throw new Error(`Ungültige dataCompleteness: ${value}`);
    return field === 'ignored' ? parseBoolean(value, field) : value;
}
```

- [ ] **Schritt 4: `CatalogDevicesComponent.jsx` implementieren**

Neue Datei `src-admin/src/CatalogDevices/CatalogDevicesComponent.jsx`:

```jsx
import React from 'react';
import { ConfigGeneric } from '@iobroker/json-config';
import DeviceRow from './DeviceRow.jsx';
import BulkEditToolbar from './BulkEditToolbar.jsx';
import { filterEntries, sortEntries, nextSortState } from './catalogTableUtils.js';
import { csvEscape, parseCsv, normalizeHeader, validateFile, validateCatalogImportValue, MAX_SOURCE_ID_LENGTH } from '../csvHelpers.js';

const CSV_COLUMNS = ['sourceId', 'description', 'category', 'valueKind', 'unit', 'room', 'ignored', 'active', 'needsReview', 'writable', 'writePattern', 'updateFrequency', 'dataCompleteness', 'derivedMetricRole', 'derivedMetricGroupId', 'hvacRole'];
const CSV_EDITABLE_COLUMNS = ['description', 'category', 'room', 'valueKind', 'ignored', 'updateFrequency', 'dataCompleteness', 'derivedMetricRole', 'derivedMetricGroupId', 'hvacRole'];

export default class CatalogDevicesComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = { ...this.state, entries: [], filter: '', loading: true, status: '', progress: null, selected: [], expandedRows: new Set(), sort: null };
        this.fileInputRef = React.createRef();
        this.progressTimer = null;
        this.loadGeneration = 0;
        this.unmounted = false;
        this.bridgeQueue = Promise.resolve();
    }

    async componentDidMount() {
        super.componentDidMount();
        await this.loadEntries();
    }

    componentWillUnmount() {
        this.unmounted = true;
        if (this.progressTimer) clearInterval(this.progressTimer);
        if (super.componentWillUnmount) super.componentWillUnmount();
    }

    callAdapter(command, message = {}) {
        const run = this.bridgeQueue.then(() => this.callAdapterNow(command, message));
        this.bridgeQueue = run.catch(() => {});
        return run;
    }

    async callAdapterNow(command, message) {
        const socket = this.props.socket || this.props.oContext.socket;
        const instance = `ai-analytics.${this.props.oContext.instance}`;
        const requestId = `component-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await socket.setState(`${instance}.admin.bridge`, {
            val: JSON.stringify({ id: requestId, command, message }),
            ack: false,
        });
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
            if (this.unmounted) throw new Error('Komponente wurde geschlossen.');
            const state = await socket.getState(`${instance}.admin.bridge`);
            if (state && state.ack === true && typeof state.val === 'string') {
                const response = JSON.parse(state.val);
                if (response.id === requestId) {
                    if (!response.ok) throw new Error(response.error || 'Unbekannter Fehler');
                    return response.result;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 400));
        }
        throw new Error(`Keine Antwort auf '${command}' über die State-Bridge`);
    }

    async loadEntries() {
        const generation = ++this.loadGeneration;
        this.setState({ loading: true });
        try {
            const response = await this.callAdapter('listCatalogEntries');
            if (response && response.error) throw new Error(response.error);
            if (this.unmounted || generation !== this.loadGeneration) return;
            const entries = (response && response.entries) || [];
            const ids = new Set(entries.map(entry => entry.sourceId));
            this.setState(state => ({
                entries,
                loading: false,
                selected: state.selected.filter(id => ids.has(id)),
            }));
        } catch (error) {
            if (!this.unmounted && generation === this.loadGeneration) this.setState({ loading: false, status: `Fehler: ${error.message || error}` });
        }
    }

    async handleRowFieldChange(sourceId, fields) {
        try {
            const response = await this.callAdapter('updateCatalogEntryAdmin', { sourceId, ...fields });
            if (response && response.error) return { error: response.error };
            await this.loadEntries();
            return {};
        } catch (error) {
            return { error: error.message || String(error) };
        }
    }

    async applyToSelected(fields) {
        const selected = this.state.selected;
        let succeeded = 0;
        const failedIds = [];
        for (const sourceId of selected) {
            try {
                const response = await this.callAdapter('updateCatalogEntryAdmin', { sourceId, ...fields });
                if (response && response.error) throw new Error(response.error);
                succeeded += 1;
            } catch (_error) {
                failedIds.push(sourceId);
            }
        }
        this.setState({ selected: failedIds });
        await this.loadEntries();
        return { succeeded, failed: failedIds.length };
    }

    async deleteSelected() {
        const selected = this.state.selected;
        let succeeded = 0;
        const failedIds = [];
        for (const sourceId of selected) {
            try {
                const response = await this.callAdapter('removeCatalogEntry', { sourceId });
                if (response && response.error) throw new Error(response.error);
                succeeded += 1;
            } catch (_error) {
                failedIds.push(sourceId);
            }
        }
        this.setState({ selected: failedIds });
        await this.loadEntries();
        return { succeeded, failed: failedIds.length };
    }

    async removeEntry(entry) {
        if (!window.confirm(`Katalogeintrag "${entry.sourceId}" wirklich entfernen?`)) return;
        try {
            const response = await this.callAdapter('removeCatalogEntry', { sourceId: entry.sourceId });
            if (response && response.error) throw new Error(response.error);
            this.setState(state => ({
                selected: state.selected.filter(id => id !== entry.sourceId),
                status: `${entry.sourceId} entfernt.`,
            }));
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    toggleSelected(sourceId) {
        this.setState(state => ({ selected: state.selected.includes(sourceId) ? state.selected.filter(id => id !== sourceId) : [...state.selected, sourceId] }));
    }

    toggleExpanded(sourceId) {
        this.setState(state => {
            const expandedRows = new Set(state.expandedRows);
            if (expandedRows.has(sourceId)) expandedRows.delete(sourceId);
            else expandedRows.add(sourceId);
            return { expandedRows };
        });
    }

    getExistingGroups() {
        return Array.from(new Set(this.state.entries.map(entry => entry.derivedMetricGroupId).filter(Boolean))).sort();
    }

    async runCommand(command, runningText, successText) {
        const backgroundCommand = command === 'runProactiveCheckNow';
        this.setState({ status: runningText, progress: null });
        this.startProgressPolling();
        try {
            const response = await this.callAdapter(command);
            if (response && response.error) throw new Error(response.error);
            if (response && response.triggered === false) {
                this.stopProgressPolling();
                this.setState({ status: `Fehler: ${response.reason || 'Prüfung konnte nicht gestartet werden.'}`, progress: null });
                return;
            }
            this.setState({ status: successText });
            await this.loadEntries();
        } catch (error) {
            this.stopProgressPolling();
            this.setState({ status: `Fehler: ${error.message || error}`, progress: null });
        } finally {
            if (!backgroundCommand) this.stopProgressPolling();
        }
    }

    stopProgressPolling() {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
    }

    startProgressPolling() {
        this.stopProgressPolling();
        let observedRunning = false;
        const deadline = Date.now() + 10 * 60 * 1000;
        const readProgress = async () => {
            try {
                if (Date.now() >= deadline) {
                    this.stopProgressPolling();
                    if (!this.unmounted) this.setState({ status: 'Fortschrittsanzeige wegen Zeitüberschreitung beendet.', progress: null });
                    return;
                }
                const state = await this.props.oContext.socket.getState(`ai-analytics.${this.props.oContext.instance}.catalogSync`);
                if (this.unmounted) return;
                if (!state || !state.val) return;
                const progress = typeof state.val === 'string' ? JSON.parse(state.val) : state.val;
                this.setState({ progress });
                if (progress.running === true) observedRunning = true;
                if (observedRunning && progress.running === false && this.progressTimer) {
                    this.stopProgressPolling();
                }
            } catch (_error) {
                // The command result remains usable when an older Admin does not expose getState here.
            }
        };
        readProgress();
        this.progressTimer = setInterval(readProgress, 500);
    }

    exportCsv() {
        const lines = [CSV_COLUMNS.join(',')];
        this.state.entries.forEach(entry => {
            lines.push(CSV_COLUMNS.map(key => csvEscape(entry[key])).join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ai-analytics-katalog-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    triggerCsvImport() {
        if (this.fileInputRef.current) {
            this.fileInputRef.current.value = '';
            this.fileInputRef.current.click();
        }
    }

    async handleCsvFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        try {
            validateFile(file);
            const text = await file.text();
            const rows = parseCsv(text);
            if (!rows.length) {
                this.setState({ status: 'Fehler: CSV-Datei ist leer.' });
                return;
            }

            const header = normalizeHeader(rows[0]);
            const sourceIdIndex = header.indexOf('sourceId');
            if (sourceIdIndex === -1) {
                this.setState({ status: 'Fehler: CSV-Header enthaelt keine sourceId-Spalte.' });
                return;
            }
            const fieldIndexes = CSV_EDITABLE_COLUMNS.map(field => ({ field, index: header.indexOf(field) })).filter(
                entry => entry.index !== -1
            );

            const dataRows = rows.slice(1);
            let updatedCount = 0;
            let errorCount = 0;
            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                const sourceId = row[sourceIdIndex];
                if (!sourceId) continue;
                if (sourceId.length > MAX_SOURCE_ID_LENGTH) {
                    errorCount++;
                    continue;
                }

                this.setState({ status: `CSV-Import laeuft (${i + 1}/${dataRows.length}) ...` });
                try {
                    const values = {};
                    fieldIndexes.forEach(({ field, index }) => {
                        if (row[index] === undefined || row[index] === '') return;
                        values[field] = validateCatalogImportValue(field, row[index]);
                    });
                    const response = await this.callAdapter('updateCatalogEntryAdmin', { sourceId, ...values });
                    if (response && response.error) throw new Error(response.error);
                    updatedCount++;
                } catch (_error) {
                    errorCount++;
                }
            }

            this.setState({
                status:
                    errorCount > 0
                        ? `CSV-Import abgeschlossen: ${updatedCount} aktualisiert, ${errorCount} fehlgeschlagen.`
                        : `CSV-Import abgeschlossen: ${updatedCount} Eintraege aktualisiert.`,
            });
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    renderSortHeader(key, label) {
        const { sort } = this.state;
        const active = sort && sort.key === key;
        const indicator = active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
        return (
            <th key={key}>
                <button aria-label={`Nach ${label} sortieren`} onClick={() => this.setState({ sort: nextSortState(sort, key) })}>
                    {label}{indicator}
                </button>
            </th>
        );
    }

    renderItem() {
        const filtered = filterEntries(this.state.entries, this.state.filter);
        const entries = sortEntries(filtered, this.state.sort);
        const existingGroups = this.getExistingGroups();

        return (
            <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <button onClick={() => this.runCommand('runDiscoveryNow', 'Re-Scan läuft ...', 'Re-Scan abgeschlossen.')}>Geräte neu einlesen</button>
                    <button onClick={() => this.runCommand('runDiscoveryOnly', 'Sync läuft ...', 'Sync abgeschlossen.')}>Nur Updates einlesen</button>
                    <button onClick={() => this.runCommand('runProactiveCheckNow', 'Prüfung läuft ...', 'Prüfung gestartet.')}>Prüfung jetzt ausführen</button>
                    <button onClick={() => this.setState({ selected: entries.map(entry => entry.sourceId) })}>Alle auswählen</button>
                    <button onClick={() => this.setState({ selected: [] })}>Auswahl aufheben</button>
                    <button onClick={() => this.exportCsv()}>Als CSV exportieren</button>
                    <button onClick={() => this.triggerCsvImport()}>CSV importieren</button>
                    <input
                        ref={this.fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        style={{ display: 'none' }}
                        onChange={event => this.handleCsvFileSelected(event)}
                    />
                    <input aria-label="Katalog filtern" placeholder="Filtern ..." value={this.state.filter} onChange={event => this.setState({ filter: event.target.value })} />
                </div>
                {this.state.status ? <div role="status" aria-live="polite" style={{ marginBottom: 8 }}>{this.state.status}</div> : null}
                {this.state.progress && this.state.progress.running ? <div style={{ marginBottom: 8 }}>
                    {this.state.progress.message || 'Verarbeitung läuft ...'}
                    <progress max="100" value={this.state.progress.total ? Math.round((this.state.progress.processed / this.state.progress.total) * 100) : 0} style={{ width: '100%' }} />
                    <span>{this.state.progress.total ? Math.round((this.state.progress.processed / this.state.progress.total) * 100) : 0}%</span>
                </div> : null}
                <div style={{ marginBottom: 8, fontSize: 12 }}>Verhalten: <b>Gauge</b> = kontinuierlicher Messwert, z. B. Temperatur. Update-Frequenz, Vollständigkeit sowie Energie-/HVAC-Rolle stehen im aufklappbaren Detail-Panel jeder Zeile (▸). Räume sind freie Eingaben.</div>
                {this.state.selected.length > 0 ? (
                    <BulkEditToolbar
                        count={this.state.selected.length}
                        existingGroups={existingGroups}
                        onApplyField={fields => this.applyToSelected(fields)}
                        onIgnore={() => this.applyToSelected({ ignored: true })}
                        onActivate={() => this.applyToSelected({ ignored: false })}
                        onDelete={() => this.deleteSelected()}
                    />
                ) : null}
                {this.state.loading ? <div>Geräte werden geladen ...</div> : <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th>Auswahl</th>
                                {this.renderSortHeader('sourceId', 'Objekt-ID')}
                                {this.renderSortHeader('description', 'Beschreibung')}
                                {this.renderSortHeader('category', 'Kategorie')}
                                {this.renderSortHeader('valueKind', 'Verhalten')}
                                <th>Einheit</th>
                                <th>Schreibbar</th>
                                {this.renderSortHeader('room', 'Raum')}
                                {this.renderSortHeader('status', 'Status')}
                                <th>Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>{entries.map(entry => (
                            <DeviceRow
                                key={entry.sourceId}
                                entry={entry}
                                selected={this.state.selected.includes(entry.sourceId)}
                                expanded={this.state.expandedRows.has(entry.sourceId)}
                                existingGroups={existingGroups}
                                onToggleSelected={() => this.toggleSelected(entry.sourceId)}
                                onToggleExpanded={() => this.toggleExpanded(entry.sourceId)}
                                onFieldChange={fields => this.handleRowFieldChange(entry.sourceId, fields)}
                                onRemove={() => this.removeEntry(entry)}
                            />
                        ))}</tbody>
                    </table>
                </div>}
            </div>
        );
    }
}
```

- [ ] **Schritt 5:** `npx vitest run test/admin/catalogDevicesComponent.test.jsx` → PASS.

- [ ] **Schritt 6: `Components.jsx` umstellen (CSV-Helfer + alte Klasse in einem Schritt)**

Beide Änderungen laufen atomar in dieser einen Bearbeitung von `Components.jsx`, damit die Datei nie einen Zwischenzustand mit undefinierten Referenzen durchläuft:

1. Den kompletten Block von `const CATEGORIES = [...]` (Zeile 4 im heutigen Stand) bis zum Ende von `validateCatalogImportValue` (vor `export function validateSettingImportValue`) entfernen.
2. Am Dateianfang (nach dem `ConfigGeneric`-Import) importieren:

```js
import CatalogDevicesComponent from './CatalogDevices/CatalogDevicesComponent.jsx';
import {
    csvEscape,
    parseCsv,
    normalizeHeader,
    validateFile,
    parseBoolean,
    validateCatalogImportValue,
} from './csvHelpers.js';

export { csvEscape, parseCsv, normalizeHeader, validateFile, parseBoolean, validateCatalogImportValue };
```

3. Direkt vor `validateSettingImportValue` eine lokale Konstante ergänzen, da diese Funktion `MAX_CSV_FIELD_LENGTH` braucht und die Konstante mit Schritt 1 aus der Datei verschwindet:

```js
const MAX_CSV_FIELD_LENGTH = 4096;
```

4. Die komplette `export default class CatalogDevicesComponent extends ConfigGeneric { ... }`-Definition (den gesamten Klassenblock inkl. `renderRow`, `renderItem`, State-Handling, sowie die dortigen `CSV_COLUMNS`/`CSV_EDITABLE_COLUMNS`-Konstanten) entfernen — sie leben jetzt vollständig in `CatalogDevicesComponent.jsx`.
5. Am Dateiende (oder direkt nach den verbleibenden Komponenten) `export default CatalogDevicesComponent;` ergänzen.

- [ ] **Schritt 7:** `npx vitest run test/admin/csvHelpers.test.jsx` → PASS (bestehender Test unverändert, da die öffentliche Schnittstelle von `Components.jsx` identisch bleibt).

- [ ] **Schritt 8:** `npm run test:admin` → PASS (alle Suiten: `catalogTableUtils`, `groupIdPicker`, `deviceRow`, `bulkEditToolbar`, `catalogDevicesComponent`, `csvHelpers`, `providerSelectComponent`).

- [ ] **Schritt 9:** `npm test` → PASS (vollständige Suite, inkl. `test:unit`).

- [ ] **Schritt 10:** `npm run lint` → PASS.

- [ ] **Schritt 11:** `npm run build:admin` → PASS (Admin-Bundle baut ohne Fehler; Modul-Federation-Export bleibt `Components.js`'s Default-Export unverändert, da nur `Components.jsx` intern umgebaut wurde).

---

## Task 7: Live-Abnahme, Dokumentation, Worklog

**Dateien:**
- Ändern: `docs/architecture/11-risiken-und-schulden.md`
- Ändern: `docs/architecture/05-bausteinsicht.md`
- Ändern: `WORKLOG.md`

- [ ] **Schritt 1: Manuelle Live-Abnahme**

An einer laufenden ioBroker-Admin-Instanz mit installiertem `ai-analytics`-Adapter (Build aus Task 6 Schritt 11 zuvor deployt bzw. `npm run build:admin` im Adapterverzeichnis ausgeführt), Geräte-Tab hart neu laden und prüfen:
1. Sortierung je Spalte: erster Klick aufsteigend, zweiter absteigend, dritter zurückgesetzt (Objekt-ID, Beschreibung, Kategorie, Verhalten, Raum, Status).
2. Detail-Panel öffnen/schließen (▸/▾), Update-Frequenz und Vollständigkeit dort ändern, Seite neu laden — Änderung bleibt bestehen (kein Datenverlust ohne Checkbox).
3. Neue Energiebilanz-Gruppe über den `GroupIdPicker` anlegen ("Neue Gruppe …"), danach bei einem zweiten Gerät dieselbe Gruppe aus der Liste auswählen.
4. HVAC-Rolle bei einem `boolean_state`-Objekt setzen; bei einem Gauge-Objekt ist das Dropdown deaktiviert.
5. Energie-Rolle über "keine" zurücksetzen, danach erneut eine Rolle vergeben — funktioniert wiederholt.
6. Mehrere Geräte per Checkbox auswählen, Bulk-Panel erscheint; Kategorie für alle setzen, danach Ignorieren/Aktivieren/Löschen für die Auswahl testen (inkl. Abbrechen des Lösch-Dialogs).
7. CSV-Export und -Import unverändert funktionsfähig (Format identisch zu vorher).

- [ ] **Schritt 2: `11-risiken-und-schulden.md` aktualisieren**

Zwei neue gelöste Punkte ergänzen (Formatierung analog zu bestehenden `~~...~~ — gelöst (...)`-Einträgen in der Datei):

```markdown
- ~~Analyse-Rollenfelder (Energie-/HVAC-Korrelation) nur per CSV setzbar~~ — **gelöst (2026-09-05):** `derivedMetricRole`/`derivedMetricGroupId`/`hvacRole` sind jetzt im aufklappbaren Detail-Panel jeder Gerätezeile direkt editierbar (inkl. Zurücksetzen auf "keine"), nicht mehr nur per CSV-Roundtrip. Siehe [Spec](../specs/2026-09-05-geraeteliste-redesign.md).
- ~~Checkbox/Speichern-Modell der Geräteliste war irreführend~~ — **gelöst (2026-09-05):** Checkboxen dienen jetzt ausschließlich der neuen Bulk-Toolbar; jede Einzel-Feldänderung speichert sofort (Dropdowns per `onChange`, Textfelder per `onBlur`). Siehe [Spec](../specs/2026-09-05-geraeteliste-redesign.md).
```

- [ ] **Schritt 3: `05-bausteinsicht.md` aktualisieren**

Im Abschnitt zu `src-admin/`/Geräte-Ansicht ergänzen, dass `CatalogDevicesComponent` jetzt in `src-admin/src/CatalogDevices/` liegt (`CatalogDevicesComponent.jsx`, `DeviceRow.jsx`, `BulkEditToolbar.jsx`, `GroupIdPicker.jsx`, `catalogTableUtils.js`) statt als Einzelklasse in `Components.jsx`, und dass CSV-Helferfunktionen in `src-admin/src/csvHelpers.js` liegen.

- [ ] **Schritt 4: `WORKLOG.md` aktualisieren**

`WIP` auf den Abschluss dieses Themas setzen, unter `DONE` einen Eintrag analog zu den bestehenden Einträgen ergänzen (Kurzfassung: Geräteliste neu strukturiert — Sofort-Speichern, aufklappbares Detail-Panel für Analyse-Rollen inkl. Lösch-Sentinel, Sortierung, Bulk-Edit-Toolbar; Referenz auf Spec/Plan).
