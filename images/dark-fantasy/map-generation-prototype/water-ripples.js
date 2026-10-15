import { decorationRandom } from './generator.js';

// Sparse seeded ripple origins, snapped onto actual water during the bake.
// No rings centred on dry islands, and no per-frame emitter state to replay.
export function createInlandRipples({ width, height, texel, bounds, seed, isWater }) {
  const cell = 110, bins = new Map();
  const random = (gx, gy, salt) => decorationRandom(seed ^ salt, Math.imul(gx, 8363) ^ Math.imul(gy, 36433));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!isWater(y * width + x)) continue;
    const wx = (bounds.minX * 1576 + x * texel) / 2, wy = (bounds.minY * 516 + y * texel) / 2;
    const gx = Math.floor(wx / cell), gy = Math.floor(wy / cell), key = `${gx}:${gy}`;
    let source = bins.get(key);
    if (!source) {
      source = { tx: (gx + .2 + random(gx, gy, 3471) * .6) * cell,
        ty: (gy + .2 + random(gx, gy, 7381) * .6) * cell, score: Infinity,
        radius: 85 + random(gx, gy, 5279) * 25, wavelength: 18 + random(gx, gy, 9137) * 8,
        offset: random(gx, gy, 6191) };
      bins.set(key, source);
    }
    const score = (wx - source.tx) ** 2 + (wy - source.ty) ** 2;
    if (score < source.score) Object.assign(source, { x: wx, y: wy, score });
  }
  return { count: bins.size, sample(x, y) {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    let best = null, weight = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const source = bins.get(`${gx + dx}:${gy + dy}`); if (!source) continue;
      const distance = Math.hypot(x - source.x, (y - source.y) / .72);
      const fade = Math.max(0, 1 - distance / source.radius);
      // Hide the point of origin and the small concentric rings. Only broad,
      // softly emerging outer arcs remain; tiny pools can stay almost still.
      const emerge = Math.max(0,Math.min(1,(distance-22)/22));
      const envelope = fade * fade * (3 - 2 * fade) * emerge * emerge * (3-2*emerge);
      if (envelope > weight) {
        weight = envelope;
        // Negative distance + increasing temporal phase = outward travel.
        best = { phase: source.offset - distance / source.wavelength, weight };
      }
    }
    return best;
  } };
}
