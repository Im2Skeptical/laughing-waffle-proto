import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {getHousingCapacity,getPopulationSummary} from '../src/model/detailed-settlements/queries.js';
import {getConnectedRegionIds} from '../src/model/world-state.js';
import {stockCapacity} from '../src/model/detailed-settlements/stock.js';

const report=[];
for(const seed of [123,42,424242]){
 const state=initializeReplayClock(createNewGameState(seed)),capital=state.civilization.remnant.capitalRegionId;
 const core=state.world.sites.filter(s=>s.regionId===capital||s.name==='Remnant Province');
 const rows=core.map(site=>{
  const isCapital=site.regionId===capital,d=site.detailedState,target=isCapital?120:60;
  assert.equal(getPopulationSummary(state,site.regionId).total,target);
  assert.equal(getHousingCapacity(state,site.regionId),target,'class housing fits the target without Tenement meal overhead');
  if(!isCapital)assert(getConnectedRegionIds(state,capital).includes(site.regionId),'every province has a real Crown supply road');
  assert.deepEqual(d.practiceSlots.slice(0,3).map(s=>s.practiceId),['fm_handQuern','rm_scrubForaging','fm_fallowFields'],'meal hosts precede edible grain in routing order');
  assert(d.practiceSlots.every(s=>s.tier===(isCapital?'gold':'silver')));
  const hub=d.structureSlots.find(s=>s?.structureId==='fm_imperialWaystation');assert.equal(hub.qualityBonus,1);
  for(const slot of d.practiceSlots.filter(s=>'stock'in s))assert(slot.stock<=stockCapacity(state,d,slot),'opening buffers obey actual captured capacities');
  if(isCapital)assert.equal(d.practiceSlots.find(s=>s.practiceId==='cp_ironCommunion').stock,2,'Iron Communion keeps its authored two-Arms prime');
  return {regionId:site.regionId,role:isCapital?'capital':'province',initial:target,housing:target,openingMeals:0,openingShortMeals:0,laterMeals:0,laterShortMeals:0,starvationMigrants:0,snapshots:[]};
 });
 for(let sec=1;sec<=1600&&!state.runStatus?.complete;sec++){
  const result=advanceReplayStateToSecond(state,sec);assert(result.ok||state.runStatus?.complete);
  for(const [index,site] of core.entries()){
   const row=rows[index],meal=site.detailedState.lastMeal;
   if(meal?.tSec===sec){
    const period=sec<=64?'opening':'later';row[period+'Meals']++;
    if(meal.ratio<1)row[period+'ShortMeals']++;
    row.starvationMigrants+=Object.values(meal.byClass).reduce((n,c)=>n+(c.migrants??0),0);
   }
   if([64,320,800,1600].includes(sec))row.snapshots.push({year:sec/32,population:getPopulationSummary(state,site.regionId).total,mealRatio:meal?.ratio,held:state.world.regions.find(r=>r.id===site.regionId).controller==='external-a'});
  }
 }
 for(const row of rows){assert(row.openingMeals>0);assert.equal(row.openingShortMeals,0,`seed ${seed}, ${row.regionId}: every core opening meal is fed`);assert(row.snapshots.at(-1).held,'core remains held through year 50');}
 report.push({seed,core:rows});
}
mkdirSync('artifacts/crown-economy',{recursive:true});writeFileSync('artifacts/crown-economy/core-economy.json',JSON.stringify(report,null,2));
// Separate production at the target from subsequent population growth. Keep
// ordinary recipes, food costs, conversion, trade and staffing; stop only natural
// births/aging. Twenty years exhaust an opening buffer that has no working chain.
const steady=[];
for(const seed of [123,42,424242]){
 const state=initializeReplayClock(createNewGameState(seed));
 for(const key of ['birthRateBronze','birthRateSilver','birthRateGold','birthRateDiamond','childToAdultRate','adultToElderRate'])state.gameConfig.settings.values[key]=0;
 const core=state.world.sites.filter(s=>s.regionId===state.civilization.remnant.capitalRegionId||s.name==='Remnant Province');
 const rows=core.map(s=>({regionId:s.regionId,meals:0,short:0,starvationMigrants:0}));
 for(let sec=1;sec<=640;sec++){
  assert(advanceReplayStateToSecond(state,sec).ok);
  core.forEach((s,i)=>{const meal=s.detailedState.lastMeal;if(meal?.tSec!==sec)return;rows[i].meals++;if(meal.ratio<1)rows[i].short++;rows[i].starvationMigrants+=Object.values(meal.byClass).reduce((n,c)=>n+(c.migrants??0),0);});
 }
 for(const row of rows){assert(row.meals>100);assert(1-row.short/row.meals>=.95,`seed ${seed}, ${row.regionId}: sustain target meals after opening buffers`);assert.equal(row.starvationMigrants,0,'target-sized towns do not shed residents through starvation');}
 steady.push({seed,rows});
}
writeFileSync('artifacts/crown-economy/steady-core-economy.json',JSON.stringify(steady,null,2));
console.log('[crown-core] fitted 120/60 targets, real supply/capacities, all opening meals fed across three 50-year starts; 20-year target-sized production keeps >=95% full meals per core town and no starvation migration. Details: artifacts/crown-economy/');
