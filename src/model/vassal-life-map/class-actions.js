import { getVassalEffectiveStats } from './selectors.js';
import { getDetailedSettlement, getDetailedSettlementSites, getPopulationSummary } from '../detailed-settlements/queries.js';
import { stockTotal, stockCapacity, stockTraits, consumeStock, generateStock, trainSpecialists, structureModifiers } from '../detailed-settlements/stock.js';
import { getRetinue, getMartialSupport, adjacentRegionIds, conquerSettlement, recordSupportUsage, evacuatePopulation } from '../detailed-settlements/external-world.js';
import { getDetailedPracticeDef } from '../game-config.js';
import { planStock, applyStockPlan } from '../detailed-settlements/stock.js';
import { getConnectedRegionIds } from '../world-state.js';
import { getRegionState, getRegionReference } from '../world-state.js';
import { tryCreateStructure } from '../detailed-settlements/practices.js';
import { VASSAL_FOUNDING_OPTIONS } from '../../defs/gamepieces/vassal-life-map-defs.js';
import { emitPracticeEvent, withPracticeRoot } from '../detailed-settlements/practice-events.js';
import { flushPracticeEvents } from '../detailed-settlements/practices.js';

export function classActionOptions(state, vassal, family) {
  const settlement=getDetailedSettlement(state,vassal.locationRegionId);
  if (VASSAL_FOUNDING_OPTIONS[family]) return [structuredClone(VASSAL_FOUNDING_OPTIONS[family])];
  if(family==='training') return [{id:'train-estate',label:`Train ${vassal.classId==='scholar'?'Scholars':'Warriors'}`,description:`Convert up to ${vassal.classId==='scholar'?2:10} existing adults into ${vassal.classId==='scholar'?'Scholars':'Warriors'}.`,phaseCost:6,prestigeCost:0,classAction:{kind:'train'}}];
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
      if (threat||stockTotal(state,target,'Edible')<pop.mealDemand) {
        const response=target.practiceSlots.find(p=>getDetailedPracticeDef(state,p?.practiceId)?.responseAction==='rescue');
        const def=getDetailedPracticeDef(state,response?.practiceId);
        const destination=getConnectedRegionIds(state,site.regionId).find(id=>{
          if (getRegionState(state,id)?.controller!=='player'||!getDetailedSettlement(state,id)) return false;
          const population=getPopulationSummary(state,id);return population.housingCapacity>population.total;
        });
        if (response&&destination&&planStock(state,target,def.consume,def.require,response).ok) incidents.push({id:`rescue-${site.regionId}`,label:`Rescue endangered population from ${label} to ${getRegionReference(state,destination)} (1 Edible)`,phaseCost:1,classAction:{kind:'evacuate',targetId:site.regionId,destinationId:destination,maximum:5}});
      }
    }
    const previewBonus=Math.min(3,(settlement?.previewBonus??0)+structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='preview'?m.amount:0),0));
    if (previewBonus) for (const incident of incidents) {
      const target=getDetailedSettlement(state,incident.classAction.targetId);
      if (target) incident.label+=` · demand ${getPopulationSummary(state,incident.classAction.targetId).mealDemand}, Edible ${stockTotal(state,target,'Edible')}`;
      else if (getRegionState(state,incident.classAction.targetId)?.monster) incident.label+=` · Monster Defense ${getRegionState(state,incident.classAction.targetId).monster.defense}`;
    }
    return [...incidents.slice(0,3+previewBonus),{id:'observe-crisis',label:incidents.length?'Leave the response to the civilization':'No current incident: inspect the frontier',phaseCost:1,classAction:{kind:'observe'}}];
  }
  return null;
}

