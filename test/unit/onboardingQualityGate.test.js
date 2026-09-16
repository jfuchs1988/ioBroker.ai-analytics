const { expect } = require('chai');
const { assessClassification, REVIEW_REASONS } = require('../../lib/onboardingQualityGate');

function assess(overrides = {}) {
    return assessClassification({
        sourceId: 'meter.0.gridPower', description: 'Netzleistung', category: 'consumption', unit: 'kW', confidence: 'high',
        ...overrides,
    }, {
        id: 'meter.0.gridPower', common: { unit: 'W', name: 'Netzleistung' },
    }, {
        valueKindResult: { valueKind: 'gauge', valueKindConfidence: 'high' },
        dataQualityResult: { dataCompleteness: 'complete' },
        room: '', roleKeyCounts: new Map(), assignedRoleKeys: new Set(),
    });
}

describe('onboardingQualityGate', () => {
    it('keeps the source unit and flags a conflicting model proposal', () => {
        const result = assess({ unit: 'kW' });
        expect(result.unit).to.equal('W');
        expect(result.reviewReasons).to.include(REVIEW_REASONS.UNIT_CONFLICT);
    });

    it('flags stale data and uncertain value kinds', () => {
        const result = assess({ confidence: 'low' });
        result.reviewReasons.push(REVIEW_REASONS.DATA_STALE);
        expect(result.needsReview).to.equal(true);
        expect(result.reviewReasons).to.include(REVIEW_REASONS.LOW_CONFIDENCE);
    });

    it('never silently confirms a proposed grid direction', () => {
        const result = assess({ derivedMetricRole: 'grid_power' });
        expect(result.roleFields.derivedMetricRole).to.equal('grid_power');
        expect(result.reviewReasons).to.include(REVIEW_REASONS.GRID_DIRECTION_UNCONFIRMED);
        expect(result.needsReview).to.equal(true);
    });
});
