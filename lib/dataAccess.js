'use strict';

async function getHistory(adapter, historyInstance, sourceId, start, end, aggregate = 'average') {
    const response = await adapter.sendToAsync(historyInstance, 'getHistory', {
        id: sourceId,
        options: { start, end, aggregate },
    });

    if (!response || !Array.isArray(response.result)) {
        throw new Error(`No history data returned for ${sourceId} from ${historyInstance}`);
    }

    return response.result;
}

async function compareTimeframes(adapter, historyInstance, sourceId, periodA, periodB, aggregate = 'average') {
    const [dataA, dataB] = await Promise.all([
        getHistory(adapter, historyInstance, sourceId, periodA.start, periodA.end, aggregate),
        getHistory(adapter, historyInstance, sourceId, periodB.start, periodB.end, aggregate),
    ]);

    const sum = (points) => points.reduce((total, point) => total + (point.val || 0), 0);
    const avg = (points) => (points.length ? sum(points) / points.length : 0);

    return {
        periodA: { start: periodA.start, end: periodA.end, sum: sum(dataA), avg: avg(dataA), count: dataA.length },
        periodB: { start: periodB.start, end: periodB.end, sum: sum(dataB), avg: avg(dataB), count: dataB.length },
        deltaSum: sum(dataB) - sum(dataA),
        deltaAvg: avg(dataB) - avg(dataA),
    };
}

module.exports = { getHistory, compareTimeframes };
