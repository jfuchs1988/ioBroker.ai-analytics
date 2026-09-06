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
        expect(sortEntries(withStatus, { key: 'status', direction: 'asc' }).map(e => e.sourceId)).to.deep.equal(['z', 'x', 'y']);
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
