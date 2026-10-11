import { initializeReplayClock, advanceReplayStateToSecond } from '../replay-second-runner.js';
import { getChaosResistance, runGlobalChaos } from '../detailed-settlements/phases/chaos.js';
import { getGameSetting } from '../game-config.js';
import { getDetailedCivilizationSummary } from '../detailed-settlements/view-model.js';
import assert from 'node:assert/strict';
import { createNewGameState } from '../new-game.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { getMonsterPressureRate, stepSpatialPressure, addMonsterPressure, adjacentRegionIds } from '../detailed-settlements/external-world.js';
import { getActionChaosCost, getActionMonsterPressureCost } from '../detailed-settlements/practice-events.js';
import { runPracticeActivation } from '../detailed-settlements/practices.js';
import { getGamepieceFace } from '../gamepiece-presentation.js';
import { getRegionState } from '../world-state.js';
import { createLabNodeSandbox } from '../dev-lab/node-sandbox.js';
import { confirmVassalLifeNode, selectVassalNodeOption } from '../vassal-life-map.js';
import { getCurrentLifeMapVassal } from '../vassal-life-map.js';
import { classActionOptions, applyClassAction } from '../vassal-life-map/class-actions.js';
import { trainSpecialists } from '../detailed-settlements/stock.js';
import { practiceSlot } from '../dev-lab/fixtures.js';

const state=createNewGameState(420), chaos=state.civilization.chaos;
const initialRng={...state.rng}, first=state.world.regions.find(region=>region.monster);
assert.equal(first.monster.defense,2);
assert.equal(getGameSetting(state,'monsterExpansionThreshold'),100);
assert.equal(getGameSetting(state,'monsterProgressPerChaos'),.001);
// Containment freezes existing progress, including at exact equality.
chaos.monsterPressure=80;
for (const delta of [-10,0]) {
  chaos.chaosPower=Math.max(0,getChaosResistance(state)+delta);
  assert.equal(getMonsterPressureRate(state),0);
  for(let moon=0;moon<100;moon++)stepSpatialPressure(state);
  assert.equal(chaos.monsterPressure,80);
  assert.equal(chaos.expansionEvents,0);
}
const summary=getDetailedCivilizationSummary(state).chaos;
assert.equal(summary.expansionProgress,80);
assert.equal(summary.progressPerMoon,0);
// Chaos income is never discounted by Resistance; base income grows exponentially.
state.civilization.phaseModifiers.faithResistance=1000;
chaos.chaosPower=0;
runGlobalChaos(state);
assert.equal(chaos.chaosPower,1);
assert.equal(chaos.lastMoonIncome.totalIncome,1);
state.year=13;runGlobalChaos(state);
assert.equal(chaos.chaosPower,2.2);
state.year=25;runGlobalChaos(state);
assert.equal(chaos.chaosPower,3.64);
assert.equal(getMonsterPressureRate(state),0);
// Linear, tunable uncovered-Chaos rate. A full tracker expands directly.
state.civilization.phaseModifiers.faithResistance=0;
chaos.chaosPower=getChaosResistance(state)+1000;
assert.equal(getMonsterPressureRate(state),1);
chaos.monsterPressure=99;
const saved=serializeGameState(state), restored=deserializeGameState(saved);
stepSpatialPressure(state);stepSpatialPressure(restored);
assert.equal(chaos.expansionEvents,1);
assert.equal(chaos.monsterPressure,0);
assert.equal(state.world.regions.filter(region=>region.monster).length,2);
assert.equal(chaos.spatialSpawns,1,'the full tracker expands an existing front instead of spawning');
assert.deepEqual(serializeGameState(state),serializeGameState(restored),'saved pressure resumes exactly');
assert.deepEqual(state.rng,initialRng,'pressure never consumes RNG');
assert.equal(state.tSec,0,'direct pressure stepping never advances simulation time');
state.gameConfig.settings.values.monsterProgressPerChaos=.2;
assert.equal(getMonsterPressureRate(state),200);
// Dangerous actions bypass complete containment, retain overflow, and do not add Chaos.
const danger=createNewGameState(424), dc=danger.civilization.chaos;
danger.civilization.phaseModifiers.faithResistance=1000;
dc.chaosPower=100;dc.monsterPressure=80;
addMonsterPressure(danger,25);
assert.equal(dc.expansionEvents,1);
assert.equal(dc.monsterPressure,5);
assert.equal(dc.chaosPower,100);
const dangerSave=serializeGameState(danger), continued=deserializeGameState(dangerSave);
addMonsterPressure(danger,100);addMonsterPressure(continued,100);
assert.deepEqual(serializeGameState(danger),serializeGameState(continued),'action expansion resumes exactly');
// Multiple filled trackers are resolved in one transaction, without RNG use.
const blocked=createNewGameState(423), bc=blocked.civilization.chaos;
for(const region of blocked.world.regions)region.monster={defense:3};
const blockedRng={...blocked.rng};
addMonsterPressure(blocked,225);
assert.equal(bc.expansionEvents,2);
assert.equal(bc.monsterPressure,25);
assert.equal(blocked.world.regions.filter(region=>region.monster.defense===4).length,2);
assert.deepEqual(blocked.rng,blockedRng);
// An absent front permits replacement; threshold tuning applies to action costs too.
const empty=createNewGameState(422);
for(const region of empty.world.regions)delete region.monster;
empty.gameConfig.settings.values.monsterExpansionThreshold=50;
addMonsterPressure(empty,55);
assert.equal(empty.world.regions.filter(region=>region.monster).length,1);
assert.equal(empty.civilization.chaos.monsterPressure,5);

