import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_FILES, PANEL_FRAMES, SOCKET_FRAME, WINDOW_FRAME } from '../src/views/painted-frame-spec.js';
import { FOUNDER_CLASSES } from '../src/views/protovassal-class-data.js';

const atlas = JSON.parse(readFileSync('images/sprite-sheets/class-picker-frames.json', 'utf8'));
const layout = JSON.parse(readFileSync('images/dark-fantasy/class-picker-frames-v1/layout.json', 'utf8'));
const size = name => { const f = atlas.frames[`${name}.png`]; assert.ok(f, `${name} is packed in the atlas`); return [f.frame.w, f.frame.h]; };

for (const name of FRAME_FILES) size(name);
for (const frame of Object.values(PANEL_FRAMES)) assert.ok(frame.unit > 0, 'panel scale is positive');
assert.deepEqual(size(SOCKET_FRAME.file), SOCKET_FRAME.size);
for (const [name, value] of Object.entries(layout.stored)) assert.deepEqual(size(name), value, `${name} matches layout.json`);
for (const name of Object.values(WINDOW_FRAME.pieces)) {
  const [w, h] = size(name);
  assert.ok(w >= WINDOW_FRAME.corner && h >= WINDOW_FRAME.corner, `${name} spans the fixed corner`);
}
const manifest = JSON.parse(readFileSync('images/asset-manifest.json', 'utf8'));
assert.deepEqual(Object.keys(atlas.frames).sort(), manifest.spriteSheets['class-picker-frames'].files.toSorted(), 'only registered named sprites are packed');
assert.match(atlas.meta.app, /codeandweb.com\/texturepacker/, 'runtime atlas is built by TexturePacker');
assert.equal(atlas.meta.image, 'class-picker-frames.png');
const png = readFileSync(`images/sprite-sheets/${atlas.meta.image}`);
assert.equal(png[25], 3, 'runtime sheet uses indexed PNG-8');
for (const [name, entry] of Object.entries(atlas.frames)) {
  assert.equal(entry.rotated, false, `${name} must not rotate tiled edges`);
  assert.equal(entry.trimmed, false, `${name} must preserve transparent slice geometry`);
  const { x, y, w, h } = entry.frame;
  assert.ok(x >= 2 && y >= 2 && x + w + 2 <= atlas.meta.size.w && y + h + 2 <= atlas.meta.size.h, `${name} has room for extruded padding`);
  const source = readFileSync(`images/dark-fantasy/class-picker-frames-v1/${name}`);
  assert.deepEqual([source.readUInt32BE(16), source.readUInt32BE(20)], [w, h], `${name} stays at its source pixel resolution`);
}
const [atlasW, atlasH] = [atlas.meta.size.w, atlas.meta.size.h];
assert.ok(atlasW <= 2048 && atlasH <= 2048, 'atlas stays within 2048 px');
for (const id of Object.keys(FOUNDER_CLASSES)) {
  assert.equal(typeof FOUNDER_CLASSES[id].frameTint, 'number', `${id} has a frame tint`);
}
const classAtlas = JSON.parse(readFileSync('images/sprite-sheets/vassal-class.json', 'utf8'));
assert.match(classAtlas.meta.app, /codeandweb.com\/texturepacker/);
assert.deepEqual(Object.keys(classAtlas.frames).sort(), manifest.spriteSheets['vassal-class'].files.toSorted(), 'all six approved class-art crops are named packed sprites');
assert.equal(readFileSync(`images/sprite-sheets/${classAtlas.meta.image}`)[25], 3, 'class art also uses PNG-8');
for (const [name, entry] of Object.entries(classAtlas.frames)) {
  assert.equal(entry.rotated, false);
  assert.equal(entry.trimmed, false);
  const source = readFileSync(`images/dark-fantasy/vassal-class-v1/${name}`);
  assert.deepEqual([entry.frame.w, entry.frame.h], [source.readUInt32BE(16), source.readUInt32BE(20)], `${name} preserves the approved crop dimensions`);
}
console.log('class picker frames test passed');
