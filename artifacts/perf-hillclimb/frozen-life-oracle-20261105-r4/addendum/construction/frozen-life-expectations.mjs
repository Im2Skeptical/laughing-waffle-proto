import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {sha256} from './frozen-life-oracle.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
export function assertExact(actual,expected,label='expected data'){
  assert.ok(isDeepStrictEqual(actual,expected),`${label}: strict full result differs; actual=${sha256(actual)} expected=${sha256(expected)}`);
}
export function assertExactState(actual,expected,{targetSec=expected.tSec,label='Life state'}={}){
  assert.ok(Number.isSafeInteger(targetSec)&&targetSec>=0,'exact integer target required');
  assert.equal(actual?.tSec,targetSec,`${label}: wrong actual target`);assert.equal(expected.tSec,targetSec,`${label}: wrong expected target`);
  assertExact(actual,expected,label);
}
export function assertFiveSlots(state){
  const sites=state.world.sites.filter(s=>s.detailedState);
  assert.ok(sites.length>0);for(const site of sites)assert.equal(site.detailedState.practiceSlots.length,5,`five slots ${site.regionId}`);
}
export function planningPause(oracle,logical){
  const before=JSON.stringify(logical);
  assertExact(oracle.serializeGameState(oracle.deserializeGameState(logical)),logical,'immutable logical roundtrip');
  const paused=oracle.serializeGameState(oracle.deserializeGameState({...copy(logical),paused:true}));
  assert.equal(paused.paused,true);assert.equal(paused.phase,'planning','frozen phase derivation');
  assertExact({...paused,paused:logical.paused,phase:logical.phase},logical,'pause changes only paused/phase; full RNG and knowledge');
  assert.equal(JSON.stringify(logical),before,'pause input purity');return paused;
}
function vassal(state){const lineage=state.civilization.vassalLineage;return lineage.vassalsById[lineage.currentVassalId];}

