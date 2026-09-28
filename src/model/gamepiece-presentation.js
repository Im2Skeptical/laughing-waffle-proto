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
  const labels={generateStock:'Stock',research:'Research',train:'specialists trained',reduceLocalFoodRequirement:'Edible saved per meal',addHousingForPhase:'Housing this phase',addFaithChaosResistance:'Chaos resistance'};
  return (def.effects??[]).map(effect=>`${effect.amount??0} ${labels[effect.op]??effect.op}${effect.classId?' ('+effect.classId+')':''}${effect.historyScale?' + accumulated '+effect.historyScale:''}.`);
}

function describeStructureValues(def) {
  return [...(def.housing?[`${def.housing} Housing. Numeric bonuses from duplicate structures add.`]:[]),...(def.candidateBonus?[`+${def.candidateBonus} to future ${def.pool} candidates from this settlement while active.`]:[])];
}

export function getGamepieceFace(state, kind, id, tier = 'bronze', { evaluation = null, workers = null, slot = null, activationTrace = [] } = {}) {
  const def = kind === 'practice' ? getDetailedPracticeDef(state, id) : getDetailedStructureDef(state, id);
  if (!def) return null;
  if (kind === 'structure') tier = ['bronze','silver','gold','diamond'][Math.min(3,['bronze','silver','gold','diamond'].indexOf(def.minimumQuality??'bronze')+(slot?.qualityBonus??0))];
  const multiplier = kind === 'practice' ? getQualityMultiplier(tier, def.qualityMultiplierPerLevel ?? 0) : 1;
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
  const viewedTime = state?.tSec ?? 0;
  const scheduledAge = ((viewedTime - offset) % period + period) % period;
  const lastReaction = activationTrace.filter(entry => entry.kind === 'activated' && entry.targetPracticeId === id && entry.tSec <= viewedTime).at(-1);
  const activationAge = slot && lastReaction ? viewedTime - lastReaction.tSec : null;
  // Face-only recipe data. These are authored base yields; evaluation remains
  // authoritative for worker bonuses, local modifiers and the actual result.
  const effectIcons = { generateStock: 'stock', research: 'research', train: 'population', addHousingForPhase: 'housingCapacity', addFaithChaosResistance: 'faith', reduceLocalFoodRequirement: 'food' };
  const production = (def.effects ?? []).flatMap(effect => {
    const icon = effectIcons[effect.op];
    if (!icon) return [];
    const seasons = effect.seasonAmounts ?? (def.activation?.type === 'season' && def.activation.seasonKeys?.length
      ? Object.fromEntries(def.activation.seasonKeys.map(season => [season, effect.amount ?? 0])) : null);
    return seasons ? Object.entries(seasons).map(([season, value]) => ({ season, icon, value, label: `${season}: ${value} base ${icon}` }))
      : [{ icon, value: effect.amount ?? 0, label: `${effect.amount ?? 0} base ${icon}` }];
  });
  const inputs = ['consume', 'require'].flatMap(kind => (def[kind] ?? []).map(input => ({ kind, amount: input.amount, traits: [...input.traits] })));
  const producesStock = (def.effects ?? []).some(effect => effect.op === 'generateStock');
  const workerMultiplier = producesStock ? number(1 + (workers?.effectiveWorkers ?? 0) * (def.workerBonus ?? 1)) : 1;
  return { kind, definitionId: id, label: def.label, tier, tags: [...new Set([...(def.tags ?? []),...(workers?.tokens?.some(t=>t.specialist==='scholar')?['Knowledge']:[])])], qualityLabel: tier, rule: def.ui?.rule ?? '',
    inputs, production, workerMultiplier,
    stock: evaluation?.stock ?? slot?.stock ?? 0, stockCapacity: evaluation?.stockCapacity ?? def.stockCapacity ?? 0, stockTraits: def.stockTraits ?? [],
    providers: evaluation?.providers ?? [],
    viewedTime, activationAge,
    outputs, footprint: def.footprint ?? 1, lane: def.lane ?? null, source: def.source ?? null,
    workerCapacity: kind === 'practice' ? getDetailedPracticeWorkerCapacity(def, tier) : 0,
    workerBonus: def.workerBonus ?? 1, workers: workers?.tokens?.length ?? 0,
    fill: def.lane === 'charge' ? Math.min(1, requiredWork ? (slot?.work ?? 0) / requiredWork : (slot?.charge ?? 0) / threshold)
      : (state?.tSec ?? 0) <= 0 ? 0 : (((state?.tSec ?? 0) - offset) % period + period) % period / period,
    detailLines: [...inputs.map(input => `${input.kind === 'consume' ? 'Consume' : 'Require (not consumed)'} ${input.amount} [${input.traits.join(' / ')}].`), ...production.filter(row => row.season).map(row => row.label), ...(production.length ? ['Face yields are base amounts; worker bonuses and local modifiers apply at activation.'] : []), ...(slot?.qualityBonus?[`Quality: +${slot.qualityBonus*25}% numeric Structure bonuses.`]:[]),...(evaluation?.missing ? [`Missing ${evaluation.missing.kind}: [${evaluation.missing.traits.join(" / ")}] to the left`] : []), ...(evaluation?.providers ?? []).map(p => `${p.kind === "consume" ? "Consume" : "Require"} ${p.amount} from slot ${p.slotIndex + 1}: ${p.practiceId}`),...(kind === 'structure' ? describeStructureValues(def) : []), ...describeGamepieceEffects(def), ...(def.nonfunctionalEffects ?? []),
      ...(kind === 'practice' ? [`Workers: ${getDetailedPracticeWorkerCapacity(def, tier)} sockets${producesStock ? `; +${number((def.workerBonus ?? 1) * 100)}% Stock per effective worker.` : '; staffing may satisfy specialist requirements.'}`,
        def.lane === 'charge' ? requiredWork ? `Birth adds construction work.` : `Activates at ${threshold} charge. Each matching activation contributes one charge.`
          : `Scheduled: ${def.source?.cadence ?? def.activation.type}.`] : [`Construction footprint: ${def.footprint ?? 1} horizontal cells.`])],
  };
}
