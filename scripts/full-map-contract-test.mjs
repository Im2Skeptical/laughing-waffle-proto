import {getVassalShopCandidatePool,generateShopInventory} from '../src/model/vassal-life-map/shop.js';
import {buildCampaignOptions,resolveCampaignAttempt} from '../src/model/vassal-life-map/campaign.js';
import {getVassalYearPhaseCost} from '../src/model/vassal-life-map/selectors.js';
import {selectPopulationComposition,compositionBins} from '../src/model/detailed-settlements/helpers.js';
import {runFoodPhase} from '../src/model/detailed-settlements/phases/food.js';
import {runBirthPhase} from '../src/model/detailed-settlements/phases/birth.js';
import {getMoonPhaseAtSecond} from '../src/model/moon-phases.js';
import {planPopulationRecipe} from '../src/model/detailed-settlements/political-recipes.js';
import {selectLifeMapVassal,getCurrentLifeMapVassal,getVassalCandidatePool,enterVassalLifeNode,selectVassalNodeOption,confirmVassalLifeNode} from '../src/model/vassal-life-map.js';
import {purchaseVassalShopOffer,undoVassalShopPurchase,reorderVassalShopPurchase} from '../src/model/vassal-life-map/shop.js';
import {applyStockPlan,discretionaryStock} from '../src/model/detailed-settlements/stock.js';
import {militarySummary,assignGarrisonSupport,payGarrisonUpkeep} from '../src/model/detailed-settlements/territory.js';
import {buildProjectionChunkFromStateData} from '../src/model/projection-chunk.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {populationBins,writePopulationBins,selectPeople,transformPeople,allegianceSummary} from '../src/model/detailed-settlements/population-ledger.js';
import {assignDetailedSettlementWorkers} from '../src/model/detailed-settlements/workers.js';
import {runPracticeActivation} from '../src/model/detailed-settlements/practices.js';
import {flushPracticeEvents} from '../src/model/detailed-settlements/practices.js';
import {emitPracticeEvent} from '../src/model/detailed-settlements/practice-events.js';
import {planStock,stockTotal} from '../src/model/detailed-settlements/stock.js';
import {getRegionState,getAdjacentRegionIds,addWorldConnection} from '../src/model/world-state.js';
import {resolveControl,controlSummary,changeController,accrueTerritorialPrestige} from '../src/model/detailed-settlements/territory.js';
import {quotePrestige} from '../src/model/vassal-life-map/treasury.js';
import {legacySettlementTargets,isEmptyFrontierDestination} from '../src/model/vassal-life-map/world-choices.js';
import {getSettlementRequirements} from '../src/model/vassal-life-map/lifecycle.js';
import {fullMapPractices,fullMapStructures,FULL_MAP_SUPPLY_DEPENDENCIES,FULL_MAP_MAINLINE_PRACTICES,isFullMapOfferDefinition} from '../src/defs/gamepieces/full-map-defs.js';
import {getGamepieceFace} from '../src/model/gamepiece-presentation.js';
import {projectPracticeDraft} from '../src/model/practice-draft.js';
import {buildCrossroadsOptions} from '../src/model/vassal-life-map/world-choices.js';
import {createKeywordCardsState} from '../src/model/keywords-classes-prototype-fixture.js';
import {keywordOutputAmount,keywordOutputSources} from '../src/model/practice-keywords.js';
import {resolveExternalPractice,adjacentRegionIds} from '../src/model/detailed-settlements/external-world.js';
import {classActionOptions} from '../src/model/vassal-life-map/class-actions.js';
import {conquerSettlement,addMonsterPressure} from '../src/model/detailed-settlements/external-world.js';
import {SAVE_DATABASE_NAME} from '../src/controllers/sim-runner/save-storage.js';

