import { mapAssetUrl } from './asset-url.js';
// Imported material tiles describe the ground; relief sprites add height to it.
// All sampling is anchored to world coordinates and uses the map's fixed seed.
import { decorationRandom } from '../../../src/model/regional-map/generator.js';

export const surfaceLibrary = { ready: false, counts: {}, sourceGroundPieces: 96, sourceBankProfiles: 40 };
const tiles = new Map(), profiles = new Map();
const biomes = ['plains', 'forest', 'islands', 'swamp', 'mountains'];
const wrap = (n, size) => ((Math.floor(n) % size) + size) % size;
const mix = (a, b, t) => [16, 8, 0].reduce((c, shift) => c | Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift, 0);

async function readAtlas(path, records, target) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve; image.onerror = () => reject(new Error(`Imported terrain atlas failed: ${path}`));
    image.src = mapAssetUrl(path);
  });
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  for (const record of records) {
    const [x, y, width, height] = record.rect, rgba = ctx.getImageData(x, y, width, height).data;
    const pixels = new Uint32Array(width * height);
    for (let n = 0; n < pixels.length; n++) pixels[n] = rgba[n * 4] << 16 | rgba[n * 4 + 1] << 8 | rgba[n * 4 + 2];
    target.set(record.kind, { ...record, width, height, pixels });
  }
}

export async function prepareTerrainSurfaces() {
  const manifest = await (await fetch(mapAssetUrl('./assets/runtime/terrain-kit-v1.json'))).json();
  await Promise.all([readAtlas('./assets/runtime/terrain-kit-v1.webp', manifest.tiles, tiles),
    readAtlas('./assets/runtime/bank-profiles-v1.webp', manifest.profiles, profiles)]);
  const monster = await (await fetch(mapAssetUrl('./assets/runtime/monster-ground-v1.json'))).json();
  await readAtlas('./assets/runtime/monster-ground-v1.webp', monster.tiles, tiles);
  Object.assign(surfaceLibrary, { ready: true, counts: {...manifest.counts,ground:manifest.counts.ground+16}, cases: manifest.tiles.length+16,
    tilePixels: manifest.tilePixels, importedTexel: manifest.designTexel });
}

export function normalizeShoreMask(mask) {
  for (const [diagonal, a, b] of [[4, 0, 1], [5, 1, 2], [6, 2, 3], [7, 3, 0]])
    if (!(mask & 1 << a) || !(mask & 1 << b)) mask &= ~(1 << diagonal);
  return mask;
}

