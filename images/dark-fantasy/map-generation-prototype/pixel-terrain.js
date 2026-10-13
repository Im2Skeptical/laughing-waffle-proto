// Disposable static art study: one world pixel lattice, three ground treatments.
// Geography stays authoritative. No ticker, simulation events or mutable RNG.
import { decorationRandom, insidePolygon, canPlacePeak } from './generator.js';
import { createAtlasArt } from './atlas-art.js';

export const PIXEL_STYLES = { D: 'Quiet ground', E: 'Textured ground', F: 'Dark fantasy atlas' };
export const PIXEL_COLOURS = { plains: 0xb5ad72, forest: 0x557451, islands: 0x54858a, swamp: 0x697761, mountains: 0x969585 };
export const ATLAS_COLOURS = { plains: 0xc3aa6d, forest: 0x617251, islands: 0x487e86, swamp: 0x766379, mountains: 0xa2a1ac };
const ATLAS_GROUND = {
  plains: [0xa78e56, 0xb69c61, 0xc3aa6d, 0xcfb981],
  forest: [0x465a41, 0x546648, 0x617251, 0x73815c],
  islands: [0x899e82, 0x9cac8c, 0xadb897, 0xbdc3a5],
  swamp: [0x584e60, 0x665a6c, 0x766379, 0x847187],
  mountains: [0x82818e, 0x91909d, 0xa2a1ac, 0xb4b2b8],
  highlands: [0x25292e, 0x30353c, 0x3d434b, 0x4b5159],
  marsh: [0x202429, 0x2b2f36, 0x363b42, 0x454b51],
  scrub: [0x242728, 0x2f3435, 0x3c4142, 0x4a5051],
  badlands: [0x252527, 0x323235, 0x404044, 0x505054],
};
const GROUND = {
  plains: [0x8d945f, 0xa7a46a, 0xb5ad72, 0xc4b980],
  forest: [0x3d624c, 0x4b6b4d, 0x557451, 0x68815a],
  islands: [0x859664, 0x96a16d, 0xa5ae79, 0xb8b780],
  swamp: [0x50665a, 0x61705d, 0x697761, 0x7d8468],
  mountains: [0x767d70, 0x888c7a, 0x969585, 0xaaa58e],
  highlands: [0x616b61, 0x737b6c, 0x818372, 0x90907a],
  marsh: [0x495d54, 0x53685b, 0x61705f, 0x717c65],
  scrub: [0x566650, 0x667557, 0x768261, 0x88916c],
  badlands: [0x777459, 0x868260, 0x93906b, 0xa29b75],
};
// Explicit water indices survive the static bake for the subsequent cycle study.
// Zero = dry. Ocean 1..8, river 16..23, foam 32..35 are separate ranges.
// Index 9 and Atlas depth shades 64..95 stay fixed during surface cycling.
const WATER = [0, 0x203e50, 0x244758, 0x2a5261, 0x325e6a, 0x3d6b75, 0x4b7b81, 0x588b8b, 0x659595];
WATER[9] = WATER[1];
for (let i = 0; i < 8; i++) WATER[16 + i] = [0x315969, 0x3a6773, 0x477981, 0x578c8e, 0x6b9b98, 0x578c8e, 0x477981, 0x3a6773][i];
for (let i = 0; i < 4; i++) WATER[32 + i] = [0x75a29b, 0x96b9aa, 0xb6cbb3, 0x96b9aa][i];
const ATLAS_WATER = [0, 0x294a58, 0x305764, 0x396370, 0x416e79, 0x497a82, 0x53848a, 0x608e92, 0x739d9d,
  0x263f4e, 0x2e4d5b, 0x365e69, 0x41747c, 0x53898c];
for (let i = 0; i < 8; i++) ATLAS_WATER[16 + i] = [0x586d71, 0x657e81, 0x7b9391, 0x9aaea2, 0xb9c5af, 0x9aaea2, 0x7b9391, 0x657e81][i];
for (let i = 0; i < 4; i++) ATLAS_WATER[32 + i] = [0x719b97, 0x8aaba0, 0xa8bdab, 0x8aaba0][i];
// Stationary depth shades use a separate bank from the cycling surface marks.
for (let i = 0; i < 32; i++) {
  const t = i / 31;
  ATLAS_WATER[64 + i] = (Math.round(38 + 45 * t) << 16) | (Math.round(63 + 74 * t) << 8) | Math.round(78 + 62 * t);
}

