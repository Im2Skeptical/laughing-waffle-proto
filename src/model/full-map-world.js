import { createInitialDetailedSettlementData } from '../defs/world/detailed-settlement-scenario.js';
import { getRegionState, getAdjacentRegionIds, canonicalizeWorldState } from './world-state.js';
import { getDetailedPracticeDef } from './game-config.js';
import { stockCapacity } from './detailed-settlements/stock.js';
import { writePopulationBins } from './detailed-settlements/population-ledger.js';

export const FULL_MAP_RULESET = 'full-map-redesign-v1';
export function mapDistance(state,start,end) {
  const seen=new Set([start]),queue=[[start,0]];
  for(const [id,d] of queue){if(id===end)return d;for(const next of getAdjacentRegionIds(state,id))if(!seen.has(next)){seen.add(next);queue.push([next,d+1]);}}
  return Infinity;
}
export function seedFullMapWorld(state) {
  state.rulesetId=FULL_MAP_RULESET;
  state.civilization.prestige=20;
  state.civilization.treasury={remainder:0,lastSec:state.tSec,grossIncome:0};
  state.civilization.nextPracticeInstanceId=1;
  const players=state.world.regions.filter(r=>r.controller==='player').map(r=>r.id);
  const capital=state.world.regions.filter(r=>!players.includes(r.id)).sort((a,b)=>mapDistance(state,players[0],b.id)-mapDistance(state,players[0],a.id))[0].id;
  state.civilization.remnant={capitalRegionId:capital,classId:'warrior',faction:'external-a'};
  for(const region of state.world.regions) {
    const player=players.includes(region.id),enemyCapital=region.id===capital,province=!player&&getAdjacentRegionIds(state,capital).includes(region.id);
    const population=player?20:enemyCapital?120:province?60:30;
    const faction=player?'player':'external-a',share=(player||enemyCapital)?0.8:province?0.6:0.2;
    region.controller=player?'player':enemyCapital||province?'external-a':'frontier';
    region.detailedSettlementEnabled=true;
    let site=state.world.sites.find(s=>s.regionId===region.id);
    if(!site){site={id:`${region.id}-settlement`,regionId:region.id};state.world.sites.push(site);}
    delete site.neutral;site.simulationMode='detailed';site.name=enemyCapital?'The Unbending Crown':player?'Free Settlement':province?'Remnant Province':'Inherited Settlement';
    const settlement=site.detailedState=createInitialDetailedSettlementData(region.id);
    const loyal=Math.floor(population*share),warriors=enemyCapital?35:province?10:0,children=Math.floor(population/4);
    const loyalChildren=Math.floor(children*share);
    writePopulationBins(settlement,[
      {classId:'villager',allegiance:faction,specialty:'ordinary',kind:'children',age:null,count:loyalChildren},
      {classId:'villager',allegiance:'neutral',specialty:'ordinary',kind:'children',age:null,count:children-loyalChildren},
      {classId:'villager',allegiance:faction,specialty:'warrior',kind:'adults',age:null,count:warriors},
      {classId:'villager',allegiance:faction,specialty:'ordinary',kind:'adults',age:null,count:loyal-loyalChildren-warriors},
      {classId:'villager',allegiance:'neutral',specialty:'ordinary',kind:'adults',age:null,count:population-loyal-children+loyalChildren},
    ]);
    const ids=player?['forage','dryFarming','logging','fm_forcedPageantry','fm_rubblePicking']:
      enemyCapital?['dryFarming','cp_ironCommunion','fe_salvageDetail','fe_capitalDole','fm_handQuern']:
      province?['forage','fe_roadRequisition','fe_barrackLevy','fe_rationRoll','fm_rubblePicking']:
      ['forage','fm_fallowFields','fm_forcedPageantry','fm_woodlotRights','fm_rubblePicking'];
    settlement.practiceSlots=ids.map(practiceId=>{
      const def=getDetailedPracticeDef(state,practiceId);
      return {practiceId,tier:'bronze',instanceId:`institution:${state.civilization.nextPracticeInstanceId++}`,charge:0,work:0,
        ...(def.category==='influence'?{allegiance:faction}:{stock:0})};
    });
    settlement.structureSlots=Array(region.structureCapacity).fill(null);
    settlement.structureSlots[0]={structureId:enemyCapital?'longhouse':province?'timberHouse':'mudHouses',placementId:`${region.id}:housing`,origin:0,width:enemyCapital?2:1};
    if(enemyCapital){settlement.structureSlots[2]={structureId:'granary',placementId:`${region.id}:granary`,origin:2,width:1};if(region.structureCapacity>=6)settlement.structureSlots[3]={structureId:'cp_citadelOfStillness',placementId:`${region.id}:citadel`,origin:3,width:3};}
    else settlement.structureSlots[1]={structureId:province?'fm_villagePalisade':'granary',placementId:`${region.id}:support`,origin:1,width:1};
    for(const slot of settlement.practiceSlots)if('stock'in slot)slot.stock=slot.practiceId==='cp_ironCommunion'?2:stockCapacity(state,settlement,slot);
    settlement.control={unrest:0,claimant:null,claimChecks:0,lossChecks:0};
    settlement.garrison={supplied:true,paid:0,required:0,tSec:state.tSec};
  }
  const monster=state.world.regions.filter(r=>r.controller!=='player'&&r.id!==capital).sort((a,b)=>mapDistance(state,players[0],b.id)-mapDistance(state,players[0],a.id))[0];
  monster.monster={defense:2};state.civilization.chaos.monsterCount=1;state.civilization.chaos.spatialSpawns=1;
  canonicalizeWorldState(state);
}
