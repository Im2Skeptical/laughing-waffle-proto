import assert from 'node:assert/strict';
import { createLifegraphController } from '../src/controllers/lifegraph-controller.js';
import { createLifegraphDraft, diagnoseLifegraph, validateLifegraphDraft, LIFEGRAPH_STORAGE_KEY } from '../src/model/dev-lab/lifegraph.js';
import { createAuthoredVassalLifeMapGeneratorConfig, generateVassalLifeMap, validateVassalLifeMapGraph } from '../src/model/vassal-life-map-generator.js';
import { createRng } from '../src/model/rng.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool, selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { createConfiguredNewGameState } from '../src/model/new-game.js';
import { createRegionalBootProfile } from '../src/model/regional-map/boot-profile.js';
import { createTimelineFromInitialState, rebuildStateAtSecond, appendActionAtCursor } from '../src/model/timeline/index.js';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { initializeReplayClock, advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { createLabNodeSandbox } from '../src/model/dev-lab/node-sandbox.js';

const config=createLifegraphDraft().generatorConfig;
const isolatedDiscovery=createLabNodeSandbox({type:'discovery',classId:'scholar'});
assert.equal(getCurrentLifeMapVassal(isolatedDiscovery.state).lifeMap.graph.nodes.find(n=>n.milestoneId==='milestone-1').family,'practiceReform','isolated Gym previews preserve authored milestones');
assert.equal(config.laneCount,5);assert.equal(config.normalDepthCount,13);
assert.deepEqual(config.design.columns.map(c=>[c.depth,c.targetId]),[[1,'practiceReform'],[5,'crossroads'],[10,'relic']]);
assert.equal(config.design.nodes.discovery.occurrence,'rare');
assert.ok(!config.design.guarantees.some(g=>g.targetId==='discovery'));
for(const classId of ['scholar','warrior']){
  const result=generateVassalLifeMap(config,createRng(10),{classId,founderClassId:classId,generationSeed:10,stockOutputs:['Edible']});
  assert.equal(result.ok,true,result.errors?.join('; '));
  const founding=result.graph.nodes.find(n=>n.id===result.graph.foundingNodeId);
  assert.ok(result.graph.nodes.filter(n=>n.depth<founding.depth).every(n=>!['training','discovery','campaign','challenge','classMarket'].includes(n.family)),'class-only actions must not appear before Founding establishes a class');
}
let scholarMapsWithoutDiscovery=0,randomDiscoveries=0;
for(const classId of [null,'scholar','warrior'])for(let seed=1;seed<=100;seed++){
  const options={classId,generationSeed:seed,stockOutputs:['Edible','Stone','Timber'],unmetStockOutputs:['Tool','Edible']};
  const result=generateVassalLifeMap(config,createRng(seed),options);
  assert.equal(result.ok,true,result.errors?.join('; '));
  assert.deepEqual(validateVassalLifeMapGraph(result.graph),{ok:true,errors:[]});
  assert.deepEqual(result,generateVassalLifeMap(config,createRng(seed),options),'same seed and context reproduce every node and output');
  const d=diagnoseLifegraph(result.graph);
  if(classId==='scholar'){
    scholarMapsWithoutDiscovery+=d.families.discovery.count===0?1:0;
    randomDiscoveries+=d.families.discovery.count;
    assert.ok(result.graph.nodes.filter(n=>n.family==='discovery').every(n=>!n.generationRuleId),'Discovery is random with no guaranteed minimum');
  }
  if(classId==='warrior')assert.ok(d.families.campaign.minOnRoute>=1,'every Warrior route crosses a Campaign guarantee');
  for(const node of result.graph.nodes){
    assert.notEqual(node.stockOutput,'Tool','an unmet but locked output cannot create an empty Supply guarantee');
    if(classId!=='warrior')assert.ok(!['campaign','challenge'].includes(node.family));
    if(classId!=='scholar')assert.notEqual(node.family,'discovery');
  }
}
assert.ok(scholarMapsWithoutDiscovery>=75,'Rare Discovery is absent from most Scholar maps in this pinned batch');
assert.ok(randomDiscoveries>0&&randomDiscoveries<30,'Rare Discovery remains available at low frequency');

const off=structuredClone(config);off.design.nodes.practiceReform.enabled=false;
off.design.columns.filter(c=>c.targetId==='practiceReform').forEach(c=>c.enabled=false);
for(let seed=1;seed<=30;seed++)assert.ok(!generateVassalLifeMap(off,createRng(seed),{classId:'scholar',stockOutputs:['Edible']}).graph.nodes.some(n=>n.family==='practiceReform'));
const impossible=structuredClone(config);impossible.design.guarantees=[{id:'impossible',targetType:'node',targetId:'discovery',scope:'common',count:1,minDepth:1,maxDepth:1,coverage:'eachRoute'}];
assert.equal(generateVassalLifeMap(impossible,createRng(1),{classId:null}).reason,'guaranteeImpossible','a class-incompatible guarantee reports its conflict');
const byPool=structuredClone(config);byPool.design.guarantees=[{id:'shop-route',targetType:'pool',targetId:'shops',scope:'common',count:2,minDepth:2,maxDepth:9,coverage:'eachRoute'}];
for(let seed=1;seed<=30;seed++){const result=generateVassalLifeMap(byPool,createRng(seed),{stockOutputs:['Edible'],classId:null});assert.equal(result.ok,true,result.errors?.join(';'));assert.ok(diagnoseLifegraph(result.graph).shopRange.min>=2);}

const memory=new Map(),store={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const controller=createLifegraphController({store});
assert.equal(controller.update(['preview','founding'],true).ok,true);
controller.openType('training');
assert.equal(controller.sandbox.getSnapshot().vassal.classId,'scholar','isolated class actions choose a slot after Founding');
assert.equal(controller.update(['preview','founding'],false).ok,true);
assert.equal(controller.setReview('practiceReform','Timber has only one eligible card.').ok,true);
assert.equal(controller.savePreset('Content gaps').ok,true);
assert.equal(controller.update(['preview','classId'],'warrior').ok,true);
controller.setOptionCost('campaign','duel','time',1.5);controller.openType('campaign');
const reloaded=deserializeGameState(serializeGameState(controller.sandbox.getSnapshot().state));
assert.equal(reloaded.gameConfig.lifeMapGenerator.design.optionCosts.campaign.duel.time,1.5);

const exported=controller.exportJson();assert.equal(controller.importJson(exported).ok,true);
const exportedValue=JSON.parse(exported);exportedValue.generatorConfig.design.nodes.campaign.scope='common';assert.equal(controller.importJson(JSON.stringify(exportedValue)).ok,false,'class action permissions cannot be broadened beyond the actual rule');
const restored=createLifegraphController({store,baseSandbox:controller.sandbox.getSnapshot()});assert.equal(restored.getSnapshot().draft.reviews.practiceReform.notes,'Timber has only one eligible card.');
assert.ok(memory.has(LIFEGRAPH_STORAGE_KEY));
const before=JSON.stringify(serializeGameState(controller.getSnapshot().state));
await controller.runBatch(40);assert.equal(controller.getSnapshot().batch.failed,0);
assert.ok(JSON.stringify(serializeGameState(controller.getSnapshot().state))===before,'batch diagnostics do not mutate state or consume its RNG');
controller.openType('stockShop');assert.ok(controller.sandbox.getSnapshot().vassal.lifeMap.nodeStates[controller.sandbox.getSnapshot().nodeId].inventory.length>0);
controller.loadPreset('Content gaps');assert.equal(controller.getSnapshot().draft.preview.classId,'scholar');
assert.deepEqual(validateLifegraphDraft(controller.getSnapshot().draft),[]);

// Launch and replay capture the experiment, rather than reading browser drafts.
const profile=createRegionalBootProfile(42);profile.lifeMapLab.generatorConfig=structuredClone(config);
for(const id of Object.keys(config.design.nodes).filter(id=>id.startsWith('signature:')))profile.lifeMapLab.generatorConfig.design.nodes[id].enabled=false;
const state=createConfiguredNewGameState(42,profile);
assert.ok(getVassalCandidatePool(state).candidates.every(c=>c.signatureNode===null),'disabled signatures are not advertised by candidates');
deserializeGameState(serializeGameState(state));
const initial=serializeGameState(state);const pool=getVassalCandidatePool(state);assert.equal(selectLifeMapVassal(state,0,pool.expectedPoolHash).ok,true);
deserializeGameState(serializeGameState(state));
const timeline=createTimelineFromInitialState(deserializeGameState(initial));
assert.equal(rebuildStateAtSecond(timeline,0).state.gameConfig.lifeMapGenerator.design.enabled,true);
assert.equal(createAuthoredVassalLifeMapGeneratorConfig().design.enabled,true,'normal New Game uses the approved pooled defaults');

controller.update(['preview','classId'],'scholar');controller.setOptionCost('discovery','discovery-research','time',1);controller.openType('discovery');
const timed=controller.sandbox.getSnapshot().state,timedVassal=getCurrentLifeMapVassal(timed);
const timedTimeline=createTimelineFromInitialState(timed),nodeId=timedVassal.lifeMap.currentNodeId;
for(const [kind,payload]of [[ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:'discovery-research'}],[ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId}]]){
  assert.equal(appendActionAtCursor(timedTimeline,{kind,payload,tSec:timed.tSec},timed).ok,true);
  assert.equal(applyAction(timed,{kind,payload},{isReplay:true}).ok,true);
}
initializeReplayClock(timed,timed.tSec);assert.equal(advanceReplayStateToSecond(timed,timedVassal.lifeMap.pendingResolution.resolveSec).ok,true);
const replayed=rebuildStateAtSecond(timedTimeline,timed.tSec);assert.equal(replayed.ok,true);
const snapshot=s=>JSON.stringify({tSec:s.tSec,rng:s.rng,world:s.world,civilization:s.civilization});
assert.ok(snapshot(timed)===snapshot(replayed.state),'a pooled decision with a changed time band matches authoritative tick replay');
console.log('[lifegraph-workbench] 300 class/seed graphs, route guarantees, pool coverage, class permissions, locked supply, cost bands, draft/notes/presets and captured launch/replay OK');