const fresh=()=>createNewGameState(424242);
const bin=(count,allegiance='neutral',specialty='ordinary',kind='adults')=>({classId:'villager',allegiance,specialty,kind,age:kind==='elder'?60:null,count});
const install=(id,allegiance='player',stock=0)=>({practiceId:id,tier:'bronze',instanceId:`test:${id}`,charge:0,work:0,...(fullMapPractices[id]?.category==='influence'?{allegiance}:{stock})});
const checks=[];
function test(name,fn){fn();checks.push(name);}
test('real opening, ruleset, category contract and 72 runtime / 66 review rows',()=>{
 const s=fresh();assert.equal(s.world.sites.length,20);assert.equal(s.world.regions.filter(r=>r.controller==='player').length,2);assert.equal(s.world.regions.filter(r=>r.monster).length,1);
 assert.equal(Object.keys(fullMapPractices).length+Object.keys(fullMapStructures).length,72);
 const manifest=fs.readFileSync('docs/full-map-content-disposition.md','utf8');assert.equal(manifest.split('\n').filter(l=>/^\| (fm_|fe_|cp_)/.test(l)).length,138);
 for(const d of Object.values(fullMapPractices)){assert.equal(d.category==='influence',!d.stockTraits.length&&d.effects.some(e=>['convertPopulation','politicalForce'].includes(e.op)));if(d.category==='influence')assert(!d.effects.some(e=>e.op==='generateStock'));}
 for(const d of Object.values(fullMapStructures))assert(!d.effects.some(e=>e.op==='convertPopulation'));
 assert.equal(deserializeGameState(serializeGameState(s)).rulesetId,'full-map-redesign-v1');
 for(const rulesetId of [undefined,'old-ruleset']){const invalid=serializeGameState(s);invalid.rulesetId=rulesetId;assert.throws(()=>deserializeGameState(invalid),/ruleset identity/);}assert.equal(SAVE_DATABASE_NAME,'full-map-redesign-v1-saves');
});
test('joint conservation, capped conversion, specialty and all-age identity',()=>{
 const s=fresh(),d=s.world.sites[0].detailedState;
 writePopulationBins(d,[bin(7,'neutral','ordinary','children'),bin(11,'external-a','scholar'),bin(3,'external-a','warrior','elder')]);
 const before=populationBins(d).reduce((n,b)=>n+b.count,0);
 const selected=selectPeople(d,8,{opposing:true},'player');assert.equal(transformPeople(d,selected,{allegiance:'player'}),8);
 assert.equal(populationBins(d).reduce((n,b)=>n+b.count,0),before);assert.equal(d.populationByClass.villager.children,7);assert.equal(d.populationByClass.villager.specialists.scholar.adults,11);
 assert.equal(transformPeople(d,selectPeople(d,1000,{opposing:true},'player'),{allegiance:'player'}),13);
 assert.equal(selectPeople(d,1,{opposing:true},'player').length,0);
});
test('faction workers, no opposing assignment, zero-worker base conversion',()=>{
 const s=fresh(),site=s.world.sites[0],d=site.detailedState;
 d.practiceSlots=[install('fm_forcedPageantry'),install('fm_forcedPageantry','external-a'),install('forage','player',10),null,null];
 writePopulationBins(d,[bin(10,'neutral','ordinary','children'),bin(12,'neutral')]);
 const workers=assignDetailedSettlementWorkers(s,site.regionId);assert.equal(workers[0].tokens.length,0);assert.equal(workers[1].tokens.length,0);
 const before=allegianceSummary(d).player??0;runPracticeActivation(s,'faith');assert.equal(allegianceSummary(d).player-before,1);
 writePopulationBins(d,[bin(10,'player','scholar'),bin(10,'external-a','scholar'),bin(10,'neutral')]);
 for(const a of assignDetailedSettlementWorkers(s,site.regionId))if(a.slotIndex<2)assert(a.tokens.every(t=>t.allegiance===d.practiceSlots[a.slotIndex].allegiance));
});
test('local recipes, faction remote network, adjacency AND road, no neutral market',()=>{
 const s=fresh(),site=s.world.sites[0],d=site.detailedState;d.practiceSlots=[install('fm_debtService','external-a'),null,null,null,null];
 getRegionState(s,site.regionId).controller='player';
 const id=getAdjacentRegionIds(s,site.regionId)[0],source=s.world.sites.find(x=>x.regionId===id);source.detailedState.practiceSlots=[install('fm_hearthBarter','player',8),null,null,null,null];
 addWorldConnection(s,site.regionId,id);getRegionState(s,id).controller='external-a';
 const recipe=()=>planStock(s,d,[{traits:['Currency'],amount:2}],[],d.practiceSlots[0]);
 assert(recipe().ok);getRegionState(s,id).controller='player';assert(!recipe().ok);d.practiceSlots[0].allegiance='player';assert(recipe().ok);
 const before=JSON.stringify(s.world);assert(!planStock(s,d,[{traits:['Currency'],amount:999}],[],d.practiceSlots[0]).ok);assert.equal(JSON.stringify(s.world),before);
});
test('control boundaries, hysteresis, preservation of capture identities',()=>{
 const s=fresh(),site=s.world.sites.find(x=>getRegionState(s,x.regionId).controller==='frontier'),d=site.detailedState;
 writePopulationBins(d,[bin(60,'player'),bin(40)]);resolveControl(s);assert.equal(getRegionState(s,site.regionId).controller,'frontier');resolveControl(s);assert.equal(getRegionState(s,site.regionId).controller,'player');
 const identity=JSON.stringify(d.populationByClass),board=JSON.stringify(d.practiceSlots);changeController(s,site.regionId,'external-a',{military:true});assert.equal(JSON.stringify(d.populationByClass),identity);assert.equal(JSON.stringify(d.practiceSlots),board);assert(d.control.unrest>=50);
 writePopulationBins(d,[bin(25)]);assert.equal(controlSummary(s,site.regionId).required,1);writePopulationBins(d,[bin(250)]);assert.equal(controlSummary(s,site.regionId).required,10);
});
test('all-or-nothing hostile installation costs and stable adoption / upgrade',()=>{
 assert.deepEqual([0,12,15].map(n=>quotePrestige(n,15,10)),[{prestigeCost:0,monsterPressureCost:20},{prestigeCost:0,monsterPressureCost:20},{prestigeCost:15,monsterPressureCost:10}]);
 const old={...install('fm_debtService','external-a'),charge:0,work:7};
 const p={offerId:'adopt',intervention:{kind:'practice',mode:'adopt',practiceId:old.practiceId,tier:'bronze',resultingTier:'bronze'}};
 const draft=projectPracticeDraft([old,null,null,null,null],[p],id=>fullMapPractices[id]);assert(draft.ok);assert.equal(draft.slots[0].instanceId,old.instanceId);assert.equal(draft.slots[0].allegiance,'player');assert.equal(draft.slots[0].work,7);assert.equal(old.allegiance,'external-a');assert(!('stock'in draft.slots[0]));
});
test('rite victim, reserve and base headroom are atomic before and after capture',()=>{
 const s=fresh(),site=s.world.sites[0],d=site.detailedState;d.structureSlots=Array(d.structureSlots.length).fill(null);
 d.practiceSlots=[install('cp_ironCommunion','player',2),null,null,null,null];s.seasonIndex=1;
 // Trigger actual Summer using the calendar field read by the runtime.
 s.season='summer';s.currentSeason='summer';
 writePopulationBins(d,[bin(7,'external-a','warrior')]);
 const before=populationBins(d).reduce((n,b)=>n+b.count,0);
 const def=s.gameConfig.gamepieces.practices.cp_ironCommunion;def.activation={type:'death'};
 runPracticeActivation(s,'death');assert.equal(populationBins(d).reduce((n,b)=>n+b.count,0),before-1);assert(d.practiceSlots[0].stock>2);
 const snapshot=JSON.stringify(d);runPracticeActivation(s,'death');assert.equal(JSON.stringify(d),snapshot);
});
test('foreign travel and real inhabited monster threat',()=>{
 const s=fresh(),v={locationRegionId:s.civilization.capitalRegionId};const options=buildCrossroadsOptions(s,v);assert.equal(options.filter(o=>o.locationRegionId).length,19);
 const threat=s.world.regions.find(r=>r.monster),site=s.world.sites.find(x=>x.regionId===threat.id);const before=JSON.stringify(site.detailedState.populationByClass);addMonsterPressure(s,100);assert.equal(site.simulationMode,'ruin');assert.equal(JSON.stringify(site.detailedState.populationByClass),before);
});
test('income remainder and exact save continuation through demographics and recipes',()=>{
 const s=fresh();accrueTerritorialPrestige(s,16);assert.equal(s.civilization.prestige,21);
 const live=fresh();initializeReplayClock(live);advanceReplayStateToSecond(live,47);const loaded=deserializeGameState(serializeGameState(live));initializeReplayClock(loaded,47);
 advanceReplayStateToSecond(live,120);advanceReplayStateToSecond(loaded,120);assert.deepEqual(serializeGameState(live),serializeGameState(loaded));
});

