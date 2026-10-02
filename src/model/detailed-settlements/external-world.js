import { emptySpecialists } from "./cohorts.js";
import { createInitialDetailedSettlementData } from '../../defs/world/detailed-settlement-scenario.js';
import { DETAILED_PRACTICE_SLOT_COUNT } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../game-config.js';
import { canonicalizeWorldState, getWorldConnectionCandidates, getWorldDefinition, getRegionState, getConnectedRegionIds } from '../world-state.js';
import { normalizeStructureLayout } from '../structure-layout.js';
import { stockCapacity, stockTotal, stockTraits, consumeStock, specialistCount, structureModifiers, planStock, applyStockPlan, CIV_CONTENT_TUNING, stockProviderSlot } from './stock.js';
import { emitPracticeEvent, withPracticeRoot } from './practice-events.js';
import { selectPopulationComposition, compositionTotal } from './helpers.js';
import { removePopulationComposition, addCompositionToStrangers } from './phases/migration.js';
import { getPopulationSummary } from './queries.js';

export function adjacentRegionIds(state, regionId) {
  return getWorldConnectionCandidates(getWorldDefinition(state)).flatMap(e => e.regionAId === regionId ? [e.regionBId] : e.regionBId === regionId ? [e.regionAId] : []);
}
const siteAt = (state, id) => state.world.sites.find(s => s.regionId === id);
const playerSites = state => (state?.world?.sites ?? []).filter(s => getRegionState(state, s.regionId)?.controller === 'player' && s.simulationMode === 'detailed' && s.detailedState);
function localMartialSupport(state, regionId, defense = false) {
  const settlement = siteAt(state, regionId)?.detailedState;
  const warriors = specialistCount(settlement, 'warrior');
  let multiplier = 1, flat = 0;
  for (const mod of structureModifiers(state, settlement)) {
    if (mod.kind === 'support' || defense && mod.kind === 'defenseMultiplier') multiplier += mod.amount;
    if (defense && mod.kind === 'defense') flat += mod.amount;
    if (defense && mod.kind === 'lossDefense') flat += mod.amount * Math.min(3, state.civilization.history?.lostSettlements ?? 0);
    const stocked=settlement?.practiceSlots.filter(s=>s?.stock>0&&(!mod.query?.traitsAny||mod.query.traitsAny.some(t=>stockTraits(state,s).includes(t)))).length??0;
    if (mod.kind==='stockSupport') multiplier+=Math.min(3,stocked)*mod.amount;
    if (defense&&mod.kind==='stockDefense') flat+=Math.min(3,stocked)*mod.amount;
  }
  for (const slot of settlement?.practiceSlots ?? []) {
    const def = getDetailedPracticeDef(state, slot?.practiceId);
    if (def?.mode==='scheduled' && planStock(state, settlement, def.consume, def.require).ok) multiplier += (def.supportMultiplier ?? 0) + (defense ? def.defenseMultiplier ?? 0 : 0);
  }
  return Math.floor(warriors / CIV_CONTENT_TUNING.warriorsPerSupport * multiplier + flat + (settlement?.supportBank?.formation??0) + (settlement?.supportBank?.siege??0) + (settlement?.supportBank?.mobility??0));
}

