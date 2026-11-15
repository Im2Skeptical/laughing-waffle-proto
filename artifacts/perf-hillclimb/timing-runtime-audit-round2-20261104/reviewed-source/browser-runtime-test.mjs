// Fast semantic controls for the actual serialized runtime. These virtual-clock
// controls supplement, never replace, actual Chromium input/completion proof.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installRuntime} from './browser-runtime.mjs';

function fixture(timeoutMs=1000) {
  let now=0,nextTimer=1;
  const frames=[],timers=new Map(),listeners=new Map();
  const context=vm.createContext({
    performance:{now:()=>now},Worker:class {},
    setTimeout(fn,ms){const id=nextTimer++;timers.set(id,{fn,due:now+ms});return id;},
    clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:fn=>frames.push(fn),
    document:{
      addEventListener(name,fn){listeners.set(name,fn);},
      removeEventListener(name){listeners.delete(name);},
    },
  });
  vm.runInContext(`(${installRuntime.toString()})({instrumentation:false})`,context);
  const runtime=context.__HC__;
  runtime.arm({name:'semantic-control',timeoutMs});
  const input=()=>listeners.get('pointerdown')?.({timeStamp:now,isTrusted:true,type:'pointerdown'});
  input();
  const advance=ms=>{
    now+=ms;
    for(const [id,t]of [...timers])if(t.due<=now){timers.delete(id);t.fn();}
  };
  const frame=(ms=16)=>{advance(ms);const callbacks=frames.splice(0);for(const fn of callbacks)fn(now);};
  return {runtime,input,advance,frame,timers};
}
const finish=f=>f.runtime.finish({control:true}).then(value=>({value}),error=>({error:error.message}));
async function rejected(outcome,label) {
  const result=await outcome;
  assert.match(result.error??'',/terminal|completion|timeout|synchronous/i,label);
}
function cancel(f){if(f.runtime.active)f.runtime.cancel('expected semantic-control cleanup');}

// A same-key false observation must erase an earlier true observation.
{
  const f=fixture();let ready=true;
  f.runtime.probe(()=>ready,{key:'generation',terminal:true});ready=false;
  f.runtime.probe(()=>ready,{key:'generation',terminal:true});
  const outcome=finish(f);f.frame();f.frame();
  await rejected(outcome,'transient true followed by false cannot pass');cancel(f);
}
// Readiness must remain true during the frame opportunities, even if the host
// has stopped polling after its first successful wait.
for(const invalidateAfterFirstFrame of [false,true]) {
  const f=fixture();let ready=true;
  f.runtime.probe(()=>ready,{key:'stable-through-frame',terminal:true});
  const outcome=finish(f);
  if(invalidateAfterFirstFrame)f.frame();
  ready=false;f.frame();f.frame();
  await rejected(outcome,'readiness invalidation during frame completion cannot pass');cancel(f);
}
// A stale generation between browser completion and host delivery must fail.
{
  const f=fixture();let generation=1;
  f.runtime.probe(()=>generation===1,{key:'expected-generation-1',terminal:true});
  f.frame();f.frame();generation=2;
  await rejected(finish(f),'finish must reject stale terminal generation');cancel(f);
}
{
  const f=fixture();
  assert.throws(()=>f.runtime.probe(()=>Promise.resolve(false),{terminal:true}),/synchronous/,
    'a Promise object is not a completed terminal result');cancel(f);
}
// Honest frame completion excludes host delivery, while genuinely late frame
// completion remains a timeout. A stopped frame loop must have a deadline.
{
  const f=fixture(50);f.runtime.probe(()=>true,{terminal:true});f.frame();f.frame();f.advance(100);
  const result=await finish(f);assert.equal(result.value?.elapsedMs,32,'host delay cannot become application latency');
  assert.equal(f.timers.size,0,'successful completion clears timers');
}
{
  const f=fixture(20);f.runtime.probe(()=>true,{terminal:true});const outcome=finish(f);f.frame();f.frame();
  await rejected(outcome,'late visible completion exceeds deadline');cancel(f);
}
{
  const f=fixture(50);f.runtime.probe(()=>true,{terminal:true});const outcome=finish(f);f.advance(51);
  await rejected(outcome,'missing animation frames cannot hang finish forever');cancel(f);
}
console.log('[hillclimb-runtime] transient/stale readiness, synchronous terminals, frame stability and deadline controls passed (virtual clock; browser proof still required)');
