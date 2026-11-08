import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {getDetailedPracticeDef} from '../src/model/game-config.js';
import {getConnectedRegionIds,getRegionState} from '../src/model/world-state.js';
import {initializeReplayClock,advanceReplayStateOneSecond} from '../src/model/replay-second-runner.js';
import {runFoodPhase} from '../src/model/detailed-settlements/phases/food.js';
import {getMoonPhaseAtSecond} from '../src/model/moon-phases.js';
const seeds=[123,42,424242,...Array.from({length:64},(_,i)=>i*7919+1)];
const counts={imported:0,one:0,two:0},types=new Set(),misses=[],starvation=[];
for(const seed of seeds){
 const s=initializeReplayClock(createNewGameState(seed)),active=s.world.sites.filter(x=>!x.neutral&&x.simulationMode==='detailed');
 for(const site of active){
  const foods=site.detailedState.practiceSlots.filter(p=>p&&getDetailedPracticeDef(s,p.practiceId).stockTraits.includes('Edible'));
  assert(foods.length<=2,'at most two food-producing Practices');
  counts[foods.length===0?'imported':foods.length===1?'one':'two']++;
  for(const p of foods)types.add(p.practiceId);
  if(!foods.length)assert(getConnectedRegionIds(s,site.regionId).some(id=>getRegionState(s,id).controller===getRegionState(s,site.regionId).controller&&s.world.sites.find(x=>x.regionId===id)?.detailedState.practiceSlots.some(p=>p&&getDetailedPracticeDef(s,p.practiceId).stockTraits.includes('Edible'))),'foodless town has a real allied supplier');
 }
 for(let sec=1;sec<=64;sec++){
  assert(advanceReplayStateOneSecond(s).ok);
  for(const site of active){
   const meal=site.detailedState.lastMeal;
   if(meal?.tSec===s.tSec){
    if(sec===2)assert.equal(meal.ratio,1,'all regions can feed their seeded starting population');
    if(meal.ratio<.5)misses.push({seed,sec,id:site.regionId,ratio:meal.ratio});
    if(Object.values(meal.byClass).some(c=>c.migrants>0))starvation.push({seed,sec,id:site.regionId,ratio:meal.ratio});
   }
  }
 }
 assert.equal(s.world.regions.filter(r=>r.controller==='external-a').length,14,'no opening Crown wipeout within the first two years');
}
assert.deepEqual(starvation,[],'no opening starvation migration or hardship cascade');
assert(counts.imported>0&&counts.one>counts.imported+counts.two,'mostly one source, some budgeted imports');
assert(counts.two/(counts.one+counts.two)<.25,'two-source boards stay uncommon');
assert(types.has('pastoralism')&&types.has('forage')&&types.has('dryFarming'),'several existing food economies');
for(const disconnect of [false,true]){
 const s=createNewGameState(123),importer=s.world.sites.find(site=>!site.neutral&&site.simulationMode==='detailed'&&!site.detailedState.practiceSlots.some(p=>p&&getDetailedPracticeDef(s,p.practiceId).stockTraits.includes('Edible')));
 assert(importer,'fixed review seed includes a genuine import economy');
 if(disconnect)s.world.connections=s.world.connections.filter(e=>e.regionAId!==importer.regionId&&e.regionBId!==importer.regionId);
 runFoodPhase(s,getMoonPhaseAtSecond(s,2));
 assert.equal(importer.detailedState.lastMeal.ratio,disconnect?0:1,'the actual meal resolver needs the seeded road');
}
console.log('[seeded-food] '+JSON.stringify({seeds:seeds.length,counts,types:[...types],transientShortfalls:misses.length,starvation:starvation.length}));

