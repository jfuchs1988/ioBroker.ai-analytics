'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');

const BATCH_SIZE = 20;

function buildClassificationPrompt(objects) {
    const objectDescriptions = objects.map((obj) => ({
        sourceId: obj.id,
        name: obj.common.name,
        role: obj.common.role,
        unit: obj.common.unit,
    }));

    return [
        'Du bist Teil eines ioBroker-Adapters und ordnest Smart-Home-Objekte in Kategorien ein.',
        `Erlaubte Kategorien: ${CATEGORIES.join(', ')}.`,
        'Antworte AUSSCHLIESSLICH mit einem JSON-Array, ein Eintrag pro Objekt, in dieser Form:',
        '[{"sourceId": "...", "description": "...", "unit": "...", "category": "...", "room": "...", "confidence": "high"|"low"}]',
        'Nutze confidence "low", wenn du dir bei Zweck oder Kategorie nicht sicher bist.',
        'Objekte:',
        JSON.stringify(objectDescriptions, null, 2),
    ].join('\n');
}

function parseClassificationResponse(text) {
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('Antwort enthaelt kein JSON-Array.');
    }
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

async function runOnboarding(adapter, provider, discoveredObjects) {
    const existing = await getAllCatalogEntries(adapter);
    const knownIds = new Set(existing.map((entry) => entry.sourceId));
    const unclassified = discoveredObjects.filter((obj) => !knownIds.has(obj.id));

    const needsReview = [];

    for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
        const batch = unclassified.slice(i, i + BATCH_SIZE);
        const prompt = buildClassificationPrompt(batch);

        try {
            const response = await provider.chat({
                system: 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.',
                messages: [{ role: 'user', content: prompt }],
                tools: [],
            });

            const classifications = parseClassificationResponse(response.content);

            for (const classification of classifications) {
                const source = batch.find((obj) => obj.id === classification.sourceId);
                if (!source) continue;

                const entry = {
                    sourceId: classification.sourceId,
                    description: classification.description,
                    unit: classification.unit || source.common.unit || '',
                    category: classification.category,
                    room: classification.room || '',
                    confidence: classification.confidence,
                    needsReview: classification.confidence === 'low',
                    active: true,
                    historyInstance: source.historyInstance,
                    lastSeen: new Date().toISOString(),
                };

                await setCatalogEntry(adapter, entry);

                if (entry.needsReview) {
                    needsReview.push(entry);
                }
            }
        } catch (error) {
            adapter.log && adapter.log.error(`Onboarding-Batch fehlgeschlagen: ${error.message}`);
        }
    }

    return { classifiedCount: unclassified.length, needsReview };
}

module.exports = { runOnboarding, buildClassificationPrompt, parseClassificationResponse };
