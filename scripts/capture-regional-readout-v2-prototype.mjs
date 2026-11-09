import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import readline from 'node:readline';
const base='artifacts/regional-readout-v2';
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Page error: '+e.message.slice(0,180));});
await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
const tap=async point=>{if(!point)throw Error('Missing click point');const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);};
const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
async function capture(iteration){
 const out=base+'/iter'+iteration;mkdirSync(out,{recursive:true});
 await page.setViewportSize({width:844,height:390});
 await page.goto('http://localhost:5186/?regionalReadout=atlas&perf=1&art=1&launch=new');
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});console.log('Map state ready');
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});console.log('Entered game');
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});
 await page.locator('[data-artwork-ready="true"]').click();console.log('Artwork revealed');
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);await page.waitForTimeout(600);
 await page.screenshot({path:out+'/phone-overview.png'});
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(350);await page.screenshot({path:out+'/desktop-overview.png'});
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
 const s=await snapshot(),target=s.regionMapIndicators.find(r=>r.controller==='player').regionId;
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),target));
 await page.waitForTimeout(700);await page.screenshot({path:out+'/phone-focus.png'});
 const focus=await snapshot();if(!focus.detailPanelVisible||focus.regionalReadoutPrototype.economyExpanded)throw Error('Focus disclosure failed');
 await tap(focus.regionalReadoutPrototype.economyClickPoint);await page.waitForTimeout(700);
 const economy=await snapshot();if(!economy.regionalReadoutPrototype.economyExpanded)throw Error('Economy disclosure failed');
 await page.screenshot({path:out+'/phone-economy.png'});
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(350);await page.screenshot({path:out+'/desktop-economy.png'});
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);
 // Return to the map summary, then switch to a Crown settlement.
 await tap({x:795,y:129});await page.waitForTimeout(500);
 const returned=await snapshot();if(returned.regionalReadoutPrototype.economyExpanded)throw Error('Return to summary failed');
 const crown=await page.evaluate(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.regionMapIndicators.filter(r=>r.controller==='external-a').map(r=>({id:r.regionId,p:__SETTLEMENT_DEBUG__.getWorldMapClickPoint(r.regionId)})).find(r=>r.p.x>160&&r.p.x<2250&&r.p.y>170&&r.p.y<740&&!(r.p.x<940&&r.p.y>450))?.id;});
 if(!crown)throw Error('No visible Crown target');
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),crown));await page.waitForTimeout(700);
 const crownFocus=await snapshot();if(crownFocus.selectedRegionId!==crown||crownFocus.regionalReadoutPrototype.economyExpanded)throw Error('Crown focus failed');
 await page.screenshot({path:out+'/phone-crown.png'});
 writeFileSync(out+'/checks.json',JSON.stringify({errors,checks:['real illustrated map','player focus','economy disclosure','return to map summary','Crown focus'],camera:s.camera,holdings:s.regionMapIndicators.map(r=>({id:r.regionId,holder:r.controller,workers:r.totalWorkerCount,residents:r.influence?.total,prestige:r.prestigePerNode}))},null,2));
 console.log('Iteration '+iteration+' captured; page errors '+errors.length);
 if(errors.length)throw Error('Browser page errors');
}
try{
 await capture(Number(process.argv[2]??1));console.log('READY: capture <iteration> or stop');
 for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
   if(line.trim()==='stop')break;
   if(line.startsWith('capture '))await capture(Number(line.split(' ')[1]));
   console.log('READY: capture <iteration> or stop');
 }
}catch(e){mkdirSync(base,{recursive:true});await page.screenshot({path:base+'/failure.png'}).catch(()=>{});writeFileSync(base+'/failure.txt',e.stack);console.log('Capture failed: '+e.message.slice(0,240));process.exitCode=1;}
finally{await browser.close();}
