import assert from 'node:assert/strict';
import { createNewGameState } from '../new-game.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';
import { getDetailedSettlementSites, getPopulationSummary, getHousingCapacity } from '../detailed-settlements/queries.js';
import { planStock, applyStockPlan, stockTotal, trainSpecialists } from '../detailed-settlements/stock.js';
import { getRetinue, getMartialSupport, adjacentRegionIds, conquerSettlement, stepSpatialPressure } from '../detailed-settlements/external-world.js';
import { runPracticeActivation, buildDetailedPracticeEvaluation, validateDetailedPracticeDefinitions, getPracticeTags, assignDetailedSettlementWorkers, tryCreateStructure } from '../detailed-settlements/practices.js';
import { getRegionState, addWorldConnection } from '../world-state.js';
import { getDetailedPracticeDef } from '../game-config.js';
import { classActionOptions, applyClassAction, completeCommission } from '../vassal-life-map/class-actions.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool, selectLifeMapVassal } from '../vassal-life-map.js';
import { ActionKinds, applyAction } from '../actions.js';
import { generateShopInventory, getVassalShopRerollCost } from '../vassal-life-map/shop.js';
import { buildProjectionChunkFromStateData } from '../projection-chunk.js';
import { canonicalizeSnapshot } from '../canonicalize.js';
import { stockTraits, specialistCount } from '../detailed-settlements/stock.js';
import { generateCandidatePool } from '../vassal-life-map/lifecycle/candidates.js';
import { projectPracticeDraft } from '../practice-draft.js';
import { createLabFixture, practiceSlot, setFixturePopulation } from '../dev-lab/fixtures.js';

