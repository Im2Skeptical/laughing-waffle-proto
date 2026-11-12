import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// npm start first. A blank same-origin document isolates opening preparation
// from game rendering, terrain/artwork uploads and background game workers.
const url=new URL('build-info.json',process.argv[2]??'http://localhost:5184/');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.goto(url.href);
 const report=await page.evaluate(async()=>{
  const info=await (await fetch('/build-info.json')).json();
  const node=document.createElement('script');node.id='game-build-info';node.textContent=JSON.stringify(info);document.body.append(node);
  const {loadPerformanceStart}=await import('/src/controllers/performance-start.js');
  const {createNewGameOpeningController}=await import('/src/controllers/new-game-opening-controller.js');
  const {createNewGameState}=await import('/src/model/new-game.js');
  const {createTimegraphForecastWorkerService}=await import('/src/controllers/timegraph-forecast-worker-service.js');
  const {createSettlementProjectionCache,SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC}=await import('/src/views/ui-root/settlement-timegraph-window.js');
  const rows=[];
  let endSec;
  for(const kind of ['prepared','live','prepared','live','prepared','live']){
   let workers=0;
   const opening=createNewGameOpeningController({
    loadPrepared:kind==='prepared'?loadPerformanceStart:null,
    createState:()=>createNewGameState(123),
    createCache:()=>createSettlementProjectionCache({horizonSec:endSec}),
    createWorkerService:()=>{workers++;return createTimegraphForecastWorkerService();},
    searchLimitSec:endSec,
   });
   const start=performance.now();const result=await opening.prepare();const elapsedMs=performance.now()-start;
   if(!result.ok)throw Error(result.reason);
   endSec??=result.forecast.endSec;
   rows.push({kind,elapsedMs,workers,seed:result.state.rng.baseSeed,endSec:result.forecast.endSec,lossSec:result.lossSec});
   opening.cancel();
  }
  return {rows,bakedEndSec:endSec,normalSearchLimitSec:SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC,userAgent:navigator.userAgent};
 });
 for(const row of report.rows){
  assert.equal(row.seed,123);
  assert.equal(row.endSec,report.bakedEndSec,'compare identical coverage');
  assert.equal(row.lossSec,report.rows[0].lossSec,'compare identical loss detection');
  assert.equal(row.workers,row.kind==='prepared'?0:1,'baked opening must skip the forecast worker');
 }
 const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const preparedMs=median(report.rows.filter(row=>row.kind==='prepared').map(row=>row.elapsedMs));
 const liveMs=median(report.rows.filter(row=>row.kind==='live').map(row=>row.elapsedMs));
 report.medians={preparedMs,liveMs,speedup:liveMs/preparedMs};
 await mkdir('artifacts',{recursive:true});
 await writeFile('artifacts/performance-seed-probe.json',JSON.stringify(report,null,2));
 console.log(`[performance-seed] seed 123, ${report.bakedEndSec}s coverage; prepared ${preparedMs.toFixed(0)}ms, live ${liveMs.toFixed(0)}ms (${(liveMs/preparedMs).toFixed(1)}x); workers 0 vs 1; details=artifacts/performance-seed-probe.json`);
}finally{await browser.close();}
