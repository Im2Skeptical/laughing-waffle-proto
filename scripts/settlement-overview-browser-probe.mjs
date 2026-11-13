import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';

const url=new URL(process.argv.find(a=>a.startsWith('http'))??'http://localhost:5204/');
const art=process.argv.includes('--art');
url.search=`?dev=1&perf=1&art=${art?1:0}&seed=123&launch=new`;
const output='artifacts/settlement-overview';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const errors=[];let page,stage='entry';
try {
  page=await browser.newPage({viewport:{width:1440,height:810},hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  // Display permissions are outside this layout probe; keep a resizable window.
  await page.addInitScript(()=>{
    Element.prototype.requestFullscreen=async()=>{};
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>document.documentElement});
    document.exitFullscreen=async()=>{};
    screen.orientation.lock=async()=>{};
  });
  await page.goto(url.href);
  await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:120000});
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot().opening.phase==='completed',null,{timeout:120000});
  const click=async (point,touch=false)=>{
    const box=await page.locator('canvas').last().boundingBox();
    assert.ok(point&&box,'visible click target');
    const x=box.x+point.x/2424*box.width,y=box.y+point.y/1080*box.height;
    if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
  const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));
  if(browse)await click(browse);
  await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===0);
  const id=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.regionMapIndicators.find(r=>r.controller==='player').regionId);
  await page.evaluate(id=>{__SETTLEMENT_DEBUG__.selectWorldRegion(id);__SETTLEMENT_DEBUG__.forceRender();},id);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await click(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('settlement')));
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().view?.visible);
  const before=await snapshot(),nav=before.view.settlementNavigation;
  stage='settlement navigation';
  assert.equal(nav.controlledIds.length,2);
  const centre=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
  await click(centre(nav.next));
  let next=await snapshot();
  assert.notEqual(next.view.regionId,before.view.regionId);
  assert.equal(next.controller.subjectKey,next.view.regionId,'graph changes with settlement');
  assert.equal(next.viewedSec,before.viewedSec);
  assert.equal(next.frontierSec,before.frontierSec);
  assert.deepEqual(next.lineage,before.lineage,'navigation does not intervene');
  await click(centre(next.view.settlementNavigation.next));
  assert.equal((await snapshot()).view.regionId,id,'next wraps');
  await click(centre(nav.previous));
  assert.equal((await snapshot()).view.regionId,next.view.regionId,'previous wraps');
  await click(centre(nav.next));
  const current=await snapshot(),stock=current.view.overviewVisual.stock;
  assert.ok(stock.rows.some(r=>r.linked>0),'opening has visible linked inventory');
  assert.ok(stock.rows.some(r=>r.traits.length>1),'multi-trait inventory is visible');
  assert.equal(stock.total,stock.rows.reduce((n,r)=>n+r.local+r.linked,0));
  assert.ok(stock.markets.length,'priced offers are separate');
  if(art){
    await page.locator('[data-testid="debug-open"][data-artwork-ready="true"]').waitFor({timeout:180000});
    await page.getByTestId('debug-open').click();
    await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
  }
  await page.screenshot({path:`${output}/desktop${art?'-art':''}.png`});
  await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
  await page.setViewportSize({width:844,height:390});
  if(await page.getByTestId('game-continue').isVisible())await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:`${output}/phone${art?'-art':''}.png`});
  const point=stock.inspectionTargets[Object.keys(stock.inspectionTargets).find(k=>k.startsWith('overview:stock:'))];
  stage='touch Stock inspection';
  await click(point,true);
  const inspection=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
  assert.equal(inspection.visible,true,'Stock supports touch inspection');
  await page.screenshot({path:`${output}/phone-stock-inspection.png`});
  stage='touch tab';
  await click({x:1200,y:780},true);
  await click(centre(current.view.headerControls.demographics),true);
  assert.equal((await snapshot()).view.activeTab,'demographics');
  stage='touch cycle retains tab';
  await click(centre(nav.next),true);
  next=await snapshot();
  assert.equal(next.view.activeTab,'demographics','switching preserves selected tab');
  assert.equal(next.controller.subjectKey,next.view.regionId);
  await click(centre(nav.previous),true);
  await click(centre(current.view.headerControls.overview),true);
  assert.equal((await snapshot()).view.activeTab,'overview');
  // Exercise overflow and disabled controls on the same shipped view with a
  // deliberately crowded, read-only test world, outside the live runner.
  await page.evaluate(async()=>{
    const {createNewGameState}=await import('/src/model/new-game.js');
    const {createSettlementPrototypeView}=await import('/src/views/settlement-prototype-view.js');
    const {detailedSettlementPracticeDefs}=await import('/src/defs/gamepieces/detailed-settlement-defs.js');
    const {getDetailedPracticeDef}=await import('/src/model/game-config.js');
    const state=createNewGameState(7),regionId='R03';
    const keys=new Set();
    const stockIds=Object.keys(detailedSettlementPracticeDefs).filter(id=>{
      const traits=getDetailedPracticeDef(state,id)?.stockTraits??[],key=traits.slice().sort().join('|');
      if(!key||keys.has(key))return false;keys.add(key);return true;
    });
    for(const [i,id] of ['R03','R04','R02'].entries()){
      state.world.regions.find(r=>r.id===id).controller='player';
      const site=state.world.sites.find(s=>s.regionId===id);site.neutral=null;
      site.detailedState.practiceSlots=stockIds.slice(i*5,i*5+5).map((practiceId,j)=>({practiceId,stock:j+1,tier:'bronze',instanceId:`fixture:${i}:${j}`,charge:0,work:0}));
    }
    const app=new PIXI.Application({width:2424,height:1080,backgroundColor:0x111718,resolution:1});
    app.view.style.cssText='position:fixed;width:min(100vw,224.444vh);height:auto;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;';document.body.append(app.view);
    const view=createSettlementPrototypeView({layer:app.stage,getState:()=>state,getSelectedRegionId:()=>regionId,onSelectSettlement:()=>{globalThis.fixtureSelected=true;}});
    view.init();app.render();globalThis.overviewFixture={app,view,state,regionId};
  });
  const fixtureSnapshot=()=>page.evaluate(()=>overviewFixture.view.getSemanticSnapshot());
  const fixture=await fixtureSnapshot();
  assert.ok(fixture.overviewVisual.stock.pageCount>1,'crowded inventory is bounded and paged');
  const stockRect=fixture.overviewVisual.layout.stock;
  await click({x:stockRect.x+223,y:stockRect.y+582},true);
  await page.evaluate(()=>{overviewFixture.view.update();overviewFixture.app.render();});
  assert.equal((await fixtureSnapshot()).overviewVisual.stock.page,1);
  await page.screenshot({path:`${output}/phone-stock-page2.png`});
  await page.evaluate(()=>{
    const {state,view,regionId,app}=overviewFixture;
    for(const region of state.world.regions)region.controller=region.id===regionId?'player':'frontier';
    for(const site of state.world.sites)site.detailedState.practiceSlots=[null,null,null,null,null];
    view.refresh();app.render();
  });
  const empty=await fixtureSnapshot();
  assert.equal(empty.overviewVisual.stock.page,0,'shrinking inventory clamps stale page');
  assert.equal(empty.overviewVisual.stock.rows.length,0);
  assert.equal(empty.settlementNavigation.enabled,false);
  await click(centre(empty.settlementNavigation.next),true);
  assert.equal(await page.evaluate(()=>globalThis.fixtureSelected===true),false,'single holding cannot cycle');
  await page.evaluate(()=>{overviewFixture.view.destroy();overviewFixture.app.destroy(true,{children:true});delete globalThis.overviewFixture;});
  assert.deepEqual(errors,[]);
  const result={passed:true,art,errors,regions:nav.controlledIds,stockRows:stock.rows.length,local:stock.rows.reduce((n,r)=>n+r.local,0),linked:stock.rows.reduce((n,r)=>n+r.linked,0),marketOffers:stock.markets.length,navigation:'mouse and touch; both directions and wrap; tab and time preserved; graph follows',inspection};
  writeFileSync(`${output}/result${art?'-art':''}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,inspection:inspection.visible}));
} catch(error){
  if(page)await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});
  writeFileSync(`${output}/failure.json`,JSON.stringify({stage,error:error.stack,errors},null,2));
  console.error(`[settlement-overview] ${error.message}; details: ${output}/failure.json`);process.exitCode=1;
} finally {await browser.close();}
