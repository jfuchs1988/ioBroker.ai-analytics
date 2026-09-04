// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES } = require('./catalog');
const { recordUsage, isBudgetExceeded } = require('./usage');
const { classifyValueKind } = require('./valueKindClassifier');
const { classifyDataQuality } = require('./dataQualityClassifier');

const BATCH_SIZE = 20;
const MAX_CLASSIFICATION_RESPONSE_LENGTH = 128 * 1024;
const COUNTER_VALUE_KINDS = new Set(['daily_reset_counter', 'cumulative_total', 'event_count']);
const FEED_IN_NAME_PATTERN = /einspeisung|feed[-_ ]?in|export/i;

function adapterTypeOf(sourceId) {
    return sourceId.split('.')[0];
}

function isDerivedMetricCandidate(entry) {
    return Boolean(entry && !entry.derivedMetricGroupId && COUNTER_VALUE_KINDS.has(entry.valueKind));
}

/**
 * Rein namensbasierte Heuristik (kein LLM-Aufruf): schlaegt ein PV-Erzeugung/
 * Netzeinspeisung-Paar nur vor, wenn es je Rolle genau einen unzweideutigen
 * Kandidaten gibt. Bei Mehrdeutigkeit wird bewusst nichts vorgeschlagen —
 * der Nutzer weist die Rollen dann manuell im Geraete-Tab zu.
 */
function suggestSelfConsumptionPair(entries) {
    const pvCandidates = (entries || []).filter((entry) => isDerivedMetricCandidate(entry) && entry.category === 'generation_pv');
    const feedInCandidates = (entries || []).filter((entry) => isDerivedMetricCandidate(entry) && FEED_IN_NAME_PATTERN.test(`${entry.description || ''} ${entry.sourceId}`));
    if (pvCandidates.length !== 1 || feedInCandidates.length !== 1) return null;
    if (pvCandidates[0].sourceId === feedInCandidates[0].sourceId) return null;
    return { pvSourceId: pvCandidates[0].sourceId, feedInSourceId: feedInCandidates[0].sourceId };
}

function defaultClassification(sourceId, common = {}, objectName = '') {
    const normalized = sourceId.toLowerCase();
    const idName = sourceId.split('.').pop();
    const searchableName = `${normalized} ${(common.name || objectName || '').toLowerCase()}`;
    if (
        normalized.startsWith('sun2000.') ||
        normalized.startsWith('viessmannapi.') ||
        normalized.includes('.huawei.') ||
        /photovoltaik|\bpv\b|waermepumpe|wärmepumpe|heizung|heizungsanlage|weichwasser|enthärtung|enthärtungsanlage/.test(searchableName)
    ) {
        return { room: 'Keller', classificationSource: 'default' };
    }
    if (normalized.startsWith('shelly.') && /\.(switch|power|energy)$/i.test(sourceId)) {
        const channel = sourceId.match(/Relay(\d+)/i);
        const suffix = /power$/i.test(sourceId) ? 'aktuelle Leistung' : /energy$/i.test(sourceId) ? 'Energieverbrauch' : 'Schaltzustand';
        return {
            description: `Shelly ${channel ? `Relay ${channel[1]} ` : ''}${suffix}`,
            category: 'device_usage',
            classificationSource: 'default',
        };
    }
    if (normalized.startsWith('hm-rpc.') && /\.level$/i.test(sourceId)) {
        const serial = sourceId.split('.')[2] || idName;
        return {
            description: `Homematic-Aktor ${serial} Stellwert`,
            category: 'device_usage',
            classificationSource: 'default',
        };
    }
    if (normalized.startsWith('unifi.') && /\.is_online$/i.test(sourceId)) {
        return {
            description: `Anwesenheit ${objectName || common.name || idName}`,
            category: 'device_usage',
            classificationSource: 'default',
        };
    }
    return null;
}

