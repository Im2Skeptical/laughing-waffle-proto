import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {addMonsterPressure,triggerMonsterSpawn,getMonsterThreat} from '../src/model/detailed-settlements/external-world.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';

for(const seed of [123,42,424242]){
 const state=createNewGameState(seed),source=state.world.regions.find(r=>r.monster),rng={...state.rng};
 const before=source.monster.defense;
 const encoded=serializeGameState(state),threat=getMonsterThreat(state,source.id);
 assert.equal(threat.strength,2);assert.equal(threat.willBeRepelled,true);assert.equal(threat.repelStrengthGain,1);
 assert.deepEqual(serializeGameState(state),encoded,'inspection is read-only');
 addMonsterPressure(state,107);
 const events=state.civilization.practiceEvents.pending;
 const spawn=events.find(e=>e.kind==='monsterSpawn'),target=state.world.regions.find(r=>r.id===spawn.targetRegionId);
 assert.equal(spawn.outcome,'intercepted');
 assert.equal(target.controller,'external-a','successful defense retains the region');
 assert.equal(source.monster.defense,before+1,'a repelled front gains exactly one Strength for its next attack');
 assert.equal(events.filter(e=>e.kind==='monsterPressure'&&e.action==='strengthen').length,1);
 assert.equal(events.filter(e=>e.kind==='monsterSpawn').length,1,'escalation does not resolve another Spawn');
 assert.equal(state.civilization.chaos.monsterPressure,7,'one Spawn spends one full meter and retains overflow');
 assert.deepEqual(state.civilization.chaos.lastMonsterSpawn,{tSec:0,cause:'creep',outcome:'intercepted',sourceRegionId:source.id,targetRegionId:target.id,strengthBefore:2,strengthAfter:3});
 assert.deepEqual(state.rng,rng,'repel escalation adds no random draws');assert.equal(state.tSec,0);
 let result;
 for(let i=0;i<40;i++){
  const strength=source.monster.defense,prediction=getMonsterThreat(state,source.id);result=triggerMonsterSpawn(state);
  assert.equal(result.outcome==='intercepted',prediction.willBeRepelled,'inspection predicts the resolver, including equal Strength and Defense');
  if(result.outcome==='expanded'){
   assert.equal(source.monster.defense,strength,'successful expansion does not receive the repel bonus');break;
  }
  assert.equal(result.outcome,'intercepted');assert.equal(source.monster.defense,strength+1);
 }
 assert.equal(result.outcome,'expanded','static Crown defenses delay the threat without permanently freezing it');
}
const overflow=createNewGameState(123),front=overflow.world.regions.find(r=>r.monster);
addMonsterPressure(overflow,207);
assert.equal(front.monster.defense,4,'two repelled Spawns each add one Strength');
assert.equal(overflow.civilization.chaos.expansionEvents,2);assert.equal(overflow.civilization.chaos.monsterPressure,7);
const absent=createNewGameState(123);for(const r of absent.world.regions)delete r.monster;
const appeared=triggerMonsterSpawn(absent);
assert.equal(appeared.outcome,'appeared');
assert.equal(absent.world.regions.find(r=>r.id===appeared.targetRegionId).monster.defense,3,'a fresh appearance keeps the existing base Strength without a repel bonus');

const initial=initializeReplayClock(createNewGameState(123));
initial.civilization.chaos.chaosPower=200;initial.civilization.chaos.monsterPressure=99;
const timeline=createTimelineFromInitialState(initial);
assert(advanceReplayStateToSecond(initial,16).ok);
const loaded=initializeReplayClock(deserializeGameState(serializeGameState(initial)),16);
assert(advanceReplayStateToSecond(initial,64).ok);assert(advanceReplayStateToSecond(loaded,64).ok);
assert.deepEqual(serializeGameState(loaded),serializeGameState(initial),'JSON continuation preserves escalating Strength');
const replay=rebuildStateAtSecond(timeline,64);assert(replay.ok);
assert.deepEqual(serializeGameState(replay.state),serializeGameState(initial),'authoritative replay produces the same strengthened fronts');
const invalid=serializeGameState(initial);invalid.civilization.chaos.lastMonsterSpawn.strengthAfter=-1;
assert.throws(()=>deserializeGameState(invalid),/Invalid serialized Monster Spawn result/);
const incomplete=serializeGameState(overflow);incomplete.civilization.chaos.lastMonsterSpawn.strengthAfter=null;
assert.throws(()=>deserializeGameState(incomplete),/Invalid serialized Monster Spawn result/);
const missing=serializeGameState(initial);delete missing.civilization.chaos.lastMonsterSpawn;
assert.throws(()=>deserializeGameState(missing),/Invalid serialized Monster Spawn result/);
const obsolete=serializeGameState(initial);obsolete.gameStateSchemaVersion=44;
assert.throws(()=>deserializeGameState(obsolete),/expected v46/);
const lifetimes=[];
for(const seed of [123,42,424242]){
 const run=initializeReplayClock(createNewGameState(seed));
 for(let second=32;second<=12800&&!run.runStatus?.complete;second+=32){
  const result=advanceReplayStateToSecond(run,second);assert(result.ok||run.runStatus?.complete);
 }
 assert(run.runStatus?.complete,`ordinary seed ${seed} must finish rather than stall`);
 lifetimes.push(run.tSec/32);
}
assert(lifetimes.reduce((a,b)=>a+b,0)/lifetimes.length<200,'ordinary baseline mean extinction stays below 200 years');
console.log('[monster-escalation] +1 per repel, defense retention, eventual breach, overflow, RNG, JSON continuation and replay OK');
