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
import { emitPracticeEvent, practiceEventJournal, tracePracticeEvent, withPracticeRoot } from './practice-events.js';
import { stockTraits, stockProviderSlots, stockProviderSlot } from './stock.js';
import { getConnectedRegionIds } from '../world-state.js';

export function validateDetailedPracticeDefinitions() {
  const errors = [];
  for (const [id, def] of Object.entries(detailedSettlementPracticeDefs)) {
    if (def.id !== id || !Number.isInteger(def.workerCapacity)) errors.push(`${id}: invalid identity/workers`);
    if (!['scheduled','charge'].includes(def.mode) || def.lane !== def.mode || (def.mode === 'charge') !== (def.activation.type === 'charge')) errors.push(`${id}: invalid mode`);
    if (def.mode === 'charge' && (!def.charge?.trigger?.any?.length || !Number.isInteger(def.charge.gain) || def.charge.gain < 1 || !Number.isInteger(def.charge.threshold) || def.charge.threshold < 1)) errors.push(`${id}: invalid Charge grammar`);
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
    const signatures = new Set(stockProviderSlots(state, settlement).filter(s => (s.slot?.stock ?? 0) > 0).map(s => stockTraits(state, s.slot).slice().sort().join('|')));
    if (signatures.size < 2) return false;
  }
  if (def.condition === 'ruins' && !adjacentRegionIds(state, site.regionId).some(id => getRegionState(state, id)?.lostAtSec != null || getRegionState(state, id)?.monster)) return false;
  if (def.condition === 'deaths' && !(settlement.history?.lastDeathSec === state.tSec)) return false;
  if (def.condition === 'chaos' && !(state.civilization.chaos.lastMoonIncome?.totalIncome > 0)) return false;
  if (def.condition === 'externalConnection' && !getConnectedRegionIds(state,site.regionId).some(id=>['frontier','external-a'].includes(getRegionState(state,id)?.controller))) return false;
  if (def.minimumSupportRequired && getMartialSupportForCondition(state,site.regionId)<def.minimumSupportRequired) return false;
  if (def.positiveSupportRequired && !(getMartialSupportForCondition(state,site.regionId) > 0)) return false;
  if (def.minimumWarriors && specialistCount(settlement,'warrior') < def.minimumWarriors) return false;
  if (def.connectedSupportRequired && !getConnectedRegionIds(state,site.regionId).some(id => getRegionState(state,id)?.controller === 'player' && specialistCount(getDetailedSettlement(state,id),'warrior') > 0)) return false;
  if (def.minimumStockedMilitary && stockProviderSlots(state,settlement).filter(s => s.slot?.stock > 0 && stockTraits(state,s.slot).some(t => ['Arms','Protection','Mobility','Power'].includes(t))).length < def.minimumStockedMilitary) return false;
  return true;
}

// Positive manpower support avoids recursively evaluating supplied Practice bonuses.
const getMartialSupportForCondition = (state,id) => Math.floor(specialistCount(getDetailedSettlement(state,id),'warrior') / 5);

