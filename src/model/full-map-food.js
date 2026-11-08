// Fit Crown openings to the inherited economy. These are initial conditions;
// normal priced trade, meals, staffing and growth take over after seeding.
import {getDetailedPracticeDef,getDetailedStructureDef} from './game-config.js';
import {getRegionState,getAdjacentRegionIds,addWorldConnection} from './world-state.js';
import {stockCapacity} from './detailed-settlements/stock.js';
import {populationBins} from './detailed-settlements/population-ledger.js';

function fitCrownHousing(state,site) {
  const d=site.detailedState,target=populationBins(d).reduce((n,b)=>n+b.count,0);
  const retained=d.structureSlots.filter(s=>s&&!getDetailedStructureDef(state,s.structureId).housing);
  const cottage=getDetailedStructureDef(state,'fm_crumblingCottages');
  const count=cottage.housing>0?Math.ceil(target/cottage.housing):0;
  const housing=Array.from({length:count},(_,i)=>({structureId:cottage.id,placementId:`${site.regionId}:housing${i?':'+(i+1):''}`,width:cottage.footprint}));
  // Keep only the Citadel already seeded for this region; freed cells do not
  // create additional military buildings. Respect captured definition sizes.
  d.structureSlots=Array(d.structureSlots.length).fill(null);let origin=0;
  for(const slot of [...housing,...retained]) {
    if(origin+slot.width>d.structureSlots.length)break;
    d.structureSlots[origin]={...slot,origin};origin+=slot.width;
  }
}

export function isOpeningFoodSource(state,id) {
  const def=getDetailedPracticeDef(state,id);
  return !!def?.stockTraits.includes('Edible')&&!def.consume.length&&!def.require.length;
}
const sources=(state,site)=>site.detailedState.practiceSlots.some(s=>s&&isOpeningFoodSource(state,s.practiceId));
function giveLocalSource(state,site,displaced,indexOverride) {
  const slots=site.detailedState.practiceSlots;
  // Keep the economic role and primary institutions; only an isolated site's
  // last secondary institution yields its slot for a local food source.
  const empty=slots.findIndex(s=>!s),index=indexOverride>=0?indexOverride:empty>=0?empty:slots.length-1;
  if(slots[index])displaced.push(slots[index]);
  const slot={practiceId:'rm_scrubForaging',tier:'bronze',instanceId:`institution:${state.civilization.nextPracticeInstanceId++}`,charge:0,work:0,stock:0};
  slots[index]=slot;slot.stock=stockCapacity(state,site.detailedState,slot);
}
export function seedFullMapFood(state,coreRegionIds) {
  const active=state.world.sites.filter(s=>!s.neutral&&s.simulationMode==='detailed');
  const crown=active.filter(s=>getRegionState(state,s.regionId).controller==='external-a'),displaced=[];
  for(const site of crown){
    // Developed core packages already include fitted Warrior housing and a
    // seasonal food chain. This pass fits the smaller inherited outer towns.
    if(coreRegionIds.has(site.regionId))continue;
    fitCrownHousing(state,site);
    // A downsized Market Town needs one basic meal host. Keep the seasonal
    // Grain/Milling chain distinctive to grain villages and the capital.
    if(site.town.type==='market'&&site.regionId!==state.civilization.remnant.capitalRegionId)
      site.detailedState.practiceSlots=site.detailedState.practiceSlots.map(s=>s?.practiceId==='fm_fallowFields'?null:s);
  }
  const markets=state.world.sites.filter(s=>s.neutral);
  // Reserve replenishment for existing player access, then budget one affordable
  // meal per importing village. An allied Scrub host has no guaranteed surplus.
  const budgets=new Map(markets.map(s=>[s.regionId,Math.max(0,s.neutral.stocks.filter(x=>x.traits.includes('Edible')&&x.price===1).reduce((n,x)=>n+x.replenishment,0)-getAdjacentRegionIds(state,s.regionId).filter(id=>getRegionState(state,id).controller==='player').length)]));
  for(const site of active.filter(s=>!sources(state,s))) {
    const canPay=site.detailedState.practiceSlots.some(s=>s?.practiceId==='fm_hearthBarter');
    const supplier=canPay&&getAdjacentRegionIds(state,site.regionId).find(id=>(budgets.get(id)??0)>=1);
    if(supplier){addWorldConnection(state,site.regionId,supplier);budgets.set(supplier,budgets.get(supplier)-1);}
    else giveLocalSource(state,site,displaced);
  }
  // Dormant towns cannot depend on a future holder's allies. Keep five slots
  // and starter-only IDs when adding food to their captured recipe.
  for(const site of state.world.sites.filter(s=>s.neutral||s.simulationMode==='ruin')) {
    const market=site.neutral??site.town?.market;
    if(!market||market.practices.some(id=>isOpeningFoodSource(state,id)))continue;
    if(market.practices.length<5)market.practices.push('rm_scrubForaging');
    else market.practices[market.practices.length-1]='rm_scrubForaging';
  }
  // Food can displace a secondary institution on a full board. Preserve each
  // distinct active institution in an empty provincial slot rather than erase
  // the remnant's arms/industry content to fund its smaller opening.
  const installed=new Set(state.world.sites.flatMap(s=>s.neutral||s.simulationMode==='ruin'?(s.neutral??s.town.market).practices:s.detailedState.practiceSlots.filter(Boolean).map(x=>x.practiceId)));
  for(const slot of displaced) {
    if(installed.has(slot.practiceId))continue;
    const province=crown.find(s=>s.name==='Remnant Province'&&s.detailedState.practiceSlots.some(x=>!x));
    if(!province)continue;
    province.detailedState.practiceSlots[province.detailedState.practiceSlots.findIndex(x=>!x)]=slot;
    if('stock'in slot)slot.stock=Math.min(slot.stock,stockCapacity(state,province.detailedState,slot));
    installed.add(slot.practiceId);
  }
  for(const site of active)site.town.market.practices=site.detailedState.practiceSlots.filter(Boolean).map(s=>s.practiceId);
}
