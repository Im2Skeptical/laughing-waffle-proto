import assert from 'node:assert/strict';
import { selectedState } from '../src/model/tests/vassal-life-map/helpers.js';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getCurrentLifeMapVassal, getVassalNodeDecisionPresentation } from '../src/model/vassal-life-map.js';
import { prepareLifeChoices, runLifeDecisionJob } from '../src/model/vassal-life-map/decision-preparation.js';
import { createLifeDecisionController } from '../src/controllers/life-decision-controller.js';
import { createTimelineFromInitialState, appendActionAtCursor, replaceActionsAtSecond, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { getForecastRevealFollowTargetEndSec } from '../src/views/timegraphs/forecast-reveal-state.js';
const initial=selectedState(1);
const snapshot=serializeGameState(initial);
const previews=await prepareLifeChoices(snapshot);
assert.deepEqual(serializeGameState(initial),snapshot,'preparation must not spend resources or advance authoritative RNG');
const nodeId=Object.keys(previews)[0]; assert.ok(nodeId,'prepare reachable nodes');
const entered=deserializeGameState(previews[nodeId].stateData);
const decision=getVassalNodeDecisionPresentation(entered,nodeId);
const optionId=decision.nodeState.options.find(o=>o.enabled!==false)?.id;
assert.ok(optionId,'fixture has an option');
const actions=[...previews[nodeId].actions,
  {kind:ActionKinds.VASSAL_SELECT_LIFE_OPTION,payload:{nodeId,optionId}},
  {kind:ActionKinds.VASSAL_CONFIRM_LIFE_NODE,payload:{nodeId}}];
const messages=[];
await runLifeDecisionJob({stateData:snapshot,actions},m=>messages.push(m));
const accepted=messages.find(m=>m.kind==='accepted');
const ready=messages.find(m=>m.kind==='ready');
assert.ok(accepted&&ready,'background transaction completes');
const timeline=createTimelineFromInitialState(initial);
for(const action of actions) assert.equal(appendActionAtCursor(timeline,{...action,tSec:0},initial).ok,true);
const replay=rebuildStateAtSecond(timeline,ready.stateData.tSec);
assert.equal(replay.ok,true);
assert.deepEqual(ready.stateData.civilization,serializeGameState(replay.state).civilization,'resolution matches authoritative replay');
assert.deepEqual(ready.stateData.rng,serializeGameState(replay.state).rng,'RNG matches replay');
// Draft changes never write the authoritative state or timeline.
let current=entered; const tl={revision:1,historyEndSec:0}; let lastWorker;
const runner={getTimeline:()=>tl,dispatchPreparedActionsAtCurrentSecond(batch,state,expected){
  assert.equal(expected.revision,tl.revision); tl.revision++; current=deserializeGameState(state); return {ok:true};
}};
const controller=createLifeDecisionController({getRunner:()=>runner,getState:()=>current,
  createWorker:()=>lastWorker={terminate(){},postMessage(message){this.message=message;}}});
const before=serializeGameState(current);
assert.equal(controller.dispatch(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId},{},()=>{}).ok,true);
assert.deepEqual(serializeGameState(current),before);
assert.equal(tl.revision,1);
assert.equal(controller.getPresentation(nodeId).nodeState.selectedOptionId,optionId);
assert.equal(controller.dispatch(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId},{},()=>{}).pending,true);
assert.equal(controller.dispatch(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId},{},()=>{}).ok,false,'duplicate submit blocked');
const request=lastWorker.message;
lastWorker.onmessage({data:{requestId:request.requestId,kind:'error',reason:'test failure'}});
controller.retry();
assert.deepEqual(lastWorker.message.actions,request.actions,'retry retains draft exactly once');
const active=lastWorker;
await runLifeDecisionJob(active.message,m=>active.onmessage({data:{...m,requestId:active.message.requestId}}));
assert.equal(tl.revision,2,'accepted batch recorded once');
assert.equal(controller.getResolution().ready,true);
assert.equal(controller.getReadinessCap(),null);
// Stale results cannot modify a replacement timeline.
const stale=lastWorker; tl.revision++;
stale.onmessage({data:{kind:'accepted',requestId:request.requestId,stateData:accepted.stateData}});
assert.equal(tl.revision,3);
assert.equal(getForecastRevealFollowTargetEndSec({capEndSec:100,readinessCapSec:99},100,0,98),99);
assert.equal(getForecastRevealFollowTargetEndSec({capEndSec:100,readinessCapSec:null},100,0,98),100);
console.log('[life-decision] isolated preloading, replay, local drafts, retry, duplicate/stale guards, reveal readiness OK');
import { createSimRunner } from '../src/controllers/sim-runner.js';
// A phone that cannot start module workers must still be able to enter its
// first node. Preparation failure must not strand an otherwise fresh run.
const unavailableRunner = createSimRunner({setupId:'devPlaytesting01'});
unavailableRunner.resetToState(initial);
const unavailableController = createLifeDecisionController({
  getRunner:()=>unavailableRunner, getState:()=>unavailableRunner.getState(),
  createWorker:()=>{throw new Error('module workers unavailable');},
});
async function waitForDecision(test, message) {
  const deadline = Date.now() + 3000;
  while (!test() && Date.now() < deadline) await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(test(), message);
}
assert.equal(unavailableController.dispatch(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId},{},()=>{}).pending,true);
await waitForDecision(()=>unavailableController.getStatus()===null,'worker fallback completes first entry');
assert.equal(unavailableController.getStatus(),null,'first node must recover from worker startup failure');
assert.equal(getCurrentLifeMapVassal(unavailableRunner.getState()).lifeMap.currentNodeId,nodeId);
assert.equal(unavailableRunner.getTimeline().actions.length,1,'entry is accepted exactly once');
for (const failure of ['workerError','messageError','postMessage','silent']) {
  const fallbackRunner=createSimRunner({setupId:'devPlaytesting01'});
  fallbackRunner.resetToState(initial);
  let failedWorker, terminated=false, acceptCount=0;
  const fallbackController=createLifeDecisionController({
    getRunner:()=>fallbackRunner,getState:()=>fallbackRunner.getState(),workerTimeoutMs:failure==='silent'?1:15000,
    createWorker:()=>failedWorker={terminate(){terminated=true;},postMessage(message){
      this.message=message;
      if(failure==='postMessage')throw new Error('cannot send snapshot');
    }},
  });
  fallbackController.dispatch(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId},{},()=>{acceptCount++;});
  const failedRequest=failedWorker.message;
  const processing=fallbackController.overlay({readOnly:false,viewedSec:0,frontierSec:0});
  assert.equal(processing.readOnly,true);
  assert.ok(processing.decisionProcessing,'processing is distinct from historical read-only browsing');
  if(failure==='workerError')failedWorker.onerror({preventDefault(){}});
  if(failure==='messageError')failedWorker.onmessageerror();
  await waitForDecision(()=>fallbackController.getStatus()===null,`${failure} fallback completes`);
  assert.equal(terminated,true);
  assert.equal(acceptCount,1);
  assert.equal(fallbackRunner.getTimeline().actions.length,1);
  const fallbackState=serializeGameState(fallbackRunner.getState());
  assert.ok(JSON.stringify(fallbackState.civilization)===JSON.stringify(previews[nodeId].stateData.civilization),
    `${failure} fallback uses the exact isolated worker transaction`);
  assert.deepEqual(fallbackState.rng,previews[nodeId].stateData.rng);
  failedWorker.onmessage({data:{kind:'accepted',requestId:failedRequest.requestId,stateData:previews[nodeId].stateData}});
  assert.equal(fallbackRunner.getTimeline().actions.length,1,'late failed-worker output cannot duplicate entry');
}
// A worker can fail after it has already accepted and charged a decision.
const partialRunner=createSimRunner({setupId:'devPlaytesting01'});
partialRunner.resetToState(entered);
let partialWorker, partialAccepts=0;
const partialController=createLifeDecisionController({
  getRunner:()=>partialRunner,getState:()=>partialRunner.getState(),
  createWorker:()=>partialWorker={terminate(){},postMessage(message){this.message=message;}},
});
partialController.dispatch(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId});
partialController.dispatch(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId},{},()=>{partialAccepts++;});
const partialRequest=partialWorker.message;
const partialMessages=[];
await runLifeDecisionJob(partialRequest,message=>partialMessages.push(message));
partialWorker.onmessage({data:{...partialMessages[0],requestId:partialRequest.requestId}});
const paidCount=partialRunner.getTimeline().actions.length;
partialWorker.onerror();
await waitForDecision(()=>partialController.getResolution()?.ready,'accepted transaction resolves through fallback');
assert.equal(partialRunner.getTimeline().actions.length,paidCount,'fallback never charges accepted actions twice');
assert.equal(partialAccepts,1);
assert.equal(partialController.commitResolution().ok,true);
assert.deepEqual(serializeGameState(partialRunner.getState()).civilization,ready.stateData.civilization);
assert.deepEqual(serializeGameState(partialRunner.getState()).rng,ready.stateData.rng);
// Replacing the run before the first local yield cancels the obsolete work.
const cancelledRunner=createSimRunner({setupId:'devPlaytesting01'});
cancelledRunner.resetToState(initial);
const cancelledController=createLifeDecisionController({getRunner:()=>cancelledRunner,getState:()=>cancelledRunner.getState(),
  createWorker:()=>{throw new Error('unavailable');}});