// Small original pixel matrices. Each character is one authored texel.
const ART = {
  pine: { colours: { a: '#244c3a', b: '#386344', c: '#69894d', d: '#5d5740', e: '#35523f' }, rows: [
    '.....a.....', '....aba....', '....aca....', '...abbba...', '..abbcbba..', '...abbba...',
    '..abbcbba..', '.abbbccbba.', '...abbba...', '..abbcbba..', '.abbbccbba.', 'abbbbccbbba',
    '....dd.....', '....dd.....', '...eeee....'] },
  oak: { colours: { a: '#284f3d', b: '#496d43', c: '#779453', d: '#5d5740', e: '#38513d' }, rows: [
    '.....aaa.......', '...aabbbaa.....', '..abccbbbba....', '.abcccbbbcba...', 'abbcbbbbccbba..',
    'abbbcccbbcbba..', 'abbccbbbbbbba..', '.abbbbccbbba...', '..abbbbbbaa....', '...aaaaaa......',
    '.....dd........', '.....dd........', '.....dd........', '...eeeee.......'] },
  peak: { colours: { a: '#46564f', b: '#6a766b', c: '#909888', d: '#b7b9a0', e: '#dedbc1', f: '#57665b' }, rows: [
    '............a............', '...........aea...........', '..........aeeda..........', '.........aeeecca.........',
    '........aeedccbaa........', '.......aeecdcbbbaa.......', '......adddccbbcbbaa......', '.....acddccbbaacbbaa.....',
    '....acddccbbacbccbbaa....', '...acddccbbaccbbcbbbaa...', '..acddccbbaccbbbcbcbbaa..', '.acddccbbacccbbbbcbcbbaa.',
    'acddcccbbaccbcbbbbcbbbaa.', 'acddccbbacccbbbbbcbbaa...', '.acccbbacccbbbbbbbbaa....', '..aaabbbbbaaaaaaaa......',
    '...fffffffffffff........'] },
  rock: { colours: { a: '#536257', b: '#8c9480', c: '#b0b199' }, rows: ['..aaa...', '.abcca..', 'abccbaa.', 'abbbaaa.', '.aaaa...'] },
  reeds: { colours: { a: '#425647', b: '#9ba477', c: '#536d61' }, rows: [
    '.b...b.', '.a..ba.', '.ab.aa.', '..a.a..', '..aaa..', '...a...', '.ccccc.', 'ccccccc'] },
  grass: { colours: { a: '#738453', b: '#c3bc82' }, rows: ['.a....b.', '.a..b.b.', '..a.bb..', '...a....'] },
  town: { colours: { a: '#343f39', b: '#815951', c: '#b38065', d: '#d6c6a0', e: '#a99974', f: '#50645b' }, rows: [
    '.....a........', '....aba.......', '...abbca......', '..abbbcca.....', '.abbbbccca....', 'aaaaaaaccca...',
    '.adddddaaaa...', '.addddeeda....', '.addaaeedda...', '.addaadeedda..', '.addaadeedda..', '.aaaaaaaaaa...',
    'ffffffffffff..'] },
};
Object.assign(ART, createAtlasArt());
let spriteArt = null;
export function pixelSpriteTextures() {
  if (spriteArt) return spriteArt;
  const entries = Object.entries(ART), canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.ceil(entries.length / 16) * 32;
  const ctx = canvas.getContext('2d');
  entries.forEach(([, art], i) => art.rows.forEach((row, y) => [...row].forEach((code, x) => {
    if (art.colours[code]) { ctx.fillStyle = art.colours[code]; ctx.fillRect(i % 16 * 32 + 2 + x, Math.floor(i / 16) * 32 + 2 + y, 1, 1); }
  })));
  const base = PIXI.Texture.from(canvas).baseTexture; base.scaleMode = PIXI.SCALE_MODES.NEAREST; base.mipmap = PIXI.MIPMAP_MODES.OFF;
  spriteArt = Object.fromEntries(entries.map(([kind, art], i) => [kind, new PIXI.Texture(base,
    new PIXI.Rectangle(i % 16 * 32 + 2, Math.floor(i / 16) * 32 + 2, Math.max(...art.rows.map(r => r.length)), art.rows.length))]));
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
    return ix >= 0 && iy >= 0 && ix < width && iy < height && !terrain.waterIndices[iy * width + ix];
  }));
}

function noise(seed, x, y, scale) {
  const ix = Math.floor(x / scale), iy = Math.floor(y / scale), fx = x / scale - ix, fy = y / scale - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const at = (a, b) => decorationRandom(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663));
  return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v;
}

