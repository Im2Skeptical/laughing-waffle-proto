// Illustrated geographic divisions, baked into terrain rather than UI outlines.
// Even two regions of the same biome need a readable landform between them.
export function paintRegionDivisions({ map, pixel, width, height, detail, land, regionIds,
  waterIndices, waterBase, colours, groundBank, noise, mixColour }) {
  const clearance = { x: 0, y: 0, width, height, data: new Uint8Array(width * height) };
  const distance = new Float32Array(width * height).fill(Infinity);
  const regions = new Map(map.regions.map(r => [r.id, r]));
  const stats = { edges: 0, sameBiomeEdges: 0, dryPixels: 0, submergedPixels: 0, treatments: {} };
  for (const edge of map.edges) {
    if (edge.regions.length !== 2) continue;
    const pair = edge.regions.map(id => regions.get(id).biome);
    const type = pair.includes('mountains') ? 'escarpment' : pair.includes('swamp') ? 'peat-channel'
      : pair.includes('forest') ? 'woodland-bank' : pair.includes('islands') ? 'coastal-ridge' : 'grass-gully';
    stats.edges++; if (pair[0] === pair[1]) stats.sameBiomeEdges++;
    stats.treatments[type] = (stats.treatments[type] ?? 0) + 1;
    const points = edge.points.map(pixel), reach = 6 * detail;
    let along = 0;
    for (let n = 1; n < points.length; n++) {
      const a = points[n - 1], b = points[n], dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy); if (!length) continue;
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach)), maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + reach));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach)), maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + reach));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const i = y * width + x;
        if (regionIds[i] < 0) continue;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (length * length)));
        const qx = a.x + t * dx, qy = a.y + t * dy, d = Math.hypot(x - qx, y - qy);
        if (d > reach || d >= distance[i]) continue;
        distance[i] = d;
        const water = waterIndices[i], river = water >= 16 && water <= 23;
        if (river) continue; // Existing river banks already explain this edge.
        const signed = ((x - qx) * -dy + (y - qy) * dx) / length;
        const grain = noise(map.seed ^ 7431, x, y, 2 * detail);
        const strata = noise(map.seed ^ 2179, (along + t * length) / detail, 0, 11);
        const span = (2.2 + strata * 1.2) * detail;
        const core = (.45 + grain * .25 + strata * .25) * detail;
        if (d > span) continue;
        const region = map.regions[regionIds[i]], bank = groundBank[region.biome];
        if (!land[i]) {
          // Submerged shelves and broken reef crests divide adjoining island seas.
          const crest = d < core && grain > .35;
          colours[i] = mixColour(colours[i], crest ? 0xb1bd9f : signed > 0 ? 0x648987 : 0x244954,
            crest ? .72 : (1 - d / span) * .55);
          if (waterBase) waterBase[i] = mixColour(waterBase[i], signed > 0 ? 0x648987 : 0x244954, (1 - d / span) * .55);
          stats.submergedPixels++; continue;
        }
        let shade, amount;
        if (d < core) {
          shade = type === 'peat-channel' ? 0x4b4056 : type === 'woodland-bank' ? 0x343c2d
            : type === 'escarpment' ? 0x51413a : 0x5a5040;
          amount = .78;
        } else if (signed < 0) {
          // Light catches one raised lip; the opposite slope stays in shadow.
          shade = mixColour(bank[3], type === 'escarpment' ? 0xd2b397 : 0xc6b998, .12);
          amount = (1 - (d - core) / (span - core)) * .46;
        } else {
          shade = mixColour(bank[0], 0x383a2e, .35);
          amount = (1 - (d - core) / (span - core)) * .65;
        }
        if (grain > .66 && d > core) { shade = signed < 0 ? bank[3] : bank[0]; amount *= .8; }
        colours[i] = mixColour(colours[i], shade, amount);
        // Make a genuine terrain break through large relief paintings. A feathered
        // margin preserves roots, rocks and foliage instead of hard sprite cuts.
        clearance.data[i] = Math.max(clearance.data[i], Math.round(255 * Math.max(0, Math.min(1, (core + 1.1 * detail - d) / (1.1 * detail)))));
        stats.dryPixels++;
      }
      along += length;
    }
  }
  return { clearance, stats };
}