cancelledController.dispatch(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId});
cancelledRunner.resetToState(initial);
await waitForDecision(()=>cancelledController.getStatus()===null,'replacement run clears obsolete preparation');
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(cancelledRunner.getTimeline().actions.length,0);
assert.equal(getCurrentLifeMapVassal(cancelledRunner.getState()).lifeMap.currentNodeId,null);
console.log('[life-decision] failed/silent workers recover first entry and accepted resolution without duplicate charges; stale local work cancelled OK');
const realRunner=createSimRunner({setupId:'devPlaytesting01'});
realRunner.resetToState(initial);
const actualTimeline=realRunner.getTimeline();
const expected={timeline:actualTimeline,revision:actualTimeline.revision,sec:0};
assert.equal(realRunner.dispatchPreparedActionsAtCurrentSecond(actions,accepted.stateData,expected).ok,true);
assert.equal(realRunner.dispatchPreparedActionsAtCurrentSecond(actions,accepted.stateData,expected).reason,'staleDecision');
const fresh=createTimelineFromInitialState(deserializeGameState(actualTimeline.baseStateData));
for(const action of actualTimeline.actions) appendActionAtCursor(fresh,action,initial);
assert.deepEqual(serializeGameState(rebuildStateAtSecond(fresh,0).state).civilization,
  serializeGameState(realRunner.getState()).civilization,'adopted state matches replay without seeded caches');
