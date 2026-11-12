import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../..');
export const CONTRACT_ID = 'HC-20261112-A0';
export const HARNESS_ID = 'perf-hillclimb-20261112-v1';
export const FROZEN_SEED = 424242;
export const FORECAST_WINDOW_SEC = 480;
export const FORECAST_HORIZON_CAP_SEC = 100000;
export const SCRUB_WARM_STEPS = 40;
export const NEW_GAME_TIMEOUT_MS = 900000;
export const PRACTICAL_EFFECT = {
  interactionMs: 10, interactionPct: 0.10,
  heavyMs: 100, heavyPct: 0.10,
};

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

export function pinnedDigest(hex) {
  return typeof hex === 'string' && /^[a-f0-9]{64}$/.test(hex);
}

export function collectHarnessFiles() {
  const dir = here;
  const names = readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort();
  const files = names.map((n) => {
    const p = path.join(dir, n);
    return { path: path.relative(REPO_ROOT, p), sha256: sha256File(p) };
  });
  return {
    files,
    harnessSourceSha256: sha256Text(files.map((f) => `${f.path}:${f.sha256}`).join('\n')),
  };
}

export function collectBuildAssets() {
  const dist = path.join(REPO_ROOT, 'dist');
  const assets = path.join(dist, 'assets');
  const out = { distExists: existsSync(dist), files: [] };
  if (!existsSync(assets)) return out;
  for (const n of readdirSync(assets).sort()) {
    if (!/\.(js|css)$/.test(n)) continue;
    const p = path.join(assets, n);
    out.files.push({ path: path.relative(REPO_ROOT, p), sha256: sha256File(p) });
  }
  out.buildAssetSha256 = sha256Text(out.files.map((f) => `${f.path}:${f.sha256}`).join('\n'));
  return out;
}

export function machineConfig({ cpuThrottle = 1, viewport = 'desktop' } = {}) {
  return {
    hostname: 'grok-bot-box',
    os: 'Linux (box), kernel 6.12, x86_64',
    cpu: 'Intel Xeon, 8 cores @ 2400 MHz (cloud VM)',
    ramGi: 15,
    node: process.version,
    renderer: 'headless Chromium, SwiftShader software GL — NOT Pixel 6 GPU truth',
    cpuThrottle,
    viewport,
    pixel6Note:
      'Pixel 6 / Android Chrome is the documented device floor. Box measurements at CDP CPU throttle 4x with a mobile viewport are a CPU-bound phone proxy only. There is no physical-device evidence in this run.',
  };
}

export function frozenFixtureId() {
  return sha256Text(`ordinary-new-game-seed-${FROZEN_SEED}|${CONTRACT_ID}`);
}

export function oracleSdkId() {
  // Identity of the official model modules used as the correctness oracle.
  const modules = [
    'src/model/new-game.js',
    'src/model/state.js',
    'src/model/projection-chunk.js',
    'src/model/timeline/index.js',
    'src/model/replay-second-runner.js',
  ].map((rel) => {
    const p = path.join(REPO_ROOT, rel);
    return existsSync(p) ? `${rel}:${sha256File(p)}` : `${rel}:missing`;
  });
  return sha256Text(modules.join('\n'));
}

export function population({ cpuThrottle, viewport, cold = true, artwork = 'minimal' }) {
  return {
    cpuThrottle,
    viewport,
    cold,
    artwork,
    machine: 'box-linux-xeon-8',
    renderer: 'swiftshader',
  };
}
