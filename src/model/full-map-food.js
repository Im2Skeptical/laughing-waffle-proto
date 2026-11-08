// Opening food access, preserving the inherited starter economies. A route is
// access to real providers, not a promise of surplus or free meals after growth.
import {getDetailedPracticeDef} from './game-config.js';
import {getRegionState,getAdjacentRegionIds,addWorldConnection} from './world-state.js';
import {stockCapacity} from './detailed-settlements/stock.js';

export function isOpeningFoodSource(state,id) {
  const def=getDetailedPracticeDef(state,id);
  return !!def?.stockTraits.includes('Edible')&&!def.consume.length&&!def.require.length;
}
const sources=(state,site)=>site.detailedState.practiceSlots.some(s=>s&&isOpeningFoodSource(state,s.practiceId));
function giveLocalSource(state,site) {
  const slots=site.detailedState.practiceSlots;
  // Keep the economic role and primary institutions; only an isolated site's
  // last secondary institution yields its slot for a local food source.
  const empty=slots.findIndex(s=>!s),index=empty>=0?empty:slots.length-1;
  const slot={practiceId:'rm_scrubForaging',tier:'bronze',instanceId:`institution:${state.civilization.nextPracticeInstanceId++}`,charge:0,work:0,stock:0};
  slots[index]=slot;slot.stock=stockCapacity(state,site.detailedState,slot);
}
export function seedFullMapFood(state) {
  const active=state.world.sites.filter(s=>!s.neutral&&s.simulationMode==='detailed');
  const byRegion=new Map(active.map(s=>[s.regionId,s]));
  for(const site of active.filter(s=>!sources(state,s))) {
    const holder=getRegionState(state,site.regionId).controller;
    const suppliers=getAdjacentRegionIds(state,site.regionId).filter(id=>getRegionState(state,id).controller===holder&&byRegion.has(id)&&sources(state,byRegion.get(id)));
    if(suppliers.length)addWorldConnection(state,site.regionId,suppliers[Math.floor(state.rngNextFloat()*suppliers.length)]);
    else giveLocalSource(state,site);
  }
  for(const site of active)site.town.market.practices=site.detailedState.practiceSlots.filter(Boolean).map(s=>s.practiceId);
  // Dormant towns cannot depend on a future holder's allies. Keep five slots
  // and starter-only IDs when adding food to their captured recipe.
  for(const site of state.world.sites.filter(s=>s.neutral||s.simulationMode==='ruin')) {
    const market=site.neutral??site.town?.market;
    if(!market||market.practices.some(id=>isOpeningFoodSource(state,id)))continue;
    if(market.practices.length<5)market.practices.push('rm_scrubForaging');
    else market.practices[market.practices.length-1]='rm_scrubForaging';
  }
}
