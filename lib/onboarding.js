'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
const { recordUsage } = require('./usage');

const BATCH_SIZE = 20;

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
    const roomLookup = await buildRoomLookup(adapter);

    const needsReview = [];

    for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
        const batch = unclassified.slice(i, i + BATCH_SIZE);
        const prompt = buildClassificationPrompt(batch);
        if (adapter.log && adapter.log.silly) {
            adapter.log.silly(`Onboarding: klassifiziere Batch ${i / BATCH_SIZE + 1} mit ${batch.length} Objekten`);
        }

        let classifications;
        try {
            const response = await provider.chat({
                system: 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.',
                messages: [{ role: 'user', content: prompt }],
                tools: [],
            });

            if (response.usage) {
                await recordUsage(adapter, response.usage, 'onboarding');
            }

            classifications = parseClassificationResponse(response.content);
        } catch (error) {
            if (adapter.log) {
                adapter.log.error(`Onboarding-Batch fehlgeschlagen: ${error.message}`);
            }
            continue;
        }

        for (const classification of classifications) {
            const source = batch.find((obj) => obj.id === classification.sourceId);
            if (!source) continue;

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
            if (adapter.log && adapter.log.silly) {
                adapter.log.silly(`Onboarding: ${entry.sourceId} -> Kategorie=${entry.category}, Confidence=${entry.confidence}`);
            }

            try {
                await setCatalogEntry(adapter, entry);

                if (entry.needsReview) {
                    needsReview.push(entry);
                }
            } catch (error) {
                if (adapter.log) {
                    adapter.log.error(`Katalogeintrag fuer ${entry.sourceId} fehlgeschlagen: ${error.message}`);
                }
            }
        }
    }

    return { classifiedCount: unclassified.length, needsReview };
}

module.exports = { runOnboarding, buildClassificationPrompt, parseClassificationResponse };
