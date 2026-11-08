import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {getAdjacentRegionIds,getConnectedRegionIds} from '../src/model/world-state.js';
import {allegianceSummary,populationBins,validatePopulationLedger} from '../src/model/detailed-settlements/population-ledger.js';
import {resolveControl,changeController,controlSummary} from '../src/model/detailed-settlements/territory.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {FULL_MAP_SEED_CARD_IDS} from '../src/defs/gamepieces/full-map-defs.js';
import {getHousingCapacity} from '../src/model/detailed-settlements/queries.js';
const seeds=[42,424242,...Array.from({length:128},(_,i)=>i*7919+1)];
for(const seed of seeds){
 const state=createNewGameState(seed),regions=state.world.regions;
 assert.deepEqual(serializeGameState(createNewGameState(seed)),serializeGameState(state),'seeded opening remains deterministic');
 const players=regions.filter(r=>r.controller==='player'),crown=regions.filter(r=>r.controller==='external-a'),monsters=regions.filter(r=>r.monster);
 const neutral=state.world.sites.filter(s=>s.neutral),capital=state.civilization.remnant.capitalRegionId;
 const provinces=state.world.sites.filter(s=>s.name==='Remnant Province');
 assert.equal(regions.length,20,`seed ${seed}`);
 assert.equal(players.length,2);assert.equal(crown.length,14);assert.equal(neutral.length,3);assert.equal(monsters.length,1);
 assert.equal(provinces.length,3);assert(provinces.every(s=>getAdjacentRegionIds(state,capital).includes(s.regionId)));
 const ordinary=crown.filter(r=>r.id!==capital&&!provinces.some(p=>p.regionId===r.id));assert.equal(ordinary.length,10);
 let startingCrownSoldiers=0;
 for(const region of crown){
  const site=state.world.sites.find(s=>s.regionId===region.id),board=site.detailedState.practiceSlots;
  assert(!site.neutral);assert(!region.monster);assert.equal(site.simulationMode,'detailed');assert.equal(board.length,5);
  assert.equal(board.filter(Boolean).length,site.town.market.practices.length);
  const support=allegianceSummary(site.detailedState);
  const bins=populationBins(site.detailedState),soldiers=bins.filter(b=>b.specialty==='warrior');
  const population=region.id===capital?120:provinces.includes(site)?60:({forager:12,timber:14,quarry:14,grain:24,market:24})[site.town.type];
  assert.deepEqual(validatePopulationLedger(site.detailedState),[],'valid joint cohorts');
  assert.equal(bins.reduce((n,b)=>n+b.count,0),population,'troops replace adults without adding residents');
  const expectedLoyal=region.id===capital?108:provinces.includes(site)?48:({forager:5,timber:6,quarry:6,grain:10,market:10})[site.town.type];
  const expectedWarriors=region.id===capital?8:provinces.includes(site)?3:expectedLoyal;
  assert.equal(support['external-a'],expectedLoyal,'core allegiance includes loyal civilians; outer allegiance is its garrison');
  assert(soldiers.length>0&&soldiers.every(b=>b.kind==='adults'&&b.allegiance==='external-a'),'every Crown region starts with loyal adult soldiers');
  const count=soldiers.reduce((n,b)=>n+b.count,0);startingCrownSoldiers+=count;
  const control=controlSummary(state,region.id);assert.equal(control.warriorForce,count);
  if(region.id===capital||provinces.includes(site)){assert.equal(control.status,'supported');assert(control.share>.5);assert(control.minimumShare>0);}
  else{assert.equal(control.status,'occupied');assert(support.neutral>population/2);assert(count<population/2);}
  assert.equal(count,expectedWarriors);
 }
 assert(startingCrownSoldiers>=67&&startingCrownSoldiers<=117,'loyal citizens outnumber the core guards');
 assert(provinces.some(s=>s.detailedState.practiceSlots.some(p=>p?.practiceId==='fe_salvageDetail')),'capital Salvage Detail survives in a provincial slot');
 assert(crown.every(r=>!state.world.sites.find(s=>s.regionId===r.id).detailedState.structureSlots.some(p=>p?.structureId==='fm_crowdedTenement')),'small Crown openings avoid fixed Tenement meal overhead');
 for(const region of regions.filter(r=>r.controller!=='external-a')){
  const site=state.world.sites.find(s=>s.regionId===region.id);
  assert(!populationBins(site.detailedState).some(b=>b.specialty==='warrior'),'no troops added to player, neutral or Monster regions');
 }
 assert(neutral.every(s=>regions.find(r=>r.id===s.regionId).controller==='frontier'&&!regions.find(r=>r.id===s.regionId).monster));
 assert(neutral.some(s=>s.neutral.stocks.some(g=>g.traits.includes('Edible'))&&players.some(p=>getAdjacentRegionIds(state,p.id).includes(s.regionId)&&getConnectedRegionIds(state,p.id).includes(s.regionId))));
 const monsterSite=state.world.sites.find(s=>s.regionId===monsters[0].id);assert.equal(monsters[0].controller,'frontier');assert(!monsterSite.neutral);assert.equal(monsterSite.simulationMode,'ruin');
 resolveControl(state);resolveControl(state);assert.equal(regions.filter(r=>r.controller==='external-a').length,14);
 const active=state.world.sites.filter(s=>s.simulationMode==='detailed'&&!s.neutral);
 for(const site of state.world.sites){
  for(const slot of site.detailedState.practiceSlots.filter(Boolean))assert(FULL_MAP_SEED_CARD_IDS.includes(slot.practiceId),`ordinary Practice seeded: ${slot.practiceId}`);
  for(const slot of site.detailedState.structureSlots.filter(Boolean)){
   assert(FULL_MAP_SEED_CARD_IDS.includes(slot.structureId),`ordinary Structure seeded: ${slot.structureId}`);
   assert(slot.origin+slot.width<=site.detailedState.structureSlots.length,'inherited housing and supports fit the region');
  }
  for(const id of (site.neutral??site.town?.market)?.practices??[])assert(FULL_MAP_SEED_CARD_IDS.includes(id),`ordinary first-control Practice: ${id}`);
 }
 for(const site of active)assert(getHousingCapacity(state,site.regionId)>=Object.values(allegianceSummary(site.detailedState)).reduce((a,b)=>a+b,0),'damaged housing still accommodates the initial population');
 const supports=active.map(s=>s.detailedState.structureSlots.filter(Boolean).find(slot=>slot.placementId.endsWith(':support'))?.structureId);
 assert(supports.every(Boolean),'every active settlement has a support building');
 assert(supports.some(id=>id!=='granary'),'granaries are not universal');
 assert(active.every(s=>s.detailedState.structureSlots.some(slot=>slot?.placementId.endsWith(':housing'))),'retain opening housing');
 const encoded=serializeGameState(state);assert.deepEqual(serializeGameState(deserializeGameState(encoded)),encoded);
}
// Freeze a developed town, then exercise real neutral replenishment through save/replay.
const initial=initializeReplayClock(createNewGameState(42));
const town=initial.world.sites.find(s=>s.name.startsWith('Crown '));changeController(initial,town.regionId,'frontier');
const timeline=createTimelineFromInitialState(initial);advanceReplayStateToSecond(initial,20);
const loaded=initializeReplayClock(deserializeGameState(serializeGameState(initial)),20);
advanceReplayStateToSecond(initial,80);advanceReplayStateToSecond(loaded,80);
assert.deepEqual(serializeGameState(initial),serializeGameState(loaded));
const replay=rebuildStateAtSecond(timeline,80);assert(replay.ok);assert.deepEqual(serializeGameState(replay.state),serializeGameState(initial));
for(const seed of [123,42,424242]){
 // Exercise ordinary New Game with its actual inherited cards and paid trade.
 const fifty=initializeReplayClock(createNewGameState(seed));
 for(const sec of [320,800,1600]){
  assert(advanceReplayStateToSecond(fifty,sec).ok);
  assert(fifty.world.regions.filter(r=>r.controller==='external-a').length>=8,'the civilian core and outer garrisons retain a majority through year 50');
  assert.equal(fifty.world.regions.find(r=>r.id===fifty.civilization.remnant.capitalRegionId).controller,'external-a','the capital remains held');
 }
}
console.log(`[crown-opening] ${seeds.length} seeds: fitted populations, real minority occupations, trade/replay and three ordinary 50-year starts OK`);
