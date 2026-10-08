import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detailedSettlementPracticeDefs as practices, settlementStructureDefs as structures } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { createLabFixture, practiceSlot, fiveSlots, setFixturePopulation } from '../dev-lab/fixtures.js';
import { getLabCatalogue } from '../dev-lab/catalogue.js';
import { compareLabProjection } from '../dev-lab/sandbox.js';
import { getDetailedSettlementSites } from '../detailed-settlements/queries.js';
import { emitPracticeEvent, withPracticeRoot } from '../detailed-settlements/practice-events.js';
import { flushPracticeEvents, evaluateDetailedPracticeSlot, runPracticeActivation, tryCreateStructure } from '../detailed-settlements/practices.js';
import { generateStock, planStock, stockTotal } from '../detailed-settlements/stock.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../timeline/index.js';
import { canonicalizeSnapshot } from '../canonicalize.js';
import { validateGameConfig } from '../game-config.js';
import { generateCandidatePool } from '../vassal-life-map/lifecycle/candidates.js';
import { getMartialSupport, recordSupportUsage } from '../detailed-settlements/external-world.js';
import { projectPracticeDraft } from '../practice-draft.js';
import { classActionOptions, applyClassAction } from '../vassal-life-map/class-actions.js';
import { getConnectedRegionIds } from '../world-state.js';
import { generateShopInventory } from '../vassal-life-map/shop.js';
import { getCurrentLifeMapVassal } from '../vassal-life-map.js';
import { getGamepieceFace } from '../gamepiece-presentation.js';

const source=JSON.parse(readFileSync(new URL('../../../docs/civcontent-2.6-source.json',import.meta.url),'utf8'));
for (const [pool,p,s,c] of [['common',14,14,4],['scholar',48,32,10],['warrior',48,32,10]]) {
  assert.equal(Object.values(practices).filter(d=>d.pool===pool).length,p);
  assert.equal(Object.values(structures).filter(d=>d.pool===pool).length,s);
  assert.equal(Object.values(practices).filter(d=>d.pool===pool&&d.mode==='charge').length,c);
}
assert.equal(source.entries.length,187);
// The housing-capacity pass supersedes the workbook's broader construction/defense tag.
const housingCardIds = new Set([
  'mudHouses', 'timberHouse', 'stoneHouse', 'longhouse', 'tenement', 'greatDwelling',
  'housebuilding', 'civilEngineering',
]);
for (const row of source.entries) {
  const def=(row.kind==='practices'?practices:structures)[row.id];
  assert.ok(def,`${row.pool}/${row.id}: missing runtime row`);
  assert.equal(def.label,row.fields.Practice??row.fields.Structure);assert.equal(def.pool,row.pool);assert.equal(def.workbook.row,row.row);
  const authoredTags=(row.fields['Card Tags']??'').split(',').map(t=>t.trim()).filter(Boolean);
  assert.deepEqual(def.tags,authoredTags.filter(tag=>tag!=='Housing'||housingCardIds.has(row.id)));
  if (row.kind==='practices') {
    const traits=(row.fields['Stock Traits']??'').split(',').map(t=>t.trim()).filter(Boolean);
    assert.deepEqual(def.stockTraits,row.id==='monsterHunting'?[...traits,'Currency']:traits);
    assert.equal(def.stockCapacity,row.id==='monsterHunting'?7:row.fields.Capacity??0);
    assert.equal(def.mode,row.fields.Mode.toLowerCase());assert.equal(def.lane,def.mode);
    if (def.mode==='charge') {
      assert.equal(def.activation.type,'charge');assert.equal(def.charge.gain,row.fields['Charge Gain']);
      assert.equal(def.charge.threshold,row.fields['Charge Threshold']);assert.equal(def.charge.triggerText,row.fields['Charge Trigger']);
      assert.deepEqual(def.consume,[]);assert.deepEqual(def.require,[]);
      assert.equal(def.distinctTechnicalProviders,undefined);assert.equal(def.minimumStockedMilitary,undefined);
      assert.doesNotMatch(def.charge.dischargeText,/Consume |stocked /);
    } else assert.notEqual(def.activation.type,'charge');
  } else {assert.equal(def.charge,undefined,'Structures never own Charge');assert.equal(def.footprint,row.fields.Slots);}
}
function fixture(...slots) {
  const state=createLabFixture('charge');
  for (const site of getDetailedSettlementSites(state)) site.detailedState.practiceSlots=fiveSlots();
  const site=getDetailedSettlementSites(state,{playerOnly:true})[0],local=site.detailedState;
  local.practiceSlots=fiveSlots(...slots);local.structureSlots.fill(null);setFixturePopulation(local,0);
  return {state,site,local,region:site.regionId};
}
const event=(f,e)=>{emitPracticeEvent(f.state,{regionId:f.region,...e});flushPracticeEvents(f.state);};

