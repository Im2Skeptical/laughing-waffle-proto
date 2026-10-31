// canPlacePeak's segment-block index must answer exactly like the original
// linear projectToPath scan, including points on and beside every path.
import assert from 'node:assert/strict';
import { getRegionalMap } from '../src/model/regional-map/definition.js';
import { canPlacePeak, projectToPath, decorationRandom } from '../src/model/regional-map/generator.js';

const ASPECT = 2.15;
const within = (p, b, r) => p.x >= b.minX - r / ASPECT && p.x <= b.maxX + r / ASPECT && p.y >= b.minY - r && p.y <= b.maxY + r;
const linear = (g, p, r) => !g.corridors.some(c => within(p, c.bounds, r) && projectToPath(p, c.points).distance < c.width + r)
  && !g.coasts.some(c => within(p, c.bounds, r) && projectToPath(p, c.points).distance < .015 + r);

let checked = 0, blocked = 0, linearMs = 0, indexedMs = 0;
for (const seed of [1, 42, 1867, 9001, 123456, 4294967295]) {
  const geography = getRegionalMap(`regional-v1:${seed}`).map.geography;
  const points = [];
  let n = 0;
  const rand = () => decorationRandom(seed, n++);
  for (let i = 0; i < 20000; i++) points.push({ x: -1.5 + 4 * rand(), y: -1.5 + 4 * rand() });
  // Dense samples around path vertices exercise the distance thresholds.
  for (const path of [...geography.corridors, ...geography.coasts]) for (const q of path.points)
    for (let k = 0; k < 3; k++) points.push({ x: q.x + (rand() - .5) * .08, y: q.y + (rand() - .5) * .08 });
  for (const radius of [0, 1.5 * 2 / 516, 1.5 * 4 / 516, .04]) {
    let t = performance.now();
    const expected = points.map(p => linear(geography, p, radius));
    linearMs += performance.now() - t; t = performance.now();
    const actual = points.map(p => canPlacePeak(geography, p, radius));
    indexedMs += performance.now() - t;
    for (let i = 0; i < points.length; i++) assert.equal(actual[i], expected[i], `seed ${seed} radius ${radius} point ${JSON.stringify(points[i])}`);
    checked += points.length; blocked += expected.filter(x => !x).length;
  }
}
assert.ok(blocked > 1000 && blocked < checked - 1000, 'samples cover both outcomes');
console.log(`peak-placement-index: ${checked} points identical (${blocked} blocked); linear ${linearMs.toFixed(0)} ms, indexed ${indexedMs.toFixed(0)} ms`);
