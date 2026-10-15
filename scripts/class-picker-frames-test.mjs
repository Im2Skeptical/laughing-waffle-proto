import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_FILES, NINE_SLICE_FRAMES, SOCKET_FRAME, WINDOW_FRAME } from '../src/views/painted-frame-spec.js';
import { FOUNDER_CLASSES } from '../src/views/protovassal-class-data.js';

const atlas = JSON.parse(readFileSync('images/sprite-sheets/class-picker-frames.json', 'utf8'));
const layout = JSON.parse(readFileSync('images/dark-fantasy/class-picker-frames-v1/layout.json', 'utf8'));
const size = name => { const f = atlas.frames[`${name}.png`]; assert.ok(f, `${name} is packed in the atlas`); return [f.frame.w, f.frame.h]; };

for (const name of FRAME_FILES) size(name);
for (const frame of Object.values(NINE_SLICE_FRAMES)) {
  const [w, h] = size(frame.file);
  assert.deepEqual([w, h], frame.size, `${frame.file} stored size matches the spec`);
  const [l, t, r, b] = frame.insets;
  assert.ok(l + r < w && t + b < h, `${frame.file} slices leave a stretchable centre`);
}
assert.deepEqual(size(SOCKET_FRAME.file), SOCKET_FRAME.size);
for (const [name, value] of Object.entries(layout.stored)) assert.deepEqual(size(name), value, `${name} matches layout.json`);
const src = WINDOW_FRAME.source;
assert.ok(src.corner[0] * 2 < src.width && src.corner[1] * 2 < src.height, 'window corners do not overlap');
assert.ok(Math.abs(WINDOW_FRAME.unit - WINDOW_FRAME.scale * 2) < 1e-9, 'window store scale is half the source scale');
const [atlasW, atlasH] = [atlas.meta.size.w, atlas.meta.size.h];
assert.ok(atlasW <= 2048 && atlasH <= 2048, 'atlas stays within 2048 px');
for (const id of Object.keys(FOUNDER_CLASSES)) {
  assert.equal(typeof FOUNDER_CLASSES[id].frameTint, 'number', `${id} has a frame tint`);
}
console.log('class picker frames test passed');
