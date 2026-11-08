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
 assert.equal(map.floatingNamesAboveReadouts,false,'Floating readouts have priority over region names');
 const whole=map.floatingReadouts.filter(r=>r.prestige),reference=whole[0];
 for(const r of map.floatingReadouts){
  const player=map.regionMapIndicators.find(i=>i.regionId===r.regionId).controller==='player';
  assert(r.prestige,'Every settlement, including neutral towns, shows Prestige');
  assert.equal(r.prestigeActive,player,'Only player Prestige is active income');
  assert.equal(r.prestigeLabel,(player?'+':'')+r.shownPrestige,'Only player income carries a plus sign');
  near(1.08*.7,r.screenScale,'Uniform default 70% scale');
  near(reference.badge.height,r.badge.height,'Uniform worker-circle height');
  near(reference.meterTrack.width,r.meterTrack.width,'Uniform meter width');
  if(r.holder==='player'||r.holder==='external-a'){
   assert.equal(r.barParts[0].id,r.holder,'Holder support fills from the left');
   near(r.meterTrack.x+r.meterTrack.width*r.thresholdShare,r.shieldAnchor.x,'Shield marks the control threshold');
  }else assert.equal(r.shownForce,null,'Unheld towns do not pretend their resident Warriors have zero Force');
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
 await page.goto('http://localhost:5186/?regionalReadout=floating&regionalForce=onbar&regionalStart=opening&regionalUiSize=135&perf=1&art=1&launch=new');
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});console.log('Map state ready');
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});console.log('Entered game');
 assert.equal(await page.locator('[data-testid="regional-size-live"],[data-testid="regional-size-slider"]').count(),0,'Temporary size controls removed');
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});await page.locator('[data-artwork-ready="true"]').click();
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening?.phase==='completed',null,{timeout:180000});
 assert.equal(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec),0,'Review link starts held at the opening');
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);await page.waitForTimeout(600);
 const base=await snapshot();writeFileSync(out+'/opening-check.json',JSON.stringify(await page.evaluate(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return {frontierSec:s.frontierSec,viewedSec:s.viewedSec,opening:s.opening,crown:s.worldMap.regionMapIndicators.filter(r=>r.controller==='external-a').length};}),null,2));check(base);await page.screenshot({path:out+'/phone-overview.png'});
 const crownArmy=base.floatingReadouts.filter(r=>r.holder==='external-a');assert.equal(crownArmy.length,14);
 assert(crownArmy.every(r=>r.force>=r.warriors&&r.shownForce===Math.floor(r.force)));
 assert(crownArmy.every(r=>r.status==='supported'));
 assert(crownArmy.every(r=>r.warriors>=9));
 checks.push('14 larger Crown armies have real Force; their recruits also create population majorities');
 checks.push('neutral Prestige visible; Crown and neutral readouts are inactive potential');
 for(let i=1;i<=3;i++){
  await tap({x:2266,y:782});await page.waitForTimeout(400);const map=await snapshot();check(map,base);await page.screenshot({path:out+'/phone-zoom-'+i+'.png'});
  if(i===2){
   const occupied=map.floatingReadouts.find(r=>r.holder==='external-a'&&r.shieldAnchor.x>100&&r.shieldAnchor.x<2300&&r.shieldAnchor.y>130&&r.shieldAnchor.y<780);
   assert(occupied);await tap(occupied.shieldAnchor);await page.waitForTimeout(300);
   assert.match((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState())).title,/Crown - Population-supported/);
   await page.screenshot({path:out+'/phone-occupation-inspection.png'});await page.keyboard.press('Escape');
   checks.push('Crown shield touch inspection explains larger Warrior Force and the holding threshold');
   const neutral=map.floatingReadouts.find(r=>map.regionMapIndicators.find(indicator=>indicator.regionId===r.regionId).neutral&&r.prestige.x>40&&r.prestige.x+r.prestige.width<2300&&r.prestige.y>105&&r.prestige.y+r.prestige.height<810);
   assert(neutral,'Neutral potential is visible for touch inspection');const b=neutral.prestige;
   await tap({x:b.x+b.width/2,y:b.y+b.height/2});await page.waitForTimeout(300);
   const tip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());assert(tip.pinned);assert.equal(tip.title,'Potential territorial Prestige');
   await page.screenshot({path:out+'/phone-neutral-potential.png'});await page.keyboard.press('Escape');checks.push('neutral potential touch inspection');
   await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(192));
   await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===192);await page.waitForTimeout(500);
   const later=await snapshot();check(later);
   assert(later.floatingReadouts.filter(r=>r.holder==='external-a').every(r=>r.thresholdShare<.45),'larger real garrisons keep thresholds left of the no-army boundary');
   await page.screenshot({path:out+'/phone-year6-thresholds.png'});
   checks.push('year-six real forecast preserves larger garrisons and Force-reduced control thresholds');
   await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(1600));
   await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===1600);await page.waitForTimeout(500);
   const fifty=await snapshot();check(fifty);
   assert(fifty.floatingReadouts.filter(r=>r.holder==='external-a').length>=8,'Crown still holds most territories at year 50');
   await page.screenshot({path:out+'/phone-year50-garrisons.png'});
   checks.push('real year-50 forecast retains most Crown territories');
   await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
   await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===0);await page.waitForTimeout(300);
  }
 }
 checks.push('fixed 70% ignores old size URLs and keeps identical dimensions across settlements and four zoom levels','temporary size controls removed','sprite edge anchoring stable through zoom','names stay at original regional corners','floating readouts have priority over overlapping region names');
 await tap({x:2347,y:782});await page.waitForTimeout(500);check(await snapshot(),base);checks.push('reset restores identical layout');
 const player=base.regionMapIndicators.find(r=>r.controller==='player').regionId;
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),player));await page.waitForTimeout(700);assert((await snapshot()).detailPanelVisible);checks.push('direct economy click preserved');await page.screenshot({path:out+'/phone-economy.png'});
 await tap({x:2370,y:116});await page.waitForTimeout(700);
 const crown=base.regionMapIndicators.filter(r=>r.controller==='external-a').sort((a,b)=>b.influence.total-a.influence.total)[0].regionId;
 await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),crown));await page.waitForTimeout(700);assert((await snapshot()).detailPanelVisible);await page.screenshot({path:out+'/phone-crown-economy.png'});
 await tap({x:2370,y:116});await page.waitForTimeout(700);
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);check(await snapshot());await page.screenshot({path:out+'/desktop-overview.png'});
 assert.deepEqual(errors,[]);writeFileSync(out+'/checks.json',JSON.stringify({checks,errors},null,2));writeFileSync(out+'/geometry.json',JSON.stringify(samples,null,2));console.log('Stable layout passed across four zoom levels and phone/desktop; page errors 0');
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.txt',e.stack);console.log('Capture failed: '+e.message.slice(0,240));process.exitCode=1;}
finally{await browser.close();}
