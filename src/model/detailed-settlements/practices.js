import { assignDetailedSettlementWorkers, isScholarStaffed } from './workers.js';
// Shared declarative Practice resolution; all temporal material state belongs to slots.
import { detailedSettlementPracticeDefs, detailedSettlementEffectOps } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { getDetailedPracticeDef, getDetailedStructureDef, getGameSetting } from '../game-config.js';
import { getCurrentSeasonKey } from '../state.js';
import { getRegionState } from '../world-state.js';
import { getDetailedSettlement, getDetailedSettlementSites, getPopulationSummary } from './queries.js';
import { stockCapacity, planStock, applyStockPlan, generateStock, specialistCount, trainSpecialists, structureModifiers, matchesPractice } from './stock.js';
import { resolveExternalPractice, adjacentRegionIds } from './external-world.js';
import { applyBuild, findStructurePlacement } from '../structure-layout.js';

export function validateDetailedPracticeDefinitions() {
  const errors = [];
  for (const [id, def] of Object.entries(detailedSettlementPracticeDefs)) {
    if (def.id !== id || !Number.isInteger(def.workerCapacity)) errors.push(`${id}: invalid identity/workers`);
    for (const effect of def.effects) if (!detailedSettlementEffectOps.includes(effect.op)) errors.push(`${id}: unknown ${effect.op}`);
    for (const cost of [...def.consume, ...def.require]) {
      if (!cost.traits.some(trait => Object.values(detailedSettlementPracticeDefs).some(provider => ['common', def.pool].includes(provider.pool) && provider.stockTraits.includes(trait)))) errors.push(`${id}: missing provider ${cost.traits}`);
    }
  }
  return { ok: !errors.length, errors };
}

export { assignDetailedSettlementWorkers, isScholarStaffed } from './workers.js';
export function getPracticeTags(state, practiceId, assignment = null) {
  return [...new Set([...(getDetailedPracticeDef(state, practiceId)?.tags ?? []), ...(isScholarStaffed(assignment) ? ['Knowledge'] : [])])];
}
export function getLocalTaggedPieceCount(state, regionId, tag, { excludeStructureId = null } = {}) {
  const settlement = getDetailedSettlement(state, regionId);
  return assignDetailedSettlementWorkers(state, regionId).filter(a => getPracticeTags(state, a.practiceId, a).includes(tag)).length
    + (settlement?.structureSlots ?? []).filter(s => s && s.structureId !== excludeStructureId && getDetailedStructureDef(state, s.structureId)?.tags.includes(tag)).length;
}
export function getLocalDistinctPieceTags(state, regionId) {
  return [...new Set([...assignDetailedSettlementWorkers(state, regionId).flatMap(a => getPracticeTags(state, a.practiceId, a)), ...(getDetailedSettlement(state, regionId)?.structureSlots ?? []).flatMap(s => getDetailedStructureDef(state, s?.structureId)?.tags ?? [])])].sort();
}
export function getPhaseModifiers(state) { return state.civilization.phaseModifiers; }

function conditionsMet(state, site, def, assignment) {
  const settlement = site.detailedState;
  if (def.scholarRequired && !isScholarStaffed(assignment)) return false;
  if (def.specialistRequired && !specialistCount(settlement, def.specialistRequired)) return false;
  if (def.condition === 'diverseStock') {
    const signatures = new Set(settlement.practiceSlots.filter(s => (s?.stock ?? 0) > 0).map(s => getDetailedPracticeDef(state, s.practiceId)?.stockTraits.slice().sort().join('|')));
    if (signatures.size < 2) return false;
  }
  if (def.condition === 'ruins' && !adjacentRegionIds(state, site.regionId).some(id => getRegionState(state, id)?.lostAtSec != null || getRegionState(state, id)?.monster)) return false;
  if (def.condition === 'deaths' && !(settlement.history?.deaths > 0)) return false;
  if (def.condition === 'chaos' && !(state.civilization.chaos.lastMoonIncome?.totalIncome > 0)) return false;
  return true;
}

function practiceEffectAmount(state, site, assignment, effect) {
  const settlement=site.detailedState, slot=settlement.practiceSlots[assignment.slotIndex];
  const def=getDetailedPracticeDef(state,slot.practiceId);
  let amount=effect.seasonAmounts?.[getCurrentSeasonKey(state)] ?? effect.amount ?? 0;
  if (effect.populationBand) amount+=Math.min(3,Math.floor(getPopulationSummary(state,site.regionId).total/effect.populationBand));
  if (effect.historyScale==='losses') amount+=Math.min(4,state.civilization.history?.lostSettlements??0);
  if (effect.historyScale==='deaths') amount+=Math.min(2,settlement.history?.deaths??0);
  if (effect.op==='generateStock') {
    amount+=structureModifiers(state,settlement).reduce((sum,m)=>sum+(m.kind==='output'&&matchesPractice(state,slot,m.query,isScholarStaffed(assignment))?m.amount:0),0);
    amount=Math.floor(amount*(1+assignment.effectiveWorkers*def.workerBonus));
  }
  return amount;
}

