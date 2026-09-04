// lib/hvacCorrelation.js
'use strict';

const { getHistory } = require('./dataAccess');
const { resolvePeriod } = require('./periodValue');

const OVERLAP_THRESHOLD_MS = 15 * 60 * 1000;

function computeOverlapMs(pointsA, pointsB, periodStart, periodEnd) {
    const events = [];
    for (const point of pointsA || []) events.push({ ts: point.ts, stream: 'a', val: !!point.val });
    for (const point of pointsB || []) events.push({ ts: point.ts, stream: 'b', val: !!point.val });
    events.sort((x, y) => x.ts - y.ts);

    let aVal = false;
    let bVal = false;
    let lastTs = periodStart;
    let overlapMs = 0;
    for (const event of events) {
        if (aVal && bVal) overlapMs += event.ts - lastTs;
        lastTs = event.ts;
        if (event.stream === 'a') aVal = event.val;
        else bVal = event.val;
    }
    if (aVal && bVal) overlapMs += periodEnd - lastTs;
    return overlapMs;
}

function isHvacCandidate(entry) {
    return Boolean(entry && entry.active !== false && !entry.ignored && entry.valueKind === 'boolean_state' && entry.room && entry.hvacRole);
}

function groupByRoom(entries) {
    const rooms = new Map();
    for (const entry of entries.filter(isHvacCandidate)) {
        if (!rooms.has(entry.room)) rooms.set(entry.room, []);
        rooms.get(entry.room).push(entry);
    }
    return rooms;
}

async function findHvacCorrelationCandidates(adapter, entries, now = Date.now()) {
    const rooms = groupByRoom(entries || []);
    const candidates = [];
    let failedCount = 0;

    for (const [room, roomEntries] of rooms) {
        const windows = roomEntries.filter((entry) => entry.hvacRole === 'window');
        const heatings = roomEntries.filter((entry) => entry.hvacRole === 'heating');
        if (windows.length !== 1 || heatings.length !== 1) continue;
        const [windowEntry] = windows;
        const [heatingEntry] = heatings;

        try {
            const period = resolvePeriod({ dayOffset: -1 }, now);
            const [windowPoints, heatingPoints] = await Promise.all([
                getHistory(adapter, windowEntry.historyInstance, windowEntry.sourceId, period.start, period.end, 'onchange'),
                getHistory(adapter, heatingEntry.historyInstance, heatingEntry.sourceId, period.start, period.end, 'onchange'),
            ]);
            const overlapMs = computeOverlapMs(windowPoints, heatingPoints, period.start, period.end);
            if (overlapMs >= OVERLAP_THRESHOLD_MS) {
                candidates.push({
                    room,
                    reason: 'window_open_while_heating',
                    windowSourceId: windowEntry.sourceId,
                    windowDescription: windowEntry.description,
                    heatingSourceId: heatingEntry.sourceId,
                    heatingDescription: heatingEntry.description,
                    overlapMs,
                    periodStart: period.start,
                    periodEnd: period.end,
                });
            }
        } catch (error) {
            failedCount++;
            if (adapter.log && adapter.log.warn) {
                adapter.log.warn(`HVAC-Korrelation fuer Raum '${room}' fehlgeschlagen: ${error.message}`);
            }
        }
    }

    return { candidates, failedCount };
}

module.exports = { computeOverlapMs, findHvacCorrelationCandidates };
