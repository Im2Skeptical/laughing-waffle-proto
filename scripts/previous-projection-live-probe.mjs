import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const output='artifacts/previous-projection-live';mkdirSync(output,{recursive:true});
const url=new URL(process.argv[2]??'http://localhost:5184/');url.search='?dev=1&perf=1&art=0&launch=new';
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS),page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};screen.orientation.lock=async()=>{};});
 await page.goto(url.href);
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot().opening.phase==='completed',null,{timeout:120000});
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.openNextSelection());
 const result=await page.evaluate(()=>__SETTLEMENT_DEBUG__.selectCandidate(0));assert.equal(result.ok,true);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().graph.projectionReplacement?.active);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.vassalPreparation.chooser.visible===false);
 const before=await page.evaluate(()=>{
  const s=__SETTLEMENT_DEBUG__.getSnapshot();
  return {graph:s.graph,history:s.runner.timeline.historyEndSec,actions:s.runner.timeline.actionCount,live:JSON.stringify(s.lineage),seed:s.runner.baseSeed};
 });
 assert.ok(before.graph.previousProjectionBrowseEndSec>0,`retained browse cap: ${JSON.stringify({cap:before.graph.previousProjectionBrowseEndSec,overlay:before.graph.projectionReplacement,visible:before.graph.revealedCoverageEndSec,computed:before.graph.computedCoverageEndSec})}`);
 const target=before.graph.previousProjectionBrowseEndSec/2;
 const ratio=(target-before.graph.minSec)/(before.graph.maxSec-before.graph.minSec);
 const p=await page.evaluate(r=>__SETTLEMENT_DEBUG__.getGraphClickPoint(r),ratio);
 await page.touchscreen.tap(p.x,p.y);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().graph.viewingPreviousProjection);
 await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
 const after=await page.evaluate(()=>{
  const s=__SETTLEMENT_DEBUG__.getSnapshot();
  return {history:s.runner.timeline.historyEndSec,actions:s.runner.timeline.actionCount,live:JSON.stringify(s.lineage),seed:s.runner.baseSeed,preview:s.runner.previewStatus,presentation:s.lifeMap,scope:s.graph.scopeLabel};
 });
 assert.equal(after.history,before.history);assert.equal(after.actions,before.actions);assert.equal(after.live,before.live);assert.equal(after.seed,before.seed);
 assert.equal(after.presentation.readOnly,true);assert.equal(after.preview.isForecastPreview,true);assert.match(after.scope,/Previous projection/);
 assert.ok(after.preview.previewSec<=before.graph.previousProjectionBrowseEndSec);
 await page.screenshot({path:`${output}/phone.png`});assert.deepEqual(errors,[]);
 writeFileSync(`${output}/result.json`,JSON.stringify({ok:true,cap:before.graph.previousProjectionBrowseEndSec,previewSec:after.preview.previewSec,readOnly:true,frontierUnchanged:true,errors},null,2));
 console.log('[previous-projection-live] PASS actual vassal selection, touch browse, read-only Life Map, unchanged frontier/actions/seed');
}catch(e){await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});const diagnostic=await page.evaluate(()=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();return s?{frontier:s.frontierSec,viewed:s.viewedSec,preview:s.runner.previewStatus,graph:{min:s.graph.minSec,max:s.graph.maxSec,scrub:s.graph.scrubSec,cap:s.graph.previousProjectionBrowseEndSec,current:s.graph.revealedCoverageEndSec,computed:s.graph.computedCoverageEndSec,previous:s.graph.viewingPreviousProjection},lifeReadOnly:s.lifeMap.readOnly}:null;}).catch(()=>null);writeFileSync(`${output}/result.json`,JSON.stringify({error:e.stack,errors,diagnostic},null,2));console.error(`[previous-projection-live] FAILED ${e.message}; ${output}/result.json`);process.exitCode=1;}
finally{await browser.close();}
