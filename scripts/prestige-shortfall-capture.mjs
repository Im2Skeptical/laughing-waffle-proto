// Throwaway linked-flash capture. Run npm start, then pass the reported origin.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.argv[2] ?? 'http://localhost:5190';
const folder = 'docs/prototypes/prestige-shortfall-feedback';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'no-preference' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const snapshot = () => page.evaluate(() => window.prestigePrototype.snapshot());
async function tapCanvas(x, y) {
  const canvas = page.locator('canvas'), box = await canvas.boundingBox();
  await canvas.tap({ position: { x: x * box.width / 2424, y: y * box.height / 1080 } });
}
function checkPair(state, visible) {
  if (state.bankFlash.visible !== visible || state.costFlash.visible !== visible || state.bankFlash.alpha !== state.costFlash.alpha) throw new Error('Bank and cost flashes diverged');
}
try {
  await page.goto(`${origin}/?prototype=prestige-shortfall&screen=shop`);
  await page.waitForFunction(() => !!window.prestigePrototype);
  checkPair(await snapshot(), false);
  await tapCanvas(320, 710);
  const rejected = await snapshot();
  checkPair(rejected, true);
  if (rejected.bank !== 18 || rejected.reserved !== 6) throw new Error('Refusal mutated bank/draft');
  await page.waitForFunction(() => { const s = window.prestigePrototype.snapshot(); return s.attempted && s.bankFlash.alpha < .9; });
  const pulsed = await snapshot();
  checkPair(pulsed, true);
  if (pulsed.bankFlash.alpha >= .99) throw new Error('Highlight did not animate');
  await tapCanvas(320, 710);
  await page.waitForTimeout(650);
  checkPair(await snapshot(), true);
  await page.waitForFunction(() => !window.prestigePrototype.snapshot().attempted);
  checkPair(await snapshot(), false);
  await page.getByLabel('Hold feedback').check();
  await tapCanvas(320, 710);
  await page.screenshot({ path: `${folder}/selected-feedback.png` });
  for (const screen of ['shop', 'life', 'routes', 'settlement', 'campaign']) {
    await page.getByRole('combobox', { name: 'Screen' }).selectOption(screen);
    await tapCanvas(320, 710);
    checkPair(await snapshot(), true);
    await page.getByRole('button', { name: 'Exact funds', exact: true }).click();
    await tapCanvas(1925, 886);
    const exact = await snapshot();
    checkPair(exact, false);
    if (exact.shortfall || exact.attempted) throw new Error(`${screen}: exact funds rejected`);
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByLabel('Still', { exact: true }).check();
  await tapCanvas(320, 710);
  checkPair(await snapshot(), true);
  await page.waitForTimeout(150);
  if ((await snapshot()).bankFlash.alpha !== 1) throw new Error('Reduced motion animated');
  if (errors.length) throw new Error(errors.join('; '));
  await writeFile('artifacts/prestige-probe.json', JSON.stringify({ result: 'PASS', checks: ['synchronized animated alpha', 'repeat click restarts both', 'both expire together', 'refusal preserves bank/draft', 'five screen fixtures', 'exact funds produce no flash', 'reduced motion is steady'], errors }, null, 2));
  console.log('PASS: linked flash, repeat, expiry, five screens, exact funds, reduced motion; selected-feedback.png');
} finally { await browser.close(); }