// Forecasting's Birth bonus survives Faith and applies at Death, then expires.
const forecast=createNewGameState(430), forecastHome=forecast.world.sites.find(s=>s.regionId===forecast.civilization.capitalRegionId);
forecastHome.detailedState.practiceSlots=[practiceSlot('forecasting'),practiceSlot('recordKeeping',2),practiceSlot('forage',2),null,null];
trainSpecialists(forecastHome.detailedState,'scholar',1);
initializeReplayClock(forecast,0);
advanceReplayStateToSecond(forecast,6);
assert.equal(forecast.civilization.phaseModifiers.faithResistance,3,'Birth Resistance must survive Faith until Death');
forecastHome.detailedState.practiceSlots[0]=null;
advanceReplayStateToSecond(forecast,7);
assert.equal(forecast.civilization.phaseModifiers.faithResistance,0,'Resistance expires at the next Birth');
// Losing the source town immediately stops its remaining Scheduled recipes.
const sourceLoss=createNewGameState(431), victim=sourceLoss.world.sites.find(s=>s.regionId===sourceLoss.civilization.capitalRegionId);
const lossFront=adjacentRegionIds(sourceLoss,victim.regionId)[0];
sourceLoss.world.sites=sourceLoss.world.sites.filter(s=>s.regionId!==lossFront);
for(const region of sourceLoss.world.regions)if(region.id!==victim.regionId)region.monster={defense:100};
sourceLoss.civilization.chaos.lastPressureRegionId=sourceLoss.world.regions[sourceLoss.world.regions.findIndex(r=>r.id===lossFront)-1]?.id??null;
sourceLoss.gameConfig.gamepieces.practices.forage.effects=[{op:'addMonsterPressure',amount:100}];
sourceLoss.gameConfig.gamepieces.practices.forage.activation={type:'birth'};
victim.detailedState.practiceSlots=[practiceSlot('forage'),practiceSlot('observation'),null,null,null];
const researchBeforeLoss=sourceLoss.civilization.research.total;
runPracticeActivation(sourceLoss,'birth');
assert.equal(victim.simulationMode,'ruin');
assert.equal(sourceLoss.civilization.research.total,researchBeforeLoss,'lost town must not activate its next Practice');