const slot=practiceSlot;
// The badge's x1 / x2 / x4 progression is real production, before storage caps.
const staffedState=createNewGameState(73),staffedSite=getDetailedSettlementSites(staffedState,{playerOnly:true})[0];
const staffedSettlement=staffedSite.detailedState;
staffedSettlement.practiceSlots=[slot('forage'),...Array(4).fill(null)];
staffedSettlement.structureSlots=staffedSettlement.structureSlots.map(()=>null);
const staffedDef=getDetailedPracticeDef(staffedState,'forage');
assert.equal(staffedDef.workerBonus,1);
staffedDef.workerCapacity=3;staffedDef.stockCapacity=20;
for(const [population,expected] of [[0,1],[10,2],[30,4]]) {
  setFixturePopulation(staffedSettlement,population);
  staffedSettlement.practiceSlots[0].stock=0;
  const assignment=assignDetailedSettlementWorkers(staffedState,staffedSite.regionId)[0];
  assert.equal(buildDetailedPracticeEvaluation(staffedState,staffedSite,assignment).effects[0].scaledValue.workerMultiplier,expected);
  runPracticeActivation(staffedState,'food','preRouting');
  assert.equal(staffedSettlement.practiceSlots[0].stock,expected,`${population/10} full workers produce base x${expected}`);
}
staffedDef.stockCapacity=2;staffedSettlement.practiceSlots[0].stock=0;
runPracticeActivation(staffedState,'food','preRouting');
assert.equal(staffedSettlement.practiceSlots[0].stock,2,'Worker yield still obeys hosted Stock capacity');
const state=createNewGameState(42), site=getDetailedSettlementSites(state,{playerOnly:true})[0], settlement=site.detailedState;
assert.equal(state.world.sites.filter(s=>s.neutral).length,4);
for (const site of state.world.sites) {
  assert.equal(site.detailedState.practiceSlots.length, 5, 'player and neutral settlements have exactly five Practice slots');
}
assert.ok(state.world.sites.some(s=>s.neutral&&adjacentRegionIds(state,state.civilization.capitalRegionId).includes(s.regionId)));
assert.deepEqual(serializeGameState(state),serializeGameState(createNewGameState(42)));
assert.ok(!Object.hasOwn(settlement,'currency')&&!Object.hasOwn(settlement,'storedFood')&&!Object.hasOwn(settlement,'looseFood'));
settlement.practiceSlots=[slot('logging',2),slot('surfaceMining',1),slot('smelting'),slot('logging',5)];
const plan=planStock(state,settlement,[{traits:['Ore'],amount:1},{traits:['Fuel'],amount:1}]);
assert.equal(plan.ok,true);assert.deepEqual(plan.providers.map(p=>p.slotIndex),[1,0]);
applyStockPlan(settlement,plan);assert.deepEqual(settlement.practiceSlots.map(p=>p.stock),[1,0,0,5]);
assert.deepEqual(planStock(state,settlement,[{traits:['Fuel'],amount:2}]).providers.map(p=>p.slotIndex),[0,3],'providers on both sides pay in left-to-right order');
const before=JSON.stringify(settlement.practiceSlots);
assert.equal(planStock(state,settlement,[{traits:['Fuel'],amount:1},{traits:['Ore'],amount:1}]).ok,false);
assert.equal(JSON.stringify(settlement.practiceSlots),before,'failed transaction cannot partially consume');
settlement.practiceSlots=[slot('logging',1),slot('charcoalBurning',1),slot('logging',1)];
const wholeBoard=planStock(state,settlement,[{traits:['Fuel'],amount:3}]);
assert.equal(wholeBoard.ok,true);assert.deepEqual(wholeBoard.providers.map(p=>p.slotIndex),[0,1,2],'Consume includes own Stock and scans the whole board left to right');
applyStockPlan(settlement,wholeBoard);assert.deepEqual(settlement.practiceSlots.map(p=>p.stock),[0,0,0]);
settlement.practiceSlots=[slot('garrisonDuty'),slot('bowmaking',1)];
const rightRequirement=planStock(state,settlement,[],[{traits:['Arms'],amount:1}]);
assert.equal(rightRequirement.ok,true);assert.deepEqual(rightRequirement.providers.map(p=>p.slotIndex),[1],'Require accepts right-side Stock');
settlement.practiceSlots=[slot('bowmaking',1)];
assert.deepEqual(planStock(state,settlement,[],[{traits:['Arms'],amount:1}]).providers.map(p=>p.slotIndex),[0],'Require accepts own Stock');
settlement.practiceSlots=[slot('charcoalBurning'),slot('logging',1)];
runPracticeActivation(state,'birth');
assert.deepEqual(settlement.practiceSlots.map(p=>p.stock),[6,0],'Practice activation consumes a right-side provider');
settlement.practiceSlots=[slot('forage'),slot('pastoralism'),slot('logging',2),slot('barter')];
runPracticeActivation(state,'food','preRouting');runPracticeActivation(state,'birth');
assert.ok(stockTotal(state,settlement,'Edible')>=2);assert.ok(stockTotal(state,settlement,'Currency')>=1);
trainSpecialists(settlement,'warrior',12);
const vassal={classId:'warrior',prestige:25};
assert.equal(getRetinue(state,vassal).value,2);vassal.prestige=9;assert.equal(getRetinue(state,vassal).value,0);
assert.ok(getMartialSupport(state,site.regionId)>=2);
const neutral=state.world.sites.find(s=>s.neutral);const pop=neutral.detailedState.populationByClass.villager.adults;
assert.equal(conquerSettlement(state,neutral.regionId,4).ok,true);
assert.equal(neutral.detailedState.populationByClass.stranger.adults,pop);assert.equal(neutral.neutral,undefined);
const a=createNewGameState(718),b=deserializeGameState(serializeGameState(a));
advanceReplayStateToSecond(a,120);advanceReplayStateToSecond(b,60);const c=deserializeGameState(serializeGameState(b));advanceReplayStateToSecond(c,120);
assert.equal(JSON.stringify(serializeGameState(a)) === JSON.stringify(serializeGameState(c)), true,'serialized authoritative stepping parity');
const validation=validateDetailedPracticeDefinitions();assert.deepEqual(validation.errors,[]);
// Require is non-consuming and may share an activation-start unit with Consume.
settlement.practiceSlots=[slot('logging',1),slot('charcoalBurning')];
const shared=planStock(state,settlement,[{traits:['Timber'],amount:1}],[{traits:['Fuel'],amount:1}]);
assert.equal(shared.ok,true);applyStockPlan(settlement,shared);assert.equal(settlement.practiceSlots[0].stock,0);
const positioned=projectPracticeDraft([slot('logging',3),slot('surfaceMining',2),...Array(3).fill(null)], [{intervention:{kind:'practice',mode:'learn',practiceId:'smelting',resultingTier:'bronze'},tableauIndex:2}]);
assert.equal(positioned.ok,true);assert.equal(planStock(state,{...settlement,practiceSlots:positioned.slots},getDetailedPracticeDef(state,'smelting').consume).ok,true,'new consumers can use existing suppliers');

