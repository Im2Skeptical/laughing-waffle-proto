import {withDeadline} from './deadline.mjs';

// Fixed-rate trusted input, independent of renderer acknowledgements. These
// diagnostics explicitly expose generator lateness, coalescing and missing work.
// They do not replace the job's final state/replay oracle.
export function installOfferedInputObserver() {
  globalThis.__HC_OFFERED__?.stop?.({cancelFrames:true});
  const initial=globalThis.__SETTLEMENT_DEBUG__.getTimingSnapshot();
  if(initial.version!==2||!initial.map?.camera)throw new Error('passive camera DTO v2 is required for offered-input observation');
  const result=globalThis.__HC_OFFERED__={events:[],pending:[],frameCancels:new Set()};
  const onEvent=event=>{
    if(!event.isTrusted)return;
    const points=event.getCoalescedEvents?.()??[];
    const all=[...points,event],seen=new Set();
    const observed=all.filter(e=>{
      const key=`${e.type}:${e.pointerId}:${e.timeStamp}:${e.clientX}:${e.clientY}`;
      if(seen.has(key))return false;seen.add(key);return true;
    }).map(e=>({type:event.type,timeStamp:e.timeStamp,handlerAt:performance.now(),x:e.clientX,y:e.clientY,
      pointerId:e.pointerId,pointerType:event.pointerType,coalesced:e!==event,trusted:event.isTrusted}));
    result.events.push(...observed);
    result.pending.push(new Promise(resolve=>{
      let frameId;
      const done=()=>{result.frameCancels.delete(cancel);resolve();};
      const cancel=()=>{cancelAnimationFrame(frameId);for(const item of observed)item.frameUnavailableReason='observer cancelled';done();};
      result.frameCancels.add(cancel);
      frameId=requestAnimationFrame(()=>{frameId=requestAnimationFrame(()=>{
        try{
          const frameAt=performance.now();
          const timing=globalThis.__SETTLEMENT_DEBUG__.getTimingSnapshot();
          const reference={mode:timing.mode,camera:timing.map.camera};
          for(const item of observed){item.frameAt=frameAt;item.inputToFrameMs=frameAt-item.timeStamp;item.reference=reference;}
        }catch(error){for(const item of observed)item.frameUnavailableReason=error.message;}
        finally{done();}
      });});
    }));
  };
  const types=['pointerdown','pointermove','pointerup','pointercancel'];
  for(const type of types)document.addEventListener(type,onEvent,{capture:true});
  result.stop=({cancelFrames=false}={})=>{
    for(const type of types)document.removeEventListener(type,onEvent,{capture:true});
    if(cancelFrames)for(const cancel of [...result.frameCancels])cancel();
  };
}

function validSchedule(steps,intervalMs){
  if(!Number.isInteger(steps)||steps<1||!Number.isFinite(intervalMs)||intervalMs<=0)throw new Error('invalid offered gesture schedule');
}
function validPoint(point){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error('finite offered gesture point required');
}
function createSchedule(pointsAt,steps,intervalMs){
  validSchedule(steps,intervalMs);
  return Array.from({length:steps+2},(_,index)=>({index,at:index*intervalMs,
    kind:index===0?'start':index===steps+1?'end':'move',
    type:index===0?'pointerdown':index===steps+1?'pointerup':'pointermove',
    contacts:pointsAt(Math.min(index,steps)/steps).map(point=>({...point}))}));
}
export function createDragSchedule({from,to,steps=12,intervalMs=1000/60}){
  validPoint(from);validPoint(to);
  if(from.x===to.x&&from.y===to.y)throw new Error('offered drag must move');
  return createSchedule(t=>[{id:1,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t}],steps,intervalMs);
}
export function createPinchSchedule({center,startSpan,endSpan,steps=12,intervalMs=1000/60}){
  validPoint(center);
  if(!Number.isFinite(startSpan)||!Number.isFinite(endSpan)||startSpan<=0||endSpan<=0||startSpan===endSpan)
    throw new Error('distinct positive finite pinch spans required');
  return createSchedule(t=>{
    const radius=(startSpan+(endSpan-startSpan)*t)/2;
    return [{id:1,x:center.x-radius,y:center.y},{id:2,x:center.x+radius,y:center.y}];
  },steps,intervalMs);
}

