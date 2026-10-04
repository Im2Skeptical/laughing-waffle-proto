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
async function ready() { await page.locator('body[data-ready="true"]').waitFor(); }
async function noOverflow(label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(n => {
    const r=n.getBoundingClientRect();return r.width && (r.right>innerWidth+1 || r.left < -1) && !n.closest('.stage-scroll');
  }).slice(0,8).map(n => ({tag:n.tagName,id:n.id,class:n.className,right:Math.round(n.getBoundingClientRect().right)})));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label}: horizontal overflow ${JSON.stringify(overflow)}`);
}
async function check(label, action) { await action(); checks.push(label); }
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
    assert.deepEqual(await page.locator('.lab-prototype-open').allTextContents(), ['Open Cards workbench →', 'Open Vassals workbench →', 'Open Structures workbench →', 'Open Keywords workbench →']);
    assert.equal((await fetch(`${url}images/dark-fantasy/tooltip-prototype/`)).status,404,'The retired tooltip page is absent from deployment');
    assert.equal(await page.locator('nav [data-mode="prototypes"]').getAttribute('aria-current'),'page');
    await noOverflow('directory desktop');
    await page.screenshot({path:'artifacts/prototype-directory-desktop.png'});
    await page.reload(); await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844}); await noOverflow('directory portrait');
    await page.screenshot({path:'artifacts/prototype-directory-mobile.png'});
    await page.setViewportSize({width:1280,height:800});
    await page.getByRole('link',{name:'Open Structures workbench →'}).click(); await ready();
    assert.equal(await page.locator('.practice-reference').count(),5);
    await page.getByRole('button',{name:'Inspect Granary',exact:true}).click();
    assert.equal(await page.locator('#inspection').evaluate(node=>node.open),true);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Next treatment'}).click();
    assert.equal(new URL(page.url()).searchParams.get('variant'),'B');
    await page.reload(); await ready();
    assert.equal(await page.evaluate(()=>structureWorkbench.state.variant),'B');
    await noOverflow('structures desktop');
    await page.setViewportSize({width:390,height:844}); await noOverflow('structures portrait');
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
  await check('Current Practice inspection with recursive keywords, Back, focus return and three layouts', async () => {
    await page.setViewportSize({width:1280,height:800});
    await page.getByRole('link',{name:'Open Keywords workbench →'}).click(); await ready();
    for (const variant of ['A','B','C']) {
      assert.equal(await page.evaluate(() => keywordWorkbench.state.variant),variant);
      const root=page.locator('#rules [data-term="Stock"]').first();
      await root.click();
      for (const term of ['Stock traits','Bone','Charge','Activation','Stock']) {
        await page.locator(`#references .active [data-term="${term}"]`).first().click();
      }
      assert.deepEqual(await page.evaluate(() => keywordWorkbench.state.path),['Stock','Stock traits','Bone','Charge','Activation','Stock']);
      await page.getByRole('button',{name:'Back through keywords'}).click();
      assert.equal(await page.evaluate(() => keywordWorkbench.state.path.at(-1)),'Activation');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => keywordWorkbench.state.path.at(-1)),'Charge');
      assert.equal(await page.locator('#references .reference').count(),variant==='C'?4:1);
      if(variant==='C')await page.locator('#references .history').first().getByRole('button',{name:'Return here'}).click();
      else await page.getByRole('navigation',{name:'Reading history'}).getByRole('button',{name:'Stock',exact:true}).click();
      assert.deepEqual(await page.evaluate(() => keywordWorkbench.state.path),['Stock'],'history jumps back without losing the initial source');
      await page.getByRole('button',{name:'Close keyword reference'}).click();
      assert.equal(await root.evaluate(node=>node===document.activeElement),true,'close restores initial keyword focus');
      await page.locator('#next').click();
    }
    assert.equal(new URL(page.url()).searchParams.get('variant'),'A');
    await page.locator('#next').click();await page.reload();await ready();
    assert.equal(await page.evaluate(() => keywordWorkbench.state.variant),'B','variant survives URL refresh');
    assert.deepEqual(await page.evaluate(() => keywordWorkbench.state.path),[],'reading history remains memory-only');
    await page.locator('#card').selectOption('logging');
    assert.equal(await page.locator('#rules .effect').count(),3);
    assert.match(await page.locator('#rules .effect').first().textContent(),/Spring.*Produce 2 Stock/);
    await page.locator('#tier').selectOption('gold');
    assert.equal(await page.evaluate(() => keywordWorkbench.state.tier),'gold');
    await page.screenshot({path:'artifacts/prototype-keywords-cycle-desktop.png'});
  });
  await check('Touch keyword chains, Pin, dismissal and right-hand glossary at phone sizes', async () => {
    const desktopPage=page;
    const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
    page=await mobile.newPage();page.on('pageerror',error=>errors.push(error.message));
    try {
      for(const variant of ['A','B','C']) {
        await page.goto(`${url}images/dark-fantasy/keyword-inspection-prototype/?variant=${variant}`);await ready();
        await page.locator('#rules [data-term="Stock"]').first().tap();
        await page.locator('#references .active [data-term="Stock traits"]').first().tap();
        await page.locator('#references .active [data-term="Bone"]').first().tap();
        assert.deepEqual(await page.evaluate(() => keywordWorkbench.state.path),['Stock','Stock traits','Bone']);
        await page.getByRole('button',{name:'Pin keyword reference'}).tap();
        await page.touchscreen.tap(4,4); // exposed page margin, outside every reference layout
        assert.equal(await page.evaluate(() => keywordWorkbench.state.pinned),true);
        await page.screenshot({path:`artifacts/prototype-keywords-${variant}-touch.png`});
        await page.getByRole('button',{name:'Pin keyword reference'}).tap();
        await page.touchscreen.tap(4,4);
        assert.deepEqual(await page.evaluate(() => keywordWorkbench.state.path),[]);
        await noOverflow(`keywords ${variant} landscape`);
      }
      for(const viewport of [{width:844,height:390},{width:390,height:844}]) {
        await page.setViewportSize(viewport);
        const positions=await page.evaluate(()=>({rules:document.querySelector('#rules').getBoundingClientRect().right,glossary:document.querySelector('#glossary').getBoundingClientRect().left}));
        assert.ok(positions.glossary>=positions.rules,'symbol glossary remains on the right');
        await noOverflow('keyword inspection phone');
      }
      await page.screenshot({path:'artifacts/prototype-keywords-portrait.png'});
    } finally {await mobile.close();page=desktopPage;}
  });
  await check('Touch portrait requests landscape and survives denied browser fullscreen', async () => {
    const desktopPage = page;
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
    } finally { await mobile.close(); page = desktopPage; }
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
else console.log(`[prototype-workbenches] OK: ${checks.length} checks; Pages subpath, desktop/mobile, Cards/Vassals/Structures/Keywords, exports. Details: ${artifact}`);
