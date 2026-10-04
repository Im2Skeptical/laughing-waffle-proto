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
async function keywordTap(action,group='reference',touch=false) {
  await page.locator('#inspection').scrollIntoViewIfNeeded();
  let target;
  for(let attempt=0;attempt<8;attempt++) {
    target=await page.evaluate(({action,group})=>keywordWorkbench.targets.find(target=>target.action===action&&target.group===group&&target.height>10),{action,group});
    if(target)break;
    const viewport=await page.evaluate(group=>keywordWorkbench.viewports.find(viewport=>viewport.group===group),group);
    assert.ok(viewport,`Missing Pixi target ${group}/${action}`);
    await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);await page.mouse.wheel(0,240);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  assert.ok(target,`No visible Pixi target ${group}/${action}`);
  if(touch)await page.touchscreen.tap(target.x+target.width/2,target.y+target.height/2);
  else await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
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
try {
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({ viewport:{ width:1280,height:800 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await check('Pages subpath, Prototypes route, four links and refresh', async () => {
    await page.goto(`${url}#/dev/prototypes`);
    await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    assert.equal(await page.locator('.lab-prototype-open').count(),4);
    assert.deepEqual(await page.locator('.lab-prototype-open').allTextContents(), ['Open Cards workbench →', 'Open Vassals workbench →', 'Open Structures workbench →', 'Open Inspector workbench →']);
    assert.equal((await fetch(`${url}images/dark-fantasy/tooltip-prototype/`)).status,404,'The retired tooltip page is absent from deployment');
    assert.equal(await page.locator('nav [data-mode="prototypes"]').getAttribute('aria-current'),'page');
    await noOverflow('directory desktop');
    await page.screenshot({path:'artifacts/prototype-directory-desktop.png'});
    await page.reload(); await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844}); await noOverflow('directory portrait');
    await page.screenshot({path:'artifacts/prototype-directory-mobile.png'});
    await page.setViewportSize({width:1280,height:800});
    await page.getByRole('link',{name:'Open Structures workbench →'}).click(); await ready();
    assert.equal(await page.locator('#screen-preview canvas').count(),1);
    assert.equal(await page.evaluate(()=>structureWorkbench.scene.practiceSlots),5);
    assert.equal(await page.evaluate(()=>structureWorkbench.scene.width),2048);
    await page.locator('#inspect').click();
    assert.equal(await page.evaluate(()=>structureWorkbench.state.inspectId),'granary');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>structureWorkbench.state.inspectId),null);
    await page.getByRole('button',{name:'Next treatment'}).click();
    assert.equal(new URL(page.url()).searchParams.get('variant'),'B');
    await page.reload(); await ready();
    assert.equal(await page.evaluate(()=>structureWorkbench.state.variant),'B');
    await noOverflow('structures desktop');
    await fullscreenRoundTrip('#screen-preview');
    await page.setViewportSize({width:390,height:844}); await noOverflow('structures portrait');
    await page.setViewportSize({width:844,height:390});
    await fullscreenRoundTrip('#screen-preview');
    await page.goto(`${url}#/dev/prototypes`);
    await page.setViewportSize({width:1280,height:800});
    await page.getByRole('link',{name:'Open Cards workbench →'}).click(); await ready();
  });
  await check('Matched live renderer, graphics toggle, regional/shop contexts and fullscreen', async () => {
    await page.locator('#card').selectOption('forage');
    const before = await page.evaluate(() => ({ face: JSON.stringify(cardWorkbench.face), image: document.querySelector('#hero canvas').toDataURL() }));
    assert.equal(await page.locator('#source-comparison canvas').count(), 1);
    assert.equal(await page.locator('#prototype-comparison canvas').count(), 1);
    await page.locator('#graphics').selectOption('source');
    await page.waitForFunction(() => cardWorkbench.state.graphics === 'source');
    assert.equal(await page.evaluate(() => JSON.stringify(cardWorkbench.face)), before.face, 'graphics preserves all face data');
    assert.notEqual(await page.evaluate(() => document.querySelector('#hero canvas').toDataURL()), before.image, 'rendered graphics change');
    assert.equal(await page.locator('#screen-preview').getAttribute('data-card-count'), '5');
    assert.equal(await page.locator('#screen-preview').getAttribute('data-graphics'), 'source');
    await page.screenshot({path:'artifacts/prototype-cards-source-desktop.png'});
    await page.locator('#graphics').selectOption('prototype');
    await page.locator('#screen-context').selectOption('shop');
    assert.equal(await page.locator('#screen-preview').getAttribute('data-card-count'), '3');
    await fullscreenRoundTrip('#hero');
    await fullscreenRoundTrip('#screen-preview');
    await page.locator('#screen-preview .dev-preview-fullscreen').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#screen-preview').classList.contains('dev-preview-expanded'));
    await page.waitForFunction(() => !document.fullscreenElement);
    for (const context of ['settlement','shop']) {
      await page.locator('#screen-context').selectOption(context);
      await page.locator('#screen-preview').scrollIntoViewIfNeeded();
      await page.screenshot({path:`artifacts/prototype-cards-${context}-desktop.png`});
    }
    await page.setViewportSize({width:844,height:390});
    await fullscreenRoundTrip('#screen-preview');
    await page.setViewportSize({width:1280,height:800});
  });
  await check('Card presets, extremes, contained numeric bounds and phone widths', async () => {
    for (const preset of ['scheduled-simple','scheduled-complex','charge-simple','charge-complex']) {
      await page.evaluate(preset => cardWorkbench.selectPreset(preset), preset);
      const bad = await page.evaluate(() => cardWorkbench.numberBounds.filter(b => !b.fits).map(b => b.label));
      assert.deepEqual(bad,[],preset);
      await page.locator('#advance').click();
    }
    await page.locator('#stockCapacity').fill('999'); await page.locator('#stockCapacity').press('Tab');
    await page.locator('#stock').fill('999'); await page.locator('#stock').press('Tab');
    await page.locator('#output').fill('99'); await page.locator('#output').press('Tab');
    assert.deepEqual(await page.evaluate(() => cardWorkbench.numberBounds.filter(b => !b.fits).map(b => b.label)),[]);
    for (const viewport of [{width:844,height:390},{width:390,height:844}]) { await page.setViewportSize(viewport); await noOverflow('cards phone'); }
    await page.getByRole('link',{name:/Development Lab prototypes/}).click();
    await page.getByRole('link',{name:'Open Vassals workbench →'}).click(); await ready();
  });
  await page.setViewportSize({width:1280,height:800});
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
  await check('Real Pixi inspection, recursive word hit areas, Back and Close across three layouts', async () => {
    await page.setViewportSize({width:1280,height:800});
    await page.goto(`${url}#/dev/prototypes`);
    await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    await page.getByRole('link',{name:'Open Inspector workbench \u2192'}).click(); await ready();
    assert.equal(await page.locator('#inspection canvas').count(),1);
    assert.equal(await page.evaluate(()=>keywordWorkbench.state.renderer),'pixi');
    assert.equal(await page.locator('#rules,#glossary,#references').count(),0,'all visible inspection text is Pixi');
    assert.equal(await page.evaluate(()=>keywordWorkbench.flavour),'The dead keep no secrets from a patient scholar.','flavour remains plain italic text even when it contains a keyword');
    const chargeNames=await page.evaluate(()=>keywordWorkbench.symbols.map(symbol=>symbol.name));
    assert.deepEqual(chargeNames.slice(0,3),['Medicine','Record','Bone'],'Stock tags lead the right-hand symbol key');
    assert.ok(chargeNames.includes('Stock')&&chargeNames.includes('Record')&&chargeNames.includes('Charge')&&chargeNames.includes('Death'),'symbol key covers the selected Charge card');
    assert.equal(chargeNames.includes('Spring'),false,'unrepresented season symbols are omitted');
    await keywordTap('term:Record','glossary');await keywordTap('term:Stock');
    assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),['Record','Stock'],'short symbol names retain recursive reference links');
    await keywordTap('close');
    await page.screenshot({path:'artifacts/prototype-inspector-symbol-key-desktop.png'});
    await page.locator('#inspection canvas').focus();await page.keyboard.press('Tab');
    await page.getByRole('button',{name:'Explain Record',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>keywordWorkbench.state.path[0]==='Record');
    await page.getByRole('button',{name:'×',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>keywordWorkbench.state.path.length===0&&document.activeElement?.title==='Explain Record');
    for(const variant of ['A','B','C']) {
      assert.equal(await page.evaluate(()=>keywordWorkbench.state.variant),variant);
      await keywordTap('term:Stock','rules');
      for(const term of ['Stock traits','Bone','Charge','Activation','Stock'])await keywordTap('term:'+term);
      assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),['Stock','Stock traits','Bone','Charge','Activation','Stock']);
      await keywordTap('back');
      assert.equal(await page.evaluate(()=>keywordWorkbench.state.path.at(-1)),'Activation');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>keywordWorkbench.state.path.at(-1)),'Charge');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(()=>keywordWorkbench.state.referencePanels),1);
      assert.deepEqual(await page.evaluate(()=>keywordWorkbench.targets.filter(target=>target.group==='reference'&&!target.action.startsWith('term:')).map(target=>target.action)),['back','close'],'definition panel exposes only Back and Close');
      await page.screenshot({path:`artifacts/prototype-inspector-simple-${variant}-desktop.png`});
      for(const term of ['Bone','Stock traits','Stock']) {
        await keywordTap('back');assert.equal(await page.evaluate(()=>keywordWorkbench.state.path.at(-1)),term);
      }
      assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),['Stock']);
      await keywordTap('back');
      assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),[],'Back from the first definition closes it');
      await keywordTap('term:Stock','rules');await keywordTap('term:Stock traits');
      await keywordTap('close');
      assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),[],'Close clears the entire nested reading stack');
      await keywordTap('nextVariant','chrome');
    }
    assert.equal(new URL(page.url()).searchParams.get('variant'),'A');
    await keywordTap('nextVariant','chrome');await page.reload();await ready();
    assert.equal(await page.evaluate(()=>keywordWorkbench.state.variant),'B');
    assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),[]);
    await page.locator('#card').selectOption('logging');
    await page.waitForFunction(()=>keywordWorkbench.state.card==='logging');
    assert.equal(await page.evaluate(()=>keywordWorkbench.reading.effects.length),3);
    assert.deepEqual(await page.evaluate(()=>keywordWorkbench.reading.effects[0]),{timing:'Spring',text:'Produce 2 Stock'});
    const cycleNames=await page.evaluate(()=>keywordWorkbench.symbols.map(symbol=>symbol.name));
    assert.ok(cycleNames.includes('Cycle')&&cycleNames.includes('Spring')&&cycleNames.includes('Autumn'));
    assert.equal(cycleNames.includes('Charge')||cycleNames.includes('Record'),false,'changing cards replaces the symbol key');
    await keywordTap('quality','chrome');
    assert.equal(await page.evaluate(()=>keywordWorkbench.state.tier),'silver');
    await fullscreenRoundTrip('#inspection');
    await page.screenshot({path:'artifacts/prototype-keywords-pixi-cycle-desktop.png'});
    await page.locator('#inspection canvas').focus();await page.keyboard.press('Tab');
    const accessibleStock=page.getByRole('button',{name:'Explain Stock',exact:true}).first();
    await accessibleStock.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>keywordWorkbench.state.path[0]==='Stock');
    await page.getByRole('button',{name:'×',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>keywordWorkbench.state.path.length===0&&document.activeElement?.title==='Explain Stock');
    await noOverflow('Pixi accessibility layer');
  });
  await check('Touch Pixi word chains, Back and Close, card controls, glossary drag and fullscreen on phones', async () => {
    // The atlas-heavy workbenches create several software GL contexts. Use
    // a fresh browser for phone cases so old renderer caches do not turn an
    // unrelated workbench's boot into a timeout late in the suite.
    await browser.close();browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
    const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
    page=await mobile.newPage();page.on('pageerror',error=>errors.push(error.message));
    try {
      for(const variant of ['A','B','C']) {
        await page.goto(`${url}images/dark-fantasy/keyword-inspection-prototype/?variant=${variant}`);await ready();
        await page.locator('#inspection .dev-preview-fullscreen').tap();
        await page.waitForFunction(()=>keywordWorkbench.state.fullscreen&&!document.querySelector('.dev-preview-fullscreen').disabled);
        await keywordTap('term:Record','glossary',true);await keywordTap('term:Stock','reference',true);
        assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),['Record','Stock']);
        await keywordTap('close','reference',true);
        if(variant==='A')await page.screenshot({path:'artifacts/prototype-inspector-symbol-key-touch.png'});
        await keywordTap('term:Stock','rules',true);
        await keywordTap('term:Stock traits','reference',true);
        await keywordTap('term:Bone','reference',true);
        assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),['Stock','Stock traits','Bone']);
        await page.screenshot({path:`artifacts/prototype-keywords-pixi-${variant}-touch.png`});
        await keywordTap('back','reference',true);
        assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),['Stock','Stock traits']);
        await page.touchscreen.tap(4,4);
        await page.waitForFunction(()=>keywordWorkbench.state.path.length===0);
        await keywordTap('term:Stock','rules',true);
        await keywordTap('nextCard','chrome',true);
        assert.equal(await page.evaluate(()=>keywordWorkbench.state.card),'logging','card selector remains inside fullscreen');
        assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),[],'changing cards dismisses the reference');
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const positions=await page.evaluate(()=>keywordWorkbench.viewports.filter(viewport=>['rules','glossary'].includes(viewport.group)));
        assert.ok(positions[1].x>=positions[0].x+positions[0].width,'glossary stays right of rules');
        const glossary=positions.find(viewport=>viewport.group==='glossary');
        assert.ok(glossary.max>0,'right glossary has scrollable content');
        const start={x:glossary.x+glossary.width/2,y:glossary.y+glossary.height*.75};
        const touch=await page.context().newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
        for(let step=1;step<=6;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x,y:start.y-step*16}]});
        await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
        assert.ok(await page.evaluate(()=>keywordWorkbench.viewports.find(viewport=>viewport.group==='glossary').scroll)>0,'drag scrolls actual Pixi glossary');
        assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),[],'dragging over linked text does not navigate');
        await page.locator('#inspection .dev-preview-fullscreen').tap();
        await page.waitForFunction(()=>!keywordWorkbench.state.fullscreen);
        await noOverflow('Pixi keyword landscape');
      }
      await page.setViewportSize({width:390,height:844});await noOverflow('Pixi keyword portrait page');
    } finally {await mobile.close();}
  });
  await check('Touch portrait requests landscape and survives denied browser fullscreen', async () => {
    await browser.close();browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
    const mobile = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await mobile.addInitScript(() => {
      window.displayRequests = [];
      Element.prototype.requestFullscreen = () => { displayRequests.push('fullscreen'); return Promise.reject(new Error('Unsupported preview fullscreen')); };
      Object.defineProperty(screen.orientation, 'lock', {value:orientation => { displayRequests.push(orientation); return Promise.reject(new Error('Unsupported orientation lock')); }});
    });
    page = await mobile.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${url}images/dark-fantasy/card-chrome-prototype/`); await ready();
      await fullscreenRoundTrip('#screen-preview');
      assert.deepEqual(await page.evaluate(() => displayRequests), ['fullscreen','landscape']);
      await page.locator('#screen-preview .dev-preview-fullscreen').click();
      await page.waitForFunction(() => !document.querySelector('#screen-preview .dev-preview-fullscreen').disabled);
      assert.equal(await page.evaluate(() => {
        const preview = document.querySelector('#screen-preview'); return preview.clientWidth > preview.clientHeight;
      }), true, 'portrait fallback uses landscape logical coordinates');
      await page.screenshot({path:'artifacts/prototype-cards-touch-landscape-fallback.png'});
      await page.locator('#screen-preview .dev-preview-fullscreen').click();
      await page.goto(`${url}images/dark-fantasy/keyword-inspection-prototype/`);await ready();
      await page.evaluate(()=>{displayRequests.length=0;});
      await page.locator('#inspection .dev-preview-fullscreen').tap();
      await page.waitForFunction(()=>keywordWorkbench.state.fullscreen&&!document.querySelector('#inspection .dev-preview-fullscreen').disabled);
      assert.deepEqual(await page.evaluate(()=>displayRequests),['fullscreen','landscape']);
      assert.equal(await page.locator('#inspection').evaluate(node=>node.clientWidth>node.clientHeight),true,'keyword inspector uses the shared rotated landscape fallback');
      await keywordTap('term:Stock','rules',true);await keywordTap('term:Stock traits','reference',true);
      assert.deepEqual(await page.evaluate(()=>keywordWorkbench.state.path),['Stock','Stock traits'],'inverse CSS rotation maps real word taps correctly');
      await page.screenshot({path:'artifacts/prototype-keywords-pixi-rotated-fallback.png'});
      await keywordTap('close','reference',true);
      await page.locator('#inspection .dev-preview-fullscreen').tap();
      await page.waitForFunction(()=>!keywordWorkbench.state.fullscreen);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    } finally { await mobile.close(); }
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
else console.log(`[prototype-workbenches] OK: ${checks.length} checks; Pages subpath, desktop/mobile, Cards/Vassals/Structures/Inspector, exports. Details: ${artifact}`);
