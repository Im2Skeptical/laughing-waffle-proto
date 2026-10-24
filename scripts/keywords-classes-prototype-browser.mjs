import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const base=process.env.KEYWORD_PREVIEW_URL??'http://localhost:5186/';
const output='docs/prototypes/keywords-classes';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const results=[],errors=[],captures=[];let page;
const capture=async relative=>{const temporary=path.join('artifacts/keywords-captures',relative),destination=path.join(output,relative);mkdirSync(path.dirname(temporary),{recursive:true});await page.screenshot({path:temporary});captures.push({temporary,destination});};
const cases=[['disciplines','scholar','ready'],['disciplines','scholar','blocked'],['disciplines','merchant','ready'],['disciplines','warrior','ready'],['lenses','scholar'],['lenses','priest'],['teachings','warrior']].filter(([mode,role,supply])=>process.env.KEYWORD_CASE?`${mode}-${role}${supply==='blocked'?'-blocked':''}`===process.env.KEYWORD_CASE:mode==='disciplines');
try {
 for(const [mode,role,supply='ready'] of cases) {
  page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});
  page.on('pageerror',error=>errors.push(error.message));
  const snap=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
  const tap=async(point)=>{
    assert.ok(point,'real screen control exists');
    const bounds=await page.locator('canvas').boundingBox();
    await page.mouse.click(bounds.x+point.x/2424*bounds.width,bounds.y+point.y/1080*bounds.height);
    await page.waitForTimeout(250);
  };
  const touch=async point=>{const bounds=await page.locator('canvas').boundingBox();await page.touchscreen.tap(bounds.x+point.x/2424*bounds.width,bounds.y+point.y/1080*bounds.height);await page.waitForTimeout(250);};
  const click=async(method,arg)=>tap(await page.evaluate(([method,arg])=>__SETTLEMENT_DEBUG__[method](arg),[method,arg]));
  const directory=mode==='disciplines'?'synthesis-a/':'';
  const caseName=`${mode}-${role}${supply==='blocked'?'-blocked':''}`;
  console.log('Opening',mode,role);
  await page.goto(`${base}?prototype=keywords&variant=${mode}&class=${role}&supply=${supply}`);
  await page.getByTestId('game-new').click();await page.getByTestId('game-slot-1').click();
  console.log('New game requested');
  await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:90000});
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening.phase==='completed',null,{timeout:90000});
  await click('getTimeActionClickPoint');
  await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===s.frontierSec&&!s.graph.forecastRevealPlayheadFollowEnabled;},null,{timeout:60000});
  // Browse a real authoritative simulation state after the first Hunt.
  assert.equal((await page.evaluate(t=>__SETTLEMENT_DEBUG__.browseSecond(t),role==='scholar'&&mode==='disciplines'?1:12)).ok,true);
  await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
  await page.waitForTimeout(500);
  const current=await snap();
  const state={...current.gameConfig.keywordPrototype,tSec:current.viewedSec,capital:current.worldMap.regionMapIndicators.find(r=>r.controller==='player').regionId,supply};
  console.log(mode,role,JSON.stringify(state));
  await click('getWorldMapClickPoint',state.capital);
  await capture(`${directory}${caseName}-board.png`);
  for(const [index,keyword] of (mode==='disciplines'&&role==='scholar'?[[1,'synthesis']]:[[1,'economicRegions'],[mode==='disciplines'?3:2,'monsterTrophies']])) {
    await page.keyboard.press('Escape');
    const point=await page.evaluate(index=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap,r=m.layout.detail;const width=(r.width-44-12*4)/5;return {x:r.x+22+index*(width+12)+width/2,y:r.y+122+170};},index);
    await tap(point);
    await page.waitForTimeout(250);
    let tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    if(!tooltip.expanded && tooltip.titlePoint)await tap(tooltip.titlePoint);
    tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    assert.equal(tooltip.reading?.keyword?.id,keyword,'inspection uses the real named score');
    if(keyword==='synthesis')assert.equal(tooltip.reading.keyword.score,supply==='blocked'?2:3,'Synthesis counts only supplied Scholar-staffed neighbours on the board');
    if(keyword==='monsterTrophies')assert.equal(tooltip.reading.keyword.score,1,'the inspected simulation state contains a real kill');
    await capture(`${directory}${caseName}-${keyword}.png`);
    assert.equal(tooltip.expanded,true,'full inspection is open');
    const target=tooltip.keywords.targets.find(target=>target.action===`term:${tooltip.reading.keyword.name}`);
    assert.ok(target,'keyword has a recursive inspection link');
    await tap({x:target.x+target.width/2,y:target.y+target.height/2});
    const reference=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
    assert.equal(reference.keywords.term,tooltip.reading.keyword.name,'tap opens the real keyword definition');
    await capture(`${directory}${caseName}-${keyword}-definition.png`);
    await page.keyboard.press('Escape');
    let multiplier=null,recovery=null;
    if(mode==='disciplines') {
      assert.equal(tooltip.reading.keyword.inMultiplierPool,true);
      assert.ok(tooltip.reading.effects.filter(effect=>effect.timing).every(effect=>!effect.text.includes('Output Multiplier')),'timed rows contain only activation effects');
      assert.ok(tooltip.reading.effects.some(effect=>effect.passive===true&&!effect.timing&&effect.text.includes('Output Multiplier')),'passive multiplier has a separate untimed row');
      await tap(tooltip.closePoint);
      const fitting=await page.evaluate(index=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().worldMap.layout.detail,width=(r.width-44-12*4)/5,cardWidth=Math.min(width,340*170/238);return{x:r.x+22+index*(width+12)+(width-cardWidth)/2+cardWidth/4,y:r.y+122+340+8+25};},index);
      await touch(fitting);
      multiplier=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
      assert.equal(multiplier.pinned,true,'touch pins the existing multiplier ledger');
      assert.equal(multiplier.poolMultiplier,1+tooltip.reading.keyword.bonus,'the existing fitting shows the keyword contribution');
      assert.deepEqual(multiplier.poolBaseLines,[keyword==='economicRegions'?'1 Base Stock':'3 Base Stock'],'authored Stock amount stays unchanged');
      if(tooltip.reading.keyword.active)assert.ok(multiplier.poolRows.some(row=>row.label===tooltip.reading.keyword.name));
      await capture(`${directory}${caseName}-${keyword}-multiplier.png`);
      if(keyword==='synthesis') {
        const row=multiplier.poolRows.find(row=>row.label==='Synthesis');
        await touch(row);
        const sources=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState().poolSources);
        assert.deepEqual(sources.sources.map(source=>source.label),supply==='blocked'?['Irrigating','Scholarship']:['Irrigating','Scholarship','Papermaking']);
        await capture(`${directory}${caseName}-${keyword}-sources.png`);
        if(supply==='blocked') {
          await page.keyboard.press('Escape');
          assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(12))).ok,true);
          await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
          await page.waitForTimeout(300);
          const restored=(await snap()).worldMap.selectedRegion.detailedSettlement.practices[1].face;
          assert.equal(restored.keywordReading.score,3,'real irrigation restores Papermaking eligibility');
          assert.equal(restored.outputMultiplierBreakdown.multiplier,4);
          await touch(fitting);
          await capture(`${directory}${caseName}-${keyword}-restored.png`);
          recovery={tSec:12,score:restored.keywordReading.score,multiplier:restored.outputMultiplierBreakdown.multiplier};
        }
      }
    }
    results.push({mode,role,keyword,state,expanded:tooltip.expanded,reading:tooltip.reading.keyword,referenceOpened:reference.keywords.term,recovery,multiplier:multiplier?{total:multiplier.poolMultiplier,base:multiplier.poolBaseLines,rows:multiplier.poolRows.map(({label,amount})=>({label,amount}))}:null});
  }
  // The switch lives in the existing live workshop, outside the card design.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('debug-close').waitFor({state:'visible'});
  assert.equal(await page.getByLabel('Keyword option',{exact:true}).inputValue(),mode);
  assert.equal(await page.getByLabel('Synthesis supply',{exact:true}).inputValue(),supply);
  await page.keyboard.press('Escape');
  await page.close();
 }
 assert.deepEqual(errors,[],'no browser errors');
 for(const {temporary,destination} of captures){mkdirSync(path.dirname(destination),{recursive:true});copyFileSync(temporary,destination);}
 const evidence=cases.every(([mode])=>mode==='disciplines')?`${output}/synthesis-a/browser-evidence.json`:`${output}/browser-evidence.json`;
 writeFileSync(evidence,JSON.stringify({viewport:{width:844,height:390},results,errors},null,2));
 console.log('[keywords-browser] OK: playable class states, named inspection links and existing multiplier ledgers');
}catch(error){
 if(page)await page.screenshot({path:'artifacts/keywords-browser-failure.png'}).catch(()=>{});
 writeFileSync('artifacts/keywords-browser-failure.json',JSON.stringify({message:error.message,errors,results},null,2));
 throw error;
}finally{await browser.close();}
