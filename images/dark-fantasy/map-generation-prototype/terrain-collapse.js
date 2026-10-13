import { decorationRandom } from './generator.js';

// A simple tiled WFC model on a geographic path graph. Domains are already
// filtered by world masks. Ports describe continuing terrain versus open gaps.
// It does not infer pixel-perfect sockets from generated images.
export function collapseTerrainChain(initial, seed, salt = 0) {
  let observations = 0, backtracks = 0;
  const propagate = domains => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < domains.length; i++) {
        const next = domains[i].filter(tile => (!i || domains[i - 1].some(a => a.out === tile.in))
          && (i === domains.length - 1 || domains[i + 1].some(b => tile.out === b.in)));
        if (!next.length) return false;
        if (next.length !== domains[i].length) { domains[i] = next; changed = true; }
      }
    }
    return true;
  };
  const solve = domains => {
    if (observations > 1500 || !propagate(domains)) return null;
    let chosen = -1, entropy = Infinity;
    for (let i = 0; i < domains.length; i++) {
      if (domains[i].length < 2) continue;
      const total = domains[i].reduce((n, t) => n + t.weight, 0);
      const value = Math.log(total) - domains[i].reduce((n, t) => n + t.weight * Math.log(t.weight), 0) / total
        + decorationRandom(seed, salt + i * 37 + observations) * .0001;
      if (value < entropy) { entropy = value; chosen = i; }
    }
    if (chosen < 0) return domains.map(d => d[0]);
    observations++;
    // Weighted order without replacement, stable for a fixed world seed.
    const options = domains[chosen].map((tile, i) => ({ tile,
      rank: -Math.log(Math.max(.000001, decorationRandom(seed, salt + observations * 9173 + i * 619))) / tile.weight }))
      .sort((a, b) => a.rank - b.rank);
    for (const { tile } of options) {
      const next = domains.map(d => d.slice()); next[chosen] = [tile];
      const result = solve(next); if (result) return result;
      backtracks++;
    }
    return null;
  };
  const result = initial.length ? solve(initial.map(d => d.slice())) : [];
  return { tiles: result, observations, backtracks, contradiction: result === null };
}

export const CONTACT_PAIRS = [
  ['plains', 'forest'], ['plains', 'islands'], ['plains', 'swamp'], ['plains', 'mountains'], ['forest', 'islands'],
  ['forest', 'swamp'], ['forest', 'mountains'], ['islands', 'swamp'], ['islands', 'mountains'], ['swamp', 'mountains'],
];
const BIOME_ROLES = {
  plains: [0, 1, 2, 4, 0, 1, 3, 0, 1, 4, 0, 0],
  forest: [0, 0, 1, 1, 2, 4, 4, 1, 0, 1, 3, 0],
  islands: [4, 4, 1, 0, 3, 0, 1, 0, 0, 1, 3, 4],
  swamp: [0, 1, 2, 4, 0, 0, 0, 1, 0, 1, 3, 0],
  mountains: [0, 1, 2, 3, 4, 0, 1, 4, 0, 0, 0, 0],
};
export const contactFamily = (a, b) => {
  const index = CONTACT_PAIRS.findIndex(pair => pair.includes(a) && pair.includes(b));
  return index < 0 ? null : `contact-${index}`;
};

