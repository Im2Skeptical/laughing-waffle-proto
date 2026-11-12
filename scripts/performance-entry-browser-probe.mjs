import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
import { PERFORMANCE_START_SEEDS } from '../src/controllers/performance-start-seeds.js';

// Run against npm start's regular address, never a preconfigured performance URL.
const url = new URL(process.argv[2] ?? 'http://localhost:5184/');
url.search = ''; url.hash = '';
const output = 'artifacts/performance-entry';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
let page;
const errors = [];
try {
  for (const [artwork,randomSeed] of [[false,false],[true,false],[false,true]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const fixtures=[];
    page.on('request',request=>{if(/performance-start-\d+\.json\.gz/.test(request.url()))fixtures.push(request.url());});
    await page.goto(url.href);
    await page.getByTestId('game-developer-tools').locator('summary').click();
    await page.getByTestId('game-progressive-artwork').setChecked(artwork);
    await page.getByTestId('game-performance-random-seed').setChecked(randomSeed);
    assert.match(await page.getByTestId('game-performance-seed-info').textContent(),randomSeed?/fresh opening forecast/:/precomputed opening forecast/);
    await page.waitForFunction(() => !document.querySelector('[data-testid="game-new-performance"]').disabled);
    // Emulate successful platform calls; actual device permission/rotation needs a phone.
    await page.evaluate(() => {
      globalThis.displayCalls = [];
      globalThis.entryDocumentMarker = true;
      document.documentElement.requestFullscreen = async () => { displayCalls.push('fullscreen'); };
      screen.orientation.lock = async value => { displayCalls.push(value); };
    });
    if(!randomSeed)await page.evaluate(()=>{
      globalThis.preparedSeedRoll=0;
      const native=crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues=array=>{
        if(array instanceof Uint32Array && array.length===1){array[0]=globalThis.preparedSeedRoll;return array;}
        return native(array);
      };
    });
    await page.getByTestId('game-new-performance').click();
    await page.waitForFunction(() => globalThis.displayCalls.includes('landscape'));
    assert.deepEqual(await page.evaluate(() => displayCalls), ['fullscreen', 'landscape']);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector('[data-testid="game-menu"]').hidden, {}, { timeout: 90000 });
    assert.equal(await page.evaluate(() => globalThis.entryDocumentMarker), true, 'one tap enters without reloading');
    assert.equal(new URL(page.url()).searchParams.get('art'), artwork ? '1' : '0');
    assert.equal(new URL(page.url()).searchParams.get('seed'),randomSeed?'random':'prepared');
    const seed=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed);
    if(randomSeed)assert.equal(fixtures.length,0,'random start cannot fetch the fixed-seed forecast');
    else {assert.equal(seed,123);assert.ok(fixtures.length>0,'fixed start loads the bake');}
    const terrain = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.illustratedTerrain);
    assert.equal(terrain.bakes, 0, 'terrain cannot block performance entry');
    const decisionTerrain=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.decisionMapTerrain);
    assert.equal(decisionTerrain.bakes,0,'the embedded decision map cannot bake terrain during performance entry');
    assert.equal(await page.getByTestId('performance-display').count(), 0, 'no extra display-entry button');
    assert.deepEqual(errors, []);
    if(!randomSeed && !artwork){
      for(let index=1;index<PERFORMANCE_START_SEEDS.length;index++){
        await page.getByTestId('game-menu-open').click();
        if(!await page.getByTestId('game-performance-random-seed').isVisible())await page.getByTestId('game-developer-tools').locator('summary').click();
        await page.evaluate(roll=>{globalThis.preparedSeedRoll=roll;},index);
        const before=fixtures.length;
        await page.getByTestId('game-new-performance').click();
        await page.waitForFunction(()=>document.querySelector('[data-testid="game-menu"]').hidden,{}, {timeout:90000});
        assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed),PERFORMANCE_START_SEEDS[index]);
        assert.equal(fixtures.length-before,1,'a new prepared game fetches one world, not the whole pool');
        assert.ok(fixtures.at(-1).includes(`performance-start-${PERFORMANCE_START_SEEDS[index]}.json.gz`));
      }
      const savedSeed=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed);
      await page.reload();
      await page.waitForFunction(()=>document.querySelector('[data-testid="game-menu"]')?.hidden,{}, {timeout:90000});
      assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed),savedSeed,'Continue retains the selected prepared world');
    }
    if(randomSeed){
      // Direct links resume the Dev save, independent of the next-start seed choice.
      await page.reload();
      await page.waitForFunction(() => document.querySelector('[data-testid="game-menu"]')?.hidden, {}, { timeout: 90000 });
      assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed),seed,'reload resumes the saved random world');
      assert.equal(fixtures.length,0,'random Continue also avoids the baked start');
      await page.getByTestId('game-menu-open').click();
      await page.getByTestId('game-developer-tools').locator('summary').click();
      assert.equal(await page.getByTestId('game-performance-random-seed').isChecked(),true);
      await page.getByTestId('game-new-performance').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="game-menu"]').hidden, {}, { timeout: 90000 });
      assert.notEqual(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed),seed,'each new random start uses fresh entropy');
      await page.getByTestId('game-menu-open').click();
      // The details retain their open state across entry.
      if(!await page.getByTestId('game-performance-random-seed').isVisible())await page.getByTestId('game-developer-tools').locator('summary').click();
      await page.getByTestId('game-performance-random-seed').uncheck();
      await page.getByTestId('game-new-performance').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="game-menu"]').hidden, {}, { timeout: 90000 });
      assert.ok(PERFORMANCE_START_SEEDS.includes(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed)),'switching back loads a prepared world');
      assert.ok(fixtures.length>0);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('[performance-entry] all five prepared seeds, one-file downloads, prepared/random Continue, fresh random seeds, pool switch-back, fullscreen/landscape and artwork on/off passed');
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  const loading=await page?.getByTestId('game-loading-details').textContent().catch(()=>null);
  writeFileSync(`${output}/failure.json`, JSON.stringify({ error: error.stack, errors,loading }, null, 2));
  console.error(`[performance-entry] ${error.message}; details=${output}/failure.json`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
