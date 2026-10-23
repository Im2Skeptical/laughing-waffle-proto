import assert from 'node:assert/strict';
import { createLifegraphController } from '../src/controllers/lifegraph-controller.js';
import { createLifegraphDraft, diagnoseLifegraph, validateLifegraphDraft } from '../src/model/dev-lab/lifegraph.js';
import { generateVassalLifeMap, validateVassalLifeMapGraph } from '../src/model/vassal-life-map-generator.js';
import { createRng } from '../src/model/rng.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool, selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { createConfiguredNewGameState } from '../src/model/new-game.js';
import { createRegionalBootProfile } from '../src/model/regional-map/boot-profile.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { createTimelineFromInitialState, rebuildStateAtSecond, appendActionAtCursor } from '../src/model/timeline/index.js';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { initializeReplayClock, advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';

const column=(id,depth,targetId='practiceReform',scope='common',lifeStage='any')=>({id,label:id,enabled:true,depth,targetType:'node',targetId,scope,lifeStage});
const config=createLifegraphDraft().generatorConfig;
Object.assign(config,{laneCount:3,normalDepthCount:10,earlyDepthCount:3,midDepthCount:4});
config.design.bookends.founding={enabled:true,depth:0,priority:0};
const testDraft=()=>({...createLifegraphDraft(),generatorConfig:structuredClone(config)});
config.design.columns=[column('early-practices',3),column('late-practices',8)];
config.design.nodes.practiceReform.milestonesOnly=true;
for(const classId of [null,'scholar','warrior'])for(let seed=1;seed<=30;seed++){
  const options={classId,generationSeed:seed,stockOutputs:['Edible','Timber','Stone'],unmetStockOutputs:['Edible']};
  const result=generateVassalLifeMap(config,createRng(seed),options);
  assert.equal(result.ok,true,result.errors?.join('; '));
  assert.deepEqual(result,generateVassalLifeMap(config,createRng(seed),options));
  assert.deepEqual(validateVassalLifeMapGraph(result.graph),{ok:true,errors:[]});
  const d=diagnoseLifegraph(result.graph);
  assert.equal(d.families.practiceReform.count,2);
  assert.equal(d.families.practiceReform.minOnRoute,2);
  assert.equal(d.families.practiceReform.maxOnRoute,2);
  for(const milestone of result.graph.nodes.filter(n=>n.milestoneId)){
    assert.equal(result.graph.nodes.filter(n=>n.depth===milestone.depth).length,1);
    assert.equal(milestone.position.y,.5);
  }
}

const scoped=structuredClone(config);scoped.design.columns=[column('class-column',5,'discovery','scholar')];
for(const classId of [null,'scholar','warrior']){
  const result=generateVassalLifeMap(scoped,createRng(7),{classId,generationSeed:7,stockOutputs:['Edible']});
  assert.equal(result.ok,true,result.errors?.join('; '));
  assert.equal(result.graph.nodes.some(n=>n.milestoneId==='class-column'),classId==='scholar');
}
const pooled=structuredClone(config);pooled.design.columns=[{...column('growth',6),targetType:'pool',targetId:'growth'}];
assert.equal(generateVassalLifeMap(pooled,createRng(9),{classId:null,stockOutputs:['Edible']}).ok,true);
const opening=structuredClone(config);opening.design.columns=[column('opening',1),column('final',10)];
for(const classId of [null,'scholar','warrior']){
  const result=generateVassalLifeMap(opening,createRng(2),{classId,generationSeed:2,stockOutputs:['Edible']});
  assert.equal(result.ok,true,result.errors?.join('; '));
  assert.equal(result.graph.entryNodeIds.length,1);
  assert.deepEqual(validateVassalLifeMapGraph(result.graph),{ok:true,errors:[]});
}
const authored=structuredClone(config);authored.design.columns=Array.from({length:10},(_,i)=>column(`stop-${i}`,i+1));
authored.design.guarantees=[];authored.design.stockSupply.enabled=false;
for(const [id,rule]of Object.entries(authored.design.nodes))if(id!=='legacy'&&id!=='practiceReform')rule.enabled=false;
const authoredResult=generateVassalLifeMap(authored,createRng(3),{generationSeed:3});
assert.equal(authoredResult.ok,true,authoredResult.errors?.join('; '));
assert.deepEqual(validateVassalLifeMapGraph(authoredResult.graph),{ok:true,errors:[]});
assert.equal(diagnoseLifegraph(authoredResult.graph).families.practiceReform.minOnRoute,10);

