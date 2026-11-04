import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {createNewGameState,createConfiguredNewGameState} from '../src/model/new-game.js';
import {createStarterBootProfile} from '../src/model/starter-boot-profile.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {tryCreateStructure} from '../src/model/detailed-settlements/practices.js';
import {changeController} from '../src/model/detailed-settlements/territory.js';
import {specialistCount} from '../src/model/detailed-settlements/stock.js';
import {applyAction} from '../src/model/actions.js';
import {getVassalCandidatePool,getCurrentLifeMapVassal} from '../src/model/vassal-life-map.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState,appendActionAtCursor,rebuildStateAtSecond} from '../src/model/timeline/index.js';

function sameState(actual,expected,label) {
  if(isDeepStrictEqual(actual,expected))return;
  const folder='artifacts/neutral-market-structure-boundary';
  mkdirSync(folder,{recursive:true});
  writeFileSync(`${folder}/actual.json`,JSON.stringify(actual));
  writeFileSync(`${folder}/expected.json`,JSON.stringify(expected));
  assert.fail(`${label}; full state comparison: ${folder}/{actual,expected}.json`);
}

function blocked(state,site,label) {
  const before=serializeGameState(state);
  assert.equal(tryCreateStructure(state,site.regionId,'lyceum'),false,`${label} cannot receive an optional Structure`);
  sameState(serializeGameState(state),before,`${label} keeps its board, market, control and RNG unchanged`);
  assert.doesNotThrow(()=>deserializeGameState(serializeGameState(state)),`${label} remains a valid save`);
}

const unopened=createNewGameState(42);
blocked(unopened,unopened.world.sites.find(s=>s.neutral),'unactivated full-map storefront');
const legacy=createConfiguredNewGameState(42,createStarterBootProfile());
blocked(legacy,legacy.world.sites.find(s=>s.neutral),'legacy neutral market');
const reopened=createNewGameState(42),reopenedTown=reopened.world.sites.find(s=>s.neutral);
changeController(reopened,reopenedTown.regionId,'external-a');
assert.equal(reopenedTown.town.activated,true);
changeController(reopened,reopenedTown.regionId,'frontier');
assert.ok(reopenedTown.neutral);
blocked(reopened,reopenedTown,'reopened storefront with a frozen developed board');

for(const faction of ['player','external-a']) {
  const state=createNewGameState(42),site=state.world.sites.find(s=>s.neutral);
  changeController(state,site.regionId,faction);
  assert.equal(site.neutral,undefined);
  const rng=serializeGameState(state).rng;
  assert.equal(tryCreateStructure(state,site.regionId,'lyceum'),true,`${faction} developed town can receive a Structure`);
  assert.ok(site.detailedState.structureSlots.some(s=>s?.structureId==='lyceum'));
  assert.deepEqual(serializeGameState(state).rng,rng,'ordinary optional placement consumes no RNG');
  assert.doesNotThrow(()=>deserializeGameState(serializeGameState(state)));
  site.detailedState.structureSlots=site.detailedState.structureSlots.map((_,origin)=>({structureId:'timberHouse',width:1,origin,placementId:`full:${origin}`}));
  const full=serializeGameState(state);
  assert.equal(tryCreateStructure(state,site.regionId,'lyceum'),false,'no-space rejection remains intact');
  sameState(serializeGameState(state),full,'no-space rejection leaves state unchanged');
}

