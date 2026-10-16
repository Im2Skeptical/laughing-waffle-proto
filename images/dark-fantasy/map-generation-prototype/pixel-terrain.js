// Disposable Atlas renderer: one world pixel lattice over the approved geography.
// Geography stays authoritative. Surface palettes sample the viewed timeline time.
import { decorationRandom, insidePolygon, canPlacePeak } from './generator.js';
import { createAtlasArt } from './atlas-art.js';
import { routeSampleRoads } from './roads.js';
import { loadComposableArt, composableLibrary } from './composable-art.js';
import { composeHinterland, paintHinterlandMass } from './hinterland-composition.js';
import { classifyWaterBodies, extendWaterEnvironment, waterColourAt, WATER_BODY, WATER_RAMPS } from './water-style.js';
import { createWaterCycle } from './water-animation.js';
import { createAtmosphere } from './atmosphere.js';
import { cloudClearance } from './cloud-banks.js';
import { waterDriftMask, waterDriftOffset } from './water-drift.js';
import { composeTerrainLandscape, boneRidgeFits } from './terrain-composition.js';
import { loadIllustratedArt } from './illustrated-art.js';
import { releaseZoomArt } from './zoom-art.js';
import { paintOcean, paintEcotones, SHORE_TREATMENTS } from './terrain-interactions.js';
import { prepareTerrainSurfaces, createSurfaceSampler } from './terrain-surfaces.js';
import { paintTerrainFoundations } from './terrain-foundations.js';
import { paintRegionDivisions } from './terrain-divisions.js';
import { paintWetlandPools } from './wetland-ground.js';
import { bridgeSpans, paintBridge } from './road-crossings.js';
import { planSettlementSites, siteReliefContains, layOutSettlements, paintSettlementSites } from './settlement-sites.js';

export const ATLAS_COLOURS = { plains: 0xb7a17b, forest: 0x969174, islands: 0x688689, swamp: 0x858675, mountains: 0xa49782, monster:0x786359 };
const ATLAS_GROUND = {
  plains: [0x9f8c69, 0xac9670, 0xb7a17b, 0xc5b18d],
  forest: [0x858266, 0x989573, 0xa6a381, 0xb1ad8b],
  islands: [0x9eaa83, 0xabb48e, 0xb5bc99, 0xc1c5a6],
  swamp: [0x55505d, 0x6d6170, 0x867b87, 0x9c8c99],
  mountains: [0x827869, 0x958774, 0xa49782, 0xb4a792],
  monster: [0x3f3031,0x55403c,0x735146,0x927062],
  highlands: [0x25292e, 0x30353c, 0x3d434b, 0x4b5159],
  marsh: [0x202429, 0x2b2f36, 0x363b42, 0x454b51],
  scrub: [0x242728, 0x2f3435, 0x3c4142, 0x4a5051],
  badlands: [0x252527, 0x323235, 0x404044, 0x505054],
};
// Explicit water indices survive the static bake for the subsequent cycle study.
// Zero = dry. Ocean 1..8, river 16..23, foam 32..35, surf 40..47,
// shallow ripples 48..55. Stationary depth 64..95 and shoals 96..111.
// 128..159 swell, 160..191 breaking foam, 192..207 offshore foam, 208..239 small ripples.
// Static RGB waterBase and byte waterStrength preserve modulation independently of cycle phase.
// Index 9 and Atlas depth shades 64..95 stay fixed during surface cycling.
const ATLAS_WATER = [0, 0x3c555c, 0x425c62, 0x496368, 0x526e72, 0x5a797b, 0x628182, 0x6b8989, 0x7a9691,
  0x263f4e, 0x2e4d5b, 0x365e69, 0x41747c, 0x53898c];
for (let i = 0; i < 8; i++) ATLAS_WATER[16 + i] = [0x586d71, 0x657e81, 0x7b9391, 0x9aaea2, 0xb9c5af, 0x9aaea2, 0x7b9391, 0x657e81][i];
for (let i = 0; i < 4; i++) ATLAS_WATER[32 + i] = [0x79938b, 0x8fa295, 0xa5b09f, 0x8fa295][i];
// Coastal animation material banks: 40..47 advancing/backwashing surf,
// 48..55 shallow ripples; 96..111 stationary translucent-looking shoal colours.
for (let i = 0; i < 8; i++) {
  ATLAS_WATER[40 + i] = [0x557e82, 0x648d8e, 0x779e9b, 0x9bb6a8, 0xb6c7b4, 0x91afa3, 0x709895, 0x5c8588][i];
  ATLAS_WATER[48 + i] = [0x4b727a, 0x507980, 0x60888c, 0x759a99, 0x86aaa3, 0x759a99, 0x60888c, 0x507980][i];
}
for (let i = 0; i < 16; i++) {
  const t = i / 15;
  ATLAS_WATER[96 + i] = (Math.round(60 + 26 * t) << 16) | (Math.round(86 + 36 * t) << 8) | Math.round(94 + 29 * t);
}
// Stationary depth shades use a separate bank from the cycling surface marks.
for (let i = 0; i < 32; i++) {
  const t = i / 31;
  ATLAS_WATER[64 + i] = (Math.round(55 + 38 * t) << 16) | (Math.round(76 + 39 * t) << 8) | Math.round(82 + 31 * t);
}