export function buildDetailedPracticeEvaluation(state, site, assignment) {
  const slot = site?.detailedState?.practiceSlots?.[assignment.slotIndex];
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  if (!def) return null;
  const plan = planStock(state, site.detailedState, def.consume, def.require);
  return { practiceId: def.id, label: def.label, workerCapacity: def.workerCapacity, activation: def.activation, rule: def.ui.rule,
    stock: slot.stock ?? 0, stockCapacity: stockCapacity(state, site.detailedState, slot, isScholarStaffed(assignment)), stockTraits: def.stockTraits,
    providers: plan.providers, missing: plan.missing ?? null, supplied: plan.ok && conditionsMet(state, site, def, assignment),
    effects: def.effects.map(e => ({ op: e.op, scaledValue: { effectiveValue: practiceEffectAmount(state,site,assignment,e), baseValue: e.amount ?? 0, workerMultiplier: 1 + assignment.effectiveWorkers * def.workerBonus } })) };
}
export function evaluateDetailedPracticeSlot(state, regionId, slotIndex) {
  const site = getDetailedSettlementSites(state).find(s => s.regionId === regionId);
  return site ? buildDetailedPracticeEvaluation(state, site, assignDetailedSettlementWorkers(state, regionId)[slotIndex]) : null;
}

export function runPracticeActivation(state, activationType, stage = null) {
  for (const site of getDetailedSettlementSites(state)) {
    if (!['player', 'external-a'].includes(getRegionState(state, site.regionId)?.controller)) continue;
    const settlement = site.detailedState;
    for (const assignment of assignDetailedSettlementWorkers(state, site.regionId)) {
      const slot = settlement.practiceSlots[assignment.slotIndex];
      const def = getDetailedPracticeDef(state, slot?.practiceId);
      if (!def || def.activation.type !== activationType || (stage && def.activation.stage !== stage)) continue;
      if (def.activation.seasonKeys && !def.activation.seasonKeys.includes(getCurrentSeasonKey(state))) continue;
      if (def.cadenceMoons && Math.floor(state.tSec / (getGameSetting(state, 'phaseDurationSec') * 6)) % def.cadenceMoons) continue;
      if (!conditionsMet(state, site, def, assignment)) continue;
      const plan = planStock(state, settlement, def.consume, def.require);
      if (!plan.ok) continue;
      const external = def.externalAction ? resolveExternalPractice(state, site, def, false) : { ok: true, bonus: 0 };
      if (!external.ok) continue;
      applyStockPlan(settlement, plan);
      if (def.externalAction) resolveExternalPractice(state, site, def, true);
      const staffed = isScholarStaffed(assignment);
      for (const effect of def.effects) {
        const amount = practiceEffectAmount(state, site, assignment, effect);
        if (effect.op === 'generateStock') {
          generateStock(state, settlement, slot, amount + external.bonus, staffed);
        } else if (!site.neutral) {
          if (effect.op === 'research') state.civilization.research.total += amount;
          if (effect.op === 'train') trainSpecialists(settlement, effect.classId, amount * (staffed && effect.classId === 'scholar' ? 2 : 1));
          if (effect.op === 'addHousingForPhase') getPhaseModifiers(state).housingByRegion[site.regionId] = (getPhaseModifiers(state).housingByRegion[site.regionId] ?? 0) + amount;
          if (effect.op === 'reduceLocalFoodRequirement') getPhaseModifiers(state).foodByRegion[site.regionId] = (getPhaseModifiers(state).foodByRegion[site.regionId] ?? 0) + amount;
          if (effect.op === 'addFaithChaosResistance') getPhaseModifiers(state).faithResistance += amount;
        }
      }
      settlement.practiceActivationTrace = [...(settlement.practiceActivationTrace ?? []), { tSec: state.tSec, kind: 'activated', targetPracticeId: def.id, providers: plan.providers }].slice(-20);
    }
  }
}

export function tryCreateStructure(state, regionId, structureId) {
  const settlement = getDetailedSettlement(state, regionId);
  const def = getDetailedStructureDef(state, structureId);
  if (!settlement || !def) return false;
  const location = findStructurePlacement(settlement.structureSlots, def.footprint);
  if (!location.ok) return false;
  const result = applyBuild(settlement.structureSlots, { structureId, width: def.footprint, origin: location.origin, placementId: `${regionId}:${state.tSec}:${location.origin}` });
  if (result.ok) settlement.structureSlots = result.slots;
  return result.ok;
}
