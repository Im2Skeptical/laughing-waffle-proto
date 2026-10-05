import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const url='http://127.0.0.1:18891', artifact='artifacts/timegraph-alignment-probe.json';
mkdirSync('artifacts',{recursive:true});
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','18891','--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
let browser,page;const checks=[],errors=[];
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<.002,
  `${label}: expected ${expected.toFixed(4)}, actual ${actual.toFixed(4)}`);
try {
  for(let i=0;i<50;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${url}/#/dev/gym`);
  await page.waitForFunction(()=>globalThis.__LAB_DEBUG__?.getScene()?.graph.computedCoverageEndSec===60);
  // Forecast completion can precede atlas loading. Without the illustration,
  // Pixi's bounds enclose only the smaller ink layer, not the painted scroll.
  await page.waitForFunction(()=>{
    const frame=globalThis.__LAB_DEBUG__?.getScene()?.graph.windowScreenRect;
    return Math.abs(frame?.width-1980)<1 && Math.abs(frame?.height-332)<1;
  });
  for(const viewport of [{width:1280,height:900},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await page.getByTestId('lab-scene').evaluate(canvas=>canvas.scrollIntoView({block:'end'}));
    const {plot,graph}=await page.evaluate(()=>__LAB_DEBUG__.getScene());
    const canvas=await page.getByTestId('lab-scene').boundingBox(),frame=graph.windowScreenRect;
    const sx=canvas.width/2424,sy=canvas.height/1200;
    // Golden recess coordinates in the normal game's painted 1700 x 258 scroll.
    // The Lab's 1980 x 332 artwork used to resize independently of these elements.
    near((plot.x-canvas.x-frame.x*sx)/(frame.width*sx),233/1700,'plot left');
    near((plot.y-canvas.y-frame.y*sy)/(frame.height*sy),60/258,'plot top');
    near(plot.width/(frame.width*sx),1365/1700,'plot width');
    near(plot.height/(frame.height*sy),156/258,'plot height');
    for(const [index,center] of [292.5,453.5,615.5].entries()) {
      near((graph.groupButtons[index].x-frame.x)/frame.width,center/1700,'group label x');
      near((graph.groupButtons[index].y-frame.y)/frame.height,29/258,'group label y');
    }
    near((graph.focusButton.x-frame.x)/frame.width,1556.5/1700,'focus target');
    near((graph.key.pageButtons[0].x-frame.x)/frame.width,63/1700,'key page target x');
    near((graph.key.pageButtons[0].y-frame.y)/frame.height,214/258,'key page target y');
    const firstKey=graph.legendButtons[0];
    near((firstKey.x-frame.x)/frame.width,64/1700,'key glyph x');
    near((firstKey.y-frame.y)/frame.height,70/258,'key glyph y');
    await page.mouse.click(plot.x+plot.width*.75,plot.y+plot.height*.5);
    await page.waitForFunction(()=>Math.abs(__LAB_DEBUG__.getSnapshot().state.tSec-45)<=1);
    await page.screenshot({path:`artifacts/timegraph-alignment-${viewport.width}.png`});
    checks.push(`${viewport.width}: plot, labels, cabinet, click targets and scrub align with the scroll`);
  }
  const point=await page.evaluate(()=>__LAB_DEBUG__.getScene().graph.focusButton);
  const canvas=await page.getByTestId('lab-scene').boundingBox();
  await page.mouse.click(canvas.x+point.x*canvas.width/2424,canvas.y+point.y*canvas.height/1200);
  await page.waitForFunction(()=>__LAB_DEBUG__.getScene().graph.zoomed);
  assert.deepEqual(errors,[]);
  writeFileSync(artifact,JSON.stringify({ok:true,checks},null,2));
  console.log('[probe:timegraph-alignment] OK: desktop/mobile scroll geometry and input');
} catch(e) {
  await page?.screenshot({path:'artifacts/timegraph-alignment-failure.png'}).catch(()=>{});
  writeFileSync(artifact,JSON.stringify({error:e.stack,errors,checks},null,2));
  console.error(`[probe:timegraph-alignment] FAILED: ${e.message.split('\n')[0]}; ${artifact}`);process.exitCode=1;
} finally {await browser?.close();server.kill();}
