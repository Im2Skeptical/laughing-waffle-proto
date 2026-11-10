import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {mkdirSync,writeFileSync} from 'node:fs';
function same(actual,expected,message='state equality'){
  if(!isDeepStrictEqual(actual,expected)){
    mkdirSync('artifacts/unrest',{recursive:true});
    writeFileSync('artifacts/unrest/state-mismatch.json',JSON.stringify({message,actual,expected},null,2));
    assert.fail(`${message}; details: artifacts/unrest/state-mismatch.json`);
  }
}
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {getRegionState,validateWorldState,addWorldConnection} from '../src/model/world-state.js';
import {writePopulationBins,populationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {resolveControl,controlSummary,changeController,stepUnrest} from '../src/model/detailed-settlements/territory.js';
import {getRegionPrestigePerNode} from '../src/model/vassal-life-map/selectors.js';
import {getDetailedCivilizationSummary} from '../src/model/detailed-settlements/view-model.js';
import {stockProviderSlots} from '../src/model/detailed-settlements/stock.js';
import {runGlobalChaos} from '../src/model/detailed-settlements/phases/chaos.js';
import {runHousingPhase} from '../src/model/detailed-settlements/phases/housing.js';
import {runFaithPhase} from '../src/model/detailed-settlements/phases/faith.js';
import {runMigrationPhase} from '../src/model/detailed-settlements/phases/migration.js';
import {getMoonPhaseAtSecond} from '../src/model/moon-phases.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';

const bin=(allegiance,count=20,specialty='ordinary')=>({classId:'villager',kind:'adults',age:null,specialty,allegiance,count});
function fixture(){
  const state=createNewGameState(123),site=state.world.sites.find(s=>getRegionState(state,s.regionId).controller==='player');
  writePopulationBins(site.detailedState,[bin('neutral')]);
  site.detailedState.practiceSlots=Array(5).fill(null);
  site.detailedState.practiceSlots[0]={practiceId:'rm_scrubForaging',tier:'bronze',stock:0,charge:0,work:0,instanceId:'unrest-test-food'};
  return {state,site,d:site.detailedState};
}

// Losing control must not stop the local Housing/Faith phases before expiry.
for(const overcrowded of [true,false]){
  const {state,site,d}=fixture();
  if(overcrowded)d.structureSlots.fill(null);
  d.populationByClass.villager.faith={tier:overcrowded?'gold':'bronze',trend:null,streak:0,collapseActive:false};
  resolveControl(state);
  runHousingPhase(state,getMoonPhaseAtSecond(state,3));
  const turn=state.civilization.currentMoonTurn,result=turn.regions[site.regionId];
  assert.equal(result.housing?.overflow,overcrowded?20:0,'Unrest still assesses real local housing');
  assert.equal(result.housing.migrants,overcrowded?20:0);
  result.food={byClass:{villager:{targetHappiness:'negative'}}};
  runFaithPhase(state,getMoonPhaseAtSecond(state,4));
  assert.equal(result.faith?.byClass.villager.happiness,'negative');
  assert.equal(result.faith.byClass.villager.faithStreak,1);
  if(!overcrowded)assert.equal(result.faith.byClass.villager.displaced,5,'Bronze collapse still displaces residents');
  const crown=state.world.sites.find(s=>getRegionState(state,s.regionId).controller==='external-a');
  assert.equal(turn.regions[crown.regionId].housing,null,'ordinary Crown scope remains unchanged');
  assert.equal(turn.regions[crown.regionId].faith,null);
  state.tSec=320;stepUnrest(state);
  runHousingPhase(state,getMoonPhaseAtSecond(state,321));
  runFaithPhase(state,getMoonPhaseAtSecond(state,322));
  const expired=state.civilization.currentMoonTurn.regions[site.regionId];
  assert.equal(expired.housing,null,'ordinary unheld towns stop local phases after expiry');
  assert.equal(expired.faith,null);
}

// Expiry can fall between any two moon phases with captured non-default clocks.
// Queued work must not mutate a storefront later, or lose already-booked people.
for(const mode of ['pending','inbound','outbound','hardship']){
  const {state,site,d}=fixture();
  const other=state.world.sites.find(s=>s!==site&&getRegionState(state,s.regionId).controller==='player');
  const phaseSeconds=mode==='pending'?3:6,startSec=mode==='pending'?16:31;
  state.gameConfig.settings.values.phaseDurationSec=phaseSeconds;
  state.gameConfig.settings.values.migrationHardshipDeathRate=1;
  state.world.connections=[];
  if(mode!=='hardship')addWorldConnection(state,site.regionId,other.regionId);
  writePopulationBins(d,mode==='outbound'?[bin('neutral',20),bin('neutral',5,'warrior')]:[bin('neutral')]);
  writePopulationBins(other.detailedState,mode==='inbound'?[bin('player',20),bin('player',5,'warrior')]:[bin('player',mode==='pending'?1:20)]);
  d.practiceSlots[0].stock=1;
  other.detailedState.practiceSlots=Array(5).fill(null);
  other.detailedState.practiceSlots[0]={...d.practiceSlots[0],instanceId:'unrest-neighbour-food'};
  const sourceBefore=populationBins(d),otherBefore=populationBins(other.detailedState);
  state.tSec=startSec;resolveControl(state);
  assert.equal(d.control.unrest.untilSec,mode==='pending'?336:351);
  const housingSec=mode==='pending'?331:337,faithSec=mode==='pending'?334:343;
  state.tSec=housingSec;runHousingPhase(state,getMoonPhaseAtSecond(state,housingSec));
  for(const target of [site,other]){
    const leaving=target===site?mode!=='inbound':mode==='inbound';
    target.detailedState.populationByClass.villager.faith={tier:leaving?'bronze':'gold',trend:null,streak:0,collapseActive:false};
    state.civilization.currentMoonTurn.regions[target.regionId].food={byClass:{villager:{targetHappiness:leaving?'negative':'positive'}}};
  }
  state.tSec=faithSec;runFaithPhase(state,getMoonPhaseAtSecond(state,faithSec));
  const turn=state.civilization.currentMoonTurn;
  if(mode==='pending')assert(turn.migrationIntents.some(i=>i.sourceId===site.regionId&&i.requested===5));
  else{
    state.tSec=349;runMigrationPhase(state,getMoonPhaseAtSecond(state,349));
    if(mode==='hardship')assert.equal(turn.unresolved.find(i=>i.sourceRegionId===site.regionId)?.count,5);
    else assert.equal(turn.movements.find(m=>m.sourceRegionId===(mode==='inbound'?other.regionId:site.regionId))?.amount,7);
  }
  const snapshotSec=state.tSec,endSec=mode==='pending'?337:355;
  initializeReplayClock(state,snapshotSec);
  const loaded=deserializeGameState(serializeGameState(state)),timeline=createTimelineFromInitialState(state);
  assert(advanceReplayStateToSecond(state,endSec).ok);
  assert(advanceReplayStateToSecond(loaded,endSec).ok);
  assert.equal(d.control.unrest,null);assert(site.neutral);
  same(populationBins(d),sourceBefore,`${mode}: frozen residents retain count and identity`);
  same(populationBins(other.detailedState),otherBefore,`${mode}: booked migrants return exactly once to their source`);
  same(serializeGameState(loaded),serializeGameState(state),`${mode}: save continuation across pending work`);
  const rebuilt=rebuildStateAtSecond(timeline,endSec);assert(rebuilt.ok);
  same(serializeGameState(rebuilt.state),serializeGameState(state),`${mode}: replay across expiry`);
}

// Losing the holder never changes who the residents are or recreates a board.
{
  const {state,site,d}=fixture(),bins=populationBins(d),board=structuredClone(d.practiceSlots),rng={...state.rng};
  resolveControl(state);
  assert.equal(getRegionState(state,site.regionId).controller,'frontier');
  same(d.control.unrest,{startedSec:0,untilSec:320,previousController:'player'});
  assert.equal(controlSummary(state,site.regionId).status,'unrest');
  assert.equal(getRegionPrestigePerNode(state,site.regionId),null);
  assert.equal(getDetailedCivilizationSummary(state).chaos.unrestRegionCount,1);
  assert.equal(getDetailedCivilizationSummary(state).chaos.unrestChaosPerYear,1);
  assert.equal(site.neutral,undefined,'disorder keeps the real local economy active');
  same(populationBins(d),bins);same(d.practiceSlots,board);same(state.rng,rng);
  assert(stockProviderSlots(state,d,false,{beneficiary:'player',discretionary:true}).every(p=>p.local),'no faction imports during disorder');
  const saved=serializeGameState(state);same(serializeGameState(deserializeGameState(saved)),saved);
  assert.equal(validateWorldState(state).ok,true);
  const invalid=structuredClone(saved);invalid.world.sites.find(s=>s.regionId===site.regionId).detailedState.control.unrest.untilSec=-1;
  assert.throws(()=>deserializeGameState(invalid),/Unrest/);

  // Enough allegiance cannot peacefully reclaim during the ten-year lock.
  writePopulationBins(d,[bin('player')]);
  resolveControl(state);resolveControl(state);
  assert.equal(getRegionState(state,site.regionId).controller,'frontier');
  assert.equal(d.control.claimChecks,0);
  const timeline=createTimelineFromInitialState(state);
  initializeReplayClock(state);
  assert(advanceReplayStateToSecond(state,319).ok);
  assert(Object.values(d.lastMeal.byClass).some(c=>c.consumed>0),'locally produced food feeds people during Unrest');
  assert.equal(site.neutral,undefined);
  assert.equal(controlSummary(state,site.regionId).status,'unrest');
  const resumed=deserializeGameState(serializeGameState(state));
  assert(advanceReplayStateToSecond(state,320).ok);assert(advanceReplayStateToSecond(resumed,320).ok);
  same(serializeGameState(resumed),serializeGameState(state));
  assert.equal(d.control.unrest,null,'ends at the exact simulation-time boundary');
  assert.equal(getRegionState(state,site.regionId).controller,'frontier','expiry does not assign a faction');
  assert(site.neutral,'ordinary unheld storefront resumes');
  assert.equal(d.control.claimChecks,0,'no claims accumulated during the lock');
  const rebuilt=rebuildStateAtSecond(timeline,320);assert(rebuilt.ok);
  same(serializeGameState(rebuilt.state),serializeGameState(state),'authoritative replay agrees across expiry');
  resolveControl(state);assert.equal(getRegionState(state,site.regionId).controller,'frontier');
  resolveControl(state);assert.equal(getRegionState(state,site.regionId).controller,'player','normal two-check claims resume after expiry');
}

// The amount is time-based, not phase-count based, and stops after ten years.
{
  const {state,site,d}=fixture();state.gameConfig.settings.values.primordialBasePressure=0;
  resolveControl(state);
  let total=0;
  for(let sec=1;sec<=321;sec++){
    state.tSec=sec;stepUnrest(state);
    if(sec%6===0||sec===321){runGlobalChaos(state);total+=state.civilization.chaos.lastMoonIncome.unrestPressure;}
  }
  assert(Math.abs(total-10)<.0001,`one region adds ten Chaos in ten years; actual ${total}`);
  assert.equal(d.control.unrest,null);assert.equal(controlSummary(state,site.regionId).status,'unheld');
  assert.equal(state.civilization.chaos.chaosPower,10);
}

// Military capture does not cause Unrest and may override an existing episode.
{
  const {state,site,d}=fixture();resolveControl(state);
  const before=populationBins(d);
  changeController(state,site.regionId,'external-a',{military:true});
  assert.equal(d.control.unrest,null);same(populationBins(d),before);
  assert.equal(getRegionState(state,site.regionId).controller,'external-a');
}

// All player holdings lost is still terminal, despite loyal people surviving.
{
  const state=createNewGameState(123);
  for(const site of state.world.sites.filter(s=>getRegionState(state,s.regionId).controller==='player')){
    writePopulationBins(site.detailedState,[bin('player',1),bin('neutral',19)]);
    site.detailedState.practiceSlots=Array(5).fill(null);site.detailedState.structureSlots.fill(null);
  }
  resolveControl(state);
  assert.equal(state.runStatus.reason,'territorialLoss');assert.equal(state.runStatus.complete,true);
  assert.equal(state.world.sites.filter(s=>s.detailedState?.control?.unrest).length,2);
}
console.log('[unrest] loss, local production, claims, exact expiry, Chaos, conquest, validation, save/replay and terminal loss OK');