assert.equal(realRunner.commitCursorSecond(ready.stateData.tSec,ready.stateData).ok,true);
assert.deepEqual(serializeGameState(realRunner.getState()).civilization,ready.stateData.civilization);
console.log('[life-decision] runner atomic adoption and stale guard OK');
import { createSettlementPlayback } from '../src/views/ui-root/settlement-playback.js';
const historicalPlayback = createSettlementPlayback({getRunner:()=>realRunner,
  getGraphController:()=>({getStateAt:sec=>rebuildStateAtSecond(actualTimeline,sec).state})});
assert.equal(historicalPlayback.getSettlementFrontierState().tSec,ready.stateData.tSec);
realRunner.browseCursorSecond(0);
assert.equal(historicalPlayback.getSettlementFrontierState().tSec,ready.stateData.tSec,
  'browsing history must not turn the cached frontier into an old pending resolution');
const historicalRecovery=createLifeDecisionController({getRunner:()=>realRunner,
  getState:()=>historicalPlayback.getSettlementFrontierState(),
  createWorker:()=>{throw new Error('history must not restart a resolved transaction');}});
assert.equal(historicalRecovery.resumePendingResolution(),false);
console.log('[life-decision] historical browsing preserves the resolved frontier OK');
import { readFileSync } from 'node:fs';
const settlementRoot = readFileSync(new URL('../src/views/ui-root-settlement-pixi.js', import.meta.url), 'utf8');
assert.match(settlementRoot, /commitCursorSecond: \(tSec, stateData\) => runner\.commitCursorSecond\?\.\(tSec, stateData\)/);
assert.match(settlementRoot, /browseCursorSecond: \(tSec\) => runner\.browseCursorSecond\?\.\(tSec\)/);
import { forceEnter, nodeIdForFamily } from '../src/model/tests/vassal-life-map/helpers.js';
const shop=selectedState(102);
const patron=getCurrentLifeMapVassal(shop); patron.prestige=500;
const shopNode=forceEnter(shop,nodeIdForFamily(shop,'practiceReform'));
const shopBase=serializeGameState(shop);
const shopChoices=await prepareLifeChoices(shopBase);
const cachedReroll=shopChoices[shopNode.nodeId].reroll;
assert.ok(cachedReroll,'legal paid reroll is prepared');
assert.deepEqual(shopChoices[shopNode.nodeId].presentation.nodeState,shopNode,
  'preparing a reroll must not mutate the original shop presentation');