export function getSupportSources(state,regionId,defense=false) {
  const local=siteAt(state,regionId)?.detailedState;
  const modifiers=structureModifiers(state,local);
  const share=Math.min(.5,modifiers.reduce((n,m)=>n+(m.kind==='networkSupport'?m.amount:0),0)+(local?.supportBank?.coordination? .25:0)+(local?.supportBank?.greatHost? .5:0));
  const sources=[{regionId,amount:localMartialSupport(state,regionId,defense)}];
  if (share>0) for (const id of getConnectedRegionIds(state,regionId)) {
    if (getRegionState(state,id)?.controller!=='player') continue;
    const amount=Math.min(10,Math.floor(localMartialSupport(state,id,defense)*share));
    if (amount>0) sources.push({regionId:id,amount});
    if (local?.supportBank?.coordination && !local?.supportBank?.greatHost) break;
  }
  return sources;
}
export const getMartialSupport = (state,regionId,defense=false) => getSupportSources(state,regionId,defense).reduce((n,s)=>n+s.amount,0);
export function recordSupportUsage(state,regionId,kind,defense=false,classId=null) {
  const sources=getSupportSources(state,regionId,defense).filter(s=>s.amount>0);
  for (const source of sources) {
    emitPracticeEvent(state,{kind:'supportContributed',regionId:source.regionId,actionKind:kind,amount:source.amount,classId});
    const local=siteAt(state,source.regionId)?.detailedState;
    if (local?.supportBank) local.supportBank={};
  }
  emitPracticeEvent(state,{kind:'martialActionResolved',regionId,actionKind:kind,sourceRegionIds:sources.map(s=>s.regionId),classId});
}
export function evacuatePopulation(state,sourceId,destinationId,maximum) {
  const source=siteAt(state,sourceId)?.detailedState,destination=siteAt(state,destinationId)?.detailedState;
  if (!source||!destination||sourceId===destinationId||getRegionState(state,destinationId)?.controller!=='player') return 0;
  const population=getPopulationSummary(state,destinationId);
  const amount=Math.min(maximum,Math.max(0,population.housingCapacity-population.total));
  const composition=selectPopulationComposition(source,['stranger','villager'],amount);
  removePopulationComposition(source,composition);addCompositionToStrangers(destination,composition);
  const moved=compositionTotal(composition);
  if (moved) emitPracticeEvent(state,{kind:'populationRescued',regionId:sourceId,destinationId,amount:moved});
  return moved;
}
export function getRetinue(state, vassal) {
  const sites = playerSites(state);
  const population = sites.reduce((n, s) => n + specialistCount(s.detailedState, 'warrior'), 0);
  let cap = Math.ceil(population / CIV_CONTENT_TUNING.warriorsPerRetinue);
  for (const site of sites) {
    cap += structureModifiers(state, site.detailedState).reduce((n, m) => n + (m.kind === 'retinueCap' ? m.amount : 0), 0);
    site.detailedState.practiceSlots.forEach(slot => {
      const def = getDetailedPracticeDef(state, slot?.practiceId);
      if (def?.retinueCap && planStock(state, site.detailedState, def.consume, def.require).ok) cap += def.retinueCap;
    });
  }
  if (!population || vassal?.classId !== 'warrior') cap = 0;
  cap = Math.floor(cap);
  const value = Math.min(cap, Math.floor((vassal?.prestige ?? 0) / CIV_CONTENT_TUNING.prestigePerRetinue));
  return { value, cap, population, nextPrestige: value < cap ? (value + 1) * CIV_CONTENT_TUNING.prestigePerRetinue : null };
}

export const NEUTRAL_TEMPLATES = Object.freeze([
  { name: 'Forager Hamlet', population: 18, defense: 3, practices: ['forage','pastoralism'], structures: ['mudHouses','granary','sheepfold'] },
  { name: 'Timber Village', population: 24, defense: 4, practices: ['forage','pastoralism','logging','barter'], structures: ['timberHouse','granary','storehouse','marketSquare'] },
  { name: 'Stone Village', population: 30, defense: 5, practices: ['forage','pastoralism','logging','surfaceMining','charcoalBurning','smelting'], structures: ['stoneHouse','granary','workshop','kiln','storehouse'] },
  { name: 'Market Town', population: 60, defense: 8, practices: ['forage','pastoralism','dryFarming','barter','logging','quarrying','surfaceMining'], structures: ['longhouse','granary','marketSquare','storehouse','workshop'] },
]);
function distance(state, start, end) {
  const queue = [[start,0]], seen = new Set([start]);
  for (const [id,d] of queue) {
    if (id === end) return d;
    for (const next of adjacentRegionIds(state,id)) if (!seen.has(next)) { seen.add(next); queue.push([next,d+1]); }
  }
  return Infinity;
}
// Shared construction for seeded worlds and explicit developer fixtures.
export function createNeutralSettlement(state, id, index) {
  const template = NEUTRAL_TEMPLATES[index];
  if (!template || getRegionState(state,id)?.controller !== 'frontier' || siteAt(state,id) || getRegionState(state,id)?.monster) return {ok:false,reason:'neutralSiteUnavailable'};
  const region = getRegionState(state,id), settlement = createInitialDetailedSettlementData();
  settlement.populationByClass.villager = { ...settlement.populationByClass.villager, children:0, adults:template.population, eldersByAge:[] };
  settlement.practiceSlots = Array.from({length:DETAILED_PRACTICE_SLOT_COUNT},(_,i) => template.practices[i] ? {practiceId:template.practices[i], tier:'bronze', stock:0, charge:0, work:0} : null);
  region.structureCapacity = Math.max(region.structureCapacity, template.structures.reduce((n,id) => n+getDetailedStructureDef(state,id).footprint,0));
  const placements = [];
  for (const structureId of template.structures) { placements.push({structureId}); for(let i=1;i<getDetailedStructureDef(state,structureId).footprint;i++) placements.push(null); }
  settlement.structureSlots = normalizeStructureLayout(placements,region.structureCapacity,id => getDetailedStructureDef(state,id),id);
  for (const slot of settlement.practiceSlots.filter(Boolean)) { const cap=stockCapacity(state,settlement,slot); slot.stock=cap>0 ? Math.max(1,Math.floor(cap*(index===3?.75:.5))) : 0; }
  region.controller='external-a'; region.detailedSettlementEnabled=true;
  state.world.sites.push({id:`${id}-settlement`,regionId:id,simulationMode:'detailed',name:template.name,neutral:{template:template.name,defense:template.defense},detailedState:settlement});
  return {ok:true,site:siteAt(state,id)};
}

