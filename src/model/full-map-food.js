// Opening-only experiment: varied food boards and budgeted, direct allied supply.
// Runtime meals still use the normal Stock planner; no persistent supply grants.
import {getDetailedPracticeDef,getGameSetting} from './game-config.js';
import {getRegionState,getRegionDefinition,getAdjacentRegionIds,addWorldConnection} from './world-state.js';
import {stockCapacity,stockOutputBreakdown,CIV_CONTENT_TUNING} from './detailed-settlements/stock.js';
import {getPopulationSummary} from './detailed-settlements/queries.js';
import {assignDetailedSettlementWorkers,isScholarStaffed} from './detailed-settlements/workers.js';
import {getMoonCycleDurationSec} from './moon-phases.js';

const FOOD = ['forage','pastoralism','dryFarming'];
const foodSlot = (state,slot) => !!slot && getDetailedPracticeDef(state,slot.practiceId).stockTraits.includes('Edible');
const pick = (state,items) => items[Math.floor(state.rngNextFloat()*items.length)];
function chooseFood(state,regionId,excluded=[]) {
  const biome=getRegionDefinition(state,regionId)?.biome;
  const choices=biome==='plains'?['dryFarming','dryFarming','pastoralism']:biome==='forest'?['forage','forage','pastoralism']:['pastoralism','forage'];
  return pick(state,choices.filter(id=>!excluded.includes(id)));
}
function installFood(state,site,id) {
  const index=site.detailedState.practiceSlots.findIndex(slot=>!slot);
  if(index<0)return false;
  site.detailedState.practiceSlots[index]={practiceId:id,tier:'bronze',instanceId:`institution:${state.civilization.nextPracticeInstanceId++}`,charge:0,work:0,stock:0};
  return true;
}
function prioritizeFood(state,site) {
  const slots=site.detailedState.practiceSlots;
  site.detailedState.practiceSlots=[...slots.filter(s=>foodSlot(state,s)),...slots.filter(s=>s&&!foodSlot(state,s))];
  while(site.detailedState.practiceSlots.length<5)site.detailedState.practiceSlots.push(null);
}
// Conservative per-meal budget. Continuous producers reserve their own meals and
// all authored Edible/Grain consumes. Seasonal farms also need enough annual
// output AND storage to span the longest gap between their harvests.
function exportBudget(state,site) {
  const d=site.detailedState,assignments=assignDetailedSettlementWorkers(state,site.regionId);
  const seasonSec=getGameSetting(state,'seasonDurationSec'),cycle=getMoonCycleDurationSec(state);
  let production=0;
  for(const assignment of assignments) {
    const slot=d.practiceSlots[assignment.slotIndex],def=getDetailedPracticeDef(state,slot?.practiceId);
    if(!slot||!FOOD.includes(slot.practiceId)||def.consume.length||def.require.length)continue;
    const staffed=isScholarStaffed(assignment),capacity=stockCapacity(state,d,slot,staffed);
    const multiplier=stockOutputBreakdown(state,d,slot,staffed).multiplier*(1+assignment.effectiveWorkers*def.workerBonus);
    const effect=def.effects.find(e=>e.op==='generateStock');
    if(def.activation.type==='food')production+=Math.min(capacity,Math.floor(effect.amount*multiplier));
    else if(slot.practiceId==='dryFarming') {
      const annual=def.activation.seasonKeys.reduce((n,key)=>n+Math.min(capacity,Math.floor((effect.seasonAmounts?.[key]??effect.amount)*multiplier)),0);
      const mealsPerYear=Math.ceil(4*seasonSec/cycle),gapMeals=Math.ceil(3*seasonSec/cycle);
      production+=Math.floor(Math.min(annual/mealsPerYear,capacity/gapMeals));
    }
  }
  const recipeReserve=d.practiceSlots.filter(Boolean).reduce((n,slot)=>n+getDetailedPracticeDef(state,slot.practiceId).consume
    .reduce((sum,c)=>sum+(c.traits.some(t=>t==='Edible'||t==='Grain')?c.amount:0),0),0);
  const pop=getPopulationSummary(state,site.regionId);
  const growingMealDemand=Math.ceil((pop.total*1.25+1)/CIV_CONTENT_TUNING.populationPerEdible);
  return Math.max(0,production-growingMealDemand-pop.mealOverhead-recipeReserve);
}
export function seedFullMapFood(state) {
  const active=state.world.sites.filter(s=>!s.neutral&&s.simulationMode==='detailed');
  for(const site of active) {
    const slots=site.detailedState.practiceSlots,foods=slots.filter(s=>foodSlot(state,s));
    const two=site.regionId===state.civilization.remnant.capitalRegionId||state.rngNextFloat()<.08;
    const independent=foods.filter(s=>FOOD.includes(s.practiceId));
    let primary=independent.length?pick(state,independent):foods[0];
    if(site.regionId===state.civilization.remnant.capitalRegionId){
      const support=site.detailedState.structureSlots.find(slot=>slot?.placementId.endsWith(':support'));
      if(support)support.structureId='granary';
    }
    // A two-unit Forage host cannot carry the next meal band of a large town.
    if(primary?.practiceId==='forage'&&getPopulationSummary(state,site.regionId).total>30)primary.practiceId='pastoralism';
    const retained=new Set(primary?[primary]:[]);
    if(two&&foods.length>1)retained.add(foods.find(s=>s!==primary));
    site.detailedState.practiceSlots=slots.map(s=>foodSlot(state,s)&&!retained.has(s)?null:s);
    if(two&&primary&&retained.size<2)installFood(state,site,chooseFood(state,site.regionId,[primary.practiceId]));
    prioritizeFood(state,site);
  }
  const budgets=new Map(active.map(site=>[site.regionId,exportBudget(state,site)]));
  for(const site of active.filter(s=>!s.detailedState.practiceSlots.some(slot=>foodSlot(state,slot)))) {
    const own=getPopulationSummary(state,site.regionId),need=Math.ceil((own.total*1.25+1)/CIV_CONTENT_TUNING.populationPerEdible)+own.mealOverhead;
    const holder=getRegionState(state,site.regionId).controller;
    const candidates=getAdjacentRegionIds(state,site.regionId).filter(id=>getRegionState(state,id).controller===holder&&(budgets.get(id)??0)>=need);
    if(candidates.length) {
      const supplier=pick(state,candidates);addWorldConnection(state,site.regionId,supplier);
      budgets.set(supplier,budgets.get(supplier)-need);
    } else {
      installFood(state,site,chooseFood(state,site.regionId));prioritizeFood(state,site);
      budgets.set(site.regionId,exportBudget(state,site));
    }
  }
  for(const site of active) {
    for(const slot of site.detailedState.practiceSlots)if(slot&&'stock'in slot)
      slot.stock=slot.practiceId==='cp_ironCommunion'?2:stockCapacity(state,site.detailedState,slot);
    site.town.market.practices=site.detailedState.practiceSlots.filter(Boolean).map(s=>s.practiceId);
  }
  // Static towns need a viable single-source board when they first activate.
  // Their current storefront inventory and inactive population remain authored.
  for(const site of state.world.sites.filter(s=>s.neutral||s.simulationMode==='ruin')) {
    const market=site.neutral??site.town?.market;
    if(!market)continue;
    const nonFood=market.practices.filter(id=>!getDetailedPracticeDef(state,id).stockTraits.includes('Edible'));
    const existing=market.practices.find(id=>FOOD.includes(id));
    market.practices=[existing??pick(state,['forage','pastoralism']),...nonFood].slice(0,5);
  }
}