assert.deepEqual(serializeGameState(shop),shopBase,'paid reroll preview spends nothing');
const rerolled=deserializeGameState(shopBase);
assert.equal(applyAction(rerolled,cachedReroll.actions[0],{isReplay:true}).ok,true);
assert.deepEqual(serializeGameState(rerolled),cachedReroll.stateData,'cached reroll matches exact paid transaction');
const shopActions=[{kind:ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,payload:{nodeId:shopNode.nodeId,offerId:shopNode.inventory[0].offerId}},
 {kind:ActionKinds.VASSAL_CONFIRM_LIFE_NODE,payload:{nodeId:shopNode.nodeId}}];
const shopMessages=[];
await runLifeDecisionJob({stateData:shopBase,actions:shopActions},m=>shopMessages.push(m));
const shopReady=shopMessages.find(m=>m.kind==='ready');
const shopTimeline=createTimelineFromInitialState(shop);
for(const action of shopActions) appendActionAtCursor(shopTimeline,{...action,tSec:0},shop);
const shopReplay=serializeGameState(rebuildStateAtSecond(shopTimeline,shopReady.stateData.tSec).state);
assert.deepEqual(shopReady.stateData.world,shopReplay.world,'committed shop settlement effects match replay');
assert.deepEqual(shopReady.stateData.civilization,shopReplay.civilization);
assert.deepEqual(shopReady.stateData.rng,shopReplay.rng);
console.log('[life-decision] paid reroll isolation and shop resolution replay OK');
import { createSettlementForecastController } from '../src/controllers/settlement-forecast-controller.js';
let revealed=ready.stateData.tSec, commits=0;
const preparedResolution={ready:false,targetSec:revealed,revealSec:revealed,stateData:ready.stateData};
const forecast=createSettlementForecastController({getPreparedResolution:()=>preparedResolution,
 getFrontierSec:()=>0,getRevealedCoverageEndSec:()=>revealed,
 commitPreparedResolution:()=>{commits++;return {ok:true};}});
forecast.processPendingCommit();
assert.equal(commits,0,'even a complete reveal cannot commit unprepared interactions');
preparedResolution.ready=true; revealed--;
forecast.processPendingCommit(); assert.equal(commits,0,'ready result waits for the reveal');
revealed++;
forecast.processPendingCommit(); assert.equal(commits,1,'both readiness and reveal release the resolution');
// Recovery of an accepted transaction performs no actions and cannot charge again.
let recoveryWorker;
const recovery=createLifeDecisionController({getRunner:()=>realRunner,
 getState:()=>deserializeGameState(accepted.stateData),
 createWorker:()=>recoveryWorker={terminate(){},postMessage(message){this.message=message;}}});
