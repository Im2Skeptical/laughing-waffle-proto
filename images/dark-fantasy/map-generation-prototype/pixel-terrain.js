// Disposable Atlas renderer: one world pixel lattice over the approved geography.
// Geography stays authoritative. No ticker, simulation events or mutable RNG.
import { decorationRandom, insidePolygon, canPlacePeak } from './generator.js';
import { createAtlasArt } from './atlas-art.js';

export const ATLAS_COLOURS = { plains: 0xbfa574, forest: 0x858158, islands: 0x688689, swamp: 0x858477, mountains: 0xb79780 };
const ATLAS_GROUND = {
  plains: [0xae9363, 0xb99f6e, 0xbfa574, 0xcbb486],
  forest: [0x74704c, 0x7c7851, 0x858158, 0x918b64],
  islands: [0x9eaa83, 0xabb48e, 0xb5bc99, 0xc1c5a6],
  swamp: [0x727467, 0x7c7d70, 0x858477, 0x939082],
  mountains: [0xa0836c, 0xae8d76, 0xb79780, 0xc3a18b],
  highlands: [0x25292e, 0x30353c, 0x3d434b, 0x4b5159],
  marsh: [0x202429, 0x2b2f36, 0x363b42, 0x454b51],
  scrub: [0x242728, 0x2f3435, 0x3c4142, 0x4a5051],
  badlands: [0x252527, 0x323235, 0x404044, 0x505054],
};
// Explicit water indices survive the static bake for the subsequent cycle study.
// Zero = dry. Ocean 1..8, river 16..23, foam 32..35 are separate ranges.
// Index 9 and Atlas depth shades 64..95 stay fixed during surface cycling.
const ATLAS_WATER = [0, 0x3c555c, 0x425c62, 0x496368, 0x526e72, 0x5a797b, 0x628182, 0x6b8989, 0x7a9691,
  0x263f4e, 0x2e4d5b, 0x365e69, 0x41747c, 0x53898c];
for (let i = 0; i < 8; i++) ATLAS_WATER[16 + i] = [0x586d71, 0x657e81, 0x7b9391, 0x9aaea2, 0xb9c5af, 0x9aaea2, 0x7b9391, 0x657e81][i];
for (let i = 0; i < 4; i++) ATLAS_WATER[32 + i] = [0x79938b, 0x8fa295, 0xa5b09f, 0x8fa295][i];
// Stationary depth shades use a separate bank from the cycling surface marks.
for (let i = 0; i < 32; i++) {
  const t = i / 31;
  ATLAS_WATER[64 + i] = (Math.round(55 + 38 * t) << 16) | (Math.round(76 + 39 * t) << 8) | Math.round(82 + 31 * t);
}

const ART = createAtlasArt();
let spriteArt = null;
export function pixelSpriteTextures() {
  if (spriteArt) return spriteArt;
  const entries = Object.entries(ART), cell = 64, canvas = document.createElement('canvas'); canvas.width = 16 * cell; canvas.height = Math.ceil(entries.length / 16) * cell;
  const ctx = canvas.getContext('2d');
  entries.forEach(([, art], i) => art.rows.forEach((row, y) => [...row].forEach((code, x) => {
    if (art.colours[code]) { ctx.fillStyle = art.colours[code]; ctx.fillRect(i % 16 * cell + 2 + x, Math.floor(i / 16) * cell + 2 + y, 1, 1); }
  })));
  const base = PIXI.Texture.from(canvas).baseTexture; base.scaleMode = PIXI.SCALE_MODES.NEAREST; base.mipmap = PIXI.MIPMAP_MODES.OFF;
  spriteArt = Object.fromEntries(entries.map(([kind, art], i) => [kind, new PIXI.Texture(base,
    new PIXI.Rectangle(i % 16 * cell + 2, Math.floor(i / 16) * cell + 2, Math.max(...art.rows.map(r => r.length)), art.rows.length))]));
  return spriteArt;
}

