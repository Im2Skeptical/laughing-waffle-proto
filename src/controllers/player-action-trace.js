// Dev-only, append-only command journal. Never imported by the model or saves.
// Gameplay actions, including subsequently replaced actions, survive in this
// session's journal; the active timeline remains the authority for replay.
const copy=value=>JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='function'?undefined:item));
export function attachPlayerActionTrace(runner) {
  const events=[],runs=[]; let run=0, sequence=0, baseline=null;
  function begin(label) {
    run++;
    baseline=copy({baseStateData:runner.getTimeline()?.baseStateData,actions:runner.getTimeline()?.actions??[],
      persistentKnowledge:runner.getTimeline()?.persistentKnowledge});
    runs.push({run,label,baseline});
    events.push({sequence:++sequence,run,phase:'entry',operation:label,tSec:runner.getCursorState()?.tSec??0});
  }
  function record(operation,args,result,phase='accepted') {
    if(result?.ok!==true)return;
    if(!baseline)begin('existing-run');
    events.push({sequence:++sequence,run,phase,operation,args:copy(args),
      tSec:runner.getCursorState()?.tSec??0,frontierSec:runner.getTimeline()?.historyEndSec??0,
      result:copy({ok:true,pending:result.pending===true,tSec:result.tSec,count:result.count})});
  }
  const specs={dispatchAction:a=>a.slice(0,3),dispatchActionAtCurrentSecond:a=>a.slice(0,3),
    dispatchActionsAtCurrentSecond:a=>a.slice(0,2),dispatchActionAtSecond:a=>a.slice(0,4),
    dispatchPreparedActionsAtCurrentSecond:a=>[a[0]],scheduleActionAtNextSecond:a=>a.slice(0,3),
    scheduleActionsAtNextSecond:a=>a.slice(0,2),clearPlannerActionsAtCursor:a=>a,
    commitCursorSecond:a=>[a[0]],commitPreviewToLive:()=>[]};
  for(const [name,select] of Object.entries(specs)) {
    const original=runner[name];if(!original)continue;
    runner[name]=(...args)=>{if(!baseline)begin('existing-run');const safe=copy(select(args));const result=original(...args);record(name,safe,result);return result;};
  }
  for(const name of ['resetToState','resetToSetup','loadFromSlot']) {
    const original=runner[name];
    runner[name]=(...args)=>{
      const result=original(...args);
      if(result?.then)return result.then(value=>{if(value.ok)begin(name);return value;});
      if(result?.ok)begin(name);return result;
    };
  }
  runner.recordPlayerDraftAction=(kind,payload,result)=>record('lifeDecision',[kind,payload],result,'draft');
  runner.exportPlayerActionTrace=()=>copy({format:1,coverage:'Session commands; earlier surviving actions are in the replay baseline. Earlier discarded actions cannot be recovered.',
    currentRun:run,runs,events});
  return runner;
}
