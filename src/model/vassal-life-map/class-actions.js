import { getVassalEffectiveStats } from './selectors.js';
import { getDetailedSettlement, getDetailedSettlementSites, getPopulationSummary } from '../detailed-settlements/queries.js';
import { stockTotal, stockCapacity, stockTraits, consumeStock, generateStock, trainSpecialists, specialistCount } from '../detailed-settlements/stock.js';
import { getRetinue, getMartialSupport, adjacentRegionIds, conquerSettlement } from '../detailed-settlements/external-world.js';
import { getRegionState, getRegionReference } from '../world-state.js';
import { tryCreateStructure } from '../detailed-settlements/practices.js';

const classPopulation = (state, classId) => getDetailedSettlementSites(state,{playerOnly:true}).reduce((n,s)=>n+specialistCount(s.detailedState,classId),0);
export function classActionOptions(state, vassal, family) {
  const settlement=getDetailedSettlement(state,vassal.locationRegionId);
  if(family==='training') return [{id:'train-estate',label:`${classPopulation(state,vassal.classId)?'Train':'Establish'} ${vassal.classId==='scholar'?'Scholars':'Warriors'}`,description:`Convert up to ${vassal.classId==='scholar'?2:10} existing adults into ${vassal.classId==='scholar'?'Scholars':'Warriors'}.`+(vassal.classId==='scholar'&&!classPopulation(state,'scholar')?' Found a Lyceum if two construction cells are free.':''),phaseCost:6,prestigeCost:0,classAction:{kind:'train'}}];
  if(family==='commission') return [
    {id:'commission-practice',label:'Commission: install a new Practice for 20 Prestige',phaseCost:0,classAction:{kind:'commission',objective:'practice'}},
    {id:'commission-structure',label:'Commission: build a Structure for 20 Prestige',phaseCost:0,classAction:{kind:'commission',objective:'structure'}},
  ];
  if(family==='discovery') return [
    {id:'discovery-research',label:'Discovery: develop technique (+25 Research)',phaseCost:6,classAction:{kind:'discovery',research:25}},
    {id:'discovery-frontier',label:'Discovery: forbidden observation (+60 Research, next shop accesses one maturity higher, 10% Danger)',phaseCost:8,immediateDeathChance:.1,classAction:{kind:'discovery',research:60,frontier:true}},
  ];
  if(family==='challenge') return [3,6,9].map(difficulty=>({id:`challenge-${difficulty}`,label:`Challenge ${difficulty}: Prowess ${getVassalEffectiveStats(vassal).intelligence??0}; ${Math.max(0,difficulty-(getVassalEffectiveStats(vassal).intelligence??0))*5}% Danger`,phaseCost:Math.max(2,difficulty*2-(getVassalEffectiveStats(vassal).intelligence??0)),prestigeDelta:difficulty*3,baseDanger:difficulty*.05,immediateDeathChance:Math.min(.6,Math.max(0,difficulty-(getVassalEffectiveStats(vassal).intelligence??0))*.05),classAction:{kind:'challenge',difficulty}}));
  if(family==='campaign') {
    const force=(getVassalEffectiveStats(vassal).intelligence??0)+getRetinue(state,vassal).value+getMartialSupport(state,vassal.locationRegionId);
    const options=adjacentRegionIds(state,vassal.locationRegionId).flatMap(id=>{
      const site=state.world.sites.find(s=>s.regionId===id), region=getRegionState(state,id);
      const difficulty=site?.neutral?.defense??region?.monster?.defense;
      if(!difficulty||force<difficulty||stockTotal(state,settlement,'Edible')<1) return [];
      const edge=force-difficulty;
      return [{id:`campaign-${id}`,label:`${site?.neutral?'Conquer':'Assault'} ${getRegionReference(state,id)}: Force ${force} vs ${difficulty}; 1 Edible`,phaseCost:Math.max(2,8-edge),prestigeDelta:difficulty*3,baseDanger:difficulty*.05,immediateDeathChance:Math.max(0,.15-edge*.03),classAction:{kind:'campaign',targetId:id,difficulty}}];
    });
    return options.length?options:[{id:'campaign-prepare',label:'Prepare: need an adjacent target, sufficient Force and 1 Edible',phaseCost:2,classAction:{kind:'prepare'}}];
  }
  if(family==='crisis') {
    const incidents=[];
    for(const site of getDetailedSettlementSites(state,{playerOnly:true})) {
      const target=site.detailedState, pop=getPopulationSummary(state,site.regionId), label=getRegionReference(state,site.regionId);
      if(stockTotal(state,target,'Edible')<pop.mealDemand) {
        const room=target.practiceSlots.some(p=>stockTraits(state,p).includes('Edible')&&(p.stock??0)<stockCapacity(state,target,p));
        if(room) {
          incidents.push({id:`relief-${site.regionId}`,label:`Food shortage at ${label}: relief expedition (15% Danger)`,phaseCost:2,immediateDeathChance:.15,classAction:{kind:'relief',targetId:site.regionId}});
          if(stockTotal(state,target,'Currency')>=1) incidents.push({id:`buy-relief-${site.regionId}`,label:`Food shortage at ${label}: procure relief for 1 Currency Stock`,phaseCost:1,classAction:{kind:'relief',targetId:site.regionId,currency:1}});
        }
      }
      const threat=adjacentRegionIds(state,site.regionId).find(id=>getRegionState(state,id)?.monster);
      if(threat) incidents.push({id:`delay-${threat}`,label:`Monster threatens ${label}: divert expansion (20% Danger)`,phaseCost:1,immediateDeathChance:.2,classAction:{kind:'delay',targetId:threat}});
    }
    return [...incidents.slice(0,3),{id:'observe-crisis',label:incidents.length?'Leave the response to the civilization':'No current incident: inspect the frontier',phaseCost:1,classAction:{kind:'observe'}}];
  }
  return null;
}