for(const founding of [{enabled:true,depth:0},{enabled:true,depth:2},{enabled:true,depth:9},{enabled:false,depth:0}]){
  for(const legacy of [{enabled:true,depth:'end'},{enabled:true,depth:1},{enabled:true,depth:6},{enabled:false,depth:'end'}]){
    const c=structuredClone(config);c.design.columns=[];c.design.bookends={founding:{...founding,priority:0},legacy};c.design.guarantees=[];c.design.stockSupply.enabled=false;
    const result=generateVassalLifeMap(c,createRng(12),{classId:'scholar',founderClassId:'scholar',generationSeed:12,stockOutputs:['Edible','Timber','Stone']});
    assert.equal(result.ok,true,result.errors?.join('; '));
    assert.deepEqual(validateVassalLifeMapGraph(result.graph),{ok:true,errors:[]});
    assert.equal(!!result.graph.foundingNodeId,founding.enabled);
    assert.equal(!!result.graph.bossNodeId,legacy.enabled);
    assert.ok(Number.isFinite(diagnoseLifegraph(result.graph).shopRange.min));
    assert.ok(!diagnoseLifegraph(result.graph).warnings.some(w=>w.code==='deadEnd'));
  }
}
const bad=structuredClone(config);bad.design.columns.push(column('early-practices',3));
assert.equal(generateVassalLifeMap(bad,createRng(1)).reason,'invalidConfiguration');
// Founding overrides a custom column only for a first-life Vassal.
const sharedFounding=structuredClone(config);
sharedFounding.design.columns=[column('crossroads',5,'crossroads')];
sharedFounding.design.bookends.founding={enabled:true,depth:5,priority:0};
for(const classId of ['scholar','warrior'])for(const firstLife of [true,false])for(let seed=1;seed<=30;seed++){
  const options={classId,founderClassId:firstLife?classId:null,generationSeed:seed,stockOutputs:['Edible','Timber','Stone']};
  const result=generateVassalLifeMap(sharedFounding,createRng(seed),options);
  assert.equal(result.ok,true,result.errors?.join('; '));
  assert.deepEqual(result,generateVassalLifeMap(sharedFounding,createRng(seed),options));
  assert.deepEqual(validateVassalLifeMapGraph(result.graph),{ok:true,errors:[]});
  const atDepth=result.graph.nodes.filter(n=>n.depth===4);
  assert.equal(atDepth.length,1);
  assert.equal(atDepth[0].family,firstLife?(classId==='scholar'?'philosopherFounding':'warlordFounding'):'crossroads');
  assert.equal(result.graph.nodes.some(n=>n.milestoneId==='crossroads'),!firstLife);
  const wrongContext=structuredClone(result.graph);
  wrongContext.generationContext.founderClassId=firstLife?null:classId;
  assert.equal(validateVassalLifeMapGraph(wrongContext).ok,false,'captured life stage must agree with the winning Founding / Crossroads rule');
}
const bookendCollision=structuredClone(sharedFounding);
bookendCollision.design.bookends.legacy.depth=5;
assert.equal(generateVassalLifeMap(bookendCollision,createRng(1)).reason,'invalidConfiguration','Founding cannot override Legacy');
// Class and life-stage conditions are checked before content; ordered rules
// can override Founding or provide an ordinary fallback without special cases.
const conditional=structuredClone(sharedFounding);
conditional.design.columns.unshift(column('first-scholar',5,'development','scholar','firstLife'));
conditional.design.bookends.founding.priority=1;
for(const classId of ['scholar','warrior'])for(const firstLife of [true,false]){
  const result=generateVassalLifeMap(conditional,createRng(10),{classId,founderClassId:firstLife?classId:null,generationSeed:10,stockOutputs:['Edible']});
  assert.equal(result.ok,true,result.errors?.join('; '));
  assert.deepEqual(validateVassalLifeMapGraph(result.graph),{ok:true,errors:[]});
  const winner=result.graph.nodes.find(node=>node.depth===4);
  assert.equal(winner.family,firstLife?(classId==='scholar'?'development':'warlordFounding'):'crossroads');
  assert.equal(!!result.graph.foundingNodeId,firstLife&&classId==='warrior');
}
conditional.design.columns[0].enabled=false;
assert.equal(generateVassalLifeMap(conditional,createRng(10),{classId:'scholar',founderClassId:'scholar'}).graph.nodes.find(n=>n.depth===4).family,'philosopherFounding');
conditional.design.columns[0].enabled=true;conditional.design.nodes.development.enabled=false;
assert.equal(generateVassalLifeMap(conditional,createRng(10),{classId:'scholar',founderClassId:'scholar'}).reason,'milestoneImpossible','an impossible winning rule reports an error instead of silently falling back');
bad.design.columns=[column('collision',4)];bad.design.bookends.legacy.depth=4;
assert.equal(generateVassalLifeMap(bad,createRng(1)).reason,'invalidConfiguration');
bad.design.columns=[column('disabled',3)];bad.design.bookends.legacy.depth='end';bad.design.nodes.practiceReform.enabled=false;
assert.equal(generateVassalLifeMap(bad,createRng(1)).reason,'milestoneImpossible');

