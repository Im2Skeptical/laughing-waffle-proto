import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const prefix = '/laughing-waffle-proto/', port = 18894;
const url = `http://127.0.0.1:${port}${prefix}`;
const artifact = 'artifacts/prototype-workbenches-browser-probe.json';
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, url).pathname);
    if (!pathname.startsWith(prefix)) throw new Error('Outside deployment');
    const file = path.resolve('dist', pathname.slice(prefix.length) + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(path.resolve('dist') + path.sep)) throw new Error('Outside dist');
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end('Not found'); }
});
await mkdir('artifacts', { recursive:true });
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const checks = [], errors = [], failures = [];
let browser, page;
async function ready() {
  try {await page.locator('body[data-ready="true"]').waitFor();}
  catch {throw new Error(`Workbench not ready: ${page.url()}; ${await page.locator('#error,#state').allTextContents().catch(()=>[])}`);}
}
async function noOverflow(label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(n => {
    const r=n.getBoundingClientRect();return r.width && (r.right>innerWidth+1 || r.left < -1) && !n.closest('.stage-scroll');
  }).slice(0,8).map(n => ({tag:n.tagName,id:n.id,class:n.className,right:Math.round(n.getBoundingClientRect().right)})));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label}: horizontal overflow ${JSON.stringify(overflow)}`);
}
const selectedCheck=process.argv.find(arg=>arg.startsWith('--check='))?.slice(8).toLowerCase();
async function check(label, action) {if(selectedCheck&&!label.toLowerCase().includes(selectedCheck))return;await action(); checks.push(label);}
async function fullscreenRoundTrip(selector) {
  const button = page.locator(`${selector} .dev-preview-fullscreen`);
  await button.click();
  await page.waitForFunction(selector => document.querySelector(selector).classList.contains('dev-preview-expanded'), selector);
  assert.equal(await button.getAttribute('aria-label'), 'Exit preview fullscreen');
  const rect = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  assert.ok(Math.abs(rect.width - viewport.width) < 2 && Math.abs(rect.height - viewport.height) < 2, 'preview fills the viewport');
  await button.click();
  await page.waitForFunction(selector => !document.querySelector(selector).classList.contains('dev-preview-expanded'), selector);
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await button.getAttribute('aria-label'), 'Enter preview fullscreen');
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
}
async function exportedSize() {
  return page.evaluate(async () => {
    const image = new Image(); image.src = vassalWorkbench.exportPng(); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
    const context=canvas.getContext('2d'); context.drawImage(image,0,0);
    return { width:image.width, height:image.height, centerAlpha:context.getImageData(image.width/2,image.height/2,1,1).data[3] };
  });
}
async function openingPoint(kind,index=0) {
  const canvas=page.getByTestId('opening-game-screen');await canvas.scrollIntoViewIfNeeded();
  const point=await page.evaluate(({kind,index})=>openingWorkbench.getClientPoint(kind,index),{kind,index});
  assert.ok(point,`Opening canvas target ${kind}/${index}`);return point;
}
async function openingClick(kind,index=0,touch=false) {
  if(['option','offer','face','confirm','undo','tableau','inspectClose','acquire'].includes(kind))await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.modal.animation==='open');
  let point=await openingPoint(kind,index);
  if(touch)await page.touchscreen.tap(point.x,point.y);
  else {await page.mouse.move(point.x,point.y);await page.waitForTimeout(180);point=await openingPoint(kind,index);await page.mouse.click(point.x,point.y);}
}
async function openingEnter(id,touch=false) {
  await openingClick('node',id,touch);
  await page.waitForFunction(id=>openingWorkbench.getSnapshot().game.graph.candidateId===id,id);
  await openingClick('enter',0,touch);
  await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.graph.entryAnimation==='open');
  await openingClick('enter',0,touch);
  await page.waitForFunction(id=>openingWorkbench.getSnapshot().activeId===id,id);
}
try {
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({ viewport:{ width:1280,height:800 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await check('Pages subpath, two active workbenches, retirement and refresh', async () => {
    await page.goto(`${url}#/dev/prototypes`);
    await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    assert.equal(await page.locator('.lab-prototype-open').count(),2);
    assert.deepEqual(await page.locator('.lab-prototype-open').allTextContents(), ['Open Opening workbench \u2192', 'Open Vassals workbench \u2192']);
    for (const folder of ['card-chrome-prototype','structure-chrome-prototype','keyword-inspection-prototype']) {
      assert.equal((await fetch(`${url}images/dark-fantasy/${folder}/`)).status,404,`${folder} is retired from deployment`);
    }
    await noOverflow('directory desktop');
    await page.reload(); await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844}); await noOverflow('directory portrait');
  });
  await check('Opening playthrough, real founding, purchase, rewind and same-seed outcomes', async () => {
    await page.setViewportSize({width:1280,height:800});
    await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`); await ready();
    assert.equal(await page.evaluate(()=>openingWorkbench.getSnapshot().summary.prestige),18,'real seed-42 founder Prestige');
    await page.getByRole('button',{name:'Relic & invest',exact:true}).click();
    const next=page.getByRole('button',{name:'Next guided choice',exact:true});
    for(let step=0;step<24;step++) {
      if(await next.isDisabled())break;
      await next.click(); await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy);
    }
    const first=await page.evaluate(()=>openingWorkbench.getSnapshot());
    assert.deepEqual(first.visitedIds,['relic','founding','shop','development','martial','supply','favor']);
    assert.equal(first.summary.classId,'warrior');assert.equal(first.summary.dead,false);
    assert.ok(first.summary.sites.some(site=>site.practices.some(p=>p?.label==='Herding Train')),'real purchase installed');
    await page.getByRole('button',{name:'Rewind decision',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getSnapshot().availableIds),['favor']);
    // Replaying the last encounter and its earned level-up uses the same RNG state.
    for(let step=0;step<4;step++) {if(await next.isDisabled())break;await next.click();await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy);}
    assert.deepEqual((await page.evaluate(()=>openingWorkbench.getSnapshot())).summary,first.summary);
    await page.screenshot({path:'artifacts/prototype-opening-desktop.png'});
  });
  await check('Pixi game screen: graph entry, relic, founding, inspect, drag, undo and world navigation', async () => {
    await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`);await ready();
    await page.getByRole('button',{name:'Relic & invest',exact:true}).click();
    assert.equal(await page.getByTestId('opening-game-screen').count(),1);
    assert.equal(await page.locator('#decision,#graph').count(),0,'gameplay uses the Pixi screen');
    await openingEnter('relic');await openingClick('option',0);await openingClick('acquire','equip');
    await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('relic'));
    assert.ok((await page.evaluate(()=>openingWorkbench.getSnapshot().summary.heirlooms)).includes('Minor Seal'));
    await openingEnter('founding');await openingClick('option',0);await openingClick('confirm');
    await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().summary.classId==='warrior');
    await openingEnter('shop');
    await openingClick('offer',0);await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.modal.purchaseOrder.length===1);
    assert.ok(await page.evaluate(()=>openingWorkbench.getSnapshot().game.modal.projectedPrestige<openingWorkbench.getSnapshot().summary.prestige));
    await openingClick('undo',0);await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.modal.purchaseOrder.length===0);
    await openingClick('face',0);await page.waitForFunction(()=>!!openingWorkbench.getSnapshot().game.modal.inspectedCardId);
    await page.screenshot({path:'artifacts/prototype-opening-pixi-inspection.png'});
    await openingClick('inspectClose');
    const from=await openingPoint('face',0),to=await openingPoint('tableau',2);
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
    await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.modal.purchaseOrder.length===1);
    await page.screenshot({path:'artifacts/prototype-opening-pixi-shop.png'});
    await openingClick('confirm');await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('shop'));
    await openingClick('nav','map');assert.equal(await page.evaluate(()=>openingWorkbench.getSnapshot().game.mode),'map');
    await page.screenshot({path:'artifacts/prototype-opening-pixi-world.png'});
    await openingClick('nav','settlement');assert.equal(await page.evaluate(()=>openingWorkbench.getSnapshot().game.mode),'settlement');
    await openingClick('nav','life');
    await openingEnter('development');await openingClick('option',0);await openingClick('confirm');
    await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('development'));
    await openingEnter('martial');await openingClick('option',0);await openingClick('confirm');
    await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().game.level.open);
    await openingClick('level',0);await openingClick('levelConfirm');
    await page.waitForFunction(()=>!openingWorkbench.getSnapshot().game.level.open);
    await fullscreenRoundTrip('#game-screen');
  });
  await check('Pixi opening touch and portrait landscape fallback', async () => {
    const previous=page,mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    page=await mobile.newPage();page.on('pageerror',error=>errors.push(error.message));
    let phase='boot';
    try {
      await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`);await ready();
      phase='fullscreen';
      await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.reject(new Error('Denied for fallback check'));});
      await page.locator('#game-screen .dev-preview-fullscreen').tap();
      await page.waitForFunction(()=>document.querySelector('#game-screen').classList.contains('dev-preview-expanded')&&!document.querySelector('.dev-preview-fullscreen').disabled);
      phase='node entry';await openingEnter('relic',true);
      phase='option selection';await openingClick('option',0,true);
      phase='acquisition';await openingClick('acquire','equip',true);
      await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('relic'));
      await page.screenshot({path:'artifacts/prototype-opening-pixi-phone.png'});
      await page.locator('#game-screen .dev-preview-fullscreen').tap();
      await page.waitForFunction(()=>!document.querySelector('#game-screen').classList.contains('dev-preview-expanded'));
      await noOverflow('opening portrait after fullscreen');
    }catch(error){
      const actual=await page.evaluate(()=>({ready:document.body.dataset.ready,status:document.querySelector('#status').textContent,game:openingWorkbench.getSnapshot().game,
        activeId:openingWorkbench.getSnapshot().activeId,viewport:{width:innerWidth,height:innerHeight},canvas:document.querySelector('canvas').getBoundingClientRect().toJSON()}));
      await writeFile('artifacts/opening-pixi-touch-failure.json',JSON.stringify({phase,actual,error:error.message},null,2));
      await page.screenshot({path:'artifacts/opening-pixi-touch-failure.png'});
      throw new Error(`Touch ${phase}: ${error.message.split('\n')[0]}; details artifacts/opening-pixi-touch-failure.json`);
    }finally{await mobile.close();page=previous;}
  });
  await check('Opening draft edit, save/reload, import/export and phone containment', async () => {
    await page.getByRole('button',{name:'Explore & save',exact:true}).click();
    await page.getByRole('button',{name:'Next guided choice',exact:true}).click();
    const before=await page.evaluate(()=>openingWorkbench.getSnapshot().summary);
    await page.locator('#edit-node').selectOption('explore');
    await page.getByLabel('Override phases (blank = offer cost)').fill('9');
    await page.getByRole('button',{name:'Apply node edits',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getSnapshot().summary),before,'editing does not mutate the running experiment');
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.reload();await ready();
    const saved=await page.evaluate(()=>JSON.parse(document.querySelector('#json').value));
    assert.equal(saved.nodes.find(n=>n.id==='explore').phaseCost,9);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
    const exported=await download;assert.equal(exported.suggestedFilename(),'protovassal-opening.json');
    await page.locator('#import').setInputFiles({name:'opening.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...saved,name:'Imported opening',seed:43}))});
    await page.waitForFunction(()=>document.querySelector('#experiment-name').value==='Imported opening');
    assert.equal(await page.locator('#experiment-name').inputValue(),'Imported opening');
    await page.getByRole('button',{name:'Restart',exact:true}).click();
    for(const viewport of [{width:390,height:844},{width:844,height:390}]) {await page.setViewportSize(viewport);await noOverflow('opening phone');}
    await page.screenshot({path:'artifacts/prototype-opening-mobile.png'});
    await page.getByText('Experiment JSON / import',{exact:true}).click();
    await page.locator('#json').fill(JSON.stringify({...saved,entryIds:['missing']}));
    await page.getByRole('button',{name:'Apply JSON to draft',exact:true}).click();
    assert.match(await page.locator('#status').textContent(),/existing nodes/);
  });
  await page.setViewportSize({width:1280,height:800});
  await page.goto(`${url}images/dark-fantasy/vassal-chrome-prototype/`); await ready();
  await check('Vassal fullscreen uses the same control on desktop and phone landscape', async () => {
    await fullscreenRoundTrip('#hero');
    await page.setViewportSize({width:844,height:390});
    await fullscreenRoundTrip('#hero');
    await page.setViewportSize({width:1280,height:800});
  });
  await check('Founder slot wrapping, keyboard, locked and open Scholar, silhouettes', async () => {
    for (const slots of [4,6,8]) {
      await page.locator('#slots').selectOption(String(slots));
      await page.evaluate(() => vassalWorkbench.selectFounder(0));
      await page.locator('#previous').click();
      assert.equal(await page.evaluate(() => vassalWorkbench.state.index),slots-1);
      assert.equal(await page.evaluate(() => vassalWorkbench.founders.at(-1).mystery),true);
      await page.locator('h1').click(); await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => vassalWorkbench.state.index),0);
    }
    await page.locator('#founder').selectOption('1');
    assert.equal(await page.evaluate(() => vassalWorkbench.state.guided),true);
    await page.locator('#guided').uncheck();
    assert.equal(await page.evaluate(() => vassalWorkbench.state.guided),false);
    const png=await exportedSize(); assert.deepEqual([png.width,png.height],[2424,1080]);
  });
  await check('Vassal layouts, long-name warning, reset, bounded contexts and transparent exports', async () => {
    await page.getByRole('button',{name:'Regular vassal',exact:true}).click();
    for (const classId of ['warrior','scholar']) for (const layout of ['identity','signature','stats']) {
      await page.locator('#classId').selectOption(classId); await page.locator('#layout').selectOption(layout);
      assert.equal(await page.evaluate(() => vassalWorkbench.canvasCount),7);
    }
    await page.locator('#name').fill('A very long candidate name that should stay inside the confirmation button bounds');
    await page.waitForFunction(() => vassalWorkbench.warnings.some(w => w.includes('Confirmation button')));
    await page.screenshot({path:'artifacts/prototype-vassal-long-name.png'});
    await page.locator('#reset').click();
    assert.equal(await page.evaluate(() => vassalWorkbench.state.name),'Aren');
    await page.getByRole('button',{name:'Class frames',exact:true}).click(); await page.locator('#frameOnly').check();
    const png=await exportedSize(); assert.deepEqual([png.width,png.height],[680,760]); assert.equal(png.centerAlpha,0);
    for (const viewport of [{width:844,height:390},{width:390,height:844}]) { await page.setViewportSize(viewport); await noOverflow('vassals phone'); }
    await page.getByRole('link',{name:/Development Lab prototypes/}).click();
    await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
  });
  assert.deepEqual(errors,[],'workbench page/network errors');
} catch (error) {
  failures.push(error.message);
  const blockers=await page?.evaluate(() => {
    const link=[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Development Lab prototypes'));
    if(!link)return [];
    const r=link.getBoundingClientRect();return document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).slice(0,4).map(n=>({html:n.outerHTML.slice(0,350),parent:n.parentElement?.id}));
  }).catch(()=>[]);
  failures.push(JSON.stringify(blockers));
  await page?.screenshot({path:'artifacts/prototype-workbenches-failure.png'}).catch(() => {});
} finally {
  await writeFile(artifact,JSON.stringify({checks,errors,failures},null,2));
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
if (failures.length) { console.error(`[prototype-workbenches] Failed: ${failures[0].split('\n')[0]}\nReproduce: npm run probe:prototypes\nDetails: ${artifact}`); process.exitCode=1; }
else console.log(`[prototype-workbenches] OK: ${checks.length} checks; Pages subpath, desktop/mobile, Opening/Vassals, real outcomes, retirement, draft import/export. Details: ${artifact}`);
