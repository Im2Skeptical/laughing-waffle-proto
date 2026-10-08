import assert from 'node:assert/strict';
import { createNewGameState } from '../new-game.js';
import { createLabFixture, fiveSlots, practiceSlot, setFixturePopulation } from '../dev-lab/fixtures.js';
import { getDetailedSettlementSites, getHousingCapacity } from '../detailed-settlements/queries.js';
import { runPracticeActivation } from '../detailed-settlements/practices.js';
import { runConstructionCycles } from '../detailed-settlements/construction.js';
import { stockTotal } from '../detailed-settlements/stock.js';
import { getCurrentLifeMapVassal } from '../vassal-life-map.js';
import { generateShopInventory } from '../vassal-life-map/shop.js';

function fixture(...slots) {
  const state=createNewGameState(42);
  for(const site of getDetailedSettlementSites(state)) {
    site.detailedState.practiceSlots=fiveSlots();
    site.detailedState.structureSlots.fill(null);
    setFixturePopulation(site.detailedState,0);
  }
  state.world.connections=[];
  const site=getDetailedSettlementSites(state,{playerOnly:true})[0],local=site.detailedState;
  local.practiceSlots=fiveSlots(...slots);
  return {state,site,local};
}

const masonry=fixture(practiceSlot('masonry'),practiceSlot('quarrying',1));
runPracticeActivation(masonry.state,'housing');
assert.deepEqual(masonry.local.practiceSlots.slice(0,2).map(s=>s.stock),[2,0],
  'Masonry consumes Stone and works without a Tool host');

const brick=fixture(practiceSlot('brickmaking'),practiceSlot('irrigating',1),practiceSlot('surfaceMining',1));
runPracticeActivation(brick.state,'housing');
assert.deepEqual(brick.local.practiceSlots.slice(0,3).map(s=>s.stock),[3,1,1],
  'Brickmaking retains both Water and Ore providers');
brick.local.practiceSlots[2].stock=0;
runPracticeActivation(brick.state,'housing');
assert.deepEqual(brick.local.practiceSlots.slice(0,3).map(s=>s.stock),[3,1,0],
  'missing Ore blocks Brickmaking without spending Water');

const brewing=fixture(practiceSlot('brewing'),practiceSlot('forage',1),practiceSlot('pottery',1));
runPracticeActivation(brewing.state,'birth');
assert.deepEqual(brewing.local.practiceSlots.slice(0,3).map(s=>s.stock),[3,0,0],
  'Brewing consumes Edible and Storage instead of Vessel');
assert.equal(stockTotal(brewing.state,brewing.local,'Currency'),3);
assert.equal(stockTotal(brewing.state,brewing.local,'Edible'),3,'brewed Stock has both traits');

const records=fixture(practiceSlot('recordKeeping'));
runPracticeActivation(records.state,'birth');
assert.equal(records.local.practiceSlots[0].stock,0,'Record Keeping no longer fires at Birth');
for(const season of [0,1,2,3]) {
  records.state.currentSeasonIndex=season;
  runPracticeActivation(records.state,'season');
  assert.equal(records.local.practiceSlots[0].stock,season+1,'each season generates Record');
}

const survey=fixture(practiceSlot('surveying'));
const research=survey.state.civilization.research.total;
runPracticeActivation(survey.state,'birth');
assert.equal(survey.local.practiceSlots[0].stock,0);
runPracticeActivation(survey.state,'migration');
assert.equal(survey.local.practiceSlots[0].stock,1,'Surveying needs no Tool or Stock provider');
assert.equal(survey.state.civilization.research.total,research+1,'Migration grants Surveying Research');

const housing=fixture(practiceSlot('logging',2));
housing.local.structureSlots[0]={structureId:'timberHouse',origin:0,width:1,placementId:'bronze-house',construction:{completedCycles:0}};
for(let cycle=1;cycle<=8;cycle++) {
  housing.local.practiceSlots[0].stock=2;
  runConstructionCycles(housing.state,'housing');
  assert.equal(housing.local.practiceSlots[0].stock,0,'each paid cycle consumes two Construction');
  assert.equal(getHousingCapacity(housing.state,housing.site.regionId),cycle===8?60:0,
    'Timber House grants Housing only after its eighth paid cycle');
}

const shop=createLabFixture('scholar'),vassal=getCurrentLifeMapVassal(shop);
shop.civilization.research.total=0;
const locked=new Set(['carpentry','housebuilding','herbalism','corpseGarden']);
const offered=new Set();
for(const family of ['practiceReform','publicWorks','neutralMarket','classMarket']) {
  for(let roll=0;roll<64;roll++) {
    const offers=generateShopInventory(shop,vassal,{family,nodeId:`bronze-${family}-${roll}`,purchasedOffers:[]});
    for(const offer of offers) {
      const intervention=offer.intervention,id=intervention.practiceId??intervention.structureId;
      const def=shop.gameConfig.gamepieces[intervention.kind==='practice'?'practices':'structures'][id];
      assert.ok(!locked.has(id),'ordinary new-game shops exclude the authored locks');
      assert.equal(def.minimumQuality,'bronze','zero-Research shops use the reduced bronze pool');
      offered.add(id);
    }
  }
}
assert.ok(offered.has('scholarship'),'Scholarship is now accessible in bronze Scholar shops');
assert.ok(offered.has('observation'),'the Common Research source remains accessible');
console.log('[minimal-bronze] recipes, seasonal Records, Migration Research, eight-cycle Housing and default shop eligibility OK');
