import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const base=process.env.KEYWORD_PREVIEW_URL??'http://localhost:5186/';
const output='docs/prototypes/keywords-classes';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const results=[],errors=[];let page;
const cases=[['disciplines','scholar'],['disciplines','warrior'],['lenses','scholar'],['lenses','priest'],['teachings','warrior']].filter(([mode,role])=>!process.env.KEYWORD_CASE||`${mode}-${role}`===process.env.KEYWORD_CASE);
try {
 for(const [mode,role] of cases) {
  page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});
  page.on('pageerror',error=>errors.push(error.message));
  const snap=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
  const tap=async(point)=>{
    assert.ok(point,'real screen control exists');
    const bounds=await page.locator('canvas').boundingBox();
    await page.mouse.click(bounds.x+point.x/2424*bounds.width,bounds.y+point.y/1080*bounds.height);
    await page.waitForTimeout(250);
  };
  const click=async(method,arg)=>tap(await page.evaluate(([method,arg])=>__SETTLEMENT_DEBUG__[method](arg),[method,arg]));
  console.log('Opening',mode,role);
  await page.goto(`${base}?prototype=keywords&variant=${mode}&class=${role}`);
  await page.getByTestId('game-new').click();await page.getByTestId('game-slot-1').click();
  console.log('New game requested');
  await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:90000});
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening.phase==='completed',null,{timeout:90000});
  await click('getTimeActionClickPoint');
  await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===s.frontierSec&&!s.graph.forecastRevealPlayheadFollowEnabled;},null,{timeout:60000});
  // Browse a real authoritative simulation state after the first Hunt.
  assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(12))).ok,true);
  await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
  await page.waitForTimeout(500);
  const current=await snap();
  const state={...current.gameConfig.keywordPrototype,tSec:current.viewedSec,capital:current.worldMap.regionMapIndicators.find(r=>r.controller==='player').regionId};
  console.log(mode,role,JSON.stringify(state));
  await click('getWorldMapClickPoint',state.capital);
  await page.screenshot({path:`${output}/${mode}-${role}-board.png`});
  for(const [index,keyword] of [[1,'economicRegions'],[2,'monsterTrophies']]) {
    await page.keyboard.press('Escape');
    const point=await page.evaluate(index=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap,r=m.layout.detail;const width=(r.width-44-12*4)/5;return {x:r.x+22+index*(width+12)+width/2,y:r.y+122+170};},index);
    await tap(point);
    await page.waitForTimeout(250);
    let tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    if(!tooltip.expanded && tooltip.titlePoint)await tap(tooltip.titlePoint);
    tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    assert.equal(tooltip.reading?.keyword?.id,keyword,'inspection uses the real named score');
    if(keyword==='monsterTrophies')assert.equal(tooltip.reading.keyword.score,1,'the inspected simulation state contains a real kill');
    await page.screenshot({path:`${output}/${mode}-${role}-${keyword}.png`});
    assert.equal(tooltip.expanded,true,'full inspection is open');
    const target=tooltip.keywords.targets.find(target=>target.action===`term:${tooltip.reading.keyword.name}`);
    assert.ok(target,'keyword has a recursive inspection link');
    await tap({x:target.x+target.width/2,y:target.y+target.height/2});
    const reference=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    assert.equal(reference.keywords.term,tooltip.reading.keyword.name,'tap opens the real keyword definition');
    await page.screenshot({path:`${output}/${mode}-${role}-${keyword}-definition.png`});
    await page.keyboard.press('Escape');
    results.push({mode,role,keyword,state,expanded:tooltip.expanded,reading:tooltip.reading.keyword,referenceOpened:reference.keywords.term});
  }
  // The switch lives in the existing live workshop, outside the card design.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('debug-close').waitFor({state:'visible'});
  assert.equal(await page.getByLabel('Keyword option',{exact:true}).inputValue(),mode);
  await page.keyboard.press('Escape');
  await page.close();
 }
 assert.deepEqual(errors,[],'no browser errors');
 writeFileSync(`${output}/browser-evidence.json`,JSON.stringify({viewport:{width:844,height:390},results,errors},null,2));
 console.log('[keywords-browser] OK: five playable role/option states; real board and inspection captures');
}catch(error){
 if(page)await page.screenshot({path:'artifacts/keywords-browser-failure.png'}).catch(()=>{});
 writeFileSync('artifacts/keywords-browser-failure.json',JSON.stringify({message:error.message,errors,results},null,2));
 throw error;
}finally{await browser.close();}
