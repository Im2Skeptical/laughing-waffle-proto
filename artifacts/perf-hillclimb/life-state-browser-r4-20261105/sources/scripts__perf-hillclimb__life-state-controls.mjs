import assert from 'node:assert/strict';
import {sha256} from './frozen-life-oracle.mjs';
export const token='life-state-response-only-v1';
export function lifeStateResponse(original,{removeSourceGuard=false}={}){
 const start=original.indexOf('function createLifeDecisionController('),end=original.indexOf('\n// src/',start);
 assert.ok(start>=0&&end>start);const source=original.slice(start,end);let text=source;const seams=[];
 function replace(before,after){assert.equal(text.split(before).length,2,`unique Life seam ${before.slice(0,90)}`);text=text.replace(before,after);seams.push({before,after});}
 const inspectStart='    inspectRetainedPreparation({ nodeId = null } = {}) {',inspectEnd='    // Unlike getStatus';
 const a=text.indexOf(inspectStart),b=text.indexOf(inspectEnd,a);assert.ok(a>=0&&b>a);
 const inspect=text.slice(a,b);assert.ok(inspect.endsWith('    },\n'));
 const inspectBody=inspect.slice(inspectStart.length,-7);
 const helper=`
  const __ls = globalThis.__HC_LIFE_STATE__;
  if (!__ls || __ls.token !== '${token}') throw Error('Life diagnostic token required');
  const __copy = value => JSON.parse(JSON.stringify(value));
  const __inspect = ({nodeId=null}={}) => {${inspectBody}\n  };
  const __backing = () => JSON.stringify({runner:getRunner().inspectRetainedStates(),timeline:getRunner().getTimeline(),nodes,payload:job?.payload??null});
  const __capture = (kind,extra={}) => {
    const startMs=performance.now();
    const before=__backing();
    const life=__inspect({nodeId:__ls.nodeId});
    const runner=getRunner().inspectRetainedStates();
    const timeline=__copy(getRunner().getTimeline());
    const after=__backing();
    __ls.events.push({kind,extra,life,runner,timeline,startMs,endMs:performance.now(),pure:before===after});
    if(before!==after) throw Error('Life boundary inspection mutated backing');
  };
  let __oldHandler=null, __oldEnvelopes=[];
`;
 replace('  let workerTimeout = null;','  let workerTimeout = null;'+helper);
 replace('  function changed() {','  function changed() {\n    __ls.changedCalls++;');
 replace('      job.phase = "resolving";','      job.phase = "resolving";\n      __capture("accepted-adopted",{id});');
 replace('      job.phase = "revealing";','      job.phase = "revealing";\n      __capture("ready",{id});');
 replace('      onChange();\n      start(job.payload, accept);','      __capture("submitted");\n      onChange();\n      start(job.payload, accept);');
 // Observe the actual gate, retain genuine entry envelopes, then replay them
 // through both the obsolete closure and the actual subsequent confirm closure.
 replace('      worker.onmessage = ({ data }) => {',`      worker.onmessage = ({ data }) => {
        if ((data.kind === 'accepted' || data.kind === 'ready') && id === __ls.firstId && !__ls.replaying) __oldEnvelopes.push(__copy(data));
        if (id !== requestId || data.requestId !== id || !job || job.error) __ls.gateRejections.push({closure:id,current:requestId,envelope:data.requestId,kind:data.kind});`);
 replace('      worker.postMessage({ ...payload, requestId: id });',`      if (__ls.firstId == null) { __ls.firstId=id; __oldHandler=worker.onmessage; }
      else if (__oldEnvelopes.length && !__ls.messagesTested) {
        __ls.messagesTested=true;
        __capture('old-message-before',{old:__ls.firstId,current:id});
        const changedBefore=__ls.changedCalls;
        __ls.replaying=true;
        for(const envelope of __oldEnvelopes.slice()){__oldHandler({data:__copy(envelope)});worker.onmessage({data:__copy(envelope)});}
        __ls.replaying=false;
        __capture('old-message-after',{old:__ls.firstId,current:id,changedDelta:__ls.changedCalls-changedBefore});
      }
      worker.postMessage({ ...payload, requestId: id });`);
 // Response-only, synchronous actual private mutation with finally restoration.
 replace(inspect,`    inspectRetainedPreparation(options = {}) {
      if (__ls.mutateDraft && !__ls.draftMutation && draft && actions.length===2) {
        const original=__inspect(options),backingBefore=__backing();
        const seed=draft.rng.vassalSeed,known=draft.persistentKnowledge.maxObservedCivilizationSurvivalYear;
        try {
          draft.rng.vassalSeed+=1;
          draft.persistentKnowledge.maxObservedCivilizationSurvivalYear+=1;
          __ls.draftMutation={original,mutant:__inspect(options),backingBefore,backingDuring:__backing()};
        } finally {
          draft.rng.vassalSeed=seed;draft.persistentKnowledge.maxObservedCivilizationSurvivalYear=known;
          if(__ls.draftMutation)__ls.draftMutation.restored=__inspect(options);
        }
      }
      return __inspect(options);
    },
`);
 const commitStart='    commitResolution() {',commitEnd='    resumePendingResolution() {';
 const ci=text.indexOf(commitStart),ce=text.indexOf(commitEnd,ci);const commit=text.slice(ci,ce);assert.ok(commit.endsWith('    },\n'));
 let body=commit.slice(commitStart.length,-7);
 if(removeSourceGuard){assert.equal(body.split('!job?.ready || !matches(base)').length,2);body=body.replace('!job?.ready || !matches(base)','!job?.ready');}
 replace(commit,`    commitResolution() {
      const original=()=>{${body}\n      };
      if(!job?.ready || !matches(base) || __ls.staleCommit) return original();
      const retainedJob=job,retainedBase=base;
      __capture('before-genuine-commit');
      const result=original();
      if(!result.ok) return result;
      const current={base,job,draft,actions,nodes,revision,adopting};
      const before=__backing(),changedBefore=__ls.changedCalls;
      const originalGetRunner=getRunner;let commitCalls=0;
      const stale={retainedReady:retainedJob.ready,retainedBase:{revision:retainedBase.revision,sec:retainedBase.sec},newSource:{revision:token().revision,sec:token().sec},sourceMatches:matches(retainedBase),before};
      try {
        job=retainedJob;base=retainedBase;
        getRunner=()=>new Proxy(originalGetRunner(),{get(target,key){if(key==='commitCursorSecond')return(...args)=>{commitCalls++;return target.commitCursorSecond(...args);};return target[key];}});
        stale.result=original();
      } finally {
        getRunner=originalGetRunner;
        ({base,job,draft,actions,nodes,revision,adopting}=current);
        stale.after=__backing();stale.commitCalls=commitCalls;stale.changedDelta=__ls.changedCalls-changedBefore;
        __ls.staleCommit=stale;
      }
      __capture('after-genuine-commit');
      return result;
    },
`);
 let mutant=original.slice(0,start)+text+original.slice(end);
 const observe='rememberObservedSurvivalYear: (year) => runner.rememberCivilizationSurvivalYear?.(year),';
 assert.equal(mutant.split(observe).length,2,'unique actual survival knowledge observation');
 const observeAfter=`rememberObservedSurvivalYear: (year) => {
      const c=globalThis.__HC_LIFE_STATE__;
      if(c?.token!=='${token}')throw Error('knowledge diagnostic scope');
      const tl=runner.getTimeline(),key=JSON.stringify([year,tl.revision,tl.historyEndSec,tl.actions.length]);
      if(c.knowledge.some(k=>k.key===key))return runner.rememberCivilizationSurvivalYear?.(year);
      const startMs=performance.now(),before=runner.inspectRetainedStates();const timing=globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot({includeProjectionSource:true});
      const value=runner.rememberCivilizationSurvivalYear?.(year);
      c.knowledge.push({key,year,startMs,endMs:performance.now(),actions:JSON.parse(JSON.stringify(tl.actions)),before,after:runner.inspectRetainedStates(),timing});return value;
    },`;
 mutant=mutant.replace(observe,observeAfter);seams.push({before:observe,after:observeAfter});
 return {mutant,identity:{originalSha256:sha256(original),mutantSha256:sha256(mutant),removeSourceGuard,seams,comparisonEligible:false}};
}