// A: Common content grows capacity and sustains hosted Food without a specialist.
const common=createNewGameState(21),commonSite=getDetailedSettlementSites(common,{playerOnly:true})[0];
commonSite.detailedState.practiceSlots=[slot('forage',2),slot('pastoralism',2),slot('logging',2),slot('barter'),...Array(1).fill(null)];
const housing=getHousingCapacity(common,commonSite.regionId);
assert.equal(tryCreateStructure(common,commonSite.regionId,'timberHouse'),true);
assert.equal(getHousingCapacity(common,commonSite.regionId),housing+60);
advanceReplayStateToSecond(common,24);
assert.equal(commonSite.detailedState.lastMeal.ratio,1);
assert.ok(stockTotal(common,commonSite.detailedState,'Currency')>0);

// B/F: ordinary Stock acquires Knowledge identity through Scholar staffing only.
const scholarState=createNewGameState(47);scholarState.paused=true;
let pool=getVassalCandidatePool(scholarState);
assert.equal(selectLifeMapVassal(scholarState,0,pool.expectedPoolHash).ok,true);
const scholar=getCurrentLifeMapVassal(scholarState),scholarSite=scholarState.world.sites.find(s=>s.regionId===scholar.locationRegionId);
const training=scholar.lifeMap.graph.nodes.find(n=>n.family==='training');
const act=(kind,payload)=>assert.equal(applyAction(scholarState,{kind,payload},{isReplay:true}).ok,true,kind);
act(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId:training.id});
act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId:training.id,optionId:'train-estate'});
act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:training.id});
assert.equal(specialistCount(scholarSite.detailedState,'scholar'),2);
assert.ok(scholarSite.detailedState.structureSlots.some(s=>s?.structureId==='lyceum'));
scholarSite.detailedState.practiceSlots=[slot('logging',3),slot('bowmaking',2),slot('garrisonDuty'),...Array(2).fill(null)];
const staffing=assignDetailedSettlementWorkers(scholarState,scholar.locationRegionId);
assert.ok(getPracticeTags(scholarState,'logging',staffing[0]).includes('Knowledge'));
assert.equal(stockTraits(scholarState,scholarSite.detailedState.practiceSlots[0]).includes('Knowledge'),false);
trainSpecialists(scholarSite.detailedState,'warrior',10);
assert.ok(getMartialSupport(scholarState,scholar.locationRegionId,true)>0,'shared Arms supplies hybrid civilization defense');
applyClassAction(scholarState,scholar,{kind:'commission',objective:'structure'});
const prestigeBefore=scholar.prestige;
assert.equal(tryCreateStructure(scholarState,scholar.locationRegionId,'workshop'),true);
completeCommission(scholarState,scholar);assert.equal(scholar.prestige,prestigeBefore+20);
completeCommission(scholarState,scholar);assert.equal(scholar.prestige,prestigeBefore+20,'Commission reward is once only');
applyClassAction(scholarState,scholar,{kind:'discovery',research:60,frontier:true});
const inventoryNode={nodeId:'discovery-fixture',family:'practiceReform',purchasedOffers:[]};
generateShopInventory(scholarState,scholar,inventoryNode);
assert.equal(inventoryNode.discoveryAccess,true);assert.equal(scholar.discoveryAccess,undefined);
assert.equal(getVassalShopRerollCost(scholar),0,'Scholar has one price-neutral reconsideration per shop');

// Institutions and retirement strengthen later local candidates, from identical RNG.
const baseCandidates=createNewGameState(91),educated=deserializeGameState(serializeGameState(baseCandidates));
for(const local of getDetailedSettlementSites(educated,{playerOnly:true})) {
 trainSpecialists(local.detailedState,'scholar',2);
 local.detailedState.structureSlots[0]={structureId:'lyceum',origin:0,width:2,placementId:'academy'};
 educated.civilization.retiredVassals.push({classId:'scholar',retirementRegionId:local.regionId,finalCunning:10});
}
generateCandidatePool(baseCandidates);generateCandidatePool(educated);
assert.equal(getVassalCandidatePool(educated).candidates[0].stats.cunning,getVassalCandidatePool(baseCandidates).candidates[0].stats.cunning+4);
// F: a Scholar-staffed Common smelter benefits from a Knowledge/Ore query, no pairwise class rule.
const hybrid=createLabFixture('five',32),hybridSite=getDetailedSettlementSites(hybrid,{playerOnly:true})[0];
const hybridWorkers=assignDetailedSettlementWorkers(hybrid,hybridSite.regionId);
const withFoundry=hybridSite.detailedState.structureSlots;
const beforeFoundry=buildDetailedPracticeEvaluation(hybrid,hybridSite,hybridWorkers[2]).effects[0].scaledValue.effectiveValue;
hybridSite.detailedState.structureSlots=hybridSite.detailedState.structureSlots.map(p=>p?.structureId==='foundry'?null:p);
assert.ok(beforeFoundry>buildDetailedPracticeEvaluation(hybrid,hybridSite,hybridWorkers[2]).effects[0].scaledValue.effectiveValue);
hybridSite.detailedState.structureSlots=withFoundry;
runPracticeActivation(hybrid,'birth');
assert.ok(stockTotal(hybrid,hybridSite.detailedState,'Arms')>0,'Scholar-assisted Metal production supplies Warrior Arms through ordinary Stock');
assert.ok(getMartialSupport(hybrid,hybridSite.regionId,true)>=3,'new Arms enables Garrison Support');
const qualityHousing=getHousingCapacity(hybrid,hybridSite.regionId);
hybridSite.detailedState.structureSlots.find(p=>p?.structureId==='mudHouses').qualityBonus=1;
assert.equal(getHousingCapacity(hybrid,hybridSite.regionId),qualityHousing+7,'Structure quality scales numeric Housing');