for(const [workers,effectiveness] of [[0,1],[1,1],[3,1],[1,.5]]) {
  const f=fixture(practiceSlot('smelting'));
  const def=f.state.gameConfig.gamepieces.practices.smelting;
  def.workerCapacity=3;def.stockCapacity=20;def.charge.threshold=10;
  f.state.gameConfig.settings.values.villagerEffectiveness=effectiveness;
  setFixturePopulation(f.local,workers*f.state.gameConfig.settings.values.populationPerToken);
  event(f,{kind:'stockGenerated',practiceId:'surfaceMining',traits:['Ore']});
  const expected=Math.floor(1+workers*effectiveness);
  assert.equal(f.local.practiceSlots[0].charge,expected,'effective workers multiply integer Charge gain');
  const evaluated=evaluateDetailedPracticeSlot(f.state,f.region,0);
  assert.equal(evaluated.chargeGain,expected);assert.equal(evaluated.effects[0].scaledValue.effectiveValue,2);
  assert.equal(evaluated.effects[0].scaledValue.workerMultiplier,1,'Charge output is not worker-scaled');
  f.local.practiceSlots[0].charge=9;
  event(f,{kind:'stockGenerated',practiceId:'surfaceMining',traits:['Ore']});
  assert.equal(f.local.practiceSlots[0].charge,0,'gain caps at threshold and Discharge resets');
  assert.equal(f.local.practiceSlots[0].stock,2,'Discharge needs no Stock provider and preserves base output');
  assert.equal(f.state.civilization.practiceEvents.trace.some(e=>e.kind==='stockConsumed'),false);
}
const independent=fixture(practiceSlot('warCouncil'),practiceSlot('experimentation'));
setFixturePopulation(independent.local,1,1);
independent.local.practiceSlots[0].charge=3;independent.local.practiceSlots[1].charge=3;
event(independent,{kind:'phaseResolved'});
assert.equal(independent.local.supportBank.coordination,1,'War Council needs no stocked military cards');
assert.equal(independent.local.shopQualityBonus,1,'Experimentation needs no technical Stock providers');

const triggerFace=getGamepieceFace({},'practice','alchemy','bronze',{slot:{charge:2},workers:{effectiveWorkers:3,tokens:[{},{},{}]}});
assert.deepEqual(triggerFace.chargeTriggers.map(s=>[s.trait,s.event]),[['Medicine','stockConsumed'],['Metal','stockConsumed'],['Glass','stockConsumed']]);
assert.equal(triggerFace.workerMultiplier,4);assert.equal(triggerFace.chargeGain,4);
assert.deepEqual(triggerFace.inputs,[{kind:'chaos',amount:8,traits:[],icon:'chaos'}]);assert.equal(triggerFace.production[0].value,2);
assert.equal(triggerFace.fill,2/3);assert.match(triggerFace.detailLines.join(' '),/Charge gained \(not output\)/);
assert.deepEqual(getGamepieceFace({},'practice','anatomicalStudy').chargeTriggers.map(s=>s.icon??s.trait),['death','Bone']);
const engine=createLabFixture('charge'),timeline=createTimelineFromInitialState(engine);
advanceReplayStateToSecond(engine,24);
const trace=engine.world.sites.find(s=>s.regionId===engine.civilization.capitalRegionId).detailedState.practiceActivationTrace;
assert.ok(trace.some(e=>e.kind==='discharged'&&e.targetPracticeId==='charcoalBurning'));
const metallurgy=trace.filter(e=>e.kind==='discharged'&&['smelting','toolmaking'].includes(e.targetPracticeId));
assert.ok(metallurgy.some((e,i)=>e.targetPracticeId==='smelting'&&metallurgy[i+1]?.targetPracticeId==='toolmaking'&&e.rootId===metallurgy[i+1].rootId),'Metal wakes Toolmaking in the same real cascade');
assert.ok(trace.some(e=>e.kind==='chargeGained'&&e.parentId!=null));
canonicalizeSnapshot(engine);
const replay=rebuildStateAtSecond(timeline,24).state;canonicalizeSnapshot(replay);
assert.ok(JSON.stringify(serializeGameState(engine))===JSON.stringify(serializeGameState(replay)),'authoritative replay');
assert.equal(compareLabProjection(createLabFixture('charge'),48).equal,true,'actual forecast chunk parity');
const split=createLabFixture('charge');advanceReplayStateToSecond(split,12);
const restored=deserializeGameState(serializeGameState(split));advanceReplayStateToSecond(restored,24);canonicalizeSnapshot(restored);
assert.ok(JSON.stringify(serializeGameState(engine))===JSON.stringify(serializeGameState(restored)),'save/reload preserves Charge and causal sequence');

