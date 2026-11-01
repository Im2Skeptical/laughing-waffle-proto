import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const results=[];
try {
 for(const query of ['', '?dev=1']) {
  const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage();
  page.setDefaultTimeout(180000);
  const requests=[];page.on('request',r=>requests.push(r.url()));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => { crypto.getRandomValues = array => { array.fill(123); return array; }; performance.setResourceTimingBufferSize(3000); });
  const start=Date.now();await page.goto((process.env.PROBE_URL ?? 'http://localhost:5186/')+query);
  await page.getByTestId('game-new').waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-testid=game-new]').disabled);
  const menuMs=Date.now()-start;
  await page.getByTestId('game-new').click();await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  const entryMs=Date.now()-start;
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.transferSize})));
  const art=resources.filter(r=>/sprite-sheets|map-generation.*\.(png|webp)/.test(r.url));
  const result={query,menuMs,entryMs,artRequests:requests.filter(url=>/sprite-sheets/.test(url)).length,artBytes:art.reduce((a,r)=>a+r.bytes,0),errors};results.push(result);
  await page.screenshot({path:`artifacts/minimal-${query?'dev':'normal'}.png`});
  await context.close();
 }
 writeFileSync('artifacts/minimal-load-comparison.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
