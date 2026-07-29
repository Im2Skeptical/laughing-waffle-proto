import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 8081;
const URL = `http://127.0.0.1:${PORT}`;
const DETAIL_PATH = "artifacts/map-lab-browser-probe.json";
const SCREENSHOT_PATH = "artifacts/map-lab-browser-probe-latest.png";

async function waitForHttp() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${URL}`);
}

mkdirSync("artifacts", { recursive: true });
const server = spawn(process.execPath,
  ["./node_modules/serve/bin/serve.js", "dist", "-l", String(PORT), "--no-clipboard"],
  { stdio: "ignore", windowsHide: true });
let browser;
try {
  await waitForHttp();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("mapLabProbeInitialized")) {
      localStorage.removeItem("civsurvivor.mapLabDraft.v2");
      localStorage.removeItem("civsurvivor.mapLabScenarios.v2");
      sessionStorage.setItem("mapLabProbeInitialized", "1");
    }
  });
  await page.goto(URL);
  await page.getByRole("button", { name: /^Debug/ }).click();
  await page.getByTestId("debug-map-lab-tab").click();
  await page.getByTestId("map-lab").waitFor({ state: "visible" });

  assert.equal(await page.getByTestId("map-lab-region-cedar-woods").getAttribute("aria-label"),
    "Region01 region");
  await page.getByTestId("map-lab-region-cedar-woods").click();
  assert.equal(await page.getByTestId("map-lab-structure-capacity").inputValue(), "3");
  assert.equal(await page.getByTestId("map-lab-detailed-toggle").isChecked(), true);
  assert.equal(await page.getByTestId("map-lab-villager-adults").inputValue(), "30");
  assert.equal(await page.getByTestId("map-lab-villager-elder-ages").inputValue(), "50, 53, 56");
  assert.equal(await page.getByTestId("map-lab-stored-food").inputValue(), "60");
  assert.equal(await page.getByTestId("map-lab-practice-slot-0").inputValue(), "cultivate");
  assert.equal(await page.getByTestId("map-lab-structure-slot-0").inputValue(), "granary");
  assert.match(await page.getByTestId("map-lab-connection-west-levee").textContent(), /Connected/);

  const adultsField = page.getByTestId("map-lab-villager-adults");
  await adultsField.fill("31");
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  assert.equal(
    await page.evaluate(
      () => document.activeElement?.dataset?.testid ?? null
    ),
    "map-lab-villager-adults",
    "game refreshes preserve the focused Map Lab field"
  );
  assert.equal(
    await adultsField.inputValue(),
    "31",
    "an in-progress mobile field edit survives a game refresh"
  );
  await adultsField.press("Enter");
  assert.equal(
    await page.getByTestId("map-lab-villager-adults").inputValue(),
    "31"
  );
  await page.getByTestId("map-lab-connection-west-levee").click();
  assert.match(await page.getByTestId("map-lab-connection-west-levee").textContent(), /Add/);
  await page.getByTestId("map-lab-connection-west-levee").click();
  assert.match(await page.getByTestId("map-lab-connection-west-levee").textContent(), /Connected/);

  await page.getByTestId("map-lab-structure-capacity").fill("4");
  await page.getByTestId("map-lab-structure-capacity").press("Enter");
  await page.getByTestId("map-lab-structure-slot-3").selectOption("granary");
  assert.equal(await page.getByTestId("map-lab-structure-slot-3").inputValue(), "granary");

  await page.getByTestId("map-lab-colour").selectOption("blue");
  await page.getByTestId("map-lab-scenario-name").fill("Mobile browser test");
  await page.getByTestId("map-lab-save-scenario").click();
  assert.match(
    await page.getByTestId("map-lab-status").innerText(),
    /Saved browser scenario/
  );
  assert.equal(
    await page.getByTestId("map-lab-preset").inputValue(),
    "local:local-1"
  );
  await page.getByTestId("map-lab-colour").selectOption("black");
  await page.getByTestId("map-lab-save-scenario").click();
  assert.doesNotMatch(
    await page.getByTestId("map-lab-preset").locator("option:checked").innerText(),
    /\*$/
  );

  await page.getByTestId("map-lab-json-toggle").click();
  const json = JSON.parse(await page.getByTestId("map-lab-json").inputValue());
  assert.equal(json.schemaVersion, 2);
  assert.equal(json.regions[0].structureCapacity, 4);
  assert.equal("capacity" in json.regions[0], false);
  assert.equal("installedPracticeIds" in json.regions[0], false);

  await page.reload();
  await page.getByRole("button", { name: /^Debug/ }).click();
  await page.getByTestId("debug-map-lab-tab").click();
  await page.getByTestId("map-lab").waitFor({ state: "visible" });
  assert.equal(
    await page.getByTestId("map-lab-preset")
      .locator('option[value="local:local-1"]').count(),
    1,
    "saved scenarios survive reload"
  );
  await page.getByTestId("map-lab-preset").selectOption("local:local-1");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("map-lab-load-preset").click();
  assert.equal(await page.getByTestId("map-lab-colour").inputValue(), "black");
  await page.getByTestId("map-lab-preset").selectOption("local:local-1");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("map-lab-delete-scenario").click();
  assert.equal(
    await page.getByTestId("map-lab-preset")
      .locator('option[value="local:local-1"]').count(),
    0,
    "saved scenarios can be deleted"
  );

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  writeFileSync(DETAIL_PATH, JSON.stringify({
    checks: [
      "Map Lab schema v2",
      "detailed-settlement toggle and cohorts",
      "elder ages and local food",
      "five practice slots",
      "regional structure capacity and slots",
      "shared-edge connection editing",
      "mobile keyboard focus survives game refreshes",
      "named scenario save, overwrite, reload, load, and delete",
    ],
    editedRegion: json.regions[0],
  }, null, 2));
  process.stdout.write(`[probe:map-lab] OK\n[probe:map-lab] details=${DETAIL_PATH}\n`);
} catch (error) {
  writeFileSync(DETAIL_PATH, JSON.stringify({ error: error.stack ?? error.message }, null, 2));
  process.stdout.write(`[probe:map-lab] FAILED\n[probe:map-lab] error=${error.message}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