const or=fixture(practiceSlot('smelting'),practiceSlot('surfaceMining',1),practiceSlot('logging',1));
event(or,{kind:'stockGenerated',practiceId:'logging',traits:['Ore','Fuel']});
assert.equal(or.local.practiceSlots[0].charge,1,'OR matches once');assert.equal(or.local.practiceSlots[1].stock,1,'trigger reserves nothing');
runPracticeActivation(or.state,'birth');assert.equal(or.local.practiceSlots[0].charge,1,'Charge never scheduled');
assert.equal(planStock(or.state,or.local,[],[{traits:['Charge'],amount:1}]).ok,false);assert.equal(stockTotal(or.state,or.local,'Charge'),0);
event(or,{kind:'stockGenerated',practiceId:'surfaceMining',traits:['Ore']});
assert.deepEqual(or.local.practiceSlots.slice(0,3).map(s=>[s.charge,s.stock]),[[0,2],[0,1],[0,1]]);

const blocked=fixture(practiceSlot('smelting',5),practiceSlot('surfaceMining',1),practiceSlot('logging'));
for(let i=0;i<3;i++) event(blocked,{kind:'stockGenerated',practiceId:'surfaceMining',traits:['Ore']});
const evaluation=evaluateDetailedPracticeSlot(blocked.state,blocked.region,0);
assert.equal(evaluation.blocked,true);assert.match(evaluation.blockedReason,/capacity/);
assert.equal(blocked.local.practiceSlots[0].charge,2);assert.equal(blocked.local.practiceSlots[1].stock,1,'blocked recipe never partially pays');
assert.equal(evaluateDetailedPracticeSlot(deserializeGameState(serializeGameState(blocked.state)),blocked.region,0).blocked,true);
blocked.local.practiceSlots[0].stock=4;event(blocked,{kind:'phaseResolved'});
assert.equal(blocked.local.practiceSlots[0].charge,0);assert.equal(blocked.local.practiceSlots[0].stock,5,'next local event retries a full meter after output room opens');
const capacity=fixture(practiceSlot('toolmaking',4),practiceSlot('smelting',2),practiceSlot('logging',1));
event(capacity,{kind:'stockGenerated',practiceId:'smelting',traits:['Metal']});
assert.equal(capacity.local.practiceSlots[0].charge,2);assert.equal(capacity.local.practiceSlots[1].stock,2);
assert.match(evaluateDetailedPracticeSlot(capacity.state,capacity.region,0).blockedReason,/capacity/);
capacity.local.practiceSlots[0].stock=3;event(capacity,{kind:'phaseResolved'});
assert.equal(capacity.local.practiceSlots[0].stock,4);assert.equal(capacity.local.practiceSlots[0].charge,0);assert.equal(capacity.local.practiceSlots[2].stock,1,'Require remains');
const scholar=fixture(practiceSlot('anatomicalStudy'),practiceSlot('ossuaryKeeping',2));
event(scholar,{kind:'populationDied'});event(scholar,{kind:'populationDied'});
assert.match(evaluateDetailedPracticeSlot(scholar.state,scholar.region,0).blockedReason,/Scholar worker/);
setFixturePopulation(scholar.local,1,1);event(scholar,{kind:'phaseResolved'});
assert.equal(scholar.local.practiceSlots[0].charge,0);assert.ok(scholar.state.civilization.research.total>=2);
const ordered=fixture(practiceSlot('smelting'),practiceSlot('toolmaking'),practiceSlot('logging',2),practiceSlot('surfaceMining',1));
ordered.local.practiceSlots[0].charge=2;ordered.local.practiceSlots[1].charge=2;event(ordered,{kind:'phaseResolved'});
assert.deepEqual(ordered.state.civilization.practiceEvents.trace.filter(e=>e.kind==='discharged').map(e=>e.targetPracticeId),['smelting','toolmaking']);