// A milestone counts toward guarantees instead of being overwritten by them.
const guaranteed=structuredClone(config);
guaranteed.design.guarantees=[{id:'practice-pacing',targetType:'node',targetId:'practiceReform',scope:'common',count:2,minDepth:1,maxDepth:10,coverage:'eachRoute'}];
assert.equal(generateVassalLifeMap(guaranteed,createRng(4),{stockOutputs:['Edible']}).ok,true);
const supply=structuredClone(config);supply.design.columns=[column('supply',3,'stockShop')];
supply.design.stockSupply={enabled:true,randomCount:1,unmetCount:0,minDepth:1,maxDepth:10};supply.design.nodes.stockShop.milestonesOnly=true;
assert.equal(generateVassalLifeMap(supply,createRng(4),{stockOutputs:['Edible']}).ok,true,'Stock Supply reservations count an existing milestone');

for(const enabled of [true,false]){
  const profile=createRegionalBootProfile(42),captured=structuredClone(sharedFounding);
  captured.design.bookends.founding={enabled,depth:5,priority:0};captured.design.bookends.legacy.enabled=false;
  profile.lifeMapLab.generatorConfig=captured;
  const state=createConfiguredNewGameState(42,profile),pool=getVassalCandidatePool(state);
  assert.ok(pool.candidates.every(c=>c.signatureNode?.variantId!=='legacyPlus'));
  assert.equal(selectLifeMapVassal(state,0,pool.expectedPoolHash).ok,true);
  const graph=getCurrentLifeMapVassal(state).lifeMap.graph;
  assert.equal(graph.nodes.find(n=>n.id===graph.foundingNodeId)?.depth,enabled?4:undefined);
  assert.equal(graph.nodes.some(n=>n.milestoneId==='crossroads'),!enabled);
  assert.equal(graph.bossNodeId,null);
  deserializeGameState(serializeGameState(state));
}

const storeData=new Map(),store={getItem:key=>storeData.get(key)??null,setItem:(key,value)=>storeData.set(key,value)};
const positioned=createLifegraphController({store:null});
const empty=testDraft();empty.generatorConfig.design.columns=[];
assert.equal(positioned.importJson(JSON.stringify(empty)).ok,true);
assert.equal(positioned.update(['generatorConfig','design','bookends','legacy','depth'],3).ok,true);
assert.equal(positioned.addColumn().ok,true);
assert.equal(positioned.getSnapshot().draft.generatorConfig.design.columns[0].depth,4,'Add column skips relocated bookends');
const controller=createLifegraphController({store});
assert.equal(controller.importJson(JSON.stringify({...createLifegraphDraft(),generatorConfig:sharedFounding})).ok,true);
assert.equal(controller.update(['preview','founding'],true).ok,true);
assert.equal(controller.getSnapshot().graph.nodes.find(n=>n.depth===4).bookend,'founding');
assert.equal(controller.update(['preview','founding'],false).ok,true);
assert.equal(controller.getSnapshot().graph.nodes.find(n=>n.depth===4).family,'crossroads');
assert.equal(controller.update(['preview','founding'],true).ok,true);
assert.equal(controller.moveColumnRule('founding',1).ok,true);
assert.equal(controller.getSnapshot().graph.foundingNodeId,undefined,'editable rule order can put Crossroads before Founding');
assert.equal(controller.getSnapshot().graph.nodes.find(n=>n.depth===4).family,'crossroads');
assert.equal(controller.moveColumnRule('founding',-1).ok,true);
assert.ok(controller.getSnapshot().graph.foundingNodeId);
assert.equal(controller.addColumn({depth:5,afterId:'crossroads'}).ok,true);
const fallbackId=controller.getSnapshot().draft.generatorConfig.design.columns.at(-1).id;
assert.equal(controller.update(['generatorConfig','design','columns',1,'lifeStage'],'successor').ok,true);
assert.equal(controller.importJson(controller.exportJson()).ok,true);
assert.equal(createLifegraphController({store}).getSnapshot().draft.generatorConfig.design.columns[1].lifeStage,'successor');
assert.equal(controller.removeColumn(fallbackId).ok,true);
assert.equal(controller.importJson(JSON.stringify(empty)).ok,true);
assert.equal(controller.addColumn().ok,true);
assert.equal(controller.update(['generatorConfig','design','columns'],config.design.columns).ok,true);
assert.equal(controller.setNode('practiceReform',{milestonesOnly:true}).ok,true);
assert.equal(controller.importJson(controller.exportJson()).ok,true);
controller.openType('practiceReform');
assert.equal(controller.getChoiceReview('practiceReform').error,'','milestone nodes retain their column metadata during isolated/reviewer play');
assert.deepEqual(createLifegraphController({store}).getSnapshot().draft.generatorConfig.design.columns,config.design.columns);
const previous=controller.exportJson();assert.equal(controller.update(['generatorConfig','design','columns',1,'lifeStage'],'invalid').ok,false);
assert.equal(controller.exportJson(),previous,'rejected conditions leave the draft unchanged');

