import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
import { createAuthoredMapLabDraft } from '../src/model/map-lab-draft.js';
import { createAuthoredGameSettingsDraft, createAuthoredGamepiecesDraft } from '../src/model/game-config.js';
import { createAuthoredLifeMapLabDraft } from '../src/model/life-map-lab-draft.js';

const output='artifacts/region-map', port=18096;
mkdirSync(output,{recursive:true});
const profile={mapLab:createAuthoredMapLabDraft(),gameSettings:createAuthoredGameSettingsDraft(),gamepieces:createAuthoredGamepiecesDraft(),lifeMapLab:createAuthoredLifeMapLabDraft(),vassalLab:null,activePage:'mapLab'};
profile.gameSettings.values.primordialBasePressure=1;
profile.gameSettings.values.primordialGrowthFactor=1.2;
const cedar=profile.mapLab.regions.find(region=>region.id==='cedar-woods');
cedar.structureCapacity=5;
cedar.randomizeStructureCapacity=false;
cedar.detailedState.structureSlots=cedar.detailedState.structureSlots.slice(0,5);
const server=spawn(process.execPath,['./node_modules/serve/bin/serve.js','-l',String(port),'--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
let browser,page;
const errors=[];
const snapshots=[];
async function snap() { return page.evaluate(()=>{
  const s=globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap;
  return {mode:s.mode,selected:s.selectedRegionId,active:s.regionSelectionActive,detail:s.detailPanelVisible,chaos:s.chaosExpanded,camera:s.camera,slots:s.structureSlots,layout:s.layout};
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
async function regionPoint() {return page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getWorldMapClickPoint('cedar-woods'));}
async function capture(name) {await page.mouse.move(0,0);await delay(150);await page.screenshot({path:`${output}/${name}.png`});snapshots.push({name,...await snap()});}
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
  assert.equal((await snap()).detail,false);
  await capture('desktop-map');
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
  await click(await regionPoint());
  let selected=await snap();
  assert.equal(selected.detail,true,'settlement details disclose on selection');
  assert.equal(selected.slots.visible,8);
  assert.equal(selected.slots.blocked,8-selected.slots.available);
  await capture('desktop-selected');
  assert.equal(selected.slots.blocked,3,'five-cell region blocks three cells');
  await click({x:1110,y:400});
  const inspection=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState());
  assert.equal(inspection.pinned,true,'enlarged card opens inspection');
  await click({x:1110,y:400});
  await click({x:1880,y:700});
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTooltipDebugState().title),'Unavailable construction space');
  await click({x:1880,y:700});
  await click({x:2370,y:116});
  assert.equal((await snap()).detail,false,'close returns to the full map');
  assert.deepEqual((await snap()).camera,{zoom:1,x:0,y:0},'closing restores the overview framing');
  const wheel=await point({x:1200,y:450});
  await page.mouse.move(wheel.x,wheel.y);await page.mouse.wheel(0,-300);await delay(150);
  assert.ok((await snap()).camera.zoom>1,'wheel zooms');
  await click({x:2340,y:780});
  assert.deepEqual((await snap()).camera,{zoom:1,x:0,y:0},'reset restores fit');
  await page.setViewportSize({width:844,height:390});await delay(300);
  await capture('mobile-map');
  await click(await regionPoint(),true);
  assert.equal((await snap()).detail,true,'touch selects');
  await capture('mobile-selected');
  await click({x:2370,y:116},true);
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
  const flag=await point(await regionPoint());
  await page.mouse.dblclick(flag.x,flag.y,{delay:80});
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='settlement');
  assert.deepEqual(errors,[]);
  writeFileSync(`${output}/result.json`,JSON.stringify({snapshots,errors},null,2));
  console.log(`[probe:region-map] OK: disclosure, drawer, mouse/touch pan, wheel/pinch zoom, reset, eight-cell rail; screenshots=${output}`);
} catch(error) {
  await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});
  writeFileSync(`${output}/result.json`,JSON.stringify({error:error.stack,snapshot:await snap().catch(()=>null),errors},null,2));
  console.log(`[probe:region-map] FAILED: ${error.message}; details=${output}/result.json`);
  process.exitCode=1;
} finally {await browser?.close();server.kill();}