export function composeTerrainPaths({ map, art, pixel, world, legal, detail }) {
  const props = [], diagnostics = { chains: 0, placements: 0, gaps: 0, observations: 0, backtracks: 0, contradictions: 0, families: {} };
  const regionById = new Map(map.regions.map(r => [r.id, r]));
  const segments = map.edges.filter(e => e.regions.length === 2).map((edge, index) => {
    const [a, b] = edge.regions.map(id => regionById.get(id));
    return { points: edge.points, family: a.biome === b.biome ? `terrain-${a.biome}` : contactFamily(a.biome, b.biome), salt: index * 7381 };
  });
  // Coastal fragments sit just inland of the actual bank, leaving the water
  // mask and dynamic surf bands clear. Their material follows the owning cell.
  for (const [index, coast] of map.geography.coasts.entries()) {
    const edge = map.edges.find(e => e.id === coast.edgeId), region = regionById.get(edge?.regions[0]);
    if (!region) continue;
    const centre = pixel(region.centre);
    const points = coast.points.map(point => {
      const p = pixel(point), length = Math.hypot(centre.x - p.x, centre.y - p.y) || 1;
      return world(p.x + (centre.x - p.x) / length * 12 * detail, p.y + (centre.y - p.y) / length * 12 * detail);
    });
    segments.push({ points, family: `terrain-${region.biome}`, salt: 750001 + index * 1193, coast: true });
  }
  // Existing long geographic routes remain the primary explanation for edges.
  for (const [index, feature] of map.features.entries()) {
    if (!['ridge', 'river', 'valley'].includes(feature.type)) continue;
    const midpoint = feature.points[Math.floor(feature.points.length / 2)];
    const region = map.regions.reduce((best, r) => Math.hypot(r.centre.x - midpoint.x, r.centre.y - midpoint.y)
      < Math.hypot(best.centre.x - midpoint.x, best.centre.y - midpoint.y) ? r : best);
    segments.unshift({ points: feature.points, family: `terrain-${feature.type === 'ridge' ? 'mountains' : region.biome}`, salt: 90001 + index * 859, feature: true });
  }
  // Broad biome interiors are composed as connected belts along each cell's
  // long axis, linked to its boundary corridors, rather than a jittered scatter.
  for (const [index, region] of map.regions.entries()) {
    const centre = pixel(region.centre), outline = region.outline.map(pixel);
    let xx = 0, xy = 0, yy = 0;
    for (const p of outline) { const dx = p.x - centre.x, dy = p.y - centre.y; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
    const angle = .5 * Math.atan2(2 * xy, xx - yy), vx = Math.cos(angle), vy = Math.sin(angle);
    const projections = outline.map(p => (p.x - centre.x) * vx + (p.y - centre.y) * vy);
    const a = Math.min(...projections) * .6, b = Math.max(...projections) * .6;
    const belts = ['forest', 'mountains', 'swamp'].includes(region.biome) ? [0, -1, 1] : [0];
    for (const belt of belts) {
      const points = Array.from({ length: 17 }, (_, n) => {
        const t = n / 16, along = a + (b - a) * t,
          bend = Math.sin(t * Math.PI * 2 + belt * .7) * 7 * detail + belt * 22 * detail;
        return world(centre.x + vx * along - vy * bend, centre.y + vy * along + vx * bend);
      });
      segments.push({ points, family: `terrain-${region.biome}`, salt: 170003 + index * 631 + (belt + 1) * 100003, interior: true });
    }
  }
  for (const segment of segments) {
    if (!segment.family) continue;
    const contact = segment.family.startsWith('contact'), count = contact ? 5 : 12;
    const samples = []; let travelled = 0, next = 0;
    const stride = (contact ? 18 : 23) * detail;
    for (let j = 1; j < segment.points.length; j++) {
      const a = pixel(segment.points[j - 1]), b = pixel(segment.points[j]), length = Math.hypot(b.x - a.x, b.y - a.y);
      while (next <= travelled + length) {
        const t = length ? (next - travelled) / length : 0;
        samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); next += stride;
      }
      travelled += length;
    }
    if (samples.length < 2) continue;
    const domains = samples.map((sample, slot) => {
      const tiles = [{ kind: null, in: 0, out: 0, weight: .025 }];
      for (let n = 0; n < count; n++) {
        const kind = `${segment.family}-${n}`, glyph = art[kind];
        if (!glyph) continue;
        // Source relief stays upright: chain positions follow curves, not sprite rotation.
        const point = world(Math.round(sample.x), Math.round(sample.y + glyph.rows.length * .42));
        const prop = { kind, point, salt: segment.salt + slot * 337, composed: true,
          range: segment.family === 'terrain-mountains', boundary: !segment.feature && !segment.interior,
          peak: segment.family === 'terrain-mountains' && [0, 1, 2, 4, 10].includes(n)
            || contact && CONTACT_PAIRS[Number(segment.family.slice(8))].includes('mountains') && n !== 3 };
        // Occupied corridors constrain the domains before collapse. Removing
        // pieces afterwards would break the connections the solver established.
        if (!legal(prop) || props.some(p => Math.hypot(pixel(p.point).x - pixel(prop.point).x,
          pixel(p.point).y - pixel(prop.point).y) < 12 * detail)) continue;
        const role = contact ? n : BIOME_ROLES[segment.family.slice(8)][n];
        const input = role === 4 ? 1 : role === 3 ? 0 : 1;
        const output = role === 4 || role === 3 ? 0 : 1;
        tiles.push({ ...prop, in: input, out: output, weight: role < 2 ? 4 : role === 2 ? 1 : .5 });
        if (role === 4 && legal({ ...prop, kind: `${kind}-mirror` })) tiles.push({ ...prop, kind: `${kind}-mirror`, in: 0, out: 1, weight: .5 });
      }
      return tiles.filter(tile => (slot !== 0 || tile.in === 0) && (slot !== samples.length - 1 || tile.out === 0));
    });
    const result = collapseTerrainChain(domains, map.seed, segment.salt);
    diagnostics.chains++; diagnostics.observations += result.observations; diagnostics.backtracks += result.backtracks;
    if (result.contradiction) { diagnostics.contradictions++; continue; }
    for (const tile of result.tiles) {
      if (!tile.kind) { diagnostics.gaps++; continue; }
      props.push(tile); diagnostics.families[segment.family] = (diagnostics.families[segment.family] ?? 0) + 1;
    }
  }
  diagnostics.placements = props.length;
  return { props, diagnostics };
}
