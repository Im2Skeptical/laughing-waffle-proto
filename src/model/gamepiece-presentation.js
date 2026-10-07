import { getActionChaosCost } from './detailed-settlements/practice-events.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from './game-config.js';
import { getDetailedPracticeWorkerCapacity, getQualityMultiplier } from './detailed-practice-tiers.js';
import { getMoonPhaseDurationSec, getMoonCycleDurationSec } from './moon-phases.js';
import { MOON_PHASE_INDEX_BY_ID } from '../defs/gamesettings/moon-phase-defs.js';
import { getRegionReference } from './world-state.js';
import { getPracticeReading } from './practice-reading.js';
import { getStructureReading } from './structure-reading.js';

export const GAMEPIECE_OUTPUTS = Object.freeze({
  food: { label: 'Food', icon: 'food' }, money: { label: 'Money', icon: 'money' },
  research: { label: 'Research', icon: 'research' },
  housingCapacity: { label: 'Housing capacity', icon: 'housingCapacity' },
  foodCapacity: { label: 'Food capacity', icon: 'foodCapacity' },
});

const number = value => Math.round(value * 100) / 100;

// These describe the event grammar, never the recipe's Stock inputs. Keep
// alternatives distinct when the same Trait can trigger by generation or use.
function chargeTriggerSymbols(def) {
  const events={populationDied:'death',chaosIncreased:'chaos',monsterPressure:'monster',monsterDestroyed:'monster',defenseSucceeded:'defense',supportContributed:'support',martialActionResolved:'support',dangerSurvived:'danger',campaignWon:'campaign',externalTrade:'trade',challengeCompleted:'challenge',candidateDevelopment:'development'};
  return (def.charge?.trigger?.any??[]).flatMap(event=>{
    const common={event:event.kind,label:def.charge.triggerText};
    if(event.traitsAny?.length)return event.traitsAny.map(trait=>({...common,trait}));
    return [{...common,icon:events[event.kind]??(event.scholarStaffed||event.tagsAny?.includes('Knowledge')?'knowledge':'stock')}];
  }).filter((symbol,i,all)=>all.findIndex(other=>other.event===symbol.event&&other.trait===symbol.trait&&other.icon===symbol.icon)===i);
}
export function describeGamepieceEffects(def) {
  const labels={generateStock:'Stock',research:'Research',train:'specialists trained',reduceLocalFoodRequirement:'Edible saved per meal',addHousingForPhase:'Housing this phase',addFaithChaosResistance:'Chaos resistance'};
  return (def.effects??[]).filter(effect=>effect.op!=='addChaos').map(effect=>`${effect.amount??0} ${labels[effect.op]??effect.op}${effect.classId?' ('+effect.classId+')':''}${effect.historyScale?' + accumulated '+effect.historyScale:''}.`);
}

function describeStructureValues(def) {
  return [...(def.housing?[`${def.housing} Housing. Numeric bonuses from duplicate structures add.`]:[]),...(def.candidateBonus?[`+${def.candidateBonus} to future ${def.pool} candidates from this settlement while active.`]:[])];
}

const seasonBoundaryOffsets = new Map();
function seasonBoundaryOffset(duration) {
  if (!seasonBoundaryOffsets.has(duration)) {
    // Match the calendar's 60 additions per second. Depending on the configured
    // duration, floating-point accumulation crosses on the boundary second or
    // one second later. Measure once per duration without advancing game state.
    let clock = 0, ticks = 0;
    while (clock < duration) { clock += 1 / 60; ticks++; }
    seasonBoundaryOffsets.set(duration, Math.ceil(ticks / 60) - duration);
  }
  return seasonBoundaryOffsets.get(duration);
}

function seasonalReadiness(state, activation) {
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  const duration = Number.isFinite(state?.seasonDurationSec) && state.seasonDurationSec > 0 ? state.seasonDurationSec : 8;
  const time = Math.max(0, state?.tSec ?? 0);
  const authoredSeasons = activation.seasonKeys?.filter(season => seasons.includes(season));
  const relevant = authoredSeasons?.length ? authoredSeasons : seasons;
  const offset = seasonBoundaryOffset(duration);
  // Seasonal activation is consumed at the next whole-second simulation tick.
  // The opening spring has no season-change event; its first repeat is year 2.
  const boundary = Math.max(1, Math.floor((time - offset) / duration) + 1);
  let next = boundary, previous = boundary - 1;
  while (!relevant.includes(seasons[next % 4])) next++;
  while (previous > 0 && !relevant.includes(seasons[previous % 4])) previous--;
  const nextSec = next * duration + offset, previousSec = previous > 0 ? previous * duration + offset : 0;
  return { nextTrigger: { season: seasons[next % 4], tSec: nextSec }, fill: (time - previousSec) / (nextSec - previousSec) };
}