realRunner.resetToState(deserializeGameState(accepted.stateData));
assert.equal(recovery.resumePendingResolution(),true);
assert.equal(recovery.resumePendingResolution(),false,'only one recovery job');
const recoveryRequest=recoveryWorker.message;
recoveryWorker.onmessage({data:{kind:'error',reason:'interrupted',requestId:recoveryRequest.requestId}});
recovery.retry();
assert.deepEqual(recoveryWorker.message.actions,[],'retry of accepted resolution does not charge again');
const recovering=recoveryWorker;
await runLifeDecisionJob(recovering.message,m=>recovering.onmessage({data:{...m,requestId:recovering.message.requestId}}));
assert.equal(recovery.getResolution().ready,true);
assert.equal(recovery.commitResolution().ok,true);
assert.deepEqual(serializeGameState(realRunner.getState()).civilization,ready.stateData.civilization);
console.log('[life-decision] commit readiness and accepted-transaction recovery OK');
// Prepared UI assets must finish before the graph is allowed to finish.
let finishUi;
const uiReady=new Promise(resolve=>{finishUi=resolve;});
let assetWorker;
realRunner.resetToState(deserializeGameState(accepted.stateData));
const assetController=createLifeDecisionController({getRunner:()=>realRunner,getState:()=>realRunner.getState(),
 onPrepare:()=>uiReady,createWorker:()=>assetWorker={terminate(){},postMessage(message){this.message=message;}}});
assetController.resumePendingResolution();
const assetRequest=assetWorker.message;
await runLifeDecisionJob(assetRequest,m=>assetWorker.onmessage({data:{...m,requestId:assetRequest.requestId}}));
assert.equal(assetController.getResolution().ready,undefined,'worker completion waits for prepared UI assets');
assert.ok(assetController.getReadinessCap()<ready.stateData.tSec);
finishUi(); await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(assetController.getResolution().ready,true);
assert.equal(assetController.commitResolution().ok,true);
// A prepared node is usable immediately after resolution, without another worker.
const nextNode=Object.keys(ready.nodes)[0];
if (nextNode) {
 const beforeCount=realRunner.getTimeline().actions.length;
 const result=assetController.dispatch(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId:nextNode},{},()=>{});
 assert.equal(result.ok,true); assert.notEqual(result.pending,true);
 assert.equal(realRunner.getTimeline().actions.length,beforeCount+1);
 assert.deepEqual(getCurrentLifeMapVassal(realRunner.getState()).lifeMap.nodeStates[nextNode],ready.nodes[nextNode].presentation.nodeState);
}
// Worker prepared current shops retain the original presentation and offer instant paid rerolls.
realRunner.resetToState(shop);
let shopWorker;
const shopController=createLifeDecisionController({getRunner:()=>realRunner,getState:()=>realRunner.getState(),
 createWorker:()=>shopWorker={terminate(){},postMessage(message){this.message=message;}}});
const directReroll=shopController.dispatch(ActionKinds.VASSAL_REROLL_SHOP,{nodeId:shopNode.nodeId},{},()=>{});
assert.equal(directReroll.pending,true);
const rerollRequest=shopWorker.message;
await runLifeDecisionJob(rerollRequest,m=>shopWorker.onmessage({data:{...m,requestId:rerollRequest.requestId}}));
assert.equal(shopController.getStatus(),null);
assert.deepEqual(shopController.getPresentation(shopNode.nodeId).nodeState,
 getCurrentLifeMapVassal(realRunner.getState()).lifeMap.nodeStates[shopNode.nodeId]);
console.log('[life-decision] UI readiness and prepared next-node adoption OK');
// Development entry and its pre-entry panel must both be prepared from the
// unchanged frontier, with graphics readiness included in the commit gate.
const development=selectedState(1);
const developmentId=nodeIdForFamily(development,'development');
getCurrentLifeMapVassal(development).lifeMap.availableNodeIds=[developmentId];
const developmentBase=serializeGameState(development);
const developmentChoices=await prepareLifeChoices(developmentBase);
assert.equal(developmentChoices[developmentId].entryPresentation.nodeState,null);
assert.equal(developmentChoices[developmentId].presentation.nodeState.family,'development');
assert.deepEqual(serializeGameState(development),developmentBase);
realRunner.resetToState(deserializeGameState(accepted.stateData));
let finishChoices, choicesWorker;
const choicesReady=new Promise(resolve=>{finishChoices=resolve;});
const choicesController=createLifeDecisionController({getRunner:()=>realRunner,getState:()=>realRunner.getState(),
  onPrepareChoices:nodes=>{assert.ok(Object.keys(nodes).length);return choicesReady;},
  createWorker:()=>choicesWorker={terminate(){},postMessage(message){this.message=message;}}});