export function matchOfferedEvents(schedule,observed,input,calibration){
  const used=new Set(),pointerIds=new Map();
  const matchedSchedule=schedule.map(source=>{
    const item={...source,contacts:source.contacts.map(contact=>({...contact}))};
    item.observedContacts=item.contacts.map(contact=>{
      const pointerId=pointerIds.get(contact.id);
      const index=observed.findIndex((e,i)=>!used.has(i)&&e.trusted===true&&e.pointerType===input&&e.type===item.type
        &&(pointerId!==undefined||![...pointerIds.values()].includes(e.pointerId))
        &&(pointerId===undefined||e.pointerId===pointerId)&&Math.abs(e.x-contact.x)<1&&Math.abs(e.y-contact.y)<1);
      if(index<0)return {id:contact.id,dropped:true};
      used.add(index);const event=observed[index];
      if(pointerId===undefined)pointerIds.set(contact.id,event.pointerId);
      return {id:contact.id,event,arrivalLatenessMs:event.timeStamp-item.dueBrowser,
        queueMs:event.handlerAt-event.timeStamp,inputToFrameMs:event.inputToFrameMs,
        timestampDomainValid:Number.isFinite(event.timeStamp)&&event.timeStamp>=0&&event.timeStamp<=event.handlerAt+1};
    });
    item.dropped=item.observedContacts.some(contact=>contact.dropped);
    return item;
  });
  const contacts=matchedSchedule.flatMap(item=>item.observedContacts),lag=Math.max(...matchedSchedule.map(e=>e.dispatchLatenessMs));
  return {schedule:matchedSchedule,observed,calibration,summary:{model:'fixed offered rate; acknowledgements do not pace dispatch',
    input,offered:matchedSchedule.length,matched:matchedSchedule.filter(e=>!e.dropped).length,
    dropped:matchedSchedule.filter(e=>e.dropped).length,offeredContacts:contacts.length,
    matchedContacts:contacts.filter(e=>!e.dropped).length,droppedContacts:contacts.filter(e=>e.dropped).length,
    cancelled:observed.filter(e=>e.type==='pointercancel').length,
    missingFrames:contacts.filter(e=>e.event&&!Number.isFinite(e.inputToFrameMs)).length,
    invalidTimestamps:contacts.filter(e=>e.event&&!e.timestampDomainValid).length,
    coalesced:observed.filter(e=>e.coalesced).length,unmatchedObserved:observed.length-used.size,
    protocolErrors:matchedSchedule.filter(e=>e.protocolError).length,maxHostDispatchLatenessMs:lag,
    frameWitness:'double-rAF opportunity with passive raw camera DTO, not physical scanout'}};
}