function stagedShop() {
 const s=fresh(),lineage=s.civilization.vassalLineage;
 lineage.establishedClassId='warrior';lineage.founderClassId='warrior';
 const candidate={...getVassalCandidatePool(s).candidates[0],classId:'warrior',founderClassId:null,archetype:'Warrior',age:18};
 assert(selectLifeMapVassal(s,0,null,candidate).ok);
 const v=getCurrentLifeMapVassal(s);v.stats.cunning=0;v.heirlooms.equipped.fill(null);v.heirlooms.carry.fill(null);
 const node=v.lifeMap.graph.nodes.find(n=>n.family==='practiceReform');v.lifeMap.availableNodeIds=[node.id];
 assert(enterVassalLifeNode(s,node.id).ok);const ns=v.lifeMap.nodeStates[node.id];
 if(ns.shopSelection)assert(selectVassalNodeOption(s,node.id,'random').ok);
 const d=s.world.sites.find(x=>x.regionId===v.locationRegionId).detailedState;
 d.practiceSlots=[install('forage','player',3),install('dryFarming'),install('logging'),install('fm_rubblePicking'),install('fe_rationRoll','external-a')];
 ns.inventory=[{offerId:'test-install',basePrestigeCost:10,basePhaseCost:1,baseCurrencyCost:0,intervention:{kind:'practice',mode:'learn',practiceId:'fm_oathSupper',resultingTier:'bronze',targetRegionId:v.locationRegionId}}];
 return {s,v,node,ns,d};
}
test('real stage/undo/confirm hostile displacement and repeated confirmation',()=>{
 for(const reserve of [0,12,15]){
  const {s,v,node,ns,d}=stagedShop();s.civilization.prestige=reserve;const before=JSON.stringify({board:d.practiceSlots,rng:s.rng,prestige:s.civilization.prestige,pressure:s.civilization.chaos.monsterPressure});
  assert(purchaseVassalShopOffer(s,node.id,'test-install',null,0,'fe_rationRoll').ok);
  assert.equal(ns.purchasedOffers[0].monsterPressureCost,reserve<15?20:10);assert.equal(ns.purchasedOffers[0].prestigeCost,reserve<15?0:15);
  assert.equal(JSON.stringify({board:d.practiceSlots,rng:s.rng,prestige:s.civilization.prestige,pressure:s.civilization.chaos.monsterPressure}),before);
  assert(undoVassalShopPurchase(s,node.id,'test-install').ok);assert.equal(JSON.stringify({board:d.practiceSlots,rng:s.rng,prestige:s.civilization.prestige,pressure:s.civilization.chaos.monsterPressure}),before);
  assert(purchaseVassalShopOffer(s,node.id,'test-install',null,0,'fe_rationRoll').ok);assert(confirmVassalLifeNode(s,node.id).ok);
  assert.equal(s.civilization.prestige,reserve<15?reserve:0);assert.equal(s.civilization.chaos.monsterPressure,reserve<15?20:10);
  assert.equal(confirmVassalLifeNode(s,node.id).ok,false);assert(!d.practiceSlots.some(p=>p?.practiceId==='fe_rationRoll'));
 }
});
test('discarded hostile institution cannot avoid removal tax',()=>{
 const {s,node,ns}=stagedShop();s.civilization.prestige=5;
 assert(reorderVassalShopPurchase(s,node.id,'practice:fe_rationRoll',5).ok);
 assert.equal(ns.removalReceipts.length,1);assert.equal(ns.removalReceipts[0].prestigeCost,5);assert(confirmVassalLifeNode(s,node.id).ok);
 assert.equal(s.civilization.prestige,0);assert.equal(s.civilization.chaos.monsterPressure,10);
});
test('stale supply plans and foreign discretionary wallets are rejected',()=>{
 const s=fresh(),site=s.world.sites[0],d=site.detailedState;
 d.practiceSlots=[install('fm_hearthBarter','player',5),null,null,null,null];getRegionState(s,site.regionId).controller='player';
 const plan=planStock(s,d,[{traits:['Currency'],amount:2}]);getRegionState(s,site.regionId).controller='external-a';
 assert.equal(applyStockPlan(s,d,plan),false);assert.equal(d.practiceSlots[0].stock,5);
 for(const id of getAdjacentRegionIds(s,site.regionId))getRegionState(s,id).controller='external-a';
 assert.equal(discretionaryStock(s,d,'Currency'),0);assert.equal(planStock(s,d,[{traits:['Currency'],amount:2}]).ok,true);
});
test('explicit adjacent garrison assignment never duplicates Force or Warriors',()=>{
 const s=fresh(),a=s.world.sites[0],id=getAdjacentRegionIds(s,a.regionId)[0],b=s.world.sites.find(x=>x.regionId===id);
 addWorldConnection(s,a.regionId,id);for(const site of [a,b]){getRegionState(s,site.regionId).controller='player';writePopulationBins(site.detailedState,[bin(10,'player','warrior'),bin(20)]);site.detailedState.practiceSlots=[install('cp_ironCommunion','player',10),null,null,null,null];site.detailedState.structureSlots=Array(site.detailedState.structureSlots.length).fill(null);site.detailedState.garrison={supplied:true};}
 a.detailedState.structureSlots[0]={structureId:'fm_frontierWatch',placementId:'watch',origin:0,width:1};
 const before=militarySummary(s,a.regionId).force+militarySummary(s,b.regionId).force;
 assert(assignGarrisonSupport(s,{regionId:a.regionId,targetRegionId:id}).ok);
 assert.equal(militarySummary(s,a.regionId).force+militarySummary(s,b.regionId).force,before);assert.equal(militarySummary(s,a.regionId).armed,9);
 assert.equal(militarySummary(s,b.regionId).supportSources.length,1);
 getRegionState(s,id).controller='external-a';assert.equal(militarySummary(s,a.regionId).sentForce,0);
});
test('exact authoritative rebuild, projection boundary and save continuation',()=>{
 const initial=initializeReplayClock(fresh()),timeline=createTimelineFromInitialState(initial),base=serializeGameState(initial);
 const projected=buildProjectionChunkFromStateData(base,0,64,{stateAnchorStrideSec:1});assert(projected.ok);
 for(const sec of [1,5,6,7,31,32,33,63,64]){
  const live=initializeReplayClock(deserializeGameState(base));advanceReplayStateToSecond(live,sec);
  const replay=rebuildStateAtSecond(timeline,sec);assert(replay.ok);
  assert.deepEqual(serializeGameState(replay.state),serializeGameState(live));
  assert.deepEqual(projected.stateDataBySecond.get(sec),serializeGameState(live));
 }
});
test('guaranteed real adoption offer preserves institution and people',()=>{
 const {s,v,node,ns,d}=stagedShop();const institution=d.practiceSlots[4];institution.charge=3;institution.work=7;
 s.civilization.prestige=10;ns.inventory=generateShopInventory(s,v,ns);const offer=ns.inventory.find(o=>o.intervention.mode==='adopt');assert(offer);
 const people=JSON.stringify(d.populationByClass),identity=institution.instanceId;
 assert(purchaseVassalShopOffer(s,node.id,offer.offerId).ok);
 assert.equal(ns.purchasedOffers[0].phaseCost,2*getVassalYearPhaseCost(s,1));assert(confirmVassalLifeNode(s,node.id).ok);
 const adopted=d.practiceSlots.find(p=>p?.instanceId===identity);assert.equal(adopted.allegiance,'player');assert.equal(adopted.charge,3);assert.equal(adopted.work,7);
 assert.equal(JSON.stringify(d.populationByClass),people);assert.equal(s.civilization.prestige,0);assert.equal(s.civilization.chaos.monsterPressure,0);
});
test('directed campaign moves the smallest real loyal detachment and uses captured Arms',()=>{
 const {s,v,d}=stagedShop();v.stats.intelligence=100;const sourceId=v.locationRegionId,targetId=getAdjacentRegionIds(s,sourceId)[0],target=s.world.sites.find(x=>x.regionId===targetId).detailedState;
 getRegionState(s,targetId).controller='external-a';addWorldConnection(s,sourceId,targetId);
 for(const x of [d,target]){x.structureSlots.fill(null);x.garrison={supplied:true};}
 d.practiceSlots=[install('cp_ironCommunion','player',10),install('dryFarming','player',20),null,null,null];writePopulationBins(d,[bin(10,'player','warrior')]);
 target.practiceSlots=[install('cp_ironCommunion','player',5),null,null,null,null];writePopulationBins(target,[bin(25,'neutral'),bin(1,'player','warrior')]);
 const ns={family:'campaign',campaign:{failed:false,questRegionIds:[],duelDone:false}};
 const option=buildCampaignOptions(s,v,ns).find(o=>o.stage==='alliance'&&o.regionId===targetId);assert(option);
 assert(resolveCampaignAttempt(s,v,ns,option).ok);assert.equal(ns.campaign.lastResult.success,true);
 assert.equal(allegianceSummary(d).player,6);assert.equal(allegianceSummary(target).player,5);assert.equal(d.practiceSlots[0].stock,10);assert.equal(target.practiceSlots[0].stock,5);
 assert.equal(getRegionState(s,targetId).controller,'player');assert.equal(target.garrison.supplied,false);
});
test('Stranger-only migration preserves allegiance and strips allocation metadata',()=>{
 const s=fresh(),d=s.world.sites[0].detailedState;
 writePopulationBins(d,[{...bin(8,'external-a','warrior'),classId:'stranger'},{...bin(2,'player'),classId:'stranger'}]);
 const moved=compositionBins(selectPopulationComposition(d,['stranger'],5));
 assert.equal(moved.reduce((n,b)=>n+b.count,0),5);assert(moved.every(b=>b.allegiance));
 writePopulationBins(d,moved);assert(populationBins(d).every(b=>!('remainder' in b)&&!('capacity' in b)));
 assert.equal(allegianceSummary(d)['external-a'],4);
});
test('births use all-age allegiance shares while aging preserves identity',()=>{
 const s=fresh(),d=s.world.sites[0].detailedState;
 d.practiceSlots=Array(5).fill(null);
 writePopulationBins(d,[bin(10,'player'),bin(10,'external-a'),bin(20,'neutral','ordinary','children')]);
 for(const k of ['birthRateBronze','birthRateSilver','birthRateGold','birthRateDiamond'])s.gameConfig.settings.values[k]=1;
 s.gameConfig.settings.values.childToAdultRate=0;s.gameConfig.settings.values.adultToElderRate=0;
 runBirthPhase(s,getMoonPhaseAtSecond(s,0));
 assert.deepEqual(allegianceSummary(d),{'external-a':15,neutral:30,player:15});
});
test('crowded housing pays its extra meal cost without inventing fed people',()=>{
 const s=fresh(),site=s.world.sites[0],d=site.detailedState;s.world.connections=[];
 d.practiceSlots=[install('dryFarming','player',1),null,null,null,null];d.structureSlots=Array(d.structureSlots.length).fill(null);
 d.structureSlots[0]={structureId:'fm_crowdedTenement',origin:0,width:1,placementId:'crowded'};
 writePopulationBins(d,[bin(30)]);runFoodPhase(s,{id:'food',phaseIndex:1,moonIndex:0});
 assert.equal(d.lastMeal.demand,2);assert.equal(d.lastMeal.byClass.villager.ratio,0);assert.equal(d.mealRelief.fullyFed,false);
});
test('multiple victim costs cannot select the same person twice',()=>{
 const s=fresh(),site=s.world.sites[0],d=site.detailedState;writePopulationBins(d,[bin(1,'neutral','warrior')]);
 const def={populationConsume:[{amount:1,filter:{specialty:'warrior'}},{amount:1,filter:{kind:'adults'}}],effects:[]};
 const before=JSON.stringify(d);assert.equal(planPopulationRecipe(s,site,install('cp_ironCommunion'),def,[],true).ok,false);assert.equal(JSON.stringify(d),before);
});
test('long-lived default opening stays serializable through migration and terminal loss',()=>{
 const s=initializeReplayClock(createNewGameState(1867));
 for(let sec=64;sec<=6000&&!s.runStatus?.complete;sec+=64){advanceReplayStateToSecond(s,sec);assert.equal(deserializeGameState(serializeGameState(s)).tSec,s.tSec);}
 assert.equal(s.runStatus?.complete,true);assert(s.tSec>3000);
});
test('finite offers have executable cadence and complete Stock dependency vocabulary',()=>{
 const s=fresh(),defs=s.gameConfig.gamepieces;
 const all=[...Object.values(defs.practices),...Object.values(defs.structures)].filter(isFullMapOfferDefinition);
 assert.equal(all.length,72+FULL_MAP_SUPPLY_DEPENDENCIES.length+FULL_MAP_MAINLINE_PRACTICES.length);
 const traits=new Set(all.flatMap(d=>d.stockTraits??[]));
 for(const d of all){
   for(const cost of [...(d.consume??[]),...(d.require??[]),...(d.construction?.consume??[])])
     for(const trait of cost.traits??[])assert(traits.has(trait),`${d.id}: unavailable ${trait}`);
   if(defs.practices[d.id])assert(d.activation?.type,`${d.id}: missing cadence`);
 }
 const {s:state,v,ns}=stagedShop();
 for(const classId of ['warrior','scholar','necromancer','merchant']){
   v.classId=classId;
   for(const c of getVassalShopCandidatePool(state,v,ns))assert(isFullMapOfferDefinition(state.gameConfig.gamepieces[c.kind==='practice'?'practices':'structures'][c.definitionId]));
 }
});
test('claim and retention edges, lost supply, empty regions and loss persistence',()=>{
 const s=fresh(),site=s.world.sites.find(x=>getRegionState(s,x.regionId).controller==='frontier'),d=site.detailedState;
 d.practiceSlots=Array(5).fill(null);d.structureSlots.fill(null);
 writePopulationBins(d,[bin(59,'player'),bin(41)]);resolveControl(s);resolveControl(s);assert.equal(getRegionState(s,site.regionId).controller,'frontier');
 writePopulationBins(d,[bin(60,'player'),bin(40)]);resolveControl(s);assert.equal(getRegionState(s,site.regionId).controller,'frontier');resolveControl(s);assert.equal(getRegionState(s,site.regionId).controller,'player');
 writePopulationBins(d,[bin(45,'player'),bin(55)]);assert.equal(controlSummary(s,site.regionId).supported,true);
 writePopulationBins(d,[bin(44,'player'),bin(56)]);assert.equal(controlSummary(s,site.regionId).supported,false);
 d.control.unrest=60;resolveControl(s);assert.equal(getRegionState(s,site.regionId).controller,'player');resolveControl(s);assert.equal(getRegionState(s,site.regionId).controller,'frontier');
 changeController(s,site.regionId,'player');writePopulationBins(d,[bin(20,'player','warrior'),bin(80)]);d.practiceSlots[0]=install('cp_ironCommunion','player',20);d.garrison={supplied:true};assert.equal(controlSummary(s,site.regionId).occupied,true);
 d.garrison.supplied=false;assert.equal(controlSummary(s,site.regionId).occupied,false);
 writePopulationBins(d,[]);resolveControl(s);assert.equal(getRegionState(s,site.regionId).controller,'frontier');
});
test('roads alone and adjacency alone cannot supply; Require is retained',()=>{
 const s=fresh(),site=s.world.sites[0],d=site.detailedState;for(const x of s.world.sites)x.detailedState.practiceSlots=Array(5).fill(null);
 const adj=getAdjacentRegionIds(s,site.regionId)[0],source=s.world.sites.find(x=>x.regionId===adj);getRegionState(s,site.regionId).controller=getRegionState(s,adj).controller='player';source.detailedState.practiceSlots[0]=install('fm_hearthBarter','player',3);
 s.world.connections=[];assert(!planStock(s,d,[{traits:['Currency'],amount:1}]).ok);
 addWorldConnection(s,site.regionId,adj);const plan=planStock(s,d,[{traits:['Currency'],amount:1}],[{traits:['Currency'],amount:2}]);assert(plan.ok);assert(applyStockPlan(s,d,plan));assert.equal(source.detailedState.practiceSlots[0].stock,2);
 source.detailedState.practiceSlots.fill(null);const far=s.world.sites.find(x=>x.regionId!==site.regionId&&!getAdjacentRegionIds(s,site.regionId).includes(x.regionId));getRegionState(s,far.regionId).controller='player';far.detailedState.practiceSlots[0]=install('fm_hearthBarter','player',3);addWorldConnection(s,site.regionId,far.regionId);assert(!planStock(s,d,[{traits:['Currency'],amount:1}]).ok);
});
test('two hostile replacements quote each logical installation independently',()=>{
 const {s,node,ns,d}=stagedShop();s.civilization.prestige=15;
 d.practiceSlots[3]=install('fm_debtService','external-a');
 ns.inventory.push({offerId:'second-install',basePrestigeCost:10,basePhaseCost:1,baseCurrencyCost:0,intervention:{kind:'practice',mode:'learn',practiceId:'fm_veteransTestimony',resultingTier:'bronze',targetRegionId:d.regionId}});
 assert(purchaseVassalShopOffer(s,node.id,'test-install',null,0,'fe_rationRoll').ok);
 assert(purchaseVassalShopOffer(s,node.id,'second-install',null,0,'fm_debtService').ok);
 assert(ns.purchasedOffers.every(p=>p.removalReceipts.length===1));
 assert.equal(ns.purchasedOffers.reduce((n,p)=>n+p.prestigeCost,0),15);
 assert.equal(ns.purchasedOffers.reduce((n,p)=>n+p.monsterPressureCost,0),30);
 assert(undoVassalShopPurchase(s,node.id,'second-install').ok);assert.equal(ns.purchasedOffers[0].prestigeCost,15);assert.equal(ns.purchasedOffers[0].monsterPressureCost,10);
});
test('staged adoption cannot launder a confirmed hostile replacement tax',()=>{
 const {s,v,node,ns}=stagedShop();s.civilization.prestige=25;
 const installOffer=structuredClone(ns.inventory[0]);ns.inventory=generateShopInventory(s,v,ns);
 const adoption=ns.inventory.find(o=>o.intervention.mode==='adopt');assert(adoption);assert(purchaseVassalShopOffer(s,node.id,adoption.offerId).ok);
 ns.inventory.push(installOffer);assert(purchaseVassalShopOffer(s,node.id,installOffer.offerId,null,0,'fe_rationRoll').ok);
 const replacement=ns.purchasedOffers.find(p=>p.offerId===installOffer.offerId),adopt=ns.purchasedOffers.find(p=>p.offerId===adoption.offerId);
 assert.equal(replacement.prestigeCost,15);assert.equal(replacement.monsterPressureCost,10);assert.equal(adopt.prestigeCost,10);assert.equal(adopt.removalReceipts.length,0);
});
test('pressure consequence sees a fully installed board even on last-region loss',()=>{
 const {s,node,d}=stagedShop();s.civilization.prestige=0;s.civilization.chaos.monsterPressure=95;
 const home=s.world.sites.find(x=>x.detailedState===d).regionId;
 for(const r of s.world.regions){r.controller=r.id===home?'player':'frontier';delete r.monster;}
 getRegionState(s,home).monster={defense:100};
 assert(purchaseVassalShopOffer(s,node.id,'test-install',null,0,'fe_rationRoll').ok);assert(confirmVassalLifeNode(s,node.id).ok);
 assert(d.practiceSlots.some(p=>p?.practiceId==='fm_oathSupper'));assert(!d.practiceSlots.some(p=>p?.practiceId==='fe_rationRoll'));
 assert(s.runStatus.complete);assert.equal(confirmVassalLifeNode(s,node.id).ok,false);assert.equal(deserializeGameState(serializeGameState(s)).runStatus.complete,true);
});
test('Resource defense reactions follow the holder across capture, not absent allegiance',()=>{
 const s=fresh(),site=s.world.sites.find(x=>getRegionState(s,x.regionId).controller==='player'),d=site.detailedState;
 d.practiceSlots=[install('borderSkirmishing'),null,null,null,null];d.structureSlots.fill(null);writePopulationBins(d,[bin(10,'neutral','ordinary','children')]);
 const react=faction=>{emitPracticeEvent(s,{kind:'defenseSucceeded',regionId:site.regionId,faction});flushPracticeEvents(s);};
 react('external-a');assert.equal(d.practiceSlots[0].charge,0);
 react('player');react('player');assert.equal(d.practiceSlots[0].stock,1);
 changeController(s,site.regionId,'external-a',{military:true});
 react('player');assert.equal(d.practiceSlots[0].charge,0);assert.equal(d.practiceSlots[0].stock,1);
 react('external-a');react('external-a');assert.equal(d.practiceSlots[0].stock,2);
});

