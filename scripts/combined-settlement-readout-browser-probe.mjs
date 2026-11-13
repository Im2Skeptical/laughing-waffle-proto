import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from './browser-probe-config.mjs';

const output='artifacts/combined-settlement-readouts';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
const errors=[],reports=[];page.on('pageerror',error=>errors.push(error.message));
const tap=async point=>{assert(point);const b=await page.locator('canvas').boundingBox();await page.touchscreen.tap(b.x+point.x/2424*b.width,b.y+point.y/1080*b.height);};
const overlaps=(a,b)=>a.x<b.x+b.width-.1&&a.x+a.width>b.x+.1&&a.y<b.y+b.height-.1&&a.y+a.height>b.y+.1;
const semantics=r=>Object.fromEntries(['regionId','holder','status','warriors','warriorForce','bonusForce','minimumLoyal','thresholdShare','zeroForceShare','forceReductionShare','barParts','countKind','count','shownPrestige','exactPrestige','prestigeActive','prestigeLabel','unrest','force','shownForce','required','screenScale'].map(k=>[k,r[k]]));
try{
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
 await page.goto((process.env.PROBE_URL??'http://localhost:5184/')+'?perf=1&art=1&launch=new');
 await page.waitForFunction(()=>globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount===20,null,{timeout:180000});
 await page.getByTestId('game-menu').waitFor({state:'hidden',timeout:180000});
 await page.waitForFunction(()=>document.querySelector('[data-artwork-ready="true"]'),null,{timeout:180000});
 await page.locator('[data-artwork-ready="true"]').click();
 const browse=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'));if(browse)await tap(browse);
 const nav=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getNavigationClickPoint('map'));if(nav)await tap(nav);
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.visible&&__SETTLEMENT_DEBUG__.getSnapshot().worldMap.illustratedTerrain?.ready,null,{timeout:180000});
 const lever=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTimeLeverScreenRect());await tap({x:lever.x+lever.width/2,y:lever.y+lever.height/2});
 await page.evaluate(()=>__SETTLEMENT_DEBUG__.browseSecond(0));
 await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().viewedSec===0);
 const capital=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.regionMapIndicators.find(r=>r.crownCapital).regionId);
 console.log('Combined readouts: real map ready, held at year zero.');
 for(const viewport of [{width:1440,height:900},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  let baseline;
  for(const variant of ['split','plate','medallion','crest']){
   await page.evaluate(({variant,capital})=>{const u=new URL(location.href);u.searchParams.set('settlementReadout',variant);history.replaceState(null,'',u);__SETTLEMENT_DEBUG__.selectWorldRegion(capital);}, {variant,capital});
   await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating;});
   await page.evaluate(id=>__SETTLEMENT_DEBUG__.selectWorldRegion(id),capital);
   await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.detailPanelVisible);
   await page.waitForFunction(v=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.floatingReadouts.every(r=>r.layoutVariant===v),variant);
   await page.screenshot({path:`${output}/${variant}-overview-${viewport.width}.png`});
   await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),capital));
   await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating;});
   await page.screenshot({path:`${output}/${variant}-capital-${viewport.width}.png`});
   const m=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
   const values=m.floatingReadouts.map(semantics);if(variant==='split')baseline=values;else assert.deepEqual(values,baseline,`${variant}: all real readings and rules unchanged`);
   const crowns=m.floatingReadouts.filter(r=>r.crown);assert.equal(crowns.length,1);
   const c=crowns[0];assert.equal(c.regionId,capital);assert(Math.abs(c.crown.x+c.crown.width/2-c.shieldAnchor.x)<.2,'Crown follows the shield horizontally');
   assert(Math.abs(c.crown.y+c.crown.height-(c.shieldAnchor.y-25*c.screenScale))<6,'Crown attached to shield top');
   for(const r of m.floatingReadouts){
    assert(!overlaps(r.countBounds,r.sprite),`${variant} ${r.regionId}: workers clear artwork`);
    assert(!overlaps(r.prestige,r.sprite),`${variant} ${r.regionId}: Prestige clears artwork`);
    assert(!overlaps(r.bar,r.sprite),`${variant} ${r.regionId}: influence clears artwork`);
    assert(!overlaps(r.countBounds,r.prestige),`${variant} ${r.regionId}: number rows distinct`);
   }
   reports.push({viewport,variant,capital,readouts:m.floatingReadouts,camera:m.camera,canvasBox:await page.locator('canvas').boundingBox()});
   await page.evaluate(id=>__SETTLEMENT_DEBUG__.selectWorldRegion(id),capital);
   await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.detailPanelVisible);
   console.log(`Combined readouts: ${variant}, ${viewport.width}px captured and checked.`);
  }
 }
 assert.deepEqual(errors,[]);writeFileSync(output+'/report.json',JSON.stringify({errors,reports},null,2));
 console.log(`Combined readouts: desktop/phone values, artwork clearance, Crown attachment checked. ${output}`);
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});writeFileSync(output+'/failure.txt',error.stack);throw error;}
finally{await browser.close();}