export function validateClassAction(state,vassal,action) {
  if(!action) return {ok:true};
  if(['train','commission','campaign'].includes(action.kind) && !getDetailedSettlement(state,vassal.locationRegionId)) return {ok:false,reason:'settlementLost'};
  if(action.kind==='campaign') {
    const legal=classActionOptions(state,vassal,'campaign').some(o=>o.classAction.targetId===action.targetId && o.classAction.difficulty===action.difficulty);
    if(!legal) return {ok:false,reason:'campaignConditionsChanged'};
  }
  if(action.kind==='relief') {
    const target=getDetailedSettlement(state,action.targetId);
    if(getRegionState(state,action.targetId)?.controller!=='player' || !target?.practiceSlots.some(p=>stockTraits(state,p).includes('Edible')&&(p.stock??0)<stockCapacity(state,target,p))) return {ok:false,reason:'reliefUnavailable'};
    if(action.currency&&stockTotal(state,target,'Currency')<action.currency) return {ok:false,reason:'insufficientCurrencyStock'};
  }
  if(action.kind==='delay'&&!getRegionState(state,action.targetId)?.monster) return {ok:false,reason:'threatEnded'};
  return {ok:true};
}
export function applyClassAction(state,vassal,action) {
  if(!action) return;
  const settlement=getDetailedSettlement(state,vassal.locationRegionId);
  if(action.kind==='train') {
    const founding=classPopulation(state,vassal.classId)===0;
    trainSpecialists(settlement,vassal.classId,vassal.classId==='scholar'?2:10);
    if(founding&&vassal.classId==='scholar') tryCreateStructure(state,vassal.locationRegionId,'lyceum');
  }
  if(action.kind==='commission') vassal.commission={objective:action.objective,initialIds:(action.objective==='practice'?settlement.practiceSlots:settlement.structureSlots).filter(Boolean).map(p=>p.practiceId??p.placementId),regionId:vassal.locationRegionId};
  if(action.kind==='discovery') {
    state.civilization.research.total+=action.research+Math.max(0,getVassalEffectiveStats(vassal).cunning??0);
    if(action.frontier) vassal.discoveryAccess=true;
  }
  if(action.kind==='campaign') {
    const force=(getVassalEffectiveStats(vassal).intelligence??0)+getRetinue(state,vassal).value+getMartialSupport(state,vassal.locationRegionId);
    consumeStock(state,settlement,'Edible',1);
    const target=state.world.sites.find(s=>s.regionId===action.targetId);
    if(target?.neutral) { conquerSettlement(state,action.targetId,force-action.difficulty);vassal.locationRegionId=action.targetId; }
    else {
      delete getRegionState(state,action.targetId).monster;
      if(target?.simulationMode==='ruin') {conquerSettlement(state,action.targetId,force-action.difficulty);vassal.locationRegionId=action.targetId;}
      state.civilization.chaos.monsterCount=state.world.regions.filter(r=>r.monster).length;state.civilization.history.victories++;
    }
  }
  if(action.kind==='relief') {
    const target=getDetailedSettlement(state,action.targetId);
    if(action.currency) consumeStock(state,target,'Currency',action.currency);
    const host=target.practiceSlots.find(p=>stockTraits(state,p).includes('Edible')&&(p.stock??0)<stockCapacity(state,target,p));
    if(host) generateStock(state,target,host,3);
  }
  if(action.kind==='delay') getRegionState(state,action.targetId).monster.ageMoons=0;
}
export function completeCommission(state,vassal) {
  const c=vassal.commission;
  if(!c) return;
  const settlement=getDetailedSettlement(state,c.regionId);
  const ids=(c.objective==='practice'?settlement?.practiceSlots:settlement?.structureSlots)?.filter(Boolean).map(p=>p.practiceId??p.placementId)??[];
  if(ids.some(id=>!c.initialIds.includes(id))) {vassal.prestige+=20;vassal.completedCommissions=(vassal.completedCommissions??0)+1;delete vassal.commission;}
}