test('garrisons preserve local upkeep priority before drawing holder-allied leftovers',()=>{
 const s=fresh(),[a,b]=s.world.sites.filter(x=>getRegionState(s,x.regionId).controller==='player');
 for(const site of [a,b]){const d=site.detailedState;d.practiceSlots=[install('cp_ironCommunion','player',5),install('forage'),null,null,null];d.structureSlots.fill(null);writePopulationBins(d,[bin(5,'player','warrior')]);}
 b.detailedState.practiceSlots[1].stock=1;payGarrisonUpkeep(s);
 assert.equal(b.detailedState.garrison.supplied,true);assert.equal(a.detailedState.garrison.supplied,false);assert.equal(b.detailedState.practiceSlots[1].stock,0);
 b.detailedState.practiceSlots[1].stock=3;payGarrisonUpkeep(s);
 assert.equal(a.detailedState.garrison.supplied,true);assert.equal(b.detailedState.garrison.supplied,true);assert.equal(b.detailedState.practiceSlots[1].stock,1);
 getRegionState(s,b.regionId).controller='external-a';b.detailedState.practiceSlots[1].stock=3;payGarrisonUpkeep(s);
 assert.equal(a.detailedState.garrison.supplied,false);assert.equal(b.detailedState.practiceSlots[1].stock,3);
});

