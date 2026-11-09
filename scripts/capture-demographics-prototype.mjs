import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='artifacts/demographics-ux',baseline=process.argv.includes('--baseline');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true,isMobile:true}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};Object.defineProperty(document,'fullscreenElement',{get:()=>document.documentElement});});
const tap=async p=>{const b=await page.locator('canvas').boundingBox();assert(p&&b);const point={x:b.x+p.x/2424*b.width,y:b.y+p.y/1080*b.height};if(p.y<70)console.log('Header target '+JSON.stringify(await page.evaluate(p=>{const e=document.elementFromPoint(p.x,p.y),r=e?.getBoundingClientRect();return{...p,tag:e?.tagName,id:e?.id,testid:e?.dataset.testid,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};},point)));await page.touchscreen.tap(point.x,point.y);};
const snap=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
try{
 await page.goto('http://localhost:5186/?regionalReadout=floating&regionalForce=onbar&regionalStart=opening&perf=1&art=1&launch=new');
 // This capture exercises census interaction, not the separately tested build
 // staleness badge, whose refresh can overlap these tabs during active edits.
 const buildInfo=await page.locator('#game-build-info').textContent();
 await page.route('**/build-info.json',route=>route.fulfill({contentType:'application/json',body:buildInfo}));
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});await page.locator('[data-artwork-ready="true"]').click();
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening?.phase==='completed',null,{timeout:180000});
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(3168));await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===3168);
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.selectWorldRegion('R15'));await page.waitForTimeout(300);
 const target=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('settlement'));
 if(target)await tap(target);
 else{const p=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint('R15'));await tap(p);await tap(p);}
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().view?.visible===true,null,{timeout:20000});
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.selectWorldRegion('R15'));await page.waitForTimeout(300);
 const tab=await page.evaluate(()=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().view.headerControls.demographics;return {x:r.x+r.width/2,y:r.y+r.height/2};});
 await tap(tab);await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().view?.activeTab==='demographics');
 await page.waitForTimeout(300);
 let s=await snap();assert.equal(s.view.regionId,'R15');
 const name=baseline?'baseline':'iteration';
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);
 await page.screenshot({path:out+'/'+name+'-phone.png'});
 if(!baseline){
  const visual=s.view.demographics.visual,census=s.view.demographics.census;
  assert.equal(visual.population.total,census.population.total);
  assert.equal(Object.values(visual.allegiances).reduce((n,g)=>n+g.total,0),visual.population.total);
  assert.equal(Object.values(visual.specialties).reduce((n,g)=>n+g.total,0),visual.population.total);
  for(const [key,title] of [['census:elders','elders'],['census:cell:external-a:warrior','Crown'],['census:housing','Housing']]){
   await tap(visual.inspectionTargets[key]);await page.waitForTimeout(120);
   const tip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
   assert.equal(tip.visible,true,key);assert.equal(tip.pinned,true,key);assert.ok(tip.title.includes(title),key+': '+tip.title);
   assert.ok(tip.x>=0&&tip.y>=0,'inspector stays within screen');
   if(key.includes('warrior'))await page.screenshot({path:out+'/iteration-warrior-inspection-phone.png'});
   await tap({x:850,y:790});await page.waitForTimeout(80);
  }
  const tabPoint=id=>page.evaluate(id=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().view.headerControls[id];return{x:r.x+r.width/2,y:r.y+r.height/2};},id);
  await tap(await tabPoint('overview'));await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().view.activeTab==='overview');await page.waitForTimeout(500);
  await tap(await tabPoint('demographics'));await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().view.activeTab==='demographics');
 }
 writeFileSync(out+'/'+name+'-snapshot.json',JSON.stringify(s.view.demographics,null,2));
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);await page.screenshot({path:out+'/'+name+'-desktop.png'});
 if(!baseline){
  await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===0);
  await page.waitForTimeout(250);let initial=await snap();assert.equal(initial.view.demographics.census.lastMoon.available,false);
  await page.screenshot({path:out+'/iteration-first-moon-desktop.png'});
  const neutral=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.regionMapIndicators?.find(i=>i.neutral)?.regionId);
  assert.ok(neutral,'unheld town exists');await page.evaluate(id=>__SETTLEMENT_DEBUG__.selectWorldRegion(id),neutral);await page.waitForTimeout(300);
  const empty=await snap();assert.ok(empty.view.overview.neutral);assert.equal(empty.view.activeTab,'demographics');
  assert.equal(empty.view.demographics.visual.population.total,empty.view.demographics.census.population.total);
  await page.screenshot({path:out+'/iteration-neutral-desktop.png'});
 }
 assert.deepEqual(errors,[]);
 writeFileSync(out+'/'+name+'-checks.json',JSON.stringify({errors,population:s.view.demographics.population.total},null,2));
 console.log('Demographics '+name+' captured phone/desktop; residents '+s.view.demographics.population.total+'; page errors 0');
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.txt',error.stack);console.log(error.message);process.exitCode=1;}
finally{await browser.close();}