export function validateClassAction(state,vassal,action) {
  if(!action) return {ok:true};
  if(['train','commission','campaign'].includes(action.kind) && !getDetailedSettlement(state,vassal.locationRegionId)) return {ok:false,reason:'settlementLost'};
  if (action.establishClass && (action.classId !== vassal.founderClassId
      || state.civilization.vassalLineage.establishedClassId)) return {ok:false,reason:'foundingUnavailable'};
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
  if(action.kind==='evacuate') {
    const legal=classActionOptions(state,vassal,'crisis').some(o=>o.classAction.kind==='evacuate'&&o.classAction.targetId===action.targetId&&o.classAction.destinationId===action.destinationId);
    if (!legal) return {ok:false,reason:'rescueUnavailable'};
  }
  return {ok:true};
}
export function applyClassAction(state,vassal,action) {
  if(!action) return;
  withPracticeRoot(state,{kind:'vassalAction',regionId:vassal.locationRegionId,classId:vassal.classId,actionKind:action.kind},()=>applyClassActionRecipe(state,vassal,action));
  flushPracticeEvents(state);
}
function applyClassActionRecipe(state,vassal,action) {
  const settlement=getDetailedSettlement(state,vassal.locationRegionId);
  if(action.kind==='train') {
    const classId = action.classId ?? vassal.classId;
    trainSpecialists(settlement, classId, action.count ?? (classId === 'scholar' ? 2 : 10));
    if (action.structureId) tryCreateStructure(state, vassal.locationRegionId, action.structureId);
    if (action.establishClass) {
      state.civilization.vassalLineage.establishedClassId = classId;
      vassal.classId = classId;
      vassal.lifeEvents.push({
        eventId: `${vassal.vassalId}:founded`, kind: 'classFounded', tSec: state.tSec,
        text: `${vassal.archetype} established ${classId === 'scholar' ? 'Scholars' : 'Warriors'}`,
      });
    }
  }
  if(action.kind==='commission') vassal.commission={objective:action.objective,initialIds:(action.objective==='practice'?settlement.practiceSlots:settlement.structureSlots).filter(Boolean).map(p=>p.practiceId??p.placementId),regionId:vassal.locationRegionId};
  if(action.kind==='discovery') {
    state.civilization.research.total+=action.research+Math.max(0,getVassalEffectiveStats(vassal).cunning??0);
    if(action.frontier) vassal.discoveryAccess=true;
  }
  if(action.kind==='campaign') {
    const origin=vassal.locationRegionId;
    const force=(getVassalEffectiveStats(vassal).intelligence??0)+getRetinue(state,vassal).value+getMartialSupport(state,vassal.locationRegionId);
    recordSupportUsage(state,origin,'campaign',false,vassal.classId);
    consumeStock(state,settlement,'Edible',1);
    const target=state.world.sites.find(s=>s.regionId===action.targetId);
    if(target?.neutral) { conquerSettlement(state,action.targetId,force-action.difficulty);vassal.locationRegionId=action.targetId; }
    else {
      delete getRegionState(state,action.targetId).monster;
      if(target?.simulationMode==='ruin') {conquerSettlement(state,action.targetId,force-action.difficulty);vassal.locationRegionId=action.targetId;}
      state.civilization.chaos.monsterCount=state.world.regions.filter(r=>r.monster).length;state.civilization.history.victories++;
      emitPracticeEvent(state,{kind:'monsterDestroyed',regionId:origin,classId:vassal.classId});
    }
    emitPracticeEvent(state,{kind:'campaignWon',regionId:origin,classId:vassal.classId});
  }
  if(action.kind==='challenge') emitPracticeEvent(state,{kind:'challengeCompleted',regionId:vassal.locationRegionId,classId:vassal.classId});
  if(action.kind==='relief') {
    const target=getDetailedSettlement(state,action.targetId);
    if(action.currency) consumeStock(state,target,'Currency',action.currency);
    const host=target.practiceSlots.find(p=>stockTraits(state,p).includes('Edible')&&(p.stock??0)<stockCapacity(state,target,p));
    if(host) generateStock(state,target,host,3);
  }
  if(action.kind==='delay') getRegionState(state,action.targetId).monster.ageMoons=0;
  if(action.kind==='evacuate') {
    const source=getDetailedSettlement(state,action.targetId);
    const response=source.practiceSlots.find(p=>getDetailedPracticeDef(state,p?.practiceId)?.responseAction==='rescue');
    const def=getDetailedPracticeDef(state,response?.practiceId);
    if (def) {
      const plan=planStock(state,source,def.consume,def.require,response);
      if (plan.ok) {applyStockPlan(source,plan);evacuatePopulation(state,action.targetId,action.destinationId,action.maximum);}
    }
  }
}
export function completeCommission(state,vassal) {
  const c=vassal.commission;
  if(!c) return;
  const settlement=getDetailedSettlement(state,c.regionId);
  const ids=(c.objective==='practice'?settlement?.practiceSlots:settlement?.structureSlots)?.filter(Boolean).map(p=>p.practiceId??p.placementId)??[];
  if(ids.some(id=>!c.initialIds.includes(id))) {vassal.prestige+=20;vassal.completedCommissions=(vassal.completedCommissions??0)+1;delete vassal.commission;}
}