test('Practice drafts classify with captured definitions rather than current source categories',()=>{
 const s=fresh(),definitions=structuredClone(s.gameConfig.gamepieces.practices);
 definitions.forage.category='influence';definitions.fm_oathSupper.category='resource';
 const purchases=['forage','fm_oathSupper'].map(practiceId=>({offerId:practiceId,intervention:{kind:'practice',mode:'learn',practiceId,resultingTier:'bronze'}}));
 const before=JSON.stringify(definitions);
 const draft=projectPracticeDraft(Array(5).fill(null),purchases,id=>definitions[id]);assert(draft.ok);
 const influence=draft.slots.find(p=>p?.practiceId==='forage'),resource=draft.slots.find(p=>p?.practiceId==='fm_oathSupper');
 assert.equal(influence.allegiance,'player');assert(!('stock'in influence));assert.equal(resource.stock,0);assert(!('allegiance'in resource));assert.equal(JSON.stringify(definitions),before);
});
test('founding never offers an inhabited unheld region as an empty destination',()=>{
 const {s,v}=stagedShop(),id=getAdjacentRegionIds(s,v.locationRegionId).find(id=>id!==v.locationRegionId);
 addWorldConnection(s,v.locationRegionId,id);getRegionState(s,id).controller='frontier';delete getRegionState(s,id).monster;
 const before=JSON.stringify({world:s.world,prestige:s.civilization.prestige,rng:s.rng});
 assert.equal(isEmptyFrontierDestination(s,id),false);assert(!legacySettlementTargets(s,v).includes(id));
 assert(getSettlementRequirements(s,v,{settlementRegionId:id}).some(r=>!r.met));
 assert(getSettlementRequirements(s,v,{settlementRegionId:id,legacyFounding:true}).some(r=>!r.met));
 assert.equal(JSON.stringify({world:s.world,prestige:s.civilization.prestige,rng:s.rng}),before);
 s.world.sites=s.world.sites.filter(site=>site.regionId!==id);getRegionState(s,id).detailedSettlementEnabled=false;
 assert(isEmptyFrontierDestination(s,id));assert(legacySettlementTargets(s,v).includes(id));
});
test('recent mainline cards remain real class offers at their authored maturity',()=>{
 const {s,v,ns}=stagedShop();s.civilization.research.total=10000;
 for(const role of ['scholar','warrior']){
  v.classId=role;const pool=getVassalShopCandidatePool(s,v,ns);
  for(const id of FULL_MAP_MAINLINE_PRACTICES){const def=s.gameConfig.gamepieces.practices[id];if(def.pool==='common'||def.pool===role)assert(pool.some(c=>c.definitionId===id),`${id} missing from ${role} offers`);}
 }
});

