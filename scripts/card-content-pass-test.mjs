import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { getGamepieceFace } from '../src/model/gamepiece-presentation.js';
import { createAuthoredGamepiecesDraft, canonicalizeGamepiecesDraft, validateGamepiecesDraft } from '../src/model/game-config.js';
import { detailedSettlementPracticeDefs as practices, settlementStructureDefs as structures } from '../src/defs/gamepieces/detailed-settlement-defs.js';
import { isFullMapOfferDefinition, FULL_MAP_SEED_CARD_IDS } from '../src/defs/gamepieces/full-map-defs.js';
import { stockOutputBreakdown as output, stockCapacityBreakdown as capacity } from '../src/model/detailed-settlements/stock.js';
import { runPracticeActivation, evaluateDetailedPracticeSlot } from '../src/model/detailed-settlements/practices.js';
import { writePopulationBins } from '../src/model/detailed-settlements/population-ledger.js';
import { practiceSlot, fiveSlots } from '../src/model/dev-lab/fixtures.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { initializeReplayClock, advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { buildProjectionChunkFromStateData } from '../src/model/projection-chunk.js';

const state=createNewGameState(1867);
const board=id=>{
  const site=state.world.sites.find(site=>site.regionId===id);
  site.neutral=null;delete site.town;
  state.world.regions.find(region=>region.id===id).controller='player';
  writePopulationBins(site.detailedState,[]);
  site.detailedState.structureSlots.fill(null);
  return site.detailedState;
};
state.world.connections=[];
const mountain=board('R02'),plain=board('R01'),forest=board('R03');
mountain.practiceSlots=fiveSlots(practiceSlot('quarrying'),practiceSlot('fm_rubblePicking'),practiceSlot('surfaceMining'));
plain.practiceSlots=fiveSlots(practiceSlot('dryFarming'),practiceSlot('fm_fallowFields'),practiceSlot('milling'));
forest.practiceSlots=fiveSlots(practiceSlot('logging'),practiceSlot('fm_woodlotRights'),practiceSlot('quarrying'));
assert.equal(output(state,mountain,mountain.practiceSlots[0]).multiplier,4,'three mountains, including foreign holdings');
assert.equal(output(state,mountain,mountain.practiceSlots[1]).multiplier,1,'starter Stone gets no terrain bonus');
assert.equal(output(state,forest,forest.practiceSlots[2]).multiplier,1,'forest Construction does not boost Quarrying');
assert.equal(capacity(state,forest,forest.practiceSlots[0]).total,18,'Logging has deep forest reserves');
assert.equal(capacity(state,forest,forest.practiceSlots[1]).multiplier,1,'starter Timber gets no self bonus');
assert.equal(output(state,plain,plain.practiceSlots[0]).multiplier,1,'no early harvest bonus');
state.currentSeasonIndex=2;
assert.equal(output(state,plain,plain.practiceSlots[0]).multiplier,3,'Autumn plains harvest');
assert.equal(output(state,plain,plain.practiceSlots[1]).multiplier,1,'starter Grain gets no terrain bonus');
assert.equal(output(state,plain,plain.practiceSlots[2]).multiplier,1,'legacy Milling has no implicit affinity');

// Real scheduled activation produces retained Stock, rather than only a ledger.
state.currentSeasonIndex=1;
runPracticeActivation(state,'season');
assert.equal(mountain.practiceSlots[0].stock,8,'2 base ×4 fits the new Quarry capacity');
assert.equal(mountain.practiceSlots[1].stock,1,'Rubble Picking remains the basic one-Stock recipe');
mountain.practiceSlots[2].stock=0;
const mine=mountain.practiceSlots[2];
assert.equal(output(state,mountain,mine).multiplier,1);
mountain.practiceSlots[3]=practiceSlot('patternCarving',1);
assert.equal(output(state,mountain,mine).multiplier,2,'local Tool is an enabler, kept rather than consumed');
const retainedTool=mountain.practiceSlots[3].stock;
runPracticeActivation(state,'season');
assert.equal(mine.stock,2);
assert.equal(mountain.practiceSlots[3].stock,retainedTool);
mountain.practiceSlots[3].stock=0;
assert.equal(output(state,mountain,mine).multiplier,1,'spent enabler removes its contribution immediately');

// Missing ingredients keep both their Stock and the blocked card's output.
forest.practiceSlots=fiveSlots(practiceSlot('papermaking'),practiceSlot('logging',1));
assert.equal(evaluateDetailedPracticeSlot(state,'R03',0).supplied,false);
runPracticeActivation(state,'birth');
assert.equal(forest.practiceSlots[0].stock,0);
assert.equal(forest.practiceSlots[1].stock,1);