export function seedNeutralSettlements(state) {
  const players = playerSites(state).map(s => s.regionId), placed = [];
  const capital = state.civilization.capitalRegionId;
  for (const [index] of NEUTRAL_TEMPLATES.entries()) {
    let eligible = getWorldDefinition(state).regions.map(r => r.id).filter(id => getRegionState(state,id)?.controller === 'frontier' && !siteAt(state,id));
    if (index === 0) eligible = eligible.filter(id => adjacentRegionIds(state,capital).includes(id));
    eligible.sort((a,b) => {
      const score = id => Math.min(...players.concat(placed).map(p => distance(state,p,id)), 2) * 10 + Math.min(distance(state,capital,id),3);
      return score(b)-score(a); // stable authored-order tie break, no shared RNG consumption
    });
    const id = eligible[0];
    if (!id) throw new Error('Starter_02 has insufficient neutral sites');
    const result = createNeutralSettlement(state, id, index);
    if (!result.ok) throw new Error(result.reason);
    placed.push(id);
  }
  canonicalizeWorldState(state);
}

export function resolveExternalPractice(state, site, def, apply, prepared = null) {
  if (site.neutral) return {ok: def.externalAction === 'trade', bonus:0};
  const targets = getConnectedRegionIds(state,site.regionId).map(id=>siteAt(state,id)).filter(s=>s?.neutral);
  if (def.externalAction === 'trade') {
    const stockedTarget=targets.find(s=>s.detailedState.practiceSlots.some(p=>p?.stock>0));
    if(apply&&stockedTarget) {
      state.civilization.history.trades=(state.civilization.history.trades??0)+1;
      emitPracticeEvent(state,{kind:'externalTrade',regionId:site.regionId,practiceId:def.id});
    }
    return {ok:true,bonus:stockedTarget?1:0};
  }
  if (def.externalAction === 'hunt') {
    const id=prepared?.targetId??adjacentRegionIds(state,site.regionId).find(id=>getRegionState(state,id)?.monster?.defense<=getMartialSupport(state,site.regionId));
    if (!id) return {ok:false};
    if(apply) { delete getRegionState(state,id).monster; state.civilization.chaos.monsterCount=state.world.regions.filter(r=>r.monster).length; state.civilization.history.victories++;
      recordSupportUsage(state,site.regionId,'hunt');emitPracticeEvent(state,{kind:'monsterDestroyed',regionId:site.regionId,practiceId:def.id}); }
    return {ok:true,bonus:0,targetId:id};
  }
  const target=prepared?.targetId?targets.find(s=>s.regionId===prepared.targetId):targets.find(s=>s.neutral.defense<=getMartialSupport(state,site.regionId) && s.detailedState.practiceSlots.some(p=>p?.stock>0));
  if(!target) return {ok:false};
  const provider=target.detailedState.practiceSlots.find(p=>p?.stock>0);
  const yieldCount=Math.min(2,provider.stock);
  if(apply) { provider.stock-=yieldCount; state.civilization.history.raids++;
    emitPracticeEvent(state,{kind:'raidResolved',regionId:site.regionId,practiceId:def.id}); }
  return {ok:true,bonus:yieldCount-1,targetId:target.regionId};
}

export function conquerSettlement(state, targetId, edge = 0) {
  const site=siteAt(state,targetId),region=getRegionState(state,targetId);
  if(!site?.neutral && site?.simulationMode!=='ruin') return {ok:false,reason:'targetUnavailable'};
  const settlement=site.detailedState;
  const population=Object.values(settlement.populationByClass).reduce((n,c)=>n+c.children+c.adults+c.eldersByAge.reduce((s,e)=>s+e.count,0),0);
  for(const c of Object.values(settlement.populationByClass)) { c.children=0;c.adults=0;c.eldersByAge=[];c.specialists=emptySpecialists(); }
  settlement.populationByClass.stranger.adults=Math.max(1,Math.floor(population*(edge>=3?1:.8)));
  if(edge<3) for(const p of settlement.practiceSlots.filter(Boolean)) p.stock=Math.floor(p.stock*.8);
  delete site.neutral; site.simulationMode='detailed';region.detailedSettlementEnabled=true;region.controller='player'; state.civilization.history.conquests++;
  return {ok:true};
}

