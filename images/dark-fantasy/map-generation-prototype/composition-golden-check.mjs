// Pins composeTerrainLandscape output on generated maps. The hashes were taken
// before the nearby() grid and baseKind memo (main 1e5a852), so they prove the
// index changed no placement, diagnostic or rejection count.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { composeTerrainLandscape, CONTACT_PAIRS } from './terrain-composition.js';
import { generateMap, decorationRandom } from '../../../src/model/regional-map/generator.js';

const art = {};
for (const family of ['plains', 'forest', 'islands', 'swamp', 'mountains'].map(b => `terrain-${b}`)
  .concat(['terrain-island-basalt', 'terrain-island-caldera', 'terrain-hellscape', 'terrain-bone-border'])
  .concat(['plains', 'forest', 'islands', 'swamp', 'mountains'].map(b => `terrain-monster-${b}`))
  .concat(CONTACT_PAIRS.map((_, n) => `contact-${n}`))) {
  for (let n = 0; n < (family.startsWith('contact') ? 5 : 12); n++) for (const suffix of ['', '-compact', '-small', '-ridge', '-micro']) {
    const width = 18 + n % 4 * 3 - suffix.length, height = 14 + n % 3 * 2 - (suffix.length >> 1);
    const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) =>
      ((x - width / 2) / (width / 2)) ** 2 + ((y - height / 2) / (height / 2)) ** 2 < .9 ? 'x' : '.').join(''));
    art[`${family}-${n}${suffix}`] = { rows };
    art[`${family}-${n}${suffix}-mirror`] = { rows: rows.map(row => [...row].reverse().join('')) };
  }
}
const expected = {
  '1867:1': '1c07981113d3080d',
  '1867:2': '71eb75fd33cd9e2d',
  '42:1': '41607b2357ba33d4',
  '42:2': '4e2d584615606e83',
  '9001:1': '6f0e7c1ca655215c',
  '9001:2': 'cb8d97524fea6bed',
};
const actual = {};
for (const seed of [1867, 42, 9001]) for (const detail of [1, 2]) {
  const map = generateMap({ seed, featureSet: seed % 4 });
  const sx = 788 * detail, sy = 258 * detail;
  const legal = p => decorationRandom(seed, Math.imul(p.left, 7919) ^ p.top) > .2;
  const result = composeTerrainLandscape({ map, art, pixel: p => ({ x: p.x * sx, y: p.y * sy }), world: (x, y) => ({ x: x / sx, y: y / sy }),
    legal, detail, settlementPlans: [], monsterZones: true });
  assert.ok(result.props.length > 50, `seed ${seed} detail ${detail} places props`);
  actual[`${seed}:${detail}`] = createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 16);
}
if (process.env.PRINT_GOLDEN) console.log(JSON.stringify(actual, null, 1));
else {
  assert.deepEqual(actual, expected, 'composition placements changed');
  console.log(`Composition golden: ${Object.keys(actual).length} seed/detail compositions identical.`);
}