// A seasonal action can end the run before a coincident Faith phase. No later
// phase income or Vassal step may advance the completed simulation that second.
const seasonLoss=createNewGameState(432);
seasonLoss.seasonDurationSec=5;
for(const region of seasonLoss.world.regions)if(region.controller!=='player')region.monster={defense:100};
seasonLoss.gameConfig.gamepieces.practices.forage.effects=[{op:'addMonsterPressure',amount:1000}];
seasonLoss.gameConfig.gamepieces.practices.forage.activation={type:'season',seasonKeys:['winter']};
for(const site of seasonLoss.world.sites.filter(s=>!s.neutral))site.detailedState.practiceSlots=[practiceSlot('forage'),null,null,null,null];
initializeReplayClock(seasonLoss,0);
advanceReplayStateToSecond(seasonLoss,15);
const chaosBeforeSeasonLoss=seasonLoss.civilization.chaos.chaosPower;
advanceReplayStateToSecond(seasonLoss,16);
assert.equal(seasonLoss.runStatus.complete,true);
assert.equal(seasonLoss.civilization.chaos.chaosPower,chaosBeforeSeasonLoss);
assert.equal(seasonLoss.runStatus.tSec,16);

const costs=createNewGameState(53), home=costs.world.sites.find(site=>site.regionId===costs.civilization.capitalRegionId);
home.detailedState.practiceSlots=[practiceSlot('forage',3),practiceSlot('bowmaking',3),practiceSlot('raidingParties'),null,null];
home.detailedState.populationByClass.villager.adults=30;trainSpecialists(home.detailedState,'warrior',30);
costs.currentSeasonIndex=1;
const face=getGamepieceFace(costs,'practice','raidingParties');
assert.equal(face.chaosCost,0);assert.equal(face.monsterPressureCost,5);
assert.equal(face.inputs.find(input=>input.icon==='monster').amount,5);
const before=costs.civilization.chaos.monsterPressure;
runPracticeActivation(costs,'season');
assert.equal(costs.civilization.chaos.monsterPressure-before,face.monsterPressureCost,'Raid cost is fixed despite staffing');
home.detailedState.practiceSlots[0].stock=0;home.detailedState.practiceSlots[1].stock=0;
const after=costs.civilization.chaos.monsterPressure;
runPracticeActivation(costs,'season');
assert.equal(costs.civilization.chaos.monsterPressure,after,'blocked Raid pays no cost');

const scholar=createLabNodeSandbox({type:'discovery',classId:'scholar'});
const vassal=getCurrentLifeMapVassal(scholar.state), options=vassal.lifeMap.nodeStates[scholar.nodeId].options;
assert.equal(getActionChaosCost(options[0]),0);
assert.equal(getActionMonsterPressureCost(options[1]),40);
assert.equal(selectVassalNodeOption(scholar.state,scholar.nodeId,options[1].id).ok,true);
assert.equal(scholar.state.civilization.chaos.chaosPower,0,'selection is only a preview');
assert.equal(confirmVassalLifeNode(scholar.state,scholar.nodeId).ok,true);
assert.equal(scholar.state.civilization.chaos.monsterPressure,40,'confirmation pays forbidden Discovery exactly once, including failed searches');
assert.equal(confirmVassalLifeNode(scholar.state,scholar.nodeId).ok,false);
assert.equal(scholar.state.civilization.chaos.monsterPressure,40);
assert.equal(scholar.state.civilization.chaos.chaosPower,0);

