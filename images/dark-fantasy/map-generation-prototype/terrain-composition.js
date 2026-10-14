import { decorationRandom, insidePolygon, polygonArea, isLand } from './generator.js';

export const CONTACT_PAIRS = [
  ['plains', 'forest'], ['plains', 'islands'], ['plains', 'swamp'], ['plains', 'mountains'], ['forest', 'islands'],
  ['forest', 'swamp'], ['forest', 'mountains'], ['islands', 'swamp'], ['islands', 'mountains'], ['swamp', 'mountains'],
];

const shapeCache = new WeakMap();
function shape(art) {
  if (shapeCache.has(art)) return shapeCache.get(art);
  const width = art.rows[0].length, height = art.rows.length;
  let area = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (solid(art, x, y)) area++;
  const result = { width, height, area }; shapeCache.set(art, result); return result;
}
const solid = (art, x, y) => x >= 0 && y >= 0 && y < art.rows.length && x < art.rows[y].length
  && art.rows[y][x] !== '.' && (!art.opacity || art.opacity[y][x] > .45);

// Actual painted-silhouette intersection, rather than matching invented ports.
// Bounds are in canonical texture pixels, independent of the camera.
export function illustrationOverlap(a, b, art) {
  const aa = art[a.kind], bb = art[b.kind], sa = shape(aa), sb = shape(bb);
  const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
  const right = Math.min(a.left + sa.width, b.left + sb.width), bottom = Math.min(a.top + sa.height, b.top + sb.height);
  if (right <= left || bottom <= top) return 0;
  let area = 0;
  for (let y = top; y < bottom; y += 2) for (let x = left; x < right; x += 2)
    if (solid(aa, x - a.left, y - a.top) && solid(bb, x - b.left, y - b.top)) area += 4;
  return Math.min(1, area / Math.max(1, Math.min(sa.area, sb.area)));
}

function field(seed, x, y, scale) {
  const ix = Math.floor(x / scale), iy = Math.floor(y / scale), fx = x / scale - ix, fy = y / scale - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const at = (a, b) => decorationRandom(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663));
  return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v)
    + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v;
}