export function createSurfaceSampler({ map, bounds, texel, width, height, land, regionIds }) {
  const used = new Map(), groundCells = new Map(), shoreCells = new Map(), pathMasks = new Map();
  const worldX = x => (bounds.minX * 1576 + x * texel) / 2;
  const worldY = y => (bounds.minY * 516 + y * texel) / 2;
  const use = record => {
    if (record) used.set(record.kind, { role: record.role, biome: record.biome, biomes: record.biomes });
    return record;
  };
  const sample = (record, x, y) => record.pixels[wrap(y, record.height) * record.width + wrap(x, record.width)];
  const ground = (biome, x, y) => {
    const wx = worldX(x), wy = worldY(y), cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
    const key = `${biome}:${cx}:${cy}`;
    let record = groundCells.get(key);
    if (!record) {
      const n = Math.floor(decorationRandom(map.seed ^ 60331, Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) * 16);
      record = use(tiles.get(`ground-${biome}-${n}`)); groundCells.set(key, record);
    }
    return sample(record, wx, wy);
  };
  const groundVariant = (biome, variant, x, y) => {
    return sample(use(tiles.get(`ground-${biome}-${variant}`)), worldX(x), worldY(y));
  };
  const landAt = (x, y) => x >= 0 && y >= 0 && x < width && y < height && land[Math.floor(y) * width + Math.floor(x)] ? 1 : 0;
  const shoreCase = (biome, x, y) => {
    const cx = Math.floor(worldX(x) / 32), cy = Math.floor(worldY(y) / 32), key = `${biome}:${cx}:${cy}`;
    let record = shoreCells.get(key);
    if (!record) {
      const px = ((cx + .5) * 64 - bounds.minX * 1576) / texel;
      const py = ((cy + .5) * 64 - bounds.minY * 516) / texel, step = 32 / texel;
      let mask = 0;
      for (const [n, [dx, dy]] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]].entries())
        if (landAt(px + dx * step, py + dy * step)) mask |= 1 << n;
      const template = use(tiles.get(`shore-${biome}-${normalizeShoreMask(mask)}`));
      ground(biome, x, y);
      const material = groundCells.get(key).variant;
      const styles = {
        plains: [1, 2, 0, 2, 0, 3, 4, 2, 5, 6, 2, 4, 2, 4, 5, 7],
        forest: [2, 0, 7, 2, 3, 2, 1, 3, 2, 1, 3, 7, 0, 1, 4, 6],
        islands: [1, 0, 1, 3, 4, 5, 2, 1, 5, 1, 3, 2, 1, 7, 6, 3],
        swamp: [0, 1, 0, 2, 3, 0, 4, 3, 0, 5, 6, 2, 0, 3, 4, 7],
        mountains: [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7],
      };
      record = { ...template, profile: styles[biome][material] }; shoreCells.set(key, record);
    }
    return record;
  };
  const bank = (biome, x, y, depth, horizontal = true) => {
    if(biome==='monster') return mix(bank('mountains',x,y,depth,horizontal),ground('monster',x,y),.65);
    const record = shoreCase(biome, x, y), profile = profiles.get(`bank-${biome}-${record.profile}`);
    const along = horizontal ? worldX(x) : worldY(y);
    return sample(profile, along * 2, Math.max(0, Math.min(31, Math.round(depth * 31))));
  };
  const regionAt = (x, y) => x >= 0 && y >= 0 && x < width && y < height
    ? map.regions[regionIds[Math.floor(y) * width + Math.floor(x)]]?.biome : null;
  const contact = (a, b, x, y, amount) => {
    if(a==='monster'||b==='monster') return mix(ground(a,x,y),ground(b,x,y),amount);
    if (biomes.indexOf(a) > biomes.indexOf(b)) { [a, b] = [b, a]; amount = 1 - amount; }
    const wx = worldX(x), wy = worldY(y), cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
    const px = (cx * 64 - bounds.minX * 1576) / texel, py = (cy * 64 - bounds.minY * 516) / texel, step = 64 / texel;
    let mask = 0;
    for (const [n, [dx, dy]] of [[0, 0], [1, 0], [1, 1], [0, 1]].entries())
      if (regionAt(px + dx * step, py + dy * step) === b) mask |= 1 << n;
    const record = use(tiles.get(`contact-${a}-${b}-${mask}`));
    const base = mix(ground(a, x, y), ground(b, x, y), amount);
    // Physical ownership controls the blend. The matching corner template
    // supplies material variation rather than replacing the polygon geometry.
    return mix(base, sample(record, wx, wy), .22);
  };
  const path = (role, biome, x, y, along, distance, mask = 10) => {
    if(biome==='monster') return mix(path(role,'mountains',x,y,along,distance,mask),ground('monster',x,y),.40);
    const key = `${role}:${Math.floor(worldX(x) / 32)}:${Math.floor(worldY(y) / 32)}`;
    mask = pathMasks.get(key) ?? mask;
    const record = use(tiles.get(`${role}-${biome}-${mask & 15}`));
    const vertical = mask === 5 || mask === 1 || mask === 4;
    return sample(record, vertical ? 15 + distance : along, vertical ? along : 15 + distance);
  };
  const registerPaths = (role, paths) => {
    for (const points of paths) {
      let previous = null;
      for (let n = 1; n < points.length; n++) {
        const a = points[n - 1], b = points[n], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
        for (let i = 0; i <= steps; i++) {
          const cx = Math.floor(worldX(a.x + (b.x - a.x) * i / steps) / 32);
          const cy = Math.floor(worldY(a.y + (b.y - a.y) * i / steps) / 32);
          if (previous && (previous.cx !== cx || previous.cy !== cy)) {
            const oldKey = `${role}:${previous.cx}:${previous.cy}`, newKey = `${role}:${cx}:${cy}`;
            let exits = 0, entrances = 0;
            if (cx > previous.cx) { exits |= 2; entrances |= 8; }
            if (cx < previous.cx) { exits |= 8; entrances |= 2; }
            if (cy > previous.cy) { exits |= 4; entrances |= 1; }
            if (cy < previous.cy) { exits |= 1; entrances |= 4; }
            pathMasks.set(oldKey, (pathMasks.get(oldKey) ?? 0) | exits);
            pathMasks.set(newKey, (pathMasks.get(newKey) ?? 0) | entrances);
          }
          previous = { cx, cy };
        }
      }
    }
  };
  return { ground, groundVariant, bank, contact, path, registerPaths,
    stats: () => ({ ...surfaceLibrary, usedCases: used.size,
      usedByRole: Object.fromEntries(['ground', 'contact', 'shore', 'river', 'road'].map(role => [role, [...used.values()].filter(v => v.role === role).length])),
      groundBiomes: [...new Set([...used.values()].filter(v => v.role === 'ground').map(v => v.biome))] }) };
}