test('Field Study counts real installs by the receiving faction, including itself',()=>{
 const {s,node,ns,d}=stagedShop();s.civilization.prestige=100;
 ns.inventory=[{offerId:'field-study',basePrestigeCost:10,basePhaseCost:1,baseCurrencyCost:0,intervention:{kind:'practice',mode:'learn',practiceId:'fieldStudy',resultingTier:'bronze'}}];
 const research=s.civilization.research.total;
 assert(purchaseVassalShopOffer(s,node.id,'field-study',null,0,'forage').ok);assert(confirmVassalLifeNode(s,node.id).ok);
 assert.equal(s.civilization.research.total,research+2);assert(d.practiceSlots.some(p=>p?.practiceId==='fieldStudy'));
 const foreign=s.world.sites.find(x=>getRegionState(s,x.regionId).controller==='external-a');
 foreign.detailedState.practiceSlots=[install('fieldStudy'),install('fm_forcedPageantry','player'),null,null,null];
 emitPracticeEvent(s,{kind:'practiceInstalled',regionId:foreign.regionId,practiceId:'fm_forcedPageantry'});flushPracticeEvents(s);
 assert.equal(s.civilization.research.total,research+2,'a player-aligned piece on foreign soil is not a player-held installation');
 assert.equal(foreign.detailedState.research,2,'the regional holder receives its own installation Research');
 const own=s.world.sites.find(x=>getRegionState(s,x.regionId).controller==='player'&&x.detailedState!==d);
 emitPracticeEvent(s,{kind:'practiceInstalled',regionId:own.regionId,practiceId:own.detailedState.practiceSlots[0].practiceId});flushPracticeEvents(s);
 assert.equal(s.civilization.research.total,research+4);assert.equal(foreign.detailedState.research,2);
 const saved=serializeGameState(s);assert.deepEqual(serializeGameState(deserializeGameState(saved)),saved);
});