function practiceEffectAmount(state, site, assignment, effect, activationType = null) {
  const settlement=site.detailedState, slot=settlement.practiceSlots[assignment.slotIndex];
  const def=getDetailedPracticeDef(state,slot.practiceId);
  activationType??=def.activation.type;
  let amount=effect.activationAmounts?.[activationType] ?? (activationType==='season'?effect.seasonAmounts?.[getCurrentSeasonKey(state)]:undefined) ?? effect.amount ?? 0;
  const modifiers=structureModifiers(state,settlement);
  if (effect.populationBand) amount+=Math.min(3+modifiers.reduce((n,m)=>n+(m.kind==='scalingCap'&&matchesPractice(state,slot,m.query,isScholarStaffed(assignment))?m.amount:0),0),Math.floor(getPopulationSummary(state,site.regionId).total/effect.populationBand));
  if (effect.historyScale==='losses') amount+=Math.min(4,state.civilization.history?.lostSettlements??0);
  if (effect.historyScale==='deaths') amount+=Math.min(2,settlement.history?.deaths??0);
  if (effect.historyScale==='deathsSinceSpring' && activationType==='season') amount+=Math.min(1,Math.max(0,(settlement.history?.deaths??0)-(settlement.history?.springDeaths??0)));
  if (effect.localDeathScale) amount+=Math.min(effect.localDeathCap??2,settlement.history?.lastDeathCount??0);
  if (effect.externalConnectionScale) amount+=Math.min(3,getConnectedRegionIds(state,site.regionId).filter(id=>getRegionState(state,id)?.controller==='external-a').length);
  if (effect.op==='generateStock') {
    amount+=modifiers.reduce((sum,m)=>sum+(m.kind==='output'&&matchesPractice(state,slot,m.query,isScholarStaffed(assignment))?m.amount:0),0);
    const seasonal=settlement.seasonalFoodBoost;
    if (def.activation.type==='season' && def.tags.includes('Food') && def.stockTraits.includes('Edible') && seasonal?.year===state.year
      && seasonal.practiceId===def.id && !seasonal.seasons.includes(getCurrentSeasonKey(state))) amount+=seasonal.amount;
    amount=Math.floor(amount*(1+assignment.effectiveWorkers*def.workerBonus));
  }
  amount+=modifiers.reduce((n,m)=>n+(m.kind==='effectBonus'&&matchesPractice(state,slot,m.query,isScholarStaffed(assignment))?m.amount:0),0);
  return amount;
}

export function getChargeThreshold(state,settlement,slot,staffed=false) {
  const def=getDetailedPracticeDef(state,slot?.practiceId);
  if (def?.mode!=='charge') return null;
  return Math.max(1,Math.floor(def.charge.threshold-structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='chargeThresholdReduction'&&matchesPractice(state,slot,m.query,staffed)?m.amount:0),0)));
}

function recipePlan(state,site,assignment) {
  const settlement=site.detailedState, slot=settlement.practiceSlots[assignment.slotIndex],def=getDetailedPracticeDef(state,slot?.practiceId);
  if (!conditionsMet(state,site,def,assignment)) return {ok:false,reason:def.scholarRequired&&!isScholarStaffed(assignment)?'Requires a Scholar worker':'State / population requirements not satisfied',providers:[]};
  const plan=planStock(state,settlement,def.consume,def.require,slot,isScholarStaffed(assignment));
  if (!plan.ok) return {...plan,reason:`Missing ${plan.missing.kind}: ${plan.missing.amount} [${plan.missing.traits.join(' / ')}]`};
  if (def.distinctTechnicalProviders) {
    const technical=stockProviderSlots(state,settlement).filter(s=>s.slot?.stock>0 && getDetailedPracticeDef(state,s.slot.practiceId)?.tags.includes('Knowledge') && !plan.providers.some(p=>p.kind==='consume'&&p.regionId===s.regionId&&p.slotIndex===s.slotIndex)).map(s=>({...s,tags:getDetailedPracticeDef(state,s.slot.practiceId).tags.slice().sort().join('|')}));
    const selected=technical.filter((s,i)=>technical.findIndex(t=>t.tags===s.tags)===i).slice(0,def.distinctTechnicalProviders);
    if (selected.length<def.distinctTechnicalProviders) return {ok:false,providers:[],reason:'Requires two differently-tagged technical providers'};
    plan.providers.push(...selected.map(p=>({kind:'consume',regionId:p.regionId,slotIndex:p.slotIndex,practiceId:p.slot.practiceId,amount:1,traits:stockTraits(state,p.slot)})));
  }
  if (def.mode==='charge' && def.effects.some(e=>e.op==='generateStock')) {
    const spent=plan.providers.filter(p=>p.kind==='consume'&&p.regionId===site.regionId&&p.slotIndex===assignment.slotIndex).reduce((n,p)=>n+p.amount,0);
    if ((slot.stock??0)-spent>=stockCapacity(state,settlement,slot,isScholarStaffed(assignment))) return {ok:false,providers:[],reason:'Stock capacity is full'};
  }
  if (def.mode==='charge' && def.effects.every(e=>e.op==='train') && Object.values(settlement.populationByClass).every(c=>c.adults<=c.specialists.scholar.adults+c.specialists.warrior.adults)) return {ok:false,providers:[],reason:'No unclassed adults available for training'};
  const external=def.externalAction?resolveExternalPractice(state,site,def,false):{ok:true,bonus:0};
  return external.ok?{...plan,external}:{ok:false,providers:[],reason:'No eligible external target'};
}