// A deliberately authored data loop still uses the real production resolver.
const loop=fixture(practiceSlot('charcoalBurning'),practiceSlot('smelting'));
for (const id of ['charcoalBurning','smelting']) {
  const d=loop.state.gameConfig.gamepieces.practices[id];d.consume=[];d.require=[];d.charge.threshold=1;
  d.charge.trigger={anotherPractice:true,any:[{kind:'stockGenerated'}]};
}
event(loop,{kind:'stockGenerated',practiceId:'logging',traits:['Timber']});
assert.deepEqual(loop.state.civilization.practiceEvents.trace.filter(e=>e.kind==='discharged').map(e=>e.targetPracticeId),['charcoalBurning','smelting']);
assert.ok(loop.local.practiceSlots.every(s=>!s||s.charge===1),'refilled Charge survives root safeguard');
assert.ok(loop.state.civilization.practiceEvents.trace.some(e=>e.kind==='cascadeDeferred'));
event(loop,{kind:'phaseResolved'});assert.equal(loop.state.civilization.practiceEvents.trace.filter(e=>e.kind==='discharged').length,4);
assert.equal(loop.state.civilization.practiceEvents.trace.some(e=>e.kind==='cascadeSafetyCap'),false);
const safety=fixture(practiceSlot('charcoalBurning'));safety.state.gameConfig.settings.values.practiceReactionResolutionCap=20;
withPracticeRoot(safety.state,{kind:'phaseResolved',regionId:safety.region},()=>{for(let i=0;i<25;i++) emitPracticeEvent(safety.state,{kind:'systemEvent',regionId:safety.region});});
flushPracticeEvents(safety.state);assert.ok(safety.state.civilization.practiceEvents.trace.some(e=>e.kind==='cascadeSafetyCap'));
assert.equal(safety.state.civilization.practiceEvents.pending.length,0);assert.equal(safety.state.civilization.practiceEvents.activeRoot,undefined);

