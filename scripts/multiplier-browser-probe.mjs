import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';
import {createLabNodeSandbox} from '../src/model/dev-lab/node-sandbox.js';
import {practiceSlot,fiveSlots} from '../src/model/dev-lab/fixtures.js';
import {getCurrentLifeMapVassal,selectVassalNodeOption} from '../src/model/vassal-life-map.js';
import {serializeGameState} from '../src/model/state.js';
import {getBuildInfo} from './build-info.mjs';

// Launch the existing Gym handoff into the ordinary, disposable game session.
// No alternate screen, prototype renderer or player save is involved.
const url=process.env.MULTIPLIER_PROBE_URL??'http://localhost:5193/';
const output='artifacts/multiplier-browser';mkdirSync(output,{recursive:true});
// Capturing directly into docs changes the served build fingerprint mid-review.
// Keep screenshots outside build inputs until this browser session is finished.
const captures=`${output}/captures`;mkdirSync(captures,{recursive:true});
const committedCaptures='docs/prototypes/output-capacity-multipliers';
const identity=await getBuildInfo('local');
let served;
for(let attempt=0;attempt<40;attempt++) {
  served=await (await fetch(`${url}build-info.json`)).json();
  if(served.build===identity.build)break;
  await delay(250);
}
assert.equal(served.build,identity.build,'preview must serve this checkout’s updated fingerprint');
assert.equal(served.branch,identity.branch);
const {state,nodeId}=createLabNodeSandbox({type:'publicWorks',prestige:200,seed:1867});
const vassal=getCurrentLifeMapVassal(state);
const site=state.world.sites.find(site=>site.regionId===vassal.locationRegionId);
site.detailedState.practiceSlots=fiveSlots(...['dryFarming','milling','logging','quarrying','barter'].map(id=>practiceSlot(id,3)));
// Repeated real Storehouses exercise a grouped ledger and staged replacement.
site.detailedState.structureSlots=site.detailedState.structureSlots.map((_,index)=>index<2?
  {structureId:'storehouse',origin:index,width:1,placementId:`ledger:${index}`}:null);
