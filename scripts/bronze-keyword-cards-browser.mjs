import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync,copyFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const base=process.env.KEYWORD_PREVIEW_URL??'http://localhost:5186/';
const mode=process.env.KEYWORD_RULES??'disciplines';
const output=mode==='regular'?'docs/prototypes/keywords-classes/integrated':'docs/prototypes/keywords-classes/bronze-cards',temporary='artifacts/bronze-keyword-captures';
mkdirSync(output,{recursive:true});mkdirSync(temporary,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS),errors=[],results=[],captures=[];let page;
const capture=async name=>{await page.screenshot({path:`${temporary}/${name}.png`});captures.push(name);};
try {
  for(const [role,supply] of [['scholar','ready'],['warrior','ready'],['scholar','blocked']]) {
    console.log(`[bronze-browser] Opening ${role}/${supply}`);
    page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});
    page.on('pageerror',error=>errors.push(error.message));
    const snapshot=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot());
    const tap=async point=>{assert.ok(point);const r=await page.locator('canvas').boundingBox();await page.touchscreen.tap(r.x+point.x/2424*r.width,r.y+point.y/1080*r.height);await page.waitForTimeout(250);};
    const click=async(method,arg)=>tap(await page.evaluate(([method,arg])=>__SETTLEMENT_DEBUG__[method](arg),[method,arg]));
    const browse=async second=>{assert.equal((await page.evaluate(t=>__SETTLEMENT_DEBUG__.browseSecond(t),second)).ok,true);await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());await page.waitForTimeout(350);};
    await page.goto(`${base}?prototype=keywords&variant=${mode}&class=${role}&cards=bronze&supply=${supply}`);
    await page.getByTestId('game-new').click();await page.getByTestId('game-slot-1').click();
    await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:90000});
    await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening.phase==='completed',null,{timeout:90000});
    if(mode==='regular')assert.equal(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().gameConfig.keywordPrototype),undefined,'real ordinary rules without an experiment flag');
    await click('getTimeActionClickPoint');
    await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===s.frontierSec&&!s.graph.forecastRevealPlayheadFollowEnabled;},null,{timeout:60000});
    await browse(1);
    const capital=(await snapshot()).worldMap.regionMapIndicators.find(region=>region.controller==='player').regionId;
    await click('getWorldMapClickPoint',capital);
    if(supply==='blocked') {
      const before=(await snapshot()).worldMap.selectedRegion.detailedSettlement.practices;
      assert.equal(before[2].evaluation.supplied,false,'Grain shortage blocks Measured Rations');
      assert.equal(before[3].evaluation.supplied,false,'Timber shortage blocks Pattern Carving');
      const point=await page.evaluate(()=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().worldMap.layout.detail,w=(r.width-44-12*4)/5;return{x:r.x+22+2*(w+12)+w/2,y:r.y+122+170};});
      await tap(point);let reading=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
      if(!reading.expanded&&reading.titlePoint)await tap(reading.titlePoint);
      await capture('scholar-blocked');await page.keyboard.press('Escape');
      await browse(14);
      const after=(await snapshot()).worldMap.selectedRegion.detailedSettlement.practices;
      assert.equal(after[2].evaluation.supplied,true,'real seasonal farming restores Grain');
      assert.ok(after[2].stock>0);await capture('scholar-restored');
      await page.close();continue;
    }
    if(role==='warrior') {
      const before=(await snapshot()).worldMap.selectedRegion.detailedSettlement.practices;
      assert.equal(before[3].face.keywordReading.score,0);
      assert.equal(before[3].stock,0);
      await capture('warrior-before-kill');
    }
    await browse(role==='scholar'?34:12);
    await capture(`${role}-board`);
    for(let index=0;index<4;index++) {
      await page.keyboard.press('Escape');
      const model=(await snapshot()).worldMap.selectedRegion.detailedSettlement.practices[index];
      const id=model.face.definitionId;
      assert.equal(model.face.tier,'bronze');assert.equal(model.face.keywordReading.active,true);
      assert.ok(model.face.keywordReading.score>0);
      assert.ok(model.face.stock>0,`${id} has actual retained output`);
      const point=await page.evaluate(index=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().worldMap.layout.detail,w=(r.width-44-12*4)/5;return{x:r.x+22+index*(w+12)+w/2,y:r.y+122+170};},index);
      await tap(point);
      let tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
      if(!tooltip.expanded&&tooltip.titlePoint)await tap(tooltip.titlePoint);
      tooltip=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
      assert.equal(tooltip.expanded,true);
      assert.equal(tooltip.reading.keyword.id,role==='scholar'?'synthesis':'monsterTrophies');
      assert.ok(tooltip.reading.effects.some(effect=>effect.passive&&!effect.timing));
      assert.ok(tooltip.reading.effects.filter(effect=>effect.timing).every(effect=>!effect.text.includes('Output Multiplier')));
      await capture(id);
      if(index===0) {
        const target=tooltip.keywords.targets.find(target=>target.action===`term:${tooltip.reading.keyword.name}`);
        await tap({x:target.x+target.width/2,y:target.y+target.height/2});
        assert.equal((await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState())).keywords.term,tooltip.reading.keyword.name);
        await capture(`${role}-definition`);await page.keyboard.press('Escape');
      }
      await tap(tooltip.closePoint);
      const fitting=await page.evaluate(index=>{const r=__SETTLEMENT_DEBUG__.getSnapshot().worldMap.layout.detail,w=(r.width-44-12*4)/5,cw=Math.min(w,340*170/238);return{x:r.x+22+index*(w+12)+(w-cw)/2+cw/4,y:r.y+122+340+8+25};},index);
      await tap(fitting);
      const ledger=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTooltipDebugState());
      assert.equal(ledger.pinned,true);
      assert.ok(ledger.poolRows.some(row=>row.label===tooltip.reading.keyword.name));
      await capture(`${id}-multiplier`);
      results.push({role,id,tSec:role==='scholar'?34:12,stock:model.face.stock,score:tooltip.reading.keyword.score,multiplier:ledger.poolMultiplier,base:ledger.poolBaseLines});
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Control+Shift+D');
    await page.getByTestId('debug-close').waitFor({state:'visible'});
    assert.equal(await page.getByLabel('Keyword cards',{exact:true}).inputValue(),'bronze');
    await page.close();
  }
  assert.deepEqual(errors,[]);
  for(const name of captures)copyFileSync(`${temporary}/${name}.png`,`${output}/${name}.png`);
  writeFileSync(`${output}/browser-evidence.json`,JSON.stringify({viewport:{width:844,height:390},results,errors},null,2));
  console.log(`[bronze-browser] OK: ${results.length} new Bronze cards, real output, separate passives, linked definitions and touch ledgers; ${captures.length} PNGs; no page errors`);
}catch(error){if(page)await page.screenshot({path:`${temporary}/failure.png`}).catch(()=>{});writeFileSync(`${temporary}/failure.json`,JSON.stringify({message:error.message,errors,results},null,2));throw error;}
finally{await browser.close();}
