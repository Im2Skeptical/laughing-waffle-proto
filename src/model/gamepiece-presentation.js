import { getDetailedPracticeDef, getDetailedStructureDef } from './game-config.js';
import { getDetailedPracticeWorkerCapacity, getQualityMultiplier } from './detailed-practice-tiers.js';
import { getMoonPhaseDurationSec, getMoonCycleDurationSec } from './moon-phases.js';
import { MOON_PHASE_INDEX_BY_ID } from '../defs/gamesettings/moon-phase-defs.js';

export const GAMEPIECE_OUTPUTS = Object.freeze({
  food: { label: 'Food', icon: 'food' }, money: { label: 'Money', icon: 'money' },
  research: { label: 'Research', icon: 'research' },
  housingCapacity: { label: 'Housing capacity', icon: 'housingCapacity' },
  foodCapacity: { label: 'Food capacity', icon: 'foodCapacity' },
});

const number = value => Math.round(value * 100) / 100;
export function describeGamepieceEffects(def) {
  const names = {
    addLocalFood: 'Food', addLocalCurrency: 'Money', routeLocalFood: 'Food routing capacity',
    addCivilizationResearch: 'Research', reduceLocalFoodRequirement: 'less Food required',
    addHousingForPhase: 'temporary Housing', spendCurrencyForHousing: 'temporary Housing', advanceWork: 'construction work',
    addFaithChaosResistance: 'Faith Chaos resistance',
  };
  return (def.effects ?? []).map(effect => {
    if (effect.scaledValue) {
      const value = effect.scaledValue;
      return `${value.baseAmount} ${names[effect.op] ?? effect.op} × ${value.evaluator?.label ?? 'local scope'} × (1 + effective workers × ${def.workerBonus ?? .25}).${effect.currencyPerHousing ? ` Costs ${effect.currencyPerHousing} Money per Housing.` : ''}`;
    }
    if (effect.op === 'createLocalStructureAtWork') return `At ${effect.requiredWork} work, build a ${effect.structureDefId === 'mudHouses' ? 'Mud House' : effect.structureDefId} in free construction cells. Completed work waits if there is no free span.`;
    if (effect.op === 'extendHappinessFloor') return `Add ${effect.durationResolutions} future Faith resolution with a ${effect.status} Happiness floor; additive duration capped at ${effect.maximumResolutions}.`;
    if (effect.op === 'importMissingFood') return 'Spend available Money, one per missing Food, to cover the meal shortfall.';
    if (effect.op === 'reduceFoodDecay') return `${effect.amount}% relative reduction to ${effect.foodKind} Food decay, scaled by quality; combined reduction capped at 100%.`;
    if (effect.op === 'reduceExternalEmigrationPressure') return `${effect.amount} external-emigration pressure reduction (nonfunctional; no live executor).`;
    return effect.op;
  });
}

function describeStructureValues(def, tier) {
  const multiplier = getQualityMultiplier(tier, def.qualityMultiplierPerLevel ?? 0);
  const scaled = value => number(value * multiplier);
  if (Number.isFinite(def.capacityPerCountSquared)) return [
    `${number(def.capacityPerCountSquared * multiplier * multiplier)} ${def.capacityKind === 'housing' ? 'Housing' : 'stored-Food capacity'} when alone.`,
    `Together: ${def.capacityPerCountSquared} × the square of their combined quality units. This ${tier} structure contributes ${multiplier} units.`,
  ];
  const descriptions = [
    ['migrantHousingReserve', value => `${value} reserved Housing (nonfunctional; no live executor).`],
    ['knowledgeResearchMultiplierPerLevel', value => `+${number(value * 100)}% Knowledge Research.`],
    ['researchPerRetiredIntelligence', value => `${value} Research per retired Intelligence.`],
    ['faithResistancePerRetiredWisdom', value => `${value} resistance per retired Wisdom.`],
    ['foodOutputBonusPerOtherFoodPiece', value => `+${number(value * 100)}% Food output per other Food piece.`],
    ['faithResistancePerDistinctTag', value => `${value} resistance per distinct tag.`],
    ['candidateIntelligenceBonus', value => `+${value} candidate Intelligence.`],
  ];
  return [...descriptions.flatMap(([key, describe]) => Number.isFinite(def[key]) ? [describe(scaled(def[key]))] : []),
    ...(def.id === 'university' ? ['Gold offer floor, subject to the civilization’s unlocked quality; complete at Bronze.'] : [])];
}

