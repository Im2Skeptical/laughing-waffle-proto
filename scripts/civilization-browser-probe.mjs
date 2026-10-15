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
  page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
  const click=async(method,arg)=>{
   const p=await page.evaluate(([method,arg])=>__SETTLEMENT_DEBUG__[method](arg),[method,arg]);
   assert.ok(p,method);if(!Number.isFinite(p.x))throw new Error('bad point '+method+' '+arg+' '+JSON.stringify(p));const b=await page.locator('canvas').boundingBox();
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
  assert.equal(selected.worldMap.selectedRegion.detailedSettlement.practices.length,5);
  await page.screenshot({path:`artifacts/civilization-${candidateIndex}-neutral.png`});
  assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.openNextSelection())).ok,true);
  const candidates=(await snapshot()).vassalSelectionPool.candidates;
  assert.equal(candidates[candidateIndex].classId,null);
  assert.equal(candidates[candidateIndex].founderClassId,candidateIndex?'warrior':'scholar');
  assert.equal(candidates[candidateIndex].archetype,candidateIndex?'Warlord':'Philosopher');
  assert.equal(candidates.length,2,'two available founders');
  await click('getVassalCandidateClickPoint',candidateIndex);
  const dossier=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getFounderSnapshot());
  assert.equal(dossier.classId,candidateIndex?'warrior':'scholar');
  assert.equal(dossier.replacedStat,candidateIndex?'Intelligence':'Cunning');
  await click('getFounderControlClickPoint',dossier.classStat);
  assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getFounderSnapshot())).tooltip,dossier.classStat);
  await page.screenshot({path:`artifacts/civilization-${candidateIndex}-dossier-tooltip.png`});
  await click('getFounderControlClickPoint',dossier.classStat);
  assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getFounderSnapshot())).tooltip,null,'tapping the pinned detail again closes it');
  const founderState=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getFounderSnapshot());
  const settled=()=>page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getFounderSnapshot().transitioning);
  assert.equal(dossier.lockedSlots,2,'two locked founder slots');
  const firstTab=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getFounderControlClickPoint('tab:0')),lastTab=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getFounderControlClickPoint('tab:3'));
  assert.ok(Math.abs((firstTab.x+lastTab.x)/2-1212)<2,'the four class slots are centred in the modal');assert.equal(firstTab.y,lastTab.y);
  await click('getFounderControlClickPoint','tab:2');
  assert.match((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState())).title,/Locked/,'locked slot explains itself');
  await page.keyboard.press('Escape');
  assert.equal((await founderState()).tooltip,null,'Escape closes the pinned detail first');
  await page.keyboard.press('ArrowRight');
  await settled();
  assert.notEqual((await founderState()).classId,dossier.classId,'arrow keys switch class');
  await click('getFounderControlClickPoint',candidateIndex?'tab:0':'tab:1');
  await settled();
  assert.equal((await founderState()).classId,dossier.classId,'class tabs switch back');
  await page.screenshot({path:`artifacts/civilization-${candidateIndex}-dossier.png`});
  // No Begin button: the dock's Confirm (or Enter) begins the class on show.
  const dock=(await snapshot()).navigation.destinations.find(d=>d.id==='vassal');
  assert.equal(dock?.label,'Confirm','dock offers Confirm for the class on show');assert.equal(dock.enabled,true);
  assert.equal(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getFounderControlClickPoint('begin')),null,'picker has no Begin button');
  if(candidateIndex){await click('getNavigationClickPoint','vassal');}
  else{await page.keyboard.press('Enter');await delay(300);}
  assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getLastVassalSelectionResult())).ok,true);
  const selectedVassal=await snapshot();
  const first=selectedVassal.lineage.currentVassal.availableNodeIds[0];
  await click('getLifeMapNodeClickPoint',first);
  await click('getLifeMapEnterNodeClickPoint');
  await click('getLifeMapEnterNodeClickPoint');
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision?.animation?.phase==='open');
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0)!=null);
  await delay(600);await click('getLifeMapOptionClickPoint',0); // let the prepared decision layout settle after the preview switches above
  assert.equal((await snapshot()).lifeMapDecision.selectedOptionId,'train-estate');
  await page.screenshot({path:`artifacts/civilization-${candidateIndex}-founding.png`});
  await click('getLifeMapConfirmClickPoint');
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().frontierSec>0);
  const resolved=await snapshot();
  assert.ok(resolved.frontierSec>=1,'founding resolves through authoritative time');
  assert.ok(resolved.worldMap.selectedRegion.detailedSettlement.specialists[candidateIndex?'warrior':'scholar']>= (candidateIndex?10:2));
  if(candidateIndex) assert.equal(resolved.lifeMapHud.retinue.cap,null,'Retinue is uncapped');
  else {
    const commission=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getCommissionSnapshot());
    assert.equal(commission.offers.length,3,'first continuous Commission offers');
    const dismiss=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getLifeMapRecapDismissClickPoint());
    if(dismiss) await click('getLifeMapRecapDismissClickPoint');
    await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getCommissionSnapshot().open);
    await page.screenshot({path:'artifacts/civilization-scholar-commissions.png'});
    await click('getCommissionChoiceClickPoint',0);
    await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getCommissionSnapshot().offers.length===0);
  }
  checks.push(`${candidateIndex?'Warrior':'Scholar'}: real New Game, four neutrals, five-slot panel, candidate, founding confirmation and time resolution`);
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
