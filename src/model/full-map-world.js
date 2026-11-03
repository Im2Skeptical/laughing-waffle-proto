import { createInitialDetailedSettlementData } from '../defs/world/detailed-settlement-scenario.js';
import { getAdjacentRegionIds, canonicalizeWorldState, getRegionDefinition, addWorldConnection } from './world-state.js';
import { getDetailedPracticeDef } from './game-config.js';
import { createTownMarket } from './detailed-settlements/neutral-market.js';
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
  // Keep the core distant, but require room for exactly three neighbouring provinces
  // and a neutral trading neighbour outside that core at the player opening.
  const distant=state.world.regions.filter(r=>!players.includes(r.id))
    .sort((a,b)=>mapDistance(state,players[0],b.id)-mapDistance(state,players[0],a.id));
  const cores=distant.map(region=>({capital:region.id,provinces:getAdjacentRegionIds(state,region.id)
    .filter(id=>!players.includes(id)).sort((a,b)=>mapDistance(state,players[0],b)-mapDistance(state,players[0],a)).slice(0,3)}));
  const core=cores.find(c=>c.provinces.length===3&&state.world.regions.some(r=>!players.includes(r.id)&&r.id!==c.capital
    &&!c.provinces.includes(r.id)&&players.some(id=>getAdjacentRegionIds(state,id).includes(r.id))));
  if(!core)throw new Error('New Game needs a Crown capital with three provinces and an opening trade neighbour');
  const capital=core.capital,provinces=new Set(core.provinces);
  state.civilization.remnant={capitalRegionId:capital,classId:'warrior',faction:'external-a'};
  const outskirts=state.world.regions.filter(r=>!players.includes(r.id)&&r.id!==capital&&!provinces.has(r.id))
    .sort((a,b)=>Math.min(...players.map(id=>mapDistance(state,id,a.id)))-Math.min(...players.map(id=>mapDistance(state,id,b.id))));
  const neutralIds=new Set(outskirts.slice(0,3).map(r=>r.id));
  const monsterId=outskirts.filter(r=>!neutralIds.has(r.id)).at(-1).id;
  for(const region of state.world.regions) {
    const player=players.includes(region.id),enemyCapital=region.id===capital,province=!player&&provinces.has(region.id),neutral=neutralIds.has(region.id),monster=region.id===monsterId;
    let population=player?20:enemyCapital?120:province?60:30;
    const faction=player?'player':'external-a',share=neutral||monster?0:(player||enemyCapital)?0.8:0.6;
    region.controller=player?'player':neutral||monster?'frontier':'external-a';
    region.detailedSettlementEnabled=true;
    let site=state.world.sites.find(s=>s.regionId===region.id);
    if(!site){site={id:`${region.id}-settlement`,regionId:region.id};state.world.sites.push(site);}
    delete site.neutral;delete site.town;delete region.monster;site.simulationMode='detailed';site.name=enemyCapital?'The Unbending Crown':player?'Free Settlement':province?'Remnant Province':neutral?'Independent Settlement':'Inherited Settlement';
    const settlement=site.detailedState=createInitialDetailedSettlementData(region.id);
    if(!player&&!enemyCapital&&!province){
      const types=getRegionDefinition(state,region.id)?.biome==='plains'?['grain','grain','market']:getRegionDefinition(state,region.id)?.biome==='forest'?['timber','timber','forager']:getRegionDefinition(state,region.id)?.biome==='mountains'?['quarry','quarry','market']:['forager','grain','market'];
      const type=types[Math.floor(state.rngNextFloat()*types.length)];
      const market=createTownMarket(type);
      site.town={type,activated:!neutral&&!monster,...(neutral?{}:{market})};
      if(neutral)site.neutral=market;
      site.name=monster?'Monster-held Settlement':neutral?market.template:`Crown ${market.template}`;
      population=market.housing;
    }
    const loyal=Math.floor(population*share),warriors=enemyCapital?35:province?10:0,children=Math.floor(population/4);
    const loyalChildren=Math.floor(children*share);
    writePopulationBins(settlement,[
      {classId:'villager',allegiance:faction,specialty:'ordinary',kind:'children',age:null,count:loyalChildren},
      {classId:'villager',allegiance:'neutral',specialty:'ordinary',kind:'children',age:null,count:children-loyalChildren},
      {classId:'villager',allegiance:faction,specialty:'warrior',kind:'adults',age:null,count:warriors},
      {classId:'villager',allegiance:faction,specialty:'ordinary',kind:'adults',age:null,count:loyal-loyalChildren-warriors},
      {classId:'villager',allegiance:'neutral',specialty:'ordinary',kind:'adults',age:null,count:population-loyal-children+loyalChildren},
    ]);
    const ids=player?(region.id===players[0]?['dryFarming','fm_handQuern','barter']:[getRegionDefinition(state,region.id)?.biome==='mountains'?'fm_rubblePicking':'logging','barter']):
      enemyCapital?['dryFarming','cp_ironCommunion','fe_salvageDetail','fe_capitalDole','fm_handQuern']:
      province?['forage','fe_roadRequisition','fe_barrackLevy']:
      neutral||monster?[]:site.town.market.practices;
    settlement.practiceSlots=ids.map(practiceId=>{
      const def=getDetailedPracticeDef(state,practiceId);
      return {practiceId,tier:'bronze',instanceId:`institution:${state.civilization.nextPracticeInstanceId++}`,charge:0,work:0,
        ...(def.category==='influence'?{allegiance:faction}:{stock:0})};
    });
    while(settlement.practiceSlots.length<5)settlement.practiceSlots.push(null);
    settlement.structureSlots=Array(region.structureCapacity).fill(null);
    settlement.structureSlots[0]={structureId:enemyCapital?'longhouse':province||!player?'timberHouse':'mudHouses',placementId:`${region.id}:housing`,origin:0,width:enemyCapital?2:1};
    // Match the local economic role, as with the authored starting Practices.
    const hasConstruction=ids.some(id=>getDetailedPracticeDef(state,id).stockTraits?.includes('Construction'));
    if(!neutral&&!monster){
      const support=province?'fm_villagePalisade':hasConstruction?'storehouse':ids.some(id=>getDetailedPracticeDef(state,id).stockTraits?.includes('Edible'))?'granary':'fm_villagePalisade';
      const origin=enemyCapital?2:1;
      settlement.structureSlots[origin]={structureId:support,placementId:`${region.id}:support`,origin,width:1};
      if(enemyCapital&&region.structureCapacity>=6)settlement.structureSlots[3]={structureId:'cp_citadelOfStillness',placementId:`${region.id}:citadel`,origin:3,width:3};
    }
    for(const slot of settlement.practiceSlots)if(slot&&'stock'in slot)slot.stock=slot.practiceId==='cp_ironCommunion'?2:stockCapacity(state,settlement,slot);
    if(site.neutral||monster){settlement.practiceSlots=Array(5).fill(null);settlement.structureSlots=Array(region.structureCapacity).fill(null);}
    if(!site.town){const type=player&&region.id===players[0]?'grain':province?'forager':'market';site.town={type,activated:true,market:createTownMarket(type)};}
    if(monster){site.simulationMode='ruin';region.detailedSettlementEnabled=false;region.monster={defense:2};}
    settlement.control={unrest:0,claimant:null,claimChecks:0,lossChecks:0};
    settlement.garrison={supplied:true,paid:0,required:0,tSec:state.tSec};
  }
  const trade=state.world.sites.find(s=>s.neutral&&players.some(id=>getAdjacentRegionIds(state,id).includes(s.regionId)));
  if(trade){
    if(!trade.neutral.stocks.some(s=>s.traits.includes('Edible'))){trade.neutral=createTownMarket('grain');trade.town.type='grain';trade.name=trade.neutral.template;}
    addWorldConnection(state,players.find(id=>getAdjacentRegionIds(state,id).includes(trade.regionId)),trade.regionId);
  }
  state.civilization.chaos.monsterCount=1;state.civilization.chaos.spatialSpawns=1;
  canonicalizeWorldState(state);
}