export function pixelSpriteFits(terrain, prop, flipX, flipY) {
  const art = ART[prop.kind], { texel, width, height } = terrain.stats;
  const px = (prop.point.x - terrain.bounds.minX) * 1576 / texel, py = (prop.point.y - terrain.bounds.minY) * 516 / texel;
  const sx = flipX ? -1 : 1, sy = flipY ? -1 : 1, w = Math.max(...art.rows.map(r => r.length));
  const left = Math.round(sx * px - w / 2), top = Math.round(sy * py - art.rows.length);
  return art.rows.every((row, y) => [...row].every((code, x) => {
    if (code === '.') return true;
    const ix = Math.floor(sx * (left + x + .5)), iy = Math.floor(sy * (top + y + .5));
    if (ix < 0 || iy < 0 || ix >= width || iy >= height || terrain.waterIndices[iy * width + ix]) return false;
    if (terrain.geography && prop.kind.includes('crag') && x % 2 === 0 && y % 2 === 0) {
      return canPlacePeak(terrain.geography, { x: terrain.bounds.minX + (ix + .5) * texel / 1576,
        y: terrain.bounds.minY + (iy + .5) * texel / 516 }, 1.5 * texel / 516);
    }
    return true;
  }));
}

function noise(seed, x, y, scale) {
  const ix = Math.floor(x / scale), iy = Math.floor(y / scale), fx = x / scale - ix, fy = y / scale - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const at = (a, b) => decorationRandom(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663));
  return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v;
}

