import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='artifacts/regional-readout';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Page error: '+e.message.slice(0,180));});
await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
const tap=async point=>{const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);};
try{
 await page.goto('http://localhost:5186/?regionalReadout=shield&perf=1&art=1&launch=new');
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});
 console.log('Map state ready');
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});
 console.log('Entered game');
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});
 await page.locator('[data-artwork-ready="true"]').click();console.log('Illustrations revealed');
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const mapPoint=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(mapPoint)await tap(mapPoint);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);
 await page.waitForTimeout(500);
 for(const variant of ['tracks','bracket','shield']){
   await page.evaluate(v=>{const url=new URL(location.href);url.searchParams.set('regionalReadout',v);history.replaceState(null,'',url);__SETTLEMENT_DEBUG__.forceRender();},variant);
   await page.waitForTimeout(400);await page.screenshot({path:out+'/'+variant+'-overview.png'});
 }
 console.log('Three overviews captured');
 const s=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
 writeFileSync(out+'/state.json',JSON.stringify({errors,camera:s.camera,indicators:s.regionMapIndicators.map(r=>({id:r.regionId,holder:r.controller,workers:r.totalWorkerCount,population:r.influence?.total,prestige:r.prestigePerNode}))},null,2));
 const target=s.regionMapIndicators.find(r=>r.controller==='player').regionId;
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),target));
 await page.waitForTimeout(700);await page.screenshot({path:out+'/shield-selected.png'});console.log('Selection captured');
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);await page.screenshot({path:out+'/shield-desktop.png'});
 console.log('Capture complete; page errors '+errors.length);
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.txt',e.stack);console.log('Capture failed: '+e.message.slice(0,240));process.exitCode=1;}
finally{await browser.close();}