// All expected inputs originate in the pinned corpus. No actual/candidate
// state, current canStage, fixture generator or memoized full history is used.
export function createLifeExpectations(loaded,seed){
  const {oracle,extension}=loaded,fixtures=loaded.fixturesFor(seed),initial=fixtures.ordinary.state,trace=copy(fixtures.history.trace);
  const before=JSON.stringify(fixtures);
  assert.equal(trace.length,5);assert.ok(trace.every(a=>a.second===0),'this immutable itinerary begins at zero');
  const kinds=['SETTLEMENT_SELECT_VASSAL','VASSAL_ENTER_LIFE_NODE','VASSAL_SELECT_LIFE_OPTION','VASSAL_PURCHASE_SHOP_OFFER','VASSAL_CONFIRM_LIFE_NODE'];
  trace.forEach((action,i)=>assert.equal(action.kind,extension.ActionKinds[kinds[i]],'recorded action kind'));
  const nodeId=trace[1].payload.nodeId;for(const action of trace.slice(2))assert.equal(action.payload.nodeId,nodeId,'recorded node agreement');
  const targetSec=fixtures.history.seconds;assert.equal(targetSec,seed===99117?64:54,'recorded paid target');
  function replayPrefix(count,second=0){
    assert.ok(Number.isInteger(count)&&count>=0&&count<=trace.length);assert.ok(Number.isSafeInteger(second)&&second>=0);
    // A new ordinary state and a new empty timeline for EVERY call. Install
    // actions before the first rebuild; no retained confirm/checkpoint deletion.
    const timeline=oracle.createTimelineFromInitialState(oracle.deserializeGameState(copy(initial)));
    assert.equal(timeline.actions.length,0);assert.equal(timeline.checkpoints.length,0);assert.ok(!timeline.memoStateBySec);
    timeline.actions=copy(trace.slice(0,count));
    const result=oracle.rebuildStateAtSecond(timeline,second);assert.equal(result.ok,true,`frozen prefix${count} at${second}`);
    assertExact(timeline.actions,trace.slice(0,count),'recorded payloads preserved');
    const state=oracle.serializeGameState(result.state);assert.equal(state.tSec,second);assertFiveSlots(state);return state;
  }
  const logical=Object.fromEntries([0,1,2,3,4,5].map(n=>[n,replayPrefix(n)]));
  assertExactState(logical[0],initial,{label:'prefix0 ordinary'});
  assertExactState(logical[1],fixtures.selected.state,{label:'prefix1 selected'});
  assertExactState(logical[3],fixtures.shop.state,{label:'prefix3 shop'});
  const history=replayPrefix(5,targetSec);assertExactState(history,fixtures.history.state,{label:'prefix5 recorded history'});
  const nodeState=vassal(logical[3]).lifeMap.nodeStates[nodeId],offerId=trace[3].payload.offerId;
  const matches=nodeState.inventory.map((o,i)=>({o,i})).filter(({o})=>o.offerId===offerId);
  assert.equal(matches.length,1,'recorded offer must uniquely exist in frozen inventory');
  assert.equal(nodeState.selectedOptionId??nodeState.shopSelection?.selectedTag,trace[2].payload.optionId,'recorded shop category');
  const offer=copy(matches[0].o),offerIndex=matches[0].i;
  function direct(state,actions){
    const untouched=JSON.stringify(state),inputActions=JSON.stringify(actions),mutable=oracle.deserializeGameState(copy(state));
    for(const action of copy(actions))assert.equal(extension.applyAction(mutable,action,{isReplay:true}).ok,true,'captured direct action success');
    extension.canonicalizeSnapshot(mutable);
    const result=oracle.serializeGameState(mutable);assert.equal(JSON.stringify(state),untouched);assert.equal(JSON.stringify(actions),inputActions);assertFiveSlots(result);return result;
  }
  for(let n=1;n<=5;n++)assertExactState(direct(logical[0],trace.slice(0,n)),logical[n],{label:`direct versus fresh replay prefix${n}`});
  const enteredPaused=planningPause(oracle,logical[2]);
  const staged=direct(enteredPaused,trace.slice(2,4)),accepted=direct(enteredPaused,trace.slice(2,5));
  assertExactState(staged,planningPause(oracle,logical[4]),{label:'direct staged from paused entry versus independent prefix4'});
  assertExactState(accepted,planningPause(oracle,logical[5]),{label:'direct accepted batch versus independent prefix5'});
  const mutable=oracle.deserializeGameState(copy(accepted));mutable.paused=false;extension.canonicalizeSnapshot(mutable);
  const adopted=oracle.serializeGameState(mutable);assertExactState(adopted,logical[5],{label:'unpaused adopted accepted versus prefix5'});
  function presentation(state,{nodeId:explicitNode,preview}={}){
    assert.equal(typeof explicitNode,'string','explicit expected node required');assert.ok(preview&&typeof preview==='object','explicit hover/drag arguments required');
    const input=oracle.deserializeGameState(copy(state)),stateBefore=oracle.serializeGameState(input),argsBefore=JSON.stringify(preview),snapshotBefore=JSON.stringify(state);
    const dto=copy(extension.getVassalNodeDecisionPresentation(input,explicitNode,copy(preview)));
    assertExact(oracle.serializeGameState(input),stateBefore,'presentation input full-state/RNG purity');assert.equal(JSON.stringify(preview),argsBefore);assert.equal(JSON.stringify(state),snapshotBefore);
    return dto;
  }
  const presentationArgs={nodeId,preview:{previewOptionId:null,previewOfferId:null}};
  const stagedDecision=presentation(staged,presentationArgs);
  const logicalDecision=presentation(planningPause(oracle,replayPrefix(4)),presentationArgs);
  assertExact(stagedDecision,logicalDecision,'independently derived full staged DTO');
  const site=staged.world.sites.find(s=>s.regionId===vassal(staged).locationRegionId);
  assert.equal(stagedDecision.settlement.practices.length,5,'displayed five slots');
  assert.equal(stagedDecision.purchases.length,1);assert.equal(stagedDecision.purchases[0].offerId,offerId);
  assert.ok(!site.detailedState.practiceSlots.some(s=>s?.practiceId===offer.intervention.practiceId),'staged reservation not physically installed');
  assert.ok(stagedDecision.settlement.practices.some(s=>s?.practiceId===offer.intervention.practiceId&&s.staged&&s.offerId===offerId),'displayed tableau contains reservation');
  assert.equal(JSON.stringify(fixtures),before,'all immutable fixture inputs unchanged');
  return {seed,trace:copy(trace),nodeId,offerId,offerIndex,offer,category:copy(trace[2].payload),purchase:copy(trace[3].payload),confirm:copy(trace[4].payload),targetSec,
    logical,enteredPaused,staged,accepted,adopted,history,committed:planningPause(oracle,history),stagedDecision,presentationArgs,
    replayPrefix,presentation,direct};
}
