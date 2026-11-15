import assert from 'node:assert/strict';
import {createDragSchedule,createPinchSchedule,matchOfferedEvents,dispatchOfferedPinch,installOfferedInputObserver} from './offered-input.mjs';

const pinch=createPinchSchedule({center:{x:200,y:100},startSpan:80,endSpan:160,steps:2,intervalMs:10});
assert.deepEqual(pinch.map(item=>[item.at,item.type,item.contacts.map(({x,y})=>[x,y])]),[
  [0,'pointerdown',[[160,100],[240,100]]],
  [10,'pointermove',[[140,100],[260,100]]],
  [20,'pointermove',[[120,100],[280,100]]],
  [30,'pointerup',[[120,100],[280,100]]],
]);
const drag=createDragSchedule({from:{x:10,y:20},to:{x:30,y:40},steps:2,intervalMs:5});
assert.equal(drag.length,4);assert.deepEqual(drag[1].contacts,[{id:1,x:20,y:30}]);
for(const bad of [NaN,Infinity,0,-1])assert.throws(()=>createPinchSchedule({center:{x:0,y:0},startSpan:20,endSpan:40,intervalMs:bad}),/schedule/);
assert.throws(()=>createPinchSchedule({center:{x:0,y:0},startSpan:20,endSpan:20}),/spans/);
assert.throws(()=>createDragSchedule({from:{x:NaN,y:0},to:{x:2,y:3}}),/finite/);
assert.throws(()=>createDragSchedule({from:{x:1,y:2},to:{x:1,y:2}}),/move/);

const schedule=pinch.map(item=>({...item,dueBrowser:100+item.at,dispatchLatenessMs:0}));
const observed=schedule.flatMap(item=>item.contacts.map(point=>({type:item.type,pointerType:'touch',pointerId:point.id+40,
  x:point.x,y:point.y,timeStamp:item.dueBrowser+2,handlerAt:item.dueBrowser+7,frameAt:item.dueBrowser+30,
  inputToFrameMs:28,trusted:true,coalesced:false,reference:{mode:'map',camera:{zoom:1}}})));
const matched=matchOfferedEvents(schedule,observed,'touch',{});
assert.equal(matched.summary.matchedContacts,8);assert.equal(matched.summary.dropped,0);
assert.equal(matched.schedule[1].observedContacts[0].queueMs,5);
assert.equal(matched.schedule[1].observedContacts[0].arrivalLatenessMs,2);
assert.equal(matchOfferedEvents(schedule,observed.slice(1),'touch',{}).summary.droppedContacts,1,'lost first contact remains missing');
const wrongIdentity=observed.map((e,i)=>i===2?{...e,pointerId:999}:e);
assert.equal(matchOfferedEvents(schedule,wrongIdentity,'touch',{}).summary.droppedContacts,1,'a different pointer cannot satisfy the retained contact');
assert.equal(matchOfferedEvents(schedule,observed.map(e=>({...e,trusted:false})),'touch',{}).summary.matchedContacts,0,'synthetic events cannot stand in for trusted input');
assert.equal(matchOfferedEvents(schedule,observed,'mouse',{}).summary.matchedContacts,0,'mouse input cannot count as a touch pinch');
assert.equal(matchOfferedEvents(schedule,observed.map(e=>({...e,inputToFrameMs:undefined})),'touch',{}).summary.missingFrames,8);

// This fake protocol tests host scheduling/liveness only. It is not product
// gesture or real-browser evidence; the browser controls must prove that too.
function protocolFixture({ackDelayMs=0,missingFrame=false}={}){
  const calls=[],events=[];let previous=[],cleaned=false;
  const page={evaluate:async fn=>{
    if(fn===installOfferedInputObserver)return;
    const source=String(fn);
    if(source.includes('cancelFrames:true')){cleaned=true;return;}
    if(source.includes('probe.pending'))return missingFrame?new Promise(()=>{}):events;
    return performance.now()+1000;
  }};
  const cdp={send:(method,params)=>{
    const call={method,params,sent:performance.now()};calls.push(call);
    if(params.type!=='touchCancel'){
      const contacts=params.type==='touchEnd'?previous:params.touchPoints;
      const type=params.type==='touchStart'?'pointerdown':params.type==='touchEnd'?'pointerup':'pointermove';
      for(const point of contacts){const stamp=performance.now()+1000;events.push({type,pointerType:'touch',pointerId:point.id+10,
        x:point.x,y:point.y,timeStamp:stamp,handlerAt:stamp+1,inputToFrameMs:30,frameAt:stamp+30,trusted:true});}
      previous=params.touchPoints;
    }
    return new Promise(resolve=>setTimeout(()=>{call.acknowledged=performance.now();resolve();},ackDelayMs));
  }};
  return {page,cdp,calls,isCleaned:()=>cleaned};
}
const protocol=protocolFixture({ackDelayMs:80});
const dispatched=await dispatchOfferedPinch({...protocol,center:{x:200,y:100},startSpan:80,endSpan:160,steps:3,intervalMs:10,timeoutMs:3000});
assert.equal(protocol.calls.length,5);assert.ok(protocol.calls.every(c=>c.method==='Input.dispatchTouchEvent'));
assert.ok(protocol.calls[1].sent<protocol.calls[0].acknowledged,'a slow ACK must not pace the next offered touch command');
assert.equal(dispatched.summary.droppedContacts,0);assert.equal(dispatched.summary.offeredContacts,10);
assert.equal(protocol.calls.at(-1).params.type,'touchEnd');assert.deepEqual(protocol.calls.at(-1).params.touchPoints,[]);
const missing=protocolFixture({missingFrame:true});
await assert.rejects(dispatchOfferedPinch({...missing,center:{x:200,y:100},startSpan:80,endSpan:160,steps:1,intervalMs:5,timeoutMs:200}),/timeout|deadline/);
assert.equal(missing.isCleaned(),true);assert.equal(missing.calls.at(-1).params.type,'touchCancel');
for(const timeoutMs of [0,NaN,Infinity])await assert.rejects(dispatchOfferedPinch({...protocol,center:{x:200,y:100},startSpan:80,endSpan:160,timeoutMs}),/deadline/);
console.log('[hillclimb-offered-input] host controls pass: two contacts, fixed rate, identity/drop accounting and bounded frame cleanup; actual-browser proof still required');
