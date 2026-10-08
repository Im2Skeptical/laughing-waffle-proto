import assert from 'node:assert/strict';
import { createAuthoredGameConfig, canonicalizeGamepiecesDraft, validateGamepiecesDraft } from '../src/model/game-config.js';
import { createCardReviewController, CARD_REVIEW_STORAGE_KEY } from '../src/controllers/card-review-controller.js';
import { projectReview, reviewScheduleTriggers, REVIEW_STOCK_TRAITS, reviewBulkFields, planReviewBulkEdit, reviewOutputChoices, reviewAddOutput, reviewRemoveOutput } from '../src/model/dev-lab/card-review.js';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { createEmptyTimelineFromBase, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { selectedState } from '../src/model/tests/vassal-life-map/helpers.js';
import { getCurrentLifeMapVassal } from '../src/model/vassal-life-map.js';
import { generateShopInventory } from '../src/model/vassal-life-map/shop.js';
import { getStockShopGenerationContext } from '../src/model/vassal-life-map/stock-shops.js';
import { getResearchLibraryCards } from '../src/views/research-library-data.js';
import { getLabCatalogue, filterLabCatalogue } from '../src/model/dev-lab/catalogue.js';
import { constructionCopy, getLabStructureFace } from '../src/views/development-lab/structure-plan.js';

const gameConfig=createAuthoredGameConfig(), original=JSON.stringify(gameConfig), stored=new Map();
const storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
let live=structuredClone(gameConfig.gamepieces);
const resolveLive=(kind,id)=>live[kind==='practice'?'practices':'structures'][id];
const create=()=>createCardReviewController({storage,resolveLive});
let review=create();
const smelting=structuredClone(live.practices.smelting);
review.flag('practice','smelting',smelting,'silver');
review.edit('practice','smelting',['effects',0,'amount'],4);
review.edit('practice','smelting',['charge','threshold'],5);
review.notes('practice','smelting','Raise throughput; check the Metal chain.');
review.flag('structure','mudHouses',live.structures.mudHouses);
review.notes('structure','mudHouses','Keep this as the baseline.');
review=create();
assert.equal(review.get('practice','smelting').notes,'Raise throughput; check the Metal chain.');
assert.equal(review.preview(review.get('practice','smelting')).definition.effects[0].amount,4);
review.flag('practice','smelting',smelting); // Re-flagging preserves review work.
assert.equal(review.get('practice','smelting').edits.length,2);
const previous=storage.getItem(CARD_REVIEW_STORAGE_KEY);
assert.throws(()=>review.edit('practice','smelting',['charge','threshold'],0));
assert.throws(()=>review.edit('practice','smelting',['effects',0,'amount'],NaN));
assert.throws(()=>review.edit('practice','smelting',['effects',0,'op'],'research'));
assert.throws(()=>review.edit('practice','smelting',['__proto__','polluted'],true));
assert.equal(storage.getItem(CARD_REVIEW_STORAGE_KEY),previous,'failed edits preserve all stored reviews');
live.practices.smelting.stockCapacity=9;
live.practices.smelting.effects[0].amount=3;
review=create();
assert.equal(review.preview(review.get('practice','smelting')).definition.stockCapacity,9,'unmodified fields follow the new build');
assert.equal(review.preview(review.get('practice','smelting')).definition.effects[0].amount,4,'proposals survive changed live values');
const exported=JSON.parse(review.export());
assert.equal(exported.cards.length,2,'exports include notes-only flagged cards');
const card=exported.cards.find(card=>card.id==='smelting');
assert.equal(card.modified.effects[0].amount,4);
assert.equal(card.live.effects[0].amount,3);
assert.equal(card.changes[0].original,smelting.effects[0].amount);
assert.equal(card.changes[0].proposed,4);
assert.equal(exported.cards.find(card=>card.id==='mudHouses').notes,'Keep this as the baseline.');
live.practices.smelting.effects[0].bonus=2;
review.edit('practice','smelting',['effects',0,'bonus'],6);
assert.equal(create().preview(review.get('practice','smelting')).definition.effects[0].bonus,6,'new build fields can also be reviewed');
live.practices.smelting.effects[0].op='research';
assert.ok(review.preview(review.get('practice','smelting')).conflicts.includes('effects · 0 · amount'),'changed operation identity cannot silently retarget an edit');
live.practices.smelting.effects[0].op=smelting.effects[0].op;
live.practices.smelting.effects=[];
assert.deepEqual(projectReview(review.get('practice','smelting'),live.practices.smelting).conflicts,['effects · 0 · amount','effects · 0 · bonus']);
assert.equal(JSON.parse(review.export()).cards[0].edits.length,3,'obsolete paths remain exportable');
delete live.structures.mudHouses;
assert.equal(JSON.parse(review.export()).cards.find(card=>card.id==='mudHouses').live,null,'removed cards keep notes and baseline');
const failing=createCardReviewController({storage:{getItem:storage.getItem,setItem:()=>{throw new Error('Storage full');}},resolveLive});
assert.throws(()=>failing.notes('practice','smelting','Lost note'),/Storage full/);
assert.equal(review.get('practice','smelting').notes,card.notes,'storage failures cannot pretend to save');
review.reset('practice','smelting');
assert.equal(review.get('practice','smelting').edits.length,0);
assert.equal(review.get('practice','smelting').notes,card.notes,'reset keeps notes and flags');
review.remove('structure','mudHouses');
assert.equal(review.list().length,1);
review.flag('practice','forage',live.practices.forage);
review.edit('practice','forage',['stockTraits',1],'Plant'); // Previously saved per-index edits.
review.edit('practice','forage',['stockTraits'],['Edible','Plant','Water','Grain']);
assert.deepEqual(create().preview(review.get('practice','forage')).definition.stockTraits,['Edible','Plant','Water','Grain']);
assert.equal(review.get('practice','forage').edits.length,1,'whole-tray edits supersede old index edits');
review.edit('practice','forage',['stockTraits'],[]);
assert.deepEqual(create().preview(review.get('practice','forage')).definition.stockTraits,[],'all Stock tags can be removed');
review.edit('practice','forage',['stockTraits'],REVIEW_STOCK_TRAITS);
assert.equal(create().preview(review.get('practice','forage')).definition.stockTraits.length,36,'tag count is not limited to the original slots');
assert.throws(()=>review.edit('practice','forage',['stockTraits'],['Edible','Edible']));
assert.throws(()=>review.edit('practice','forage',['stockTraits'],['Misspelled']));
review.schedule('practice','forage',['housing','birth']);
let forage=create().preview(review.get('practice','forage')).definition;
assert.deepEqual(reviewScheduleTriggers(forage),['housing','birth']);
assert.equal(forage.source.icon,'housing','source icon follows the edited primary trigger');
assert.equal(forage.activation.stage,undefined,'food routing stage does not leak into other triggers');
review.schedule('practice','forage',['housing','food']);
assert.equal(create().preview(review.get('practice','forage')).definition.activation.stage,'preRouting');
const beforeInvalidSchedule=storage.getItem(CARD_REVIEW_STORAGE_KEY);
assert.throws(()=>review.schedule('practice','forage',[]));
assert.throws(()=>review.schedule('practice','forage',['notASeason']));
assert.throws(()=>review.schedule('practice','smelting',['food']),'Charge cards cannot accidentally become Scheduled');
assert.equal(storage.getItem(CARD_REVIEW_STORAGE_KEY),beforeInvalidSchedule);
review.flag('practice','dryFarming',live.practices.dryFarming);
review.edit('practice','dryFarming',['effects',0,'seasonAmounts','autumn'],8);
review.schedule('practice','dryFarming',['spring','autumn','death']);
let farm=create().preview(review.get('practice','dryFarming')).definition;
assert.deepEqual(farm.activation,{type:'season',also:['death'],seasonKeys:['spring','autumn']});
assert.deepEqual(farm.effects[0].seasonAmounts,{spring:2,autumn:8},'existing proposals survive; new seasons inherit base yield; removed seasons disappear');
review.edit('practice','dryFarming',['effects',0,'seasonAmounts','spring'],4);
farm=create().preview(review.get('practice','dryFarming')).definition;
assert.deepEqual(farm.effects[0].seasonAmounts,{spring:4,autumn:8},'editing a yield inside a saved map preserves other seasons');
live.practices.dryFarming.stockCapacity=12;
assert.equal(create().preview(review.get('practice','dryFarming')).definition.stockCapacity,12,'unmodified fields still follow new builds');
const farmExport=JSON.parse(review.export()).cards.find(card=>card.id==='dryFarming');
assert.deepEqual(farmExport.modified.activation,farm.activation);
assert.deepEqual(farmExport.modified.effects[0].seasonAmounts,farm.effects[0].seasonAmounts);
review.schedule('practice','dryFarming',['birth','housing']);
farm=create().preview(review.get('practice','dryFarming')).definition;
assert.equal(farm.effects[0].seasonAmounts,undefined,'phase schedules do not keep stale seasonal production rows');
assert.equal(farm.source.icon,'birth');
assert.deepEqual(reviewScheduleTriggers(farm),['birth','housing']);
review.reset('practice','dryFarming');
assert.deepEqual(review.preview(review.get('practice','dryFarming')).definition.activation,live.practices.dryFarming.activation);
assert.equal(JSON.stringify(gameConfig),original,'review edits never mutate live registries');
const launchStored=new Map(),launchStorage={getItem:key=>launchStored.get(key)??null,setItem:(key,value)=>launchStored.set(key,value)};
const launches=createCardReviewController({storage:launchStorage,resolveLive:(kind,id)=>gameConfig.gamepieces[kind==='practice'?'practices':'structures'][id]});
launches.flag('practice','forage',gameConfig.gamepieces.practices.forage);
launches.edit('practice','forage',['label'],'Reviewed Foraging');
launches.edit('practice','forage',['stockTraits'],['Edible','Plant','Water']);
launches.edit('practice','forage',['effects',0,'amount'],5);
launches.schedule('practice','forage',['birth','summer','autumn']);
launches.flag('practice','dryFarming',gameConfig.gamepieces.practices.dryFarming);
launches.schedule('practice','dryFarming',['spring','winter']);
launches.edit('practice','dryFarming',['effects',0,'seasonAmounts','winter'],10);
launches.flag('structure','mudHouses',gameConfig.gamepieces.structures.mudHouses);
launches.edit('structure','mudHouses',['housing'],45);
launches.flag('structure','longhouse',gameConfig.gamepieces.structures.longhouse);
launches.notes('structure','longhouse','Notes only');
const baselineGame=serializeGameState(createNewGameState(678));
assert.deepEqual(serializeGameState(launches.createNewGame(678)),baselineGame,'drafts stay inert with the toggle off');
const baselineKey=launches.getLaunchKey();launches.setUseInNewGames(true);
assert.notEqual(launches.getLaunchKey(),baselineKey);
assert.equal(launches.getLaunchStatus().count,3,'notes-only cards are not game overrides');
const editedGame=launches.createNewGame(678),saved=serializeGameState(editedGame),loaded=deserializeGameState(saved);
for(const state of [editedGame,loaded]) {
  assert.equal(state.gameConfig.gamepieces.practices.forage.label,'Reviewed Foraging');
  assert.deepEqual(state.gameConfig.gamepieces.practices.forage.stockTraits,['Edible','Plant','Water']);
  assert.deepEqual(state.gameConfig.gamepieces.practices.forage.activation,{type:'birth',also:['season'],seasonKeys:['summer','autumn']});
  assert.deepEqual(state.gameConfig.gamepieces.practices.dryFarming.effects[0].seasonAmounts,{spring:2,winter:10});
  assert.equal(state.gameConfig.gamepieces.structures.mudHouses.housing,45);
}
const timeline=createEmptyTimelineFromBase(editedGame),replayed=serializeGameState(rebuildStateAtSecond(timeline,7).state);
const oldKey=launches.getLaunchKey();launches.edit('practice','forage',['effects',0,'amount'],9);
assert.notEqual(launches.getLaunchKey(),oldKey,'editing proposals invalidates menu preparation');
launches.setUseInNewGames(false);
assert.deepEqual(serializeGameState(rebuildStateAtSecond(timeline,7).state),replayed,'existing replay uses saved definitions after browser edits and toggle changes');
assert.deepEqual(serializeGameState(launches.createNewGame(678)),baselineGame,'switching off returns new games to authored values');
assert.throws(()=>launches.edit('practice','forage',['stockCapacity'],-1));
launches.edit('practice','forage',['effects',0,'amount'],-1);
launches.setUseInNewGames(true);
assert.ok(launches.getLaunchStatus().issues.length,'review-only values must still pass runtime configuration validation');
assert.throws(()=>launches.createNewGame(678),/Edited cards need attention/);
assert.equal(JSON.stringify(gameConfig),original,'applying reviews never mutates authored definitions');
assert.deepEqual(serializeGameState(createCardReviewController({storage:{getItem:()=>{throw new Error('Storage blocked');}}}).createNewGame(678)),baselineGame,'unavailable review storage cannot prevent ordinary game startup');
const lockStored=new Map(),lockStorage={getItem:key=>lockStored.get(key)??null,setItem:(key,value)=>lockStored.set(key,value)};
const locks=createCardReviewController({storage:lockStorage,resolveLive:(kind,id)=>gameConfig.gamepieces[kind==='practice'?'practices':'structures'][id]});
for(const [kind,registry] of [['practice','practices'],['structure','structures']]) {
  for(const [id,def] of Object.entries(gameConfig.gamepieces[registry])) {
    locks.flag(kind,id,def);
    locks.setLocked(kind,id,true);
  }
}
const restoredLocks=createCardReviewController({storage:lockStorage});
assert.equal(restoredLocks.preview(restoredLocks.get('practice','forage')).definition.locked,true,'locks survive controller recreation');
const lockExport=JSON.parse(locks.export());
assert.equal(lockExport.cards.find(card=>card.id==='forage').modified.locked,true,'exports include locks and their original unlocked value');
assert.equal(lockExport.cards.find(card=>card.id==='forage').changes[0].original,false);
assert.throws(()=>locks.setLocked('practice','forage','true'),/boolean/);
assert.deepEqual(serializeGameState(locks.createNewGame(678)),baselineGame,'lock drafts remain inert until applied');
locks.setUseInNewGames(true);
const lockedGame=locks.createNewGame(678),lockTimeline=createEmptyTimelineFromBase(lockedGame);
const lockReplay=serializeGameState(rebuildStateAtSecond(lockTimeline,7).state);
assert.equal(deserializeGameState(serializeGameState(lockedGame)).gameConfig.gamepieces.practices.forage.locked,true,'saves retain the pool lock');
const allLocked=locks.applyTo(gameConfig.gamepieces).gamepieces;
assert.equal(canonicalizeGamepiecesDraft(allLocked).structures.mudHouses.locked,true,'combined-profile canonicalization retains locks');
assert.equal(validateGamepiecesDraft(allLocked).ok,true);
const damaged=structuredClone(allLocked);damaged.practices.forage.locked='true';
assert.ok(validateGamepiecesDraft(damaged).errors.some(error=>error.includes('forage.locked')));
const missingStructure=structuredClone(allLocked);missingStructure.structures.mudHouses=null;
assert.equal(validateGamepiecesDraft(missingStructure).ok,false,'lock validation preserves error reporting for missing definitions');
assert.equal(getResearchLibraryCards(lockedGame).length,0,'research browsing respects the run pool');
const beforeCatalogue=JSON.stringify(serializeGameState(lockedGame)),lockedCatalogue=getLabCatalogue(lockedGame);
assert.equal(filterLabCatalogue(lockedCatalogue,{category:'practice',hideLocked:true}).length,0,'Zoo can hide the complete locked Practice pool');
assert.equal(filterLabCatalogue(lockedCatalogue,{category:'structure',hideLocked:true}).length,0,'Zoo can hide the complete locked Structure pool');
assert.ok(filterLabCatalogue(lockedCatalogue,{category:'practice'}).length>0,'locked definitions remain browsable when the filter is off');
assert.equal(JSON.stringify(serializeGameState(lockedGame)),beforeCatalogue,'catalogue/filtering preserves state and RNG');
for(const [kind,id] of [['practice','forage'],['structure','mudHouses']]) {
  locks.setLocked(kind,id,false);
  assert.equal(locks.get(kind,id).edits.length,0,'unlocking restores a live card without a redundant override');
}
const thinPool=locks.applyTo(gameConfig.gamepieces).gamepieces;
const families=['practiceReform','publicWorks','neutralMarket','classMarket','foodShop','housingShop','stockShop','signature'];
for(const classId of [null,'scholar','warrior']) {
  const state=selectedState(987),vassal=getCurrentLifeMapVassal(state);
  vassal.classId=classId;state.civilization.research.total=100000;
  state.gameConfig.gamepieces=allLocked;
  assert.deepEqual(getStockShopGenerationContext(state,vassal),{stockOutputs:[],unmetStockOutputs:[]},'locked suppliers cannot generate unavailable Stock Supply nodes');
  for(const family of families) {
    const node={family,nodeId:'lock-test',stockOutput:'Edible',discoveryAccess:true,...(family==='signature'?{signatureNode:{groupId:'tagShop',tag:'Food'}}:{})};
    assert.deepEqual(generateShopInventory(state,vassal,node),[],`${family}/${classId}: an exhausted pool produces no locked filler or upgrades`);
    state.gameConfig.gamepieces=thinPool;
    for(const inventoryRoll of [0,1,2]) {
      const offers=generateShopInventory(state,vassal,{...node,inventoryRoll});
      assert.ok(offers.every(offer=>['forage','mudHouses'].includes(offer.intervention.practiceId??offer.intervention.structureId)),`${family}/${classId}: rerolls and Discovery never bypass locks`);
      if(family==='practiceReform')assert.equal(offers.length,1,'thin Practice pool still offers its remaining card');
      if(family==='publicWorks')assert.equal(offers.length,1,'thin Structure pool still offers its remaining card');
    }
    state.gameConfig.gamepieces=allLocked;
  }
  state.gameConfig.gamepieces=thinPool;
  assert.deepEqual(getStockShopGenerationContext(state,vassal).stockOutputs,['Edible','Wild'],'only unlocked Stock suppliers are considered');
}
assert.deepEqual(getResearchLibraryCards(locks.createNewGame(678)).map(card=>card.id).sort(),['forage','mudHouses']);
assert.deepEqual(serializeGameState(rebuildStateAtSecond(lockTimeline,7).state),lockReplay,'unlocking browser drafts cannot change existing replay');
locks.setLocked('practice','forage',true);locks.reset('practice','forage');
assert.equal(locks.preview(locks.get('practice','forage')).definition.locked,undefined,'Reset edits restores availability');
locks.setLocked('structure','mudHouses',true);locks.remove('structure','mudHouses');
assert.equal(locks.applyTo(gameConfig.gamepieces).gamepieces.structures.mudHouses.locked,undefined,'deleting a review releases its lock');
assert.equal(JSON.stringify(gameConfig),original,'lock operations leave authored registries untouched');
// Construction proposals use the same persistent document and run snapshot.
const planStorageData=new Map(),planStorage={getItem:key=>planStorageData.get(key)??null,setItem:(key,value)=>planStorageData.set(key,value)};
const plans=()=>createCardReviewController({storage:planStorage,resolveLive:(kind,id)=>gameConfig.gamepieces[kind==='structure'?'structures':'practices'][id]});
let planReview=plans();
planReview.flag('structure','mudHouses',gameConfig.gamepieces.structures.mudHouses);
planReview.edit('structure','mudHouses',['construction','cycles'],4);
planReview.edit('structure','mudHouses',['construction','consume'],[{amount:2,traits:['Construction','Tool']},{amount:1,traits:['Currency']}]);
planReview.edit('structure','mudHouses',['construction','consume',0,'amount'],3);
const planStored=planStorage.getItem(CARD_REVIEW_STORAGE_KEY);
for(const value of [0,-1,1.5,NaN])assert.throws(()=>planReview.edit('structure','mudHouses',['construction','cycles'],value));
for(const value of [[],[{amount:0,traits:['Construction']}],[{amount:1.5,traits:['Construction']}],[{amount:1,traits:[]}],[{amount:1,traits:['Unknown']}],[{amount:1,traits:['Tool','Tool']}]])
  assert.throws(()=>planReview.edit('structure','mudHouses',['construction','consume'],value));
assert.throws(()=>planReview.edit('structure','mudHouses',['construction','consume',0,'amount'],0));
assert.throws(()=>planReview.edit('structure','mudHouses',['construction','consume',0,'traits',0],'Unknown'));
assert.throws(()=>planReview.edit('structure','mudHouses',['construction','activation','type'],'food'));
assert.equal(planStorage.getItem(CARD_REVIEW_STORAGE_KEY),planStored,'invalid construction edits leave the draft intact');
planReview=plans();planReview.setUseInNewGames(true);
const planGame=planReview.createNewGame(345),planBefore=JSON.stringify(serializeGameState(planGame));
assert.deepEqual(planGame.gameConfig.gamepieces.structures.mudHouses.construction,{cycles:4,activation:{type:'housing'},consume:[{amount:3,traits:['Construction','Tool']},{amount:1,traits:['Currency']}]});
assert.deepEqual(validateGamepiecesDraft(planGame.gameConfig.gamepieces).errors,[]);
assert.deepEqual(deserializeGameState(serializeGameState(planGame)).gameConfig.gamepieces.structures.mudHouses.construction,planGame.gameConfig.gamepieces.structures.mudHouses.construction,'saved construction collections retain every row');
const fewerCosts=structuredClone(gameConfig.gamepieces);
fewerCosts.structures.workshop.construction.consume=fewerCosts.structures.workshop.construction.consume.slice(0,1);
assert.equal(canonicalizeGamepiecesDraft(fewerCosts).structures.workshop.construction.consume.length,1,'canonicalization does not restore removed cost rows');
const planFace=getLabStructureFace(planGame,'mudHouses','silver',{qualityBonus:1,plan:true});
assert.equal(planFace.construction.requiredCycles,4);assert.equal(planFace.construction.completedCycles,0);
assert.deepEqual(planFace.inputs.map(input=>input.amount),[3,1]);
assert.match(planFace.reading.requirements.join(' '),/12 \[Construction \/ Tool\].*4 \[Currency\]/);
assert.match(constructionCopy(planGame.gameConfig.gamepieces.structures.mudHouses)[1],/3 \[Construction \/ Tool\]/);
assert.equal(getLabStructureFace(planGame,'mudHouses','bronze').construction,null);
assert.equal(JSON.stringify(serializeGameState(planGame)),planBefore,'flipping catalogue faces preserves state and RNG');
assert.deepEqual(JSON.parse(planReview.export()).cards[0].modified.construction,planGame.gameConfig.gamepieces.structures.mudHouses.construction);
const planTimeline=createEmptyTimelineFromBase(planGame),planReplay=serializeGameState(rebuildStateAtSecond(planTimeline,7).state);
planReview.edit('structure','mudHouses',['construction','cycles'],2);
assert.deepEqual(serializeGameState(rebuildStateAtSecond(planTimeline,7).state),planReplay,'construction draft edits cannot change existing replay');
planReview.reset('structure','mudHouses');
assert.deepEqual(planReview.applyTo(gameConfig.gamepieces).gamepieces.structures.mudHouses.construction,gameConfig.gamepieces.structures.mudHouses.construction);
assert.equal(JSON.stringify(gameConfig),original,'construction editing leaves authored definitions untouched');

// Bulk edit: one value across a group, skipped cards with reasons, single write, undo.
{
  const bulkStored=new Map();let writes=0;
  const bulkStorage={getItem:key=>bulkStored.get(key)??null,setItem:(key,value)=>{writes++;bulkStored.set(key,value);}};
  const bulkLive=structuredClone(gameConfig.gamepieces);
  const bulkResolve=(kind,id)=>bulkLive[kind==='practice'?'practices':'structures'][id];
  const bulk=createCardReviewController({storage:bulkStorage,resolveLive:bulkResolve});
  const practiceIds=Object.keys(bulkLive.practices).slice(0,5);
  writes=0;
  assert.equal(bulk.flagMany([...practiceIds.map(id=>({kind:'practice',id,definition:bulkLive.practices[id],tier:'bronze'})),{kind:'structure',id:'mudHouses',definition:bulkLive.structures.mudHouses}]),6);
  assert.equal(writes,1,'flagging a filtered group is one storage write');
  assert.equal(bulk.flagMany([{kind:'practice',id:practiceIds[0],definition:bulkLive.practices[practiceIds[0]]}]),0,'re-flagging adds nothing');
  const [first,second,third,fourth]=practiceIds, keys=[...practiceIds.map(id=>`practice:${id}`),'structure:mudHouses','practice:missingCard'];
  bulk.edit('practice',second,['workerCapacity'],5);
  bulk.notes('practice',second,'Keep my note.');
  bulk.setLocked('practice',third,true);
  bulk.edit('practice',fourth,['effects',0,'amount'],(bulkLive.practices[fourth].effects?.[0]?.amount??0)+1);
  const fields=bulk.bulkFields(keys), sockets=fields.find(field=>field.path[0]==='workerCapacity');
  assert.equal(sockets.count,5,'Worker sockets: 5 of the 6 present cards have it');
  assert.deepEqual(sockets.values,[2,5]);
  assert.equal(fields.find(field=>field.path[0]==='vassalPrestigeCost').count,6,'shared costs count practices and structures');
  assert.equal(fields.find(field=>field.path[0]==='minimumQuality').type,'choice');
  assert.ok(!fields.some(field=>['locked','label','effects','tags','authoredHook'].includes(field.path[0])),'bulk fields stay top-level numbers and choices');
  assert.deepEqual(reviewBulkFields([{label:'x',locked:true,effects:[{op:'research',amount:1}],workerBonus:1}]).map(field=>field.path[0]),['workerBonus']);
  const plan=bulk.planBulk(keys,['workerCapacity'],5);
  const reason=key=>plan.find(row=>row.key===key);
  assert.equal(reason(`practice:${first}`).status,'change');assert.equal(reason(`practice:${first}`).from,2);
  assert.equal(reason(`practice:${second}`).reason,'same');
  assert.equal(reason(`practice:${third}`).reason,'locked');
  assert.equal(reason('structure:mudHouses').reason,'missing');
  assert.equal(reason('practice:missingCard').reason,'absent');
  assert.equal(bulk.planBulk(keys,['workerCapacity'],5,{includeLocked:true}).find(row=>row.key===`practice:${third}`).status,'change');
  const invalid=bulk.planBulk(keys,['workerCapacity'],13);
  assert.ok(invalid.filter(row=>row.reason==='invalid').length===5&&!invalid.some(row=>row.status==='change'),'invalid values skip every card with the validation message');
  assert.match(invalid.find(row=>row.reason==='invalid').message,/worker sockets 0–12/);
  assert.deepEqual(planReviewBulkEdit([{key:'a',definition:{minimumQuality:'bronze'}}],['minimumQuality'],'platinum').map(row=>row.reason),['invalid']);
  const beforeBulk=bulkStorage.getItem(CARD_REVIEW_STORAGE_KEY);
  writes=0;
  const result=bulk.bulkEdit(keys,['workerCapacity'],5);
  assert.equal(writes,1,'a bulk edit saves in one storage write');
  assert.deepEqual(result.changed.sort(),[first,fourth,practiceIds[4]].map(id=>`practice:${id}`).sort());
  assert.deepEqual(result.skipped.map(row=>row.reason).sort(),['absent','locked','missing','same']);
  for(const id of [first,fourth,practiceIds[4]])assert.equal(bulk.preview(bulk.get('practice',id)).definition.workerCapacity,5);
  assert.equal(bulk.preview(bulk.get('practice',third)).definition.workerCapacity,2,'locked cards are skipped unless included');
  assert.equal(bulk.get('practice',fourth).edits.length,2,'bulk edits add to existing per-card edits');
  assert.equal(bulk.get('structure','mudHouses').edits.length,0);
  // Per-card Revert (a single-card edit back to live) still works on bulk results.
  bulk.edit('practice',first,['workerCapacity'],bulkLive.practices[first].workerCapacity);
  assert.equal(bulk.get('practice',first).edits.length,0,'reverting a bulk change removes that edit');
  bulk.notes('practice',fourth,'Written after the bulk edit.');
  assert.equal(bulk.undoBulk(result.undo),3);
  const afterUndo=JSON.parse(bulkStorage.getItem(CARD_REVIEW_STORAGE_KEY)),beforeDoc=JSON.parse(beforeBulk);
  for(const key of keys.filter(key=>beforeDoc.cards[key])) {
    assert.deepEqual(afterUndo.cards[key].edits,beforeDoc.cards[key].edits,`${key} edits restored by undo`);
    assert.deepEqual(afterUndo.cards[key].baseline,beforeDoc.cards[key].baseline,`${key} baseline restored by undo`);
  }
  assert.equal(afterUndo.cards[`practice:${fourth}`].notes,'Written after the bulk edit.','undo keeps notes written since');
  assert.equal(afterUndo.cards[`practice:${second}`].notes,'Keep my note.');
  const included=bulk.bulkEdit(keys,['minimumQuality'],'silver',{includeLocked:true});
  assert.ok(included.changed.includes(`practice:${third}`)&&included.changed.includes('structure:mudHouses'),'Include locked applies to locked cards; choices apply across kinds');
  bulk.remove('practice',third);
  assert.equal(bulk.undoBulk(included.undo),included.changed.length-1,'cards deleted since stay deleted');
  assert.equal(bulk.get('practice',third),null);
  writes=0;assert.deepEqual(bulk.bulkEdit(keys,['workerCapacity'],99).changed,[]);
}

// Production outputs: add and remove non-Stock outputs; fixed effects keep their places.
{
  const outStored=new Map();
  const outStorage={getItem:key=>outStored.get(key)??null,setItem:(key,value)=>outStored.set(key,value)};
  const outLive=structuredClone(gameConfig.gamepieces);
  const out=createCardReviewController({storage:outStorage,resolveLive:(kind,id)=>outLive[kind==='practice'?'practices':'structures'][id]});
  const draftOf=id=>out.preview(out.get('practice',id)).definition;
  for(const id of ['caravanGuarding','charnelAlchemy','heroicCompany'])out.flag('practice',id,outLive.practices[id]);
  const caravan=outLive.practices.caravanGuarding;
  assert.ok(reviewOutputChoices(caravan).some(choice=>choice.key==='research'));
  assert.ok(!reviewOutputChoices(outLive.practices.charnelAlchemy).some(choice=>choice.key==='research'),'present outputs are not offered again');
  assert.deepEqual(reviewOutputChoices(caravan).filter(choice=>choice.effect.op==='train').map(choice=>choice.key),['train:scholar','train:warrior']);
  out.edit('practice','caravanGuarding',['effects'],reviewAddOutput(caravan,{op:'research',amount:2}));
  assert.deepEqual(draftOf('caravanGuarding').effects.map(effect=>effect.op),['generateStock','research']);
  // Leaf edits after an output change fold into the one effect-list edit.
  out.edit('practice','caravanGuarding',['effects',1,'amount'],3);
  out.edit('practice','caravanGuarding',['effects',0,'amount'],caravan.effects[0].amount+1);
  assert.deepEqual(out.get('practice','caravanGuarding').edits.map(edit=>edit.path),[['effects']]);
  assert.deepEqual(draftOf('caravanGuarding').effects,[{...caravan.effects[0],amount:caravan.effects[0].amount+1},{op:'research',amount:3}]);
  // Remove Research (a non-Stock output) from a Stock + Research + Chaos card.
  const charnel=outLive.practices.charnelAlchemy;
  out.edit('practice','charnelAlchemy',['effects'],reviewRemoveOutput(charnel,1));
  assert.deepEqual(draftOf('charnelAlchemy').effects.map(effect=>effect.op),['generateStock','addChaos']);
  assert.deepEqual(reviewRemoveOutput(charnel,0),structuredClone(charnel.effects),'Stock production cannot be removed');
  // A card with no effects can gain one.
  out.edit('practice','heroicCompany',['effects'],[{op:'bankSupport',amount:1,bank:'siege'}]);
  const outBefore=outStorage.getItem(CARD_REVIEW_STORAGE_KEY);
  const reject=(id,effects,message)=>assert.throws(()=>out.edit('practice',id,['effects'],effects),undefined,message);
  reject('caravanGuarding',[{op:'research',amount:2}],'Stock production stays');
  reject('charnelAlchemy',[charnel.effects[2],charnel.effects[0]],'fixed effects keep their order');
  reject('charnelAlchemy',[charnel.effects[0]],'Chaos is not a removable output');
  reject('caravanGuarding',[caravan.effects[0],{op:'research',amount:1},{op:'research',amount:2}],'one output per type');
  reject('caravanGuarding',[caravan.effects[0],{op:'teleport',amount:1}],'only known output types');
  reject('caravanGuarding',[caravan.effects[0],{op:'train',amount:1,classId:'farmer'}],'valid output parameters');
  reject('caravanGuarding',[caravan.effects[0],{op:'research',amount:'2'}],'number amounts');
  reject('caravanGuarding',[caravan.effects[0],{op:'research',amount:1,target:'x'}],'no extra output keys');
  reject('caravanGuarding',[caravan.effects[0],{op:'research',amount:1},{op:'bankPreview',amount:1},{op:'train',amount:1,classId:'scholar'}],'cards show up to three effects');
  reject('caravanGuarding',[{...caravan.effects[0],op:'research'}],'Stock effects keep their op');
  assert.equal(outStorage.getItem(CARD_REVIEW_STORAGE_KEY),outBefore,'invalid output lists leave the draft intact');
  // Edited cards carry added/removed outputs into new games and saves.
  out.setUseInNewGames(true);
  assert.deepEqual(out.getLaunchStatus().issues,[]);
  const outGame=out.createNewGame(77);
  assert.deepEqual(outGame.gameConfig.gamepieces.practices.caravanGuarding.effects.map(effect=>effect.op),['generateStock','research']);
  assert.equal(outGame.gameConfig.gamepieces.practices.caravanGuarding.effects[1].amount,3);
  assert.deepEqual(outGame.gameConfig.gamepieces.practices.charnelAlchemy.effects.map(effect=>effect.op),['generateStock','addChaos']);
  assert.deepEqual(outGame.gameConfig.gamepieces.practices.heroicCompany.effects,[{op:'bankSupport',amount:1,bank:'siege'}]);
  assert.deepEqual(validateGamepiecesDraft(outGame.gameConfig.gamepieces).errors,[]);
  assert.deepEqual(deserializeGameState(serializeGameState(outGame)).gameConfig.gamepieces.practices.caravanGuarding.effects,outGame.gameConfig.gamepieces.practices.caravanGuarding.effects,'saves keep added outputs');
  const tampered=structuredClone(gameConfig.gamepieces);tampered.practices.caravanGuarding.effects=[{op:'research',amount:9}];
  assert.deepEqual(canonicalizeGamepiecesDraft(tampered).practices.caravanGuarding.effects.map(effect=>effect.op),['generateStock'],'incompatible effect lists fall back to the authored effects');
  // Zoo: filter by what a card produces, live and with drafts applied.
  const researchers=state=>filterLabCatalogue(getLabCatalogue(state),{category:'practice',produces:'Research'}).map(entry=>entry.id);
  const liveResearch=researchers(createNewGameState(77));
  assert.equal(liveResearch.length,9);assert.ok(liveResearch.includes('observation')&&liveResearch.includes('charnelAlchemy')&&!liveResearch.includes('caravanGuarding'));
  const editedResearch=researchers(outGame);
  assert.ok(editedResearch.includes('caravanGuarding')&&!editedResearch.includes('charnelAlchemy'),'Produces follows edited outputs');
  assert.equal(filterLabCatalogue(getLabCatalogue(outGame),{category:'practice',produces:'Stock'}).length,81);
  assert.deepEqual(filterLabCatalogue(getLabCatalogue(outGame),{category:'structure',produces:'Housing'}).length,6);
  // Revert restores the live list and removes the edit.
  out.edit('practice','caravanGuarding',['effects'],outLive.practices.caravanGuarding.effects);
  assert.equal(out.get('practice','caravanGuarding').edits.length,0);
  out.setUseInNewGames(false);
}

// Consume/Require lists: add, remove and retrait inputs on scheduled Practices.
{
  const inStored=new Map();
  const inStorage={getItem:key=>inStored.get(key)??null,setItem:(key,value)=>inStored.set(key,value)};
  const inLive=structuredClone(gameConfig.gamepieces);
  const inputs=createCardReviewController({storage:inStorage,resolveLive:(kind,id)=>inLive[kind==='practice'?'practices':'structures'][id]});
  const masonry=inLive.practices.masonry;
  inputs.flag('practice','masonry',masonry);inputs.flag('practice','caravanGuarding',inLive.practices.caravanGuarding);
  const draft=()=>inputs.preview(inputs.get('practice','masonry')).definition;
  inputs.edit('practice','masonry',['consume'],[...masonry.consume,{amount:2,traits:['Fuel']}]);
  inputs.edit('practice','masonry',['require'],[]);
  assert.deepEqual(draft().consume,[{traits:['Stone'],amount:1},{amount:2,traits:['Fuel']}]);
  assert.deepEqual(draft().require,[]);
  // Leaf edits fold into the list edit; alternatives are allowed.
  inputs.edit('practice','masonry',['consume',1,'amount'],3);
  inputs.edit('practice','masonry',['consume'],[draft().consume[0],{amount:3,traits:['Fuel','Timber']}]);
  assert.deepEqual(inputs.get('practice','masonry').edits.map(edit=>edit.path[0]).sort(),['consume','require']);
  const inBefore=inStorage.getItem(CARD_REVIEW_STORAGE_KEY);
  const reject=(id,path,value,message)=>assert.throws(()=>inputs.edit('practice',id,path,value),undefined,message);
  reject('masonry',['consume'],[{amount:1,traits:[]}],'at least one trait');
  reject('masonry',['consume'],[{amount:1,traits:['Unknown']}],'known Stock traits');
  reject('masonry',['consume'],[{amount:1,traits:['Charge']}],'Charge is not a Stock input');
  reject('masonry',['consume'],[{amount:1.5,traits:['Stone']}],'whole amounts');
  reject('masonry',['consume'],[{amount:-1,traits:['Stone']}],'non-negative amounts');
  reject('masonry',['consume'],[{amount:1,traits:['Stone','Stone']}],'unique traits');
  reject('masonry',['consume'],[{amount:1,traits:['Stone'],chance:2}],'no extra keys');
  reject('masonry',['require'],Array.from({length:4},()=>({amount:1,traits:['Tool']})),'up to three inputs');
  reject('caravanGuarding',['consume'],[{amount:1,traits:['Stone']}],'Charge cards cannot consume');
  assert.equal(inStorage.getItem(CARD_REVIEW_STORAGE_KEY),inBefore,'invalid inputs leave the draft intact');
  inputs.setUseInNewGames(true);
  assert.deepEqual(inputs.getLaunchStatus().issues,[]);
  const game=inputs.createNewGame(91),played=game.gameConfig.gamepieces.practices.masonry;
  assert.deepEqual(played.consume,[{amount:1,traits:['Stone']},{amount:3,traits:['Fuel','Timber']}]);
  assert.deepEqual(played.require,[]);
  assert.deepEqual(validateGamepiecesDraft(game.gameConfig.gamepieces).errors,[]);
  assert.deepEqual(deserializeGameState(serializeGameState(game)).gameConfig.gamepieces.practices.masonry.consume,played.consume,'saves keep edited inputs');
  const tampered=structuredClone(gameConfig.gamepieces);tampered.practices.masonry.consume=Array.from({length:5},()=>({amount:1,traits:['Stone']}));
  assert.equal(canonicalizeGamepiecesDraft(tampered).practices.masonry.consume.length,1,'invalid input lists fall back to the authored list');
  const consumers=(state,trait)=>filterLabCatalogue(getLabCatalogue(state),{category:'practice',consumes:trait}).map(entry=>entry.id);
  assert.ok(consumers(game,'Fuel').includes('masonry')&&!consumers(createNewGameState(91),'Fuel').includes('masonry'),'Consumes filter follows edited inputs');
  assert.ok(filterLabCatalogue(getLabCatalogue(createNewGameState(91)),{category:'practice',requires:'Tool'}).some(entry=>entry.id==='masonry'));
  assert.ok(!filterLabCatalogue(getLabCatalogue(game),{category:'practice',requires:'Tool'}).some(entry=>entry.id==='masonry'),'Requires filter follows removed requirements');
  // Revert restores the live lists.
  inputs.edit('practice','masonry',['consume'],masonry.consume);inputs.edit('practice','masonry',['require'],masonry.require);
  assert.equal(inputs.get('practice','masonry').edits.length,0);
  inputs.setUseInNewGames(false);
}
{
  const importedStore=new Map();let writes=0;
  const importedStorage={getItem:key=>importedStore.get(key)??null,setItem:(key,value)=>{writes++;importedStore.set(key,value);}};
  const destination=createCardReviewController({storage:importedStorage,resolveLive});
  const raw=JSON.stringify(exported);
  assert.deepEqual(destination.previewImport(raw),{total:2,added:2,existing:0});
  assert.equal(writes,0,'preview never writes');
  assert.deepEqual(destination.import(raw),{added:2,replaced:0,skipped:0});
  assert.equal(writes,1,'import commits the entire file in one write');
  const sourceFields=entry=>Object.fromEntries(['kind','id','tier','baseline','edits','notes','flaggedAt'].map(key=>[key,entry[key]]));
  assert.deepEqual(destination.list(),exported.cards.map(sourceFields),'all persisted fields round-trip, including notes-only reviews');
  assert.equal(destination.useInNewGames(),false,'import never enables reviewed game definitions');
  assert.equal(destination.preview(destination.get('practice','smelting')).conflicts.length,1,'old-build field conflicts stay visible');
  assert.equal(destination.get('structure','mudHouses').notes,'Keep this as the baseline.','removed cards retain their notes and baseline');
  assert.equal(Object.hasOwn(destination.get('practice','smelting'),'modified'),false,'derived export data is discarded');
  destination.notes('practice','smelting','PC draft');
  destination.flag('practice','forage',live.practices.forage);
  assert.deepEqual(destination.previewImport(raw),{total:2,added:0,existing:2});
  assert.deepEqual(destination.import(raw),{added:0,replaced:0,skipped:2});
  assert.equal(destination.get('practice','smelting').notes,'PC draft');
  assert.deepEqual(destination.import(raw,{overwrite:true}),{added:0,replaced:2,skipped:0});
  assert.deepEqual(destination.get('practice','smelting'),sourceFields(exported.cards[0]));
  assert.ok(destination.get('practice','forage'),'reviews outside the import stay');
  const before=importedStorage.getItem(CARD_REVIEW_STORAGE_KEY),writesBefore=writes;
  const invalid=change=>{const doc=structuredClone(exported);change(doc);return JSON.stringify(doc);};
  for(const bad of ['not JSON','null','{}',invalid(doc=>doc.schemaVersion=99),invalid(doc=>doc.type='debug-profile'),
    invalid(doc=>doc.cards.push(doc.cards[0])),invalid(doc=>doc.cards[1].notes=12),
    invalid(doc=>doc.cards[1].edits=[{path:['constructor','polluted'],value:true}]),
    invalid(doc=>doc.cards[1].edits=[{path:['housing'],value:'bad'}]),
    invalid(doc=>doc.cards[1].baseline=JSON.parse('{"__proto__":{"polluted":true}}'))]) {
    assert.throws(()=>destination.import(bad));
    assert.equal(importedStorage.getItem(CARD_REVIEW_STORAGE_KEY),before,'invalid files never partially import');
  }
  assert.equal(writes,writesBefore,'invalid imports never attempt storage writes');
  const full=createCardReviewController({storage:{getItem:importedStorage.getItem,setItem:()=>{throw new Error('Storage full');}},resolveLive});
  assert.throws(()=>full.import(raw,{overwrite:true}),/Storage full/);
  assert.equal(importedStorage.getItem(CARD_REVIEW_STORAGE_KEY),before);
  assert.deepEqual(destination.import(JSON.stringify({type:'card-review',schemaVersion:1,cards:[]})),{added:0,replaced:0,skipped:0});
}
console.log('[card-review] OK: persistent proposals/locks/construction costs, export/import round-trip and conflicts, pool filtering/rerolls, edited new-game snapshots, save/replay isolation, validation and storage failures, bulk edits/skips/undo, production outputs and Consume/Require lists, Produces/Consumes/Requires filters');