choicesController.resumePendingResolution();
await runLifeDecisionJob(choicesWorker.message,m=>choicesWorker.onmessage({data:{...m,requestId:choicesWorker.message.requestId}}));
await new Promise(resolve=>setTimeout(resolve,0));
assert.notEqual(choicesController.getResolution().ready,true,'next-node graphics must finish before reveal completion');
finishChoices(); await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(choicesController.getResolution().ready,true);
console.log('[life-decision] Development entry and next-node graphics readiness OK');
import { createTimeGraphController } from '../src/model/timegraph/controller-core.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { GRAPH_METRICS } from '../src/model/graph-metrics.js';
let graphTimeline=createTimelineFromInitialState(deserializeGameState(accepted.stateData));
let graphState=deserializeGameState(accepted.stateData);
const graphProjection=createProjectionCache();
const replayHistoricalState=graphProjection.ensureStateAtSecond;
const graphController=createTimeGraphController({getTimeline:()=>graphTimeline,getCursorState:()=>graphState,
 metric:GRAPH_METRICS.civilization,projectionCache:graphProjection,horizonSec:8,
 forecastWorkerService:{requestCoverage:()=>({ok:true}),handleTimelineInvalidation(){}}});
assert.equal(graphController.ensureCache().ok,true);
const summaries=new Map(messages.filter(m=>m.kind==='chunk').flatMap(m=>m.chunk.summaryBySecond));
graphTimeline.historyEndSec=ready.stateData.tSec;
graphState=deserializeGameState(ready.stateData);
graphProjection.ensureStateAtSecond=()=>{throw new Error('prepared graph history must not run synchronous replay');};
graphController.retainAuthoritativeSummariesFrom(0,summaries);
const firstPaint=graphController.getSamplesForWindow({startSec:0,endSec:graphTimeline.historyEndSec});
assert.ok(firstPaint.points.length,'the recap first paint must use summaries before deferred geometry refresh');
assert.equal(graphController.refreshAuthoritativeRangeFrom(0,{summaries}).ok,true);
const history=graphController.getData().cache.history;
for(const sample of history) {
 const expected=summaries.get(sample.tSec)?.graphValues.civilization;
 if(expected) for(const [key,value] of Object.entries(sample.values)) assert.equal(value,expected[key]);
}
console.log('[life-decision] prepared tick summaries promote graph history without replay OK');
// Plotting uses a different sample grid from cache.history, including dense
// edges, and invalidates derived values when the series/window changes.
const plotted=graphController.getSamplesForWindow({startSec:0,endSec:graphTimeline.historyEndSec});
assert.ok(plotted.points.length > 0);
graphController.invalidateSeries();
graphController.setHorizonSecOverride(16);
const replotted=graphController.getSamplesForWindow({startSec:1,endSec:graphTimeline.historyEndSec,focus:true});
assert.ok(replotted.points.length > 0);
for(const sample of [...firstPaint.points,...plotted.points,...replotted.points]) {
 const expected=summaries.get(sample.tSec)?.graphValues.civilization;
 assert.ok(expected,`authoritative summary exists at ${sample.tSec}`);
 for(const [key,value] of Object.entries(sample.values)) assert.equal(value,expected[key]);
}
const scopedSubject={regionId:Object.keys(summaries.get(1).graphValues.settlementByRegion)[0]};
graphController.setMetric(GRAPH_METRICS.settlement);
graphController.setSubject(scopedSubject,'first-settlement');
const scoped=graphController.getSamplesForWindow({startSec:1,endSec:graphTimeline.historyEndSec});
assert.ok(scoped.points.length);
for(const sample of scoped.points) for(const series of graphController.getData().series) {
 assert.equal(sample.values[series.id],series.getValueFromSummary(summaries.get(sample.tSec),scopedSubject));
}
console.log('[life-decision] actual history plotting reuses prepared summaries across sample/series/window changes OK');
const coldProjection=createProjectionCache();
const coldReplay=coldProjection.ensureStateAtSecond;
let coldReads=0;
coldProjection.ensureStateAtSecond=(...args)=>{coldReads++;return coldReplay(...args);};
const loadedGraph=createTimeGraphController({getTimeline:()=>graphTimeline,getCursorState:()=>graphState,
 metric:GRAPH_METRICS.civilization,projectionCache:coldProjection,horizonSec:8,
 forecastWorkerService:{requestCoverage:()=>({ok:true}),handleTimelineInvalidation(){}}});
