import { allocatePopulation, selectPeople, populationBins, matchesPopulation, removePeople, transformPeople } from './population-ledger.js';
import { getRegionState, getAdjacentRegionIds, getConnectedRegionIds } from '../world-state.js';
import { getDetailedSettlement, getPopulationSummary } from './queries.js';
import { getDetailedStructureDef } from '../game-config.js';
import { planStock, stockCapacity } from './stock.js';
import { emitPracticeEvent } from './practice-events.js';
import { recordChaosLosses } from './phases/chaos.js';

const count = bins => bins.reduce((n,b)=>n+b.count,0);
export function planPopulationRecipe(state,site,slot,def,amounts,localOnly) {
  if(!def.populationConsume&&!def.populationRequire&&!def.populationCondition&&!def.effects.some(e=>e.op==='convertPopulation'))return {ok:true};
  const settlement=site.detailedState,beneficiary=slot.allegiance;
  if(def.populationCondition==='housed'&&getPopulationSummary(state,site.regionId).total>getPopulationSummary(state,site.regionId).housingCapacity)return {ok:false,reason:'Housing required for all residents'};
  if(def.populationCondition==='relief'&&!(settlement.mealRelief?.tSec===state.tSec&&settlement.mealRelief.faction===beneficiary&&settlement.mealRelief.amount>0&&settlement.mealRelief.fullyFed))return {ok:false,reason:'Requires actual allied meal relief after local shortage'};
  const victims=[],availableVictims=populationBins(settlement);
  for(const cost of def.populationConsume??[]){
    const selected=allocatePopulation(availableVictims.filter(b=>matchesPopulation(b,cost.filter,beneficiary)),cost.amount);
    if(count(selected)<cost.amount)return {ok:false,reason:'Missing eligible population victim'};
    for(const selectedBin of selected){const source=availableVictims.find(b=>b.classId===selectedBin.classId&&b.kind===selectedBin.kind&&b.age===selectedBin.age&&b.allegiance===selectedBin.allegiance&&b.specialty===selectedBin.specialty);source.count-=selectedBin.count;}
    victims.push(...selected);
  }
  for(const reserve of def.populationRequire??[]){const available=count(populationBins(settlement).filter(b=>matchesPopulation(b,reserve.filter,beneficiary)))-(reserve.other?count(victims.filter(b=>matchesPopulation(b,reserve.filter,beneficiary))):0);if(available<reserve.amount)return {ok:false,reason:'Population reserve would be violated'};}
  if(def.requireBaseHeadroom){const base=def.effects.filter(e=>e.op==='generateStock').reduce((n,e)=>n+(e.amount??0),0);if(stockCapacity(state,settlement,slot)-(slot.stock??0)<base)return {ok:false,reason:'Complete base yield must fit in hosted Stock'};}
  const conversions=[],extraConsume=[],extraRequire=[];
  const supports=(settlement.structureSlots??[]).filter(s=>s&&!s.construction&&s.upkeepActive!==false).filter((s,i,all)=>all.findIndex(o=>o.structureId===s.structureId)===i).map(s=>getDetailedStructureDef(state,s.structureId)?.conversionSupport).filter(Boolean);
  for(const [index,effect] of def.effects.entries())if(effect.op==='convertPopulation') {
    const remote=effect.reach==='connectedAdjacent'||slot.targetRegionId&&slot.targetRegionId!==site.regionId&&supports.some(s=>s.reach==='connectedAdjacent');
    const neighbours=getAdjacentRegionIds(state,site.regionId).filter(id=>getConnectedRegionIds(state,site.regionId).includes(id));
    const candidates=remote?neighbours:[site.regionId,...(supports.some(s=>s.reach==='connectedAdjacent')?neighbours:[])];
    if(slot.targetRegionId)candidates.sort((a,b)=>Number(b===slot.targetRegionId)-Number(a===slot.targetRegionId));
    const targetId=candidates.find(id=>getDetailedSettlement(state,id)&&selectPeople(getDetailedSettlement(state,id),1,effect.filter,beneficiary).length);
    if(!targetId)return {ok:false,reason:'No eligible opposing conversion target in reach'};
    const target=getDetailedSettlement(state,targetId);
    let selected=selectPeople(target,amounts[index],effect.filter,beneficiary);
    // Support adds only compatible eligible targets, never a second political engine.
    for(const support of supports){
      if(support.reach||support.query?.pool&&support.query.pool!==def.pool||support.activation&&support.activation!==def.activation.type||support.train&&support.train!==effect.train||support.consumeTrait&&!def.consume.some(c=>c.traits.includes(support.consumeTrait)))continue;
      if(support.minimumPopulation&&getPopulationSummary(state,site.regionId).total<support.minimumPopulation)continue;
      if(support.populationRequire&&count(selectPeople(settlement,support.populationRequire.amount,support.populationRequire.filter,beneficiary))<support.populationRequire.amount)continue;
      const payment=planStock(state,settlement,support.consume??[],support.require??[],slot,false,true);
      if(!payment.ok)continue;
      const filter={...effect.filter,...support.filter};
      const remaining=populationBins(target).map(b=>({...b,count:b.count-selected.filter(s=>s.allegiance===b.allegiance&&s.classId===b.classId&&s.specialty===b.specialty&&s.kind===b.kind&&s.age===b.age).reduce((n,s)=>n+s.count,0)}));
      const extra=remaining.filter(b=>b.count>0&&matchesPopulation(b,filter,beneficiary));
      let left=support.amount??0;
      for(const b of extra){const n=Math.min(left,b.count);if(n){selected.push({...b,count:n});left-=n;}}
      if(left<(support.amount??0)){extraConsume.push(...(support.consume??[]));extraRequire.push(...(support.require??[]));}
    }
    conversions.push({targetId,selected,train:effect.train});
  }
  return {ok:true,victims,conversions,extraConsume,extraRequire};
}
export function commitPopulationRecipe(state,site,slot,plan) {
  const killed=removePeople(site.detailedState,plan.victims??[]),deaths=count(killed);
  if(deaths){const h=site.detailedState.history??={deaths:0};h.deaths+=deaths;h.lastDeathSec=state.tSec;h.lastDeathCount=deaths;
    emitPracticeEvent(state,{kind:'populationDied',regionId:site.regionId,instanceId:slot.instanceId,faction:slot.allegiance??getRegionState(state,site.regionId).controller,amount:deaths,premature:true,cause:'sacrifice'});
    if(getRegionState(state,site.regionId).controller==='player')recordChaosLosses(state,{prematureDeaths:deaths});}

  for(const conversion of plan.conversions??[]){const amount=transformPeople(getDetailedSettlement(state,conversion.targetId),conversion.selected,{allegiance:slot.allegiance,...(conversion.train?{specialty:conversion.train}:{})});
    emitPracticeEvent(state,{kind:'populationConverted',regionId:site.regionId,targetRegionId:conversion.targetId,instanceId:slot.instanceId,practiceId:slot.practiceId,faction:slot.allegiance,amount});}
}