const institution=fixture(practiceSlot('formationTraining'),practiceSlot('weaponsmithing',1),practiceSlot('recordKeeping',2));
institution.state.gameConfig.gamepieces.practices.formationTraining.workerBonus=0;
setFixturePopulation(institution.local,15,0,15);tryCreateStructure(institution.state,institution.region,'warCollege');
event(institution,{kind:'supportContributed',actionKind:'defense'});assert.equal(institution.local.practiceSlots[0].charge,2);
event(institution,{kind:'supportContributed',actionKind:'defense'});assert.equal(institution.local.practiceSlots[0].charge,0);assert.equal(institution.local.supportBank.formation,2);
const beforeSupport=getMartialSupport(institution.state,institution.region);
recordSupportUsage(institution.state,institution.region,'defense',true);flushPracticeEvents(institution.state);
assert.ok(getMartialSupport(institution.state,institution.region)<beforeSupport);
assert.ok(institution.local.structureSlots.filter(Boolean).every(s=>!Object.hasOwn(s,'charge')));
institution.state.gameConfig.gamepieces.practices.formationTraining.workerBonus=1;
institution.state.gameConfig.gamepieces.practices.formationTraining.charge.threshold=10;
institution.local.practiceSlots[0].charge=0;
event(institution,{kind:'supportContributed',actionKind:'defense'});
assert.equal(institution.local.practiceSlots[0].charge,4,'Workers also scale eligible passive Charge gains');
const lab=fixture(practiceSlot('alchemy'));lab.state.gameConfig.gamepieces.practices.alchemy.workerBonus=0;setFixturePopulation(lab.local,5,2);tryCreateStructure(lab.state,lab.region,'laboratory');
event(lab,{kind:'stockConsumed',practiceId:'glassmaking',traits:['Medicine','Glass'],tags:['Knowledge']});assert.equal(lab.local.practiceSlots[0].charge,1,'A bonus gated on Stock requirements no longer matches cost-free Charge cards');
const development=fixture(practiceSlot('examinationCoaching'),practiceSlot('recordKeeping',3));setFixturePopulation(development.local,5,1);
for(let i=0;i<3;i++) event(development,{kind:'stockGenerated',practiceId:'recordKeeping',scholarStaffed:true});
assert.equal(development.state.civilization.candidateDevelopment.scholar,1);
development.state.civilization.vassalLineage.selectedVassalIds=['previous'];development.state.civilization.vassalLineage.establishedClassId='scholar';
generateCandidatePool(development.state);assert.equal(development.state.civilization.candidateDevelopment.scholar,0);
assert.equal(getLabCatalogue(engine).filter(e=>e.category==='practice').length,110);assert.equal(getLabCatalogue(engine).filter(e=>e.category==='structure').length,78);
const bad=serializeGameState(createLabFixture('charge'));bad.world.sites[0].detailedState.practiceSlots.push(practiceSlot('forage'));
assert.throws(()=>deserializeGameState(bad),/5 practice slots/);assert.throws(()=>fiveSlots(...Array(6).fill(practiceSlot('forage'))),/five/);
const malformed=serializeGameState(createLabFixture('charge'));malformed.world.sites.find(site=>site.detailedState.practiceSlots[0]).detailedState.practiceSlots[0].charge=-1;
assert.throws(()=>deserializeGameState(malformed),/invalid Charge/);
const config=structuredClone(engine.gameConfig);config.gamepieces.practices.smelting.charge.threshold=0;assert.equal(validateGameConfig(config).ok,false);
const stockCost=structuredClone(engine.gameConfig);stockCost.gamepieces.practices.smelting.consume=[{traits:['Ore'],amount:1}];
assert.equal(validateGameConfig(stockCost).ok,false,'Charge definitions cannot reintroduce Stock recipes');
const upgraded=practiceSlot('smelting',2);upgraded.charge=1;
const upgrade=projectPracticeDraft(fiveSlots(upgraded),[{intervention:{kind:'practice',mode:'upgrade',practiceId:'smelting',tier:'bronze',resultingTier:'silver'},tableauIndex:4}]);
assert.equal(upgrade.slots[4].charge,1);assert.equal(upgrade.slots[4].stock,2,'quality/reorder keeps the same Practice inventory and meter');
const noYield=fixture(practiceSlot('charcoalBurning'),practiceSlot('logging',6));
assert.equal(generateStock(noYield.state,noYield.local,noYield.local.practiceSlots[1],2),0);flushPracticeEvents(noYield.state);
assert.equal(noYield.local.practiceSlots[0].charge,0,'a clipped no-op is not production');
const self=fixture(practiceSlot('milling'));
generateStock(self.state,self.local,self.local.practiceSlots[0],1);flushPracticeEvents(self.state);
assert.equal(self.local.practiceSlots[0].charge,0,'another-Practice trigger excludes its own production');
const pending=fixture(practiceSlot('charcoalBurning'));
emitPracticeEvent(pending.state,{kind:'stockGenerated',regionId:pending.region,practiceId:'logging',traits:['Timber']});
const savedPending=deserializeGameState(serializeGameState(pending.state));flushPracticeEvents(pending.state);flushPracticeEvents(savedPending);
assert.ok(JSON.stringify(serializeGameState(pending.state))===JSON.stringify(serializeGameState(savedPending)),'pending authored events serialize deterministically');
assert.equal(getGamepieceFace(blocked.state,'practice','smelting','bronze',{evaluation}).blocked,true,'blocked evaluation is exposed to actual card faces');
const procure=fixture(practiceSlot('barter',3));setFixturePopulation(procure.local,2,2);tryCreateStructure(procure.state,procure.region,'procurementOffice');
assert.equal(planStock(procure.state,procure.local,[{traits:['Ore'],amount:1},{traits:['Metal'],amount:1}]).ok,false,'Currency wildcard replaces at most one missing input');
assert.equal(planStock(procure.state,procure.local,[],[{traits:['Ore'],amount:1}]).providers[0].kind,'consume','Procurement pays Currency even for Require');
const flexible=fixture(practiceSlot('alchemy'),practiceSlot('logging',2));setFixturePopulation(flexible.local,2,2);tryCreateStructure(flexible.state,flexible.region,'laboratory');
const flexPlan=planStock(flexible.state,flexible.local,[],[{traits:['Glass'],amount:1}],flexible.local.practiceSlots[0]);
assert.equal(flexPlan.ok,false,'Laboratory recipe broadening no longer applies to a Charge card without Stock requirements');
const experiment=fixture(practiceSlot('experimentation'),practiceSlot('logging',2),practiceSlot('recordKeeping',2));setFixturePopulation(experiment.local,5,1);
// Scholar staffing makes the common supplier technical; Record Keeping has a different tag signature.
experiment.state.gameConfig.gamepieces.practices.logging.tags.push('Knowledge');
for(let i=0;i<3;i++) event(experiment,{kind:'stockConsumed',practiceId:'recordKeeping',tags:['Knowledge']});
assert.equal(experiment.local.shopQualityBonus,1);assert.ok(experiment.state.civilization.research.total>=3);
assert.equal(experiment.local.practiceSlots[0].charge,2,'Workers multiply incoming Charge; Discharge emits no Stock consumption');
assert.equal(experiment.local.practiceSlots[1].stock,2);assert.equal(experiment.local.practiceSlots[2].stock,2);
const shopState=createLabFixture('scholar'),shopVassal=getCurrentLifeMapVassal(shopState),shopLocal=shopState.world.sites.find(s=>s.regionId===shopVassal.locationRegionId).detailedState;
shopLocal.shopQualityBonus=1;const inventory=generateShopInventory(shopState,shopVassal,{nodeId:'charge-quality',family:'practiceReform',purchasedOffers:[]});
assert.ok(inventory.length>0);assert.equal(shopLocal.shopQualityBonus,0,'quality bank is consumed by the real Scholar shop');
const challenge=fixture(practiceSlot('tournaments'),practiceSlot('weaponsmithing',3),practiceSlot('barter',3));setFixturePopulation(challenge.local,5,0,5);
challenge.local.practiceSlots[0].charge=2;
applyClassAction(challenge.state,{classId:'warrior',locationRegionId:challenge.region},{kind:'challenge',difficulty:3});
assert.equal(challenge.local.practiceSlots[0].charge,0);assert.equal(challenge.state.civilization.candidateDevelopment.warrior,1,'a real Challenge charges and Discharges Tournaments');
const rescue=createLabFixture('warrior'),rescuer=getCurrentLifeMapVassal(rescue),rescueSite=rescue.world.sites.find(s=>s.regionId===rescuer.locationRegionId);
rescueSite.detailedState.practiceSlots=fiveSlots(practiceSlot('forage',1),practiceSlot('packTrains',1),practiceSlot('rescueParties'));
setFixturePopulation(rescueSite.detailedState,61,0,30);
const destination=getConnectedRegionIds(rescue,rescuer.locationRegionId).find(id=>rescue.world.regions.find(r=>r.id===id)?.controller==='player');
assert.ok(destination,'Starter player settlements share a road');
const safe=rescue.world.sites.find(s=>s.regionId===destination);safe.detailedState.structureSlots.fill(null);tryCreateStructure(rescue,destination,'greatDwelling');
const rescueOption=classActionOptions(rescue,rescuer,'crisis').find(o=>o.classAction.kind==='evacuate');assert.ok(rescueOption);
const adultsBefore=rescueSite.detailedState.populationByClass.villager.adults;
applyClassAction(rescue,rescuer,rescueOption.classAction);assert.equal(rescueSite.detailedState.populationByClass.villager.adults,adultsBefore-5);
assert.equal(rescueSite.detailedState.practiceSlots[0].stock,0,'rescue pays its real supply recipe');
console.log('[charge-content] 187 workbook rows, 24 Charge modes, real five-slot cascade, cost-free Discharges, worker Charge scaling, safeguards, passive modifiers, replay/save/projection parity OK');
