import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='artifacts/regional-connected-force';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
const errors=[],checks=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Page error: '+e.message.slice(0,160));});
await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
const tap=async point=>{const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);};
const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
const hit=(a,b)=>a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function check(map){
 assert.equal(map.regionalReadoutPrototype,null);
 for(const r of map.floatingReadouts){
  assert(/^-?\d+$/.test(r.shownPrestige),'Integer Prestige display');
  assert.equal(Number(r.shownPrestige),Math.round(r.exactPrestige));
  assert(!hit(r.badge,r.sprite),r.regionId+' badge covers buildings');
  assert(!hit(r.bar,r.sprite),r.regionId+' bar covers buildings');
  assert(!hit(r.name,r.bar),r.regionId+' name covers bar');
 }
}
async function parameters(values){await page.evaluate(values=>{const url=new URL(location.href);for(const [key,value] of Object.entries(values)){if(value===null)url.searchParams.delete(key);else url.searchParams.set(key,value);}history.replaceState(null,'',url);__SETTLEMENT_DEBUG__.forceRender();},values);await page.waitForTimeout(500);}
try{
 await page.goto('http://localhost:5186/?regionalReadout=floating&regionalForce=shield&perf=1&art=1&launch=new');
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});console.log('Map state ready');
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});console.log('Entered game');
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});await page.locator('[data-artwork-ready="true"]').click();
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);await page.waitForTimeout(500);
 let map=await snapshot();check(map);await page.screenshot({path:out+'/phone-overview.png'});
 await tap({x:2266,y:782});await page.waitForTimeout(350);await tap({x:2266,y:782});await page.waitForTimeout(500);
 map=await snapshot();check(map);await page.screenshot({path:out+'/phone-closeup.png'});
 checks.push('connected badge leaves sprite clear; Prestige rounded for display');
 // Pan the actual camera so both display samples and their full Force frame
 // remain inside the map viewport, away from the fixed timegraph.
 const canvasBox=await page.locator('canvas').boundingBox();
 const dragX=canvasBox.x+2300/2424*canvasBox.width,dragY=canvasBox.y+650/1080*canvasBox.height;
 await page.mouse.move(dragX,dragY);await page.mouse.down();await page.mouse.move(dragX,dragY-150/1080*canvasBox.height,{steps:10});await page.mouse.up();await page.mouse.move(0,0);await page.keyboard.press('Escape');await page.waitForTimeout(400);

 for(const style of ['shield','surround','rail']){
  await parameters({regionalForce:style,regionalForceSample:'both'});
  map=await snapshot();check(map);
  assert(map.floatingReadouts.some(r=>r.forceSample==='short'&&r.force===4&&r.required===6));
  assert(map.floatingReadouts.some(r=>r.forceSample==='held'&&r.force===8&&r.required===6));
  await page.screenshot({path:out+'/force-'+style+'.png'});
  const examples=map.floatingReadouts.filter(r=>r.forceSample);for(const example of examples)assert(example.bar.y+example.bar.height<826,'Force example must clear the timegraph');
  await page.screenshot({path:out+'/force-'+style+'-detail.png',clip:{x:325,y:130,width:255,height:155}});
  writeFileSync(out+'/force-'+style+'.json',JSON.stringify(examples,null,2));
  checks.push(style+' Force style with insufficient and sufficient display examples');
 }
 await parameters({regionalForce:'shield',regionalForceSample:null});
 const player=map.regionMapIndicators.find(r=>r.controller==='player').regionId;
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),player));await page.waitForTimeout(700);
 assert((await snapshot()).detailPanelVisible);checks.push('direct economy preserved');await page.screenshot({path:out+'/phone-economy.png'});
 await tap({x:2370,y:116});await page.waitForTimeout(700);
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);check(await snapshot());await page.screenshot({path:out+'/desktop-overview.png'});
 assert.deepEqual(errors,[]);writeFileSync(out+'/checks.json',JSON.stringify({checks,errors},null,2));console.log('Connected badge and three Force options passed; page errors 0');
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.txt',e.stack);console.log('Capture failed: '+e.message.slice(0,220));process.exitCode=1;}
finally{await browser.close();}
