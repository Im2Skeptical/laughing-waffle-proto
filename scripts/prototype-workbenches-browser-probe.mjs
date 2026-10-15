import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PANEL } from '../src/views/vassal-node-decision/constants.js';
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
// Draft file actions sit in the toolbar's Draft… disclosure.
async function draftAction(name) {
  const menu=page.locator('#toolbar .draft-menu');
  if(!await menu.evaluate(node=>node.open))await menu.locator('summary').click();
  await page.getByRole('button',{name,exact:true}).click();
  await menu.evaluate(node=>{node.open=false;});
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
  // Each atlas frame is cached once; a repeat means a sheet was loaded twice.
  page.on('console', message => { if (/\[Cache\] already has key/.test(message.text())) errors.push(message.text()); });
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await check('Pages subpath, three active workbenches, retirement and refresh', async () => {
    await page.goto(`${url}#/dev/prototypes`);
    await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    assert.equal(await page.locator('.lab-prototype-open').count(),3);
    assert.deepEqual(await page.locator('.lab-prototype-open').allTextContents(), ['Open Map workbench \u2192', 'Open Opening workbench \u2192', 'Open Vassals workbench \u2192']);
    for (const folder of ['card-chrome-prototype','structure-chrome-prototype','keyword-inspection-prototype']) {
      assert.equal((await fetch(`${url}images/dark-fantasy/${folder}/`)).status,404,`${folder} is retired from deployment`);
    }
    await noOverflow('directory desktop');
    await page.reload(); await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844}); await noOverflow('directory portrait');
  });
  await check('Pixi first load: both entry nodes open choices while artwork is pending', async () => {
    await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`); await ready();
    const points = await page.evaluate(() => Object.fromEntries(['relic','explore'].map(id => [id,openingWorkbench.getPoint('node',id)])));
    for (const id of ['relic','explore']) {
      let release, held = 0;
      const gate = new Promise(resolve => { release = resolve; });
      const pattern = '**/images/sprite-sheets/**';
      await page.route(pattern, async route => { held++; await gate; await route.continue(); });
      try {
        await page.reload({waitUntil:'domcontentloaded'});
        await page.waitForFunction(() => window.openingWorkbench && document.querySelector('[data-testid="opening-game-screen"]'));
        const canvas = page.getByTestId('opening-game-screen'); await canvas.scrollIntoViewIfNeeded();
        const rect = await canvas.boundingBox(), p = points[id];
        await page.mouse.click(rect.x+p.x/2424*rect.width,rect.y+p.y/1080*rect.height);
        await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
        await page.waitForFunction(id => openingWorkbench.getSnapshot().activeId === id,id);
        const actual = await page.evaluate(() => {const s=openingWorkbench.getSnapshot();return {activeId:s.activeId,ready:document.body.dataset.ready,modalOpen:s.game?.modal.open,family:s.game?.modal.family};});
        assert.ok(held>0,'artwork is still pending during entry');
        assert.equal(actual.modalOpen,true,`First-load ${id} choices open before artwork finishes: ${JSON.stringify(actual)}`);
        assert.equal(actual.family,id==='relic'?'relic':'travel');
        assert.ok(await page.evaluate(()=>!!openingWorkbench.getPoint('option',0)),'choices have rendered controls');
      } finally {release();await page.unrouteAll({behavior:'wait'});}
      await ready();
    }
  });
  await check('World Decision: direct preview, whole map, move/build selection, Tour and relic acquisition', async () => {
    await page.setViewportSize({width:1280,height:800});
    await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`);await ready();
    await draftAction('Restore built-in draft');
    await page.locator('#edit-node').selectOption('explore');await page.locator('#preview-node').click();
    await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.worldDecision.open);
    const world=()=>page.evaluate(()=>openingWorkbench.getSnapshot().game.worldDecision);
    assert.equal((await world()).regionCount,15,'whole world is represented');
    assert.deepEqual((await world()).panel,PANEL,'World Decision uses the shared node-modal body');
    const checkFocus=async mode=>{
      const view=await world();
      const expected=[...new Set([view.locationRegionId,...view.targets.filter(t=>!t.blocked).map(t=>t.regionId)].filter(Boolean))];
      assert.deepEqual(view.brightRegionIds,expected,`${mode} highlights only legal destinations and origin`);
      assert.equal(view.brightRegionIds.length+view.dimmedRegionIds.length,view.regionCount,`${mode} dims every other region`);
      assert.ok(view.dimmedRegionIds.length>0);
      assert.equal(view.prices.length,3,'all World Decision options show their shared cost panel');
      for(const item of [...view.prices,view.feedback]) {
        const r=item.rect;
        assert.ok(r.x>=PANEL.x&&r.y>=PANEL.y&&r.x+r.width<=PANEL.x+PANEL.width&&r.y+r.height<=PANEL.y+PANEL.height,
          `${mode} prices and feedback stay inside the modal, above the timegraph`);
      }
      const selected=view.targets.find(t=>t.id===view.selectedOptionId),price=view.prices.find(p=>p.mode===mode);
      if(selected){assert.equal(price.optionId,selected.id);assert.equal(price.phaseCost,selected.phases);assert.equal(price.prestigeCost,selected.cost);}
      assert.ok(!view.feedback.text.includes('Prestige'),'price text no longer floats below the modal');
      const before=view.selectedOptionId;
      await openingClick('worldTarget',view.dimmedRegionIds[0]);
      assert.equal((await world()).selectedOptionId,before,`${mode} ignores unavailable destinations`);
      const body=view.mapBody;
      assert.ok(body.x>=PANEL.x&&body.y>=PANEL.y&&body.x+body.width<=PANEL.x+PANEL.width&&body.y+body.height<=PANEL.y+PANEL.height);
      await page.screenshot({path:`artifacts/prototype-world-decision-${mode}.png`});
    };
    const before=await page.evaluate(()=>openingWorkbench.getSnapshot().summary);
    await openingClick('worldMode','move');const move=(await world()).targets.find(t=>!t.blocked);assert.ok(move);
    await openingClick('worldTarget',move.regionId);assert.equal((await world()).selectedOptionId,move.id);await checkFocus('move');
    await openingClick('worldMode','build');const build=(await world()).targets.find(t=>!t.blocked);assert.ok(build);
    await openingClick('worldTarget',build.regionId);assert.equal((await world()).selectedOptionId,build.id);await checkFocus('build');
    await openingClick('worldMode','tour');assert.equal((await world()).selectedOptionId,'tour');
    await checkFocus('tour');assert.deepEqual((await world()).brightRegionIds,[(await world()).locationRegionId]);
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getSnapshot().summary),before,'map previews apply no world changes');
    await page.screenshot({path:'artifacts/prototype-world-decision.png'});
    await openingClick('confirm');
    await page.waitForFunction(()=>openingWorkbench.getSnapshot().visitedIds.includes('explore')||openingWorkbench.getSnapshot().game.modal.family==='relic');
    if(await page.evaluate(()=>openingWorkbench.getSnapshot().activeId==='explore'))await openingClick('acquire','carry');
    await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('explore'));
    assert.equal(await page.evaluate(()=>openingWorkbench.getSnapshot().summary.location),before.location);
    for(const chance of [0,100]){
      await page.locator('#edit-node').selectOption('explore');await page.locator('#tour-relic-chance').fill(String(chance));
      await page.getByRole('button',{name:'Apply node edits',exact:true}).click();await page.locator('#preview-node').click();
      await openingClick('worldMode','tour');assert.equal((await world()).tour.relicChance,chance);
      await openingClick('confirm');
      if(chance===100){
        await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.modal.family==='relic');
        await page.locator('#preview-node').click();assert.equal((await world()).open,true,'preview replaces an unclaimed discovery');
        await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>openingWorkbench.getSnapshot().game.modal.open),false,'closing the full map leaves no old modal beneath it');
        await page.locator('#preview-node').click();assert.equal((await world()).open,true,'preview reopens a dismissed World Decision');
        await openingClick('worldMode','tour');await openingClick('confirm');
        await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.modal.family==='relic');await openingClick('acquire','carry');
      }
      await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('explore'));
    }
    for(const mode of ['move','build']) {
      await page.locator('#preview-node').click();await openingClick('worldMode',mode);
      const start=await world(), choice=start.targets.find(t=>!t.blocked);assert.ok(choice);
      await openingClick('worldTarget',choice.regionId);await openingClick('confirm');
      await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('explore'));
      const end=await world();
      assert.equal(end.locationRegionId,mode==='move'?choice.regionId:start.locationRegionId);
      assert.equal(end.connectionCount,start.connectionCount+(mode==='build'?1:0));
    }
    const previous=page,mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page=await mobile.newPage();
    try{await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`);await ready();await page.locator('#edit-node').selectOption('explore');await page.locator('#preview-node').tap();
      await page.locator('#game-screen .dev-preview-fullscreen').tap();await page.waitForFunction(()=>document.querySelector('#game-screen').classList.contains('dev-preview-expanded'));
      for(const mode of ['move','build']) {
        await openingClick('worldMode',mode,true);
        const choice=(await world()).targets.find(t=>!t.blocked);assert.ok(choice);
        await openingClick('worldTarget',choice.regionId,true);
        assert.equal((await world()).selectedOptionId,choice.id,`${mode} map selection works in the phone modal`);
      }
      await openingClick('worldMode','tour',true);assert.equal((await world()).selectedOptionId,'tour');
      assert.deepEqual((await world()).brightRegionIds,[(await world()).locationRegionId]);
      await page.screenshot({path:'artifacts/prototype-world-decision-phone.png'});await openingClick('confirm',0,true);
      await page.waitForFunction(()=>openingWorkbench.getSnapshot().visitedIds.includes('explore')||openingWorkbench.getSnapshot().game.modal.family==='relic');
      if(await page.evaluate(()=>openingWorkbench.getSnapshot().activeId==='explore'))await openingClick('acquire','carry',true);
      await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('explore'));
    }finally{await mobile.close();page=previous;}
    await draftAction('Restore built-in draft');
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
  await check('Opening phone layout: landscape game first, portrait rotate screen, 44px targets, icon stats', async () => {
    const previous=page;
    for (const viewport of [{width:844,height:390},{width:390,height:844}]) {
      const mobile=await browser.newContext({viewport,isMobile:true,hasTouch:true});page=await mobile.newPage();
      try {
        await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`);await ready();
        const layout=await page.evaluate(()=>{const canvas=document.querySelector('#game-screen canvas').getBoundingClientRect();
          const small=[...document.querySelectorAll('button,a,summary,input,select')].filter(node=>{const r=node.getBoundingClientRect();return r.width&&r.height<44;}).map(node=>node.textContent.trim()||node.type);
          return {canvasBottom:canvas.bottom,hint:getComputedStyle(document.querySelector('.rotate-hint')).display,small,
            metrics:[...document.querySelectorAll('#summary .metric')].map(node=>({icon:!!node.querySelector('img.stat-icon'),text:node.textContent}))};});
        assert.deepEqual(layout.small,[],'every control is at least 44px tall');
        assert.ok(layout.metrics.length===8&&layout.metrics.every(metric=>metric.icon&&!/null|undefined/.test(metric.text)),'summary stats carry game icons and real values');
        if(viewport.width>viewport.height){assert.ok(layout.canvasBottom<=viewport.height,'landscape shows the whole game on the first screen');assert.equal(layout.hint,'none');}
        else assert.notEqual(layout.hint,'none','portrait shows the rotate screen');
      } finally { await mobile.close(); }
    }
    page=previous;
  });
  await check('Opening graph editor: reorder, add, duplicate, remove, draw routes and undo invalid edits', async () => {
    await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`); await ready();
    await draftAction('Restore built-in draft');
    const before=await page.evaluate(()=>openingWorkbench.getSnapshot().summary);
    const graph=()=>page.evaluate(()=>openingWorkbench.getSnapshot().draftGraph);
    const successors=async id=>(await graph()).nodes.find(n=>n.id===id).next;
    await page.locator('#graph-editor .graph-card[data-node="development"]').click();
    await page.locator('#graph-move-target').selectOption('founding');await page.locator('#graph-move-before').click();
    assert.deepEqual(await successors('relic'),['development']);assert.deepEqual(await successors('explore'),['development']);
    assert.deepEqual(await successors('development'),['founding']);assert.deepEqual(await successors('shop'),['martial']);
    await page.locator('#graph-row').fill('2');await page.locator('#graph-position').click();
    assert.deepEqual((await graph()).nodes.find(n=>n.id==='development').editorPosition,{column:1,row:1});
    assert.deepEqual(await successors('development'),['founding'],'position changes do not rewire the route');
    await page.locator('#graph-auto-arrange').click();
    await page.locator('#graph-new-kind').selectOption('patronage');await page.locator('#graph-add').click();
    assert.deepEqual(await successors('development'),['patronage-1']);assert.deepEqual(await successors('patronage-1'),['founding']);
    await page.locator('#graph-editor [data-from="development"][data-to="patronage-1"]').click();await page.locator('#graph-remove-edge').click();
    assert.ok((await graph()).issue);await page.locator('#graph-undo').click();assert.equal((await graph()).issue,'');
    await page.locator('#graph-duplicate').click();assert.equal((await graph()).nodes.length,10);
    await page.locator('#graph-remove-node').click();assert.equal((await graph()).nodes.length,9);
    await page.locator('#graph-undo').click();assert.equal((await graph()).nodes.length,10);
    await page.locator('#graph-redo').click();assert.equal((await graph()).nodes.length,9);
    await page.locator('#edit-node').selectOption('shop');await page.locator('#graph-move-target').selectOption('development');await page.locator('#graph-move-before').click();
    assert.deepEqual(await successors('shop'),['development']);assert.deepEqual(await successors('founding'),['martial']);
    await page.locator('#graph-editor .graph-scroll').evaluate(n=>{n.scrollLeft=0;});
    const source=await page.locator('#graph-editor [data-port="out"][data-node="explore"]').boundingBox();
    const target=await page.locator('#graph-editor .graph-card[data-node="development"]>rect').boundingBox();
    await page.locator('#graph-editor').scrollIntoViewIfNeeded();
    const a=await page.locator('#graph-editor [data-port="out"][data-node="explore"]').boundingBox(),b=await page.locator('#graph-editor .graph-card[data-node="development"]>rect').boundingBox();
    assert.ok(source&&target&&a&&b);
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();
    await page.waitForFunction(()=>openingWorkbench.getSnapshot().draftGraph.nodes.find(n=>n.id==='explore').next.includes('development'));
    await page.locator('#graph-editor [data-from="explore"][data-to="development"]').click();await page.locator('#graph-remove-edge').click();
    assert.deepEqual(await successors('explore'),['shop']);
    await page.locator('#graph-editor .graph-routes summary').click();await page.locator('#graph-from').selectOption('shop');await page.locator('#graph-to').selectOption('development');await page.locator('#graph-disconnect').click();
    assert.ok((await graph()).issue);assert.equal(await page.locator('#graph-play').isDisabled(),true);
    await page.locator('#graph-undo').click();assert.equal((await graph()).issue,'');
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getSnapshot().summary),before,'graph authoring leaves the running world unchanged');
    await page.getByRole('button',{name:'Fit graph',exact:true}).click();await page.screenshot({path:'artifacts/prototype-opening-graph-editor.png'});
    await page.locator('#graph-play').click();await openingEnter('relic');await openingClick('option',0);await openingClick('acquire','equip');
    await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('relic'));
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getSnapshot().availableIds),['shop'],'Pixi play follows the edited graph');
  });
  await check('Opening grid: box selection, group drag, single drag, pan, notes, persistence and note play', async () => {
    await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`);await ready();
    await draftAction('Restore built-in draft');
    const graph=()=>page.evaluate(()=>openingWorkbench.getSnapshot().draftGraph);
    const cells=()=>page.evaluate(()=>openingWorkbench.getEditorSnapshot().cells);
    const center=(column,row)=>page.evaluate(({column,row})=>openingWorkbench.getEditorCellPoint(column,row),{column,row});
    const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
    await page.locator('#graph-editor .graph-scroll').scrollIntoViewIfNeeded();
    let a=await center(0,0),b=await center(0,1);
    await drag({x:a.x-130,y:a.y-60},{x:b.x+130,y:b.y+60});
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getEditorSnapshot().selectedIds),['relic','explore']);
    const routes=(await graph()).nodes.map(n=>n.next);
    a=await center(0,0);b=await center(0,1);await drag(a,b);
    assert.deepEqual((await cells()).relic,{column:0,row:1});assert.deepEqual((await cells()).explore,{column:0,row:2});
    assert.deepEqual((await graph()).nodes.map(n=>n.next),routes);
    await page.locator('#graph-undo').click();assert.deepEqual((await cells()).relic,{column:0,row:0});
    await page.locator('#graph-redo').click();assert.deepEqual((await cells()).explore,{column:0,row:2});
    await page.locator('#graph-editor .graph-card[data-node="development"]').click();
    await page.locator('#graph-editor .graph-card[data-node="relic"]').click({modifiers:['Shift']});
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getEditorSnapshot().selectedIds),['development','relic']);
    await page.locator('#graph-editor .graph-card[data-node="relic"]').click({modifiers:['Control']});
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getEditorSnapshot().selectedIds),['development']);
    await page.locator('#graph-editor .graph-scroll').scrollIntoViewIfNeeded();
    a=await center(3,0);b=await center(3,1);await drag(a,b);
    assert.deepEqual((await cells()).development,{column:3,row:1});assert.deepEqual((await graph()).nodes.map(n=>n.next),routes);
    a=await center(3,1);b=await center(3,2);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});
    assert.ok(await page.locator('#graph-editor svg').evaluate(n=>n.contains(document.activeElement)),`drag keeps graph keyboard focus; actual=${await page.evaluate(()=>document.activeElement.tagName)}`);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.deepEqual((await cells()).development,{column:3,row:1},'Escape cancels a drag');
    await page.keyboard.press('ArrowDown');assert.deepEqual((await cells()).development,{column:3,row:2});
    await page.keyboard.press('ArrowUp');assert.deepEqual((await cells()).development,{column:3,row:1});
    await page.locator('#graph-pan-mode').click();await page.locator('#graph-editor .graph-scroll').scrollIntoViewIfNeeded();
    const scrollBox=await page.locator('#graph-editor .graph-scroll').boundingBox();
    await drag({x:scrollBox.x+scrollBox.width-80,y:scrollBox.y+60},{x:scrollBox.x+scrollBox.width-280,y:scrollBox.y+60});
    assert.ok(await page.locator('#graph-editor .graph-scroll').evaluate(n=>n.scrollLeft>0));
    await page.locator('#graph-select-mode').click();await page.locator('#edit-node').selectOption('relic');
    await page.locator('#graph-add-note').click();await page.locator('#note-title').fill('A bargain at the crossroads');
    const intention='Let the player trade safety for a scarce stock.\n'+Array.from({length:30},(_,i)=>`Intention ${i+1}: offer an understandable cost and a useful outcome.`).join('\n');
    await page.locator('#note-intention').fill(intention);await page.getByRole('button',{name:'Save note',exact:true}).click();
    assert.equal((await graph()).nodes.find(n=>n.id==='customNote-1').kind,'customNote');
    await draftAction('Save draft');const saved=await graph();
    await page.reload();await ready();assert.deepEqual(await graph(),saved);
    await page.locator('#edit-node').selectOption('customNote-1');assert.equal(await page.locator('#note-intention').inputValue(),intention);
    await page.getByRole('button',{name:'Fit graph',exact:true}).click();await page.locator('#graph-editor').scrollIntoViewIfNeeded();
    await page.screenshot({path:'artifacts/prototype-opening-grid-selection.png'});
    await page.locator('#graph-play').click();await openingEnter('relic');await openingClick('option',0);await openingClick('acquire','equip');
    await page.waitForFunction(()=>!openingWorkbench.getSnapshot().busy&&openingWorkbench.getSnapshot().visitedIds.includes('relic'));
    const beforeNote=await page.evaluate(()=>openingWorkbench.getSnapshot().summary);
    await openingEnter('customNote-1');assert.equal(await page.evaluate(()=>openingWorkbench.getSnapshot().game.note.title),'A bargain at the crossroads');
    assert.ok(await page.evaluate(()=>openingWorkbench.getSnapshot().game.note.maxScroll>0));
    const canvas=await page.getByTestId('opening-game-screen').boundingBox();
    await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height*.5);await page.mouse.wheel(0,320);
    await page.waitForFunction(()=>openingWorkbench.getSnapshot().game.note.scrollY>0);
    await page.screenshot({path:'artifacts/prototype-opening-custom-note.png'});
    await openingClick('confirm');await page.waitForFunction(()=>openingWorkbench.getSnapshot().visitedIds.includes('customNote-1'));
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getSnapshot().summary),beforeNote);
    assert.deepEqual(await page.evaluate(()=>openingWorkbench.getSnapshot().availableIds),['founding']);
  });
  await check('Opening graph editor phone controls and containment', async () => {
    const previous=page,mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    page=await mobile.newPage();
    try {
      await page.goto(`${url}images/dark-fantasy/life-map-opening-prototype/`);await ready();
      await page.locator('#edit-node').selectOption('development');await page.locator('#graph-move-target').selectOption('founding');await page.locator('#graph-move-before').tap();
      assert.deepEqual(await page.evaluate(()=>openingWorkbench.getSnapshot().draftGraph.nodes.find(n=>n.id==='development').next),['founding']);
      await page.locator('#graph-new-kind').selectOption('shop');await page.locator('#graph-add').tap();
      assert.equal(await page.locator('#graph-editor .graph-card').count(),9);
      await page.locator('#graph-undo').tap();assert.equal(await page.locator('#graph-editor .graph-card').count(),8);
      await page.locator('#graph-row').fill('3');await page.locator('#graph-position').tap();
      assert.equal(await page.evaluate(()=>openingWorkbench.getEditorSnapshot().cells.relic.row),2);
      await page.locator('#graph-add-note').tap();await page.locator('#note-title').fill('Phone note');await page.locator('#note-intention').fill('Give a simple early choice.');await page.getByRole('button',{name:'Save note',exact:true}).tap();
      await noOverflow('graph editor phone');await page.screenshot({path:'artifacts/prototype-opening-graph-editor-phone.png'});
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
    await draftAction('Save draft');
    await page.reload();await ready();
    const saved=await page.evaluate(()=>JSON.parse(document.querySelector('#json').value));
    assert.equal(saved.nodes.find(n=>n.id==='explore').phaseCost,9);
    const download=page.waitForEvent('download');await draftAction('Export JSON');
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
