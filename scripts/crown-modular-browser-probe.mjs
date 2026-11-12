import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
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
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{};});
 await page.goto((process.env.PROBE_URL??'http://localhost:5192/')+'?perf=1&art=1&launch=new'+(phase==='before'?'&crownArt=baseline':''));
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
 const map=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
 const capital=map.regionMapIndicators.find(r=>r.crownCapital).regionId;
 for(const viewport of [{width:1440,height:900},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>__SETTLEMENT_DEBUG__.forceRender());
  await page.screenshot({path:`${output}/overview-${viewport.width}.png`});
  await tap(await page.evaluate(id=>__SETTLEMENT_DEBUG__.getWorldMapClickPoint(id),capital));
  await page.waitForFunction(()=>{const m=__SETTLEMENT_DEBUG__.getSnapshot().worldMap;return m.detailPanelVisible&&!m.focusAnimating;});
  await page.screenshot({path:`${output}/capital-${viewport.width}.png`});
  const snapshot=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap);
  reports.push({viewport,capital,terrain:snapshot.illustratedTerrain,readouts:snapshot.floatingReadouts});
  await page.evaluate(id=>__SETTLEMENT_DEBUG__.selectWorldRegion(id),capital);
  await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.detailPanelVisible);
 }
 assert.deepEqual(errors,[]);
 if(phase==='after')checkCrownRenderedComposition({reports,errors});
 writeFileSync(output+'/report.json',JSON.stringify({phase,errors,reports},null,2));
 console.log(`Crown modular ${phase}: desktop/phone real-game captures; ${errors.length} page errors; ${output}`);
}catch(error){await page.screenshot({path:output+'/failure.png'}).catch(()=>{});const snapshot=await page.evaluate(()=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();return {second:s?.viewedSec,opening:s?.opening,playback:s?.playbackTarget,visible:s?.worldMap?.visible,detail:s?.worldMap?.detailPanelVisible};}).catch(()=>null);writeFileSync(output+'/failure.txt',error.stack+'\n'+JSON.stringify(snapshot));throw error;}
finally{await browser.close();}
