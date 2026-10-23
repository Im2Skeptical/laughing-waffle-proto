import assert from 'node:assert/strict';
import {createLifegraphController} from '../src/controllers/lifegraph-controller.js';
import {createLabNodeSandbox} from '../src/model/dev-lab/node-sandbox.js';
import {createLifegraphDraft,diagnoseLifegraph,nodeDesignId} from '../src/model/dev-lab/lifegraph.js';
import {getRelicPoolAppearance,validateRelicPools} from '../src/model/vassal-life-map/relic-pools.js';
import {generateRelicOffers,createHeirloomInstance} from '../src/model/vassal-life-map/heirlooms.js';
import {getCurrentLifeMapVassal} from '../src/model/vassal-life-map.js';
import {generateVassalLifeMap,validateVassalLifeMapGraph} from '../src/model/vassal-life-map-generator.js';
import {createRng} from '../src/model/rng.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {createTimelineFromInitialState,appendActionAtCursor,rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {ActionKinds,applyAction} from '../src/model/actions.js';

const clone=value=>structuredClone(value),draft=createLifegraphDraft();
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} should equal ${expected}`);
assert.deepEqual(validateRelicPools(draft.generatorConfig.design.relicPools),[]);
const s=createLabNodeSandbox({type:'relic'}),design=s.state.gameConfig.lifeMapGenerator.design,v=getCurrentLifeMapVassal(s.state);
close(getRelicPoolAppearance(design,'relic').filter(row=>row.quality==='bronze').reduce((sum,row)=>sum+row.chance,0),.55);
for(const rule of Object.values(design.relicPools.relic.qualities))rule.enabled=false;
design.relicPools.relic.qualities.bronze={enabled:true,weight:1};
design.relicPools.relic.qualities.silver={enabled:true,weight:3};
const rows=getRelicPoolAppearance(design,'relic');
close(rows.filter(row=>row.quality==='bronze').reduce((sum,row)=>sum+row.chance,0),.25);
close(rows.filter(row=>row.quality==='silver').reduce((sum,row)=>sum+row.chance,0),.75);
s.state.rngNextVassalInt=min=>min;
s.state.rngNextVassalFloat=()=>.249999;
assert.equal(generateRelicOffers(s.state,v)[0].quality,'bronze');
s.state.rngNextVassalFloat=()=>.25;
assert.equal(generateRelicOffers(s.state,v)[0].quality,'silver','quality weights use the displayed first-draw boundary');
for(const rule of Object.values(design.relicPools.specialRelic.entries))rule.enabled=false;
design.relicPools.specialRelic.entries.signetRing={enabled:true,weight:1};
design.relicPools.specialRelic.entries.crownOfAges={enabled:true,weight:3};
assert.equal(getRelicPoolAppearance(design,'specialRelic').find(row=>row.id==='crownOfAges').chance,.75);
assert.equal(generateRelicOffers(s.state,v,{special:true})[0].definitionId,'crownOfAges');
s.state.rngNextVassalFloat=()=>.249999;
assert.equal(generateRelicOffers(s.state,v,{special:true})[0].definitionId,'signetRing');
const pair=generateRelicOffers(s.state,v,{special:true});
assert.deepEqual(pair.map(row=>row.definitionId).sort(),['crownOfAges','signetRing'],'thin pools offer their enabled entries once without filling disabled content');
v.heirlooms.carry[0]=createHeirloomInstance(s.state,'signetRing');
assert.deepEqual(generateRelicOffers(s.state,v,{special:true}).map(row=>row.definitionId),['crownOfAges'],'owned Relics are excluded');
design.relicPools.specialRelic.entries.crownOfAges.enabled=false;
const empty=generateRelicOffers(s.state,v,{special:true});
assert.equal(empty.length,1);assert.equal(empty[0].emptyRelic,true);assert.equal(empty[0].phaseCost,0);assert.equal(empty[0].immediateDeathChance,0);
assert.ok(generateRelicOffers(s.state,v).every(row=>['bronze','silver'].includes(row.quality)),'Special Relic edits leave ordinary quality rules alone');
for(const invalid of [0,-1,Infinity,100001]){
 const pools=clone(draft.generatorConfig.design.relicPools);pools.specialRelic.entries.crownOfAges.weight=invalid;
 assert.ok(validateRelicPools(pools).length,'invalid weights are rejected');
}
const extra=clone(draft.generatorConfig.design.relicPools);extra.specialRelic.entries.madeUp={enabled:true,weight:1};assert.ok(validateRelicPools(extra).length);

// Independent node switches and guarantees work across classes and seeds.
const config=clone(draft.generatorConfig);config.design.nodes.relic.enabled=false;
config.design.columns.filter(c=>c.targetId==='relic').forEach(c=>c.enabled=false);
config.design.guarantees.push({id:'special-route',targetType:'node',targetId:'specialRelic',scope:'common',count:1,minDepth:2,maxDepth:3,coverage:'eachRoute'});
for(const classId of [null,'scholar','warrior'])for(let seed=1;seed<=20;seed++){
 const result=generateVassalLifeMap(config,createRng(seed),{classId,generationSeed:seed,stockOutputs:['Edible']});
 assert.equal(result.ok,true,result.errors?.join('; '));assert.equal(validateVassalLifeMapGraph(result.graph).ok,true,validateVassalLifeMapGraph(result.graph).errors.join('; '));
 assert.ok(!result.graph.nodes.some(n=>nodeDesignId(n)==='relic'));
 assert.ok(diagnoseLifegraph(result.graph).families.specialRelic.minOnRoute>=1);
}
const noSpecial=clone(draft.generatorConfig);noSpecial.design.nodes.specialRelic.enabled=false;
for(let seed=1;seed<=20;seed++)assert.ok(!generateVassalLifeMap(noSpecial,createRng(seed),{classId:'scholar',stockOutputs:['Edible']}).graph.nodes.some(n=>n.specialRelic));

const memory=new Map(),store={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},c=createLifegraphController({store});
assert.equal(c.getChoiceReview('relic').choices.length,1);assert.equal(c.getChoiceReview('specialRelic').choices.length,1);
assert.equal(c.setRelicPoolEnabled('specialRelic',false).ok,true);
assert.equal(c.getChoiceReview('specialRelic').offers.length,0);
assert.equal(c.getSnapshot().cardPools.find(row=>row.id==='specialRelic').status,'empty');
c.openType('specialRelic');
const exhausted=c.sandbox.getSnapshot(),exhaustedOption=exhausted.vassal.lifeMap.nodeStates[exhausted.nodeId].options[0];
assert.equal(exhaustedOption.phaseCost,0);assert.equal(exhaustedOption.immediateDeathChance,0);
for(const [kind,payload]of [[ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId:exhausted.nodeId,optionId:exhaustedOption.id}],[ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:exhausted.nodeId}]])assert.equal(applyAction(exhausted.state,{kind,payload},{isReplay:true}).ok,true);
assert.equal(exhausted.vassal.lifeMap.pendingResolution,null,'the empty Special pool exit resolves immediately');
assert.ok(exhausted.vassal.lifeMap.completedNodeIds.includes(exhausted.nodeId));
assert.equal(exhausted.state.tSec,0);
c.setRelicPoolEnabled('specialRelic',true);assert.equal(c.getChoiceReview('specialRelic').offers.length,3);
for(const id of ['relic','specialRelic']){
 c.setOptionCost(id,'search','time','free');c.setOptionCost(id,'search','risk','free');c.setOptionCost(id,'search','monsterPressure','free');c.openType(id);
 const x=c.sandbox.getSnapshot(),active=getCurrentLifeMapVassal(x.state),node=x.state.world&&active.lifeMap.graph.nodes.find(n=>n.id===x.nodeId);
 assert.equal(nodeDesignId(node),id);assert.equal(active.lifeMap.nodeStates[x.nodeId].specialRelic,id==='specialRelic');
 active.lifeMap.nodeStates={};active.lifeMap.currentNodeId=null;active.lifeMap.availableNodeIds=[x.nodeId];
 const timeline=createTimelineFromInitialState(x.state);
 const act=(kind,payload)=>{assert.equal(appendActionAtCursor(timeline,{kind,payload,tSec:x.state.tSec},x.state).ok,true);const result=applyAction(x.state,{kind,payload},{isReplay:true});assert.equal(result.ok,true,result.reason);};
 act(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId:x.nodeId});
 const offer=active.lifeMap.nodeStates[x.nodeId].options[0];
 act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId:x.nodeId,optionId:offer.id});
 act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:x.nodeId,acquire:{destination:'decline'}});
 const replay=rebuildStateAtSecond(timeline,x.state.tSec);assert.equal(replay.ok,true);
 assert.deepEqual(serializeGameState(replay.state),serializeGameState(x.state),'entry rolls, costs and acquisition use captured rules in replay');
 deserializeGameState(serializeGameState(x.state));
}
c.update(['generatorConfig','design','relicPools','relic','qualities','diamond','weight'],17);
c.update(['generatorConfig','design','relicPools','specialRelic','entries','crownOfAges','weight'],99);
assert.equal(c.importJson(c.exportJson()).ok,true);
assert.equal(createLifegraphController({store}).getGeneratorConfig().design.relicPools.specialRelic.entries.crownOfAges.weight,99);
console.log('[lifegraph-relic-pools] quality/item probabilities, exact draw boundaries, exclusions/thin/empty pools, independent nodes/route guarantees, persistence and entry-to-acquisition replay OK');
