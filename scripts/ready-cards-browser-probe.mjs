import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
import { execFileSync } from 'node:child_process';

const baseline = process.argv.includes('--baseline');
const loadingOnly = process.argv.includes('--loading-only');
const levelOnly = process.argv.includes('--level-only');
const mapOnly = process.argv.includes('--map-only');
const captureOnly = process.argv.includes('--capture-only');
const originalMapModules = new Set([
  'src/views/world-map-pixi.js', 'src/views/world-map/illustrated-terrain.js',
  'src/views/world-map/regional-presentation.js', 'src/views/world-map/territory-art.js',
  'images/dark-fantasy/map-generation-prototype/roads.js',
  'images/dark-fantasy/map-generation-prototype/road-crossings.js',
  'images/dark-fantasy/map-generation-prototype/playable-terrain.js',
  'src/views/game-loading-dom.js',
]);
const output = process.argv.find(a=>a.startsWith('--output='))?.slice(9) ?? (baseline ? 'artifacts/ready-cards-before' : 'artifacts/ready-cards');
await mkdir(output, { recursive: true });
const root = path.resolve('.');
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<body style="margin:0;background:#171713"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script>');
      return;
    }
    const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(root + path.sep)) throw new Error('Outside checkout');
    response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    let content=baseline && originalMapModules.has(relative)
      ? execFileSync('git', ['show', `HEAD:${relative}`], { windowsHide:true }) : await readFile(file);
    response.end(content);
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, page;
const errors = [], results = [];
try {
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  if(!levelOnly&&!mapOnly)for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async baseline => {
      const { readyLoadingFixture } = await import('/scripts/ready-loading-view-checks.js');
      return readyLoadingFixture({baseline});
    },baseline);
    results.push({viewport,loading:result});
    await page.screenshot({path:`${output}/loading-new-${viewport.width}.png`});
    await page.evaluate(()=>readyLoading.setMode('continue'));
    await page.screenshot({path:`${output}/loading-returning-${viewport.width}.png`});
    await page.close();page=null;
  }
  if(!loadingOnly){
  if(!mapOnly)for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    page = await browser.newPage({ viewport, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => {
      const { checkReadyLevelUp } = await import('/scripts/ready-level-up-view-checks.js');
      return checkReadyLevelUp();
    });
    results.push({ viewport, ...result });
    await page.screenshot({ path: `${output}/${viewport.width}.png` });
    await page.close(); page = null;
  }
  if(!levelOnly)for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?dev=1`);
    const result = await page.evaluate(async () => {
      const { readyMapFixture } = await import('/scripts/ready-map-view-checks.js');
      return readyMapFixture();
    });
    assert.equal(result.ready, true, 'illustrated map ready');
    if (baseline) {
      assert.equal(result.ferries, 0, 'baseline has no dock/ferry treatment for water gaps');
    } else {
      assert.equal(result.roads, result.connections, 'every connection has a land/ferry presentation route');
      assert.ok(result.ferries > 0, 'the island regression fixture paints a ferry');
      if(!captureOnly)assert.ok(result.ferrySizes.every(s=>Math.max(s.width,s.height)<10),'ferries remain small at overview scale');
    }
    assert.equal(result.unchanged, true, 'map presentation preserves serialized state/RNG');
    results.push({ viewport, map: result });
    await page.screenshot({ path: `${output}/map-${viewport.width}.png` });
    if(!baseline){
      const point=await page.evaluate(()=>{
        const p=readyMap.view.getRegionClickPoint(readyMap.state.civilization.remnant.capitalRegionId),b=readyMap.app.view.getBoundingClientRect();
        return {x:b.x+p.x/2424*b.width,y:b.y+p.y/1080*b.height};
      });
      await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-700);
      await page.waitForFunction(()=>readyMap.view.getSemanticSnapshot().camera.zoom>1);
      await page.waitForFunction(()=>!readyMap.view.getSemanticSnapshot().focusAnimating);
      await page.screenshot({path:`${output}/crown-capital-${viewport.width}.png`});
      const reset=await page.evaluate(()=>{
        const walk=n=>[n,...(n.children??[]).flatMap(walk)],label=walk(readyMap.app.stage).find(n=>n.text==='Reset'),p=label.getBounds(),b=readyMap.app.view.getBoundingClientRect();
        return {x:b.x+(p.x+p.width/2)/2424*b.width,y:b.y+(p.y+p.height/2)/1080*b.height};
      });
      await page.mouse.click(reset.x,reset.y);
      await page.waitForFunction(()=>!readyMap.view.getSemanticSnapshot().focusAnimating);
      const swamp=await page.evaluate(async()=>{
        const {getWorldDefinition}=await import('/src/model/world-state.js');
        const regions=getWorldDefinition(readyMap.state).regions.filter(r=>r.biome==='swamp');
        const region=regions.find(r=>r.name==='Western Swamp');
        const p=readyMap.view.getRegionClickPoint(region.id),b=readyMap.app.view.getBoundingClientRect();
        return {x:b.x+p.x/2424*b.width,y:b.y+p.y/1080*b.height};
      });
      await page.mouse.move(swamp.x,swamp.y);await page.mouse.wheel(0,-700);
      await page.waitForFunction(()=>readyMap.view.getSemanticSnapshot().camera.zoom>1);
      await page.screenshot({path:`${output}/swamp-roads-${viewport.width}.png`});
      await page.mouse.click(reset.x,reset.y);
    }
    const positions = await page.evaluate(() => {
      readyMap.setSecond(8);
      const walk = node => [node, ...(node.children ?? []).flatMap(walk)];
      const boats = () => walk(readyMap.app.stage).filter(n => n.label === 'ferry-crossing').map(n => ({x:n.children.at(-1).x,y:n.children.at(-1).y}));
      const first=boats();readyMap.setSecond(18);const moved=boats();readyMap.setSecond(8);return {first,moved,restored:boats()};
    });
    if(!baseline)assert.notDeepEqual(positions.first, positions.moved);
    assert.deepEqual(positions.first, positions.restored, 'rewind restores actual rendered boats');
    if(!baseline){
      const point=await page.evaluate(()=>{
        const walk=n=>[n,...(n.children??[]).flatMap(walk)];
        const crossings=walk(readyMap.app.stage).filter(n=>n.label==='ferry-crossing');
        const crossing=crossings.find(n=>n.islandCrossing&&n.connectionId!=='R09:R17')??crossings.find(n=>n.islandCrossing)??crossings[0];
        const p=crossing.children.at(-1).getGlobalPosition(),b=readyMap.app.view.getBoundingClientRect();
        return {x:b.x+p.x/2424*b.width,y:b.y+p.y/1080*b.height,id:crossing.connectionId};
      });
      await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-1000);
      await page.waitForFunction(()=>{readyMap.view.update(1/60);return readyMap.view.getSemanticSnapshot().camera.zoom>1;});
      await page.waitForFunction(()=>!readyMap.view.getSemanticSnapshot().focusAnimating);
      await page.screenshot({path:`${output}/island-crossing-${viewport.width}.png`});
      if(!captureOnly){
        const scale=await page.evaluate(()=>({zoom:readyMap.view.getSemanticSnapshot().camera.zoom,boats:readyMap.report().ferrySizes}));
        const ratio=scale.zoom/result.zoom;
        for(let i=0;i<scale.boats.length;i++){
          assert.ok(Math.abs(scale.boats[i].width/result.ferrySizes[i].width-ratio)<.02,'boat width follows the map zoom');
          assert.ok(Math.abs(scale.boats[i].height/result.ferrySizes[i].height-ratio)<.02,'boat height follows the map zoom');
        }
      }
      results.push({viewport,islandCrossing:point.id});
      const ownership=await page.evaluate(()=>{
        const id=readyMap.state.civilization.remnant.capitalRegionId,region=readyMap.state.world.regions.find(r=>r.id===id);
        const read=()=>readyMap.view.getSemanticSnapshot().illustratedTerrain.sites.find(s=>s.regionId===id)?.kind??null;
        region.controller='player';readyMap.view.refresh();readyMap.view.update();const captured=read();
        region.controller='external-a';readyMap.view.refresh();readyMap.view.update();const restored=read();
        return {captured,restored,unchanged:readyMap.report().unchanged};
      });
      assert.equal(ownership.captured,'player','captured capital uses player settlement presentation');
      assert.equal(ownership.restored,'crownCapital','rewind restores the existing fitted Crown kit');
      assert.equal(ownership.unchanged,true,'viewing capture/rewind preserves serialized state/RNG');
    }
    await page.close(); page = null;
  }
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ ok: true, results }, null, 2));
  console.log(baseline ? '[ready-cards] BASELINE reproduced unmarked water crossings; screenshots captured'
    : '[ready-cards] PASS desktop/phone: level-up choices, full illustrated routes, docks/ferries, rewind and unchanged state/RNG');
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/result.json`, JSON.stringify({ error: error.stack, errors, results }, null, 2));
  console.error(`[ready-cards] FAILED: ${error.message}; ${output}/result.json`);
  process.exitCode = 1;
} finally {
  await browser?.close(); server.close();
}
