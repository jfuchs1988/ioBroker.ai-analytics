// lib/energyBalance.js
'use strict';

const { computePeriodValue, resolvePeriod } = require('./periodValue');
const { detectDailyAggregateAnomaly } = require('./anomalyDetector');

const REQUIRED_ROLES = ['pv_generation', 'grid_import', 'grid_feed_in', 'consumption'];
const BATTERY_ROLES = ['battery_charge', 'battery_discharge'];
const BASELINE_DAY_OFFSETS = [-8, -7, -6, -5, -4, -3, -2];
const CURRENT_DAY_OFFSET = -1;
const DATA_COMPLETENESS_SEVERITY = { stale: 2, gaps: 1, unknown: 0, complete: 0 };

function isEnergyBalanceCandidate(entry) {
    return Boolean(entry && entry.active !== false && !entry.ignored && entry.derivedMetricGroupId && entry.derivedMetricRole);
}

function groupByDerivedMetricGroupId(entries) {
    const groups = new Map();
    for (const entry of entries.filter(isEnergyBalanceCandidate)) {
        if (!groups.has(entry.derivedMetricGroupId)) groups.set(entry.derivedMetricGroupId, []);
        groups.get(entry.derivedMetricGroupId).push(entry);
    }
    return groups;
}

function resolveGroupRoles(groupEntries) {
    const byRole = {};
    for (const role of [...REQUIRED_ROLES, ...BATTERY_ROLES]) {
        const matches = groupEntries.filter((entry) => entry.derivedMetricRole === role);
        if (matches.length > 1) return null;
        byRole[role] = matches[0];
    }
    if (REQUIRED_ROLES.some((role) => !byRole[role])) return null;
    const hasBatteryCharge = Boolean(byRole.battery_charge);
    const hasBatteryDischarge = Boolean(byRole.battery_discharge);
    if (hasBatteryCharge !== hasBatteryDischarge) return null;
    return { ...byRole, hasBattery: hasBatteryCharge };
}

function worstDataCompleteness(entries) {
    let worst = 'unknown';
    for (const entry of entries) {
        const severity = DATA_COMPLETENESS_SEVERITY[entry.dataCompleteness] || 0;
        if (severity > (DATA_COMPLETENESS_SEVERITY[worst] || 0)) worst = entry.dataCompleteness;
    }
    return worst;
}

async function residualForDay(adapter, roles, dayOffset, now) {
    const period = resolvePeriod({ dayOffset }, now);
    const totals = {};
    for (const role of REQUIRED_ROLES) {
        totals[role] = (await computePeriodValue(adapter, roles[role], period)).total;
    }
    totals.battery_charge = roles.battery_charge ? (await computePeriodValue(adapter, roles.battery_charge, period)).total : 0;
    totals.battery_discharge = roles.battery_discharge ? (await computePeriodValue(adapter, roles.battery_discharge, period)).total : 0;
    return (totals.pv_generation + totals.grid_import + totals.battery_discharge)
        - (totals.grid_feed_in + totals.battery_charge + totals.consumption);
}

async function findEnergyBalanceCandidates(adapter, entries, now = Date.now()) {
    const groups = groupByDerivedMetricGroupId(entries || []);
    const candidates = [];
    let failedCount = 0;

    for (const [groupId, groupEntries] of groups) {
        const roles = resolveGroupRoles(groupEntries);
        if (!roles) continue;

        try {
            const baselineValues = [];
            for (const dayOffset of BASELINE_DAY_OFFSETS) {
                baselineValues.push(await residualForDay(adapter, roles, dayOffset, now));
            }
            const currentValue = await residualForDay(adapter, roles, CURRENT_DAY_OFFSET, now);
            const dataCompleteness = worstDataCompleteness(REQUIRED_ROLES.map((role) => roles[role]));

            const evidence = detectDailyAggregateAnomaly({ currentValue, baselineValues, dataCompleteness });
            if (!evidence) continue;

            candidates.push({
                groupId,
                reason: evidence.reason === 'deviation' ? 'energy_balance_deviation' : 'energy_balance_missing_data',
                currentResidual: evidence.currentValue,
                baselineMedianResidual: evidence.baselineMedian,
                robustZ: evidence.robustZ,
                relativeChange: evidence.relativeChange,
                currentCount: evidence.currentCount,
                baselineCount: evidence.baselineCount,
                dataCompleteness: evidence.dataCompleteness,
                hasBattery: roles.hasBattery,
                pvSourceId: roles.pv_generation.sourceId,
                pvDescription: roles.pv_generation.description,
                gridImportSourceId: roles.grid_import.sourceId,
                gridImportDescription: roles.grid_import.description,
                gridFeedInSourceId: roles.grid_feed_in.sourceId,
                gridFeedInDescription: roles.grid_feed_in.description,
                consumptionSourceId: roles.consumption.sourceId,
                consumptionDescription: roles.consumption.description,
            });
        } catch (error) {
            failedCount++;
            if (adapter.log && adapter.log.warn) {
                adapter.log.warn(`Energiebilanz fuer Gruppe '${groupId}' fehlgeschlagen: ${error.message}`);
            }
        }
    }

    return { candidates, failedCount };
}

module.exports = { findEnergyBalanceCandidates };
