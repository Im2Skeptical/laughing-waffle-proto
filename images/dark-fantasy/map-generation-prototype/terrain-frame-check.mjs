import assert from 'node:assert/strict';
import { findTerrainFrames, terrainFrameCutRuns } from './terrain-frames.js';

// An oversized first sprite crosses the nominal 40px grid line, as in the
// swamp sheet. The real transparent gutter starts at x=52.
const width = 120, height = 64, pixels = new Uint8ClampedArray(width * height * 4);
for (const [left, right] of [[8, 52], [62, 78], [91, 113]])
  for (let y = 10; y < 54; y++) for (let x = left; x < right; x++) pixels[(y * width + x) * 4 + 3] = 251;
const frames = findTerrainFrames(pixels, width, height, 3, 1);
for (const frame of frames) assert.deepEqual(terrainFrameCutRuns(pixels, width, frame), {}, 'Frame boundary must not slice solid artwork');
assert.ok(frames[0].right >= 52 && frames[1].left >= 52, 'Unequal sprite widths must use the actual gutter');
for (const x of [51, 62, 77, 91, 112]) assert.ok(frames.some(f => x >= f.left && x < f.right), 'All complete source silhouettes must remain in a frame');
console.log('Terrain frames: uneven source pieces remain whole and no crop edge crosses solid artwork.');
