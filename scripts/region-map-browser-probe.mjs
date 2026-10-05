import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
import { createAuthoredMapLabDraft } from '../src/model/map-lab-draft.js';
import { createAuthoredGameSettingsDraft, createAuthoredGamepiecesDraft } from '../src/model/game-config.js';
import { createAuthoredLifeMapLabDraft } from '../src/model/life-map-lab-draft.js';
import { getSettlementStockTagLayout } from '../src/views/world-map/stock-tags.js';

const output='artifacts/region-map', port=18096;
mkdirSync(output,{recursive:true});
const profile={mapLab:createAuthoredMapLabDraft(),gameSettings:createAuthoredGameSettingsDraft(),gamepieces:createAuthoredGamepiecesDraft(),lifeMapLab:createAuthoredLifeMapLabDraft(),vassalLab:null,activePage:'mapLab'};
// Camera/inspection checks need their settlement target to survive the reveal.
profile.gameSettings.values.primordialBasePressure=0;
profile.gameSettings.values.primordialGrowthFactor=1;
const cedar=profile.mapLab.regions.find(region=>region.id==='cedar-woods');
cedar.structureCapacity=5;
cedar.randomizeStructureCapacity=false;
cedar.detailedState.structureSlots=cedar.detailedState.structureSlots.slice(0,5);
// Show all three Stock roles in the real map renderer.
cedar.detailedState.practiceSlots=['forage','logging','smelting','housebuilding','barter']
  .map(practiceId=>({practiceId,tier:'bronze',stock:0,charge:0,work:0}));
