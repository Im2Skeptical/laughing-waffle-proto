(function installStaleGenerationControl({asset}){
  const Native=globalThis.Worker,relayed=new WeakSet();
  const control=globalThis.__HC_STALE_CONTROL__={armed:false,events:[]};
  const suffix=asset.replace(/^\.\//,'');
  globalThis.Worker=class extends Native{
    constructor(url,options){
      super(url,options);
      if(!new URL(String(url),location.href).pathname.endsWith(suffix))return;
      // Installed before the timing runtime and the app: both receive the
      // deliberately stale delivery, never telemetry claiming an original token.
      this.addEventListener('message',event=>{
        if(!control.armed||relayed.has(event)||event.data?.kind!=='chunkResult')return;
        const data=event.data;
        control.events.push({time:performance.now(),kind:data.kind,originalToken:data.timelineToken,
          deliveredToken:'stale-control-generation',endSec:data.endSec,resultOk:data.result?.ok});
        const fault=new MessageEvent('message',{data:{...data,timelineToken:'stale-control-generation'}});
        relayed.add(fault);event.stopImmediatePropagation();this.dispatchEvent(fault);
      });
    }
  };
})({"asset":"./assets/timegraph-forecast-worker-YOB3XRD7.js"});
(function installRuntime({instrumentation=true, workerDelayMs=0}={}) {
  const runtime=globalThis.__HC__={version:4,instrumentation,workerDelayMs,workerEvents:[],
    resources:[],longTasks:[],frames:[],operations:[],saveEvents:[],nextId:1,active:null};
  const clock=()=>performance.now();
  const invalidate=(op,reason)=>{
    if(op.completionCandidate)op.completionCandidate.invalidReason=reason;
    op.completionCandidate=null;
    op.lastTerminalInvalidation={time:clock(),reason};
  };
  const synchronous=fn=>{
    const result=fn();
    if(result&&typeof result.then==='function')throw new Error('terminal predicate must be synchronous');
    return result;
  };
  const revalidate=(op,candidate)=>{
    if(runtime.active!==op||op.completionCandidate!==candidate||op.probeKey!==candidate.key
      ||(op.inputCount??0)!==candidate.inputCount)return false;
    const start=clock();
    try{
      if(synchronous(candidate.predicate))return true;
      invalidate(op,'terminal predicate became false');return false;
    }catch(error){invalidate(op,`terminal predicate failed: ${error.message}`);return false;}
    finally{
      op.terminalRevalidations=(op.terminalRevalidations??0)+1;
      op.revalidationCpuMs=(op.revalidationCpuMs??0)+clock()-start;
      op.probeCpuMs+=clock()-start;
    }
  };
  let last=clock();
  const frame=()=>{
    const now=clock();
    const sample={time:now,dt:now-last};runtime.frames.push(sample);
    if(runtime.active)runtime.active.frames.push(sample);
    last=now; requestAnimationFrame(frame);
  };
  let longTaskObserver;
  const retainLongTasks=entries=>{
    const samples=entries.map(e=>({start:e.startTime,duration:e.duration}));
    runtime.longTasks.push(...samples);
    if(runtime.active)runtime.active.longTasks.push(...samples);
  };
  if(instrumentation) {
    requestAnimationFrame(frame);
    try {const observer=new PerformanceObserver(list=>retainLongTasks(list.getEntries()));
      observer.observe({type:'longtask',buffered:false});longTaskObserver=observer;}catch{}
  }
  runtime.readContinuousWindow=({startMs=0,endMs=clock()}={})=>{
    const readAtMs=clock();
    if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs||endMs>readAtMs)
      throw new Error('continuous window must be a positive observed document-clock interval');
    if(longTaskObserver?.takeRecords)retainLongTasks(longTaskObserver.takeRecords());
    const frames=runtime.frames.filter(f=>f.dt>0&&f.time>startMs&&f.time-f.dt<endMs).map(f=>({...f}));
    const lastThrough=frames.reduce((last,f)=>Math.max(last,Math.min(f.time,endMs)),startMs);
    return {available:instrumentation,longTasksAvailable:!!longTaskObserver,startMs,endMs,readAtMs,frames,
      longTasks:runtime.longTasks.filter(t=>t.duration>0&&t.start<endMs&&t.start+t.duration>startMs).map(t=>({...t})),
      trailingFrameRightCensored:instrumentation?endMs>lastThrough:null,
      trailingFrameLowerBoundMs:instrumentation?Math.max(0,endMs-lastThrough):null,
      scope:'continuous main-thread rAF intervals/long tasks; keep a declared post-action observation window, not only transaction markers'};
  };
  const nativeWorker=globalThis.Worker;
  if(instrumentation&&globalThis.IDBObjectStore){
    const originalPut=IDBObjectStore.prototype.put;
    const transactions=new WeakMap();let nextTransaction=1;
    IDBObjectStore.prototype.put=function(value,...args){
      const result=originalPut.call(this,value,...args);
      if(this.name==='saves'){
        const tx=this.transaction;let entry=transactions.get(tx);
        if(!entry){entry={id:nextTransaction++,slots:[]};transactions.set(tx,entry);
          tx.addEventListener('complete',()=>runtime.saveEvents.push({kind:'complete',time:clock(),...entry}),{once:true});
          tx.addEventListener('abort',()=>runtime.saveEvents.push({kind:'abort',time:clock(),...entry}),{once:true});
        }
        entry.slots.push(value?.slot);
        runtime.saveEvents.push({kind:'put',time:clock(),transactionId:entry.id,slot:value?.slot,characters:value?.text?.length});
      }
      return result;
    };
  }
  const redispatched=new WeakSet();
  if(instrumentation||workerDelayMs>0)globalThis.Worker=class extends nativeWorker {
    constructor(url,options) {
      super(url,options);this.hcUrl=String(url);
      this.addEventListener('message',event=>{
        if(redispatched.has(event))return;
        if(instrumentation)runtime.workerEvents.push({kind:'response',url:this.hcUrl,time:clock(),
          message:event.data?.kind,requestId:event.data?.requestId,endSec:event.data?.endSec,
          timelineToken:event.data?.timelineToken,historyEndSec:event.data?.historyEndSec,baseSec:event.data?.baseSec,
          resultOk:event.data?.result?.ok,chunkEndSec:event.data?.chunk?.endSec,chunkOk:event.data?.chunk?.ok});
        if(runtime.workerDelayMs>0){
          event.stopImmediatePropagation();
          const next=new MessageEvent('message',{data:event.data});redispatched.add(next);
          setTimeout(()=>this.dispatchEvent(next),runtime.workerDelayMs);
        }
      });
    }
    postMessage(message,...args) {
      if(instrumentation)runtime.workerEvents.push({kind:'request',url:this.hcUrl,time:clock(),
        message:message?.kind,requestId:message?.requestId,endSec:message?.endSec});
      return super.postMessage(message,...args);
    }
  };
  runtime.arm=({name,event='pointerdown',timeoutMs=180000,startNow=false,captureInputTiming=false})=>{
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('positive finite operation deadline required');
    if(captureInputTiming&&startNow)throw new Error('input timing capture requires real input');
    if(runtime.active)throw new Error('overlapping harness operation');
    const op={id:runtime.nextId++,name,armed:clock(),started:startNow?clock():null,timeoutMs,
      event,frames:[],longTasks:[],probes:0,probeCpuMs:0,workerOffset:runtime.workerEvents.length};
    runtime.active=op;
    let saveObserver;
    if(name==='save-to-persisted'){
      const status=document.querySelector('[data-testid=game-save-status]');
      op.savePhaseEvents=[];
      if(status){saveObserver=new MutationObserver(records=>{
        for(const record of records){
          const phase=status.dataset.phase;op.savePhaseEvents.push({time:clock(),oldValue:record.oldValue,phase});
          if(record.oldValue==='saving'&&phase==='saved')op.savePhaseTransitionObserved=true;
        }
      });saveObserver.observe(status,{attributes:true,attributeFilter:['data-phase'],attributeOldValue:true});}
    }
    const handler=e=>{
      op.inputCount=(op.inputCount??0)+1;invalidate(op,'another input arrived');
      if(op.started===null){
      op.handlerStarted=clock();op.eventTimeStamp=e.timeStamp;
      // Modern Chromium timestamps trusted input on the document monotonic
      // axis before handlers run, preserving time queued behind a busy frame.
      if(!Number.isFinite(e.timeStamp)||e.timeStamp<0||e.timeStamp>op.handlerStarted+1)
        op.invalidTimestamp=true;
      op.started=e.timeStamp;op.inputQueueMs=op.handlerStarted-op.started;
      if(captureInputTiming){
        op.inputTimingReadStarted=clock();
        try{
          op.inputTimingSnapshot=globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot({includeProjectionSource:true});
          if(op.inputTimingSnapshot?.version!==2)op.inputTimingError='passive timing DTO v2 unavailable at input';
        }catch(error){op.inputTimingError=error.message;}
        finally{op.inputTimingReadMs=clock()-op.inputTimingReadStarted;}
      }
      clearTimeout(op.timer);
      op.timer=setTimeout(()=>{op.timeout=true;},Math.max(0,timeoutMs-(clock()-op.started)));
      op.trustedInput=e.isTrusted;op.inputType=e.type;}};
    if(!startNow)document.addEventListener(event,handler,{capture:true});
    op.timer=setTimeout(()=>{op.timeout=true;},timeoutMs);
    op.cleanup=()=>{clearTimeout(op.timer);saveObserver?.disconnect();document.removeEventListener(event,handler,{capture:true});};
    return op.id;
  };
  runtime.finish=async (witness,{requireTerminal=true}={})=>{
    const op=runtime.active;if(!op)throw new Error('no active harness operation');
    if(op.started===null)throw new Error('no actual input event reached the document');
    if(op.invalidTimestamp)throw new Error('input timestamp is not on performance.now document axis');
    op.hostFinishCalledAt=clock();
    const candidate=op.completionCandidate;
    if(requireTerminal&&!candidate)throw new Error('no explicitly designated terminal predicate observed');
    const bounded=async promise=>{
      let timer;
      try{return await Promise.race([promise,new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('visible completion timeout: frame opportunity deadline exceeded')),
          Math.max(0,op.started+op.timeoutMs-clock()));
      })]);}finally{clearTimeout(timer);}
    };
    if(candidate){
      if(!revalidate(op,candidate))throw new Error('terminal completion is no longer current');
      if(candidate.frameEnd===null)await bounded(candidate.promise);
      if(!candidate.valid||!revalidate(op,candidate))throw new Error('terminal completion invalidated before visible completion');
      op.semanticEnd=candidate.semanticEnd;op.finished=candidate.frameEnd;
      op.completionClock='browser predicate observation + double-rAF opportunity; not physical scanout or completion of all later app work';
    }else{
      op.semanticEnd=clock();
      await bounded(new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      op.finished=clock();op.completionClock='host-finalized upper bound; requires overhead control';
    }
    op.witness=witness;op.elapsedMs=op.finished-op.started;
    if(op.elapsedMs>op.timeoutMs){op.timeout=true;throw new Error(`operation timeout after ${op.elapsedMs.toFixed(1)}ms (deadline ${op.timeoutMs}ms)`);}
    op.timeout=false;
    op.terminalReadinessMs=op.semanticEnd-op.started;
    op.firstFeedbackMs=null;
    op.feedbackScope='first visible feedback unmeasured; terminal readiness must not be relabelled as feedback';
    op.semanticToFrameOpportunityMs=op.finished-op.semanticEnd;
    op.finishCallRelativeToFrameOpportunityMs=op.hostFinishCalledAt-op.finished;
    op.postSemanticToFinishCallMs=op.hostFinishCalledAt-op.semanticEnd;
    op.gapScope='post-marker interval may contain app work, later stalls and driver delivery; no pure-overhead attribution';
    op.armToDispatchMs=op.started-op.armed;
    op.workerEvents=runtime.workerEvents.slice(op.workerOffset).filter(e=>e.time>=op.started&&e.time<=op.finished);op.cleanup();
    op.saveEvents=runtime.saveEvents.filter(e=>e.time>=op.started&&e.time<=op.finished);
    op.frameObservationEndMs=clock();
    op.frames=op.frames.filter(f=>f.time>=op.started&&f.time<=op.frameObservationEndMs);
    op.frameScope='per-operation observations may extend past latency marker; session window required for continuous-stall claims';
    delete op.cleanup;delete op.timer;delete op.completionCandidate;runtime.operations.push(op);runtime.active=null;
    return op;
  };
  runtime.cancel=error=>{
    const op=runtime.active;if(!op)return null;
    op.finished=clock();op.elapsedMs=op.started===null?null:op.finished-op.started;
    op.error=String(error);op.cleanup();delete op.cleanup;delete op.timer;
    delete op.completionCandidate;runtime.operations.push(op);runtime.active=null;return op;
  };
  runtime.probe=(fn,{key='default',terminal=false}={})=>{
    if(runtime.active&&runtime.active.probeKey!==key){runtime.active.probeKey=key;invalidate(runtime.active,'predicate identity changed');}
    const start=clock();try{
      const result=terminal?synchronous(fn):fn();
      if(terminal&&runtime.active){
        const op=runtime.active;
        if(!result){invalidate(op,'terminal predicate became false');return result;}
        if(!op.completionCandidate){
          const candidate={key,predicate:fn,inputCount:op.inputCount??0,semanticEnd:clock(),frameEnd:null,valid:false};
          op.completionCandidate=candidate;op.terminalPredicateKey=key;
          candidate.promise=new Promise(resolve=>requestAnimationFrame(()=>{
            if(!revalidate(op,candidate)){resolve();return;}
            requestAnimationFrame(()=>{
              if(revalidate(op,candidate)){candidate.frameEnd=clock();candidate.valid=true;}
              resolve();
            });
          }));
        }
        // waitForFunction must keep observing after a transient true. It only
        // completes when this same readiness period survived both frames.
        return op.completionCandidate.valid?result:false;
      }
      return result;
    }catch(error){
      if(terminal&&runtime.active)invalidate(runtime.active,`terminal predicate failed: ${error.message}`);
      throw error;
    }finally{
      if(runtime.active){runtime.active.probes++;runtime.active.probeCpuMs+=clock()-start;}
    }
  };
})({"instrumentation":true,"workerDelayMs":0});