// Broad and specialised storage are distinct purchases. Completion still gates both.
mountain.structureSlots[0]={structureId:'storehouse',origin:0,width:1,placementId:'test:store'};
assert.equal(capacity(state,mountain,mine).multiplier,2,'Storehouse supports Ore as well as Construction');
plain.structureSlots[0]={structureId:'granary',origin:0,width:1,placementId:'test:grain'};
assert.equal(capacity(state,plain,plain.practiceSlots[0]).multiplier,3);
plain.practiceSlots[3]=practiceSlot('forage');
assert.equal(capacity(state,plain,plain.practiceSlots[3]).multiplier,1,'Granary is specialised Grain storage');
plain.structureSlots[0].construction={completedCycles:0};
assert.equal(capacity(state,plain,plain.practiceSlots[0]).multiplier,1);

const draft=createAuthoredGamepiecesDraft();
draft.practices.quarrying.stockMultipliers[0].amount=2;
draft.practices.scarredShields.keywordCapacityScale.amount=2;
assert.equal(validateGamepiecesDraft(draft).ok,true);
const captured=canonicalizeGamepiecesDraft(draft);
assert.deepEqual(captured.practices.quarrying.stockMultipliers,draft.practices.quarrying.stockMultipliers);
assert.deepEqual(captured.practices.scarredShields.keywordCapacityScale,draft.practices.scarredShields.keywordCapacityScale);
const researchDraft=structuredClone(draft);
delete researchDraft.practices.forage.stockMultipliers;
researchDraft.practices.forage.effects=[{op:'research',amount:1}];
assert.equal(validateGamepiecesDraft(researchDraft).ok,true,'a captured replacement recipe can remove optional Stock multipliers');
assert.equal(canonicalizeGamepiecesDraft(researchDraft).practices.forage.stockMultipliers,undefined);
for(const mod of [{kind:'bad',amount:1},{kind:'__proto__',amount:1},{kind:'capacity',amount:1,perRegion:true},
  {kind:'capacity',amount:1,biome:'bogus'},{kind:'capacity',amount:1,seasonKeys:['bad']},
  {kind:'capacity',amount:1,stockedTraitsAny:['bad']},{kind:'capacity',amount:1,cap:3}]){
  const invalid=structuredClone(draft);invalid.practices.quarrying.stockMultipliers=[mod];
  assert.equal(validateGamepiecesDraft(invalid).ok,false,'unsupported DSL fails validation');
}

let reviewed=0;
for(const [kind,defs] of [['practice',practices],['structure',structures]])for(const def of Object.values(defs)){
  if(!isFullMapOfferDefinition(def)&&!FULL_MAP_SEED_CARD_IDS.includes(def.id))continue;
  reviewed++;
  const face=getGamepieceFace(null,kind,def.id,def.minimumQuality);
  assert.ok(face.reading.flavour,`${def.id}: intentional flavor on the catalogue face`);
  assert.doesNotMatch(face.rule,/Removed political clause|Revision:|outputMultiplier|\+\d+ capacity\b(?! Multiplier)/i,`${def.id}: player-facing copy`);
  for(const effect of face.reading.effects.filter(effect=>effect.passive))assert.equal(effect.timing,'');
  if(FULL_MAP_SEED_CARD_IDS.includes(def.id))assert.equal(def.stockMultipliers,undefined,'starters have no authored multiplier machinery');
  for(const field of ['keywordOutputScale','keywordCapacityScale'])if(def[field])assert.equal(def[field].cap,undefined,'ordinary card keyword scaling is uncapped');
}
assert.equal(reviewed,117);
const bake=getGamepieceFace(null,'structure','fm_publicBakehouse').reading.effects.map(e=>e.text).join(' ');
assert.match(bake,/Fuel/,'printed Bakehouse condition is visible');
const archive=getGamepieceFace(null,'structure','fm_openArchive').reading.effects.map(e=>e.text).join(' ');
assert.match(archive,/Output Multiplier/);assert.match(archive,/Paper/);

const before=JSON.stringify(serializeGameState(state));
getGamepieceFace(state,'practice','quarrying','bronze',{settlement:mountain,slot:mountain.practiceSlots[0]});
assert.equal(JSON.stringify(serializeGameState(state)),before,'inspection is pure, including RNG');
initializeReplayClock(state);
const saved=serializeGameState(state),loaded=deserializeGameState(saved),timeline=createTimelineFromInitialState(state);
const forecast=buildProjectionChunkFromStateData(saved,state.tSec,state.tSec+18);
assert.equal(forecast.ok,true);
assert.equal(advanceReplayStateToSecond(state,18).ok,true);
assert.equal(advanceReplayStateToSecond(loaded,18).ok,true);
const expected=serializeGameState(state);
assert.deepEqual(serializeGameState(loaded),expected,'JSON continuation');
assert.deepEqual(serializeGameState(rebuildStateAtSecond(timeline,18).state),expected,'authoritative replay');
assert.deepEqual(forecast.lastStateData,expected,'forecast uses the same rules');
console.log('[card-content-pass] OK: 117 card readings; real terrain/supply activation, retained yield, blocked payment, independent storage, captured DSL, JSON/replay/forecast parity');