const ART_BANKS = { 1: createAtlasArt(), 2: createAtlasArt(2) };
const spriteArtCache = new Map();
export const prepareIllustratedArt = () => Promise.all([loadIllustratedArt(ART_BANKS), loadComposableArt(ART_BANKS), prepareTerrainSurfaces()]);
export function pixelSpriteTextures(texel = 4) {
  const detail = texel === 2 ? 2 : 1, ART = ART_BANKS[detail];
  if (spriteArtCache.has(detail)) return spriteArtCache.get(detail);
  const entries = Object.entries(ART), cell = 64 * detail, columns = 32, canvas = document.createElement('canvas'); canvas.width = columns * cell; canvas.height = Math.ceil(entries.length / columns) * cell;
  const ctx = canvas.getContext('2d');
  entries.forEach(([, art], i) => art.rows.forEach((row, y) => [...row].forEach((code, x) => {
    if (art.colours[code]) { ctx.globalAlpha = art.opacity?.[y][x] ?? 1; ctx.fillStyle = art.colours[code]; ctx.fillRect(i % columns * cell + 2 + x, Math.floor(i / columns) * cell + 2 + y, 1, 1); }
  })));
  const base = PIXI.Texture.from(canvas).baseTexture; base.scaleMode = PIXI.SCALE_MODES.NEAREST; base.mipmap = PIXI.MIPMAP_MODES.OFF;
  const spriteArt = Object.fromEntries(entries.map(([kind, art], i) => [kind, new PIXI.Texture(base,
    new PIXI.Rectangle(i % columns * cell + 2, Math.floor(i / columns) * cell + 2, Math.max(...art.rows.map(r => r.length)), art.rows.length))]));
  spriteArtCache.set(detail, spriteArt); return spriteArt;
}

const MATERIALS = [null, ...Object.keys(ATLAS_GROUND)];
const MATERIAL_IDS = Object.fromEntries(MATERIALS.map((name, i) => [name, i]));
const relief = prop => /crag|hill|cliff|deadwood|shore|terrain-|contact-/.test(prop.kind);
const samplePlane = (plane, x, y) => x < plane.x || y < plane.y || x >= plane.x + plane.width || y >= plane.y + plane.height
  ? 0 : plane.data[(y - plane.y) * plane.width + x - plane.x];
function glyphPosition(terrain, prop, flipX, flipY) {
  const art = ART_BANKS[terrain.stats.texel === 2 ? 2 : 1][prop.kind], { texel } = terrain.stats, sx = flipX ? -1 : 1, sy = flipY ? -1 : 1;
  return { sx, sy, left: Math.round(sx * (prop.point.x - terrain.bounds.minX) * 1576 / texel - Math.max(...art.rows.map(r => r.length)) / 2),
    top: Math.round(sy * ((prop.point.y - terrain.bounds.minY) * 516 / texel - (prop.composed ? art.rows.length * (prop.anchorHeight ?? .5) : 0))
      - art.rows.length * (prop.composed ? 1 - (prop.anchorHeight ?? .5) : 1)) };
}
function mixColour(a, b, t) {
  return [16, 8, 0].reduce((c, shift) => c | Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift, 0);
}
// Painted relief retains its source material colours across region boundaries.
// Ground masks only clip water/roads; they never recolour a whole illustration.
export function reliefSpriteTextures(terrain, flipX, flipY) {
  const key = `${flipX}:${flipY}`;
  terrain.reliefCache ??= new Map();
  if (terrain.reliefCache.has(key)) return terrain.reliefCache.get(key).textures;
  const ART = ART_BANKS[terrain.stats.texel === 2 ? 2 : 1];
  const props = terrain.props.filter(relief), canvas = document.createElement('canvas'), cell = terrain.stats.texel === 2 ? 128 : 64;
  const columns = props.length > 256 ? 32 : 16;
  canvas.width = cell * columns; canvas.height = Math.max(cell, Math.ceil(props.length / columns) * cell);
  const ctx = canvas.getContext('2d'), palettes = {};
  for (const name of MATERIALS.slice(1)) {
    const bank = ATLAS_GROUND[name], body = bank[2];
    palettes[name] = { a: mixColour(body, 0x211e1b, .66), b: mixColour(body, bank[0], .75), c: body,
      d: mixColour(bank[3], 0xd9c9af, name === 'mountains' ? .25 : .12), e: mixColour(bank[3], 0xe1d6bf, .4), f: bank[1] };
  }
  props.forEach((prop, i) => {
    const art = ART_BANKS[terrain.stats.texel === 2 ? 2 : 1][prop.kind], g = glyphPosition(terrain, prop, flipX, flipY);
    art.rows.forEach((row, y) => [...row].forEach((code, x) => {
      if (code === '.') return;
      const ix = Math.floor(g.sx * (g.left + x + .5)), iy = Math.floor(g.sy * (g.top + y + .5));
      const name = MATERIALS[samplePlane(terrain.materials, ix, iy)]
        ?? (prop.context==='bone-boundary' && y<art.rows.length*.7 ? 'monster':null);
      if (!name || samplePlane(terrain.roadClearance, ix, iy)) return;
      const bank = ATLAS_GROUND[name], palette = palettes[name];
      let colour = palette[code] ?? bank[2];
      if (art.illustrated) colour = art.rgbColours?.[code] ?? Number.parseInt(art.colours[code].slice(1), 16);
      if (prop.kind.includes('hill') && !art.illustrated && code !== 'a' && code !== 'b') colour = mixColour(colour, bank[2], .75);
      // Coastal sand fades into the common ground while scrub and rock retain
      // their silhouettes. Only the imported island material is affected.
      const islandSand = art.family === 'islands' && (colour >> 16) > 145 && (colour >> 8 & 255) > 125;
      const edgeFade = islandSand ? Math.min(1, Math.min(x+1,row.length-x,y+1,art.rows.length-y)/5) * .78 : 1;
      const foot = Math.min(1, (art.rows.length - y) / Math.max(3, art.rows.length * (art.composable ? .22 : .12)));
      ctx.globalAlpha = (art.opacity?.[y][x] ?? (code === 'f' ? .32 : 1)) * foot * edgeFade
        * (prop.ridgeBoundary ? 1 : 1 - samplePlane(terrain.divisionClearance, ix, iy) / 255);
      ctx.fillStyle = `#${colour.toString(16).padStart(6, '0')}`;
      ctx.fillRect(i % columns * cell + 2 + x, Math.floor(i / columns) * cell + 2 + y, 1, 1);
    }));
  });
  const base = PIXI.Texture.from(canvas).baseTexture; base.scaleMode = PIXI.SCALE_MODES.NEAREST; base.mipmap = PIXI.MIPMAP_MODES.OFF;
  const textures = new Map(props.map((prop, i) => [prop, new PIXI.Texture(base,
    new PIXI.Rectangle(i % columns * cell + 2, Math.floor(i / columns) * cell + 2, Math.max(...ART[prop.kind].rows.map(r => r.length)), ART[prop.kind].rows.length))]));
  terrain.reliefCache.set(key, { base, textures });
  if (terrain.reliefCache.size > 2) {
    const oldest = terrain.reliefCache.keys().next().value;
    releaseZoomArt(terrain.reliefCache.get(oldest).textures.values());
    terrain.reliefCache.get(oldest).base.destroy(); terrain.reliefCache.delete(oldest);
  }
  return textures;
}
export function destroyPixelTerrain(terrain) {
  terrain.waterCycle?.destroy();terrain.backdropWaterCycle?.destroy();terrain.atmosphere?.destroy();
  releaseZoomArt([terrain.texture, terrain.borderTexture, terrain.roadTexture, terrain.backdropTexture]);
  for (const texture of [terrain.texture, terrain.borderTexture, terrain.roadTexture, terrain.backdropTexture]) texture?.destroy(true);
  for (const cached of terrain.reliefCache?.values() ?? []) { releaseZoomArt(cached.textures.values()); cached.base.destroy(); }
}

