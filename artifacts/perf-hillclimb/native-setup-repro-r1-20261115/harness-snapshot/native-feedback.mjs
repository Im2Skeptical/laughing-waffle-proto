import {writeFile} from 'node:fs/promises';
import {withDeadline} from './deadline.mjs';

// Supplemental filtered native evidence. Never a first-pixel or whole-population clock.
export function installNativeFeedback() {
  const entries=[],receipts=[],capacity=2048;
  const state=globalThis.__HC_NATIVE__={timeOrigin:performance.timeOrigin,visibility:document.visibilityState,
    supported:PerformanceObserver.supportedEntryTypes,entries,receipts,overflow:0,droppedEntriesCount:null,
    thresholdMs:16,timestampJoinToleranceMs:.25,receiptCpuMs:0,callbackCpuMs:0,callbackCount:0,
    scope:'filtered Event Timing dispatch; not meaningful pixels'};
  const retain=(list,item)=>{if(list.length<capacity)list.push(item);else state.overflow++;};
  const identify=e=>e?.dataset?.testid??e?.tagName??null;
  const receipt=e=>{const start=performance.now();retain(receipts,{type:e.type,trusted:e.isTrusted,timeStamp:e.timeStamp,arrival:start,
    target:identify(e.target),pointerId:e.pointerId??null,pointerType:e.pointerType??null,x:e.clientX??null,y:e.clientY??null,
    coalesced:e.getCoalescedEvents?.().map(x=>x.timeStamp)??[],operationId:globalThis.__HC__?.active?.id??null});state.receiptCpuMs+=performance.now()-start;};
  const types=['pointerdown','pointermove','pointerup','pointercancel','click','wheel'];
  for(const t of types)window.addEventListener(t,receipt,{capture:true});
  let observer;
  const collect=list=>{for(const e of list)retain(entries,{...e.toJSON(),target:identify(e.target)});};
  if(state.supported.includes('event')){
    observer=new PerformanceObserver((list,_observer,options)=>{const start=performance.now();collect(list.getEntries());
      if(options?.droppedEntriesCount!=null)state.droppedEntriesCount=(state.droppedEntriesCount??0)+options.droppedEntriesCount;
      state.callbackCount++;state.callbackCpuMs+=performance.now()-start;});
    observer.observe({type:'event',durationThreshold:16,buffered:false});
  }
  state.stop=()=>{const start=performance.now();collect(observer?.takeRecords()??[]);observer?.disconnect();for(const t of types)window.removeEventListener(t,receipt,{capture:true});
    const joins=entries.map(entry=>{
      const candidates=receipts.filter(r=>r.trusted&&r.type===entry.name&&r.target===entry.target&&Math.abs(r.timeStamp-entry.startTime)<=.25);
      return {entry,candidates,status:candidates.length===1?'unique':candidates.length?'ambiguous':'unmatched'};
    });
    return {...state,stop:undefined,joins,stopCpuMs:performance.now()-start,
      cpuScope:'sampled JS observer/receipt/export CPU only; quantized clock; not complete instrumentation overhead',
      unmatchedReceiptScope:'missing entry is filtered/pending/ineligible/unknown, never zero latency'};
  };
}

