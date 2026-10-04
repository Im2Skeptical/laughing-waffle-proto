import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const url='http://127.0.0.1:18107',output='artifacts/map-territory';
mkdirSync(output,{recursive:true});
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','18107','--no-clipboard','.'],{stdio:'ignore',windowsHide:true});
let browser,page;const errors=[];
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page=await browser.newPage({viewport:{width:1280,height:450}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#091212"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script></body></html>'}));
  await page.goto(url);await page.waitForFunction(()=>!!globalThis.PIXI);
  await page.evaluate(async()=>{
    const {preloadChronicleArt}=await import('/src/views/chronicle-art.js');
    const {createLabFixture}=await import('/src/model/dev-lab/fixtures.js');
    const {serializeGameState}=await import('/src/model/state.js');
    const {createWorldMapView}=await import('/src/views/world-map-pixi.js');
    const {addMonsterMarker}=await import('/src/views/world-map/territory-art.js');
    await preloadChronicleArt();
    const state=createLabFixture('defense',42);
    const before=JSON.stringify(serializeGameState(state));
    const app=new PIXI.Application({width:1280,height:450,backgroundColor:0x091212});
    document.body.append(app.view);app.stage.scale.set(1280/2424);
    let selected=state.civilization.capitalRegionId,active=false;
    const view=createWorldMapView({layer:app.stage,getState:()=>state,getSelectedRegionId:()=>selected,getRegionSelectionActive:()=>active,
      setSelectedRegionId:id=>{selected=id;active=true;view.refresh();},onShowCivilizationGraph:()=>{active=false;view.refresh();}});
    view.init();app.ticker.add(()=>view.update());
    const walk=node=>[node,...(node.children??[]).flatMap(walk)];
    const countdownCases=[0,1,99,100,199].map(ageMoons=>{
      const container=new PIXI.Container();
      addMonsterMarker(container,{x:0,y:0},{ageMoons});
      const text=walk(container).find(n=>n.label==='monster-spread-moons').text;
      container.destroy({children:true});
      return text;
    });
    globalThis.territoryProbe={app,state,view,select(id){selected=id;active=true;view.refresh();},
      check(){const nodes=walk(app.stage);return {
        monsterRegions:state.world.regions.filter(r=>r.monster).length,
        ground:nodes.filter(n=>n.label==='monster-ground').length,
        markers:nodes.filter(n=>n.label==='monster-marker').length,
        countdowns:nodes.filter(n=>n.label==='monster-spread-countdown').length,
        countdownCases,
        playerBorders:nodes.filter(n=>n.label==='player-region-border').length,
        selectedBorders:nodes.filter(n=>n.label==='selected-region-border').length,
        selectedInk:nodes.filter(n=>n.label==='selected-region-border').flatMap(n=>n.geometry.graphicsData.map(d=>({width:d.lineStyle.width,color:d.lineStyle.color}))),
        unchanged:JSON.stringify(serializeGameState(state))===before,
      };}};
  });
  await delay(1000);
  const overview=await page.evaluate(()=>territoryProbe.check());
  assert.ok(overview.monsterRegions>0);
  assert.equal(overview.ground,overview.monsterRegions,'every occupied region has clipped corruption graphics');
  assert.equal(overview.markers,overview.monsterRegions,'every occupied region has a monster emblem');
  assert.equal(overview.countdowns,overview.monsterRegions,'every occupied region shows its spread countdown');
  assert.deepEqual(overview.countdownCases,['100 / 100 moons','99 / 100 moons','1 / 100 moons','100 / 100 moons','1 / 100 moons']);
  assert.ok(overview.playerBorders>0,'player territory remains distinct');
  assert.ok(overview.unchanged,'drawing leaves serialized state and RNG unchanged');
  await page.screenshot({path:`${output}/overview.png`});
  await page.evaluate(()=>territoryProbe.select(territoryProbe.state.world.regions.find(r=>r.monster).id));
  await page.waitForFunction(()=>!territoryProbe.view.getSemanticSnapshot().focusAnimating);
  const selected=await page.evaluate(()=>territoryProbe.check());
  assert.equal(selected.selectedBorders,1);
  assert.ok(selected.selectedInk.some(ink=>ink.width===6&&ink.color===0x98e8f2),'selected region has its own high-contrast outline');
  assert.ok(selected.unchanged);
  await page.screenshot({path:`${output}/selected-monster.png`});
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>{territoryProbe.app.renderer.resize(844,390);territoryProbe.app.stage.scale.set(844/2424);});
  await page.screenshot({path:`${output}/mobile-monster.png`});
  await page.setViewportSize({width:1280,height:570});
  await page.evaluate(async()=>{
    const {createLabFixture}=await import('/src/model/dev-lab/fixtures.js');
    const {getAdjacentRegionIds}=await import('/src/model/world-state.js');
    const {serializeGameState}=await import('/src/model/state.js');
    const {createWorldMapView}=await import('/src/views/world-map-pixi.js');
    const state=createLabFixture('defense',42), regionId='river-crown';
    const neighbours=getAdjacentRegionIds(state,regionId).slice(0,4);
    const player=structuredClone(state.world.sites.find(site=>site.detailedState && state.world.regions.find(r=>r.id===site.regionId)?.controller==='player'));
    const neutral=structuredClone(state.world.sites.find(site=>site.neutral));
    const monster=structuredClone(state.world.regions.find(r=>r.monster).monster);
    const entries=[{id:regionId,kind:'allied'},...neighbours.map((id,i)=>({id,kind:['allied','neutral','empty','hostile'][i]}))];
    state.world.sites=state.world.sites.filter(site=>!entries.some(entry=>entry.id===site.regionId));
    for(const {id,kind} of entries){
      const region=state.world.regions.find(r=>r.id===id);
      region.controller=kind==='allied'?'player':kind==='neutral'?'external-a':'frontier';
      region.monster=kind==='hostile'?structuredClone(monster):null;
      if(kind==='allied'||kind==='neutral'){
        const site=structuredClone(kind==='allied'?player:neutral);
        site.regionId=id;site.id=`hierarchy-${id}`;state.world.sites.push(site);
      }
    }
    state.world.connections=neighbours.map(id=>({regionAId:regionId,regionBId:id}));
    const before=JSON.stringify(serializeGameState(state));
    const {app}=territoryProbe;territoryProbe.view.setVisible(false);
    app.renderer.resize(1280,570);app.stage.scale.set(1280/2424);
    const view=createWorldMapView({layer:app.stage,getState:()=>state,getSelectedRegionId:()=>regionId,getRegionSelectionActive:()=>true});
    view.init();app.ticker.add(()=>view.update());
    const walk=node=>[node,...(node.children??[]).flatMap(walk)];
    globalThis.hierarchyProbe={view,check:()=>({
      kinds:walk(app.stage).filter(node=>node.worldVisible && node.label==='connected-region-border' && node.relationshipKind).map(node=>node.relationshipKind).sort(),
      unchanged:JSON.stringify(serializeGameState(state))===before,
    })};
  });
  await page.waitForFunction(()=>!hierarchyProbe.view.getSemanticSnapshot().focusAnimating);
  const hierarchy=await page.evaluate(()=>hierarchyProbe.check());
  assert.deepEqual(hierarchy.kinds,['allied','empty','hostile','neutral'],'all four neighbour styles reach the real map renderer');
  assert.ok(hierarchy.unchanged,'hierarchy drawing leaves serialized state and RNG unchanged');
  await page.screenshot({path:`${output}/desktop-hierarchy.png`});
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>{territoryProbe.app.renderer.resize(844,390);territoryProbe.app.stage.scale.set(844/2424);});
  await page.screenshot({path:`${output}/mobile-hierarchy.png`});
  assert.deepEqual(errors,[]);
  writeFileSync(`${output}/result.json`,JSON.stringify({overview,selected,hierarchy,errors},null,2));
  console.log(`[probe:map-territory] OK: monster graphics, allied/neutral/empty/hostile hierarchy, player/selected outlines, unchanged state; screenshots=${output}`);
} catch(error){
  writeFileSync(`${output}/result.json`,JSON.stringify({error:error.stack,errors},null,2));
  await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});
  console.error(`[probe:map-territory] FAILED: ${error.message}; details=${output}/result.json`);process.exitCode=1;
} finally {await browser?.close();server.kill();}