// First-life preview uses the real Founding action, including its delayed class establishment.
assert.equal(controller.update(['preview','founding'],true).ok,true);
controller.openNode(controller.getSnapshot().graph.foundingNodeId);
const founder=controller.sandbox.getSnapshot();assert.equal(founder.vassal.classId,null);
const founderId=founder.nodeId;
controller.sandbox.select(founderId,'train-estate');controller.sandbox.confirm(founderId);controller.sandbox.resolve();
assert.equal(controller.sandbox.getSnapshot().vassal.classId,'scholar');

// Move Legacy inside the graph: rewards resolve and onward routes remain playable.
controller.update(['preview','founding'],false);
assert.equal(controller.update(['generatorConfig','design','bookends','legacy','depth'],5).ok,true);
controller.openNode(controller.getSnapshot().graph.bossNodeId);
let nodeId=controller.sandbox.getSnapshot().nodeId;
controller.sandbox.select(nodeId,'highest-stat');controller.sandbox.confirm(nodeId);
assert.equal(controller.sandbox.getSnapshot().vassal.isDead,false);
assert.ok(controller.sandbox.getSnapshot().vassal.lifeMap.availableNodeIds.length>0);

// Without Legacy, an ordinary terminal node retires normally, without a dead end.
const terminalDraft=testDraft();terminalDraft.generatorConfig.design.columns=[];terminalDraft.generatorConfig.design.bookends.legacy.enabled=false;
terminalDraft.generatorConfig.design.guarantees=[];terminalDraft.generatorConfig.design.stockSupply.enabled=false;
for(const [id,rule]of Object.entries(terminalDraft.generatorConfig.design.nodes))if(id!=='legacy')rule.enabled=id==='development';
terminalDraft.generatorConfig.design.optionCosts.development.steadyPractice.time='free';
assert.deepEqual(validateLifegraphDraft(terminalDraft),[]);
assert.equal(controller.importJson(JSON.stringify(terminalDraft)).ok,true);
controller.openType('legacy'); // A disabled bookend can still be tried in an isolated, valid graph.
controller.openNode(controller.getSnapshot().graph.nodes.at(-1).id);
nodeId=controller.sandbox.getSnapshot().nodeId;
const terminalVassalId=controller.sandbox.getSnapshot().vassal.vassalId;
controller.sandbox.select(nodeId,'steadyPractice');controller.sandbox.confirm(nodeId);
assert.equal(controller.sandbox.getSnapshot().state.civilization.vassalLineage.vassalsById[terminalVassalId].endedReason,'retired');

// A milestone decision and the captured generation settings survive tick replay.
assert.equal(controller.importJson(JSON.stringify({...createLifegraphDraft(),generatorConfig:config})).ok,true);
controller.setOptionCost('development','steadyPractice','time',1);
controller.openType('development');
const state=controller.sandbox.getSnapshot().state,vassal=getCurrentLifeMapVassal(state),timeline=createTimelineFromInitialState(state);
nodeId=vassal.lifeMap.currentNodeId;
for(const [kind,payload]of [[ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:'steadyPractice'}],[ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId}]]){
  assert.equal(appendActionAtCursor(timeline,{kind,payload,tSec:state.tSec},state).ok,true);
  assert.equal(applyAction(state,{kind,payload},{isReplay:true}).ok,true);
}
initializeReplayClock(state,state.tSec);assert.equal(advanceReplayStateToSecond(state,vassal.lifeMap.pendingResolution.resolveSec).ok,true);
const replay=rebuildStateAtSecond(timeline,state.tSec);assert.equal(replay.ok,true);
assert.deepEqual(serializeGameState(state),serializeGameState(replay.state));
deserializeGameState(serializeGameState(state));
console.log('[lifegraph-columns] 90 class/seed maps, pacing, family/class pools, movable/disabled bookends, conflicts, persistence, real Founding/retirement and replay OK');
