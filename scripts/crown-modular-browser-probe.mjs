import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {checkCrownRenderedComposition} from './crown-modular-render-checks.mjs';

const phase=process.argv.includes('--before')?'before':'after';
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9)??`artifacts/crown-modular/${phase}`;mkdirSync(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
const errors=[],reports=[];page.on('pageerror',error=>errors.push(error.message));
const tap=async point=>{assert(point);const box=await page.locator('canvas').boundingBox();await page.touchscreen.tap(box.x+point.x/2424*box.width,box.y+point.y/1080*box.height);};
try{
 if(process.argv.includes('--capture-layout'))await page.route('**/crown-urban-prototype.js',async route=>{
  const code=readFileSync('src/views/world-map/crown-urban-prototype.js','utf8').replace('export function planCrownUrbanSites(anchors,','function capturedPlan(anchors,');
  await route.fulfill({contentType:'text/javascript',body:code+'\nexport function planCrownUrbanSites(anchors,args){globalThis.__crownPlanFixture??={anchors,args};return capturedPlan(anchors,args);}\n'});
 });
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
 await page.goto((process.env.PROBE_URL??'http://localhost:5192/')+'?perf=1&seed=123&art=1&launch=new'+(phase==='before'?'&crownArt=baseline':''));
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});
 await page.locator('[data-artwork-ready="true"]').click();
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.illustratedTerrain?.ready,null,{timeout:180000});
 const lever=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTimeLeverScreenRect());
 await tap({x:lever.x+lever.width/2,y:lever.y+lever.height/2});
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===0);
 console.log(`Crown modular ${phase}: held at year zero`);
 if(process.argv.includes('--capture-layout')){
  const data=await page.evaluate(()=>{
   const {anchors,args}=globalThis.__crownPlanFixture;
   const encode=value=>{const bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return {type:value.constructor.name,base64:btoa(binary)};};
   return {anchors,map:{seed:args.map.seed,edges:args.map.edges.map(e=>({regions:e.regions,points:e.points})),regions:args.map.regions.map(r=>({id:r.id,biome:r.biome,outline:r.outline,centre:r.centre}))},
    width:args.width,height:args.height,detail:args.detail,identities:args.identities,moduleSizes:args.moduleSizes,citadelRoads:args.citadelRoads,
    worldZero:args.world(0,0),worldStep:args.world(1,1),pixelZero:args.pixel({x:0,y:0}),pixelStep:args.pixel({x:1,y:1}),
    masks:{land:encode(args.land),waterIndices:encode(args.waterIndices),regionIds:encode(args.regionIds)}};
  });
  writeFileSync(output+'/layout-fixture.json',JSON.stringify(data));
 }
 const map=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
 const regionCentres=process.argv.includes('--capture-layout')?await page.evaluate(()=>__crownPlanFixture.args.map.regions.map(r=>({id:r.id,point:r.centre}))):null;
 if(process.argv.includes('--readability')){
  const anchors=await page.evaluate(()=>__crownPlanFixture.anchors.map(a=>({id:a.regionId,point:a.point})));
  assert.equal(anchors.length,regionCentres.length,'Every region has a centred anchor, including occupied regions');
  for(const region of regionCentres)assert.deepEqual(anchors.find(a=>a.id===region.id).point,region.point);
 }
 const capital=map.regionMapIndicators.find(r=>r.crownCapital).regionId;
 for(const viewport of [{width:1440,height:900},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
  await page.screenshot({path:`${output}/overview-${viewport.width}.png`});
  const overviewNames=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.floatingReadouts.filter(r=>r.name).map(r=>r.regionId));
  await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),capital));
  await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating;});
  await page.screenshot({path:`${output}/capital-${viewport.width}.png`});
  const snapshot=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
  reports.push({viewport,capital,terrain:snapshot.illustratedTerrain,readouts:snapshot.floatingReadouts,overviewNames,selectedNames:snapshot.floatingReadouts.filter(r=>r.name).map(r=>r.regionId),regionCentres});
  await page.evaluate(id=>__SETTLEMENT_DEBUG__.selectWorldRegion(id),capital);
  await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.detailPanelVisible);
  if(process.argv.includes('--include-provinces'))for(const province of snapshot.illustratedTerrain.sites.filter(s=>s.urban?.rank==='province')){
   await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),province.regionId));
   await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating;});
   await page.screenshot({path:`${output}/province-${province.regionId}-${viewport.width}.png`});
   await page.evaluate(id=>__SETTLEMENT_DEBUG__.selectWorldRegion(id),province.regionId);
   await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.detailPanelVisible);
  }
  if(process.argv.includes('--include-swamps'))for(const region of snapshot.illustratedTerrain.biomes.filter(r=>r.biome==='swamp'&&!snapshot.illustratedTerrain.sites.find(s=>s.regionId===r.id)?.urban)){
   await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),region.id));
   await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating;});
   await page.screenshot({path:`${output}/swamp-${region.id}-${viewport.width}.png`});
   if(process.argv.includes('--detail-swamps')){
    const before=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.camera.zoom);
    if(before<2.5){
     const point=await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),region.id),box=await page.locator('canvas').boundingBox();
     await page.mouse.move(box.x+point.x/2424*box.width,box.y+point.y/1080*box.height);await page.mouse.wheel(0,-1000);
     await page.waitForFunction(z=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.camera.zoom>z&&!m.focusAnimating;},before);
    }
    await page.screenshot({path:`${output}/swamp-detail-${region.id}-${viewport.width}.png`});
   }
   await page.evaluate(id=>__SETTLEMENT_DEBUG__.selectWorldRegion(id),region.id);
   await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.detailPanelVisible);
  }
 }
 if(process.argv.includes('--readability')){
  for(const frame of reports){
   assert.deepEqual(frame.overviewNames,[],'Overview hides all regional names');assert.deepEqual(frame.selectedNames,[frame.capital],'Selection reveals only its own regional name');
   for(const site of frame.terrain.sites){const expected=frame.regionCentres.find(r=>r.id===site.regionId).point;assert.deepEqual(site.point,expected,`${site.regionId}: town fixed at region centre`);if(site.urban)assert.deepEqual(site.urban.monument.centrePoint,expected,`${site.regionId}: landmark fixed at region centre`);}
  }
  for(const second of [16,32,64,128]){await page.evaluate(t=>__SETTLEMENT_DEBUG__.browseSecond(t),second);await page.waitForFunction(t=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===t,second);}
  await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());await page.screenshot({path:output+'/economic-flows-844.png'});
 }
 assert.deepEqual(errors,[]);
 writeFileSync(output+'/report.json',JSON.stringify({phase,errors,reports},null,2));
 if(phase==='after')checkCrownRenderedComposition({reports,errors});
 console.log(`Crown modular ${phase}: desktop/phone real-game captures; ${errors.length} page errors; ${output}`);
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});const snapshot=await page.evaluate(()=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();return {second:s?.viewedSec,opening:s?.opening,playback:s?.playbackTarget,visible:s?.worldMap?.visible,detail:s?.worldMap?.detailPanelVisible};}).catch(()=>null);writeFileSync(output+'/failure.txt',error.stack+'\n'+JSON.stringify(snapshot));throw error;}
finally{await browser.close();}
