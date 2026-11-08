import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {getDetailedPracticeDef} from '../src/model/game-config.js';
import {isOpeningFoodSource} from '../src/model/full-map-food.js';
import {getConnectedRegionIds,getRegionState} from '../src/model/world-state.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {FULL_MAP_SEED_CARD_IDS} from '../src/defs/gamepieces/full-map-defs.js';
const seeds=[123,42,424242,...Array.from({length:64},(_,i)=>i*7919+1)];
const counts={imported:0,one:0,two:0},types=new Set();
for(const seed of seeds){
 const s=createNewGameState(seed),active=s.world.sites.filter(x=>!x.neutral&&x.simulationMode==='detailed');
 for(const site of active){
  const sources=site.detailedState.practiceSlots.filter(p=>p&&isOpeningFoodSource(s,p.practiceId));
  assert(sources.length<=2,'preserve at most two independent sources; Grain processing is a separate chain');
  assert(sources.filter(p=>getDetailedPracticeDef(s,p.practiceId).activation.type==='food').length<=1,'one continuous basic food host');
  counts[sources.length===0?'imported':sources.length===1?'one':'two']++;
  for(const p of sources)types.add(p.practiceId);
  for(const p of site.detailedState.practiceSlots.filter(Boolean))assert(FULL_MAP_SEED_CARD_IDS.includes(p.practiceId),'food pass never installs ordinary upgrades');
  if(!sources.length)assert(getConnectedRegionIds(s,site.regionId).some(id=>getRegionState(s,id).controller===getRegionState(s,site.regionId).controller&&s.world.sites.find(x=>x.regionId===id)?.detailedState.practiceSlots.some(p=>p&&isOpeningFoodSource(s,p.practiceId))),'foodless town has a connected allied source');
 }
 for(const site of s.world.sites.filter(x=>x.neutral||x.simulationMode==='ruin'))assert((site.neutral??site.town.market).practices.some(id=>isOpeningFoodSource(s,id)),'dormant town can activate with local basic food');
}
assert(counts.imported>0&&counts.one>counts.two,'local single sources predominate while some towns import');
assert(types.has('rm_scrubForaging')&&types.has('fm_fallowFields'),'use inherited food roles');
// Record the actual inherited-food balance. Access does not guarantee surplus,
// and the combined ordinary start is not the supplied 50-year army fixture.
const opening=[];
for(const seed of [123,42,424242]){
 const s=initializeReplayClock(createNewGameState(seed)),rows=[];
 for(const sec of [0,64,320,1600]){assert(advanceReplayStateToSecond(s,sec).ok);rows.push({tSec:sec,crown:s.world.regions.filter(r=>r.controller==='external-a').length});}
 opening.push({seed,rows});
}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/inherited-food-access-report.json',JSON.stringify({counts,types:[...types],opening},null,2));
console.log('[food-access] '+JSON.stringify({seeds:seeds.length,counts,types:[...types]})+'; ordinary food scarcity recorded separately from supplied garrison longevity');
