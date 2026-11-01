import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {getAdjacentRegionIds,getConnectedRegionIds} from '../src/model/world-state.js';
import {allegianceSummary} from '../src/model/detailed-settlements/population-ledger.js';
import {resolveControl,changeController} from '../src/model/detailed-settlements/territory.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';
const seeds=[42,424242,...Array.from({length:128},(_,i)=>i*7919+1)];
for(const seed of seeds){
 const state=createNewGameState(seed),regions=state.world.regions;
 const players=regions.filter(r=>r.controller==='player'),crown=regions.filter(r=>r.controller==='external-a'),monsters=regions.filter(r=>r.monster);
 const neutral=state.world.sites.filter(s=>s.neutral),capital=state.civilization.remnant.capitalRegionId;
 const provinces=state.world.sites.filter(s=>s.name==='Remnant Province');
 assert.equal(regions.length,20,`seed ${seed}`);
 assert.equal(players.length,2);assert.equal(crown.length,14);assert.equal(neutral.length,3);assert.equal(monsters.length,1);
 assert.equal(provinces.length,3);assert(provinces.every(s=>getAdjacentRegionIds(state,capital).includes(s.regionId)));
 const ordinary=crown.filter(r=>r.id!==capital&&!provinces.some(p=>p.regionId===r.id));assert.equal(ordinary.length,10);
 for(const region of crown){
  const site=state.world.sites.find(s=>s.regionId===region.id),board=site.detailedState.practiceSlots;
  assert(!site.neutral);assert(!region.monster);assert.equal(site.simulationMode,'detailed');assert.equal(board.length,5);
  assert.equal(board.filter(Boolean).length,region.id===capital?5:provinces.includes(site)?3:site.town.market.practices.length);
  const support=allegianceSummary(site.detailedState);assert(support['external-a']/Object.values(support).reduce((a,b)=>a+b,0)>=.45);
 }
 assert(neutral.every(s=>regions.find(r=>r.id===s.regionId).controller==='frontier'&&!regions.find(r=>r.id===s.regionId).monster));
 assert(neutral.some(s=>s.neutral.stocks.some(g=>g.traits.includes('Edible'))&&players.some(p=>getAdjacentRegionIds(state,p.id).includes(s.regionId)&&getConnectedRegionIds(state,p.id).includes(s.regionId))));
 const monsterSite=state.world.sites.find(s=>s.regionId===monsters[0].id);assert.equal(monsters[0].controller,'frontier');assert(!monsterSite.neutral);assert.equal(monsterSite.simulationMode,'ruin');
 resolveControl(state);resolveControl(state);assert.equal(regions.filter(r=>r.controller==='external-a').length,14);
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
console.log(`[crown-opening] ${seeds.length} seeds: 2 player / 14 Crown (1 capital, 3 provinces, 10 towns) / 3 neutral / 1 Monster; stable control, trade and replay OK`);