// Real node confirmation crosses the threshold immediately under containment.
const riskyNode=createLabNodeSandbox({type:'discovery',classId:'scholar'});
riskyNode.state.civilization.phaseModifiers.faithResistance=1000;
riskyNode.state.civilization.chaos.monsterPressure=80;
const riskyOptions=getCurrentLifeMapVassal(riskyNode.state).lifeMap.nodeStates[riskyNode.nodeId].options;
selectVassalNodeOption(riskyNode.state,riskyNode.nodeId,riskyOptions[1].id);
const riskySnapshot=serializeGameState(riskyNode.state), riskyRestored=deserializeGameState(riskySnapshot);
const beforeEvents=riskyNode.state.civilization.chaos.expansionEvents;
assert.equal(confirmVassalLifeNode(riskyNode.state,riskyNode.nodeId).ok,true);
assert.equal(confirmVassalLifeNode(riskyRestored,riskyNode.nodeId).ok,true);
assert.equal(riskyNode.state.civilization.chaos.expansionEvents,beforeEvents+1);
assert.equal(riskyNode.state.civilization.chaos.monsterPressure,20);
assert.equal(riskyNode.state.civilization.chaos.chaosPower,0);
assert.deepEqual(serializeGameState(riskyRestored),serializeGameState(riskyNode.state));

const warrior={classId:'warrior',locationRegionId:home.regionId,stats:{intelligence:20},prestige:30};
home.detailedState.practiceSlots[0].stock=3;
const conquer=classActionOptions(costs,warrior,'campaign').find(option=>getActionMonsterPressureCost(option)>0);
assert.ok(conquer,'conquest advertises its expansion progress cost');
costs.gameConfig.settings.values.conquestMonsterProgress=10;
costs.gameConfig.settings.values.conquestMonsterProgressPerDefense=2;
const tunedConquest=classActionOptions(costs,warrior,'campaign').find(o=>o.classAction.targetId===conquer.classAction.targetId);
assert.equal(getActionMonsterPressureCost(tunedConquest),10+conquer.classAction.difficulty*2);
costs.gameConfig.settings.values.discoveryMonsterProgress=25;
assert.equal(getActionMonsterPressureCost(classActionOptions(costs,warrior,'discovery')[1]),25);
const huntId=adjacentRegionIds(costs,home.regionId).find(id=>getRegionState(costs,id).controller!=='player');
costs.world.sites=costs.world.sites.filter(site=>site.regionId!==huntId);
getRegionState(costs,huntId).controller='frontier';
assert.ok(huntId);
getRegionState(costs,huntId).monster={defense:2};
const hunt=classActionOptions(costs,warrior,'campaign').find(option=>option.classAction.targetId===huntId);
assert.equal(getActionChaosCost(hunt),0,'defensive hunting is free of Chaos');
assert.equal(hunt.prestigeDelta,20);
const research=costs.civilization.research.total;
applyClassAction(costs,warrior,hunt.classAction);
assert.equal(costs.civilization.research.total-research,6);
assert.equal(getRegionState(costs,huntId).monster,undefined);

home.detailedState.practiceSlots=[practiceSlot('forage',3),practiceSlot('bowmaking',3),practiceSlot('monsterHunting'),null,null];
getRegionState(costs,huntId).monster={defense:2};
const autoResearch=costs.civilization.research.total;
runPracticeActivation(costs,'death');
assert.equal(getRegionState(costs,huntId).monster,undefined);
assert.equal(costs.civilization.research.total-autoResearch,6);
assert.ok(home.detailedState.practiceSlots[2].stock>=5,'trophy yield grows with target Defense');
assert.ok(getGamepieceFace(costs,'practice','monsterHunting').stockTraits.includes('Currency'));
costs.civilization.chaos.monsterPressure=80;
getRegionState(costs,huntId).monster={defense:2};
applyClassAction(costs,warrior,{kind:'delay',targetId:huntId});
assert.equal(costs.civilization.chaos.monsterPressure,55);
costs.civilization.chaos.monsterPressure=10;
applyClassAction(costs,warrior,{kind:'delay',targetId:huntId});
assert.equal(costs.civilization.chaos.monsterPressure,0);
const invalid=structuredClone(saved);delete invalid.civilization.chaos.monsterPressure;
assert.throws(()=>deserializeGameState(invalid),/Monster Pressure/);
console.log('[monster-pressure] containment, exponential Chaos income, immediate expansion, overflow, tuning, costs, rewards and save continuation OK');
