import assert from 'node:assert/strict';
import {createLifeExpectations,assertExactState,assertExact,planningPause} from './frozen-life-expectations.mjs';
import {expectedOpeningKnowledge} from './save-state-oracle.mjs';
import {createFrozenBrowserPresentation} from './life-state-presentation.mjs';

// Full reads happen first, after the original marker, before legacy geometry.
// Expected facts never consume candidate state/knowledge/presentation values.
export async function createMainLifeOracle({frozen,seed,page,browser,put}) {
  const e=createLifeExpectations(frozen,seed),terminals={};
  for(const n of [1,2,5])terminals[n]=expectedOpeningKnowledge(frozen.oracle,e.logical[n]);
  const captures={},triggers=[];
  let entryKnowledge=1;
  const derived=(state,year)=>{const copy=structuredClone(state);copy.persistentKnowledge.maxObservedCivilizationSurvivalYear=Math.max(copy.persistentKnowledge.maxObservedCivilizationSurvivalYear,year);return copy;};
  const provedYear=(s,prefix)=>{
    assert.equal(s.runner.actionCount,prefix);assert.equal(s.graph.projection.signatureMatches,true);
    assert.equal(s.graph.projection.timelineToken,s.graph.asyncToken);
    return s.graph.computedSec>=terminals[prefix].lossSec?terminals[prefix].lossYear:1;
  };
  const capture=async tag=>{
    const hostStart=performance.now();
    const actual=await page.evaluate(nodeId=>{
      if(__HC__.active)throw Error('Life inspection under latency clock');
      const startMs=performance.now(),before=__SETTLEMENT_DEBUG__.getTimingSnapshot({includeProjectionSource:true});
      const life=__SETTLEMENT_DEBUG__.inspectRetainedLifePreparation({nodeId});
      const decision=__SETTLEMENT_DEBUG__.inspectRetainedLifeDecision();
      const runner=__SETTLEMENT_DEBUG__.inspectRetainedStates();
      return {startMs,endMs:performance.now(),before,life,decision,runner,after:__SETTLEMENT_DEBUG__.getTimingSnapshot({includeProjectionSource:true})};
    },e.nodeId);
    const cost={hostRpcMs:performance.now()-hostStart,readerCpuMs:actual.endMs-actual.startMs};
    // Persist the untouched bodies even when any following comparison fails.
    await put(`${tag}-actual`,actual);await put(`${tag}-cost`,cost);captures[tag]=actual;
    assert.equal(actual.before.runner.revision,actual.after.runner.revision);
    assert.equal(actual.before.graph.asyncToken,actual.after.graph.asyncToken);
    return actual;
  };
  return {e,async check(tag,timing){
    const a=await capture(tag);
    let expected;
    if(tag==='entered'){
      const input=timing.inputTimingSnapshot;
      entryKnowledge=provedYear(input,1);
      triggers.push({kind:'entry-clone-source',input,worker:timing.workerEvents,
        expectedFact:terminals[1],knowledgeYear:entryKnowledge,
        cause:'entry payload clones current source before accepted; current-source full terminal coverage is independently checked, never actual knowledge copied'});
      expected=derived(e.enteredPaused,entryKnowledge);
    }else if(tag==='category')expected=derived(planningPause(frozen.oracle,e.logical[3]),entryKnowledge);
    else if(tag==='staged')expected=derived(e.staged,entryKnowledge);
    if(expected){
      await put(`${tag}-expected`,expected);await put('knowledge-clone-triggers',triggers);
      assert.equal(a.life.sourceMatches,true);assertExactState(a.life.draft.stateData,expected);
      const count=tag==='entered'?0:tag==='category'?1:2;
      assertExact(a.life.actions,e.trace.slice(2,2+count).map(({kind,payload})=>({kind,payload})),'complete pending actions');
      const realm=await createFrozenBrowserPresentation(browser,frozen,{record:put});
      try{
        await put(`${tag}-presentation-realm`,realm.identity);
        const dto=await realm.presentation(expected,e.presentationArgs);
        assertExact(a.decision.lastDecision,dto,'entire consumed rendered decision/tableau');
      }finally{await realm.close();}
    }else{
      const prefix=5,year=provedYear(a.before,prefix);
      const second=tag.startsWith('history-')?Number(tag.slice(8)):e.targetSec;
      expected=derived(planningPause(frozen.oracle,e.replayPrefix(5,second)),Math.max(entryKnowledge,year));
      await put(`${tag}-expected`,expected);
      assertExactState(a.runner.cursor.stateData,expected);
      assert.equal(a.runner.preview,null);assert.equal(a.runner.cursorIsFrontier,!tag.startsWith('history-'));
      assertExact(a.runner.timelineKnowledge,expected.persistentKnowledge,'complete timeline knowledge');
      assert.equal(a.life.job,null);
    }
    return {fullState:true,fullRng:true,fullDecision:!!a.life.draft,pendingActions:true,tag,costArtifact:`${tag}-cost`};
  }};
}
