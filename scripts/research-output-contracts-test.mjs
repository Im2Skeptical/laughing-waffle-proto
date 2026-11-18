import assert from 'node:assert/strict';
import {detailedSettlementPracticeDefs as defs} from '../src/defs/gamepieces/detailed-settlement-defs.js';
import {createLabFixture, fiveSlots, practiceSlot, setFixturePopulation} from '../src/model/dev-lab/fixtures.js';
import {getDetailedSettlementSites} from '../src/model/detailed-settlements/queries.js';
import {runPracticeActivation} from '../src/model/detailed-settlements/practices.js';
import {getGamepieceFace} from '../src/model/gamepiece-presentation.js';
import {serializeGameState, deserializeGameState} from '../src/model/state.js';
import {advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {createNewGameState} from '../src/model/new-game.js';
import {selectLifeMapVassal, getCurrentLifeMapVassal} from '../src/model/vassal-life-map.js';
import {applyClassAction} from '../src/model/vassal-life-map/class-actions.js';
import {generateShopInventory} from '../src/model/vassal-life-map/shop.js';

for(const def of Object.values(defs))assert.ok(!(def.effects.some(e=>e.op==='research')&&def.effects.some(e=>e.op==='generateStock')),`${def.id} mixes Research and Stock`);
const researchIds = ['anatomicalStudy', 'heresiography', 'doomsdayChronicle'];
for (const id of researchIds) {
 assert.equal(defs[id].stockCapacity,0);assert.deepEqual(defs[id].stockTraits,[]);
 assert.ok(getGamepieceFace(null,'practice',id).reading.effects.every(e=>!e.text.includes('Stock')),'catalogue reading has no Stock output');
}
assert.match(getGamepieceFace(null,'practice','doomsdayChronicle').reading.effects[0].text,/Gain 3 Research; \+1 per lost settlement \(up to \+4\)/,'inspection explains the capped Research engine');
function prepareScholar() {
  const state = createNewGameState(735);
  state.civilization.research.total = 10000;
  assert.ok(selectLifeMapVassal(state, 0).ok);
  const scholar = getCurrentLifeMapVassal(state);
  applyClassAction(state, scholar, { kind: 'train', classId: 'scholar', establishClass: true, count: 2 });
  assert.equal(scholar.classId, 'scholar');
  return state;
}

const acquisition = deserializeGameState(serializeGameState(prepareScholar()));
const scholar = getCurrentLifeMapVassal(acquisition);
const needed = new Set(researchIds);
for(let visit=0;visit<512&&needed.size;visit++)for(const offer of generateShopInventory(acquisition,scholar,{nodeId:'research-'+visit,family:'practiceReform',purchasedOffers:[]}))needed.delete(offer.intervention.practiceId);
assert.deepEqual([...needed], [], 'ordinary full-map Scholar shops offer all three engines after reload');

// Older schema-52 saves do not opt into the expanded Scholar offer pool.
const earlierSave = serializeGameState(prepareScholar());
for (const id of researchIds) delete earlierSave.gameConfig.gamepieces.practices[id].fullMapOffer;
const earlierRun = deserializeGameState(earlierSave);
for (const id of researchIds) {
  assert.equal(earlierRun.gameConfig.gamepieces.practices[id].fullMapOffer, undefined);
}
const earlierOffers = generateShopInventory(earlierRun, getCurrentLifeMapVassal(earlierRun), {
  nodeId: 'research-visit', family: 'practiceReform', purchasedOffers: [],
});
assert.deepEqual(earlierOffers.map(offer => offer.intervention.practiceId),
  ['fm_copiedCharters', 'saltGathering', 'dryFarming'], 'older schema-52 saves keep the v1.1.75 Scholar shop roll');

function fixture(losses=0,paper=2){
 const state=createLabFixture('charge');
 for(const site of getDetailedSettlementSites(state)){
  site.detailedState.practiceSlots=fiveSlots();site.detailedState.structureSlots.fill(null);setFixturePopulation(site.detailedState,0);
 }
 const site=getDetailedSettlementSites(state,{playerOnly:true})[0];
 site.detailedState.practiceSlots=fiveSlots(practiceSlot('papermaking',paper),practiceSlot('doomsdayChronicle'));
 state.civilization.history.lostSettlements=losses;state.civilization.research.total=0;
 return {state,local:site.detailedState};
}
for(const [losses,paper,expected] of [[0,2,3],[1,2,4],[4,2,7],[10,2,7],[4,0,0]]){
 const {state,local}=fixture(losses,paper),rng=structuredClone(state.rng);
 runPracticeActivation(state,'birth');
 assert.equal(state.civilization.research.total,expected,`Chronicle losses=${losses}, Paper=${paper}`);
 assert.equal(local.practiceSlots[0].stock,paper-(paper?1:0),'pay exactly one Paper on success');
 assert.equal(local.practiceSlots[1].stock,0);assert.deepEqual(state.rng,rng);
}
const {state}=fixture(2),timeline=createTimelineFromInitialState(state);
advanceReplayStateToSecond(state,7);
const restored=deserializeGameState(serializeGameState(state));
advanceReplayStateToSecond(state,13);advanceReplayStateToSecond(restored,13);
assert.equal(state.civilization.research.total,10,'two supplied Births; third blocked without Paper');
assert.deepEqual(serializeGameState(restored),serializeGameState(state),'JSON continuation');
const rebuilt=rebuildStateAtSecond(timeline,13);assert.equal(rebuilt.ok,true);
assert.deepEqual(serializeGameState(rebuilt.state),serializeGameState(state),'authoritative replay');
console.log('[research-outputs] dedicated recipes, preserved shop rolls, Chronicle payment/blocking, capped losses, RNG, save and replay OK');
