import assert from 'node:assert/strict';
import { composeTerrainLandscape, illustrationOverlap, CONTACT_PAIRS } from './terrain-composition.js';
import { gradeTerrainColour } from './composable-art.js';

const art = {};
for (const family of ['plains', 'forest', 'islands', 'swamp', 'mountains'].map(b => `terrain-${b}`)
  .concat(CONTACT_PAIRS.map((_, n) => `contact-${n}`))) {
  for (let n = 0; n < (family.startsWith('contact') ? 5 : 12); n++) {
    const width = 18 + n % 4 * 3, height = 14 + n % 3 * 2;
    const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) =>
      ((x - width / 2) / (width / 2)) ** 2 + ((y - height / 2) / (height / 2)) ** 2 < .9 ? 'x' : '.').join(''));
    art[`${family}-${n}`] = { rows };
    art[`${family}-${n}-mirror`] = { rows: rows.map(row => [...row].reverse().join('')) };
  }
}
// Bounding boxes overlap, but their painted parts do not: this was not checked
// by the former semantic-port solver.
const disconnected = { a: { rows: ['xx......', 'xx......'] }, b: { rows: ['......xx', '......xx'] } };
assert.equal(illustrationOverlap({ kind: 'a', left: 0, top: 0 }, { kind: 'b', left: 0, top: 0 }, disconnected), 0);
assert.equal(illustrationOverlap({ kind: 'a', left: 0, top: 0 }, { kind: 'a', left: 0, top: 0 }, disconnected), 1);

for (const seed of [1867, 1869, 1873]) {
  const outline = [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 150 }, { x: 0, y: 150 }];
  const map = { seed, regions: [{ id: 1, biome: 'forest', centre: { x: 120, y: 75 }, outline }],
    edges: [], features: [{ type: 'ridge', points: [{ x: 20, y: 70 }, { x: 100, y: 60 }, { x: 220, y: 95 }] }], geography: { coasts: [] } };
  const legal = p => p.left > 0 && p.top > 0 && p.left + art[p.kind].rows[0].length < 240 && p.top + art[p.kind].rows.length < 150;
  const args = { map, art, pixel: p => p, world: (x, y) => ({ x, y }), legal, detail: 1 };
  const a = composeTerrainLandscape(args), b = composeTerrainLandscape(args);
  assert.deepEqual(a, b, 'World seed must reproduce the composition');
  assert.ok(a.props.length > 20 && a.diagnostics.joined > 0, 'Fixture must exercise interior growth and actual joins');
  for (let i = 0; i < a.props.length; i++) {
    assert.ok(legal(a.props[i]), 'Every footprint must satisfy the supplied geographic mask');
    for (const p of a.props.slice(0, i)) {
      assert.ok(illustrationOverlap(a.props[i], p, art) <= .58, 'No painting may bury most of another painting');
      if (p.kind.replace(/-mirror$/, '') === a.props[i].kind.replace(/-mirror$/, ''))
        assert.ok(Math.hypot(p.left - a.props[i].left, p.top - a.props[i].top) >= 58, 'Mirroring must not bypass repetition spacing');
    }
  }
}
const leaves = gradeTerrainColour(70, 86, 38, 'forest'), stone = gradeTerrainColour(137, 130, 122, 'forest');
const channels = c => [c >> 16, c >> 8 & 255, c & 255];
const [lr, lg, lb] = channels(leaves), [sr, sg, sb] = channels(stone);
assert.ok(lg > lr && lg > lb * 1.7, 'Leaf hue must survive grading');
assert.ok(Math.max(sr, sg, sb) - Math.min(sr, sg, sb) < 25, 'Stone must remain neutral inside a forest');
console.log('Terrain composition: real silhouette joins, legal footprints, nonrepeating neighbours, deterministic seeds and material colours pass.');
