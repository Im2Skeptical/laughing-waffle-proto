import assert from 'node:assert/strict';
import { requestGameDisplayMode } from '../src/views/game-display-mode.js';

const requests = [];
let coarse = true;
// A phone with a hover-capable accessory still has a coarse primary pointer.
globalThis.window = { matchMedia: query => ({ matches: query.includes('landscape') ||
  (query.includes('coarse') && coarse && !query.includes('hover')) }) };
globalThis.document = { fullscreenElement: null, documentElement: {
  requestFullscreen: async () => { requests.push('fullscreen'); },
} };
globalThis.screen = { orientation: { lock: async value => { requests.push(value); } } };
globalThis.requestAnimationFrame = callback => { callback(); };
await requestGameDisplayMode();
assert.deepEqual(requests, ['fullscreen', 'landscape'], 'touch entry requests fullscreen even with hover support');
requests.length = 0;
coarse = false;
await requestGameDisplayMode();
assert.deepEqual(requests, [], 'desktop mouse entry stays windowed');
await requestGameDisplayMode({ forceFullscreen: true });
assert.deepEqual(requests, ['fullscreen'], 'an explicit touch gesture can request fullscreen with a fine primary pointer');
console.log('[game-display-mode] OK');