async function getDefaultClassification(adapter, source) {
    let objectName = '';
    if (source.id.toLowerCase().startsWith('unifi.') && adapter && adapter.getForeignObjectAsync) {
        const parentId = source.id.split('.').slice(0, -1).join('.');
        try {
            const parent = await adapter.getForeignObjectAsync(parentId);
            objectName = (parent && parent.native && (parent.native.hostname || parent.native.name)) || (parent && parent.common && parent.common.name) || '';
        } catch (_error) {
            // A missing client object must not block onboarding.
        }
    }
    return defaultClassification(source.id, source.common, objectName);
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
    if (typeof text !== 'string') throw new TypeError('Antwort muss Text enthalten.');
    if (text.length > MAX_CLASSIFICATION_RESPONSE_LENGTH) throw new RangeError('Antwort ist zu gross.');
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('Antwort enthaelt kein JSON-Array.');
    }
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) throw new Error('Antwort muss ein JSON-Array enthalten.');
    return parsed;
}

function validateClassificationResults(classifications, batch) {
    if (!Array.isArray(classifications)) throw new TypeError('Klassifikationen muessen ein Array sein.');
    if (classifications.length > BATCH_SIZE || classifications.length > batch.length) {
        throw new RangeError('Antwort enthaelt mehr Klassifikationen als angefragt.');
    }
    const requestedIds = new Set(batch.map((source) => source.id));
    const seenIds = new Set();
    for (const classification of classifications) {
        if (!classification || typeof classification !== 'object' || Array.isArray(classification)) {
            throw new TypeError('Klassifikation muss ein Objekt sein.');
        }
        if (!requestedIds.has(classification.sourceId)) {
            throw new Error(`Unbekannte sourceId in Klassifikation: ${classification.sourceId}`);
        }
        if (seenIds.has(classification.sourceId)) {
            throw new Error(`Doppelte sourceId in Klassifikation: ${classification.sourceId}`);
        }
        seenIds.add(classification.sourceId);
    }
    return classifications;
}