export function buildDetailedPracticeEvaluation(state, site, assignment) {
  const slot = site?.detailedState?.practiceSlots?.[assignment.slotIndex];
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  if (!def) return null;
  const plan = recipePlan(state,site,assignment);
  const threshold=getChargeThreshold(state,site.detailedState,slot,isScholarStaffed(assignment));
  const charge=threshold==null?null:Math.min(threshold,slot.charge??0);
  return { practiceId: def.id, label: def.label, workerCapacity: def.workerCapacity, activation: def.activation, rule: def.ui.rule,
    mode:def.mode,charge,chargeThreshold:threshold,chargeTrigger:def.charge?.triggerText??null,dischargeEffect:def.charge?.dischargeText??null,
    ready:threshold!=null&&charge>=threshold,blocked:threshold!=null&&charge>=threshold&&!plan.ok,blockedReason:threshold!=null&&charge>=threshold&&!plan.ok?plan.reason:null,
    stock: slot.stock ?? 0, stockCapacity: stockCapacity(state, site.detailedState, slot, isScholarStaffed(assignment)), stockTraits: def.stockTraits,
    providers: plan.providers, missing: plan.missing ?? null, supplied: plan.ok,
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
      if (!def || def.mode !== 'scheduled' || !(def.activation.type === activationType || def.activation.also?.includes(activationType)) || (stage && def.activation.stage !== stage)) continue;
      if (activationType==='season' && def.activation.seasonKeys && !def.activation.seasonKeys.includes(getCurrentSeasonKey(state))) continue;
      if (def.cadenceMoons && Math.floor(state.tSec / (getGameSetting(state, 'phaseDurationSec') * 6)) % def.cadenceMoons) continue;
      if (def.activation.conditions?.[activationType] && !conditionsMet(state,site,{...def,condition:def.activation.conditions[activationType]},assignment)) continue;
      const plan = recipePlan(state,site,assignment);
      if (!plan.ok) continue;
      withPracticeRoot(state,{kind:'scheduledActivation',regionId:site.regionId,practiceId:def.id,activationType},()=>resolveRecipe(state,site,assignment,plan,false,activationType));
      flushPracticeEvents(state);
    }
  }
}

