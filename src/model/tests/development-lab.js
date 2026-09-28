import assert from 'node:assert/strict';
import { LAB_EXHIBITS, createLabFixture } from '../dev-lab/fixtures.js';
import { editLabState, advanceLabState, compareLabProjection, getLabObservation, previewLabShop, previewLabInstitutions } from '../dev-lab/sandbox.js';
import { getLabCatalogue, filterLabCatalogue } from '../dev-lab/catalogue.js';
import { serializeGameState } from '../state.js';
import { canonicalizeSnapshot } from '../canonicalize.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../timeline/index.js';
import { createSimRunner } from '../../controllers/sim-runner.js';
import { createGameSessionController } from '../../controllers/game-session-controller.js';
import { createDevelopmentLabController } from '../../controllers/development-lab-controller.js';
import { classActionOptions } from '../vassal-life-map/class-actions.js';
import { getCurrentLifeMapVassal } from '../vassal-life-map.js';

const data = serializeGameState;
for(const exhibit of LAB_EXHIBITS) {
  const a=createLabFixture(exhibit.id),b=createLabFixture(exhibit.id);
  assert.deepEqual(data(a),data(b),`${exhibit.id} resets identically`);
  for(const site of a.world.sites) assert.equal(site.detailedState.practiceSlots.length,5);
  assert.deepEqual(data(advanceLabState(a,'moon')),data(advanceLabState(b,'moon')),`${exhibit.id} ticks deterministically`);
}
for(const [population,demand] of [[29,1],[30,1],[31,2]]) {
  const initial=createLabFixture(`food-${population}`),end=advanceLabState(initial,'selected',1);
  const observation=getLabObservation(end,end.civilization.capitalRegionId);
  assert.equal(observation.population,population);assert.equal(observation.demand,demand);
  assert.equal(observation.edible,0,'leftmost host pays for Food');
  if(population===31) assert.ok(observation.meal.ratio<1,'31 people expose shortage with one generated Edible');
}
let currency=createLabFixture('currency'),region=currency.civilization.capitalRegionId;
currency=editLabState(currency,region,{kind:'classEffect',payload:{family:'crisis',id:`buy-relief-${region}`}});
assert.equal(getLabObservation(currency,region).currency,2);assert.equal(getLabObservation(currency,region).edible,3);
let warrior=createLabFixture('warrior');region=warrior.civilization.capitalRegionId;
assert.equal(getLabObservation(warrior,region).retinue.value,2);
warrior=editLabState(warrior,region,{kind:'spendPrestige'});assert.equal(getLabObservation(warrior,region).retinue.value,1);
for(const id of ['defense','loss']) {
  const state=createLabFixture(id),end=advanceLabState(state,'selected',5);
  assert.equal(end.world.sites.find(s=>s.regionId===state.civilization.capitalRegionId).detailedState.lastDefense.result,id==='defense'?'held':'lost');
  assert.equal(getLabObservation(end,state.civilization.capitalRegionId).lastDefense.result,id==='defense'?'held':'lost','loss evidence stays visible after the site becomes a ruin');
}
assert.ok(advanceLabState(createLabFixture('raid'),'year').civilization.history.raids>0,'automatic Raid is supplied through actual seasonal ticks');
const original=createLabFixture(),originalData=data(original);region=original.civilization.capitalRegionId;
assert.throws(()=>editLabState(original,region,{kind:'practice',payload:{index:5,id:'forage',stock:1,tier:'bronze'}}));
assert.throws(()=>editLabState(original,region,{kind:'practice',payload:{index:0,id:'forage',stock:999,tier:'bronze'}}));
assert.throws(()=>editLabState(original,region,{kind:'population',payload:{population:2,scholars:2,warriors:2}}));
assert.deepEqual(data(original),originalData,'rejected edits do not mutate the source');
const valid=editLabState(original,region,{kind:'population',payload:{population:30,scholars:4,warriors:10}});
assert.equal(getLabObservation(valid,region).scholars,4);assert.deepEqual(data(original),originalData,'valid edits also clone');
let authored=editLabState(valid,region,{kind:'practice',payload:{index:0,id:'forage',stock:2,tier:'silver'}});
authored=editLabState(authored,region,{kind:'move',payload:{from:0,to:4}});
assert.equal(authored.world.sites.find(s=>s.regionId===region).detailedState.practiceSlots[4].practiceId,'forage');
const emptyRegion=authored.world.regions.find(r=>r.controller==='frontier'&&!authored.world.sites.some(s=>s.regionId===r.id)).id;
authored=editLabState(authored,region,{kind:'neutral',payload:{regionId:emptyRegion,template:3}});
assert.equal(authored.world.sites.find(s=>s.regionId===emptyRegion).detailedState.practiceSlots.length,5);
authored=editLabState(authored,region,{kind:'monster',payload:{regionId:emptyRegion,defense:4,age:3}});
assert.equal(authored.civilization.chaos.monsterCount,1);
authored=editLabState(authored,region,{kind:'monster',payload:{regionId:emptyRegion,remove:true}});
assert.equal(authored.civilization.chaos.monsterCount,0);
authored=editLabState(authored,region,{kind:'ruin'});
assert.equal(authored.world.sites.find(s=>s.regionId===region).simulationMode,'ruin');
const catalogue=getLabCatalogue(original);
assert.equal(catalogue.filter(e=>e.category==='practice').length,Object.keys(original.gameConfig.gamepieces.practices).length);
assert.ok(filterLabCatalogue(catalogue,{category:'practice',trait:'Currency',search:'barter'}).some(e=>e.id==='barter'));
assert.equal(compareLabProjection(createLabFixture('projection'),60).equal,true);
const scholar=createLabFixture('scholar'),scholarData=data(scholar);
assert.deepEqual(previewLabShop(scholar),previewLabShop(scholar));assert.deepEqual(data(scholar),scholarData);
assert.ok(previewLabInstitutions(scholar).some(c=>c.ingenuity>c.baseIngenuity),'same RNG exposes institutional feedback');
region=scholar.civilization.capitalRegionId;
let commissioned=editLabState(scholar,region,{kind:'classEffect',payload:{family:'commission',id:'commission-practice'}});
commissioned=editLabState(commissioned,region,{kind:'practice',payload:{index:4,id:'forage',stock:0,tier:'bronze'}});
commissioned=editLabState(commissioned,region,{kind:'commissionCheck'});
assert.equal(getCurrentLifeMapVassal(commissioned).prestige,getCurrentLifeMapVassal(scholar).prestige+20);
const discovered=editLabState(scholar,region,{kind:'classEffect',payload:{family:'discovery',id:'discovery-frontier'}});
assert.equal(previewLabShop(discovered).discoveryAccess,true);
const campaignState=createLabFixture('raid'),campaignVassal=getCurrentLifeMapVassal(campaignState);
const campaign=classActionOptions(campaignState,campaignVassal,'campaign').find(o=>o.classAction.kind==='campaign');
assert.ok(campaign);
const conquered=editLabState(campaignState,campaignState.civilization.capitalRegionId,{kind:'classEffect',payload:{family:'campaign',id:campaign.id}});
assert.equal(conquered.world.regions.find(r=>r.id===campaign.classAction.targetId).controller,'player');

