import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.argv[2]??'artifacts/regional-readout-floating';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
const errors=[],checks=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Page error: '+e.message.slice(0,160));});
await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
const tap=async point=>{const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);};
const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
const intersects=(a,b)=>a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function checkLayout(map){
 assert.equal(map.regionalReadoutPrototype,null,'No intermediate regional menu');
 for(const r of map.floatingReadouts){
  assert(/^-?\d+$/.test(r.shownPrestige),'Prestige must be displayed without decimals');
  assert(!intersects(r.countBounds,r.sprite),r.regionId+' workers cover buildings');
  assert(!intersects(r.prestige,r.sprite),r.regionId+' Prestige covers buildings');
  assert(!intersects(r.bar,r.sprite),r.regionId+' bar covers buildings');
 }
 checks.push('worker/Prestige/bar leave sprite footprints clear; region-name overlap allowed');
}
try{
 await page.goto('http://localhost:5186/?regionalReadout=floating&perf=1&art=1&launch=new');
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});console.log('Map state ready');
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});console.log('Entered game');
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});await page.locator('[data-artwork-ready="true"]').click();
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);await page.waitForTimeout(500);
 let map=await snapshot();checkLayout(map);
 await page.screenshot({path:out+'/phone-overview.png'});
 await tap({x:2266,y:782});await page.waitForTimeout(350);await tap({x:2266,y:782});await page.waitForTimeout(500);checkLayout(await snapshot());await page.screenshot({path:out+'/phone-closeup.png'});await tap({x:2347,y:782});await page.waitForTimeout(500);map=await snapshot();
 const crossOverlaps=[];for(const a of map.floatingReadouts)for(const b of map.floatingReadouts)if(a.regionId!==b.regionId&&intersects(a.name,b.bar))crossOverlaps.push([a.regionId,b.regionId]);
 writeFileSync(out+'/geometry.json',JSON.stringify({crossOverlaps,measurements:map.floatingReadouts},null,2));
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);map=await snapshot();checkLayout(map);await page.screenshot({path:out+'/desktop-overview.png'});
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);map=await snapshot();
 const player=map.regionMapIndicators.find(r=>r.controller==='player').regionId;
 const crown=map.regionMapIndicators.find(r=>r.controller==='external-a').regionId;
 const worker=map.floatingReadouts.find(r=>r.regionId===player).countBounds;
 await tap({x:worker.x+worker.width/2,y:worker.y+worker.height/2});
 assert.match((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState())).title,/Workers|Population/);checks.push('worker badge touch inspection');
 await page.keyboard.press('Escape');
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),player));await page.waitForTimeout(700);
 assert((await snapshot()).detailPanelVisible,'Region click opens economy directly');checks.push('direct region-to-economy click');
 await page.screenshot({path:out+'/phone-player.png'});
 await tap({x:2370,y:116});await page.waitForTimeout(700);
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),crown));await page.waitForTimeout(700);
 checkLayout(await snapshot());await page.screenshot({path:out+'/phone-crown.png'});checks.push('Crown direct economy and floating readings');
 assert.deepEqual(errors,[]);
 writeFileSync(out+'/checks.json',JSON.stringify({checks,errors,crossOverlaps},null,2));
 console.log('Floating capture passed: '+checks.join('; '));console.log('Cross-region name/bar overlaps: '+crossOverlaps.length);
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.txt',e.stack);console.log('Capture failed: '+e.message.slice(0,220));process.exitCode=1;}
finally{await browser.close();}