export function getGamepieceFace(state, kind, id, tier = 'bronze', { evaluation = null, workers = null, slot = null, settlement = null, activationTrace = [] } = {}) {
  const def = kind === 'practice' ? getDetailedPracticeDef(state, id) : getDetailedStructureDef(state, id);
  if (!def) return null;
  const construction = kind === 'structure' && slot?.construction ? {
    completedCycles: slot.construction.completedCycles,
    requiredCycles: def.construction.cycles,
    activation: def.construction.activation,
  } : null;
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
  const threshold = evaluation?.chargeThreshold ?? def.charge?.threshold ?? 1;
  const requiredWork = def.effects?.find(e => e.op === 'createLocalStructureAtWork')?.requiredWork;
  const seasonal = def.activation?.type === 'season';
  const seasonReadiness = seasonal ? seasonalReadiness(state, def.activation) : null;
  const period = getMoonCycleDurationSec(state);
  const offset = 1 + (MOON_PHASE_INDEX_BY_ID[construction?.activation.type ?? def.activation?.type] ?? 0) * getMoonPhaseDurationSec(state);
  const viewedTime = state?.tSec ?? 0;
  const lastReaction = activationTrace.filter(entry => ['activated','discharged'].includes(entry.kind) && entry.targetPracticeId === id && entry.tSec <= viewedTime).at(-1);
  const activationAge = slot && lastReaction ? viewedTime - lastReaction.tSec : null;
  // Face-only recipe data. These are authored base yields; evaluation remains
  // authoritative for worker bonuses, local modifiers and the actual result.
  const effectIcons = { generateStock: 'stock', research: 'research', train: 'population', addHousingForPhase: 'housingCapacity', addFaithChaosResistance: 'faith', reduceLocalFoodRequirement: 'food', bankCandidateDevelopment:'prestige', bankShopQuality:'activation', bankSupport:'support', bankPreview:'hourglass' };
  const production = (def.effects ?? []).flatMap(effect => {
    const icon = effectIcons[effect.op];
    if (!icon) return [];
    const seasons = effect.seasonAmounts ?? (def.activation?.type === 'season' && def.activation.seasonKeys?.length
      ? Object.fromEntries(def.activation.seasonKeys.map(season => [season, effect.amount ?? 0])) : null);
    return seasons ? Object.entries(seasons).map(([season, value]) => ({ season, icon, value, label: `${season}: ${value} base ${icon}` }))
      : [{ icon, value: effect.amount ?? 0, label: `${effect.amount ?? 0} base ${icon}` }];
  });
  const inputs = construction ? def.construction.consume.map(input => ({ kind:'consume', amount:input.amount, traits:[...input.traits] }))
    : ['consume', 'require'].flatMap(kind => (def[kind] ?? []).map(input => ({ kind, amount: input.amount, traits: [...input.traits] })));
  const chaosCost=getActionChaosCost(def);
  if (chaosCost) inputs.push({kind:'chaos',amount:chaosCost,traits:[],icon:'chaos'});
  const producesStock = (def.effects ?? []).some(effect => effect.op === 'generateStock');
  const workerMultiplier = producesStock || def.mode==='charge' ? number(1 + (workers?.effectiveWorkers ?? 0) * (def.workerBonus ?? 1)) : 1;
  const reading = kind === 'practice' ? getPracticeReading(def) : getStructureReading(def, {slot, settlement});
  return { kind, definitionId: id, label: def.label, tier, tags: [...new Set([...(def.tags ?? []),...(workers?.tokens?.some(t=>t.specialist==='scholar')?['Knowledge']:[])])], qualityLabel: tier, rule: def.ui?.rule ?? '',
    inputs, chaosCost, production, workerMultiplier, chargeTriggers:chargeTriggerSymbols(def), construction,
    reading, structureBonuses: kind === 'structure' ? reading.bonuses : [], structureQualityBonus: kind === 'structure' ? slot?.qualityBonus ?? 0 : 0,
    chargeGain:def.mode==='charge'?(evaluation?.chargeGain??Math.floor(def.charge.gain*workerMultiplier)):null,
    stock: evaluation?.stock ?? slot?.stock ?? 0, stockCapacity: evaluation?.stockCapacity ?? def.stockCapacity ?? 0, stockTraits: def.stockTraits ?? [],
    providers: evaluation?.providers ?? [],
    mode:def.mode??null,charge:evaluation?.charge??slot?.charge??0,chargeThreshold:def.mode==='charge'?threshold:null,
    chargeTrigger:def.charge?.triggerText??null,dischargeEffect:def.charge?.dischargeText??null,
    blocked:evaluation?.blocked??false,blockedReason:evaluation?.blockedReason??null,
    viewedTime, activationAge, nextTrigger: seasonReadiness?.nextTrigger ?? null,
    outputs, footprint: def.footprint ?? 1, lane: def.lane ?? null, source: def.source ?? null,
    workerCapacity: kind === 'practice' ? getDetailedPracticeWorkerCapacity(def, tier) : 0,
    workerBonus: def.workerBonus ?? 1, workers: workers?.tokens?.length ?? 0,
    fill: def.lane === 'charge' ? Math.min(1, requiredWork ? (slot?.work ?? 0) / requiredWork : (evaluation?.charge ?? slot?.charge ?? 0) / threshold)
      : seasonReadiness?.fill ?? ((state?.tSec ?? 0) <= 0 ? 0 : (((state?.tSec ?? 0) - offset) % period + period) % period / period),
    detailLines: [...inputs.filter(input=>input.kind!=='chaos').map(input => `${input.kind === 'consume' ? 'Consume' : 'Require (not consumed)'} ${input.amount} [${input.traits.join(' / ')}].`), ...(inputs.some(input=>input.kind!=='chaos') ? ['Uses local Stock first, then player settlements that are both adjacent and connected.'] : []), ...production.filter(row => row.season).map(row => row.label), ...(production.length ? [def.mode==='charge'?'Face yields are base amounts; local modifiers apply on Discharge. Workers multiply incoming Charge only.':'Face yields are base amounts; worker bonuses and local modifiers apply at activation.'] : []), ...(slot?.qualityBonus?[`Quality: +${slot.qualityBonus*25}% numeric Structure bonuses.`]:[]),...(evaluation?.missing ? [`Missing ${evaluation.missing.kind}: [${evaluation.missing.traits.join(" / ")}] locally or in adjacent connected player settlements`] : []), ...(evaluation?.providers ?? []).map(p => `${p.kind === "consume" ? "Consume" : "Require"} ${p.amount} from ${getRegionReference(state,p.regionId) ?? 'local'} slot ${p.slotIndex + 1}: ${p.practiceId}`),...(kind === 'structure' ? describeStructureValues(def) : []), ...describeGamepieceEffects(def), ...(def.nonfunctionalEffects ?? []),
      ...(kind === 'practice' ? [`Workers: ${getDetailedPracticeWorkerCapacity(def, tier)} sockets${def.mode==='charge'||producesStock ? `; +${number((def.workerBonus ?? 1) * 100)}% ${def.mode==='charge'?'Charge gained (not output)':'Stock'} per effective worker.` : '; staffing may satisfy specialist requirements.'}`,
        def.lane === 'charge' ? `When its authored event occurs, gain ${evaluation?.chargeGain??Math.floor(def.charge.gain*workerMultiplier)} Charge; automatically Discharge at ${threshold}. No Stock consumed or required. Icons above the meter are Charge triggers; arrows distinguish Stock generated (up) from consumed (down).`
          : `Scheduled: ${def.source?.cadence ?? def.activation.type}.`] : [`Construction footprint: ${def.footprint ?? 1} horizontal cells.`]),
      ...(def.mode==='charge'?[`Charge: ${evaluation?.charge??slot?.charge??0} / ${threshold}.`,def.charge.triggerText,`Discharge: ${def.charge.dischargeText.replaceAll('to the left','on the board')}`,...(evaluation?.blocked?[`Blocked: ${evaluation.blockedReason}`]:[])]:[]),
      ...(def.provisionalNotes??[])],
  };
}
