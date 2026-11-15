import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {selectedState} from '../../src/model/tests/vassal-life-map/helpers.js';
import {createLifeDecisionController} from '../../src/controllers/life-decision-controller.js';
import {createSimRunner} from '../../src/controllers/sim-runner.js';
import {ActionKinds} from '../../src/model/actions.js';
import {serializeGameState,deserializeGameState} from '../../src/model/state.js';
import {prepareLifeChoices,runLifeDecisionJob} from '../../src/model/vassal-life-map/decision-preparation.js';
import {getVassalNodeDecisionPresentation} from '../../src/model/vassal-life-map.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const output=process.env.LIFE_STATE_OUTPUT??`artifacts/perf-hillclimb/life-state-focused-${Date.now()}`;
mkdirSync(output);const sources={};
for(const file of ['src/controllers/life-decision-controller.js','scripts/perf-hillclimb/life-state-inspection-test.mjs']){const bytes=readFileSync(file);sources[file]=createHash('sha256').update(bytes).digest('hex');writeFileSync(`${output}/${file.replaceAll('/','__')}`,bytes);}
writeFileSync(`${output}/sources.json`,JSON.stringify(sources));
try{
 const initial=selectedState(1),initialBefore=serializeGameState(initial),branches=await prepareLifeChoices(initialBefore),nodeId=Object.keys(branches)[0];
 const runner=createSimRunner({setupId:'devPlaytesting01'});runner.resetToState(deserializeGameState(branches[nodeId].stateData));
 let observing=false,w,changes=0;
 const controller=createLifeDecisionController({getRunner:()=>runner,getState:()=>{assert.equal(observing,false,'no getState while inspecting');return runner.getState();},onChange:()=>{assert.equal(observing,false);changes++;},createWorker:()=>w={terminate(){assert.equal(observing,false);},postMessage(message){this.message=message;}}});
 const read=(options)=>{const runnerBefore=runner.inspectRetainedStates(),timelineBefore=JSON.stringify(runner.getTimeline()),changeBefore=changes;observing=true;let result;try{result=controller.inspectRetainedPreparation(options);}finally{observing=false;}assert.deepEqual(runner.inspectRetainedStates(),runnerBefore);assert.equal(JSON.stringify(runner.getTimeline()),timelineBefore);assert.equal(changes,changeBefore);return result;};
 assert.equal(read().draft,null);assert.equal(read().job,null);assert.equal(read().selectedNode,null);
 const optionId=getVassalNodeDecisionPresentation(runner.getState(),nodeId).nodeState.options.find(o=>o.enabled!==false).id;
 const payload={nodeId,optionId},payloadBefore=copy(payload);
 controller.dispatch(ActionKinds.VASSAL_SELECT_LIFE_OPTION,payload);
 const heldDraft=controller.getState(),draftOriginal=read(),backing=runner.inspectRetainedStates();
 const corrupt=x=>{for(const k of Object.keys(x??{})){if(x[k]&&typeof x[k]==='object')corrupt(x[k]);else x[k]='mutant';}};
 corrupt(read());assert.deepEqual(read(),draftOriginal);assert.deepEqual(payload,payloadBefore);
 // Actual retained runtime fault, distinct from DTO mutation. Restore in finally.
 const seed=heldDraft.rng.vassalSeed,knowledge=heldDraft.persistentKnowledge.maxObservedCivilizationSurvivalYear;
 try{heldDraft.rng.vassalSeed=-123;heldDraft.persistentKnowledge.maxObservedCivilizationSurvivalYear=-123;
  assert.notDeepEqual(read().draft.stateData,draftOriginal.draft.stateData);assert.deepEqual(runner.inspectRetainedStates(),backing);
 }finally{heldDraft.rng.vassalSeed=seed;heldDraft.persistentKnowledge.maxObservedCivilizationSurvivalYear=knowledge;}
 assert.deepEqual(read(),draftOriginal);
 controller.dispatch(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId});
 const input=copy(w.message),pending=read();corrupt(read());assert.deepEqual(read(),pending);assert.deepEqual(w.message,input);
 const messages=[];await runLifeDecisionJob(w.message,m=>messages.push(m));
 for(const message of messages)w.onmessage({data:{...message,requestId:input.requestId}});
 await new Promise(resolve=>setTimeout(resolve,0));
 const selectedNodeId=Object.keys(messages.find(m=>m.kind==='ready').nodes)[0];assert.ok(selectedNodeId);
 const retained=read({nodeId:selectedNodeId});assert.equal(retained.job.ready,true);assert.equal(read().selectedNode,null);assert.equal(read({nodeId:'missing'}).selectedNode,null);
 corrupt(read({nodeId:selectedNodeId}));assert.deepEqual(read({nodeId:selectedNodeId}),retained);
 const realReady=messages.find(m=>m.kind==='ready'),realNode=realReady.nodes[selectedNodeId];
 const siblingId=Object.keys(realReady.nodes).find(id=>id!==selectedNodeId),sibling=siblingId?copy(realReady.nodes[siblingId]):null;
 const originals={job:realReady.stateData.rng.vassalSeed,node:realNode.stateData.rng.vassalSeed};
 const authoritative=runner.inspectRetainedStates(),payloadData=copy(w.message),nodeBefore=copy(realNode);
 try{realReady.stateData.rng.vassalSeed=-10;
  assert.equal(read({nodeId:selectedNodeId}).job.stateData.rng.vassalSeed,-10);
  assert.deepEqual(realNode,nodeBefore);assert.deepEqual(w.message,payloadData);assert.deepEqual(runner.inspectRetainedStates(),authoritative);
  realNode.stateData.rng.vassalSeed=-20;assert.equal(read({nodeId:selectedNodeId}).selectedNode.stateData.rng.vassalSeed,-20);
  if(siblingId)assert.deepEqual(realReady.nodes[siblingId],sibling);
 }finally{realReady.stateData.rng.vassalSeed=originals.job;realNode.stateData.rng.vassalSeed=originals.node;}
 // Mutate actual retained input payload, prove result/selected branch/runner isolation.
 const payloadSeed=w.message.stateData.rng.vassalSeed;
 try{w.message.stateData.rng.vassalSeed=-30;assert.equal(read().job.payload.stateData.rng.vassalSeed,-30);assert.deepEqual(read({nodeId:selectedNodeId}).selectedNode,retained.selectedNode);assert.deepEqual(read().job.stateData,retained.job.stateData);assert.deepEqual(runner.inspectRetainedStates(),authoritative);}finally{w.message.stateData.rng.vassalSeed=payloadSeed;}
 assert.deepEqual(read({nodeId:selectedNodeId}),retained);
 const oldTimeline=runner.getTimeline();oldTimeline.revision++;
 const stale=read({nodeId:selectedNodeId});assert.equal(stale.sourceMatches,false);assert.equal(stale.job.ready,true);assert.equal(stale.job.sourceReady,false);assert.equal(controller.commitResolution().reason,'resolutionNotReady');
 assert.deepEqual(read({nodeId:selectedNodeId}),stale,'no stale sync or termination');
 runner.resetToState(initial);const replaced=read({nodeId:selectedNodeId});assert.equal(replaced.timelineMatches,false);assert.equal(replaced.job.ready,true);
 assert.deepEqual(serializeGameState(initial),initialBefore);
 writeFileSync(`${output}/results.json`,JSON.stringify({pass:true,selectedNodeId,siblingId: siblingId??null,stale,sourceHashes:sources}));console.log(`[life-state] lexical purity, stale retention, full copies and real draft/payload/result/node isolation PASS; ${output}`);
}catch(error){writeFileSync(`${output}/failure.json`,JSON.stringify({message:error.message,stack:error.stack,actual:error.actual,expected:error.expected}));throw new Error(`Life inspection failed: ${error.message.split('\n')[0]}; ${output}/failure.json`);}