const INTERIORS = {
  forest: [0, 2, 3, 4, 5, 7, 8, 9, 11], mountains: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  swamp: [0, 1, 2, 3, 6, 7, 8, 9, 10, 11], plains: [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  islands: [8, 9, 10, 11],
};
const COASTS = { forest: [5, 6, 7, 9, 10], mountains: [5, 6, 7, 8, 9, 11],
  swamp: [3, 5, 6, 8, 9, 10], plains: [3, 6, 9, 10, 11], islands: [0, 1, 2, 3, 4, 5, 10, 11] };

export function composeTerrainLandscape({ map, art, pixel, world, legal, detail }) {
  const props = [], diagnostics = { paths: 0, coastalProfiles: 0, placements: 0, joined: 0, breaks: 0, interiors: 0, families: {} };
  const regions = new Map(map.regions.map(r => [r.id, r]));
  const rand = salt => decorationRandom(map.seed ^ 48317, salt);
  const baseKind = kind => kind.replace(/-mirror$/, '').replace(/-small$/, '');
  const make = (kind, x, y, family, salt, allowedBiomes, context) => {
    const glyph = art[kind], s = shape(glyph), point = world(Math.round(x), Math.round(y + s.height * .5));
    const p = pixel(point), n = Number(baseKind(kind).split('-').at(-1));
    return { kind, point, salt, family, allowedBiomes, context, composed: true,
      left: Math.round(p.x - s.width / 2), top: Math.round(p.y - s.height),
      boundary: context !== 'interior', range: family === 'terrain-mountains',
      peak: family === 'terrain-mountains' && [0, 1, 2, 4, 10].includes(n)
        || family.startsWith('contact-') && CONTACT_PAIRS[Number(family.slice(8))].includes('mountains') && n !== 3 };
  };
  const nearby = prop => props.filter(p => Math.abs(p.left - prop.left) < 85 * detail && Math.abs(p.top - prop.top) < 65 * detail);
  const add = prop => {
    props.push(prop); diagnostics.families[prop.family] = (diagnostics.families[prop.family] ?? 0) + 1;
  };
  const choose = ({ x, y, family, indices, salt, allowedBiomes, context, previous = null }) => {
    const options = [];
    const candidates = indices.flatMap(n => [{ n, mirrored: false }, { n, mirrored: true }])
      .map((candidate, i) => ({ ...candidate, rank: rand(salt + i * 79) })).sort((a, b) => a.rank - b.rank);
    for (let attempt = 0; attempt < Math.min(context === 'interior' ? 8 : 12, candidates.length); attempt++) {
      const { n, mirrored } = candidates[attempt];
      const kind = `${family}-${n}${family === 'terrain-islands' && art[`${family}-${n}-small`] ? '-small' : ''}${mirrored ? '-mirror' : ''}`;
      // Some source fragments physically touch artwork in the next row. Those
      // cannot be extracted whole; never place a sliced illustration.
      if (!art[kind] || Object.keys(art[kind].cutRuns ?? {}).length) continue;
      const px = x + (rand(salt + attempt * 31 + 2) - .5) * 5 * detail;
      const py = y + (rand(salt + attempt * 31 + 3) - .5) * 6 * detail;
      const prop = make(kind, px, py, family, salt, allowedBiomes, context), near = nearby(prop);
      // Never repeat the same source painting beside itself, including mirrors.
      if (near.some(p => baseKind(p.kind) === baseKind(kind)
        && Math.hypot(p.left - prop.left, p.top - prop.top) < (family.startsWith('contact') ? 40 : 58) * detail)) continue;
      if (!legal(prop)) continue;
      let overlap = 0;
      for (const p of near) overlap = Math.max(overlap, illustrationOverlap(prop, p, art));
      if (overlap > .58) continue;
      const join = previous ? illustrationOverlap(prop, previous, art) : 0;
      if (previous && (join < (context === 'ridge' ? .12 : .06) || join > .46)) continue;
      const score = rand(salt + attempt * 31 + 4) * .3
        + (previous ? 1 - Math.abs(join - .22) * 3 : Math.min(.3, overlap)) - Math.max(0, overlap - .38);
      options.push({ prop, score, join });
    }
    options.sort((a, b) => b.score - a.score);
    return options[0]?.prop;
  };

  const paths = [];
  for (const [i, feature] of map.features.entries()) if (feature.type === 'ridge')
    paths.push({ points: feature.points.map(pixel), family: 'terrain-mountains', allowedBiomes: ['plains', 'forest', 'swamp', 'mountains'], indices: [0, 1, 2, 4, 5, 6, 8, 9], salt: 3001 + i * 991, context: 'ridge' });
  // Mountain biomes carry a connected major-axis spine, with low flanks below.
  for (const [i, region] of map.regions.entries()) if (region.biome === 'mountains') {
    const outline = region.outline.map(pixel), centre = pixel(region.centre);
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    const rx = (Math.max(...xs) - Math.min(...xs)) * .38, ry = (Math.max(...ys) - Math.min(...ys)) * .38;
    const horizontal = rx > ry;
    const points = Array.from({ length: 13 }, (_, n) => {
      const t = n / 12 * 2 - 1, bend = Math.sin(t * Math.PI * 1.4 + rand(i + 511) * 2) * .24;
      return { x: centre.x + (horizontal ? t * rx : bend * rx), y: centre.y + (horizontal ? bend * ry : t * ry) };
    });
    paths.push({ points, family: 'terrain-mountains', allowedBiomes: ['mountains'],
      indices: [0, 1, 2, 3, 4, 6, 10], salt: 130001 + i * 877, context: 'ridge' });
  }
  for (const [i, edge] of map.edges.entries()) {
    if (edge.regions.length !== 2) continue;
    const pair = edge.regions.map(id => regions.get(id).biome);
    if (pair[0] === pair[1]) continue;
    const contact = CONTACT_PAIRS.findIndex(p => p.includes(pair[0]) && p.includes(pair[1]));
    paths.push({ points: edge.points.map(pixel), family: `contact-${contact}`, indices: [0, 1, 2, 3, 4],
      allowedBiomes: pair, salt: 20003 + i * 919, context: 'boundary' });
  }
  for (const [i, coast] of map.geography.coasts.entries()) {
    const edge = map.edges.find(e => e.id === coast.edgeId);
    // Island coast contours are independent of graph edges and have no edgeId.
    // Find their owning region from the actual contour instead of skipping them.
    const region = edge ? regions.get(edge.regions[0]) : map.regions.find(r => r.biome === 'islands'
      && coast.points.some(p => insidePolygon(p, r.outline)));
    if (!region) continue;
    const centre = pixel(region.centre);
    // Island beaches/cliffs follow the actual distance-field profile. Keep the
    // shore profile, avoiding raised relief around every shore.
    if (region.biome === 'islands') { diagnostics.coastalProfiles++; continue; }
    paths.push({ points: coast.points.map((p, n) => {
      const q = pixel(p);
      if (!edge) {
        const a = pixel(coast.points[Math.max(0, n - 1)]), b = pixel(coast.points[Math.min(coast.points.length - 1, n + 1)]);
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        for (const sign of [1, -1]) {
          const point = { x: q.x - (b.y - a.y) / length * 13 * detail * sign,
            y: q.y + (b.x - a.x) / length * 13 * detail * sign };
          if (isLand(map, world(point.x, point.y))) return point;
        }
      }
      const length = Math.hypot(centre.x - q.x, centre.y - q.y) || 1;
      return { x: q.x + (centre.x - q.x) / length * 13 * detail, y: q.y + (centre.y - q.y) / length * 13 * detail };
    }), family: `terrain-${region.biome}`, indices: COASTS[region.biome], allowedBiomes: [region.biome],
    salt: 70001 + i * 827, context: 'coast' });
  }

  // Step by each accepted painting's footprint, vary the spacing, and require
  // real alpha overlap when extending a run. No equal slots or parallel rows.
  for (const path of paths) {
    diagnostics.paths++;
    let travelled = 0, next = rand(path.salt) * 12 * detail, previous = null, attempts = 0;
    for (let j = 1; j < path.points.length; j++) {
      const a = path.points[j - 1], b = path.points[j], length = Math.hypot(b.x - a.x, b.y - a.y);
      while (length && next <= travelled + length) {
        const t = (next - travelled) / length, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const salt = path.salt + (++attempts) * 719;
        let prop = choose({ ...path, x, y, salt, previous });
        // Search either side of the predicted join before declaring a gap.
        // This adapts to differently shaped paintings and curved boundaries.
        if (!prop && previous) for (const offset of [-5, 5, -9]) {
          prop = choose({ ...path, x: x + (b.x - a.x) / length * offset * detail,
            y: y + (b.y - a.y) / length * offset * detail, salt: salt + offset * 113, previous });
          if (prop) break;
        }
        if (!prop && previous) { diagnostics.breaks++; previous = null; }
        if (!prop) prop = choose({ ...path, x, y, salt });
        if (prop) {
          if (previous) diagnostics.joined++;
          add(prop); previous = prop;
          const s = shape(art[prop.kind]), projected = Math.abs((b.x - a.x) / length) * s.width + Math.abs((b.y - a.y) / length) * s.height;
          next += projected * (.40 + rand(salt + 5) * .16);
        } else next += (7 + rand(salt + 7) * 7) * detail;
      }
      travelled += length;
    }
  }

  // Correlated density fields form irregular masses and clearings in two
  // dimensions. Blue-noise-like candidate ordering avoids lines and stamp grids.
  for (const [index, region] of map.regions.entries()) {
    const outline = region.outline.map(pixel), family = `terrain-${region.biome}`;
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y), minX = Math.min(...xs), minY = Math.min(...ys);
    const width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
    const area = Math.abs(polygonArea(outline)), dense = region.biome === 'forest';
    const candidates = [], count = Math.min(650, Math.ceil(width * height / (30 * detail * detail)));
    for (let n = 0; n < count; n++) {
      const salt = 270001 + index * 91813 + n * 137, x = minX + rand(salt) * width, y = minY + rand(salt + 1) * height;
      if (!insidePolygon({ x, y }, outline)) continue;
      const density = field(map.seed ^ 7281, x, y, 43 * detail) * .65 + field(map.seed ^ 8167, x, y, 16 * detail) * .35;
      if (density < (dense ? .36 : .53)) continue;
      candidates.push({ x, y, density, salt });
    }
    candidates.sort((a, b) => b.density - a.density);
    let placed = 0, limit = Math.ceil(area / ((region.biome === 'islands' ? 1150 : region.biome === 'swamp' ? 1100 : dense ? 160 : 560) * detail * detail));
    for (const candidate of candidates) {
      if (placed >= limit || props.length >= 600) break;
      const prop = choose({ ...candidate, family, indices: region.biome === 'mountains' ? [7, 8, 9, 11] : INTERIORS[region.biome], allowedBiomes: [region.biome], context: 'interior' });
      if (!prop) continue;
      const near = nearby(prop), overlap = near.reduce((n, p) => Math.max(n, illustrationOverlap(prop, p, art)), 0);
      // Moderate-density fringe extends an existing mass; high-density cores
      // can start another patch, leaving coherent open ground between them.
      if (dense && candidate.density < .57 && overlap < .05 && rand(candidate.salt + 8) > .16) continue;
      add(prop); placed++; diagnostics.interiors++;
    }
  }
  diagnostics.placements = props.length;
  return { props, diagnostics };
}