test('Field Study upgrades preserve the instance without granting installation Research',()=>{
 const {s,node,ns,d}=stagedShop();s.civilization.prestige=100;d.practiceSlots[0]=install('fieldStudy');
 const identity=d.practiceSlots[0].instanceId,research=s.civilization.research.total;
 ns.inventory=[{offerId:'upgrade-study',basePrestigeCost:10,basePhaseCost:1,baseCurrencyCost:0,intervention:{kind:'practice',mode:'upgrade',practiceId:'fieldStudy',tier:'bronze',resultingTier:'silver'}}];
 assert(purchaseVassalShopOffer(s,node.id,'upgrade-study').ok);assert(confirmVassalLifeNode(s,node.id).ok);
 assert.equal(s.civilization.research.total,research);assert.equal(d.practiceSlots.find(p=>p?.practiceId==='fieldStudy').instanceId,identity);
});

test('class disciplines and monster trophies respect full-map faction ownership',()=>{
 const s=createKeywordCardsState('scholar'),id=s.civilization.capitalRegionId,site=s.world.sites.find(x=>x.regionId===id);
 const def=s.gameConfig.gamepieces.practices.floodAlmanacs;
 assert(keywordOutputAmount(s,id,def.keywordOutputScale,def.id)>0);
 changeController(s,id,'external-a');assert.equal(keywordOutputAmount(s,id,def.keywordOutputScale,def.id),0);assert.deepEqual(keywordOutputSources(s,id,def),[]);
 changeController(s,id,'player');assert(keywordOutputAmount(s,id,def.keywordOutputScale,def.id)>0);
 site.detailedState.practiceSlots[0]=install('beastRendering');
 const before=s.civilization.history.monsterTrophies;
 emitPracticeEvent(s,{kind:'monsterDestroyed',regionId:id,faction:'external-a'});flushPracticeEvents(s);assert.equal(s.civilization.history.monsterTrophies,before);assert.equal(site.detailedState.practiceSlots[0].stock,0);
 emitPracticeEvent(s,{kind:'monsterDestroyed',regionId:id,faction:'player'});flushPracticeEvents(s);assert.equal(s.civilization.history.monsterTrophies,before+1);assert.equal(site.detailedState.practiceSlots[0].stock,2);
 assert(site.detailedState.practiceSlots.every(p=>p.instanceId));
});

