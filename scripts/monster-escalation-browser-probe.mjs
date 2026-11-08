import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {createNewGameState} from '../src/model/new-game.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
const model=initializeReplayClock(createNewGameState(123));
for(let sec=4;sec<=6400&&!model.civilization.chaos.lastMonsterSpawn;sec+=4)assert(advanceReplayStateToSecond(model,sec).ok);
const firstSpawnSec=model.civilization.chaos.lastMonsterSpawn?.tSec;assert(Number.isFinite(firstSpawnSec));
const out='artifacts/monster-escalation';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true,isMobile:true}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};Object.defineProperty(document,'fullscreenElement',{get:()=>document.documentElement});});
const snap=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
const tap=async p=>{const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);};
try{
 await page.goto('http://localhost:5186/?perf=1&art=1&launch=new&regionalStart=opening');
 const buildInfo=await page.locator('#game-build-info').textContent();
 await page.route('**/build-info.json',route=>route.fulfill({contentType:'application/json',body:buildInfo}));
 await page.waitForFunction(()=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();return s?.opening?.phase==='error'||s?.worldMap?.regionCount===20;},null,{timeout:180000});
 assert.notEqual((await snap()).opening?.phase,'error','opening preparation must succeed');
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});await page.locator('[data-artwork-ready="true"]').click();
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening?.phase==='completed',null,{timeout:180000});
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===0&&s.worldMap.monsterReadouts.length===1&&s.worldMap.monsterReadouts[0].strength===2;},null,{timeout:180000});
 let s=await snap();assert.equal(s.worldMap.monsterReadouts.length,1);assert.equal(s.worldMap.monsterReadouts[0].strength,2);
 assert.equal(s.worldMap.lastMonsterSpawn,null);
 const occupied=s.worldMap.floatingReadouts.filter(r=>r.holder==='external-a'&&r.status==='occupied');
 assert.equal(occupied.length,13,'real New Game must show minority occupation in thirteen Crown towns');
 for(const r of occupied){
  const total=r.barParts.reduce((n,p)=>n+p.count,0),neutral=r.barParts.find(p=>p.id==='neutral')?.count??0;
  assert(neutral>total/2&&r.warriors<total/2,'the drawn allegiance bar must show a majority unaffiliated and minority soldiers');
 }
 await page.screenshot({path:out+'/desktop-opening.png'});
 await page.evaluate(t=>__SETTLEMENT_DEBUG__.browseSecond(t),firstSpawnSec);
 await page.waitForFunction(t=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===t,firstSpawnSec);await page.waitForTimeout(400);
 s=await snap();const last=s.worldMap.lastMonsterSpawn;
 assert.equal(last.outcome,'intercepted');assert.equal(last.strengthBefore,2);assert.equal(last.strengthAfter,3);
 assert.equal(s.worldMap.monsterReadouts.find(r=>r.regionId===last.sourceRegionId).strength,3);
 await page.screenshot({path:out+'/desktop-repel.png'});
 for(const viewport of [{width:1440,height:900},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(400);s=await snap();
  const monster=s.worldMap.monsterReadouts.find(r=>r.regionId===last.sourceRegionId);
  assert(Math.abs(monster.screenScale-1.08*.7)<.001,'Monster badges share the accepted fixed screen scale');
  await tap({x:monster.bounds.x+monster.bounds.width/2,y:monster.bounds.y+monster.bounds.height/2});await page.waitForTimeout(150);
  const tip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
  assert(tip.visible&&tip.pinned);assert(tip.title.includes('Monster Strength'));
  assert(tip.x>=0&&tip.y>=0,'touch inspection stays within the canvas');
  await page.screenshot({path:out+`/inspection-${viewport.width}.png`});
  await tap({x:850,y:790});await page.waitForTimeout(100);
  if(viewport.width===844)await page.screenshot({path:out+'/phone-repel.png'});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(1600));
 await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===1600&&s.worldMap.floatingReadouts.some(r=>r.holder==='external-a'&&r.thresholdShare>0);},null,{timeout:180000});
 const fifty=await snap(),crownAt50=fifty.worldMap.floatingReadouts.filter(r=>r.holder==='external-a');
 assert(crownAt50.length>=10);
 for(const r of crownAt50){const drawn=(r.shieldAnchor.x-r.meterTrack.x)/r.meterTrack.width;assert(Math.abs(drawn-r.thresholdShare)<.00001,'drawn shields track the exact holding threshold');}
 await page.screenshot({path:out+'/desktop-year50.png'});
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===0&&s.worldMap.monsterReadouts.length===1&&s.worldMap.monsterReadouts[0].strength===2;},null,{timeout:180000});
 s=await snap();assert.equal(s.worldMap.lastMonsterSpawn,null);assert.equal(s.worldMap.monsterReadouts[0].strength,2,'rewind restores the old Strength and removes future feedback');
 assert.deepEqual(errors,[]);writeFileSync(out+'/browser-check.json',JSON.stringify({errors,last,minorityOccupations:occupied.length,crownAt50:crownAt50.length,checks:['opening minority occupations','year-50 shield positions','opening Strength','repel +1','fixed scale','desktop/phone touch inspection','rewind']},null,2));
 console.log('[monster-browser] strength, +1 feedback, desktop/phone touch inspection and rewind OK');
}catch(error){
 const s=await snap().catch(()=>null);
 writeFileSync(out+'/browser-failure.json',JSON.stringify({error:error.message,viewedSec:s?.viewedSec,opening:s?.opening,worldMap:s?.worldMap,errors},null,2));
 await page.screenshot({path:out+'/browser-failure.png'}).catch(()=>{});throw error;
}finally{await browser.close();}