export function getGamepieceFace(state, kind, id, tier = 'bronze', { evaluation = null, workers = null, slot = null } = {}) {
  const def = kind === 'practice' ? getDetailedPracticeDef(state, id) : getDetailedStructureDef(state, id);
  if (!def) return null;
  const multiplier = getQualityMultiplier(tier, def.qualityMultiplierPerLevel ?? 0);
  const outputs = (def.outputs ?? []).map(output => {
    const effect = def.effects?.[output.effectIndex];
    const evaluated = evaluation?.effects?.[output.effectIndex];
    let value = output.field ? def[output.field] * multiplier ** (output.field === 'capacityPerCountSquared' ? 2 : 1)
      : evaluated?.scaledValue?.effectiveValue ?? evaluated?.importCalculation?.importedFood ?? effect?.scaledValue?.baseAmount ?? 0;
    if (effect?.op === 'createLocalStructureAtWork') value = getDetailedStructureDef(state, effect.structureDefId)?.capacityPerCountSquared ?? 0;
    return { ...GAMEPIECE_OUTPUTS[output.resource], resource: output.resource, value: number(value) };
  });
  const threshold = evaluation?.activation?.chargeThreshold ?? Math.max(1, Math.floor((def.activation?.chargeThreshold ?? 1) - Math.max(0, ['bronze','silver','gold','diamond'].indexOf(tier)) * (def.activation?.chargeThresholdReductionPerQuality ?? .5)));
  const requiredWork = def.effects?.find(e => e.op === 'createLocalStructureAtWork')?.requiredWork;
  const seasonal = def.activation?.type === 'season';
  const period = seasonal ? (state?.seasonDurationSec ?? 8) * (def.activation?.seasonKeys?.length ? 4 : 1) : getMoonCycleDurationSec(state);
  const offset = seasonal ? (['spring','summer','autumn','winter'].indexOf(def.activation.seasonKeys?.[0]) * (state?.seasonDurationSec ?? 8) + 1)
    : 1 + (MOON_PHASE_INDEX_BY_ID[def.activation?.type] ?? 0) * getMoonPhaseDurationSec(state);
  return { kind, definitionId: id, label: def.label, tier, rule: def.ui?.rule ?? '',
    outputs, footprint: def.footprint ?? 1, lane: def.lane ?? null, source: def.source ?? null,
    workerCapacity: kind === 'practice' ? getDetailedPracticeWorkerCapacity(def, tier) : 0,
    workerBonus: def.workerBonus ?? .25, workers: workers?.tokens?.length ?? 0,
    fill: def.lane === 'charge' ? Math.min(1, requiredWork ? (slot?.work ?? 0) / requiredWork : (slot?.charge ?? 0) / threshold)
      : (state?.tSec ?? 0) <= 0 ? 0 : (((state?.tSec ?? 0) - offset) % period + period) % period / period,
    detailLines: [...(kind === 'structure' ? describeStructureValues(def, tier) : []), ...describeGamepieceEffects(def), ...(def.nonfunctionalEffects ?? []),
      ...(kind === 'practice' ? [`Workers optional: ${getDetailedPracticeWorkerCapacity(def, tier)} sockets; +${number((def.workerBonus ?? .25) * 100)}% per effective worker.`,
        def.lane === 'charge' ? requiredWork ? `Birth adds construction work.` : `Activates at ${threshold} charge. Each matching activation contributes one charge.`
          : `Scheduled: ${def.source?.cadence ?? def.activation.type}.`] : [`Construction footprint: ${def.footprint ?? 1} horizontal cells.`])],
  };
}
