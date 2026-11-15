import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../..');
export const CONTRACT_ID = 'HC-20261116-A1';
export const HARNESS_ID = 'perf-phase-a-20261116-v1';
export const HARNESS_DIR_REL = 'scripts/perf-phase-a-20261116';
export const ARTIFACT_ROOT_REL = 'artifacts/perf-phase-a-20261116';
export const DOCS_RUNS_REL = 'docs/performance/phase-a-20261116/runs';
export const FROZEN_SEED = 424242;
// Opening loss for seed 424242 on origin/main 930801a5 (v1.1.69), derived on
// 2026-11-15 from the Node oracle (two horizon runs, both 6138) and matched by
// the build's own performance-start baker ("Seed 424242 ready: through 6138
// seconds"). v1.1.59 was 5064. A product change that moves it must fail closed.
export const EXPECTED_OPENING_LOSS_SEC = 6138;
// Ordinary New Game (no ?dev=1 / ?perf=1) renders full illustrated artwork.
// Graphics experiments (v1.1.63, localStorage 'full-map.dev.graphics') are
// pinned to the shipped defaults and read back on every browser row (F-7).
export const GRAPHICS_OPTIONS_KEY = 'full-map.dev.graphics';
export const PINNED_GRAPHICS = Object.freeze({ fog: true, clouds: true, shadows: true, wisps: true, water: true });
export const ARTWORK_MODE = 'illustrated-default-graphics';
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

export function packageVersion() {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
}

export function nodeBuildId() {
  return `node-model-v${packageVersion()}-${oracleSdkId().slice(0, 16)}`;
}

export function machineConfig({ cpuThrottle = 1, viewport = 'desktop' } = {}) {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: `${cpus[0]?.model ?? 'unknown'} x${cpus.length} @ ${cpus[0]?.speed ?? '?'} MHz`,
    ramGi: Math.round(os.totalmem() / 2 ** 30),
    loadavg1: os.loadavg()[0],
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

export function population({ cpuThrottle, viewport, cold = true, artwork = ARTWORK_MODE, start = 'ordinary-new-game' }) {
  return {
    cpuThrottle,
    viewport,
    cold,
    artwork,
    start,
    machine: 'box-linux-xeon-8',
    renderer: 'swiftshader',
  };
}
