'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
const { recordUsage, isBudgetExceeded } = require('./usage');
const { classifyValueKind } = require('./valueKindClassifier');

const BATCH_SIZE = 20;

function adapterTypeOf(sourceId) {
    return sourceId.split('.')[0];
}

function buildBatches(objects, batchSize) {
    const groups = new Map();
    for (const obj of objects) {
        const type = adapterTypeOf(obj.id);
        if (!groups.has(type)) groups.set(type, []);
        groups.get(type).push(obj);
    }
    const batches = [];
    for (const group of groups.values()) {
        for (let i = 0; i < group.length; i += batchSize) {
            batches.push(group.slice(i, i + batchSize));
        }
    }
    return batches;
}

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
        'Schreibe die description ausschliesslich auf Deutsch, in klarer Alltagssprache (kein Fachjargon, kein Datenpunktname).',
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

    const batches = buildBatches(unclassified, BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (await isBudgetExceeded(adapter)) {
            if (adapter.log && adapter.log.warn) {
                adapter.log.warn('Onboarding: Tagesbudget an Tokens erschoepft, verbleibende Objekte werden beim naechsten Lauf klassifiziert.');
            }
            break;
        }

        const batch = batches[batchIndex];
        const prompt = buildClassificationPrompt(batch);
        if (adapter.log && adapter.log.silly) {
            adapter.log.silly(`Onboarding: klassifiziere Batch ${batchIndex + 1}/${batches.length} mit ${batch.length} Objekten (Adapter: ${adapterTypeOf(batch[0].id)})`);
        }

        let classifications;
        try {
            const response = await provider.chat({
                system: 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.',
                messages: [{ role: 'user', content: prompt }],
                tools: [],
            });

            if (response.usage) {
                try {
                    await recordUsage(adapter, response.usage, 'onboarding');
                } catch (usageError) {
                    if (adapter.log && adapter.log.warn) {
                        adapter.log.warn(`Onboarding-Verbrauch nicht erfasst: ${usageError.message}`);
                    }
                }
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

            let valueKindResult;
            try {
                valueKindResult = await classifyValueKind(adapter, source, source.historyInstance);
            } catch (error) {
                if (adapter.log && adapter.log.warn) {
                    adapter.log.warn(`valueKind-Klassifizierung fuer ${source.id} fehlgeschlagen, verwende Fallback: ${error.message}`);
                }
                valueKindResult = { valueKind: 'gauge', valueKindConfidence: 'low', valueKindSource: 'metadata' };
            }
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
                ...valueKindResult,
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

module.exports = { runOnboarding, buildClassificationPrompt, parseClassificationResponse, adapterTypeOf, buildBatches };
