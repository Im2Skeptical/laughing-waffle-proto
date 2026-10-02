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
  await check('Pages subpath, Prototypes route, three links and refresh', async () => {
    await page.goto(`${url}#/dev/prototypes`);
    await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    assert.equal(await page.locator('.lab-prototype-open').count(),3);
    assert.equal(await page.locator('nav [data-mode="prototypes"]').getAttribute('aria-current'),'page');
    await noOverflow('directory desktop');
    await page.screenshot({path:'artifacts/prototype-directory-desktop.png'});
    await page.reload(); await page.getByRole('heading',{name:'Prototype workbenches',exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844}); await noOverflow('directory portrait');
    await page.screenshot({path:'artifacts/prototype-directory-mobile.png'});
    await page.setViewportSize({width:1280,height:800});
    await page.getByRole('link',{name:'Open Cards workbench →'}).click(); await ready();
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
    await page.getByRole('link',{name:'Open Tooltips workbench →'}).click(); await ready();
  });
  await page.setViewportSize({width:1280,height:800});
  await check('Tooltip keywords, nested Back, Pin, Escape and keyboard focus', async () => {
    await page.locator('#local-tooltip .inspect-action').click();
    await page.locator('#inspection:not([hidden])').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => tooltipWorkbench.state.variant==='local' && document.activeElement.id==='source-card');
    await page.getByRole('button',{name:'Full inspection',exact:true}).click();
    await page.locator('#inspection:not([hidden])').waitFor();
    await page.locator('#inspection-rules [data-term="Timber"]').click();
    await page.locator('#keyword-panel h3').filter({hasText:'Timber'}).waitFor();
    await page.locator('#keyword-panel [data-term="Stock"]').click();
    await page.locator('#keyword-panel h3').filter({hasText:'Stock'}).waitFor();
    await page.getByRole('button',{name:'Pin',exact:true}).click();
    await page.waitForFunction(() => tooltipWorkbench.state.pinned && document.activeElement.dataset.keywordAction === 'pin');
    await page.getByRole('button',{name:'‹ Back',exact:true}).click();
    await page.waitForFunction(() => tooltipWorkbench.state.keyword === 'Timber' && document.activeElement.dataset.keywordAction === 'back');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !tooltipWorkbench.state.keyword && document.activeElement.dataset.term === 'Timber');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('#inspection')),true);
    await page.locator('#tier').selectOption('diamond');
    await page.waitForFunction(() => tooltipWorkbench.previewFace.tier === 'diamond');
    assert.equal(await page.evaluate(() => tooltipWorkbench.ownedFace.tier),'bronze');
    await page.keyboard.press('Escape'); await page.locator('#inspection').waitFor({state:'hidden'});
  });
  await check('Tooltip desktop and phone layouts, nested explanation and reset', async () => {
    for (const [width,height,preset] of [[1440,900,'fit'],[844,390,'phone'],[667,375,'small-phone'],[390,844,'portrait']]) {
      await page.setViewportSize({width,height}); await page.locator('#viewport').selectOption(preset);
      await page.getByRole('button',{name:'Full inspection',exact:true}).click();
      await page.locator('#inspection:not([hidden])').waitFor();
      await page.evaluate(() => tooltipWorkbench.openKeyword('Workers'));
      await page.locator('#keyword-panel:not([hidden])').waitFor();
      assert.ok(await page.locator('#keyword-panel').evaluate(n => n.clientHeight > 0 && n.clientWidth > 0),'visible keyword explanation');
      await noOverflow(`tooltips ${width}`);
      await page.screenshot({path:`artifacts/prototype-tooltips-${width}.png`});
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    }
    await page.locator('#piece-name').fill('Temporary rules'); await page.locator('#reset').click();
    await page.waitForFunction(() => tooltipWorkbench.state.name !== 'Temporary rules');
    await page.getByRole('link',{name:'Development Lab prototypes',exact:true}).click();
    await page.getByRole('link',{name:'Open Vassals workbench →'}).click(); await ready();
  });
  await page.setViewportSize({width:1280,height:800});
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
else console.log(`[prototype-workbenches] OK: ${checks.length} checks; Pages subpath, desktop/mobile, keywords, exports. Details: ${artifact}`);