export function pixelSpriteFits(terrain, prop, flipX, flipY) {
  const art = ART_BANKS[terrain.stats.texel === 2 ? 2 : 1][prop.kind], { texel, width, height } = terrain.stats;
  const px = (prop.point.x - terrain.bounds.minX) * 1576 / texel, py = (prop.point.y - terrain.bounds.minY) * 516 / texel;
  const sx = flipX ? -1 : 1, sy = flipY ? -1 : 1, w = Math.max(...art.rows.map(r => r.length));
  const left = Math.round(sx * px - w / 2), top = Math.round(sy * (py - (prop.composed ? art.rows.length * (prop.anchorHeight ?? .5) : 0))
    - art.rows.length * (prop.composed ? 1 - (prop.anchorHeight ?? .5) : 1));
  return art.rows.every((row, y) => [...row].every((code, x) => {
    if (code === '.') return true;
    const ix = Math.floor(sx * (left + x + .5)), iy = Math.floor(sy * (top + y + .5));
    if (ix < 0 || iy < 0 || ix >= width || iy >= height || terrain.waterIndices[iy * width + ix]) return false;
    if (prop.plainsOnly && samplePlane(terrain.materials, ix, iy) !== MATERIAL_IDS.plains) return false;
    if (!relief(prop) && !prop.kind.startsWith('ruin') && samplePlane(terrain.roadClearance, ix, iy)) return false;
    if (terrain.geography && (prop.kind.includes('crag') || prop.peak) && x % 2 === 0 && y % 2 === 0) {
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

export function bakePixelTerrain(map, { texel = 2, sampleBackground, sites = true, settlementScale = .75, islandStyle = 'basalt' }) {
  const started = performance.now(), detail = texel === 2 ? 2 : 1, ART = ART_BANKS[detail];
  // Fine detail covers the map and a generous hinterland. A cheap distant bake
  // supports unrestricted panning without a giant high-resolution GPU texture.
  const bounds = texel === 2 ? { minX: -1.5, minY: -1.5, maxX: 2.5, maxY: 2.5 } : map.surroundings.bounds;
  let backdropTexture = null,backdropWaterCycle=null;
  if (texel === 2) {
    const distant = bakePixelTerrain(map, { texel: 8, sampleBackground, sites: false, islandStyle });
    backdropTexture = distant.texture; distant.texture = null;
    backdropWaterCycle=distant.waterCycle;distant.waterCycle=null;destroyPixelTerrain(distant);
  }
  const groundBank = ATLAS_GROUND, waterBank = ATLAS_WATER;
  const width = Math.ceil((bounds.maxX - bounds.minX) * 1576 / texel), height = Math.ceil((bounds.maxY - bounds.minY) * 516 / texel);
  const size = width * height, regionIds = new Int16Array(size).fill(-1), islandLand = new Uint8Array(size);
  const land = new Uint8Array(size), waterIndices = new Uint8Array(size), colours = new Uint32Array(size);
  const pixel = p => ({ x: (p.x - bounds.minX) * 1576 / texel, y: (p.y - bounds.minY) * 516 / texel });
  const world = (x, y) => ({ x: bounds.minX + (x + .5) * texel / 1576, y: bounds.minY + (y + .5) * texel / 516 });
  const mlo = pixel({ x: -1, y: -1 }), mhi = pixel({ x: 2, y: 2 });
  const materials = { x: Math.floor(mlo.x) - 64, y: Math.floor(mlo.y) - 64,
    width: Math.ceil(mhi.x - mlo.x) + 128, height: Math.ceil(mhi.y - mlo.y) + 128 };
  materials.data = new Uint8Array(materials.width * materials.height);
  const materialAt = (x, y) => MATERIALS[samplePlane(materials, x, y)];
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
  const surfaces = createSurfaceSampler({ map, bounds, texel, width, height, land, regionIds });
  surfaces.registerPaths('river', map.features.filter(feature => feature.type === 'river').map(feature => feature.points.map(pixel)));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, region = map.regions[regionIds[i]];
    p.x = bounds.minX + (x + .5) * texel / 1576; p.y = bounds.minY + (y + .5) * texel / 516; sampleBackground(p, f);
    land[i] = region ? region.biome === 'islands' ? islandLand[i] : 1 : f[0] < .5 ? 1 : 0;
    if (!land[i]) continue;
    const material = region?.biome ?? (f[1] > .5 ? 'highlands' : f[2] > .3 ? 'marsh' : f[3] > .3 ? 'scrub' : 'badlands');
    if (x >= materials.x && y >= materials.y && x < materials.x + materials.width && y < materials.y + materials.height)
      materials.data[(y - materials.y) * materials.width + x - materials.x] = MATERIAL_IDS[material];
    const shade = region ? noise(map.seed, x, y, 60) * .55 + noise(map.seed ^ 7531, x, y, 16) * .45 : .2 + f[1] * .35 + f[2] * .2 + f[3] * .3;
    const bank = groundBank[material]; let tone = Math.min(3, Math.floor(shade * 4));
    const grain = decorationRandom(map.seed ^ 1731, Math.imul(x, 8363) ^ Math.imul(y, 36433));
    if (grain < .025) tone = Math.max(0, tone - 1); else if (grain > .98) tone = Math.min(3, tone + 1);
    colours[i] = region?bank[tone]:mixColour(bank[Math.min(2,Math.floor(shade*3))],bank[Math.min(3,Math.floor(shade*3)+1)],shade*3%1);
    if (region) colours[i] = mixColour(colours[i], surfaces.ground(region.biome, x, y), .72);
  }
  // Chamfer shore distances. Palette indices remain categorical.
  const seaDistance = new Uint16Array(size), dryDistance = new Uint16Array(size);
  const shoreTypes = new Uint8Array(size);
  for (let i = 0; i < size; i++) if (land[i]) shoreTypes[i] = MATERIAL_IDS[map.regions[regionIds[i]]?.biome] ?? 0;
  const unit = 3, cap = 768;
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
  // Follow the decreasing distance field to carry coastal material into water.
  for (let pass = 0; pass < 2; pass++) for (let n = 0; n < size; n++) {
    const i = pass ? size - 1 - n : n; if (land[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    let best = seaDistance[i];
    for (const j of [x ? i - 1 : i, x < width - 1 ? i + 1 : i, y ? i - width : i, y < height - 1 ? i + width : i]) {
      if (shoreTypes[j] && seaDistance[j] < best) { best = seaDistance[j]; shoreTypes[i] = shoreTypes[j]; }
    }
  }
  // Volcanic soil retains source texture detail; narrow beaches remain coastal.
  // This prepares the substrate before drawing the un-tinted illustrations.
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=y*width+x;
    if (!land[i] || map.regions[regionIds[i]]?.biome !== 'islands') continue;
    const inland=Math.max(0,Math.min(1,(dryDistance[i]/3-2*detail)/(7*detail)));
    const heath=noise(map.seed^63917,x,y,35*detail);
    let material=mixColour(islandStyle === 'caldera' ? 0x84775c : 0x777971, islandStyle === 'caldera' ? 0x596447 : 0x565d4d, Math.max(0,Math.min(1,(heath-.3)*2)));
    const source = surfaces.ground('islands', x, y);
    const light = ((source >> 16 & 255) + (source >> 8 & 255) + (source & 255)) / 3;
    material = light > 145 ? mixColour(material, 0xb2b099, Math.min(.35, (light-145)/190))
      : mixColour(material, 0x353b31, Math.min(.3, (145-light)/180));
    colours[i]=mixColour(colours[i],material,inland*.96);
  }
  const waterBase = new Uint32Array(size), waterStrength = new Uint8Array(size), waterOverlays = new Uint8Array(size*4);
  const waterBodies=classifyWaterBodies(land,width,height);
  extendWaterEnvironment(waterBodies,land,dryDistance,width,height);
  const surfaceTreatments = paintOcean({ map, width, height, texel, bounds, land, waterIndices, colours,
    regionIds, seaDistance, dryDistance, shoreTypes, waterBodies, waterBank, groundBank, noise, mixColour, waterBase, waterStrength, waterOverlays, surfaces });
  const wetlands = paintWetlandPools({ map, pixel, width, height, detail, texel, bounds, regionIds, land, dryDistance,
    colours, waterIndices, waterBase, waterStrength, noise, mixColour, surfaces, protectedCentres: sites ? map.regions.filter(r => r.biome !== 'islands')
      .filter((r, i) => i === 2 || i === 7 || i === 12).map(r => pixel(r.centre)) : [] });
  const put = (x, y, colour, water = 0, onlyDry = false) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x; if (onlyDry && !land[i]) return;
    colours[i] = typeof colour === 'function' ? colour(x, y) : colour; if (water) waterIndices[i] = water;
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
  if (detail === 2) for (let y = 5; y < height - 5; y++) for (let x = 5; x < width - 5; x++) {
    const i = y * width + x, region = map.regions[regionIds[i]], d = dryDistance[i];
    if (!land[i] || !region || d < 6 || d > 27) continue;
    const salt = Math.imul(x, 8329) ^ Math.imul(y, 2311), grain = decorationRandom(map.seed ^ 9137, salt);
    const rocky = region.biome === 'mountains' || noise(map.seed ^ 1471, x, y, 32) > .58;
    const bank = groundBank[region.biome];
    if (rocky && d % 8 <= 1 && grain > .23) colours[i] = mixColour(bank[0], 0x493c31, .35);
    else if (rocky && d % 8 === 3 && grain > .3) colours[i] = mixColour(bank[3], 0xd7c3a1, .18);
    else if (!rocky && d < 13 && grain < .22) colours[i] = mixColour(bank[2], 0xd0bd92, .25);
    // Tiny shore stones have a lit edge and a dark underside, confined to land.
    if (grain > .987 && d > 12 && d < 24) {
      colours[i] = bank[3]; if (land[i + width]) colours[i + width] = bank[0];
    }
  }
  for (const feature of map.features.filter(f => f.type === 'valley')) stroke(feature.points, 4, (x, y) => groundBank[materialAt(x, y) ?? 'badlands'][2]);
  for (const corridor of map.geography.corridors.filter(c => c.type === 'mountain-valley' || c.type === 'water-gap')) {
    stroke(corridor.points, corridor.type === 'mountain-valley' ? 3 : 2, (x, y) => groundBank[materialAt(x, y) ?? 'badlands'][2]);
  }
  for (const feature of map.features.filter(f => f.type === 'chasm')) {
    stroke(feature.points, 2.5, 0x8f7b5c); stroke(feature.points, 1.2, 0x403b31);
  }
  for (const coast of map.geography.coasts.filter(c => c.rocky)) stroke(coast.points, 1, 0x6c5e48);
  for (const river of map.features.filter(f => f.type === 'river')) {
    const widthAt = d => (.3 + Math.min(.65, d / 60)) * 4 / texel;
    stroke(river.points, d => widthAt(d) + 1.1 * detail, (x, y) => SHORE_TREATMENTS[materialAt(x, y)]?.bank ?? 0x444c3c);
    stroke(river.points, d => widthAt(d) + .45 * detail, (x, y) => mixColour(groundBank[materialAt(x, y) ?? 'badlands'][2], SHORE_TREATMENTS[materialAt(x, y)]?.sediment ?? 0xa99c77, .35));
    stroke(river.points, widthAt, 0, 16);
    if (river.mouth?.treatment === 'estuary') {
      const end = river.points.at(-1), p = pixel(end);
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y < 10) put(Math.floor(p.x) + x, Math.floor(p.y) + y, 0, 16 + (x + y + 16) % 8, true);
    }
  }
  for (const creek of map.surroundings.continuations) stroke(creek.points, .5, 0, 16);

  const interactions = { bridge: 0, mountainPass: 0, gorge: map.geography.corridors.filter(c => c.type === 'water-gap').length,
    estuary: map.features.filter(f => f.type === 'river' && f.mouth?.treatment === 'estuary').length, rockyShore: 0, softShore: 0, woodlandFringe: 0 };
  for (let y = 4; y < height - 4; y++) for (let x = 4; x < width - 4; x++) {
    const i = y * width + x, region = map.regions[regionIds[i]];
    if (!region || !land[i] || waterIndices[i]) continue;
    const riverNear = [i - 3, i + 3, i - width * 3, i + width * 3].some(j => waterIndices[j] >= 16 && waterIndices[j] <= 23);
    const grain = decorationRandom(map.seed, Math.imul(x, 9173) ^ Math.imul(y, 673));
    if (riverNear && grain < .13) {
      colours[i] = region.biome === 'mountains' ? groundBank.mountains[0] : 0x677158;
      if (grain < .035 && land[i - width] && !waterIndices[i - width]) colours[i - width] = groundBank[region.biome][0];
    }
    if (riverNear) {
      let mask = 0;
      for (const [bit, j] of [i - width * 3, i + 3, i + width * 3, i - 3].entries())
        if (waterIndices[j] >= 16 && waterIndices[j] <= 23) mask |= 1 << bit;
      colours[i] = mixColour(colours[i], surfaces.path('river', region.biome, x, y, (x + y) * texel / 2, 3, mask), .32);
    }
    // A broken feathered woodland edge makes the transition legible beneath
    // the large tree masses, without bleeding decoration into another biome.
    if (region.biome === 'forest' && [i - 3, i + 3, i - width * 3, i + width * 3].some(j => map.regions[regionIds[j]]?.biome !== 'forest') && grain < .38) {
      colours[i] = groundBank.forest[grain < .12 ? 0 : 3]; interactions.woodlandFringe++;
    }
  }
  paintEcotones({ map, width, height, texel, regionIds, land, waterIndices, colours, groundBank, noise, mixColour, surfaceTreatments, surfaces });
  const siteDetail = detail * settlementScale / .75;
  const settlementPlans = sites ? planSettlementSites({ map, pixel, world, width, height, land, waterIndices, regionIds, detail: siteDetail }) : [];
  const props = [];
  const fitsLand = prop => {
    const art = ART[prop.kind], p = pixel(prop.point), w = Math.max(...art.rows.map(r => r.length));
    const left = Math.round(p.x - w / 2), top = Math.round(p.y - art.rows.length);
    if(prop.context==='bone-boundary')return boneRidgeFits(art,left,top,(x,y)=>{
      if(x<0||y<0||x>=width||y>=height)return null;
      const i=y*width+x;
      return {dry:!!land[i]&&!waterIndices[i],biome:map.regions[regionIds[i]]?.biome};
    });
    let outside = 0, painted = 0;
    const fits = art.rows.every((row, y) => [...row].every((code, x) => {
      if (code === '.') return true;
      const px = left + x, py = top + y, i = py * width + px;
      if (px < 0 || py < 0 || px >= width || py >= height || !land[i] || waterIndices[i]) return false;
      if (prop.allowedBiomes) { painted++; if (!prop.allowedBiomes.includes(map.regions[regionIds[i]]?.biome)) outside++; }
      if (prop.plainsOnly && materialAt(px, py) !== 'plains') return false;
      return !(prop.kind.includes('crag') || prop.peak) || x % 4 !== 0 || y % 4 !== 0 || canPlacePeak(map.geography, world(px, py), 1.5 * texel / 516);
    }));
    return fits && (!painted || outside / painted < .025);
  };
  const towns = settlementPlans.map((s, i) => ({ kind: `ruin${i % 3}`, point: s.point, regionId: s.regionId }));
  props.push(...towns);
  const extent = map.regions.flatMap(r => r.outline).map(pixel);
  const bx = Math.floor(Math.min(...extent.map(p => p.x))) - 2, by = Math.floor(Math.min(...extent.map(p => p.y))) - 2;
  const borderCanvas = document.createElement('canvas');
  borderCanvas.width = Math.ceil(Math.max(...extent.map(p => p.x))) - bx + 2;
  borderCanvas.height = Math.ceil(Math.max(...extent.map(p => p.y))) - by + 2;
  const roadClearance = { x: bx, y: by, width: borderCanvas.width, height: borderCanvas.height,
    data: new Uint8Array(borderCanvas.width * borderCanvas.height) };
  layOutSettlements(settlementPlans, { detail: siteDetail, world, seed: map.seed, dry: (x, y, id) => {
    const i = Math.floor(y) * width + Math.floor(x);
    return x >= 0 && y >= 0 && x < width && y < height && land[i] && !waterIndices[i] && map.regions[regionIds[i]]?.id === id;
  } });
  const roads = routeSampleRoads(settlementPlans.filter(s => s.biome !== 'islands').map(s => s.entrance), { width, height, regionIds, land, waterIndices, materialAt, scale: detail, exclusions: settlementPlans,
    bounds: { minX: bx, minY: by, maxX: bx + borderCanvas.width, maxY: by + borderCanvas.height } });
  surfaces.registerPaths('road', roads);
  const roadCanvas = document.createElement('canvas'); roadCanvas.width = borderCanvas.width; roadCanvas.height = borderCanvas.height;
  const roadCtx = roadCanvas.getContext('2d');
  let bridges = 0;
  const roadDot = (x, y, radius, colour, clear = false) => {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius + .3) continue;
      const px = x + dx, py = y + dy, i = py * width + px;
      if (px < bx || py < by || px >= bx + roadCanvas.width || py >= by + roadCanvas.height || !land[i] || regionIds[i] < 0) continue;
      if (clear) roadClearance.data[(py - by) * roadCanvas.width + px - bx] = 1;
      else { roadCtx.fillStyle = colour; roadCtx.fillRect(px - bx, py - by, 1, 1); }
    }
  };
  for (const path of roads) {
    // Densify the search lattice to keep diagonal roads continuous.
    const samples = [];
    for (let n = 1; n < path.length; n++) {
      const a = path[n - 1], b = path[n], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let j = 0; j < steps; j++) samples.push({ x: Math.round(a.x + (b.x - a.x) * j / steps), y: Math.round(a.y + (b.y - a.y) * j / steps) });
    }
    samples.push(path.at(-1));
    for (const p of samples) roadDot(p.x, p.y, 3 * detail, '', true);
    roadCtx.globalAlpha = .3;
    for (const p of samples) roadDot(p.x, p.y, Math.ceil(1.5 * detail), '#655339');
    roadCtx.globalAlpha = .85;
    for (const p of samples) roadDot(p.x, p.y, detail, '#695338');
    roadCtx.globalAlpha = 1;
    for (const [n, p] of samples.entries()) {
      const biome = map.regions[regionIds[p.y * width + p.x]]?.biome;
      let colour = (SHORE_TREATMENTS[materialAt(p.x, p.y)]?.road ?? [0xb5a078, 0xc9b68c])[n % 11 < 3 ? 0 : 1];
      if (biome) {
        const a = samples[Math.max(0, n - 2)], b = samples[Math.min(samples.length - 1, n + 2)];
        const mask = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 10 : 5;
        colour = mixColour(colour, surfaces.path('road', biome, p.x, p.y, n * texel / 2, 0, mask), .42);
      }
      roadDot(p.x, p.y, Math.max(0, detail - 1), '#' + colour.toString(16));
    }
    // Fine broken wheel marks and irregular verge stones give the route a
    // drawn surface. Bridges get their own continuous deck and cross-planks.
    for (let n = 3; n < samples.length - 3; n += 5) {
      const p = samples[n], a = samples[n - 3], b = samples[n + 3];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      roadCtx.globalAlpha = .35;
      roadDot(Math.round(p.x - (b.y - a.y) / length * detail), Math.round(p.y + (b.x - a.x) / length * detail), 0, '#594d3b');
    }
    roadCtx.globalAlpha = 1;
    let inMountains = false;
    for (let n = 0; n < samples.length; n++) {
      const p = samples[n], water = waterIndices[p.y * width + p.x], river = water >= 16 && water <= 23;
      const mountain = !river && materialAt(p.x, p.y) === 'mountains';
      if (mountain && !inMountains) interactions.mountainPass++;
      inMountains = mountain;
      if (!river && materialAt(p.x, p.y) === 'swamp' && n % (2 * detail) === 0) {
        const a = samples[Math.max(0, n - 2)], b = samples[Math.min(samples.length - 1, n + 2)];
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        for (let d = -detail; d <= detail; d++) roadDot(Math.round(p.x - (b.y - a.y) / length * d), Math.round(p.y + (b.x - a.x) / length * d), 0, '#928978');
      }
    }
    const spans = bridgeSpans(samples, p => waterIndices[p.y * width + p.x], detail);
    bridges += spans.length;
    for (const [n, span] of spans.entries()) paintBridge(span, detail, roadDot, {
      art: ART[`terrain-bridge-${(n + bridges + map.seed) % 8}`], context: roadCtx, origin: { x: bx, y: by } });
  }
  // Compose playable terrain and imported hinterland instead of legacy scatter.
  // Coasts
  // use terrain profiles rather than isolated legacy cliff/rock stamps.
  const composition = composeTerrainLandscape({ map, art: ART, pixel, world, detail, islandStyle, settlementPlans, monsterZones: sites,
    // Road corridors stencil individual pixels in reliefSpriteTextures; they
    // create passes instead of rejecting an entire connecting landscape piece.
    legal: prop => {
      if (!fitsLand(prop)) return false;
      const art = ART[prop.kind], p = pixel(prop.point);
      const left = prop.left ?? Math.round(p.x - art.rows[0].length / 2);
      const top = prop.top ?? Math.round(p.y - art.rows.length);
      if((prop.family.startsWith('terrain-monster-')||prop.context==='bone-boundary') && art.rows.some((row,y)=>[...row].some((code,x)=>{
        const px=left+x,py=top+y;
        return code!=='.' && px>=roadClearance.x && py>=roadClearance.y && px<roadClearance.x+roadClearance.width && py<roadClearance.y+roadClearance.height
          && roadClearance.data[(py-roadClearance.y)*roadClearance.width+px-roadClearance.x];
      }))) return false;
      return art.rows.every((row, y) => [...row].every((code, x) => code === '.' || !siteReliefContains(settlementPlans, left + x, top + y)));
    } });
  const hinterland=composeHinterland({map,art:ART,pixel,world,detail,sampleBackground,
    legal:prop=>{
      const glyph=ART[prop.kind];let painted=0,outside=0,dry=0;
      for(let y=0;y<glyph.rows.length;y+=2)for(let x=0;x<glyph.rows[y].length;x+=2){
        if(glyph.rows[y][x]==='.')continue;
        const px=prop.left+x,py=prop.top+y;
        if(px<0||py<0||px>=width||py>=height)return false;
        const i=py*width+px;painted++;
        if(land[i]&&!waterIndices[i])dry++;
        if(regionIds[i]<0)outside++;
        if(siteReliefContains(settlementPlans,px,py))return false;
      }
      return painted>0&&dry/painted>.96&&outside/painted>(prop.barrier?.72:.98);
    }});
  props.splice(0,props.length,...towns,...hinterland.props,...composition.props);
  hinterland.stats.mass=paintHinterlandMass({props:hinterland.props,art:ART,width,height,colours,land,waterIndices,regionIds,detail,seed:map.seed,noise,mixColour});
  const foundations = paintTerrainFoundations({ props, art: ART, pixel, surfaces, materialAt, land, waterIndices,
    colours, width, height, detail, noise, seed: map.seed, mixColour, islandStyle });
  const divisions = paintRegionDivisions({ map, pixel, width, height, detail, land, regionIds,
    waterIndices, waterBase, colours, groundBank, noise, mixColour });
  paintSettlementSites(settlementPlans, { width, height, colours, waterIndices, regionIds, map, surfaces, mixColour, detail: siteDetail, dot: roadDot });
  interactions.bridge = bridges;
  interactions.rockyShore = props.filter(p => p.kind.startsWith('cliff')).length;
  interactions.softShore = map.geography.coasts.filter(c => !c.rocky).length;
  const roadTexture = PIXI.Texture.from(roadCanvas); roadTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  roadTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  const borderCtx = borderCanvas.getContext('2d');
  for (const edge of map.edges) {
    // Shared borders are illustrated landforms in the base bake. No dry outline.
    if (edge.regions.length === 2) continue;
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
  const islandWater=map.islandClusters.map(c=>({id:c.id,regions:c.regionIds,oceanPixels:0,lakePixels:0}));
  const clusterForRegion=new Int16Array(map.regions.length).fill(-1);
  for(const [n,c] of map.islandClusters.entries())for(const id of c.regionIds)clusterForRegion[map.regions.findIndex(r=>r.id===id)]=n;
  const bodyCounts={ocean:0,lake:0,river:0,peat:0};
  for (let i = 0; i < size; i++) {
    const index=waterIndices[i];
    waterBodies[i]=!index?0:index>=16&&index<=23?WATER_BODY.river:index>=48&&index<=55&&land[i]?WATER_BODY.peat:waterBodies[i]||WATER_BODY.ocean;
    if(index){const body=waterBodies[i];bodyCounts[body===1?'ocean':body===2?'lake':body===3?'river':'peat']++;
      const cluster=regionIds[i]>=0?clusterForRegion[regionIds[i]]:-1;
      if(cluster>=0&&body<=2)islandWater[cluster][body===1?'oceanPixels':'lakePixels']++;
    }
    let c = index ? waterColourAt(index,waterBase[i],waterStrength[i],waterBank,mixColour) : colours[i];
    // Only ocean swell carries the two overlapping surface layers. Later land,
    // river and site painting must never inherit ocean foam from the first pass.
    const overlay=i*4;
    if(index<128||index>=160)waterOverlays.fill(0,overlay,overlay+4);
    for(let layer=0;layer<4;layer+=2)if(waterOverlays[overlay+layer+1])
      c=mixColour(c,waterBank[waterOverlays[overlay+layer]],waterOverlays[overlay+layer+1]/255);
    // Retain the river phase indices while keeping the still-water study from
    // reading as alternating bright stripes at the finer resolution.
    if (waterIndices[i] >= 16 && waterIndices[i] <= 23) c = mixColour(c, 0x68868b, .85);
    image.data[i * 4] = c >> 16 & 255; image.data[i * 4 + 1] = c >> 8 & 255; image.data[i * 4 + 2] = c & 255; image.data[i * 4 + 3] = detail === 2
      ? Math.round(255 * Math.min(1, Math.min(i % width, width - 1 - i % width, Math.floor(i / width), height - 1 - Math.floor(i / width)) / 64)) : 255;
  }
  ctx.putImageData(image, 0, 0);
  const coastalEffects = { foam: 0, surf: 0, offshoreFoam:0, shallowRipples: 0, shoals: 0, swell: 0, fineRipples: 0, lakeRipples:0,lakeGlints:0 };
  for(let i=0;i<size;i++) {
    if(waterOverlays[i*4+1])coastalEffects.fineRipples++;
    if(waterOverlays[i*4+3])coastalEffects[waterOverlays[i*4+2]<192?'surf':'offshoreFoam']++;
  }
  for (const index of waterIndices) {
    if (index >= 128 && index <= 159) coastalEffects.swell++;
    else if (index >= 160 && index <= 191) coastalEffects.surf++;
    else if (index >= 192 && index <= 207) coastalEffects.offshoreFoam++;
    else if (index >= 208 && index <= 239) coastalEffects.fineRipples++;
    else if (index >= 32 && index <= 35) coastalEffects.foam++;
    else if (index >= 40 && index <= 47) coastalEffects.surf++;
    else if (index >= 48 && index <= 55) coastalEffects.shallowRipples++;
    else if (index >= 96 && index <= 111) coastalEffects.shoals++;
    else if (index >=112 && index<=127)coastalEffects.lakeRipples++;
    else if (index>=240)coastalEffects.lakeGlints++;
  }
  const texture = PIXI.Texture.from(canvas); texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST; texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  // One low-resolution atmospheric layer covers the fine atlas and hinterland.
  // Its stationary geographic mask keeps fog outside playable regions; cloud
  // banks and their aligned shadows dissipate through a wider playable apron.
  let atmosphere=null;
  if(detail===2) {
    const fw=Math.ceil(width/4),fh=Math.ceil(height/4),mask=new Uint8Array(fw*fh*4);
    const cloudMask=cloudClearance(regionIds,width,height,fw,fh);
    for(let y=0;y<fh;y++)for(let x=0;x<fw;x++) {
      const px=Math.min(width-1,Math.floor((x+.5)*width/fw)),py=Math.min(height-1,Math.floor((y+.5)*height/fh));
      let distance=32;
      for(let dy=-24;dy<=24;dy+=8)for(let dx=-24;dx<=24;dx+=8) {
        const sx=px+dx,sy=py+dy;
        if(sx>=0&&sy>=0&&sx<width&&sy<height&&regionIds[sy*width+sx]>=0)
          distance=Math.min(distance,Math.hypot(dx,dy));
      }
      const edge=Math.min(1,Math.min(x,y,fw-1-x,fh-1-y)/16);
      const t=Math.max(0,Math.min(1,(distance-8)/16)),clearance=t*t*(3-2*t),i=(y*fw+x)*4;
      mask[i]=Math.round(clearance*(land[py*width+px]?110:25)*edge);
      mask[i+1]=cloudMask[y*fw+x];
      mask[i+2]=Math.round(edge*255);mask[i+3]=255;
    }
    atmosphere=createAtmosphere({width:fw,height:fh,mask,seed:map.seed,
      world:[bounds.minX*1576/2,bounds.minY*516/2,width*texel/2,height*texel/2]});
  }

  const waterCycle=createWaterCycle(texture,waterIndices,waterStrength,Uint32Array.from(waterBank),waterBase,
    (x,y)=>noise(map.seed^6719,(bounds.minX*1576+x*texel)/2,(bounds.minY*516+y*texel)/2,87),
    {world:[bounds.minX*1576/2+waterDriftOffset(map.seed)-texel/4,bounds.minY*516/2-texel/4,width*texel/2,height*texel/2],
      maskAt:i=>waterDriftMask(waterBodies[i],seaDistance[i]/3*texel/2,Math.min(1,waterStrength[i]/35))},waterOverlays);
  return { waterCycle,backdropWaterCycle,settlementPlans, texture, backdropTexture, backdropBounds: map.surroundings.bounds, borderTexture, borderBounds, atmosphere, roadTexture, roadClearance, divisionClearance: divisions.clearance, roadPaths: roads.map(path => path.map(p => world(p.x, p.y))), materials, props, bounds, waterIndices, waterBase, waterStrength, waterOverlays, waterBodies, waterPalette:Uint32Array.from(waterBank), geography: map.geography, stats: { style: 'F', texel, detail, backdropTexel: backdropTexture ? 8 : null, width, height, props: props.length, sites: towns.length,
    waterStudy:{bodyCounts,islandGroups:islandWater.map(c=>({...c,environment:c.lakePixels>c.oceanPixels?'inland lake':'ocean'})),ramps:WATER_RAMPS,phaseSeconds:0,paused:true},
    hinterland:hinterland.stats, palette: 'Parchment ochre, olive woodland, grey peat and reddish umber relief; charcoal hinterland', surfaceKit: surfaces.stats(), foundations, wetlands, glyphKinds: new Set(props.map(p => p.kind)).size,
    roads: roads.length, bridges, regionDivisions: divisions.stats, interactions, coastalEffects, terrainComposition: composition.diagnostics, assetLibrary: { biomePieces: composableLibrary.biomePieces, boundaryPieces: composableLibrary.boundaryPieces, sheets: composableLibrary.sheets,
      usablePieces: composableLibrary.cells.filter(c => !Object.keys(c.cutRuns).length).length,
      excludedPieces: composableLibrary.cells.filter(c => Object.keys(c.cutRuns).length).map(c => c.kind) }, surfaceTreatments, illustratedProps: props.filter(p => ART[p.kind].illustrated).length, coastalOutcrops: props.filter(p => p.kind.startsWith('cliff')).length, reliefColouring: 'Source material colours, selective asset grades, alpha-overlap composition', mountainSpines: map.regions.filter(r => r.biome === 'mountains').length + map.features.filter(f => f.type === 'ridge').length, rangeMassifs: props.filter(p => p.range).length,
    atmosphere: atmosphere?.stats ?? null,
    textureMiB: +(size * 4 / 1048576).toFixed(1), waterIndexMiB: +(size / 1048576).toFixed(1), waterFieldMiB: +(size * 7 / 1048576).toFixed(1), bakeMs: Math.round(performance.now() - started), animation: 'GPU palette cycling; separate marine/freshwater ramps, fixed depth and resolved-colour zoom filtering' } };
}
