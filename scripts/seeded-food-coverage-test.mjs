import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {getDetailedPracticeDef} from '../src/model/game-config.js';
import {isOpeningFoodSource} from '../src/model/full-map-food.js';
import {getConnectedRegionIds,getRegionState,removeWorldConnection,getAdjacentRegionIds} from '../src/model/world-state.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {FULL_MAP_SEED_CARD_IDS} from '../src/defs/gamepieces/full-map-defs.js';
const seeds=[123,42,424242,...Array.from({length:64},(_,i)=>i*7919+1)];
const counts={imported:0,one:0,two:0},types=new Set();let importFixture;
for(const seed of seeds){
 const s=createNewGameState(seed),active=s.world.sites.filter(x=>!x.neutral&&x.simulationMode==='detailed');
 for(const site of active){
  const sources=site.detailedState.practiceSlots.filter(p=>p&&isOpeningFoodSource(s,p.practiceId));
  assert(sources.length<=2,'preserve at most two independent sources; Grain processing is a separate chain');
  assert(sources.filter(p=>getDetailedPracticeDef(s,p.practiceId).activation.type==='food').length<=1,'one continuous basic food host');
  counts[sources.length===0?'imported':sources.length===1?'one':'two']++;
  for(const p of sources)types.add(p.practiceId);
  for(const p of site.detailedState.practiceSlots.filter(Boolean))assert(FULL_MAP_SEED_CARD_IDS.includes(p.practiceId),'food pass never installs ordinary upgrades');
  if(!sources.length){
   assert(site.detailedState.practiceSlots.some(p=>p?.practiceId==='fm_hearthBarter'),'importer has its own Currency income');
   assert(getConnectedRegionIds(s,site.regionId).some(id=>s.world.sites.find(x=>x.regionId===id)?.neutral?.stocks.some(x=>x.traits.includes('Edible')&&x.price===1&&x.replenishment>0)),'foodless town has a connected affordable replenishing market');
   if(site.town.type==='quarry')importFixture??={seed,regionId:site.regionId};
  }
 }
 const capacities=s.world.sites.filter(x=>x.neutral).map(m=>({id:m.regionId,amount:Math.max(0,m.neutral.stocks.filter(x=>x.traits.includes('Edible')&&x.price===1).reduce((n,x)=>n+x.replenishment,0)-getAdjacentRegionIds(s,m.regionId).filter(id=>getRegionState(s,id).controller==='player').length)}));
 const importers=active.filter(x=>!x.detailedState.practiceSlots.some(p=>p&&isOpeningFoodSource(s,p.practiceId)));
 const canSupply=index=>{
  if(index===importers.length)return true;
  for(const provider of capacities.filter(p=>p.amount&&getConnectedRegionIds(s,importers[index].regionId).includes(p.id))){
   provider.amount--;const ok=canSupply(index+1);provider.amount++;if(ok)return true;
  }
  return false;
 };
 assert(canSupply(0),'connected markets can supply all opening importers without double-counting replenishment');
 for(const site of s.world.sites.filter(x=>x.neutral||x.simulationMode==='ruin'))assert((site.neutral??site.town.market).practices.some(id=>isOpeningFoodSource(s,id)),'dormant town can activate with local basic food');
}
assert(counts.imported>0&&counts.one>counts.two,'local single sources predominate while some towns import');
assert(types.has('rm_scrubForaging')&&types.has('fm_fallowFields'),'use inherited food roles');
// Paid imports do real work. With neither a local meal buffer nor its roads,
// the exact same quarry cannot feed its people on the first Food phase.
assert(importFixture,'cover an opening which genuinely depends on trade');
const connected=initializeReplayClock(createNewGameState(importFixture.seed)),cut=initializeReplayClock(createNewGameState(importFixture.seed));
for(const id of getConnectedRegionIds(cut,importFixture.regionId))removeWorldConnection(cut,importFixture.regionId,id);
advanceReplayStateToSecond(connected,2);advanceReplayStateToSecond(cut,2);
const meal=s=>s.world.sites.find(x=>x.regionId===importFixture.regionId).detailedState.lastMeal;
assert.equal(meal(connected).byClass.villager.ratio,1,'ordinary paid imports feed the quarry');
assert.equal(meal(cut).consumed,0,'disconnecting its supply does not create free food');
// Observe every meal during the vulnerable first two years, not just surviving
// controllers (reserved workers alone can hide a starving residual garrison).
const opening=[];
for(const seed of [123,42,424242]){
 const s=initializeReplayClock(createNewGameState(seed)),rows=[];
 for(let sec=0;sec<=64;sec++){
  assert(advanceReplayStateToSecond(s,sec).ok);
  for(const site of s.world.sites.filter(x=>getRegionState(s,x.regionId).controller==='external-a')){
   const m=site.detailedState.lastMeal;if(m?.tSec!==sec)continue;
   for(const c of Object.values(m.byClass))assert.equal(c.migrants,0,`seed ${seed} ${site.regionId} initial starvation at ${sec}`);
  }
  if(sec===0||sec===64)rows.push({tSec:sec,crown:s.world.regions.filter(r=>r.controller==='external-a').length});
 }
 opening.push({seed,rows});
}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/inherited-food-access-report.json',JSON.stringify({counts,types:[...types],opening},null,2));
console.log('[food-access] '+JSON.stringify({seeds:seeds.length,counts,types:[...types]})+'; paid-import/disconnection and first-two-year starvation checks OK');