export function bakePixelTerrain(map, { texel = 4, sampleBackground, sites = true }) {
  const started = performance.now(), bounds = map.surroundings.bounds;
  const groundBank = ATLAS_GROUND, waterBank = ATLAS_WATER;
  const width = Math.ceil((bounds.maxX - bounds.minX) * 1576 / texel), height = Math.ceil((bounds.maxY - bounds.minY) * 516 / texel);
  const size = width * height, regionIds = new Int16Array(size).fill(-1), islandLand = new Uint8Array(size);
  const land = new Uint8Array(size), waterIndices = new Uint8Array(size), colours = new Uint32Array(size);
  const pixel = p => ({ x: (p.x - bounds.minX) * 1576 / texel, y: (p.y - bounds.minY) * 516 / texel });
  const world = (x, y) => ({ x: bounds.minX + (x + .5) * texel / 1576, y: bounds.minY + (y + .5) * texel / 516 });
  const fill = (outline, array, value) => {
    const points = outline.map(pixel), lo = Math.max(0, Math.ceil(Math.min(...points.map(p => p.y)) - .5));
    const hi = Math.min(height - 1, Math.floor(Math.max(...points.map(p => p.y)) - .5));
    for (let y = lo; y <= hi; y++) {
      const crossings = [], scan = y + .5;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a.y > scan) !== (b.y > scan)) crossings.push(a.x + (scan - a.y) * (b.x - a.x) / (b.y - a.y));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const left = Math.max(0, Math.ceil(crossings[i] - .5)), right = Math.min(width, Math.ceil(crossings[i + 1] - .5));
        array.fill(value, y * width + left, y * width + right);
      }
    }
  };
  map.regions.forEach((r, i) => fill(r.outline, regionIds, i));
  for (const cluster of map.islandClusters) {
    fill(cluster.contours[0], islandLand, 1);
    for (const contour of cluster.contours.slice(1)) fill(contour, islandLand, insidePolygon(contour[0], cluster.contours[0]) ? 0 : 1);
  }
  const f = new Float32Array(4), p = { x: 0, y: 0 };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, region = map.regions[regionIds[i]];
    p.x = bounds.minX + (x + .5) * texel / 1576; p.y = bounds.minY + (y + .5) * texel / 516; sampleBackground(p, f);
    land[i] = region ? region.biome === 'islands' ? islandLand[i] : 1 : f[0] < .5 ? 1 : 0;
    if (!land[i]) continue;
    const material = region?.biome ?? (f[1] > .5 ? 'highlands' : f[2] > .3 ? 'marsh' : f[3] > .3 ? 'scrub' : 'badlands');
    const shade = region ? noise(map.seed, x, y, 60) * .55 + noise(map.seed ^ 7531, x, y, 16) * .45 : .2 + f[1] * .35 + f[2] * .2 + f[3] * .3;
    const bank = groundBank[material]; let tone = Math.min(3, Math.floor(shade * 4));
    const grain = decorationRandom(map.seed ^ 1731, Math.imul(x, 8363) ^ Math.imul(y, 36433));
    if (grain < .025) tone = Math.max(0, tone - 1); else if (grain > .98) tone = Math.min(3, tone + 1);
    colours[i] = bank[tone];
  }
  // Chamfer shore distances. Palette indices remain categorical.
  const seaDistance = new Uint8Array(size), dryDistance = new Uint8Array(size);
  const unit = 3, cap = 108;
  for (let i = 0; i < size; i++) { seaDistance[i] = land[i] ? 0 : cap; dryDistance[i] = land[i] ? cap : 0; }
  for (const d of [seaDistance, dryDistance]) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x; d[i] = Math.min(d[i], x ? d[i - 1] + unit : cap, y ? d[i - width] + unit : cap);
      if (y) d[i] = Math.min(d[i], x ? d[i - width - 1] + 4 : cap, x < width - 1 ? d[i - width + 1] + 4 : cap);
    }
    for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x; d[i] = Math.min(d[i], x < width - 1 ? d[i + 1] + unit : cap, y < height - 1 ? d[i + width] + unit : cap);
      if (y < height - 1) d[i] = Math.min(d[i], x ? d[i + width - 1] + 4 : cap, x < width - 1 ? d[i + width + 1] + 4 : cap);
    }
  }
  const waveX = Float32Array.from({ length: width }, (_, x) => Math.sin(x / 27) * 3);
  const waveXY = Float32Array.from({ length: width + height }, (_, i) => Math.sin(i / 61) * 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!land[i]) {
      const phase = ((x + (y >> 2)) % 8 + 8) % 8;
      const texture = noise(map.seed ^ 21913, x, y, 24), broad = noise(map.seed ^ 9071, x, y, 75);
      const depth = seaDistance[i] / 3 + (texture - .5) * 4;
      const swell = ((y + Math.round(waveX[x] * 2 + waveXY[x + y] * 2 + broad * 12)) % 19 + 19) % 19;
      // Broken surface highlights over depth washes, with no cartographic rings.
      const depthShade = .5 * Math.exp(-Math.max(0, depth) / 4) + .35 * broad + .1 * texture;
      waterIndices[i] = seaDistance[i] <= 3 && texture > .38 ? 32 + phase % 4
        : swell === 0 && texture > .7 && broad > .4 ? 1 + phase
          : 64 + Math.min(31, Math.floor(depthShade * 31));
    } else if (dryDistance[i] <= 2 * unit) {
      colours[i] = regionIds[i] < 0 ? dryDistance[i] <= unit ? 0x161b20 : 0x353c42
        : dryDistance[i] <= unit ? 0x594b36 : 0x9d8a65;
    }
  }
  const put = (x, y, colour, water = 0, onlyDry = false) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x; if (onlyDry && !land[i]) return;
    colours[i] = colour; if (water) waterIndices[i] = water;
  };
  const stroke = (points, radius, colour, water = 0) => {
    const pixels = points.map(pixel); let travelled = 0;
    for (let j = 1; j < pixels.length; j++) {
      const a = pixels[j - 1], b = pixels[j], length = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(length));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, cx = Math.floor(a.x + (b.x - a.x) * t), cy = Math.floor(a.y + (b.y - a.y) * t);
        const r = typeof radius === 'function' ? radius(travelled + length * t) : radius;
        const limit = Math.ceil(r), phase = Math.floor(travelled + length * t) % 8;
        for (let dy = -limit; dy <= limit; dy++) for (let dx = -limit; dx <= limit; dx++) {
          if (dx * dx + dy * dy > r * r + .3) continue;
          put(cx + dx, cy + dy, colour, water ? water + phase : 0, true);
        }
      }
      travelled += length;
    }
  };
  for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
    const i = y * width + x;
    if (!land[i] || regionIds[i] < 0 || dryDistance[i] > unit || (x + y * 3) % 11 !== 0) continue;
    const biome = map.regions[regionIds[i]].biome, salt = Math.imul(x, 8329) ^ Math.imul(y, 2311);
    const rocky = biome === 'mountains' || decorationRandom(map.seed, salt) < .27;
    const gx = dryDistance[i + 3] - dryDistance[i - 3], gy = dryDistance[i + width * 3] - dryDistance[i - width * 3];
    const length = Math.hypot(gx, gy); if (!length) continue;
    // Coast-normal bank strokes: longer cliff teeth on rocky shores, shorter
    // sandy marks elsewhere. These follow the actual land mask, not zone edges.
    for (let step = 1; step <= (rocky ? 5 : 2); step++) {
      const px = Math.round(x + gx / length * step), py = Math.round(y + gy / length * step), j = py * width + px;
      if (!land[j] || regionIds[j] < 0 || waterIndices[j]) continue;
      colours[j] = rocky ? step < 3 ? 0x76634a : groundBank[biome][0] : 0xaa946a;
    }
  }
  for (const feature of map.features.filter(f => f.type === 'valley')) stroke(feature.points, 4, 0xb5a17e);
  for (const corridor of map.geography.corridors.filter(c => c.type === 'mountain-valley' || c.type === 'water-gap')) {
    stroke(corridor.points, corridor.type === 'mountain-valley' ? 3 : 2, 0xb7a382);
  }
  for (const feature of map.features.filter(f => f.type === 'chasm')) {
    stroke(feature.points, 2.5, 0x8f7b5c); stroke(feature.points, 1.2, 0x403b31);
  }
  for (const coast of map.geography.coasts.filter(c => c.rocky)) stroke(coast.points, 1, 0x6c5e48);
  for (const river of map.features.filter(f => f.type === 'river')) {
    const widthAt = d => (.5 + Math.min(1.2, d / 28)) * 4 / texel;
    stroke(river.points, d => widthAt(d) + 1, 0x978466);
    stroke(river.points, widthAt, 0, 16);
    if (river.mouth?.treatment === 'estuary') {
      const end = river.points.at(-1), p = pixel(end);
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y < 10) put(Math.floor(p.x) + x, Math.floor(p.y) + y, 0, 16 + (x + y + 16) % 8, true);
    }
  }
  for (const creek of map.surroundings.continuations) stroke(creek.points, .5, 0, 16);

  const props = [], candidates = [];
  // Grid jitter uses map coordinates, not current zoom or camera position.
  const lo = pixel({ x: -1, y: -1 }), hi = pixel({ x: 2, y: 2 });
  const spacing = 10;
  for (let y = Math.ceil(lo.y / spacing) * spacing; y < hi.y; y += spacing) for (let x = Math.ceil(lo.x / spacing) * spacing; x < hi.x; x += spacing) {
    const salt = Math.imul(x, 14369) ^ Math.imul(y, 37813), qx = x + Math.floor(decorationRandom(map.seed, salt) * 8), qy = y + Math.floor(decorationRandom(map.seed, salt + 1) * 8);
    const i = qy * width + qx; if (!land[i] || waterIndices[i]) continue;
    const p = world(qx, qy), region = map.regions[regionIds[i]], n = noise(map.seed ^ 38571, qx, qy, 42), chance = decorationRandom(map.seed, salt + 2);
    let kind = null;
    const variant = Math.floor(decorationRandom(map.seed, salt + 3) * 12);
    if (region?.biome === 'forest') kind = n > .38 && chance < .88 ? `copse${variant % 8}` : null;
    else if (region?.biome === 'mountains') kind = null; // Composed along spines below.
    else if (region?.biome === 'swamp') kind = chance < .3 ? `deadwood${variant % 3}` : chance < .5 ? 'rushes' : null;
    else if (region?.biome === 'plains') kind = chance < .16 ? `hill${variant % 5}` : null;
    else if (region?.biome === 'islands') kind = chance < .28 ? `copse${variant % 8}` : null;
    else if (!region) { sampleBackground(p, f); kind = chance < .12 ? f[1] > .5 ? `crag${variant}` : f[2] > .3 || f[3] > .3 ? `deadwood${variant % 3}` : `hill${variant % 5}` : null; }
    if (kind?.startsWith('crag') && !canPlacePeak(map.geography, p, .07)) kind = null;
    if (kind && !region) kind = `ash-${kind}`;
    if (kind) candidates.push({ kind, point: p, salt, background: !region });
  }
  const spines = [];
  const mountainRegions = map.regions.filter(r => r.biome === 'mountains');
  for (const region of mountainRegions) {
    const centre = pixel(region.centre), points = region.outline.map(pixel);
    let xx = 0, xy = 0, yy = 0;
    for (const p of points) { const dx = p.x - centre.x, dy = p.y - centre.y; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
    const angle = .5 * Math.atan2(2 * xy, xx - yy), vx = Math.cos(angle), vy = Math.sin(angle);
    const projections = points.map(p => (p.x - centre.x) * vx + (p.y - centre.y) * vy);
    const start = Math.min(...projections) * .65, end = Math.max(...projections) * .65;
    const path = Array.from({ length: 17 }, (_, n) => {
      const t = n / 16, along = start + (end - start) * t;
      const bend = Math.sin(t * Math.PI * 2) * Math.min(9, (end - start) * .12);
      return world(centre.x + vx * along - vy * bend, centre.y + vy * along + vx * bend + 5);
    });
    spines.push({ points: path, salt: 7391 + spines.length * 853, biome: true });
    for (const neighbour of mountainRegions.filter(r => region.neighbours.includes(r.id) && r.id > region.id)) {
      const edge = map.edges.find(e => e.regions.includes(region.id) && e.regions.includes(neighbour.id));
      spines.push({ points: [region.centre, edge.points[Math.floor(edge.points.length / 2)], neighbour.centre], salt: 14531 + spines.length * 653, biome: true });
    }
  }
  for (const ridge of map.features.filter(f => f.type === 'ridge')) spines.unshift({ points: ridge.points, salt: 38741, biome: false });
  for (const spine of spines) {
    const points = spine.points.map(pixel); let travelled = 0, next = 0;
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], length = Math.hypot(b.x - a.x, b.y - a.y);
      while (next <= travelled + length) {
        const t = length ? (next - travelled) / length : 0, salt = spine.salt + Math.round(next) * 79;
        const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t + (decorationRandom(map.seed, salt) - .5) * 6;
        const p = world(Math.floor(px), Math.floor(py));
        if (canPlacePeak(map.geography, p, .045)) candidates.unshift({ kind: `crag${Math.floor(decorationRandom(map.seed, salt + 1) * 12)}`, point: p, salt, range: true, background: false });
        const foothill = world(Math.floor(px - 8), Math.floor(py + 10));
        candidates.push({ kind: `hill${Math.floor(decorationRandom(map.seed, salt + 2) * 5)}`, point: foothill, salt, background: false });
        next += 18 + decorationRandom(map.seed, salt + 3) * 7;
      }
      travelled += length;
    }
  }

  const fitsLand = prop => {
    const art = ART[prop.kind], p = pixel(prop.point), w = Math.max(...art.rows.map(r => r.length));
    const left = Math.round(p.x - w / 2), top = Math.round(p.y - art.rows.length);
    return art.rows.every((row, y) => [...row].every((code, x) => {
      if (code === '.') return true;
      const px = left + x, py = top + y, i = py * width + px;
      if (px < 0 || py < 0 || px >= width || py >= height || !land[i] || waterIndices[i]) return false;
      return !prop.kind.includes('crag') || x % 2 !== 0 || y % 2 !== 0 || canPlacePeak(map.geography, world(px, py), 1.5 * texel / 516);
    }));
  };
  const towns = sites ? map.regions.filter(r => r.biome !== 'islands').filter((r, i) => i === 2 || i === 7 || i === 12)
    .map((r, i) => ({ kind: `ruin${i % 3}`, point: r.centre, regionId: r.id })).filter(fitsLand) : [];
  if (towns.length) for (const town of towns.slice(0, 2)) {
    const r = map.regions.find(r => r.id === town.regionId), neighbour = map.regions.find(q => r.neighbours.includes(q.id) && q.biome !== 'islands');
    if (neighbour) { stroke([r.centre, neighbour.centre], 1, 0x817053); stroke([r.centre, neighbour.centre], .3, 0xc4b18a); }
  }
  for (const candidate of candidates) {
    if (candidate.kind.includes('crag') && !fitsLand(candidate)) {
      candidate.kind = `${candidate.background ? 'ash-' : ''}crag-small${Math.abs(candidate.salt) % 6}`;
    }
    if (!fitsLand(candidate)) continue;
    if (candidate.kind.includes('crag') && props.some(q => q.kind.includes('crag')
      && Math.hypot((q.point.x - candidate.point.x) * 1576 / texel, (q.point.y - candidate.point.y) * 516 / texel) < (candidate.range ? 13 : 24))) continue;
    if (towns.some(t => Math.hypot((t.point.x - candidate.point.x) * 1576 / texel, (t.point.y - candidate.point.y) * 516 / texel) < 16)) continue;
    props.push(candidate);
  }
  props.push(...towns);
  const extent = map.regions.flatMap(r => r.outline).map(pixel);
  const bx = Math.floor(Math.min(...extent.map(p => p.x))) - 2, by = Math.floor(Math.min(...extent.map(p => p.y))) - 2;
  const borderCanvas = document.createElement('canvas');
  borderCanvas.width = Math.ceil(Math.max(...extent.map(p => p.x))) - bx + 2;
  borderCanvas.height = Math.ceil(Math.max(...extent.map(p => p.y))) - by + 2;
  const borderCtx = borderCanvas.getContext('2d');
  for (const edge of map.edges) {
    borderCtx.fillStyle = '#534a37';
    borderCtx.globalAlpha = .64;
    const points = edge.points.map(pixel);
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s = 0; s <= steps; s++) {
        const x = Math.floor(a.x + (b.x - a.x) * s / steps), y = Math.floor(a.y + (b.y - a.y) * s / steps);
        // Gameplay divisions remain visible across water-rich Island regions.
        const wet = waterIndices[y * width + x] > 0;
        borderCtx.globalAlpha = wet ? .4 : .7;
        if ((!wet && edge.regions.length === 1) || (x + y) % 5 < 3) borderCtx.fillRect(x - bx, y - by, 1, 1);

      }
    }
  }
  const borderTexture = PIXI.Texture.from(borderCanvas); borderTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  borderTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  const borderBounds = { minX: bounds.minX + bx * texel / 1576, minY: bounds.minY + by * texel / 516 };
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(width, height);
  for (let i = 0; i < size; i++) {
    const c = waterIndices[i] ? waterBank[waterIndices[i]] : colours[i];
    image.data[i * 4] = c >> 16 & 255; image.data[i * 4 + 1] = c >> 8 & 255; image.data[i * 4 + 2] = c & 255; image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = PIXI.Texture.from(canvas); texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST; texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  const fog = document.createElement('canvas'); fog.width = Math.ceil(width / 4); fog.height = Math.ceil(height / 4);
  const fogCtx = fog.getContext('2d'), fogImage = fogCtx.createImageData(fog.width, fog.height);
  for (let y = 0; y < fog.height; y++) for (let x = 0; x < fog.width; x++) {
    const px = x * 4, py = y * 4, offset = (y * fog.width + x) * 4;
    // Clear a margin around playable polygons; fog never obscures region detail.
    let playable = false;
    for (let dy = -8; dy <= 8; dy += 4) for (let dx = -8; dx <= 8; dx += 4) {
      const sx = px + dx, sy = py + dy;
      if (sx >= 0 && sy >= 0 && sx < width && sy < height && regionIds[sy * width + sx] >= 0) playable = true;
    }
    const cloud = noise(map.seed ^ 3831, px, py, 100) * .7 + noise(map.seed ^ 8591, px, py, 38) * .3;
    fogImage.data[offset] = 151; fogImage.data[offset + 1] = 164; fogImage.data[offset + 2] = 169;
    fogImage.data[offset + 3] = playable ? 0 : Math.max(0, cloud - .3) * (land[Math.min(size - 1, py * width + px)] ? 110 : 25);
  }
  fogCtx.putImageData(fogImage, 0, 0); const fogTexture = PIXI.Texture.from(fog);
  fogTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR; fogTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;

  return { texture, borderTexture, borderBounds, fogTexture, props, bounds, waterIndices, geography: map.geography, stats: { style: 'F', texel, width, height, props: props.length, sites: towns.length,
    palette: 'Parchment ochre, olive woodland, grey peat and reddish umber relief; charcoal hinterland', glyphKinds: new Set(props.map(p => p.kind)).size,
    mountainSpines: spines.length, rangeMassifs: props.filter(p => p.range).length,
    fog: 'Separate static cloud overlay; toggle without rebaking', fogTextureMiB: +(Math.ceil(width / 4) * Math.ceil(height / 4) * 4 / 1048576).toFixed(1),
    textureMiB: +(size * 4 / 1048576).toFixed(1), waterIndexMiB: +(size / 1048576).toFixed(1), bakeMs: Math.round(performance.now() - started), animation: 'Still water; independent index ranges retained' } };
}
