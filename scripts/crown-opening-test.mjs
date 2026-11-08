import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {getAdjacentRegionIds,getConnectedRegionIds} from '../src/model/world-state.js';
import {allegianceSummary,populationBins,writePopulationBins,validatePopulationLedger} from '../src/model/detailed-settlements/population-ledger.js';
import {resolveControl,changeController,controlSummary} from '../src/model/detailed-settlements/territory.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';
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
  const population=region.id===capital?120:provinces.includes(site)?60:site.town.market.housing;
  assert.deepEqual(validatePopulationLedger(site.detailedState),[],'valid joint cohorts');
  assert.equal(bins.reduce((n,b)=>n+b.count,0),population,'troops replace adults without adding residents');
  const oldShare=region.id===capital?.8:provinces.includes(site)?.6:.35;
  const loyalChildren=Math.floor(Math.floor(population/4)*oldShare);
  const expectedWarriors=region.id===capital?90:provinces.includes(site)?35:({18:9,24:11,30:14,60:27})[population];
  assert.equal(support['external-a'],loyalChildren+expectedWarriors,'recruits come from existing adults and keep separate child allegiance');
  assert(soldiers.length>0&&soldiers.every(b=>b.kind==='adults'&&b.allegiance==='external-a'),'every Crown region starts with loyal adult soldiers');
  const count=soldiers.reduce((n,b)=>n+b.count,0);startingCrownSoldiers+=count;
  const control=controlSummary(state,region.id);assert.equal(control.warriorForce,count);
  assert.equal(control.status,'supported');assert(control.share>.5,'larger garrisons also create population majorities');
  assert.equal(count,expectedWarriors);
 }
 assert(startingCrownSoldiers>300,'larger Crown opening is capped by existing adult residents');
 for(const region of regions.filter(r=>r.controller!=='external-a')){
  const site=state.world.sites.find(s=>s.regionId===region.id);
  assert(!populationBins(site.detailedState).some(b=>b.specialty==='warrior'),'no troops added to player, neutral or Monster regions');
 }
 assert(neutral.every(s=>regions.find(r=>r.id===s.regionId).controller==='frontier'&&!regions.find(r=>r.id===s.regionId).monster));
 assert(neutral.some(s=>s.neutral.stocks.some(g=>g.traits.includes('Edible'))&&players.some(p=>getAdjacentRegionIds(state,p.id).includes(s.regionId)&&getConnectedRegionIds(state,p.id).includes(s.regionId))));
 const monsterSite=state.world.sites.find(s=>s.regionId===monsters[0].id);assert.equal(monsters[0].controller,'frontier');assert(!monsterSite.neutral);assert.equal(monsterSite.simulationMode,'ruin');
 resolveControl(state);resolveControl(state);assert.equal(regions.filter(r=>r.controller==='external-a').length,14);
 const active=state.world.sites.filter(s=>s.simulationMode==='detailed'&&!s.neutral);
 const supports=active.map(s=>s.detailedState.structureSlots.filter(Boolean).find(slot=>slot.placementId.endsWith(':support'))?.structureId);
 assert(supports.every(Boolean),'every active settlement has a support building');
 assert(supports.some(id=>id!=='granary'),'granaries are not universal');
 assert(active.every(s=>s.detailedState.structureSlots.some(slot=>slot?.placementId.endsWith(':housing'))),'retain opening housing');
 const encoded=serializeGameState(state);assert.deepEqual(serializeGameState(deserializeGameState(encoded)),encoded);
}
// Outer Crown control genuinely depends on its army, not majority allegiance.
const occupied=createNewGameState(123),outer=occupied.world.sites.find(s=>s.name.startsWith('Crown '));
const minorityTotal=populationBins(outer.detailedState).reduce((n,b)=>n+b.count,0),minorityLoyal=Math.floor(minorityTotal*.35),minorityArmy=Math.min(minorityLoyal,Math.ceil(minorityTotal/4));
writePopulationBins(outer.detailedState,[
 {classId:'villager',allegiance:'external-a',specialty:'warrior',kind:'adults',age:null,count:minorityArmy},
 {classId:'villager',allegiance:'external-a',specialty:'ordinary',kind:'adults',age:null,count:minorityLoyal-minorityArmy},
 {classId:'villager',allegiance:'neutral',specialty:'ordinary',kind:'adults',age:null,count:minorityTotal-minorityLoyal},
]);
for(let i=0;i<4;i++)resolveControl(occupied);
assert.equal(occupied.world.regions.find(r=>r.id===outer.regionId).controller,'external-a');
writePopulationBins(outer.detailedState,populationBins(outer.detailedState).map(b=>({...b,specialty:'ordinary'})));
for(let i=0;i<4;i++)resolveControl(occupied);
assert.equal(occupied.world.regions.find(r=>r.id===outer.regionId).controller,'frontier','removing the army loses unsupported Crown control');
// Freeze a developed town, then exercise real neutral replenishment through save/replay.
const initial=initializeReplayClock(createNewGameState(42));
const town=initial.world.sites.find(s=>s.name.startsWith('Crown '));changeController(initial,town.regionId,'frontier');
const timeline=createTimelineFromInitialState(initial);advanceReplayStateToSecond(initial,20);
const loaded=initializeReplayClock(deserializeGameState(serializeGameState(initial)),20);
advanceReplayStateToSecond(initial,80);advanceReplayStateToSecond(loaded,80);
assert.deepEqual(serializeGameState(initial),serializeGameState(loaded));
const replay=rebuildStateAtSecond(timeline,80);assert(replay.ok);assert.deepEqual(serializeGameState(replay.state),serializeGameState(initial));
for(const seed of [123,42,424242]){
 const fifty=initializeReplayClock(createNewGameState(seed));
 for(const sec of [320,800,1600]){
  assert(advanceReplayStateToSecond(fifty,sec).ok);
  assert(fifty.world.regions.filter(r=>r.controller==='external-a').length>=8,'larger Crown start retains most holdings through year 50');
 }
}
console.log(`[crown-opening] ${seeds.length} seeds: larger loyal armies, conserved residents, trade/replay and three 50-year Crown starts OK`);
