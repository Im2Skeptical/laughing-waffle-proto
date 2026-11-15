import assert from 'node:assert/strict';
import {assertExactState,assertExact,planningPause} from './frozen-life-expectations.mjs';
export async function checkLifeState({e,frozen,evidence,entered,category,staged,committed,present,histories,cell,terminals,put=async()=>{}}){
   // Knowledge is independently derived from frozen official ticks. The actual
   // callback/action prefix/source trigger determines when that fact can apply.
   for(const k of evidence.knowledge){const count=k.actions.length;assert.ok([1,2,5].includes(count));assertExact(k.actions,e.trace.slice(0,count).map(({second,kind,payload})=>({kind,payload,tSec:second})),'knowledge trigger exact recorded actions');const fact=terminals[count];assert.equal(k.year,fact.lossYear);assert.ok(k.timing.graph.computedSec>=fact.lossSec);assert.equal(k.timing.graph.projection.signatureMatches,true);assert.equal(k.timing.graph.projection.timelineToken,k.timing.graph.asyncToken);}
   const knowledgeAt=ms=>Math.max(1,...evidence.knowledge.filter(k=>k.endMs<=ms).map(k=>terminals[k.actions.length].lossYear));
   const withKnowledge=(state,ms)=>{const x=structuredClone(state);x.persistentKnowledge.maxObservedCivilizationSurvivalYear=Math.max(x.persistentKnowledge.maxObservedCivilizationSurvivalYear,knowledgeAt(ms));return x;};
   const submitted=evidence.events.filter(x=>x.kind==='submitted'),entrySubmitted=submitted[0],confirmSubmitted=submitted[1];assert.equal(submitted.length,2);
   const entryMs=entrySubmitted.startMs,confirmMs=confirmSubmitted.startMs;
   await put('permitted-derivations',{knowledge:evidence.knowledge.map(k=>({actions:k.actions,year:terminals[k.actions.length].lossYear,lossSec:terminals[k.actions.length].lossSec,startMs:k.startMs,endMs:k.endMs,timing:k.timing})),entryCloneMs:entryMs,confirmCloneMs:confirmMs});
   assertExactState(entered.life.draft.stateData,withKnowledge(e.enteredPaused,entryMs));assertExactState(category.life.draft.stateData,withKnowledge(planningPause(frozen.oracle,e.logical[3]),entryMs));assertExactState(staged.life.draft.stateData,withKnowledge(e.staged,entryMs));
   for(const [actual,base]of [[entered,e.enteredPaused],[category,planningPause(frozen.oracle,e.logical[3])]]){
     assert.equal(actual.decision.openNodeId,e.nodeId);
     assertExact(actual.decision.lastDecision,e.presentation(withKnowledge(base,entryMs),{nodeId:e.nodeId,preview:{previewOptionId:null,previewOfferId:null}}),'full entered/category rendered DTO');
   }
   assertExact(staged.life.actions,e.trace.slice(2,4).map(({kind,payload})=>({kind,payload})),'exact pending draft actions');
   const decisionExpected=e.presentation(withKnowledge(e.staged,entryMs),{nodeId:e.nodeId,preview:{previewOptionId:null,previewOfferId:null}});assertExact(staged.decision.lastDecision,decisionExpected,'full actual consumed decision/tableau');assert.equal(staged.decision.dragPreview,null);
   for(const event of evidence.events){assert.equal(event.pure,true);if(event.kind==='accepted-adopted'&&event.life.job.targetSec>0){assertExactState(event.life.job.payload.stateData,withKnowledge(e.enteredPaused,confirmMs));assertExactState(event.life.job.stateData,withKnowledge(e.accepted,confirmMs));assertExactState(event.runner.cursor.stateData,withKnowledge(e.adopted,event.startMs));}
    if(event.kind==='ready'){
      const final=event.life.job.targetSec>0,base=withKnowledge(final?e.history:e.enteredPaused,final?confirmMs:entryMs);
      assertExactState(event.life.job.stateData,base);
      const id=event.life.selectedNodeId,node=event.life.selectedNode;assert.ok(node,'explicit retained prepared node');
      const actions=final?[{kind:frozen.extension.ActionKinds.VASSAL_ENTER_LIFE_NODE,payload:{nodeId:id}}]:[];
      const expectedNode=final?e.direct(base,actions):base;
      assertExact(node.actions,actions);assertExactState(node.stateData,expectedNode);
      assertExact(node.presentation,e.presentation(expectedNode,{nodeId:id,preview:{previewOptionId:null,previewOfferId:null}}));
      assertExact(node.entryPresentation,final?e.presentation(base,{nodeId:id,preview:{previewOptionId:null,previewOfferId:null}}):null);
    }}
   assert.ok(evidence.events.some(x=>x.kind==='ready'&&x.life.job.targetSec===e.targetSec));
   for(const a of [committed,present]){assertExactState(a.runner.cursor.stateData,withKnowledge(e.committed,a.startMs));assert.equal(a.life.job,null);assert.equal(a.runner.cursorIsFrontier,true);}
   for(const {second,actual}of histories){assert.equal(actual.runner.preview,null);assert.equal(actual.runner.cursorIsFrontier,false);assertExactState(actual.runner.cursor.stateData,withKnowledge(planningPause(frozen.oracle,e.replayPrefix(5,second)),actual.startMs));}
   const oldBefore=evidence.events.find(x=>x.kind==='old-message-before'),oldAfter=evidence.events.find(x=>x.kind==='old-message-after');assert.ok(evidence.messagesTested);assert.equal(oldAfter.extra.changedDelta,0);assertExact(oldBefore.life,oldAfter.life,'old Life envelope preserves complete pending body');assertExact(oldBefore.runner,oldAfter.runner);assertExact(oldBefore.timeline,oldAfter.timeline);assert.ok(evidence.gateRejections.length>=4);
   const stale=evidence.staleCommit;assert.equal(stale.retainedReady,true);assert.equal(stale.sourceMatches,false);const zeroCall=()=>{assert.equal(stale.commitCalls,0,'direct stale attempt must make ZERO runner commit calls');};
   if(cell.mode==='guard-twin'){assert.throws(zeroCall);assert.ok(stale.commitCalls>0);}else{zeroCall();assert.equal(stale.result.reason,'resolutionNotReady');assert.equal(stale.changedDelta,0);assert.equal(stale.before,stale.after);}
   if(cell.mode==='mutation'){const m=evidence.draftMutation;assert.ok(m);assert.throws(()=>assertExactState(m.mutant.draft.stateData,withKnowledge(e.staged,entryMs)));assertExact(m.original,m.restored);assert.equal(m.backingBefore,m.backingDuring,'actual draft mutation leaves authoritative/cached-node/payload backing unchanged');}

}