// One owner, bounded stream, complete drain, explicit loss and unavailable lineage.
export async function startNativeTrace(cdp,filename) {
  const version=await cdp.send('Browser.getVersion');
  const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame;
  const root=(await cdp.send('DOM.getDocument',{depth:0})).root;
  const menuNode=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-testid=game-menu]'});
  const menu=menuNode.nodeId?(await cdp.send('DOM.describeNode',{nodeId:menuNode.nodeId})).node:null;
  const available=(await cdp.send('Tracing.getCategories')).categories;
  const categories=['devtools.timeline','blink.user_timing','disabled-by-default-devtools.timeline.inputs','cc'].filter(c=>available.includes(c));
  let complete;
  const completion=new Promise(resolve=>{complete=resolve;});
  cdp.once('Tracing.tracingComplete',complete);
  await cdp.send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',traceConfig:{includedCategories:categories}});
  const marks=[];
  const mark=async name=>{
    const result=await cdp.send('Runtime.evaluate',{expression:`(()=>{const before=performance.now();performance.mark(${JSON.stringify(name)});return {name:${JSON.stringify(name)},before,after:performance.now()};})()`,returnByValue:true});
    marks.push(result.result.value);
  };
  for(let i=0;i<5;i++)await mark(`hc-native-before-${i}`);
  let ended=false;
  return {async stop(){
    if(ended)throw Error('trace ended twice');ended=true;
    let handle,bytes=0,parts=[];const began=performance.now();
    const identity={version,categories,frame,menuBackendNodeId:menu?.backendNodeId??null,
      maxBytes:32*1024*1024,maxDrainMs:15000,complete:false,
      sameSurfaceLineage:'UNPROVED: raw trace alone does not authenticate meaningful game frame/pixels'};
    try{
      for(let i=0;i<5;i++)await mark(`hc-native-after-${i}`);
      await cdp.send('Tracing.end');const event=await withDeadline(completion,15000,'trace complete flush');
      identity.event=event;handle=event.stream;if(!handle)throw Error('trace stream missing');
      while(true){
        if(performance.now()-began>15000)throw Error('trace drain deadline');
        const chunk=await withDeadline(cdp.send('IO.read',{handle,size:65536}),5000,'trace stream read');
        const b=Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8');bytes+=b.length;
        if(bytes>identity.maxBytes)throw Error('trace resource cap');parts.push(b);if(chunk.eof)break;
      }
      const raw=Buffer.concat(parts);await writeFile(filename,raw);identity.bytes=bytes;identity.complete=true;
      const parseStarted=performance.now(),events=JSON.parse(raw).traceEvents;
      identity.marks=marks.map(m=>{const found=events.filter(e=>e.name===m.name&&e.cat?.includes('blink.user_timing'));return {...m,traceMatches:found.length,traceTsUs:found.length===1?found[0].ts:null};});
      const matches=identity.marks.filter(m=>m.traceTsUs!==null);
      const low=Math.max(...matches.map(m=>m.traceTsUs/1000-m.after));
      const high=Math.min(...matches.map(m=>m.traceTsUs/1000-m.before));
      identity.clock={lowTraceMinusPageMs:low,highTraceMinusPageMs:high,
        valid:matches.length===10&&low<=high&&high-low<=1,scope:'10 same-document JS mark brackets; trace microseconds explicitly converted to ms; no epoch/scanout conversion'};
      identity.menuPaint=events.filter(e=>e.name==='Paint'&&e.args?.data?.frame===frame.id&&e.args.data.nodeId===menu?.backendNodeId)
        .map(e=>({tsUs:e.ts,pid:e.pid,tid:e.tid,phase:e.ph,data:e.args.data}));
      identity.paintScope='exact native backend node + root document frame match; DOM Paint only, not compositor completion or first meaningful pixels';
      identity.pipelineReporterFields=Object.keys(events.find(e=>e.name==='PipelineReporter')?.args?.frame_reporter??{});
      identity.pipelineScope='raw stream retains native frame/surface ids; unsafe >53-bit numeric identifiers are not used for JS joins; compositor-to-menu lineage remains unproved';
      identity.parseCpuMs=performance.now()-parseStarted;
      if(event.dataLossOccurred)throw Error('trace data loss');
    }catch(e){identity.error=e.message;await writeFile(filename+'.partial',Buffer.concat(parts));}
    finally{if(handle)try{await cdp.send('IO.close',{handle});identity.handleClosed=true;}catch(e){identity.closeError=e.message;}
      cdp.removeListener('Tracing.tracingComplete',complete);await writeFile(filename+'.identity.json',JSON.stringify(identity,null,2));}
    return identity;
  }};
}