function resolveRecipe(state,site,assignment,plan,discharge,activationType=null) {
  const settlement=site.detailedState,slot=settlement.practiceSlots[assignment.slotIndex],def=getDetailedPracticeDef(state,slot.practiceId);
  const staffed=isScholarStaffed(assignment);
  // Evaluate at activation start, before any input or output changes query results.
  const amounts=def.effects.map(e=>practiceEffectAmount(state,site,assignment,e,activationType));
  applyStockPlan(state,settlement,plan);
  const consumed=plan.providers.filter(p=>p.kind==='consume');
  if (consumed.length) emitPracticeEvent(state,{kind:'stockConsumed',regionId:site.regionId,practiceId:def.id,slotIndex:assignment.slotIndex,
    traits:[...new Set(consumed.flatMap(p=>stockTraits(state,stockProviderSlot(state,settlement,p))))],tags:getPracticeTags(state,def.id,assignment),pool:def.pool,providers:consumed});
  if (def.externalAction) resolveExternalPractice(state,site,def,true,plan.external);
  // Reset before emitting reactions; newly earned Charge survives this root chain.
  if (discharge) slot.charge=0;
  for (const [index,effect] of def.effects.entries()) {
    const amount=amounts[index];
    if (effect.op==='generateStock') generateStock(state,settlement,slot,amount+plan.external.bonus,staffed);
    else if (!site.neutral) {
      if (effect.op==='research') state.civilization.research.total+=amount;
      if (effect.op==='train') trainSpecialists(settlement,effect.classId,amount*(staffed&&effect.classId==='scholar'?2:1));
      if (effect.op==='addHousingForPhase') getPhaseModifiers(state).housingByRegion[site.regionId]=(getPhaseModifiers(state).housingByRegion[site.regionId]??0)+amount;
      if (effect.op==='reduceLocalFoodRequirement') getPhaseModifiers(state).foodByRegion[site.regionId]=(getPhaseModifiers(state).foodByRegion[site.regionId]??0)+amount;
      if (effect.op==='addFaithChaosResistance') getPhaseModifiers(state).faithResistance+=amount;
      if (effect.op==='bankCandidateDevelopment') {
        const bank=state.civilization.candidateDevelopment??={scholar:0,warrior:0}; bank[effect.classId]+=Math.floor(amount);
        emitPracticeEvent(state,{kind:'candidateDevelopmentBanked',regionId:site.regionId,classId:effect.classId,amount});
      }
      if (effect.op==='bankShopQuality') settlement.shopQualityBonus=Math.min(3,(settlement.shopQualityBonus??0)+amount);
      if (effect.op==='bankSupport') {
        const bank=settlement.supportBank??={}; bank[effect.bank]=Math.min(10,(bank[effect.bank]??0)+amount);
      }
      if (effect.op==='bankPreview') settlement.previewBonus=Math.min(3,(settlement.previewBonus??0)+amount);
      if (effect.op==='boostSeasonalFood') {
        const producer=settlement.practiceSlots.find(s=>{const d=getDetailedPracticeDef(state,s?.practiceId);return d?.activation.type==='season'&&d.tags.includes('Food')&&d.stockTraits.includes('Edible');});
        if (producer && settlement.seasonalFoodBoost?.year!==state.year) settlement.seasonalFoodBoost={year:state.year,practiceId:producer.practiceId,amount,seasons:[]};
      }
    }
  }
  if (def.activation.type==='season' && settlement.seasonalFoodBoost?.practiceId===def.id) {
    const season=getCurrentSeasonKey(state);if (!settlement.seasonalFoodBoost.seasons.includes(season)) settlement.seasonalFoodBoost.seasons.push(season);
  }
  const journal=practiceEventJournal(state);
  tracePracticeEvent(state,{kind:discharge?'discharged':'activated',regionId:site.regionId,targetPracticeId:def.id,slotIndex:assignment.slotIndex,rootId:journal.activeRoot,parentId:journal.activeEvent,providers:plan.providers});
  emitPracticeEvent(state,{kind:'practiceResolved',regionId:site.regionId,practiceId:def.id,slotIndex:assignment.slotIndex,discharge});
}

function matchesEvent(state,site,assignment,event,trigger) {
  if (trigger.anotherPractice && event.practiceId===assignment.practiceId && event.regionId===site.regionId) return false;
  return trigger.any.some(clause=>{
    if (event.kind!==clause.kind) return false;
    if (clause.scope!=='civilization' && event.regionId!==site.regionId) {
      if (clause.scope==='adjacent' && !adjacentRegionIds(state,site.regionId).includes(event.regionId)) return false;
      if (clause.scope==='connected' && !getConnectedRegionIds(state,site.regionId).includes(event.regionId)) return false;
      if (!['adjacent','connected'].includes(clause.scope)) return false;
    }
    return (!clause.traitsAny || clause.traitsAny.some(t=>event.traits?.includes(t)))
      && (!clause.tagsAny || clause.tagsAny.some(t=>event.tags?.includes(t)))
      && (!clause.scholarStaffed || event.scholarStaffed)
      && (!clause.pool || event.pool===clause.pool)
      && (!clause.classId || event.classId===clause.classId)
      && (!clause.premature || event.premature)
      && (!clause.martial || event.martial)
      && (!clause.actionKindsAny || clause.actionKindsAny.includes(event.actionKind))
      && (!clause.minimumSources || event.sourceRegionIds?.length>=clause.minimumSources);
  });
}