async function dispatchSchedule({page,cdp,schedule,input,steps,intervalMs,timeoutMs}){
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('positive finite offered gesture deadline required');
  if(!['mouse','touch'].includes(input))throw new Error('unsupported offered input type');
  const expires=performance.now()+timeoutMs,timers=new Set();let success=false;
  const bounded=(promise,label)=>withDeadline(promise,Math.max(1,expires-performance.now()),`offered input ${label}`);
  try{
    await bounded(page.evaluate(installOfferedInputObserver),'observer install');
    const samples=[];
    for(let index=0;index<9;index++){
      const hostSent=performance.now(),browserNow=await bounded(page.evaluate(()=>performance.now()),'clock calibration'),hostReceived=performance.now();
      samples.push({hostSent,hostReceived,browserNow});
    }
    // A browser sample occurs within its host round trip. Intersect all nine
    // causal offset intervals; never assume symmetric renderer queue latency.
    const lower=Math.max(...samples.map(s=>s.browserNow-s.hostReceived));
    const upper=Math.min(...samples.map(s=>s.browserNow-s.hostSent));
    const calibration={samples,policy:'intersection of nine causal round-trip offset bounds',
      browserMinusHost:(lower+upper)/2,uncertaintyMs:upper>=lower?(upper-lower)/2:Infinity,
      lowerBrowserMinusHost:lower,upperBrowserMinusHost:upper};
    if(performance.now()>=expires)throw new Error('offered input deadline exceeded before dispatch');
    const start=performance.now()+20;
    const pending=schedule.map(item=>new Promise(resolve=>{
      const due=start+item.at;item.dueHost=due;item.dueBrowser=due+calibration.browserMinusHost;
      const timer=setTimeout(()=>{
        timers.delete(timer);item.dispatchedHost=performance.now();item.dispatchLatenessMs=item.dispatchedHost-due;
        // Each due time is fixed before any acknowledgement arrives.
        const first=item.contacts[0];let protocol;
        try{
          protocol=input==='mouse'?cdp.send('Input.dispatchMouseEvent',{
            type:item.kind==='start'?'mousePressed':item.kind==='end'?'mouseReleased':'mouseMoved',
            x:first.x,y:first.y,button:'left',buttons:item.kind==='end'?0:1,clickCount:item.kind==='move'?0:1,
          }):cdp.send('Input.dispatchTouchEvent',{
            type:item.kind==='start'?'touchStart':item.kind==='end'?'touchEnd':'touchMove',
            touchPoints:item.kind==='end'?[]:item.contacts.map(point=>({...point,radiusX:6,radiusY:6,force:1})),
          });
        }catch(error){protocol=Promise.reject(error);}
        Promise.resolve(protocol).then(()=>{item.acknowledgedHost=performance.now();resolve();},error=>{
          item.protocolError=error.message;item.acknowledgedHost=performance.now();resolve();
        });
      },Math.max(0,due-performance.now()));timers.add(timer);
    }));
    await bounded(Promise.all(pending),'acknowledgements');
    const observed=await bounded(page.evaluate(async()=>{
      const probe=__HC_OFFERED__;probe.stop();await Promise.all(probe.pending);return probe.events;
    }),'frame observation');
    if(performance.now()>=expires)throw new Error('offered input deadline exceeded before completion');
    const result=matchOfferedEvents(schedule,observed,input,calibration);
    Object.assign(result.summary,{intervalMs,steps,generatorSaturated:result.summary.maxHostDispatchLatenessMs>Math.max(10,intervalMs),
      calibrationResolved:calibration.uncertaintyMs<=Math.min(5,intervalMs/4)});
    success=true;return result;
  }finally{
    for(const timer of timers)clearTimeout(timer);
    if(!success){
      await withDeadline(page.evaluate(()=>globalThis.__HC_OFFERED__?.stop({cancelFrames:true})),1000,'offered input observer cleanup').catch(()=>{});
      const cancel=Promise.resolve().then(()=>input==='touch'?cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
        :cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:schedule.at(-1).contacts[0].x,y:schedule.at(-1).contacts[0].y,button:'left',buttons:0}));
      await withDeadline(cancel,1000,'offered input gesture cleanup').catch(()=>{});
    }
  }
}
export async function dispatchOfferedDrag({page,cdp,from,to,input='mouse',steps=12,intervalMs=1000/60,timeoutMs=30000}){
  return dispatchSchedule({page,cdp,input,steps,intervalMs,timeoutMs,schedule:createDragSchedule({from,to,steps,intervalMs})});
}
export async function dispatchOfferedPinch({page,cdp,center,startSpan,endSpan,steps=12,intervalMs=1000/60,timeoutMs=30000}){
  return dispatchSchedule({page,cdp,input:'touch',steps,intervalMs,timeoutMs,schedule:createPinchSchedule({center,startSpan,endSpan,steps,intervalMs})});
}
