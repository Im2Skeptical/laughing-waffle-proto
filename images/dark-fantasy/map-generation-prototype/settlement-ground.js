import { decorationRandom } from '../../../src/model/regional-map/generator.js';
import { SHORE_TREATMENTS } from './terrain-interactions.js';

// Ground work, not a circular icon plate. Every mark is clipped against the
// canonical land/water field by the caller, and keyed to the site's identity.
export function settlementGround(site, biome, seed, scale, dry, roads, illustrated = false) {
  const g = new PIXI.Graphics(), bank = SHORE_TREATMENTS[biome];
  const random = n => decorationRandom(seed, (site.salt ?? Number(site.regionId.slice(1)) * 3571) + n * 7919);
  const colour = site.kind === 'monster' ? 0x494039 : bank.bank;
  const polygon = (points, fill, alpha) => {
    if (!points.every(([x, y]) => dry(x * scale, y * scale))) return;
    g.beginFill(fill, alpha).drawPolygon(points.flatMap(([x, y]) => [x * scale, y * scale])).endFill();
  };
  const line = (a, b, width, ink, alpha = 1) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
    for (let n = 0; n < steps; n++) {
      const x = (a[0] + (b[0] - a[0]) * n / steps) * scale, y = (a[1] + (b[1] - a[1]) * n / steps) * scale;
      if (dry(x, y)) g.beginFill(ink, alpha).drawRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, width * scale, 2 * scale).endFill();
    }
  };
  // Broken earthen apron extends into paths and patches instead of a hard oval.
  for (let n = 0; n < (illustrated ? 0 : 85); n++) {
    const x = (random(n * 3) - .5) * 165, y = (random(n * 3 + 1) - .5) * 95 + 8;
    if (Math.hypot(x / 85, y / 56) > 1) continue;
    const size = 4 + random(n * 3 + 2) * 11;
    polygon([[x, y], [x + size, y - 2], [x + size + 3, y + 4], [x + 1, y + 7]], colour, .08 + random(n + 510) * .12);
  }
  const exits = [[-65, 22], [52, 34], [12, -28]];
  // Real road endpoints feed the gate approach. All segments remain on dry land.
  const approach = roads.filter(p => Math.hypot(p[0], p[1]) > 45 * scale && Math.hypot(p[0], p[1]) < 150 * scale)
    .sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
  if (approach) exits[0] = approach.map(v => v / scale);
  for (const [n, end] of exits.entries()) {
    const mid = [end[0] * .5 + (n - 1) * 6, end[1] * .4 + 10];
    for (const [a, b] of [[[0, 8], mid], [mid, end]]) {
      line(a, b, 5, bank.bank, .5); line(a, b, 2, bank.road[1], .65);
      if (biome === 'swamp') for (let t = .1; t < 1; t += .16) {
        const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        line([x - 3, y], [x + 4, y + 1], 2, 0xaaa08a, .85);
      }
    }
  }
  for (let n = 0; n < (illustrated ? 0 : 13); n++) {
    const x = (random(800 + n * 2) - .5) * 175, y = 12 + random(801 + n * 2) * 38;
    const w = 8 + random(940 + n) * 18;
    if (site.kind === 'monster') {
      polygon([[x, y], [x + 6, y - 3], [x + 11, y + 2], [x + 5, y + 5]], 0x65564b, .8);
      line([x, y - 3], [x + 6, y - 3], 2, 0x968474, .7);
    } else if (biome === 'plains' || biome === 'islands') {
      polygon([[x, y], [x + w, y - 4], [x + w + 5, y + 7], [x + 3, y + 12]], n % 2 ? 0x8a8052 : 0xa79864, .55);
      for (let d = 1; d < 8; d += 3) line([x + 2, y + d], [x + w, y + d - 3], 1, bank.bank, .5);
    } else if (biome === 'mountains') {
      line([x, y + 3], [x + w, y - 3], 3, 0x68564b, .8);
      line([x, y + 1], [x + w, y - 5], 2, 0xc0a790, .75);
    } else if (biome === 'swamp') {
      polygon([[x, y], [x + w, y - 1], [x + w - 3, y + 4], [x + 4, y + 6]], 0x55475b, .65);
      line([x + 3, y + 1], [x + w - 4, y], 1, 0x96869a, .5);
    } else {
      line([x, y], [x + 10, y + 2], 3, 0x514c32, .8);
      line([x, y - 1], [x + 9, y + 1], 2, 0xa29362, .75);
    }
  }
  return g;
}
