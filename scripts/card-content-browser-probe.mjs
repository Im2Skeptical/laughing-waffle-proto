import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import http from 'node:http';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';

// Ordinary disposable game, real card inspector, phone landscape. An optional
// git-archived baseline supplies code only; artwork is shared read-only.
const root=process.cwd(),out='artifacts/card-content';mkdirSync(out,{recursive:true});
const target=process.argv[2]??'http://localhost:5230/';
const baseline=process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:undefined;
const visualOnly=process.argv.includes('--visual-only'),captureOnly=process.argv.includes('--capture-only');
const source=baseline?path.resolve(baseline):root;
const load=relative=>import(pathToFileURL(path.join(source,relative)).href);
const {createNewGameState}=await load('src/model/new-game.js');
const {serializeGameState}=await load('src/model/state.js');
const {getVassalCandidatePool,selectLifeMapVassal}=await load('src/model/vassal-life-map.js');
const {practiceSlot,fiveSlots,setFixturePopulation}=await load('src/model/dev-lab/fixtures.js');
const state=createNewGameState(1867);
assert.ok(selectLifeMapVassal(state,1,null,getVassalCandidatePool(state).candidates[0]).ok);
const site=state.world.sites.find(site=>site.regionId==='R02');
state.world.regions.find(region=>region.id==='R02').controller='player';
site.neutral=null;delete site.town;
site.detailedState.practiceSlots=fiveSlots(...['quarrying','fm_rubblePicking','surfaceMining','logging','dryFarming'].map(id=>practiceSlot(id)));
site.detailedState.structureSlots.fill(null);setFixturePopulation(site.detailedState,30);
const data=serializeGameState(state),token='cc011111-1111-4111-8111-111111111111';
let server,base=target;
if(baseline){
 server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
  const local=path.resolve(source,relative),shared=path.resolve(root,relative);
  if(!local.startsWith(source+path.sep)&&local!==source){res.writeHead(403);res.end();return;}
  const file=existsSync(local)?local:shared;
  try{const body=readFileSync(file),ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'})[ext]??'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/`;
}
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS),errors=[];
let page;let stage="boot";
const progress=value=>{stage=value;writeFileSync(`${out}/stage.json`,JSON.stringify({stage,baseline:!!baseline,at:new Date().toISOString()}));};
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,reducedMotion:'reduce',ignoreHTTPSErrors:true});
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 progress("opening source");
 await page.goto(base);
 await page.evaluate(({data,token})=>localStorage.setItem('full-map-redesign-v1.development-lab.handoff.'+token,JSON.stringify(data)),{data,token});
 await page.goto('about:blank');await page.goto(`${base}#/dev/play?state=${token}`);await page.bringToFront();
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__,null,{timeout:120000});
 const tap=async p=>{assert.ok(p,'click target exists');const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+p.x/2424*b.width,b.y+p.y/1080*b.height);await page.waitForTimeout(200);};
 const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('present'),null,{timeout:120000});
 await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('present')));
 await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===s.frontierSec;});
 await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint('R02')));
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.selectedRegion?.detailedSettlement?.practices?.[0]?.practiceId==='quarrying');
 progress('reading source card');
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.panelReveal.phase==='open');
 const local=(await snapshot()).worldMap.selectedRegion.detailedSettlement;
 const before=baseline?'before':'after';
 if(!baseline){
  assert.equal(local.practices[0].face.outputMultiplierBreakdown.multiplier,4);
  assert.equal(local.practices[1].face.outputMultiplierBreakdown.multiplier,1);
 }
 await page.screenshot({path:`${out}/${before}-board.png`});
 const point=await page.evaluate(()=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().worldMap.layout.detail,w=(r.width-44-12*4)/5;return{x:r.x+22+w/2,y:r.y+122+170};});
 await tap(point);
 let tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
 if(!tooltip.expanded&&tooltip.titlePoint)await tap(tooltip.titlePoint);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().reading?.effects?.length);
 tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
 if(!baseline)assert.ok(tooltip.reading.effects.some(effect=>/per connected mountain region/.test(effect.text)));
 await page.screenshot({path:`${out}/${before}-quarrying.png`});
 if(!baseline){
  if(!visualOnly){
  progress("capturing source");
  const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(()=>__AGENT_TEST_LINKS__.download().then(c=>({needsFile:c.needsFile})))]);
  await download.saveAs(`${out}/test-capture.json`);
  const capture=await page.evaluate(async()=>{const c=await __AGENT_TEST_LINKS__.capture({baseUrl:new URL("?dev=1",location.href).href});return {url:c.url,needsFile:c.needsFile,source:c.packet.source};});
  assert.equal(capture.needsFile,false);
  writeFileSync(`${out}/test-link.txt`,capture.url);
  const restored=await browser.newPage({viewport:{width:844,height:390},hasTouch:false,isMobile:false,ignoreHTTPSErrors:true});
  progress("restoring capture");
  const inspectPending=setTimeout(async()=>{
    writeFileSync(`${out}/restore-pending.json`,JSON.stringify(await restored.evaluate(()=>({status:globalThis.__AGENT_TEST_LINKS__?.getStatus(),body:document.body.innerText.slice(0,1600),coarse:matchMedia('(pointer: coarse)').matches,world:globalThis.__SETTLEMENT_DEBUG__?(()=>{const w=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return {selectedRegionId:w.selectedRegionId,regionSelectionActive:w.regionSelectionActive,detailPanelVisible:w.detailPanelVisible,panelReveal:w.panelReveal};})():null})).catch(()=>null),null,2));
    await restored.screenshot({path:`${out}/restore-pending.png`}).catch(()=>{});
  },15000);
  restored.on('pageerror',e=>errors.push('restored: '+e.message));
  await restored.goto(capture.url,{waitUntil:'commit'});await restored.bringToFront();
  await restored.waitForFunction(()=>document.querySelector('[data-testid="test-link-display-full"]')||globalThis.__AGENT_TEST_LINKS__,null,{timeout:120000});
  if(await restored.getByTestId('test-link-display-full').count())await restored.getByTestId('test-link-display-full').click();
  await restored.waitForFunction(()=>globalThis.__AGENT_TEST_LINKS__?.getStatus().loaded||globalThis.__AGENT_TEST_LINKS__?.getStatus().lastError,null,{timeout:300000});
  clearTimeout(inspectPending);
  assert.equal(await restored.evaluate(()=>__AGENT_TEST_LINKS__.getStatus().lastError),null);
  await restored.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().reading?.effects?.length);
  const reading=await restored.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().reading);
  assert.ok(reading.effects.some(effect=>/per connected mountain region/.test(effect.text)));
  await restored.screenshot({path:`${out}/restored-quarrying.png`});
  writeFileSync(`${out}/browser-evidence.json`,JSON.stringify({viewport:{width:844,height:390},source:capture.source,restorationGraphics:'performance',sourceGraphics:'full',checks:['Quarry output x4','starter Rubble output x1','printed uncapped terrain rule','fresh-tab capture restoration'],errors},null,2));
  await restored.close();
  }
  if(!captureOnly){
  const {createKeywordCardsState}=await load('src/model/keywords-classes-prototype-fixture.js');
  const {advanceReplayStateToSecond}=await load('src/model/replay-second-runner.js');
  for(const [role,second,index,blocked] of [['scholar',34,3,false],['warrior',12,1,false],['scholar',0,3,true]]){
    progress('keyword '+role+(blocked?' blocked':''));
    const deck=createKeywordCardsState(role,blocked?{synthesisSupply:'blocked'}:{});
    if(second)assert.equal(advanceReplayStateToSecond(deck,second).ok,true);
    const regionId=deck.civilization.capitalRegionId;
    const deckSite=deck.world.sites.find(site=>site.regionId===regionId);
    const id=deckSite.detailedState.practiceSlots[index].practiceId;
    const label=blocked?'blocked-patternCarving':id;
    await page.goto(base);
    await page.evaluate(({data,token})=>localStorage.setItem('full-map-redesign-v1.development-lab.handoff.'+token,JSON.stringify(data)),{data:serializeGameState(deck),token});
    await page.goto('about:blank');await page.goto(`${base}#/dev/play?state=${token}`);await page.bringToFront();
    await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getNavigationClickPoint('present'),null,{timeout:120000});
    await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('present')));
    const selection=(await snapshot()).worldMap;
    const map=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(map)await tap(map);
    if(selection.selectedRegionId!==regionId||!selection.regionSelectionActive)assert.equal(await page.evaluate(regionId=>__SETTLEMENT_DEBUG__.selectWorldRegion(regionId),regionId),true);
    await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
    await page.waitForFunction(id=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.selectedRegion?.detailedSettlement?.practices?.some(p=>p?.practiceId===id),id);
    await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.panelReveal.phase==='open');
    const current=(await snapshot()).worldMap.selectedRegion.detailedSettlement.practices[index];
    if(blocked)assert.equal(current.evaluation.supplied,false);
    else assert.ok(current.stock>0,'actual activation retained Stock');
    const point=await page.evaluate(index=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().worldMap.layout.detail,w=(r.width-44-12*4)/5;return{x:r.x+22+index*(w+12)+w/2,y:r.y+122+170};},index);
    await tap(point);
    let tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    if(!tooltip.expanded&&tooltip.titlePoint)await tap(tooltip.titlePoint);
    await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().reading?.keyword);
    tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    assert.equal(tooltip.reading.keyword.pool,'Capacity');
    assert.match(tooltip.reading.keyword.definition,/Capacity Multiplier/);
    assert.doesNotMatch(tooltip.reading.keyword.text,/maximum|capped/);
    await page.screenshot({path:`${out}/${label}.png`});
    if(!blocked){
      const term=tooltip.keywords.targets.find(t=>t.action===`term:${tooltip.reading.keyword.name}`);
      assert.ok(term);await tap({x:term.x+term.width/2,y:term.y+term.height/2});
      assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState())).keywords.term,tooltip.reading.keyword.name);
      await page.screenshot({path:`${out}/${label}-keyword.png`});
      await page.keyboard.press('Escape');
      await tap(tooltip.closePoint);
      const fitting=await page.evaluate(index=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().worldMap.layout.detail,w=(r.width-44-12*4)/5,cw=Math.min(w,340*170/238);return{x:r.x+22+index*(w+12)+(w-cw)/2+cw*3/4,y:r.y+122+340+8+25};},index);
      await tap(fitting);
      const ledger=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
      assert.equal(ledger.poolMultiplier,current.face.stockCapacityBreakdown.multiplier);
      assert.ok(ledger.poolRows.some(row=>/Synthesis|Monster Trophies/.test(row.label)));
      await page.screenshot({path:`${out}/${label}-capacity-ledger.png`});
    }
  }
  }
 }
 assert.deepEqual(errors,[]);
 console.log(`[card-content-browser] ${before}: actual phone board and card reading verified${baseline||visualOnly?'':'; fresh-tab test link restored'}`);
}catch(error){
 const pages=browser.contexts().flatMap(c=>c.pages());
 const diagnostics=[];
 for(const [index,p] of pages.entries()){
   diagnostics.push(await p.evaluate(()=>({urlLength:location.href.length,status:globalThis.__AGENT_TEST_LINKS__?.getStatus(),body:document.body.innerText.slice(0,1400),coarse:matchMedia('(pointer: coarse)').matches,world:globalThis.__SETTLEMENT_DEBUG__?(()=>{const w=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return {selectedRegionId:w.selectedRegionId,regionSelectionActive:w.regionSelectionActive,detailPanelVisible:w.detailPanelVisible,panelReveal:w.panelReveal};})():null})).catch(()=>null));
   await p.screenshot({path:`${out}/failure-page-${index}.png`}).catch(()=>{});
 }
 writeFileSync(`${out}/failure-pages.json`,JSON.stringify(diagnostics,null,2));
 if(page)await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});writeFileSync(`${out}/failure.json`,JSON.stringify({stage,message:error.message,errors},null,2));throw error;}
finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