// D: fixed neutral demographics, real Stock changes, connected automated Raid.
const relations=createNewGameState(53),capital=relations.civilization.capitalRegionId;
const home=relations.world.sites.find(s=>s.regionId===capital);
const neighbor=relations.world.sites.find(s=>s.neutral&&adjacentRegionIds(relations,capital).includes(s.regionId));
assert.equal(addWorldConnection(relations,capital,neighbor.regionId).ok,true);
const neutralPopulation=getPopulationSummary(relations,neighbor.regionId).total;
advanceReplayStateToSecond(relations,18);
assert.equal(getPopulationSummary(relations,neighbor.regionId).total,neutralPopulation);
home.detailedState.practiceSlots=[slot('forage',3),slot('bowmaking',3),slot('raidingParties'),...Array(2).fill(null)];
home.detailedState.populationByClass.villager.adults=30;
trainSpecialists(home.detailedState,'warrior',30);
const raidTargetStock=neighbor.detailedState.practiceSlots.filter(Boolean).reduce((n,p)=>n+p.stock,0);
relations.currentSeasonIndex=1;runPracticeActivation(relations,'season');
assert.ok(relations.civilization.history.raids>0,'Raid requires no active Vassal');
assert.ok(neighbor.detailedState.practiceSlots.filter(Boolean).reduce((n,p)=>n+p.stock,0)<raidTargetStock);
assert.ok(stockTotal(relations,home.detailedState,'Loot')>0);

// Warrior founding uses the same public Life Map command route as Scholar founding.
const warriorStart=createNewGameState(48);warriorStart.paused=true;
const warriorPool=getVassalCandidatePool(warriorStart);
assert.equal(selectLifeMapVassal(warriorStart,1,warriorPool.expectedPoolHash).ok,true);
const founder=getCurrentLifeMapVassal(warriorStart);
const foundingNode=founder.lifeMap.graph.nodes.find(n=>n.family==='training');
for(const [kind,payload] of [[ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId:foundingNode.id}],
 [ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId:foundingNode.id,optionId:'train-estate'}],
 [ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:foundingNode.id}]]) assert.equal(applyAction(warriorStart,{kind,payload},{isReplay:true}).ok,true);
assert.equal(specialistCount(warriorStart.world.sites.find(s=>s.regionId===founder.locationRegionId).detailedState,'warrior'),10);

// C/D: personal force + Retinue + Support permits conquest; spending reduces Retinue.
const warrior={classId:'warrior',locationRegionId:capital,stats:{intelligence:10,cunning:0},prestige:30};
home.detailedState.practiceSlots[0].stock=3;
const campaign=classActionOptions(relations,warrior,'campaign').find(o=>o.classAction.targetId===neighbor.regionId);
assert.ok(campaign);const capBefore=getRetinue(relations,warrior).value;
warrior.prestige=9;assert.ok(getRetinue(relations,warrior).value<capBefore);warrior.prestige=30;
applyClassAction(relations,warrior,campaign.classAction);
assert.equal(getRegionState(relations,neighbor.regionId).controller,'player');
assert.equal(neighbor.detailedState.populationByClass.villager.adults,0);
assert.ok(neighbor.detailedState.populationByClass.stranger.adults>0);

