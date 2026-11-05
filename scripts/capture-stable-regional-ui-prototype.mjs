import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='artifacts/regional-stable-layout';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
const errors=[],checks=[],samples=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Page error: '+e.message.slice(0,160));});
await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
const tap=async p=>{const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);};
const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
const near=(a,b,message)=>assert(Math.abs(a-b)<.08,message+' expected '+a+' actual '+b);
function check(map,base){
 assert.equal(map.regionalReadoutPrototype,null,'No intermediate regional menu');
 assert.equal(map.floatingNamesBelowReadouts,true,'Readouts above region-name layer');
 const whole=map.floatingReadouts.filter(r=>r.prestige),reference=whole[0];
 for(const r of map.floatingReadouts){
  near(1.08,r.screenScale,'Uniform scale');
  near(reference.badge.height,r.badge.height,'Uniform worker-circle height');
  near(reference.meterTrack.width,r.meterTrack.width,'Uniform meter width');
  if(r.prestige)near(reference.badge.width,r.badge.width,'Uniform combined badge width');
  assert(r.name,'Region name remains visible');assert.deepEqual(r.namePosition,r.nameHome,'Region name remains at live-game home');
  near(r.sprite.x+r.sprite.width/2,r.badge.x+r.badge.width/2,'Badge tracks sprite centre');
  near(r.sprite.x+r.sprite.width/2,r.meterTrack.x+r.meterTrack.width/2,'Meter tracks sprite centre');
  if(base){const old=base.floatingReadouts.find(o=>o.regionId===r.regionId);
   near(old.badge.width,r.badge.width,'Screen-space badge width unchanged with zoom');
   near(old.badge.height,r.badge.height,'Screen-space badge height unchanged with zoom');
   near(old.meterTrack.width,r.meterTrack.width,'Screen-space meter width unchanged with zoom');
   near(old.sprite.y-old.badge.y-old.badge.height,r.sprite.y-r.badge.y-r.badge.height,'Above-sprite gap unchanged');
   near(old.bar.y-old.sprite.y-old.sprite.height,r.bar.y-r.sprite.y-r.sprite.height,'Below-sprite gap unchanged');
   near(old.name.width*map.camera.zoom/base.camera.zoom,r.name.width,'Name follows original map zoom scale');
  }
 }
 samples.push({zoom:map.camera.zoom,readings:map.floatingReadouts});
}
try{
 await page.goto('http://localhost:5186/?regionalReadout=floating&regionalForce=onbar&perf=1&art=1&launch=new');
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});console.log('Map state ready');
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});console.log('Entered game');
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});await page.locator('[data-artwork-ready="true"]').click();
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);await page.waitForTimeout(600);
 const base=await snapshot();check(base);await page.screenshot({path:out+'/phone-overview.png'});
 for(let i=1;i<=3;i++){await tap({x:2266,y:782});await page.waitForTimeout(400);check(await snapshot(),base);await page.screenshot({path:out+'/phone-zoom-'+i+'.png'});}
 checks.push('same screen-space dimensions across settlements and four zoom levels','sprite edge anchoring stable through zoom','names stay visible at original regional corners','readouts layer above names');
 await tap({x:2347,y:782});await page.waitForTimeout(500);check(await snapshot(),base);checks.push('reset restores identical layout');
 const player=base.regionMapIndicators.find(r=>r.controller==='player').regionId;
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),player));await page.waitForTimeout(700);assert((await snapshot()).detailPanelVisible);checks.push('direct economy click preserved');await page.screenshot({path:out+'/phone-economy.png'});
 await tap({x:2370,y:116});await page.waitForTimeout(700);
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);check(await snapshot());await page.screenshot({path:out+'/desktop-overview.png'});
 assert.deepEqual(errors,[]);writeFileSync(out+'/checks.json',JSON.stringify({checks,errors},null,2));writeFileSync(out+'/geometry.json',JSON.stringify(samples,null,2));console.log('Stable layout passed across four zoom levels and phone/desktop; page errors 0');
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.txt',e.stack);console.log('Capture failed: '+e.message.slice(0,240));process.exitCode=1;}
finally{await browser.close();}
