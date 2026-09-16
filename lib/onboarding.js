// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
'use strict';

const { getAllCatalogEntries, setCatalogEntry, CATEGORIES, DERIVED_METRIC_ROLES, HVAC_ROLES } = require('./catalog');
const { recordUsage, isBudgetExceeded } = require('./usage');
const { getTokenLimits, estimateRequestTokens } = require('./tokenLimits');
const { classifyValueKind } = require('./valueKindClassifier');
const { classifyDataQuality } = require('./dataQualityClassifier');
const { assessClassification } = require('./onboardingQualityGate');

const BATCH_SIZE = 20;
const MAX_CLASSIFICATION_RESPONSE_LENGTH = 128 * 1024;

function adapterInstanceOf(sourceId) {
    return sourceId.split('.').slice(0, 2).join('.');
}

function textValue(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return Object.values(value).find((item) => typeof item === 'string') || '';
}

function buildBatches(objects, batchSize) {
    const groups = new Map();
    for (const obj of objects) {
        const instance = adapterInstanceOf(obj.id);
        if (!groups.has(instance)) groups.set(instance, []);
        groups.get(instance).push(obj);
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
        const roomName = textValue(enumObj && enumObj.common && enumObj.common.name);
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
        name: textValue(obj.common.name),
        type: obj.common.type || '',
        role: textValue(obj.common.role),
        unit: textValue(obj.common.unit),
        writable: obj.common.write === true,
    }));

    return [
        'Du bist Teil eines ioBroker-Adapters und ordnest Smart-Home-Objekte in Kategorien ein.',
        `Erlaubte Kategorien: ${CATEGORIES.join(', ')}.`,
        `Energiebilanz-Rollen bleiben null; sie werden ausschließlich manuell im Geräte-Tab gesetzt: ${[...DERIVED_METRIC_ROLES].join(', ')}.`,
        `HVAC-Rollen bleiben null; sie werden ausschließlich manuell im Geräte-Tab gesetzt: ${[...HVAC_ROLES].join(', ')}.`,
        'Antworte AUSSCHLIESSLICH mit einem JSON-Array, ein Eintrag pro Objekt, in dieser Form:',
        '[{"sourceId": "...", "description": "...", "unit": "...", "category": "...", "room": "...", "confidence": "high"|"low", "derivedMetricRole": "..."|null, "hvacRole": "..."|null}]',
        'Setze derivedMetricRole und hvacRole immer auf null. Keine fachliche Rolle aus Name, sourceId oder Hersteller ableiten.',
        'Übernimm unit ausschließlich aus den Metadaten. Wenn sie fehlt oder unklar ist, setze unit auf einen leeren String und erfinde keine Einheit.',
        'Nutze confidence "low", wenn du dir bei Zweck oder Kategorie nicht sicher bist.',
        'Schreibe die description ausschliesslich auf Deutsch, in klarer Alltagssprache (kein Fachjargon, kein Datenpunktname).',
        'Objekte:',
        JSON.stringify(objectDescriptions, null, 2),
    ].join('\n');
}

function parseClassificationResponse(text) {
    if (typeof text !== 'string') throw new TypeError('Antwort muss Text enthalten.');
    if (text.length > MAX_CLASSIFICATION_RESPONSE_LENGTH) throw new RangeError('Antwort ist zu gross.');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text.trim();
    let parsed;
    try {
        parsed = JSON.parse(candidate);
    } catch (parseError) {
        const jsonStart = candidate.indexOf('[');
        const jsonEnd = candidate.lastIndexOf(']');
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('Antwort enthaelt kein JSON-Array.', { cause: parseError });
        try {
            parsed = JSON.parse(candidate.slice(jsonStart, jsonEnd + 1));
        } catch (fallbackError) {
            throw new Error('Antwort enthaelt ungueltiges JSON.', { cause: fallbackError });
        }
    }
    if (!Array.isArray(parsed)) throw new Error('Antwort muss ein JSON-Array enthalten.');
    return parsed;
}

function validateClassificationResults(classifications, batch) {
    if (!Array.isArray(classifications)) throw new TypeError('Klassifikationen muessen ein Array sein.');
    if (classifications.length !== batch.length) {
        throw new RangeError('Antwort muss genau eine Klassifikation pro angefragtem Objekt enthalten.');
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
    const existingById = new Map(existing.map(entry => [entry.sourceId, entry]));
    const unclassified = discoveredObjects.filter((obj) => {
        const entry = existingById.get(obj.id);
        return !entry || (entry.classificationSource === 'metadata' && !entry.valueKind);
    });
    const roomLookup = await buildRoomLookup(adapter);
    const reportProgress = typeof progressCallback === 'function' ? progressCallback : null;

    const assignedRoleKeys = new Set(
        existing
            .filter((entry) => entry.derivedMetricRole && entry.derivedMetricGroupId)
            .map((entry) => `${entry.derivedMetricGroupId}::${entry.derivedMetricRole}`)
    );

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
            adapter.log.silly(`Onboarding: klassifiziere Batch ${batchIndex + 1}/${batches.length} mit ${batch.length} Objekten (Adapter: ${adapterInstanceOf(batch[0].id)})`);
        }

        let classifications;
        try {
            const onboardingSystemPrompt = 'Du hilfst dabei, Smart-Home-Objekte zu katalogisieren.';
            const promptEstimate = estimateRequestTokens({ system: onboardingSystemPrompt, messages: [{ role: 'user', content: prompt }], tools: [] });
            const onboardingTokenLimits = getTokenLimits(adapter.config, 'onboarding');
            const maxInputTokens = Math.min(onboardingTokenLimits.maxInputTokens, onboardingTokenLimits.contextWindowTokens - onboardingTokenLimits.maxOutputTokens);
            if (promptEstimate > maxInputTokens) {
                throw new Error(`Batch ueberschreitet das konfigurierte Eingabe-Token-Limit (~${promptEstimate} von ${maxInputTokens} geschaetzten Tokens).`);
            }

            const response = await provider.chat({
                system: onboardingSystemPrompt,
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

        const roleKeyCounts = new Map();
        for (const classification of classifications) {
            if (!classification.derivedMetricRole) continue;
            const source = batch.find((obj) => obj.id === classification.sourceId);
            if (!source) continue;
            const key = `${adapterInstanceOf(source.id)}::${classification.derivedMetricRole}`;
            roleKeyCounts.set(key, (roleKeyCounts.get(key) || 0) + 1);
        }

        for (const classification of classifications) {
            const source = batch.find((obj) => obj.id === classification.sourceId);
            if (!source) continue;

            const finalClassification = classification;
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

            const assessment = assessClassification(finalClassification, source, {
                valueKindResult,
                dataQualityResult,
                room: roomLookup.get(source.id),
                roleKeyCounts,
                assignedRoleKeys,
            });

            const entry = {
                sourceId: finalClassification.sourceId,
                description: assessment.description,
                unit: assessment.unit,
                category: assessment.category,
                room: assessment.room,
                confidence: assessment.confidence,
                needsReview: assessment.needsReview,
                reviewReasons: assessment.reviewReasons,
                classificationSource: 'llm',
                active: true,
                ignored: false,
                historyInstance: source.historyInstance,
                lastSeen: new Date().toISOString(),
                ...valueKindResult,
                ...dataQualityResult,
                ...assessment.roleFields,
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

    return { classifiedCount, needsReview };
}

module.exports = { runOnboarding, buildClassificationPrompt, parseClassificationResponse, validateClassificationResults, adapterInstanceOf, buildBatches };
