// Serializable passive terminal predicate, shared by real jobs and controls.
export function scrubComplete(s,e){
  const witnessed=globalThis.__HC_SCRUB_INPUT__?.events??[];
  if(s.runner.viewedSec>s.graph.browseCapSec||witnessed.some(x=>x.viewedSec>x.browseCapSec))
    throw new Error('J5 observed unrevealed browse access');
  return s.runner.viewedSec===e.second&&s.runner.forecastPreview===true
    &&s.runner.frontierSec===e.frontier&&s.graph.latchedForecastScrubSec===e.second
    &&s.runner.viewedSec<=s.graph.browseCapSec&&s.graph.revealedSec>e.revealed
    &&s.graph.targetSec>=e.target&&s.graph.asyncToken===e.token&&s.graph.subjectKey===e.subject
    &&s.graph.projection.signatureMatches===true&&s.graph.projection.timelineToken===e.token
    &&s.runner.revision===e.revision&&s.runner.actionCount===e.actions&&s;
}

export function installScrubInputObservation(){
  const events=[];
  const listener=e=>{
    if(!e.isTrusted)return;
    const start=performance.now(),s=__SETTLEMENT_DEBUG__.getTimingSnapshot();
    events.push({type:e.type,x:e.clientX,y:e.clientY,pointerType:e.pointerType,timeStamp:e.timeStamp,
      handlerAt:start,minSec:s.graph.minSec,maxSec:s.graph.maxSec,plotRect:s.graph.plotRect,
      revealedSec:s.graph.revealedSec,browseCapSec:s.graph.browseCapSec,targetSec:s.graph.targetSec,viewedSec:s.runner.viewedSec,readCpuMs:performance.now()-start});
  };
  for(const type of ['pointerdown','pointermove','pointerup'])document.addEventListener(type,listener,{capture:true});
  globalThis.__HC_SCRUB_INPUT__={events,stop(){for(const type of ['pointerdown','pointermove','pointerup'])document.removeEventListener(type,listener,{capture:true});}};
}

export function installStaleGenerationControl({asset}){
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
}

// Browser-only, isolated control. Delay the app's actual committed save
// acknowledgement; native transaction completion remains independently visible.
export function installSaveCompletionControl(){
  const descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');
  if(!descriptor?.set)throw new Error('native transaction completion setter required');
  globalThis.__HC_SAVE_CONTROL__={events:[]};
  Object.defineProperty(IDBTransaction.prototype,'oncomplete',{
    ...descriptor,set(callback){
      if(this.mode!=='readwrite'||!this.objectStoreNames.contains('saves')||typeof callback!=='function')return descriptor.set.call(this,callback);
      const tx=this;
      descriptor.set.call(tx,function(event){
        const row={nativeCompleteAt:performance.now(),delayMs:200};__HC_SAVE_CONTROL__.events.push(row);
        setTimeout(()=>{row.deliveredAt=performance.now();callback.call(tx,event);},200);
      });
    },
  });
}