// Public ordinary seed99117 itinerary: reform -> two studies -> travel to R01
// -> Scholar founding. No direct board, allegiance, class or market mutation.
// Keep this regression independent from task-owned performance artifacts.
const itinerary=[
  [0,'settlementSelectVassal',{candidateIndex:0}],
  [0,'vassalEnterLifeNode',{nodeId:'life-milestone-milestone-1'}],
  [0,'vassalSelectLifeOption',{nodeId:'life-milestone-milestone-1',optionId:'random'}],
  [0,'vassalPurchaseShopOffer',{nodeId:'life-milestone-milestone-1',offerId:'life-milestone-milestone-1:r0:practice:0'}],
  [0,'vassalConfirmLifeNode',{nodeId:'life-milestone-milestone-1'}],
  [64,'vassalEnterLifeNode',{nodeId:'life-d02-r01'}],
  [64,'vassalSelectLifeOption',{nodeId:'life-d02-r01',optionId:'deepStudy'}],
  [64,'vassalConfirmLifeNode',{nodeId:'life-d02-r01'}],
  [384,'vassalEnterLifeNode',{nodeId:'life-d03-r01'}],
  [384,'vassalSelectLifeOption',{nodeId:'life-d03-r01',optionId:'deepStudy'}],
  [384,'vassalConfirmLifeNode',{nodeId:'life-d03-r01'}],
  [653,'vassalChooseDevelopmentStat',{choiceId:'vassal-1:level:1',statId:'wisdom'}],
  [653,'vassalEnterLifeNode',{nodeId:'life-d04-r02'}],
  [653,'vassalSelectLifeOption',{nodeId:'life-d04-r02',optionId:'travel-R01'}],
  [653,'vassalConfirmLifeNode',{nodeId:'life-d04-r02'}],
  [734,'vassalEnterLifeNode',{nodeId:'vassal-1-founding'}],
  [734,'vassalSelectLifeOption',{nodeId:'vassal-1-founding',optionId:'train-estate'}],
  [734,'vassalConfirmLifeNode',{nodeId:'vassal-1-founding'}],
];
const live=createNewGameState(99117);initializeReplayClock(live,0);
const timeline=createTimelineFromInitialState(live);
for(const [second,kind,payload] of itinerary) {
  assert.equal(advanceReplayStateToSecond(live,second).ok,true,`official ticks to ${second}`);
  const action={kind,tSec:second,payload:kind==='settlementSelectVassal'
    ?{...payload,expectedPoolHash:getVassalCandidatePool(live).expectedPoolHash}:payload};
  // Exercise the normal paused action guard, then resume official ticks.
  live.paused=true;
  assert.equal(applyAction(live,action).ok,true,`${kind} is legal in ordinary paused play`);
  live.paused=false;
  assert.equal(appendActionAtCursor(timeline,action,live).ok,true);
}
const town=live.world.sites.find(s=>s.regionId==='R01');
assert.ok(town.neutral);
assert.equal(town.town.activated,false);
const scholarsBefore=specialistCount(town.detailedState,'scholar');
const fork=deserializeGameState(serializeGameState(live));initializeReplayClock(fork,734);
for(const state of [live,fork])assert.equal(advanceReplayStateToSecond(state,740).ok,true);
assert.doesNotThrow(()=>deserializeGameState(serializeGameState(live)),'founding on a storefront must remain serializable');
assert.equal(getCurrentLifeMapVassal(live).classId,'scholar','class founding still completes');
assert.equal(live.civilization.vassalLineage.establishedClassId,'scholar');
assert.equal(specialistCount(town.detailedState,'scholar'),scholarsBefore+2,'founding still trains two Scholars');
assert.ok(town.neutral,'founding does not capture the storefront');
assert.equal(town.town.activated,false,'founding does not activate its board');
assert.equal(town.detailedState.structureSlots.some(Boolean),false,'optional Lyceum is omitted where installation is unavailable');
sameState(serializeGameState(live),serializeGameState(fork),'JSON fork resolves exactly, including RNG');
const replay=rebuildStateAtSecond(timeline,740);
assert.equal(replay.ok,true);
sameState(serializeGameState(live),serializeGameState(replay.state),'authoritative replay resolves exactly, including RNG');
for(const state of [live,fork,replay.state])assert.equal(advanceReplayStateToSecond(state,747).ok,true);
sameState(serializeGameState(live),serializeGameState(fork),'JSON continuation remains exact');
sameState(serializeGameState(live),serializeGameState(replay.state),'replay continuation remains exact');
console.log('[neutral-market-structure-boundary] storefront/frozen-board rejection, ordinary placement, founding/training and exact JSON/replay continuation OK');