loadedGraph.ensureCache();
const coldPoints=loadedGraph.getSamplesForWindow({startSec:0,endSec:3}).points;
assert.ok(coldReads>0,'a loaded timeline initially needs authoritative historical samples');
for(const point of coldPoints) for(const [key,value] of Object.entries(point.values)) {
 assert.equal(value,summaries.get(point.tSec).graphValues.civilization[key]);
}
const readsAfterLoad=coldReads;
loadedGraph.invalidateSeries();
loadedGraph.getSamplesForWindow({startSec:0,endSec:3});
loadedGraph.setMetric(GRAPH_METRICS.settlement);
loadedGraph.setSubject(scopedSubject,'loaded-first-settlement');
const loadedScope=loadedGraph.getSamplesForWindow({startSec:0,endSec:3}).points;
assert.equal(coldReads,readsAfterLoad,'older loaded history must not replay again for another series/scope');
for(const point of loadedScope) for(const series of loadedGraph.getData().series) {
 assert.equal(point.values[series.id],series.getValueFromSummary(summaries.get(point.tSec),scopedSubject));
}
assert.equal(coldPoints.length,loadedScope.length);
console.log('[life-decision] loaded-save history is sampled once and reused across series/scope changes OK');
let historicalReplays=0;
graphProjection.ensureStateAtSecond=(...args)=>{historicalReplays++;return replayHistoricalState(...args);};
graphController.setMetric({id:'state-only-test',series:[{id:'clock',getValue:state=>state.tSec}]});
const stateOnly=graphController.getSamplesForWindow({startSec:1,endSec:3,focus:true});
assert.ok(historicalReplays>0,'unsupported summary series retain authoritative replay fallback');
for(const point of stateOnly.points) assert.equal(point.values.clock,point.tSec);
// Multiple edits before the next draw invalidate from the earliest changed
// action, while checkpoint churn alone leaves exact summaries intact.
graphTimeline.revision++;
assert.equal(graphController.getSummaryAt(1,{cachedOnly:true}),summaries.get(1));
replaceActionsAtSecond(graphTimeline,2,[],{truncateFuture:false});
appendActionAtCursor(graphTimeline,{kind:'test-noop'},{tSec:2});
appendActionAtCursor(graphTimeline,{kind:'test-noop'},{tSec:4});
assert.equal(graphController.getSummaryAt(1,{cachedOnly:true}),summaries.get(1));
assert.equal(graphController.getSummaryAt(2,{cachedOnly:true}),null);
assert.equal(graphController.getSummaryAt(4,{cachedOnly:true}),null);
graphController.retainAuthoritativeSummariesFrom(0,summaries);
graphTimeline.historyEndSec=2;
assert.equal(graphController.getSummaryAt(1,{cachedOnly:true}),summaries.get(1));
assert.equal(graphController.getSummaryAt(3,{cachedOnly:true}),null,'rewinding drops the old future');
graphTimeline=createTimelineFromInitialState(graphState);
assert.equal(graphController.getSummaryAt(1,{cachedOnly:true}),null,'a replacement run cannot reuse previous history');
console.log('[life-decision] historical summaries invalidate on action edits and timeline replacement, not checkpoints OK');
const completePending=deserializeGameState(accepted.stateData);
completePending.runStatus={complete:true,tSec:completePending.tSec};
realRunner.resetToState(completePending);
const terminalController=createLifeDecisionController({getRunner:()=>realRunner,getState:()=>realRunner.getState(),
 createWorker:()=>{throw new Error('terminal runs must not restart resolution');}});
assert.equal(terminalController.resumePendingResolution(),false);
assert.equal(terminalController.getStatus(),null);
