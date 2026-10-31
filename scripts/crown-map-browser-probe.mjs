import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {createNewGameState} from '../src/model/new-game.js';

const output='artifacts/crown-map';mkdirSync(output,{recursive:true});
const state=createNewGameState(1867);
const capital=state.civilization.remnant.capitalRegionId;
const neutral=state.world.sites.find(s=>s.name==='Independent Settlement').regionId;
const errors=[],checks=[];
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
page.on('pageerror',e=>errors.push(e.message));
const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
const tap=async point=>{
 assert(point);const b=await page.locator('canvas').boundingBox();
 await page.touchscreen.tap(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);
};
const click=async(method,arg)=>tap(await page.evaluate(([m,a])=>__SETTLEMENT_DEBUG__[m](a),[method,arg]));
try{
 await page.addInitScript(()=>{
  const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=a=>a instanceof Uint32Array&&a.length===1?(a[0]=1867,a):original(a);
  // Keep this one emulated device's physical screen from overriding the second
  // viewport on touch. Gameplay and rendering are unchanged by this harness.
  Element.prototype.requestFullscreen=async()=>{};
 });
 await page.goto('http://localhost:5185/');
 await page.getByTestId('game-new').click();await page.getByTestId('game-slot-1').click();
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});
 console.log('[crown-map] ordinary 20-region New Game ready');
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:600000});
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening.phase==='completed',null,{timeout:600000});
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 const present=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(present)await tap(present);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.illustratedTerrain?.ready,null,{timeout:180000});
 console.log('[crown-map] real terrain ready');
 let s=await snapshot();
 assert.equal(s.worldMap.regionMapIndicators.filter(r=>r.crownCapital).length,1);
 assert.equal(s.worldMap.regionMapIndicators.filter(r=>r.independent).length,3);
 assert.equal(s.worldMap.illustratedTerrain.sites.find(r=>r.regionId===capital).kind,'crownCapital');
 assert.equal(s.worldMap.illustratedTerrain.sites.find(r=>r.regionId===neutral).kind,'neutral');
 assert(s.worldMap.regionMapIndicators.every(r=>r.stockTags.every(t=>['red','amber'].includes(t.outline))));
 await page.screenshot({path:output+'/phone-overview.png'});
 const point=await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),capital),zoom=s.worldMap.camera.zoom;
 await tap({x:point.x+38*zoom,y:point.y-50*zoom});
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().title==='Crown capital');
 checks.push('capital badge touch inspection');await page.keyboard.press('Escape');
 await click('getWorldMapClickPoint',capital);
 await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating;});
 await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
 for(const viewport of [{width:844,height:390},{width:1440,height:900}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
  await page.waitForTimeout(250);
  const r=(await snapshot()).worldMap.layout.detail;
  await tap({x:r.x+22+575,y:r.y+52});
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().title==='Population allegiance');
  await page.screenshot({path:output+`/header-inspect-${viewport.width}.png`});
  checks.push(`allegiance header touch ${viewport.width}`);await page.keyboard.press('Escape');
  await tap({x:r.x+22+945,y:r.y+46});
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().title==='Control and military holding');
  checks.push(`control header touch ${viewport.width}`);await page.keyboard.press('Escape');
  await page.screenshot({path:output+`/capital-panel-${viewport.width}.png`});
  console.log(`[crown-map] header inspected at ${viewport.width} × ${viewport.height}`);
 }
 assert.deepEqual(errors,[]);
 writeFileSync(output+'/browser.json',JSON.stringify({checks,errors,capital,neutral,indicators:s.worldMap.regionMapIndicators.map(r=>({id:r.regionId,crownCapital:r.crownCapital,independent:r.independent,stockTags:r.stockTags}))},null,2));
 console.log('[crown-map] passed: '+checks.join(', '));
}catch(e){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});
 const s=await page.evaluate(()=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();return {navigation:s?.navigation,opening:s?.opening,map:s?.worldMap?{visible:s.worldMap.visible,ready:s.worldMap.illustratedTerrain?.ready,selected:s.worldMap.selectedRegionId,detail:s.worldMap.detailPanelVisible}:null};}).catch(()=>null);
 writeFileSync(output+'/failure.json',JSON.stringify({error:e.stack,errors,snapshot:s},null,2));throw e;
}finally{await browser.close();}
