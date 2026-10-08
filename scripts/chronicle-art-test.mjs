import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const nativeTimeout = globalThis.setTimeout;
const delays = [];
globalThis.setTimeout = (callback, ms) => { delays.push(ms); queueMicrotask(callback); };
let instance = 0;
async function fixture(load) {
  const calls = [];
  globalThis.PIXI = {
    SCALE_MODES: { NEAREST: 0 }, MIPMAP_MODES: { OFF: 0 },
    Assets: { setPreferences() {}, async load(url) { calls.push(url); return load(url); } },
  };
  const art = await import(`../src/views/chronicle-art.js?test=${++instance}`);
  const uploaded = [];
  const renderer = { prepare: { add(texture) { uploaded.push(texture); }, async upload() {} } };
  return { art, calls, renderer, uploaded };
}
const sheet = (url = '') => ({ textures: { [url.endsWith('resource-language.json') ? 'food.png' : url]:
  { baseTexture: { valid: true, width: 16, height: 16, realWidth: 16, realHeight: 16 } } } });
try {
  let blocked = true;
  const failed = await fixture(url => {
    if (blocked && url.endsWith('resource-language.json')) throw new Error('fixture download failure');
    return sheet(url);
  });
  await assert.rejects(failed.art.prepareChronicleArt(failed.renderer), /resource-language/, 'failed required sprites must block entry');
  assert.equal(failed.calls.filter(url => url.endsWith('resource-language.json')).length, 3, 'two automatic retries');
  assert.deepEqual(delays, [500, 1500]);
  assert.equal(failed.art.getResourceTexture('food'), null);
  const beforeRetry = failed.calls.length;
  blocked = false;
  await failed.art.prepareChronicleArt(failed.renderer);
  assert.ok(failed.art.getResourceTexture('food')?.baseTexture.valid, 'manual retry recovers');
  const successfulHudFiles = failed.calls.slice(beforeRetry).filter(url => !url.includes('settlement-pieces'));
  assert.deepEqual(successfulHudFiles, ['images/sprite-sheets/resource-language.json'], 'successful groups survive retry');
  const afterRetry = failed.calls.length;
  await failed.art.prepareChronicleArt(failed.renderer);
  assert.equal(failed.calls.length, afterRetry, 'successful renderer preparation is reused');

  let attempts = 0;
  const transient = await fixture(url => {
    if (url.endsWith('resource-language.json') && ++attempts < 3) throw new Error('temporary network failure');
    return sheet(url);
  });
  await transient.art.prepareChronicleArt(transient.renderer);
  assert.equal(attempts, 3);
  assert.equal(transient.uploaded.length, 11, 'every atlas, including heirlooms, reaches upload preparation');

  const invalid = await fixture(() => ({ textures: { 'food.png': { baseTexture: { valid: false } } } }));
  await assert.rejects(invalid.art.prepareChronicleArt(invalid.renderer), /invalid|decoded/i, 'invalid textures cannot pass readiness');

  let uploadFails = true;
  const gpu = await fixture(sheet);
  gpu.renderer.prepare.upload = async () => { if (uploadFails) throw new Error('fixture GPU upload failure'); };
  await assert.rejects(gpu.art.prepareChronicleArt(gpu.renderer), /upload/i);
  uploadFails = false;
  await gpu.art.prepareChronicleArt(gpu.renderer);
  assert.equal(gpu.calls.length, 11, 'upload retry keeps downloaded atlases');

  const scaled = await fixture(url => {
    const result = sheet(url);
    const base = Object.values(result.textures)[0].baseTexture;
    Object.assign(base, { width: 8000, height: 8000, realWidth: 2000, realHeight: 2000 });
    return result;
  });
  scaled.renderer.CONTEXT_UID = 1;
  scaled.renderer.gl = { MAX_TEXTURE_SIZE: 1, getParameter: () => 4096, isContextLost: () => false };
  scaled.renderer.prepare.upload = async () => {
    for (const texture of scaled.uploaded) texture.baseTexture._glTextures = { 1: {} };
  };
  await scaled.art.prepareChronicleArt(scaled.renderer);
  assert.equal(scaled.uploaded.length, 11, 'GPU limits use physical pixels, not scaled logical texture dimensions');
  await assert.rejects(scaled.art.prepareChronicleArt({ ...scaled.renderer,
    gl: { ...scaled.renderer.gl, getParameter: () => 1000 } }), /texture size limit/);
  await assert.rejects(scaled.art.prepareChronicleArt({ ...scaled.renderer, CONTEXT_UID: 2 }), /uploaded/,
    'an upload promise without GPU textures cannot pass readiness');
  console.log('[chronicle-art] PASS: bounded retries, blocked failures, manual recovery, texture validation and upload retry');
} catch (error) {
  mkdirSync('artifacts', { recursive: true });
  const artifact = 'artifacts/chronicle-art-test-failure.json';
  writeFileSync(artifact, JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
  console.error(`[chronicle-art] FAILED: ${error.message.split('\n')[0]}\nReproduce: node scripts/chronicle-art-test.mjs\nDetails: ${artifact}`);
  process.exitCode = 1;
} finally {
  globalThis.setTimeout = nativeTimeout;
}