export function bakePixelTerrain(map, { texel = 4, style = 'D', sampleBackground, sites = true }) {
  const started = performance.now(), bounds = map.surroundings.bounds, atlas = style === 'F';
  const groundBank = atlas ? ATLAS_GROUND : GROUND, waterBank = atlas ? ATLAS_WATER : WATER;
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
    const shade = region ? atlas ? noise(map.seed, x, y, 60) * .55 + noise(map.seed ^ 7531, x, y, 16) * .45
      : noise(map.seed, x, y, 28) * .65 + noise(map.seed ^ 7531, x, y, 10) * .35 : .2 + f[1] * .35 + f[2] * .2 + f[3] * .3;
    const bank = groundBank[material]; let tone = Math.min(3, Math.floor(shade * 4));
    if (atlas) {
      const grain = decorationRandom(map.seed ^ 1731, Math.imul(x, 8363) ^ Math.imul(y, 36433));
      if (grain < .025) tone = Math.max(0, tone - 1); else if (grain > .98) tone = Math.min(3, tone + 1);
    }
    colours[i] = bank[tone];
    if (style === 'E') {
      // Authored small tile marks, varied by a stable per-tile hash.
      const tileX = Math.floor(x / 12), tileY = Math.floor(y / 12), salt = Math.imul(tileX, 5483) ^ Math.imul(tileY, 23497);
      const variant = Math.floor(decorationRandom(map.seed, salt) * 4), tx = (x + variant * 3) % 12, ty = (y + variant * 2) % 12;
      if (material === 'mountains' || material === 'highlands' || material === 'badlands') {
        if ((ty === 3 && tx > 2 && tx < 6) || (ty === 4 && tx === 2)) colours[i] = bank[0];
        if (ty === 2 && tx > 3 && tx < 7) colours[i] = bank[3];
      } else if (material === 'swamp' || material === 'marsh') {
        if ((tx - 5) ** 2 / 12 + (ty - 7) ** 2 / 3 < 1 && variant !== 0) colours[i] = 0x425f5b;
        if (ty === 8 && tx > 3 && tx < 7 && variant !== 0) colours[i] = 0x789381;
      } else {
        if ((tx === 3 && ty === 7) || (tx === 5 && ty === 6) || (tx === 4 && ty === 8)) colours[i] = bank[0];
        if (tx === 8 && ty === 2 && variant !== 0) colours[i] = bank[3];
      }
    }
  }
  // Manhattan distances in D/E; chamfer distances in F. Indices remain categorical.
  const seaDistance = new Uint8Array(size), dryDistance = new Uint8Array(size);
  const unit = atlas ? 3 : 1, cap = atlas ? 108 : 8;
  for (let i = 0; i < size; i++) { seaDistance[i] = land[i] ? 0 : cap; dryDistance[i] = land[i] ? cap : 0; }
  for (const d of [seaDistance, dryDistance]) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x; d[i] = Math.min(d[i], x ? d[i - 1] + unit : cap, y ? d[i - width] + unit : cap);
      if (atlas && y) d[i] = Math.min(d[i], x ? d[i - width - 1] + 4 : cap, x < width - 1 ? d[i - width + 1] + 4 : cap);
    }
    for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x; d[i] = Math.min(d[i], x < width - 1 ? d[i + 1] + unit : cap, y < height - 1 ? d[i + width] + unit : cap);
      if (atlas && y < height - 1) d[i] = Math.min(d[i], x ? d[i + width - 1] + 4 : cap, x < width - 1 ? d[i + width + 1] + 4 : cap);
    }
  }
  const waveX = Float32Array.from({ length: width }, (_, x) => Math.sin(x / 27) * 3);
  const waveXY = Float32Array.from({ length: width + height }, (_, i) => Math.sin(i / 61) * 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!land[i]) {
      const phase = ((x + (y >> 2)) % 8 + 8) % 8;
      const ripple = y % 13 === Math.floor(x / 11) % 4 && x % 19 < 9;
      if (atlas) {
        const texture = noise(map.seed ^ 21913, x, y, 24), broad = noise(map.seed ^ 9071, x, y, 75);
        const depth = seaDistance[i] / 3 + (texture - .5) * 4;
        const swell = ((y + Math.round(waveX[x] * 2 + waveXY[x + y] * 2 + broad * 12)) % 19 + 19) % 19;
        // Broken surface highlights over depth washes, with no cartographic rings.
        const depthShade = .82 * Math.exp(-Math.max(0, depth) / 9) + .18 * broad;
        waterIndices[i] = seaDistance[i] <= 3 && texture > .38 ? 32 + phase % 4
          : swell === 0 && texture > .7 && broad > .4 ? 1 + phase
            : 64 + Math.min(31, Math.floor(depthShade * 31));
      } else waterIndices[i] = seaDistance[i] === 1 ? 32 + phase % 4 : seaDistance[i] < 4 ? 4 + phase % 4 : ripple ? 2 + phase % 3 : 9;
    } else if (dryDistance[i] <= 2 * unit) {
      colours[i] = atlas ? regionIds[i] < 0 ? dryDistance[i] <= unit ? 0x161b20 : 0x353c42
        : dryDistance[i] <= unit ? 0x65573f : 0x9d8a65 : dryDistance[i] === 1 ? 0xb8b080 : 0x989d6c;
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
  for (const feature of map.features.filter(f => f.type === 'valley')) stroke(feature.points, 4, atlas ? 0xb5a17e : 0x969c6d);
  for (const corridor of map.geography.corridors.filter(c => c.type === 'mountain-valley' || c.type === 'water-gap')) {
    stroke(corridor.points, corridor.type === 'mountain-valley' ? 3 : 2, atlas ? 0xb7a382 : 0x9a9c7c);
  }
  for (const feature of map.features.filter(f => f.type === 'chasm')) {
    stroke(feature.points, 2.5, atlas ? 0x8f7b5c : 0x6a6b58); stroke(feature.points, 1.2, atlas ? 0x403b31 : 0x303f3c);
  }
  for (const coast of map.geography.coasts.filter(c => c.rocky)) stroke(coast.points, 1, atlas ? 0x6c5e48 : 0x697666);
  for (const river of map.features.filter(f => f.type === 'river')) {
    const widthAt = d => (.5 + Math.min(1.2, d / 28)) * 4 / texel;
    stroke(river.points, d => widthAt(d) + 1, atlas ? 0x978466 : 0x919d78);
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
  const spacing = atlas ? 10 : 13;
  for (let y = Math.ceil(lo.y / spacing) * spacing; y < hi.y; y += spacing) for (let x = Math.ceil(lo.x / spacing) * spacing; x < hi.x; x += spacing) {
    const salt = Math.imul(x, 14369) ^ Math.imul(y, 37813), qx = x + Math.floor(decorationRandom(map.seed, salt) * 8), qy = y + Math.floor(decorationRandom(map.seed, salt + 1) * 8);
    const i = qy * width + qx; if (!land[i] || waterIndices[i]) continue;
    const p = world(qx, qy), region = map.regions[regionIds[i]], n = noise(map.seed ^ 38571, qx, qy, 42), chance = decorationRandom(map.seed, salt + 2);
    let kind = null;
    if (region?.biome === 'forest' && chance < .86 && n > .22) kind = chance < .6 ? 'pine' : 'oak';
    else if (region?.biome === 'mountains' && chance < .48 && canPlacePeak(map.geography, p, .08)) kind = 'peak';
    else if (region?.biome === 'swamp' && chance < .55) kind = 'reeds';
    else if (region?.biome === 'plains' && chance < .2) kind = 'grass';
    else if (region?.biome === 'islands' && chance < .38) kind = 'pine';
    else if (!region && chance < .18) {
      sampleBackground(p, f); kind = f[1] > .5 && chance < .07 ? 'peak' : f[2] > .3 ? 'reeds' : chance < .06 ? 'oak' : 'rock';
    }
    if (atlas) {
      const variant = Math.floor(decorationRandom(map.seed, salt + 3) * 12);
      if (region?.biome === 'forest') kind = n > .38 && chance < .88 ? `copse${variant % 8}` : null;
      else if (region?.biome === 'mountains') kind = chance < .42 && n > .3 && canPlacePeak(map.geography, p, .07) ? `crag${variant}` : null;
      else if (region?.biome === 'swamp') kind = chance < .3 ? `deadwood${variant % 3}` : chance < .5 ? 'rushes' : null;
      else if (region?.biome === 'plains') kind = chance < .16 ? `hill${variant % 5}` : null;
      else if (region?.biome === 'islands') kind = chance < .28 ? `copse${variant % 8}` : null;
      else if (!region) { sampleBackground(p, f); kind = chance < .24 ? f[1] > .5 ? `crag${variant}` : f[2] > .3 || f[3] > .3 ? `deadwood${variant % 3}` : `hill${variant % 5}` : null; }
      if (kind?.startsWith('crag') && !canPlacePeak(map.geography, p, .07)) kind = null;
      if (kind && !region) kind = `ash-${kind}`;
    }
    if (kind) candidates.push({ kind, point: p, salt, background: !region });
  }
  for (const ridge of map.features.filter(f => f.type === 'ridge')) {
    const points = ridge.points.map(pixel); let remaining = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      for (; remaining < length; remaining += 13 * 4 / texel) {
        const t = remaining / length, p = world(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + (b.y - a.y) * t));
        if (canPlacePeak(map.geography, p, .075)) {
          const candidate = { kind: atlas ? `crag${Math.floor(decorationRandom(map.seed, i * 831 + Math.round(remaining)) * 12)}` : 'peak', point: p, salt: i, background: false };
          if (atlas) candidates.unshift(candidate); else candidates.push(candidate);
        }
      }
      remaining -= length;
    }
  }
  const fitsLand = prop => {
    const art = ART[prop.kind], p = pixel(prop.point), w = Math.max(...art.rows.map(r => r.length));
    const left = Math.round(p.x - w / 2), top = Math.round(p.y - art.rows.length);
    return art.rows.every((row, y) => [...row].every((code, x) => {
      if (code === '.') return true;
      const px = left + x, py = top + y, i = py * width + px;
      return px >= 0 && py >= 0 && px < width && py < height && land[i] && !waterIndices[i];
    }));
  };
  const towns = sites ? map.regions.filter(r => r.biome !== 'islands').filter((r, i) => i === 2 || i === 7 || i === 12)
    .map((r, i) => ({ kind: atlas ? `ruin${i % 3}` : 'town', point: r.centre, regionId: r.id })).filter(fitsLand) : [];
  if (towns.length) for (const town of towns.slice(0, 2)) {
    const r = map.regions.find(r => r.id === town.regionId), neighbour = map.regions.find(q => r.neighbours.includes(q.id) && q.biome !== 'islands');
    if (neighbour) { stroke([r.centre, neighbour.centre], 1, atlas ? 0x817053 : 0x817a5c); stroke([r.centre, neighbour.centre], .3, atlas ? 0xc4b18a : 0xb5a681); }
  }
  for (const candidate of candidates) {
    if (!fitsLand(candidate)) continue;
    if (atlas && candidate.kind.includes('crag') && props.some(q => q.kind.includes('crag')
      && Math.hypot((q.point.x - candidate.point.x) * 1576 / texel, (q.point.y - candidate.point.y) * 516 / texel) < 17)) continue;
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
    const same = edge.regions.length === 2 && map.regions.find(r => r.id === edge.regions[0]).biome === map.regions.find(r => r.id === edge.regions[1]).biome;
    borderCtx.fillStyle = atlas ? '#242829' : edge.regions.length === 1 ? '#c0bc8a' : '#384d40';
    borderCtx.globalAlpha = atlas ? .8 : same ? .22 : edge.regions.length === 1 ? .55 : .4;
    const points = edge.points.map(pixel);
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s = 0; s <= steps; s++) {
        const x = Math.floor(a.x + (b.x - a.x) * s / steps), y = Math.floor(a.y + (b.y - a.y) * s / steps);
        if (atlas) {
          // Gameplay divisions remain visible across water-rich Island regions.
          borderCtx.fillRect(x - bx, y - by, 1, 1);
          borderCtx.fillStyle = edge.regions.length === 1 ? '#d3bc81' : '#c5b28a';
          borderCtx.globalAlpha = edge.regions.length === 1 ? .7 : .48;
          borderCtx.fillRect(x - bx + 1, y - by + 1, 1, 1);
          borderCtx.fillStyle = '#242829'; borderCtx.globalAlpha = .8;
        } else if ((!same || (x + y) % 4 < 2) && land[y * width + x] && !waterIndices[y * width + x]) borderCtx.fillRect(x - bx, y - by, 1, 1);
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
  let fogTexture = null;
  if (atlas) {
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
    fogCtx.putImageData(fogImage, 0, 0); fogTexture = PIXI.Texture.from(fog);
    fogTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR; fogTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  }
  return { texture, borderTexture, borderBounds, fogTexture, props, bounds, waterIndices, stats: { style, texel, width, height, props: props.length, sites: towns.length,
    palette: atlas ? 'Ochre plains, moss forest, plum wetlands, slate peaks; charcoal hinterland' : 'Original pixel palette', glyphKinds: new Set(props.map(p => p.kind)).size,
    fog: atlas ? 'Separate static cloud overlay; toggle without rebaking' : null, fogTextureMiB: atlas ? +(Math.ceil(width / 4) * Math.ceil(height / 4) * 4 / 1048576).toFixed(1) : 0,
    textureMiB: +(size * 4 / 1048576).toFixed(1), waterIndexMiB: +(size / 1048576).toFixed(1), bakeMs: Math.round(performance.now() - started), animation: 'Still water; independent index ranges retained' } };
}