// FIFO authored events; all gains for one event precede left-to-right ready recipes.
// Each slot may Discharge once per root, even if it refills before the chain ends.
export function flushPracticeEvents(state) {
  const journal=practiceEventJournal(state);
  if (journal.activeRoot!=null) return; // a recipe is still emitting its effects
  const cap=getGameSetting(state,'practiceReactionResolutionCap');
  while (journal.pending.length) {
    const rootId=journal.pending[0].rootId, discharged=new Set();
    let resolutions=0,events=0;
    try {
      while (journal.pending.some(e=>e.rootId===rootId)) {
        const index=journal.pending.findIndex(e=>e.rootId===rootId),event=journal.pending.splice(index,1)[0];
        journal.activeRoot=rootId;journal.activeEvent=event.id;
        tracePracticeEvent(state,event);
        const sites=getDetailedSettlementSites(state).filter(s=>['player','external-a'].includes(getRegionState(state,s.regionId)?.controller));
        for (const site of sites) {
          const settlement=site.detailedState;
          for (const assignment of assignDetailedSettlementWorkers(state,site.regionId)) {
            const slot=settlement.practiceSlots[assignment.slotIndex],def=getDetailedPracticeDef(state,slot?.practiceId);
            if (def?.mode!=='charge') continue;
            const threshold=getChargeThreshold(state,settlement,slot,isScholarStaffed(assignment));
            slot.charge=Math.min(threshold,slot.charge??0);
            if (matchesEvent(state,site,assignment,event,def.charge.trigger)) {
              const gain=Math.floor(def.charge.gain+structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='chargeGain'&&matchesPractice(state,slot,m.query,isScholarStaffed(assignment))?m.amount:0),0));
              const before=slot.charge;slot.charge=Math.min(threshold,slot.charge+gain);
              if (slot.charge>before) tracePracticeEvent(state,{kind:'chargeGained',rootId,parentId:event.id,regionId:site.regionId,targetPracticeId:def.id,slotIndex:assignment.slotIndex,amount:slot.charge-before,charge:slot.charge,threshold});
            }
          }
        }
        for (const site of sites) for (const assignment of assignDetailedSettlementWorkers(state,site.regionId)) {
          const slot=site.detailedState.practiceSlots[assignment.slotIndex],def=getDetailedPracticeDef(state,slot?.practiceId);
          if (def?.mode!=='charge' || (slot.charge??0)<getChargeThreshold(state,site.detailedState,slot,isScholarStaffed(assignment))) continue;
          if (event.regionId!==site.regionId && !matchesEvent(state,site,assignment,event,def.charge.trigger)) continue;
          const key=`${site.regionId}:${assignment.slotIndex}`;
          if (discharged.has(key)) {
            tracePracticeEvent(state,{kind:'cascadeDeferred',rootId,parentId:event.id,regionId:site.regionId,targetPracticeId:def.id,reason:'Already Discharged in this root chain'});continue;
          }
          const plan=recipePlan(state,site,assignment);
          if (!plan.ok) {
            tracePracticeEvent(state,{kind:'dischargeBlocked',rootId,parentId:event.id,regionId:site.regionId,targetPracticeId:def.id,reason:plan.reason});continue;
          }
          if (resolutions>=cap) break;
          discharged.add(key);resolutions++;resolveRecipe(state,site,assignment,plan,true);
        }
        if (++events>=cap || resolutions>=cap) {
          tracePracticeEvent(state,{kind:'cascadeSafetyCap',rootId,parentId:event.id,reason:`Practice reaction safety cap ${cap} reached; remaining root events stopped`});
          journal.pending=journal.pending.filter(e=>e.rootId!==rootId);break;
        }
      }
    } finally { delete journal.activeRoot;delete journal.activeEvent; }
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