export function stepSpatialPressure(state) {
  const chaos=state.civilization.chaos;
  const regions=getWorldDefinition(state).regions.map(r=>getRegionState(state,r.id));
  if(chaos.chaosPower>=CIV_CONTENT_TUNING.monsterSpawnChaos) {
    const target=regions.find(r=>r.controller==='frontier'&&!r.monster);
    if(target) {
      const spawnNumber=(chaos.spatialSpawns??0)+1;
      target.monster={defense:CIV_CONTENT_TUNING.monsterDefense+Math.floor(spawnNumber/3),ageMoons:0};
      chaos.spatialSpawns=spawnNumber;
      chaos.chaosPower=0;
      emitPracticeEvent(state,{kind:'monsterPressure',regionId:target.id,action:'spawn'});
    }
  }
  for(const region of regions.filter(r=>r.monster)) {
    region.monster.ageMoons++;
    emitPracticeEvent(state,{kind:'monsterPressure',regionId:region.id,action:'advance'});
    if(region.monster.ageMoons%CIV_CONTENT_TUNING.monsterExpansionMoons) continue;
    const targetId=adjacentRegionIds(state,region.id).find(id=>!getRegionState(state,id)?.monster);
    if(!targetId) continue;
    const target=getRegionState(state,targetId),site=siteAt(state,targetId);
    if(target.controller==='player'&&site) {
      const settlement=site.detailedState;
      const response=settlement.practiceSlots.flatMap(p=>{
        const def=getDetailedPracticeDef(state,p?.practiceId);
        if(!def?.defenseMultiplier) return [];
        const plan=planStock(state,settlement,def.consume,def.require);
        const edibleCost=plan.providers.filter(p=>p.kind==='consume'&&p.regionId===targetId&&stockTraits(state,stockProviderSlot(state,settlement,p)).includes('Edible')).reduce((sum,p)=>sum+p.amount,0);
        return plan.ok && stockTotal(state,settlement,'Edible')>=edibleCost+1 ? [{plan}] : [];
      })[0];
      if(response && getMartialSupport(state,targetId,true)>=region.monster.defense) {
        withPracticeRoot(state,{kind:'defense',regionId:targetId},()=>{
          recordSupportUsage(state,targetId,'defense',true);
          applyStockPlan(state,settlement,response.plan);
          consumeStock(state,settlement,'Edible',1);
          emitPracticeEvent(state,{kind:'defenseSucceeded',regionId:targetId});
        });
        settlement.lastDefense={tSec:state.tSec,result:'held',sourceRegionId:region.id};continue;
      }
      state.civilization.history.lostSettlements++;
      const share=Math.min(.75,structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='evacuationShare'?m.amount:0),0));
      if (share>0) for (const id of getConnectedRegionIds(state,targetId)) {
        const moved=evacuatePopulation(state,targetId,id,Math.ceil(getPopulationSummary(state,targetId).total*share));
        if (moved) break;
      }
      target.lostAtSec=state.tSec;
      emitPracticeEvent(state,{kind:'settlementLost',regionId:targetId});
      settlement.lastDefense={tSec:state.tSec,result:'lost',sourceRegionId:region.id};
    }
    if(site) { delete site.neutral;site.simulationMode='ruin';target.detailedSettlementEnabled=false; }
    target.controller='frontier';target.monster={defense:region.monster.defense,ageMoons:0};
    emitPracticeEvent(state,{kind:'monsterPressure',regionId:targetId,action:'expand'});
  }
  const survivors=playerSites(state);
  const lineage=state.civilization.vassalLineage;
  const active=lineage?.vassalsById?.[lineage.currentVassalId];
  if(active && survivors.length && !survivors.some(s=>s.regionId===active.locationRegionId)) {
    const from=active.locationRegionId;
    active.locationRegionId=survivors[0].regionId;
    active.lifeEvents.push({eventId:`${active.vassalId}:evacuation:${state.tSec}`,kind:'evacuation',tSec:state.tSec,
      text:`Evacuated ${from} after territorial loss.`,fromRegionId:from,toRegionId:active.locationRegionId});
  }
  chaos.monsterCount=regions.filter(r=>r.monster).length;
  if(!playerSites(state).length) { state.runStatus={complete:true,reason:'redGodMonsterOverrun',year:state.year,tSec:state.tSec};state.paused=true; }
}
