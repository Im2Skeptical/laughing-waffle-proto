import assert from 'node:assert/strict';

let stored = null, blocked = false;
globalThis.localStorage = {
  getItem() { if (blocked) throw Error('Storage blocked'); return stored; },
  setItem(key, value) { if (blocked) throw Error('Storage blocked'); stored = value; },
};
const load = suffix => import(`../src/views/graphics-options.js?${suffix}`);
const initial = await load('initial');
assert.deepEqual(initial.getGraphicsOptions(), initial.DEFAULT_GRAPHICS_OPTIONS);
const held = initial.getGraphicsOptions();
assert.equal(initial.setGraphicsOptions({ fog: true }), held, 'No-op keeps the animation cache valid');
initial.setGraphicsOptions({ fog: false, shadows: false, unknown: false });
assert.equal(initial.getGraphicsOptions().clouds, true, 'Unrelated options stay on');
assert.equal('unknown' in initial.getGraphicsOptions(), false);
const reloaded = await load('reload');
assert.equal(reloaded.getGraphicsOptions().fog, false, 'Choices survive page reloads');
stored = '{broken';
assert.deepEqual((await load('malformed')).getGraphicsOptions(), initial.DEFAULT_GRAPHICS_OPTIONS);
stored = JSON.stringify({ clouds: false, water: 'off', fog: null });
const partial = (await load('partial')).getGraphicsOptions();
assert.equal(partial.clouds, false);
assert.equal(partial.water, true, 'Only boolean preferences are accepted');
assert.equal(partial.fog, true);
blocked = true;
const unavailable = await load('blocked');
assert.deepEqual(unavailable.getGraphicsOptions(), initial.DEFAULT_GRAPHICS_OPTIONS);
assert.equal(unavailable.setGraphicsOptions({ water: false }).water, false, 'Blocked storage still permits session experiments');
assert.ok(Object.isFrozen(unavailable.getGraphicsOptions()));
console.log('[graphics-options] OK: default, partial, malformed and blocked storage; persistent independent toggles');