const server=spawn(process.execPath,['./node_modules/serve/bin/serve.js','-l',String(port),'--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
let browser,page;
const errors=[];
const snapshots=[];
async function snap() { return page.evaluate(()=>{
  const s=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap;
  return {mode:s.mode,selected:s.selectedRegionId,active:s.regionSelectionActive,detail:s.detailPanelVisible,chaos:s.chaosExpanded,camera:s.camera,focusAnimating:s.focusAnimating,panelReveal:s.panelReveal,slots:s.structureSlots,layout:s.layout,relationships:s.relationships};
}); }
async function point(p) {
  const b=await page.locator('canvas').boundingBox();
  return {x:b.x+p.x/2424*b.width,y:b.y+p.y/1080*b.height};
}
async function click(p,touch=false) {
  const q=await point(p);
  if(touch)await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);
  await delay(250);
}
async function regionPoint(id='cedar-woods') {return page.evaluate(id=>globalThis.__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),id);}
async function waitFocus() {await page.waitForFunction(()=>!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.focusAnimating);}
async function waitDismissed() {
  await page.waitForFunction(()=>{
    const map=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap;
    return !map.focusAnimating && map.panelReveal.phase==='closed' && !map.detailPanelVisible;
  });
}
async function assertGroupFramed(id) {
  await waitFocus();
  const map=await snap(), bounds=map.layout.groupFrame;
  assert.equal(map.selected,id);
  const selected=await regionPoint(id);
  assert.ok(Math.abs(selected.x-(bounds.x+bounds.width/2))<.01 && Math.abs(selected.y-(bounds.y+bounds.height/2))<.01,
    'selected settlement stays centered while zoom frames its group');
  for(const regionId of map.relationships.groupRegionIds) {
    const p=await regionPoint(regionId);
    assert.ok(p.x>=bounds.x && p.x<=bounds.x+bounds.width && p.y>=bounds.y && p.y<=bounds.y+bounds.height,`${regionId} is visible in the default group framing`);
  }
}
async function capture(name) {await page.mouse.move(0,0);await delay(150);await page.screenshot({path:`${output}/${name}.png`});snapshots.push({name,...await snap()});}
async function doubleTapFlag() {
  const flag=await point(await regionPoint());
  await page.mouse.dblclick(flag.x,flag.y,{delay:20});
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='settlement',null,{timeout:5000});
}
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true});
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(profile=>{
    localStorage.setItem('civsurvivor.debugProfiles.v2',JSON.stringify({schemaVersion:2,nextId:2,profiles:[{id:'profile-1',name:'Region map probe',profile}]}));
    localStorage.setItem('civsurvivor.debugProfiles.boot.v2','profile-1');
  },profile);
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.enterBootTestRun);
  await page.waitForFunction(()=>globalThis.PIXI?.Assets.get('images/sprite-sheets/settlement-pieces-0.json')?.textures);
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.enterBootTestRun());
  await delay(600);
  if(process.argv.includes('--double-tap-only')) {
    await doubleTapFlag();
  } else {
  assert.equal((await snap()).detail,false);
  const stockRoles=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.regionMapIndicators
    .find(region=>region.regionId==='cedar-woods').stockTags.map(({trait,outline})=>[trait,outline]));
  assert.deepEqual(stockRoles,[['Construction',null],['Currency','green'],['Edible',null],['Fuel','green'],
    ['Metal','green'],['Timber','green'],['Tool','red'],['Wild','green']], 'real installed recipes show local use, nonlocal production, and unsourced demand');
  await capture('desktop-map');
  const stockAnchor=await regionPoint();
  const stockPoint=getSettlementStockTagLayout(stockRoles.map(([trait])=>({trait})),stockAnchor).find(tag=>tag.trait==='Tool');
  await click(stockPoint);
  const stockTooltip=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
  assert.equal(stockTooltip.pinned,true,'Stock tag explanations can be pinned by touch/click');
  assert.ok(stockTooltip.title.includes('Tool Stock'));
  assert.equal((await snap()).active,false,'Stock tag input does not select the underlying settlement');
  await click(stockPoint);
  await click({x:558,y:116});
  assert.equal((await snap()).chaos,false,'chaos drawer collapses');
  await click({x:90,y:116});
  assert.equal((await snap()).chaos,true,'chaos drawer expands');
  const before=await snap();
  const start=await point(await regionPoint());
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.mouse.move(start.x+70,start.y+30,{steps:10});await page.mouse.up();await delay(150);
  assert.equal((await snap()).active,false,'drag does not select a settlement');
  assert.notEqual((await snap()).camera.x,before.camera.x,'drag pans terrain');
  await click({x:2340,y:780});
  // The actual selection callback must start at the existing camera and panel origin.
  const opening=await page.evaluate(()=>{
    const d=globalThis.__SETTLEMENT_DEBUG__,before=d.getSnapshot().worldMap.camera;
    const origin=d.getWorldMapClickPoint('cedar-woods');
    d.selectWorldRegion('cedar-woods');
    const after=d.getSnapshot().worldMap;
    return {before,origin,camera:after.camera,panel:after.panelReveal};
  });
  assert.deepEqual(opening.camera,opening.before,'selection starts without an immediate jump');
  assert.equal(opening.panel.animating,true);
  assert.equal(opening.panel.scale,.06);
  assert.deepEqual(opening.panel.origin,opening.origin,'panel grows out of the selected settlement');
  await assertGroupFramed('cedar-woods');
  let selected=await snap();
  assert.equal(selected.detail,true,'settlement details disclose on selection');
  assert.equal(selected.slots.visible,8);
  assert.equal(selected.slots.blocked,8-selected.slots.available);
  await capture('desktop-selected');
  assert.deepEqual(selected.relationships.highlightedRegionIds,['west-levee'],'only adjacent regions with a direct road are highlighted');
  const groupCamera=selected.camera;
  await click({x:818,y:782});
  await click({x:899,y:782});
  await waitFocus();
  const resetCamera=(await snap()).camera;
  assert.ok(['x','y','zoom'].every(key=>Math.abs(resetCamera[key]-groupCamera[key])<.001),
    'Reset restores the default group framing');
  await assertGroupFramed('cedar-woods');
  assert.equal(selected.slots.blocked,3,'five-cell region blocks three cells');
  await click({x:1110,y:400});
  const inspection=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
  assert.equal(inspection.pinned,true,'enlarged card opens inspection');
  await click(inspection.closePoint);
  await click({x:1880,y:700});
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().title),'Unavailable construction space');
  await click({x:1880,y:700});
  // Select another visible settlement with a real pointer, not only the debug callback.
  await click(await regionPoint('west-levee'));
  assert.equal((await snap()).selected,'west-levee','clicking another settlement changes the panel subject');
  await assertGroupFramed('west-levee');
  assert.equal((await snap()).panelReveal.scale,1,'switching keeps the open panel in place');
  const settled=await snap();
  const pan=await point({x:700,y:650});
  await page.mouse.move(pan.x,pan.y);await page.mouse.down();
  await page.mouse.move(pan.x+30,pan.y-20,{steps:5});await page.mouse.up();
  const manual=(await snap()).camera;
  assert.notDeepEqual(manual,settled.camera,'user can pan after focus');
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await delay(400);
  assert.deepEqual((await snap()).camera,manual,'redraw does not refocus a manually panned selection');
  const dismissal=await page.evaluate(()=>{
    const d=globalThis.__SETTLEMENT_DEBUG__,before=d.getSnapshot().worldMap;
    d.selectWorldRegion(before.selectedRegionId);
    d.forceRender();
    const after=d.getSnapshot().worldMap;
    return {before:before.camera,camera:after.camera,visible:after.detailPanelVisible,panel:after.panelReveal};
  });
  assert.deepEqual(dismissal.camera,dismissal.before,'close does not jump the camera');
  assert.equal(dismissal.visible,true,'panel remains drawn during close, including forced redraw');
  assert.equal(dismissal.panel.phase,'closing');
  await waitDismissed();
  assert.equal((await snap()).detail,false,'close returns to the full map');
  assert.equal((await snap()).relationships,null,'dismissal clears the group highlights');
  assert.deepEqual((await snap()).camera,{zoom:1,x:0,y:0},'closing restores the overview framing');
  const wheel=await point({x:1200,y:450});
  await page.mouse.move(wheel.x,wheel.y);await page.mouse.wheel(0,-300);
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.camera.zoom>1);
  assert.ok((await snap()).camera.zoom>1,'wheel zooms');
  await click({x:2340,y:780});
  assert.deepEqual((await snap()).camera,{zoom:1,x:0,y:0},'reset restores fit');
  await page.setViewportSize({width:844,height:390});await delay(300);
  await capture('mobile-map');
  await click(await regionPoint(),true);
  assert.equal((await snap()).detail,true,'touch selects');
  await assertGroupFramed('cedar-woods');
  await capture('mobile-selected');
  await click({x:2370,y:116},true);
  await waitDismissed();
  const cdp=await page.context().newCDPSession(page);
  const a=await point({x:1000,y:420}), b=await point({x:1400,y:420});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1},{...b,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x-40,y:a.y,id:1},{x:b.x+40,y:b.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);
  assert.ok((await snap()).camera.zoom>1,'pinch zooms');
  assert.equal((await snap()).active,false,'pinch does not select');
  await click({x:2340,y:780},true);
  // A touch drag over a region must pan without disclosing its details.
  const t=await point(await regionPoint());
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...t,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:t.x+50,y:t.y+10,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);
  assert.equal((await snap()).active,false,'touch drag does not select');
  assert.ok((await snap()).camera.x>0,'touch drag pans');
  await click({x:2340,y:780},true);
  // Double tapping a flag still opens its settlement after the first tap reframes the map.
  await doubleTapFlag();
  }
  assert.deepEqual(errors,[]);
  writeFileSync(`${output}/result.json`,JSON.stringify({snapshots,errors},null,2));
  console.log(`[probe:region-map] OK: ${process.argv.includes('--double-tap-only') ? 'flag double-tap after automatic group framing' : 'disclosure, automatic group framing, mouse/touch pan, wheel/pinch zoom, reset, inspection, eight-cell rail'}; screenshots=${output}`);
} catch(error) {
  await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});
  writeFileSync(`${output}/result.json`,JSON.stringify({error:error.stack,snapshot:await snap().catch(()=>null),errors},null,2));
  console.log(`[probe:region-map] FAILED: ${error.message}; details=${output}/result.json`);
  process.exitCode=1;
} finally {await browser?.close();server.kill();}
