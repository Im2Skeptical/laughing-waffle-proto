// Foreground Chromium timing probe. Detailed output stays in artifacts/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const label = process.argv[2] ?? 'current';
const port = 8187;
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js','-l',String(port),'--no-clipboard','dist'], {stdio:'ignore',windowsHide:true});
mkdirSync('artifacts',{recursive:true});
let browser;
const errors=[]; const network=[]; const consoleErrors=[];
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch({headless:process.env.PROBE_HEADLESS==='1'});
  const mobile=process.env.PROBE_MOBILE==='1';
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});
  if (Number(process.env.PROBE_CPU_RATE)>1) {
    const session=await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.PROBE_CPU_RATE)});
  }
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  page.on('response', r=>{if(r.url().includes('timegraph-forecast-worker'))network.push({url:r.url(),status:r.status(),contentType:r.headers()['content-type']});});
  const cdp=await browser.newBrowserCDPSession();
  const gpu=await cdp.send('SystemInfo.getInfo');
  await page.addInitScript(()=>{
    globalThis.__PERF_ENABLED__=true;
    globalThis.__workerEvents=[];
    const OriginalWorker=globalThis.Worker;
    globalThis.Worker=class extends OriginalWorker {
      constructor(...args){super(...args);this.addEventListener('error',e=>globalThis.__workerEvents.push({kind:'error',message:e.message,time:performance.now()}));this.addEventListener('message',e=>globalThis.__workerEvents.push({kind:'message',time:performance.now(),ok:e.data?.result?.ok,reason:e.data?.result?.reason,base:e.data?.baseSec,end:e.data?.endSec,done:e.data?.done}));}
      postMessage(m,...args){globalThis.__workerEvents.push({kind:'request',time:performance.now(),base:m.baseSec,end:m.endSec});return super.postMessage(m,...args);}
      terminate(){globalThis.__workerEvents.push({kind:'terminate',time:performance.now()});return super.terminate();}
    };
    localStorage.setItem('civsurvivor.debugProfiles.boot.v2','probe-authored-setup');
  });
  if (process.env.PROBE_LONG_LIVED === '1' || process.env.PROBE_LEGACY_REVEAL === '1') {
    await page.route('**/assets/app-*.js', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const marker = 'recomputeInitialActionPoints(state);\n  return state;';
      if (!source.includes(marker)) throw new Error('long-lived fixture injection point changed');
      let body = process.env.PROBE_LONG_LIVED === '1' ? source.replace(marker,
        'recomputeInitialActionPoints(state);\n  state.gameConfig.settings.values.monsterLossThreshold = 10000000;\n  state.civilization.chaos.monsterLossThreshold = 10000000;\n  return state;') : source;
      if (process.env.PROBE_LEGACY_REVEAL === '1') {
        for (const [a,b] of [["maxRateSecPerSec: 384","maxRateSecPerSec: 112"],["followResponseSec: 0.45","followResponseSec: 1.1"],["accelerationSecPerSec2: 720","accelerationSecPerSec2: 180"],["decelerationSecPerSec2: 1040","decelerationSecPerSec2: 260"]]) body=body.replace(a,b);
      }
      await route.fulfill({ response, body });
    });
  }
  await page.goto(url);
  await page.waitForFunction(()=>!!globalThis.__SETTLEMENT_DEBUG__?.enterBootTestRun);
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.enterBootTestRun());
  await page.evaluate(()=>{
    globalThis.__frames=[]; globalThis.__steadyFrames=[]; const start=performance.now(); let last=start;
    function frame(t){globalThis.__frames.push(t-last);if(t-start>2000)globalThis.__steadyFrames.push(t-last);last=t;if(globalThis.__frames.length<20000)requestAnimationFrame(frame);}
    requestAnimationFrame(frame);
  });
  const samples=[];const start=Date.now();
  for(let i=0;i<Number(process.env.PROBE_SAMPLES ?? 48);i++){
    await delay(500);
    samples.push({ms:Date.now()-start,...await page.evaluate(()=>{
      const d=globalThis.__SETTLEMENT_DEBUG__;const s=d.getSnapshot();
      return {viewed:s.viewedSec,frontier:s.frontierSec,cap:s.browseCapSec,graph:s.graph,controller:s.controller,forecast:s.forecastStatus,perf:d.getPerfSnapshot()};
    })});
  }
  const frames=await page.evaluate(()=>globalThis.__frames);
  const steadyFrames=await page.evaluate(()=>globalThis.__steadyFrames);
  const restore=await page.evaluate(()=>{
    const d=globalThis.__SETTLEMENT_DEBUG__;const s=d.getSnapshot();const cap=Math.min(s.browseCapSec,s.graph.revealedCoverageEndSec);
    const times=[];
    for(let i=0;i<20;i++) {const sec=Math.floor(cap*((i*7)%20)/20);const t=performance.now();d.browseSecond(sec);d.forceRender();times.push({sec,ms:performance.now()-t,viewed:d.getSnapshot().viewedSec});}
    return times;
  });
  const pct=(a,p)=>{const v=a.filter(x=>x>=0).sort((a,b)=>a-b);return v[Math.min(v.length-1,Math.floor(v.length*p))];};
  const workerEvents=await page.evaluate(()=>globalThis.__workerEvents);
  const result={mobile,cpuRate:Number(process.env.PROBE_CPU_RATE??1),longLived:process.env.PROBE_LONG_LIVED==='1',steadyFrames:{p95:pct(steadyFrames,.95),p99:pct(steadyFrames,.99),max:Math.max(...steadyFrames),over50:steadyFrames.filter(x=>x>50).length},network,consoleErrors,workerEvents,label,headless:process.env.PROBE_HEADLESS==='1',gpu:gpu.gpu,errors,samples,restore,frames:{count:frames.length,p50:pct(frames,.5),p95:pct(frames,.95),p99:pct(frames,.99),max:Math.max(...frames),over50:frames.filter(x=>x>50).length}};
  writeFileSync(`artifacts/timegraph-performance-${label}.json`,JSON.stringify(result,null,2));
  await page.screenshot({path:`artifacts/timegraph-performance-${label}.png`});
  console.log(JSON.stringify({label,gpu:gpu.gpu.devices,errors,frames:result.frames,steadyFrames:result.steadyFrames,revealed:samples.at(-1).graph.revealedCoverageEndSec,worker:samples.at(-1).perf.settlement?.forecast,restoreP95:pct(restore.map(x=>x.ms),.95),artifact:`artifacts/timegraph-performance-${label}.json`}));
  if (process.env.PROBE_ASSERT_SMOOTH==='1' && (result.steadyFrames.max>50 || pct(restore.map(x=>x.ms),.95)>33)) {
    console.error('FAIL: steady frame >50ms or restore+render p95 >33ms; see artifact');
    process.exitCode=1;
  }
  if(errors.length || network.some(r=>r.status!==200) || !(samples.at(-1).perf.settlement?.forecast?.workerBuiltSec>0))process.exitCode=1;
} finally {await browser?.close();server.kill();}
