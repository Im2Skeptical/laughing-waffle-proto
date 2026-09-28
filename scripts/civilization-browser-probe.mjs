import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
const port=18886,url=`http://127.0.0.1:${port}`,artifact='artifacts/civilization-browser-probe.json';
mkdirSync('artifacts',{recursive:true});
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l',String(port),'--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
let browser,page;const checks=[],errors=[];
try {
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
 browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
 for(const candidateIndex of [0,1]) {
  page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',e=>errors.push(e.message));
  const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
  const click=async(method,arg)=>{
   const p=await page.evaluate(([method,arg])=>__SETTLEMENT_DEBUG__[method](arg),[method,arg]);
   assert.ok(p,method);const b=await page.locator('canvas').boundingBox();
   await page.mouse.click(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);await delay(200);
  };
  await page.goto(url);
  await page.getByTestId('game-new').click();await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening.phase==='completed');
  await click('getTimeActionClickPoint');
  await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===s.frontierSec&&!s.graph.forecastRevealPlayheadFollowEnabled;});
  const start=await snapshot(),markers=start.worldMap.regionMapIndicators;
  assert.equal(markers.filter(r=>r.controller==='player').length,2);
  assert.equal(markers.filter(r=>r.controller==='external-a').length,4);
  const neutral=markers.find(r=>r.controller==='external-a');
  await click('getWorldMapClickPoint',neutral.regionId);
  const selected=await snapshot();
  assert.equal(selected.worldMap.selectedRegion.detailedSettlement.practices.length,12);
  await page.screenshot({path:`artifacts/civilization-${candidateIndex}-neutral.png`});
  assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.openNextSelection())).ok,true);
  const candidates=(await snapshot()).vassalSelectionPool.candidates;
  assert.equal(candidates[candidateIndex].classId,candidateIndex?'warrior':'scholar');
  await click('getVassalCandidateClickPoint',candidateIndex);
  await click('getNavigationClickPoint','vassal');
  assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getLastVassalSelectionResult())).ok,true);
  const selectedVassal=await snapshot();
  const first=selectedVassal.lineage.currentVassal.availableNodeIds[0];
  await click('getLifeMapNodeClickPoint',first);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision?.animation?.phase==='open');
  await click('getLifeMapEnterNodeClickPoint');
  await click('getLifeMapOptionClickPoint',0);
  assert.equal((await snapshot()).lifeMapDecision.selectedOptionId,'train-estate');
  await page.screenshot({path:`artifacts/civilization-${candidateIndex}-founding.png`});
  await click('getLifeMapConfirmClickPoint');
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().frontierSec>0);
  const resolved=await snapshot();
  assert.ok(resolved.frontierSec>=1,'founding resolves through authoritative time');
  assert.ok(resolved.worldMap.selectedRegion.detailedSettlement.specialists[candidateIndex?'warrior':'scholar']>= (candidateIndex?10:2));
  if(candidateIndex) assert.ok(resolved.lifeMapHud.retinue.cap>=1,'Warrior population supports a Retinue cap');
  checks.push(`${candidateIndex?'Warrior':'Scholar'}: real New Game, four neutrals, twelve-slot panel, candidate, founding confirmation and time resolution`);
  await page.close();page=null;
 }
 assert.deepEqual(errors,[]);writeFileSync(artifact,JSON.stringify({ok:true,checks},null,2));
 console.log('[probe:civilization] OK: Starter neutrals and both class founding flows');
} catch(e) {
 if(page)await page.screenshot({path:'artifacts/civilization-browser-failure.png'}).catch(()=>{});
 const detail=page?await page.evaluate(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return {viewedSec:s.viewedSec,frontierSec:s.frontierSec,lineage:s.lineage,decision:s.lifeMapDecision};}).catch(()=>null):null;
 writeFileSync(artifact,JSON.stringify({error:e.stack,errors,checks,detail},null,2));
 console.error('[probe:civilization] FAILED: '+e.message.split('\n')[0]+'; '+artifact);process.exitCode=1;
} finally {await browser?.close();server.kill();}