async function runOnboarding(adapter, provider, discoveredObjects, progressCallback) {
    const existing = await getAllCatalogEntries(adapter);
    const knownIds = new Set(existing.map((entry) => entry.sourceId));
    const unclassified = discoveredObjects.filter((obj) => !knownIds.has(obj.id));
    const roomLookup = await buildRoomLookup(adapter);
    const reportProgress = typeof progressCallback === 'function' ? progressCallback : null;

    const needsReview = [];

    const batches = buildBatches(unclassified, BATCH_SIZE);
    let processedCount = 0;
    let classifiedCount = 0;

    const emitProgress = async (patch) => {
        if (!reportProgress) return;
        await reportProgress({
            total: unclassified.length,
            processed: processedCount,
            ...patch,
        });
    };

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (await isBudgetExceeded(adapter)) {
            if (adapter.log && adapter.log.warn) {
                adapter.log.warn('Onboarding: Tagesbudget (EUR) erschoepft, verbleibende Objekte werden beim naechsten Lauf klassifiziert.');
            }
            break;
        }

        const batch = batches[batchIndex];
        const prompt = buildClassificationPrompt(batch);
        await emitProgress({
            phase: 'batch',
            batchIndex: batchIndex + 1,
            batchTotal: batches.length,
            message: `Klassifiziere Batch ${batchIndex + 1}/${batches.length} mit ${batch.length} Objekten...`,
        });
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

            classifications = validateClassificationResults(parseClassificationResponse(response.content), batch);
        } catch (error) {
            if (adapter.log) {
                adapter.log.error(`Onboarding-Batch fehlgeschlagen: ${error.message}`);
            }
            continue;
        }

        for (const classification of classifications) {
            const source = batch.find((obj) => obj.id === classification.sourceId);
            if (!source) continue;

            const defaults = await getDefaultClassification(adapter, source);
            const finalClassification = defaults ? { ...classification, ...defaults } : classification;
            const hasCompleteDefault = Boolean(defaults && defaults.description && defaults.category);
            let valueKindResult;
            try {
                valueKindResult = await classifyValueKind(adapter, source, source.historyInstance);
            } catch (error) {
                if (adapter.log && adapter.log.warn) {
                    adapter.log.warn(`valueKind-Klassifizierung fuer ${source.id} fehlgeschlagen, verwende Fallback: ${error.message}`);
                }
                valueKindResult = { valueKind: 'gauge', valueKindConfidence: 'low', valueKindSource: 'metadata' };
            }
            let dataQualityResult;
            try {
                dataQualityResult = await classifyDataQuality(adapter, source, source.historyInstance);
            } catch (error) {
                if (adapter.log && adapter.log.warn) {
                    adapter.log.warn(`Datenqualitaets-Klassifizierung fuer ${source.id} fehlgeschlagen, verwende Fallback: ${error.message}`);
                }
                dataQualityResult = { writable: false, writePattern: 'unknown', updateFrequency: 'unknown', dataCompleteness: 'unknown' };
            }
            const entry = {
                sourceId: finalClassification.sourceId,
                description: finalClassification.description,
                unit: finalClassification.unit || source.common.unit || '',
                category: finalClassification.category,
                room: roomLookup.get(source.id) || finalClassification.room || '',
                confidence: finalClassification.confidence,
                needsReview: hasCompleteDefault ? false : finalClassification.confidence === 'low',
                classificationSource: hasCompleteDefault ? finalClassification.classificationSource || 'default' : 'llm',
                active: true,
                ignored: false,
                historyInstance: source.historyInstance,
                lastSeen: new Date().toISOString(),
                ...valueKindResult,
                ...dataQualityResult,
            };
            if (adapter.log && adapter.log.silly) {
                adapter.log.silly(`Onboarding: ${entry.sourceId} -> Kategorie=${entry.category}, Confidence=${entry.confidence}`);
            }

            try {
                await setCatalogEntry(adapter, entry);
                classifiedCount += 1;

                if (entry.needsReview) {
                    needsReview.push(entry);
                }
            } catch (error) {
                if (adapter.log) {
                    adapter.log.error(`Katalogeintrag fuer ${entry.sourceId} fehlgeschlagen: ${error.message}`);
                }
            }

            processedCount += 1;
            await emitProgress({
                phase: 'object',
                currentSourceId: entry.sourceId,
                message: `Klassifiziere ${processedCount}/${unclassified.length}: ${entry.sourceId}`,
            });
        }
    }

    try {
        const allEntries = await getAllCatalogEntries(adapter);
        const suggestion = suggestSelfConsumptionPair(allEntries);
        if (suggestion) {
            const groupId = `derived-${suggestion.pvSourceId}`;
            const pvEntry = allEntries.find((entry) => entry.sourceId === suggestion.pvSourceId);
            const feedInEntry = allEntries.find((entry) => entry.sourceId === suggestion.feedInSourceId);
            await setCatalogEntry(adapter, { ...pvEntry, derivedMetricRole: 'pv_generation', derivedMetricGroupId: groupId });
            await setCatalogEntry(adapter, { ...feedInEntry, derivedMetricRole: 'grid_feed_in', derivedMetricGroupId: groupId });
            if (adapter.log && adapter.log.info) {
                adapter.log.info(`Onboarding: Eigenverbrauchs-Paar vorgeschlagen (${suggestion.pvSourceId} + ${suggestion.feedInSourceId}), sichtbar/aenderbar im Geraete-Tab.`);
            }
        }
    } catch (error) {
        if (adapter.log && adapter.log.warn) {
            adapter.log.warn(`Vorschlag fuer Eigenverbrauchs-Paar fehlgeschlagen: ${error.message}`);
        }
    }

    return { classifiedCount, needsReview };
}

module.exports = { runOnboarding, buildClassificationPrompt, parseClassificationResponse, validateClassificationResults, adapterTypeOf, buildBatches, suggestSelfConsumptionPair };
