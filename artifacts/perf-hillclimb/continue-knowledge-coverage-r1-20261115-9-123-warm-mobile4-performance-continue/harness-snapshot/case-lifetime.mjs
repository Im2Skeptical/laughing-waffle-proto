import assert from 'node:assert/strict';
import {withDeadline} from './deadline.mjs';

const MAX_TIMER_MS=2147483647;
const duration=value=>assert.ok(Number.isFinite(value)&&value>0&&value<=MAX_TIMER_MS,'positive supported host timer duration required');

// Host liveness/cancellation only. This clock never supplies product latency.
// Cancellation rejects guarded waits; it does not pretend remote work stopped.
export function createCaseLifetime({timeoutMs,label='case'}){
  duration(timeoutMs);
  const controller=new AbortController(),startedMs=performance.now(),deadlineMs=startedMs+timeoutMs;
  const pending=new Map();let sequence=0,status='running',reason=null;
  const cancel=error=>{
    if(status!=='running')return;
    status='cancelled';reason=error instanceof Error?error:new Error(String(error));
    clearTimeout(timer);controller.abort(reason);
  };
  const timer=setTimeout(()=>cancel(new Error(`${label} lifetime timeout after ${timeoutMs}ms`)),timeoutMs);
  const throwIfStopped=()=>{
    if(status!=='running')throw reason??new Error(`${label} is already ${status}`);
    if(performance.now()>=deadlineMs){cancel(new Error(`${label} lifetime timeout after ${timeoutMs}ms`));throw reason;}
  };
  async function wait(work,{timeoutMs:stageTimeoutMs=timeoutMs,label:stage='guarded work'}={}){
    assert.equal(typeof work,'function','guarded work must be a thunk, so cancelled work never starts');
    duration(stageTimeoutMs);throwIfStopped();
    const id=++sequence,entry={id,label:stage,hostStartedMs:performance.now()};
    let onAbort,stageTimer;
    const aborted=new Promise((_,reject)=>{onAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',onAbort,{once:true});});
    const remaining=deadlineMs-performance.now();
    if(stageTimeoutMs<remaining)stageTimer=setTimeout(()=>cancel(new Error(`${stage} timeout after ${stageTimeoutMs}ms`)),stageTimeoutMs);
    const underlying=Promise.resolve().then(()=>{throwIfStopped();return work();});
    pending.set(id,{...entry,promise:underlying});
    underlying.then(()=>pending.delete(id),()=>pending.delete(id));
    try{return await Promise.race([underlying,aborted]);}
    catch(error){cancel(error);throw error;}
    finally{clearTimeout(stageTimer);controller.signal.removeEventListener('abort',onAbort);}
  }
  const snapshot=()=>({label,status,hostStartedMs:startedMs,hostDeadlineMs:deadlineMs,reason:reason?.message??null,
    unconfirmedWork:[...pending.values()].map(({promise,...entry})=>({...entry})),
    scope:'host liveness only; guarded rejection does not certify remote completion or substitute a product timing'});
  return {wait,cancel,throwIfStopped,snapshot,
    complete(){throwIfStopped();status='completed';clearTimeout(timer);},
    dispose(){if(status==='running')cancel(new Error(`${label} disposed before completion`));clearTimeout(timer);},
    async drain(timeoutMs=5000){
      duration(timeoutMs);
      try{await withDeadline(Promise.allSettled([...pending.values()].map(entry=>entry.promise)),timeoutMs,`${label} underlying-work drain`);}
      catch{/* Unconfirmed work remains explicit; caller closes owned browser/process resources. */}
      return snapshot();
    },
  };
}