test('automatic Monster Hunting uses the local faction army and keeps foreign rewards local',()=>{
 const {s,v}=stagedShop();v.stats.intelligence=10000;
 const site=s.world.sites.find(x=>getRegionState(s,x.regionId).controller==='external-a'),d=site.detailedState;
 for(const r of s.world.regions)delete r.monster;
 const targetId=adjacentRegionIds(s,site.regionId)[0];getRegionState(s,targetId).monster={defense:1};
 d.practiceSlots=[install('monsterHunting'),install('weaponsmithing','player',5),install('forage','player',3),null,null];d.structureSlots.fill(null);d.garrison={supplied:true};
 writePopulationBins(d,[bin(20,'external-a')]);
 const def=s.gameConfig.gamepieces.practices.monsterHunting;
 assert.equal(resolveExternalPractice(s,site,def,false).ok,false,'a powerful remote player Vassal cannot supply a foreign Hunt');
 writePopulationBins(d,[bin(20,'external-a','warrior')]);
 assert(resolveExternalPractice(s,site,def,false).ok);
 const research=s.civilization.research.total,trophies=s.civilization.history.monsterTrophies;
 runPracticeActivation(s,'death');assert.equal(getRegionState(s,targetId).monster,undefined);
 assert.equal(s.civilization.research.total,research);assert.equal(s.civilization.history.monsterTrophies,trophies);assert.equal(d.research,6);assert(d.practiceSlots[0].stock>0);
 v.locationRegionId=site.regionId;getRegionState(s,targetId).monster={defense:1};
 for(const id of getAdjacentRegionIds(s,site.regionId))getRegionState(s,id).controller='external-a';
 assert(classActionOptions(s,v,'campaign').every(o=>o.classAction.kind==='prepare'),'a visiting Vassal cannot buy a Hunt with foreign Food');
});
test('unheld Field Study has no all-frontier alliance',()=>{
 const s=fresh(),[a,b]=s.world.sites.filter(x=>getRegionState(s,x.regionId).controller==='frontier');
 a.detailedState.practiceSlots=[install('fieldStudy'),null,null,null,null];
 const research=s.civilization.research.total;
 emitPracticeEvent(s,{kind:'practiceInstalled',regionId:b.regionId,practiceId:b.detailedState.practiceSlots[0].practiceId});flushPracticeEvents(s);
 assert.equal(a.detailedState.research??0,0);
 emitPracticeEvent(s,{kind:'practiceInstalled',regionId:a.regionId,practiceId:'fieldStudy'});flushPracticeEvents(s);
 assert.equal(a.detailedState.research,2);assert.equal(s.civilization.research.total,research);
});
console.log(`[full-map] ${checks.length} contract groups passed`);
