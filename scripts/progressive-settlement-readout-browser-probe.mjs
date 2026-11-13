import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {getWorldDefinitionById} from '../src/model/world-definitions.js';
import {createMapPolygonReader} from '../src/views/world-map/geometry.js';
import {readoutRectInsideRegion} from '../src/views/world-map/settlement-readout-layout.js';

const output=process.env.PROBE_OUTPUT??'artifacts/crown-release';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS),page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
const errors=[],reports=[],transitions=[];page.on('pageerror',e=>errors.push(e.message));
const definition=getWorldDefinitionById('regional-v1:123'),polygon=createMapPolygonReader(definition),width=688*1576/516,left=488+(1448-width)/2;
const tap=async p=>{assert(p);const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);};
const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
const values=m=>m.floatingReadouts.map(r=>[r.regionId,r.count,r.force,r.exactPrestige,r.thresholdShare,r.barParts]);
function check(m,mode){
 const readings=m.floatingReadouts,others=readings.filter(r=>!r.disclosure.selected);
 assert.equal(new Set(others.map(r=>r.disclosure?.mode)).size,1,'All unselected settlements swap together, including offscreen regions');
 if(mode)assert(others.every(r=>r.disclosure.mode===mode),`Unselected readouts should be ${mode}; got ${[...new Set(others.map(r=>r.disclosure.mode))].join(', ')}`);
 assert.deepEqual(readings.filter(r=>r.disclosure.selected).map(r=>r.regionId),m.regionSelectionActive?[m.selectedRegionId]:[],'Only the actual selected region gets the override');
 for(const r of readings){
  if(r.disclosure.mode==='compact'){assert.equal(r.bar,null);assert.equal(!!r.prestige,r.prestigeActive,'Compact player towns keep active income; potential stays hidden');}
  else{
   assert(r.bar&&r.prestige);const poly=polygon(definition.regions.find(p=>p.id===r.regionId)).map(p=>({x:(left+p.x*width)*m.camera.zoom+m.camera.x,y:(104+p.y*688)*m.camera.zoom+m.camera.y}));
   if(!r.disclosure.selected)assert(r.crestFootprints.every(part=>readoutRectInsideRegion(part,poly)),`${r.regionId}: painted crest, Crown and sword stay inside their region`);
  }
  if(r.disclosure.selected)assert.equal(r.disclosure.mode,'expanded','Selected region always shows the full crest');
 }
}
async function capture(name,viewport,mode){await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.floatingReadouts.every(r=>r.disclosure?.expandZoom!==null));const m=await snapshot();check(m,mode);await page.screenshot({path:`${output}/${name}-${viewport.width}.png`});reports.push({name,viewport,camera:m.camera,readouts:m.floatingReadouts,canvasBox:await page.locator('canvas').boundingBox()});return m;}
async function wheel(delta){const old=(await snapshot()).camera.zoom;await page.mouse.wheel(0,delta);await page.waitForFunction(z=>Math.abs(__SETTLEMENT_DEBUG__.getSnapshot().worldMap.camera.zoom-z)>1e-6,old);const m=await snapshot();check(m);transitions.push({zoom:m.camera.zoom,selected:m.selectedRegionId,others:m.floatingReadouts.find(r=>!r.disclosure.selected).disclosure.mode});return m;}
try{
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
 await page.goto((process.env.PROBE_URL??'http://localhost:5184/')+'?perf=1&seed=123&art=1&launch=new');
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});await page.locator('[data-artwork-ready="true"]').click();
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible&&__SETTLEMENT_DEBUG__.getSnapshot().worldMap.illustratedTerrain?.ready,null,{timeout:180000});
 const lever=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTimeLeverScreenRect());await tap({x:lever.x+lever.width/2,y:lever.y+lever.height/2});await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===0);
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.floatingReadouts.length===19);
 const opening=await snapshot(),baseline=values(opening),capital=opening.regionMapIndicators.find(r=>r.crownCapital).regionId;
 console.log('Progressive readouts: year-zero map ready.');
 for(const viewport of [{width:1440,height:900},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
  await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.focusAnimating);
  const overview=await capture('overview',viewport,'compact'),owned=overview.floatingReadouts.find(r=>r.prestigeActive);
  const income=owned.prestige;await tap({x:income.x+income.width/2,y:income.y+income.height/2});
  assert.equal(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().title),'Territorial Prestige','Compact active income has its real touch inspection');
  await tap({x:income.x+income.width/2,y:income.y+income.height/2});
  await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),capital));await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating;});
  const selected=await capture('selected',viewport);
  const count=selected.floatingReadouts.find(r=>r.regionId===capital).countBounds;
  await tap({x:count.x+count.width/2,y:count.y+count.height/2});
  assert.match(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().title),/Workers/,'Selected worker reading retains real touch inspection');
  await tap({x:count.x+count.width/2,y:count.y+count.height/2});
  const p=await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),capital),b=await page.locator('canvas').boundingBox();await page.mouse.move(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);
  const comfortableZoom=1.9,selectedZoom=(await snapshot()).camera.zoom;
  await wheel(Math.log(selectedZoom/comfortableZoom)/.0015);await capture('comfortable-selected',viewport,'expanded');
  while((await snapshot()).camera.zoom<2.499)await wheel(-75);
  const expanded=await capture('expanded',viewport,'expanded');
  if(JSON.stringify(values(expanded))!==JSON.stringify(baseline)){writeFileSync(output+'/value-mismatch.json',JSON.stringify({expected:baseline,actual:values(expanded)},null,2));assert.fail('Zoom changed a reading; see '+output+'/value-mismatch.json');}
  const c=expanded.floatingReadouts.find(r=>r.regionId===capital);
  assert(Math.abs(c.crown.x+c.crown.width/2-c.shieldAnchor.x)<.2,'Expanded Crown stays on Force shield');
  for(const [rect,title]of [[c.countBounds,/Workers/],[c.prestige,/Prestige/],[{x:c.shieldAnchor.x-1,y:c.shieldAnchor.y-1,width:2,height:2},/supported/i]]){
   await tap({x:rect.x+rect.width/2,y:rect.y+rect.height/2});assert.match(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().title),title);
   await tap({x:rect.x+rect.width/2,y:rect.y+rect.height/2});
  }
  // A small reverse wheel step remains expanded; the next crosses the safe
  // collapse boundary. Every intermediate report keeps the selected crest full.
  const collapse=c.disclosure.collapseZoom,upper=collapse+.01;
  await wheel(Math.log((await snapshot()).camera.zoom/upper)/.0015);check(await snapshot(),'expanded');
  await wheel(Math.log(upper/(collapse-.08))/.0015);check(await snapshot(),'compact');
  await wheel(650);const wide=await capture('selected-zoomed-out',viewport,'compact');assert(wide.camera.zoom<1.2);
  await page.evaluate(()=>__SETTLEMENT_DEBUG__.selectWorldRegion('R05'));await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.selectedRegionId==='R05'&&!m.focusAnimating;});
  const q=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint('R05')),box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+q.x/2424*box.width,box.y+q.y/1080*box.height);await wheel(650);
  const switched=await capture('switched',viewport,'compact');assert.equal(switched.floatingReadouts.find(r=>r.regionId===capital).disclosure.mode,'compact','Previously selected capital rejoins the progressive group');
  await page.evaluate(()=>__SETTLEMENT_DEBUG__.selectWorldRegion('R05'));await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.detailPanelVisible&&!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.focusAnimating);check(await snapshot(),'compact');
  const capitalPoint=await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),capital);await page.mouse.move(box.x+capitalPoint.x/2424*box.width,box.y+capitalPoint.y/1080*box.height);
  await wheel(Math.log((await snapshot()).camera.zoom/comfortableZoom)/.0015);await capture('comfortable-overview',viewport,'expanded');
  await tap({x:2347,y:782});await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return !m.focusAnimating&&m.floatingReadouts.every(r=>r.disclosure.mode==='compact');},null,{timeout:5000});check(await snapshot(),'compact');
  console.log(`Progressive readouts: ${viewport.width}px all crests already expanded at 1.9x, active compact Prestige inspection, selected override, safe shared transitions and selection changes passed.`);
 }
 assert.deepEqual(errors,[]);writeFileSync(output+'/report.json',JSON.stringify({errors,reports,transitions},null,2));
}catch(e){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});writeFileSync(output+'/failure.txt',e.stack);throw e;}finally{await browser.close();}
