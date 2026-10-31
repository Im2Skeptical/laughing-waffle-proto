import {getDetailedPracticeDef,getDetailedStructureDef} from '../../model/game-config.js';
import {stockProviderSlots,stockTraits,stockCapacity,structureModifiers,matchesPractice} from '../../model/detailed-settlements/stock.js';
import {getPopulationSummary} from '../../model/detailed-settlements/queries.js';
import {assignDetailedSettlementWorkers,isScholarStaffed} from '../../model/detailed-settlements/workers.js';

export const stockSourceKey=(regionId,index)=>`${regionId}:${index}`;

// Potential use by installed recipes, not scheduling, readiness, inventory or
// demand quantities. Build once per map read and share across regional rows.
export function createMapStockCoverage(state){
  const usedSources=new Set(),missingByRegion=new Map();
  const sites=(state?.world?.sites??[]).filter(s=>s.detailedState);
  const settlements=new Map(sites.map(s=>[s.regionId,s.detailedState]));
  const providerNetworks=new Map(),holderCache=new Map();
  function isHolder(source){
    const key=stockSourceKey(source.regionId,source.slotIndex);
    if(!holderCache.has(key))holderCache.set(key,stockTraits(state,source.slot).length>0&&
      (source.market||(source.slot.stock??0)>0||stockCapacity(state,settlements.get(source.regionId),source.slot)>0));
    return holderCache.get(key);
  }
  for(const site of sites){
    const settlement=site.detailedState,modifiers=structureModifiers(state,settlement),consumers=[];
    const workers=modifiers.some(m=>m.kind==='flexibleProvider')?assignDetailedSettlementWorkers(state,site.regionId):[];
    for(const [index,slot] of (settlement.practiceSlots??[]).entries()){
      const def=getDetailedPracticeDef(state,slot?.practiceId);if(!def)continue;
      consumers.push({slot,beneficiary:def.category==='influence'?slot.allegiance:undefined,
        staffed:isScholarStaffed(workers[index]),consume:def.consume??[],require:def.require??[]});
    }
    for(const slot of (settlement.structureSlots??[]).filter(Boolean)){
      const def=getDetailedStructureDef(state,slot.structureId);if(!def)continue;
      consumers.push({consume:slot.construction?def.construction?.consume??[]:def.upkeep?.consume??[],require:[]});
    }
    if(!site.neutral&&getPopulationSummary(state,site.regionId).mealDemand>0)consumers.push({consume:[{traits:['Edible'],amount:1}],require:[]});
    for(const consumer of consumers){
      const key=`${site.regionId}:${consumer.beneficiary??'holder'}`;
      if(!providerNetworks.has(key))providerNetworks.set(key,stockProviderSlots(state,settlement,false,{beneficiary:consumer.beneficiary}).filter(isHolder));
      const sources=providerNetworks.get(key);
      const flexible=consumer.slot&&modifiers.some(m=>m.kind==='flexibleProvider'&&matchesPractice(state,consumer.slot,m.query,consumer.staffed));
      const wildcard=modifiers.some(m=>m.kind==='currencyWildcard');
      for(const kind of ['consume','require'])for(const cost of consumer[kind]??[]){
        if(!(cost.amount>0)||!cost.traits?.length)continue;
        const matching=sources.filter(source=>{
          if(source.market&&kind==='require')return false;
          const traits=stockTraits(state,source.slot);
          if(cost.traits.some(t=>traits.includes(t)))return true;
          if(!source.market&&(flexible||wildcard&&traits.includes('Currency')))return true;
          return kind==='require'&&modifiers.some(m=>m.kind==='requireSubstitution'&&cost.traits.includes(m.to)&&traits.includes(m.from)&&
            (!m.providerTagsAny||getDetailedPracticeDef(state,source.slot.practiceId)?.tags?.some(t=>m.providerTagsAny.includes(t))));
        });
        if(matching.length)for(const source of matching)usedSources.add(stockSourceKey(source.regionId,source.slotIndex));
        else{
          if(!missingByRegion.has(site.regionId))missingByRegion.set(site.regionId,new Set());
          for(const trait of cost.traits)missingByRegion.get(site.regionId).add(trait);
        }
      }
    }
  }
  return {usedSources,missingByRegion};
}