// Snapshot-origin timelines preserve absolute time and do not fabricate prehistory.
const later=advanceLabState(original,'moon');canonicalizeSnapshot(later);
const timeline=createTimelineFromInitialState(later);
assert.equal(timeline.cursorSec,later.tSec);
assert.equal(rebuildStateAtSecond(timeline,later.tSec-1).reason,'beforeInitialState');
assert.deepEqual(data(rebuildStateAtSecond(timeline,later.tSec).state),data(later));
const expected=advanceLabState(later,'moon');canonicalizeSnapshot(expected);
assert.deepEqual(data(rebuildStateAtSecond(timeline,expected.tSec).state),data(expected));
const runner=createSimRunner({setupId:'devPlaytesting01'});
const session=createGameSessionController({runner});
assert.equal(session.enterDisposableState(later).ok,true);assert.equal(session.getActiveSlot(),null);
assert.equal(runner.getTimeline().cursorSec,later.tSec);assert.equal(session.save().ok,true);
assert.deepEqual(data(rebuildStateAtSecond(runner.getTimeline(),expected.tSec).state),data(expected));
const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
const ctl=createDevelopmentLabController({initialState:later,storage});
ctl.save('reproduction');ctl.advance('moon');ctl.reset();assert.deepEqual(data(ctl.getSnapshot().state),data(later));
ctl.load('reproduction');assert.deepEqual(data(ctl.getSnapshot().state),data(later));
assert.throws(()=>ctl.importState('{"gameStateSchemaVersion":1}'));
assert.deepEqual(data(ctl.getSnapshot().state),data(later));
console.log('[development-lab] OK: fixtures, Stock, Food, conflict, validation, reset, projection and snapshot-origin replay');