// E: supplied interception spends Stock; exhausted capability records territorial loss.
const defense=createNewGameState(61),defended=defense.world.sites.find(s=>s.regionId===defense.civilization.capitalRegionId);
const defendingPool=getVassalCandidatePool(defense);
assert.equal(selectLifeMapVassal(defense,0,defendingPool.expectedPoolHash).ok,true);
const displacedVassal=getCurrentLifeMapVassal(defense);displacedVassal.locationRegionId=defended.regionId;
const frontier=adjacentRegionIds(defense,defended.regionId)[0];
for(const id of adjacentRegionIds(defense,frontier)) if(id!==defended.regionId)getRegionState(defense,id).monster={defense:1,ageMoons:0};
getRegionState(defense,frontier).monster={defense:2,ageMoons:99};
defended.detailedState.practiceSlots=[slot('forage',1),slot('bowmaking',1),slot('garrisonDuty'),...Array(2).fill(null)];
trainSpecialists(defended.detailedState,'warrior',15);
const earlyExpansion=deserializeGameState(serializeGameState(defense));
getRegionState(earlyExpansion,frontier).monster.ageMoons=98;
stepSpatialPressure(earlyExpansion);
assert.equal(earlyExpansion.world.sites.find(s=>s.regionId===defended.regionId).detailedState.lastDefense,undefined,'Monster does not expand at age 99');
const shortPatrol=deserializeGameState(serializeGameState(defense));
const patrolSite=shortPatrol.world.sites.find(s=>s.regionId===defended.regionId);
patrolSite.detailedState.practiceSlots[2]=slot('patrolling');
stepSpatialPressure(shortPatrol);
assert.equal(patrolSite.simulationMode,'ruin','interception must afford Practice costs plus its Edible supply');
assert.equal(patrolSite.detailedState.practiceSlots[0].stock,1,'failed defense does not partially spend');
stepSpatialPressure(defense);
assert.equal(defended.detailedState.lastDefense.result,'held');
assert.equal(stockTotal(defense,defended.detailedState,'Edible'),0);
getRegionState(defense,frontier).monster.ageMoons=99;
stepSpatialPressure(defense);
assert.equal(defended.simulationMode,'ruin');assert.ok(defense.civilization.history.lostSettlements>=1);
assert.equal(getRegionState(defense,defended.regionId).lostAtSec,defense.tSec);
const surviving=getDetailedSettlementSites(defense,{playerOnly:true})[0];
if(surviving) {
 assert.equal(displacedVassal.locationRegionId,surviving.regionId);
 assert.equal(displacedVassal.lifeEvents.at(-1).kind,'evacuation');
 surviving.detailedState.practiceSlots=[slot('papermaking',3),slot('doomsdayChronicle'),...Array(3).fill(null)];
 runPracticeActivation(defense,'birth');
 assert.ok(surviving.detailedState.practiceSlots[1].stock>=2,'loss history changes later content');
}

// Shared Crisis reads live shortages/Monsters. Prowess cannot resist a relief expedition.
const crisisBase=createNewGameState(77),crisisSite=getDetailedSettlementSites(crisisBase,{playerOnly:true})[0];
crisisSite.detailedState.practiceSlots[0].stock=0;
getRegionState(crisisBase,adjacentRegionIds(crisisBase,crisisSite.regionId)[0]).monster={defense:3,ageMoons:2};
const crisisVassal={classId:'warrior',locationRegionId:crisisSite.regionId,stats:{intelligence:0},prestige:0};
const incidents=classActionOptions(crisisBase,crisisVassal,'crisis');
assert.ok(incidents.some(o=>o.classAction.kind==='relief'));assert.ok(incidents.some(o=>o.classAction.kind==='delay'));
crisisVassal.stats.intelligence=100;
assert.equal(classActionOptions(crisisBase,crisisVassal,'crisis').find(o=>o.classAction.kind==='relief').immediateDeathChance,.15);

// G: worker projection is the same authoritative state, including all spatial outcomes.
const parity=createNewGameState(92);parity.gameConfig.settings.values.primordialBasePressure=100;
const initial=serializeGameState(parity),projection=buildProjectionChunkFromStateData(initial,0,120);
assert.equal(projection.ok,true);
advanceReplayStateToSecond(parity,projection.endSec);canonicalizeSnapshot(parity);
const differences=[];
function compare(a,b,path='') {
 if(a&&b&&typeof a==='object'&&typeof b==='object') for(const key of new Set([...Object.keys(a),...Object.keys(b)])) compare(a[key],b[key],path+'.'+key);
 else if(a!==b && differences.length<8) differences.push({path,actual:a,expected:b});
}
compare(serializeGameState(parity),projection.lastStateData);
assert.deepEqual(differences,[],'authoritative stepping / projection');
assert.equal(JSON.stringify(initial),JSON.stringify(serializeGameState(deserializeGameState(initial))));
console.log('[civilization-content] A–G: Common, class founding, Commissions, Discovery, Raid, Campaign, defense/loss, hybrid Stock and projection parity OK');