assert.ok(selectVassalNodeOption(state,nodeId,'Stock').ok);
const data=serializeGameState(state),token='11111111-1111-4111-8111-111111111111';
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const errors=[];let page;
try {
  const context=await browser.newContext({viewport:{width:1440,height:800},hasTouch:true});
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  await page.evaluate(({data,token})=>localStorage.setItem('civsurvivor.development-lab.handoff.'+token,JSON.stringify(data)),{data,token});
  await page.goto(`${url}#/dev/play?state=${token}`);
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__,null,{timeout:60000});
  const screen=async p=>{assert.ok(p,'control exists');const b=await page.locator('canvas').boundingBox();return {x:b.x+p.x/2424*b.width,y:b.y+p.y/1080*b.height};};
  const tap=async p=>{const q=await screen(p);await page.mouse.click(q.x,q.y);};
  const hover=async p=>{const q=await screen(p);await page.mouse.move(q.x,q.y);};
  const decision=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  const tooltip=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
  const pool=(d,id,kind)=>d.boardPools.rows.find(row=>row.practiceId===id)[kind].multiplier;
  const ready=()=>page.waitForFunction(()=>{const d=__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision;return d.open&&d.animation.phase==='open'&&!d.interactionPending;});
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('present')));
  await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===s.frontierSec;});
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('life')));
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().navigation.mode==='vassalLife');
  await page.waitForFunction(id=>__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),nodeId);
  await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),nodeId));
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision?.open,null,{timeout:30000});
  await ready();
  await page.evaluate(async()=>{await (await import('/src/views/chronicle-art.js')).preloadChronicleArt({includeSettlementPieces:true});__SETTLEMENT_DEBUG__.forceRender();});
  await page.waitForTimeout(200);
  const snapshot=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
  writeFileSync(`${output}/initial.json`,JSON.stringify({decision:snapshot.lifeMapDecision,navigation:snapshot.navigation},null,2));
  await page.screenshot({path:`${output}/initial.png`});
  assert.equal(pool(snapshot.lifeMapDecision,'dryFarming','output'),7,'six plains feed the Grain pool');
  assert.equal(pool(snapshot.lifeMapDecision,'milling','output'),7,'Milling uses Grain too');
  assert.equal(snapshot.lifeMapDecision.poolFittings.length,0,'Structure offers have no multiplier pills');
  let d=await decision();
  const fitting=()=>d.boardPoolFittings.find(p=>p.practiceId==='logging'&&p.kind==='capacity');
  await tap(fitting());
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolMultiplier===3);
  assert.deepEqual((await tooltip()).poolBaseLines,['6 Base Capacity'],'capacity ledger shows the amount before multiplication');
  await hover((await tooltip()).poolRows[0]);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolSources?.sources.length===2);
  const store=d.offers.findIndex(offer=>offer.label.includes('Storehouse'));
  assert.ok(store>=0,'seeded Stock shop includes a real Storehouse');
  const price=await page.evaluate(i=>__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(i),store);
  await hover(price);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionConstruction);
  d=await decision();
  assert.equal(pool(d,'logging','capacity'),4,'hover previews the completed capacity');
  assert.equal(pool(d,'logging','output'),1,'Storehouse does not increase Output');
  assert.ok(d.inspectionConstruction.costs.length,'price hover shows construction Stock costs');
  const own=d.costPanels[store].cardRect,reading=d.inspectionRect;
  assert.ok(reading.x>=own.x+own.width-2,'reading clears its own buy slot');
  assert.ok(reading.width<800,'reading stays compact');
  await tap(price);await ready();
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length===1);
  await hover({x:1500,y:820});
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionLabel===null);
  d=await decision();
  assert.equal(pool(d,'logging','capacity'),4,'reservation retains completed-result reading');
  assert.ok(d.boardPoolFittings.find(p=>p.practiceId==='logging'&&p.kind==='capacity').completion);
  assert.equal((await tooltip()).poolMultiplier,4,'pinned ledger updates after purchase');
  await hover((await tooltip()).poolRows[0]);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolSources?.sources.length===3);
  assert.equal((await tooltip()).poolSources.sources.filter(s=>s.pending).length,1,'nested sources mark pending construction');
  await page.screenshot({path:`${captures}/desktop-ledger.png`});
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
  d=await decision();await hover((await tooltip()).poolRows[0]);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolSources?.sources.length===3);
  await page.screenshot({path:`${captures}/phone-ledger.png`});
  // Drag the reserved construction into the real discard target: refund, not demolition.
  const staged=d.structures.find(s=>s?.staged);
  assert.ok(staged);
  const from=await screen(await page.evaluate(origin=>__SETTLEMENT_DEBUG__.getLifeMapConstructionPoint(origin),staged.origin));
  const to=await screen({x:d.discardRect.x+d.discardRect.width/2,y:d.discardRect.y+200});
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:15});await page.mouse.up();
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length===0);
  await hover({x:1500,y:820});await page.waitForTimeout(250);
  d=await decision();assert.equal(pool(d,'logging','capacity'),3,'discard releases reserved capacity');
  assert.equal(d.projectedPrestige,d.currentPrestige,'discard releases reserved Prestige');
  assert.equal(d.demolishedStructures.length,0,'discarding a purchase creates no demolition');
  await page.keyboard.press('Escape');
  assert.equal((await tooltip()).visible,false,'Escape closes the pinned ledger');
  // A frame hover must show the same reading as the price and artwork.
  d=await decision();await hover({x:d.costPanels[store].cardRect.x+3,y:d.costPanels[store].cardRect.y+150});
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectionConstruction);
  await page.screenshot({path:`${captures}/phone-building-preview.png`});
  // Touch uses the same pinnable inspector and nested source rows.
  await hover({x:1500,y:820});await page.waitForTimeout(200);
  d=await decision();
  const touch=async p=>{const q=await screen(p);await page.touchscreen.tap(q.x,q.y);};
  await touch(fitting());
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolMultiplier===3);
  await touch((await tooltip()).poolRows[0]);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolSources?.sources.length===2);
  // Fill the real seven-cell board: long source lists remain bounded and scroll.
  for(let count=1;count<=5;count++) {
    await tap(await page.evaluate(i=>__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(i),store));
    await page.waitForFunction(n=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length===n,count);
    await ready();
  }
  await hover((await tooltip()).poolRows[0]);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolSources?.sources.length===7);
  const sources=(await tooltip()).poolSources;
  assert.ok(sources.rect.height<=310,'nested source panel shows at most five rows');
  await hover({x:sources.rect.x+sources.rect.width/2,y:sources.rect.y+sources.rect.height-30});
  await page.waitForTimeout(150);
  await page.mouse.wheel(0,120);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolSources?.scroll>0);
  for(let count=4;count>=0;count--) {
    d=await decision();const staged=d.structures.find(s=>s?.staged);
    const from=await screen(await page.evaluate(origin=>__SETTLEMENT_DEBUG__.getLifeMapConstructionPoint(origin),staged.origin));
    const to=await screen({x:d.discardRect.x+d.discardRect.width/2,y:d.discardRect.y+200});
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
    await page.waitForFunction(n=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length===n,count);
  }
  await page.keyboard.press('Escape');
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('settlement')));
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().navigation.mode==='settlement');
  const detailed=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().view);
  assert.equal(detailed.overview.practices[0].face.outputMultiplierBreakdown.multiplier,7);
  await page.screenshot({path:`${captures}/phone-settlement.png`});
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map')));
  await page.evaluate(id=>__SETTLEMENT_DEBUG__.selectWorldRegion(id),site.regionId);
  await page.waitForFunction(()=>{const w=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return w.detailPanelVisible&&!w.focusAnimating;});
  const regional=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
  const box=regional.layout.detail,pieceWidth=(box.width-44-12*4)/5;
  await touch({x:box.x+22+pieceWidth/4,y:box.y+134});
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolMultiplier===7);
  assert.deepEqual((await tooltip()).poolBaseLines,['Summer \u203a Base 2 Stock','Autumn \u203a Base 6 Stock'],'output ledger shows both seasonal base yields');
  await page.screenshot({path:`${captures}/phone-region.png`});
  await page.screenshot({path:`${captures}/phone-output-ledger.png`});
  await page.keyboard.press('Escape');
  // Practice offers expose the same pair before purchase, without moving Delve.
  const practice=createLabNodeSandbox({type:'practiceReform',prestige:200,seed:1867});
  assert.ok(selectVassalNodeOption(practice.state,practice.nodeId,'random').ok);
  await page.evaluate(({data,token})=>localStorage.setItem('civsurvivor.development-lab.handoff.'+token,JSON.stringify(data)),{data:serializeGameState(practice.state),token});
  await page.reload();
  await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__);
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('present')));
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('life')));
  await page.waitForFunction(id=>__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),practice.nodeId);
  await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),practice.nodeId));await ready();
  d=await decision();assert.ok(d.poolFittings.length>=2,'Practice offers show both multipliers');
  await touch(d.poolFittings[0]);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolMultiplier!==null);
  assert.equal((await decision()).quickCardId,null,'pill tap does not open its card reading');
  await page.evaluate(async()=>{await (await import('/src/views/chronicle-art.js')).preloadChronicleArt({includeSettlementPieces:true});__SETTLEMENT_DEBUG__.forceRender();});
  await page.screenshot({path:`${captures}/phone-practice-shop.png`});
  // Mixed shop regression: Structure hover includes a Practice staged this visit.
  const mixed=createLabNodeSandbox({type:'foodShop',prestige:200,seed:1});
  await page.evaluate(({data,token})=>localStorage.setItem('civsurvivor.development-lab.handoff.'+token,JSON.stringify(data)),{data:serializeGameState(mixed.state),token});
  await page.reload();await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__);
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('present')));
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('life')));
  await page.waitForFunction(id=>__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),mixed.nodeId);
  await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(id),mixed.nodeId));await ready();
  d=await decision();const sheepIndex=d.offers.findIndex(offer=>offer.label.includes('Sheep Husbandry'));
  await tap(await page.evaluate(i=>__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(i),sheepIndex));await ready();
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.replacementOfferId);
  await tap(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getLifeMapTableauClickPoint(0)));
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length===1);
  await ready();
  d=await decision();const granaryIndex=d.offers.findIndex(offer=>offer.label.includes('Granary'));
  const granaryPrice=await page.evaluate(i=>__SETTLEMENT_DEBUG__.getLifeMapOfferClickPoint(i),granaryIndex);
  await hover(granaryPrice);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.boardPools.rows.find(r=>r.practiceId==='sheepHusbandry')?.capacity.multiplier===3);
  d=await decision();assert.ok(d.boardPoolFittings.find(p=>p.practiceId==='sheepHusbandry'&&p.kind==='capacity').completion,'new Practice gets the hover completion marker');
  await tap(granaryPrice);
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.purchaseOrder.length===2);
  await ready();await hover({x:1500,y:820});
  await page.waitForFunction(()=>{const d=__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision;return !d.previewOfferId&&d.boardPools.rows.find(r=>r.practiceId==='sheepHusbandry')?.capacity.multiplier===3;});
  d=await decision();assert.equal(pool(d,'sheepHusbandry','capacity'),3);
  assert.ok(d.boardPoolFittings.find(p=>p.practiceId==='sheepHusbandry'&&p.kind==='capacity').completion,'reservation keeps the new Practice delta and marker');
  await page.screenshot({path:`${output}/mixed-shop-regression.png`});
  mkdirSync(committedCaptures,{recursive:true});
  for(const name of ['desktop-ledger','phone-ledger','phone-building-preview','phone-settlement','phone-region','phone-output-ledger','phone-practice-shop'])copyFileSync(`${captures}/${name}.png`,`${committedCaptures}/${name}.png`);
  writeFileSync(`${output}/result.json`,JSON.stringify({ok:true,errors,identity,checks:['Grain includes Milling','live capacity-only Structure hover','whole-slot/price construction reading','pinned nested sources','reservation marker','discard refunds','seven-source bounded scrolling','regional/detailed pairs','Practice offer pairs','mouse/touch','phone landscape'],captures:committedCaptures},null,2));
  console.log('[multiplier-browser] OK: real game shop, live/pinned/nested ledgers, construction reservation/discard, regional/detailed pairs, mouse/touch and phone landscape');
  assert.deepEqual(errors,[]);
} catch(error) {
  if(page)await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});
  writeFileSync(`${output}/failure.json`,JSON.stringify({error:error.message,errors,debug:await page?.evaluate(()=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();return {viewed:s?.viewedSec,frontier:s?.frontierSec,lineage:s?.lineage,nav:s?.navigation,decision:s?.lifeMapDecision,tooltip:globalThis.__SETTLEMENT_DEBUG__?.getTooltipDebugState()};}).catch(()=>null)},null,2));
  throw error;
} finally {await browser.close();}
