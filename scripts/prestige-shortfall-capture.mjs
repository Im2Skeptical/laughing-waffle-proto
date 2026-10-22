// Throwaway visual capture. Start npm start first, then pass its origin.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.argv[2] ?? 'http://localhost:5190';
const folder = 'docs/prototypes/prestige-shortfall-feedback';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
async function tapCanvas(x, y) {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  await canvas.tap({ position: { x: x * box.width / 2424, y: y * box.height / 1080 } });
}
try {
  for (const variant of ['A', 'B', 'C']) {
    await page.goto(`${origin}/?prototype=prestige-shortfall&variant=${variant}&screen=shop`);
    await page.waitForFunction(() => !!window.prestigePrototype);
    await page.getByLabel('Hold feedback').check();
    await tapCanvas(320, 710); // Real framed cost footer, including touch rejection.
    const state = await page.evaluate(() => window.prestigePrototype.snapshot());
    if (state.available !== 12 || state.shortfall !== 8 || !state.attempted || state.bank !== 18 || state.reserved !== 6) throw new Error(`${variant}: refused reserve mutated fixture or wrong deficit`);
    if (variant === 'C' && !state.receipt) throw new Error('C: receipt missing');
    await page.screenshot({ path: `${folder}/option-${variant.toLowerCase()}.png` });
    await page.getByRole('button', { name: 'Exact funds', exact: true }).click();
    await tapCanvas(1925, 886); // Real action control, at the equality boundary.
    const exact = await page.evaluate(() => window.prestigePrototype.snapshot());
    if (exact.shortfall !== 0 || exact.attempted || !exact.result.startsWith('Affordable')) throw new Error(`${variant}: exact funds rejected`);
    checks.push(`${variant}: rejected reserve preserves bank/draft; exact funds accepted`);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await tapCanvas(1300, 535);
    const undone = await page.evaluate(() => window.prestigePrototype.snapshot());
    if (undone.reserved !== 0 || undone.available !== 18 || undone.shortfall !== 2) throw new Error(`${variant}: undo did not refresh availability`);
    for (const screen of ['life', 'routes', 'settlement', 'campaign']) {
      await page.getByRole('combobox', { name: 'Screen' }).selectOption(screen);
      await tapCanvas(1925, 886);
      const result = await page.evaluate(() => window.prestigePrototype.snapshot());
      if (result.available !== 12 || result.shortfall !== 8 || !result.attempted || result.bank !== 12) throw new Error(`${variant}/${screen}: wrong spend feedback`);
    }
    checks.push(`${variant}: Life Map, route, settlement and campaign spend refusal`);
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByLabel('Hold feedback').uncheck();
  await page.getByRole('button', { name: 'Try action', exact: true }).click();
  await page.waitForFunction(() => !window.prestigePrototype.snapshot().attempted);
  checks.push('Feedback expiry; reduced-motion toggle; keyboard/URL variants');
  await page.getByLabel('Still', { exact: true }).check();
  await page.locator('canvas').click({ position: { x: 15, y: 15 } });
  await page.keyboard.press('ArrowRight');
  if (!page.url().includes('variant=A')) throw new Error('Keyboard cycle did not wrap C to A');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/prestige-desktop.png' });
  if (errors.length) throw new Error(errors.join('; '));
  await writeFile('artifacts/prestige-probe.json', JSON.stringify({ checks, errors, build: await (await page.request.get(`${origin}/build-info.json`)).json() }, null, 2));
  console.log(`PASS: ${checks.length} grouped checks; 3 PNGs in ${folder}; details artifacts/prestige-probe.json`);
} finally { await browser.close(); }
