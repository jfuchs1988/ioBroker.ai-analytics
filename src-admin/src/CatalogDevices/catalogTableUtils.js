'use strict';

export function statusLabel(entry) {
    if (entry.ignored) return 'ignoriert';
    if (entry.active === false) return 'inaktiv';
    if (entry.needsReview) return 'Prüfung nötig';
    return 'aktiv';
}

export function filterEntries(entries, query, { includeIgnored = true } = {}) {
    const q = (query || '').trim().toLowerCase();
    const visibleEntries = includeIgnored ? entries : entries.filter(entry => !entry.ignored);
    if (!q) return visibleEntries;
    return visibleEntries.filter(entry =>
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
