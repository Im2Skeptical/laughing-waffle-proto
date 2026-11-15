import vm from 'node:vm';
import {writeFileSync} from 'node:fs';
import {installRuntime} from './reviewed-source/browser-runtime.mjs';
function setup(instrumentation=false){
 let now=0,id=1;const queue=[],timers=new Map();
 const c=vm.createContext({performance:{now:()=>now},Worker:class{},
  PerformanceObserver:class{observe(){} takeRecords(){return[];}},
  setTimeout(fn,ms){const k=id++;timers.set(k,{fn,due:now+Number(ms||0)});return k;},
  clearTimeout:k=>timers.delete(k),requestAnimationFrame:fn=>queue.push(fn),
  document:{addEventListener(){},removeEventListener(){}}});
 vm.runInContext('('+installRuntime.toString()+')({instrumentation:'+instrumentation+'})',c);
 return {r:c.__HC__,frame(ms){now+=ms;for(const[k,t]of[...timers])if(t.due<=now){timers.delete(k);t.fn();}const q=queue.splice(0);for(const f of q)f(now);}};
}
const invalid=[];
for(const timeout of [NaN,Infinity,-1,0]){
 const f=setup();let result;
 try{f.r.arm({name:'invalid-deadline',startNow:true,timeoutMs:timeout});f.r.probe(()=>true,{terminal:true});f.frame(16);f.frame(16);const value=await f.r.finish({control:true});result={accepted:true,elapsedMs:value.elapsedMs,timeout:value.timeout};}
 catch(e){result={accepted:false,error:e.message};if(f.r.active)f.r.cancel('edge cleanup');}
 invalid.push({input:String(timeout),...result});
}
const f=setup(true);f.frame(16);f.frame(200);f.frame(16);
const zero=f.r.readContinuousWindow({startMs:16,endMs:16});
const positive=f.r.readContinuousWindow({startMs:0,endMs:16});
const result={invalidDeadlines:invalid,zeroDurationWindow:{startMs:zero.startMs,endMs:zero.endMs,frames:zero.frames},endBoundaryWindow:{startMs:positive.startMs,endMs:positive.endMs,frames:positive.frames},scope:'virtual semantic edge checks; no browser latency claim'};
writeFileSync(new URL(`./edge-controls-reproduction-${Date.now()}.json`,import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({invalidDeadlines:invalid,zeroDurationFrames:zero.frames.length,endBoundaryFrames:positive.frames.length}));
