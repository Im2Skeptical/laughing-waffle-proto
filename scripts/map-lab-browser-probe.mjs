import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 8081;
const URL = `http://127.0.0.1:${PORT}`;
const ARTIFACT_DIR = "artifacts";
const DETAIL_PATH = `${ARTIFACT_DIR}/map-lab-browser-probe.json`;
const SCREENSHOT_PATH = `${ARTIFACT_DIR}/map-lab-browser-probe-latest.png`;

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function clickConfirming(page, locator) {
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = locator.click();
  const dialog = await dialogPromise;
  await dialog.accept();
  await clickPromise;
}

async function openMapLab(page) {
  await page.getByRole("button", { name: /^Debug/ }).click();
  await page.getByTestId("debug-map-lab-tab").click();
  await page.getByTestId("map-lab").waitFor({ state: "visible" });
}

async function clickCanvasDesignPoint(page, point) {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box || !point) throw new Error("Canvas click point unavailable");
  await page.mouse.click(
    box.x + (point.x / 2424) * box.width,
    box.y + (point.y / 1080) * box.height
  );
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
const server = spawn(process.execPath, ["./node_modules/serve/bin/serve.js", "dist", "-l", String(PORT), "--no-clipboard"], {
  stdio: "ignore",
  windowsHide: true,
});

let browser;
let page;
const checks = [];
try {
  await waitForHttp(URL);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("mapLabProbeInitialized")) {
      localStorage.removeItem("civsurvivor.mapLabDraft.v1");
      sessionStorage.setItem("mapLabProbeInitialized", "1");
    }
  });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Debug" }).waitFor({ state: "visible" });
  await openMapLab(page);
  checks.push("access");

  await page.getByTestId("map-lab-controller").selectOption("player");
  await page.getByTestId("map-lab-colour").selectOption("red");
  await page.getByTestId("map-lab-capacity").fill("3");
  const addSelect = page.getByTestId("map-lab-add-practice");
  const addButton = page.getByTestId("map-lab-add-practice-button");
  await addSelect.selectOption("store"); await addButton.click();
  await addSelect.selectOption("cultivate"); await addButton.click();
  await addSelect.selectOption("store"); await addButton.click();
  assert.equal(await page.locator("[data-testid^=map-lab-installed-]").count(), 3);
  assert.equal(await addButton.isDisabled(), true);
  await page.locator('[data-testid="map-lab-installed-2"] button').first().click();
  await page.locator('[data-testid="map-lab-installed-1"] button:last-child').click();
  assert.equal(await page.locator("[data-testid^=map-lab-installed-]").count(), 2);
  checks.push("region-editing-and-capacity");

  const edgeCount = await page.locator(".map-lab-edge").count();
  await page.getByTestId("map-lab-connections").click();
  await page.getByTestId("map-lab-region-salt-coast").click();
  await page.getByTestId("map-lab-region-outer-isles").click();
  assert.equal(await page.locator(".map-lab-edge").count(), edgeCount - 1);
  await page.getByTestId("map-lab-region-river-crown").click();
  await page.getByTestId("map-lab-region-river-crown").click();
  assert.match(await page.getByTestId("map-lab-status").innerText(), /cannot connect to itself/);
  await page.getByTestId("map-lab-connections").click();
  await page.getByTestId("map-lab-connections").click();
  await page.getByTestId("map-lab-region-outer-isles").click();
  await page.getByTestId("map-lab-region-salt-coast").click();
  assert.equal(await page.locator(".map-lab-edge").count(), edgeCount);
  await page.getByTestId("map-lab-connections").click();
  checks.push("connection-toggling");

  await page.getByTestId("map-lab-score-exchange").click();
  assert.ok(await page.locator(".map-lab-score").count() > 0);
  assert.match(await page.locator(".map-lab-breakdown").innerText(), /Base score/);
  assert.match(await page.locator(".map-lab-diagnostics").innerText(), /Exchange/);
  checks.push("scores-and-diagnostics");

  await page.getByTestId("map-lab-json-toggle").click();
  const exported = await page.getByTestId("map-lab-json").inputValue();
  assert.equal(exported.includes("polygonVertexIds"), false);
  await page.getByTestId("map-lab-json").fill("{\"schemaVersion\":1}");
  await page.getByTestId("map-lab-import").click();
  assert.match(await page.getByTestId("map-lab-status").innerText(), /Import failed/);
  await page.getByTestId("map-lab-json").fill(exported);
  await page.getByTestId("map-lab-import").click();
  assert.match(await page.getByTestId("map-lab-status").innerText(), /Draft imported/);
  checks.push("import-export");

  await page.getByTestId("map-lab-colour").selectOption("blue");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Debug" }).waitFor({ state: "visible" });
  await openMapLab(page);
  assert.equal(await page.getByTestId("map-lab-colour").inputValue(), "blue");
  await clickConfirming(page, page.getByTestId("map-lab-reset"));
  assert.equal(await page.getByTestId("map-lab-colour").inputValue(), "green");
  checks.push("persistence-and-reset");

  await clickConfirming(page, page.getByTestId("map-lab-apply"));
  await page.getByRole("button", { name: "Debug" }).waitFor({ state: "visible" });
  const runtime = await page.evaluate(() => {
    const snapshot = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.();
    return {
      stateSec: snapshot?.runner?.stateSec,
      timelineSec: snapshot?.runner?.timeline?.cursorSec,
      map: snapshot?.worldMap,
    };
  });
  assert.equal(runtime.stateSec, 0);
  assert.equal(runtime.timelineSec, 0);
  assert.equal(runtime.map?.mode, "map");
  assert.equal(runtime.map?.visible, true);
  await openMapLab(page);
  await page.getByTestId("map-lab-colour").selectOption("red");
  await page.getByRole("button", { name: "Close" }).click();
  const cedarPoint = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__?.getWorldMapClickPoint?.("cedar-woods"));
  await clickCanvasDesignPoint(page, cedarPoint);
  const postEditMap = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap);
  assert.equal(postEditMap?.selectedRegion?.colour, "green");
  checks.push("fresh-run-normal-gameplay-and-draft-isolation");

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  writeFileSync(DETAIL_PATH, JSON.stringify({ status: "completed", checks, runtime }, null, 2));
  process.stdout.write(`[map-lab-browser-probe] OK (${checks.join(", ")})\n`);
} catch (error) {
  const detail = { status: "failed", checks, error: error?.stack ?? String(error) };
  writeFileSync(DETAIL_PATH, JSON.stringify(detail, null, 2));
  if (page) await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true }).catch(() => {});
  process.stderr.write(`[map-lab-browser-probe] FAILED: ${error.message}\nDetails: ${DETAIL_PATH}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
