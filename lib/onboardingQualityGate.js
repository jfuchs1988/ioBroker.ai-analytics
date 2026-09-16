'use strict';

const { CATEGORIES, DERIVED_METRIC_ROLES, HVAC_ROLES, isDerivedMetricRoleValueKindValid, isHvacRoleValueKindValid } = require('./catalog');
const { VALUE_KINDS } = require('./valueKindClassifier');

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_UNIT_LENGTH = 64;
const REVIEW_REASONS = Object.freeze({
    LOW_CONFIDENCE: 'low_confidence',
    UNKNOWN_CATEGORY: 'unknown_category',
    INVALID_DESCRIPTION: 'invalid_description',
    UNIT_CONFLICT: 'unit_conflict',
    UNIT_MISSING: 'unit_missing',
    VALUE_KIND_UNCERTAIN: 'value_kind_uncertain',
    DATA_UNKNOWN: 'data_quality_unknown',
    DATA_GAPS: 'data_gaps',
    DATA_STALE: 'data_stale',
    ROLE_INCOMPATIBLE: 'role_incompatible',
    ROLE_DUPLICATE: 'role_duplicate',
    HVAC_INCOMPATIBLE: 'hvac_incompatible',
    GRID_DIRECTION_UNCONFIRMED: 'grid_direction_unconfirmed',
});

function textValue(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return Object.values(value).find((item) => typeof item === 'string') || '';
}

function addReason(reasons, reason) {
    if (!reasons.includes(reason)) reasons.push(reason);
}

function sameUnit(left, right) {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function assessClassification(classification, source, { valueKindResult, dataQualityResult, room, roleKeyCounts, assignedRoleKeys }) {
    const reasons = [];
    const common = source.common || {};
    const confidence = classification.confidence === 'high' || classification.confidence === 'low' ? classification.confidence : 'low';
    if (confidence === 'low' || classification.confidence !== confidence) addReason(reasons, REVIEW_REASONS.LOW_CONFIDENCE);

    const category = CATEGORIES.includes(classification.category) ? classification.category : 'device_usage';
    if (category !== classification.category) addReason(reasons, REVIEW_REASONS.UNKNOWN_CATEGORY);

    const description = typeof classification.description === 'string' && classification.description.trim() && classification.description.length <= MAX_DESCRIPTION_LENGTH
        ? classification.description.trim()
        : textValue(common.name) || source.id;
    if (description === source.id || description !== classification.description) addReason(reasons, REVIEW_REASONS.INVALID_DESCRIPTION);

    const sourceUnit = textValue(common.unit);
    const proposedUnit = textValue(classification.unit);
    let unit = sourceUnit || proposedUnit;
    if (sourceUnit && proposedUnit && !sameUnit(sourceUnit, proposedUnit)) {
        unit = sourceUnit;
        addReason(reasons, REVIEW_REASONS.UNIT_CONFLICT);
    }
    if (unit.length > MAX_UNIT_LENGTH) {
        unit = unit.slice(0, MAX_UNIT_LENGTH);
        addReason(reasons, REVIEW_REASONS.UNIT_CONFLICT);
    }
    if (!sourceUnit && !['boolean_state', 'enum_state', 'text_state'].includes(valueKindResult.valueKind)) addReason(reasons, REVIEW_REASONS.UNIT_MISSING);

    if (valueKindResult.valueKindConfidence !== 'high' || !VALUE_KINDS.includes(valueKindResult.valueKind)) {
        addReason(reasons, REVIEW_REASONS.VALUE_KIND_UNCERTAIN);
    }
    if (dataQualityResult.dataCompleteness === 'stale') addReason(reasons, REVIEW_REASONS.DATA_STALE);
    if (dataQualityResult.dataCompleteness === 'gaps') addReason(reasons, REVIEW_REASONS.DATA_GAPS);
    if (dataQualityResult.dataCompleteness === 'unknown') addReason(reasons, REVIEW_REASONS.DATA_UNKNOWN);

    const roleFields = {};
    if (classification.derivedMetricRole) {
        const role = classification.derivedMetricRole;
        const groupId = source.id.split('.').slice(0, 2).join('.');
        const roleKey = `${groupId}::${role}`;
        const duplicate = (roleKeyCounts.get(roleKey) || 0) > 1 || assignedRoleKeys.has(roleKey);
        if (!DERIVED_METRIC_ROLES.has(role) || !isDerivedMetricRoleValueKindValid(role, valueKindResult.valueKind)) addReason(reasons, REVIEW_REASONS.ROLE_INCOMPATIBLE);
        else if (duplicate) addReason(reasons, REVIEW_REASONS.ROLE_DUPLICATE);
        else {
            roleFields.derivedMetricRole = role;
            roleFields.derivedMetricGroupId = groupId;
            assignedRoleKeys.add(roleKey);
        }
        if (role === 'grid_power') addReason(reasons, REVIEW_REASONS.GRID_DIRECTION_UNCONFIRMED);
    }
    if (classification.hvacRole) {
        if (HVAC_ROLES.has(classification.hvacRole) && isHvacRoleValueKindValid(valueKindResult.valueKind)) roleFields.hvacRole = classification.hvacRole;
        else addReason(reasons, REVIEW_REASONS.HVAC_INCOMPATIBLE);
    }

    return {
        description,
        unit,
        category,
        room: room || textValue(classification.room),
        confidence,
        reviewReasons: reasons,
        needsReview: reasons.length > 0,
        roleFields,
    };
}

module.exports = { REVIEW_REASONS, assessClassification };
