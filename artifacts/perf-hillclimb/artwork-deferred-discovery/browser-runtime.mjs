// This function is serialized by Playwright's addInitScript. It has no imports.
export function installRuntime({instrumentation=true, workerDelayMs=0}={}) {
  const runtime=globalThis.__HC__={version:1,instrumentation,workerDelayMs,workerEvents:[],
    resources:[],longTasks:[],frames:[],operations:[],saveEvents:[],nextId:1,active:null};
  const clock=()=>performance.now();
  let last=clock();
  const frame=()=>{
    const now=clock();
    if(runtime.active)runtime.active.frames.push({time:now,dt:now-last});
    last=now; requestAnimationFrame(frame);
  };
  if(instrumentation) {
    requestAnimationFrame(frame);
    try {new PerformanceObserver(list=>{
      if(runtime.active)runtime.active.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})));
    }).observe({type:'longtask',buffered:false});}catch{}
  }
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
          message:event.data?.kind,requestId:event.data?.requestId,endSec:event.data?.endSec});
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
  runtime.arm=({name,event='pointerdown',timeoutMs=180000,startNow=false})=>{
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
      op.inputCount=(op.inputCount??0)+1;op.completionCandidate=null;
      if(op.started===null){
      op.handlerStarted=clock();op.eventTimeStamp=e.timeStamp;
      // Modern Chromium timestamps trusted input on the document monotonic
      // axis before handlers run, preserving time queued behind a busy frame.
      if(!Number.isFinite(e.timeStamp)||e.timeStamp<0||e.timeStamp>op.handlerStarted+1)
        op.invalidTimestamp=true;
      op.started=e.timeStamp;op.inputQueueMs=op.handlerStarted-op.started;
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
    if(candidate){
      await candidate.promise;op.semanticEnd=candidate.semanticEnd;op.finished=candidate.frameEnd;
      op.hostCompletionGapMs=op.hostFinishCalledAt-candidate.semanticEnd;
      op.completionClock='browser predicate observation + double-rAF (host delivery excluded)';
    }else{
      op.semanticEnd=clock();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      op.finished=clock();op.completionClock='host-finalized upper bound; requires overhead control';
    }
    op.witness=witness;op.elapsedMs=op.finished-op.started;
    if(op.elapsedMs>op.timeoutMs){op.timeout=true;throw new Error(`operation timeout after ${op.elapsedMs.toFixed(1)}ms (deadline ${op.timeoutMs}ms)`);}
    op.timeout=false;
    op.feedbackMs=op.semanticEnd-op.started;op.armToDispatchMs=op.started-op.armed;
    op.workerEvents=runtime.workerEvents.slice(op.workerOffset).filter(e=>e.time>=op.started&&e.time<=op.finished);op.cleanup();
    op.saveEvents=runtime.saveEvents.filter(e=>e.time>=op.started&&e.time<=op.finished);
    op.frames=op.frames.filter(f=>f.time>=op.started&&f.time<=op.finished);
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
    if(runtime.active&&runtime.active.probeKey!==key){runtime.active.probeKey=key;runtime.active.completionCandidate=null;}
    const start=clock();try{
      const result=fn();
      if(result&&terminal&&runtime.active&&!runtime.active.completionCandidate){
        const op=runtime.active,candidate={semanticEnd:clock(),frameEnd:null};
        candidate.promise=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{candidate.frameEnd=clock();resolve();})));
        op.completionCandidate=candidate;
        op.terminalPredicateKey=key;
      }
      return result;
    }finally{
      if(runtime.active){runtime.active.probes++;runtime.active.probeCpuMs+=clock()-start;}
    }
  };
}

// Installed only on fixture setup pages, before entering the real game. It uses
// the actual IndexedDB namespace and transactions, never legacy localStorage.
export async function installSave({database,slot,text,meta}) {
  const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(database,1);
    req.onupgradeneeded=()=>{
      req.result.createObjectStore('saves',{keyPath:'slot'});
      req.result.createObjectStore('slots',{keyPath:'slot'});
      req.result.createObjectStore('settings');
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  try {await new Promise((resolve,reject)=>{
    const tx=db.transaction(['saves','slots'],'readwrite');
    tx.objectStore('saves').put({slot,text});
    tx.objectStore('slots').put({slot,meta,characters:text.length});
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}

export async function readSave({database,slot}) {
  const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(database,1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  try{return await new Promise((resolve,reject)=>{
    let text=null;const tx=db.transaction('saves','readonly');
    const req=tx.objectStore('saves').get(slot);req.onsuccess=()=>{text=req.result?.text??null;};
    tx.oncomplete=()=>resolve(text);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
