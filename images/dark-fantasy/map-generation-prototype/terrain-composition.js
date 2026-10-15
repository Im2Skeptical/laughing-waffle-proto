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
  forest: [0, 1, 2, 3, 4, 5, 8, 9, 10, 11], mountains: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  swamp: [0, 1, 2, 3, 6, 7, 8, 9, 10, 11], plains: [8, 9, 10, 11],
  islands: [2, 3, 7, 8, 11],
};
const COASTS = { forest: [4, 5, 7, 8, 9, 11], mountains: [5, 6, 7, 8, 9, 11],
  swamp: [3, 5, 6, 8, 9, 10], plains: [4, 6, 7, 9, 11], islands: [0, 1, 2, 3, 4, 5, 10, 11] };

export function composeTerrainLandscape({ map, art, pixel, world, legal, detail, islandStyle = 'basalt', settlementPlans = [] }) {
  const islandFamily = `terrain-island-${islandStyle}`;
  const props = [], diagnostics = { paths: 0, coastalProfiles: 0, placements: 0, joined: 0, breaks: 0, interiors: 0, families: {} };
  const regions = new Map(map.regions.map(r => [r.id, r]));
  const rand = salt => decorationRandom(map.seed ^ 48317, salt);
  const baseKind = kind => kind.replace(/-mirror$/, '').replace(/-(compact|small)$/, '');
  const make = (kind, x, y, family, salt, allowedBiomes, context) => {
    const glyph = art[kind], s = shape(glyph), point = world(Math.round(x), Math.round(y + s.height * (context === 'ridge-boundary' ? .68 : .5)));
    const p = pixel(point), n = Number(baseKind(kind).split('-').at(-1));
    return { kind, point, salt, family, allowedBiomes, context, composed: true,
      left: Math.round(p.x - s.width / 2), top: Math.round(p.y - s.height),
      boundary: context !== 'interior', ridgeBoundary: context === 'ridge-boundary', anchorHeight: context === 'ridge-boundary' ? .68 : .5, range: family === 'terrain-mountains' || family === 'terrain-ridge-border',
      peak: family === 'terrain-ridge-border' || family === 'terrain-mountains' && [0, 1, 2, 4, 10].includes(n)
        || family.startsWith('contact-') && CONTACT_PAIRS[Number(family.slice(8))].includes('mountains') && n !== 3 };
  };
  const nearby = prop => props.filter(p => Math.abs(p.left - prop.left) < 85 * detail && Math.abs(p.top - prop.top) < 65 * detail);
  const add = prop => {
    props.push(prop); diagnostics.families[prop.family] = (diagnostics.families[prop.family] ?? 0) + 1;
  };
  const choose = ({ x, y, family, indices, salt, allowedBiomes, context, previous = null, sizeLevel = 0 }) => {
    const options = [];
    const candidates = indices.flatMap(n => [{ n, mirrored: false }, { n, mirrored: true }])
      .map((candidate, i) => ({ ...candidate, rank: rand(salt + i * 79) })).sort((a, b) => a.rank - b.rank);
    for (let attempt = 0; attempt < Math.min(context === 'interior' ? 8 : 12, candidates.length); attempt++) {
      const { n, mirrored } = candidates[attempt];
      const kind = `${family}-${n}${sizeLevel === 1 ? '-compact' : sizeLevel === 2 ? '-small' : ''}${mirrored ? '-mirror' : ''}`;
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
      if (previous && (join < (context.startsWith('ridge') ? .12 : .06) || join > .46)) continue;
      const score = rand(salt + attempt * 31 + 4) * .3
        + (previous ? 1 - Math.abs(join - .22) * 3 : Math.min(.3, overlap)) - Math.max(0, overlap - .38);
      options.push({ prop, score, join });
    }
    options.sort((a, b) => b.score - a.score);
    return options[0]?.prop ?? ((family.startsWith('terrain-island-') || ['terrain-plains','terrain-forest'].includes(family)) && sizeLevel < 2
      ? choose({ x,y,family,indices,salt,allowedBiomes,context,previous,sizeLevel:sizeLevel+1 }) : undefined);
  };

  // Settlement edges have priority over general scatter. Rear cover frames the
  // roofs; low foreground pieces lead into the biome, with an open approach.
  const siteRecipes={
    plains:{rear:[6,7,8],front:[9,10,11]},
    forest:{rear:[4,5,7],front:[8,9,11]},
    islands:{rear:[4,6,7],front:[8,10,11]},
    swamp:{rear:[3,6,8],front:[9,10,11]},
    mountains:{rear:[7,8,9],front:[8,9,11]},
  };
  diagnostics.settlementEdges=[];
  for(const [i,site] of settlementPlans.entries()) {
    const recipe=siteRecipes[site.biome], family=site.biome==='islands'?islandFamily:`terrain-${site.biome}`;
    const approach=site.surroundings?.approachAngle??Math.atan2(site.entrance.y-site.y,site.entrance.x-site.x);
    let placed=0;
    for(const n of [7,10,4,1,8,5,11,2,6,3,0,9]) {
      const a=n*Math.PI/6+(rand(i*43+n+8101)-.5)*.22;
      const angularGap=Math.abs(Math.atan2(Math.sin(a-approach),Math.cos(a-approach)));
      if(angularGap<.65) continue;
      const rear=Math.sin(a)<-.25;
      const indices=rear?recipe.rear:recipe.front;
      let prop;
      for(const ring of [1.4,1.75,2.1]) {
        const x=site.x+Math.cos(a)*(site.rx*ring+4*detail);
        const y=site.y+Math.sin(a)*(site.ry*ring+3*detail);
        prop=choose({x,y,family,indices,salt:620001+i*9887+n*431,allowedBiomes:[site.biome],context:'settlement-edge',
          sizeLevel:['plains','forest','islands'].includes(site.biome)?1:0});
        if(prop) break;
      }
      if(prop) {prop.siteRegion=site.regionId;add(prop);placed++;}
      if(placed>=6) break;
    }
    if(site.surroundings) site.surroundings.placed=placed;
    diagnostics.settlementEdges.push({region:site.regionId,biome:site.biome,placed});
  }

  // One principal extinct crater per connected island group. Search the largest
  // regions first, accepting only a complete dry footprint outside towns.
  const visited = new Set();
  for (const origin of map.regions.filter(r => r.biome === 'islands')) {
    if (visited.has(origin.id)) continue;
    const group = [origin]; visited.add(origin.id);
    for (let k = 0; k < group.length; k++) for (const edge of map.edges) {
      if (!edge.regions.includes(group[k].id)) continue;
      for (const id of edge.regions) {
        const r = regions.get(id);
        if (r?.biome === 'islands' && !visited.has(id)) { group.push(r); visited.add(id); }
      }
    }
    group.sort((a, b) => Math.abs(polygonArea(b.outline)) - Math.abs(polygonArea(a.outline)));
    let crater = null;
    for (const [index, region] of group.entries()) {
      const c = pixel(region.centre), outline = region.outline.map(pixel);
      const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
      for (let attempt = 0; attempt < 65 && !crater; attempt++) {
        const salt = 190001 + map.regions.indexOf(region) * 811 + index * 97 + attempt * 47;
        const x = attempt === 0 ? c.x : Math.min(...xs) + rand(salt) * (Math.max(...xs) - Math.min(...xs));
        const y = attempt === 0 ? c.y : Math.min(...ys) + rand(salt + 1) * (Math.max(...ys) - Math.min(...ys));
        if (!insidePolygon({ x, y }, outline)) continue;
        crater = choose({ x, y, family: islandFamily, indices: [0, 1], salt, allowedBiomes: ['islands'], context: 'island-crater' });
      }
      if (crater) { add(crater); break; }
    }
  }
  const paths = [];
  const ridgeArt = !!art['terrain-ridge-border-0'];
  for (const [i, feature] of map.features.entries()) if (feature.type === 'ridge')
    paths.push({ points: feature.points.map(pixel), family: ridgeArt ? 'terrain-ridge-border' : 'terrain-mountains', directional: ridgeArt, allowedBiomes: ['plains', 'forest', 'swamp', 'mountains'], indices: ridgeArt ? [0, 1, 2, 3, 4, 6, 7, 10] : [0, 1, 2, 4, 5, 6, 8, 9], salt: 3001 + i * 991, context: ridgeArt ? 'ridge-boundary' : 'ridge' });
  // Broad low grassland spines and wooded slopes organise the interior before
  // smaller cover grows around them. Each has bends and open breathing room.
  for (const [i, region] of map.regions.entries()) if (['plains','forest'].includes(region.biome)) {
    const outline=region.outline.map(pixel), c=pixel(region.centre);
    const rx=(Math.max(...outline.map(p=>p.x))-Math.min(...outline.map(p=>p.x)))*.31;
    const ry=(Math.max(...outline.map(p=>p.y))-Math.min(...outline.map(p=>p.y)))*.31;
    const horizontal=rx>ry;
    paths.push({points:Array.from({length:9},(_,n)=>{
      const t=n/8*2-1,bend=Math.sin(t*Math.PI+rand(i+418)*3)*.34;
      return {x:c.x+(horizontal?t*rx:bend*rx),y:c.y+(horizontal?bend*ry:t*ry)};
    }),family:`terrain-${region.biome}`,allowedBiomes:[region.biome],
    indices:region.biome==='plains'?[0,1,2,3,4,5]:[0,1,2,3,6,7],salt:180001+i*877,context:'landscape-spine'});
  }
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
  // Broken volcanic flanks and tropical scrub give islands a connected interior.
  // Shore profiles still own the waterline: no ring of pasted cliff blocks.
  for (const [i, region] of map.regions.entries()) if (region.biome === 'islands') {
    const outline=region.outline.map(pixel), c=pixel(region.centre);
    const rx=(Math.max(...outline.map(p=>p.x))-Math.min(...outline.map(p=>p.x)))*.3;
    const ry=(Math.max(...outline.map(p=>p.y))-Math.min(...outline.map(p=>p.y)))*.3;
    const horizontal=rx>ry;
    paths.push({points:Array.from({length:9},(_,n)=>{
      const t=n/8*2-1,bend=Math.sin(t*Math.PI+rand(i+631)*2)*.25;
      return {x:c.x+(horizontal?t*rx:bend*rx),y:c.y+(horizontal?bend*ry:t*ry)};
    }),family:islandFamily,allowedBiomes:['islands'],indices:[2,3,4,5,6,7],salt:160001+i*877,context:'island-belt'});
  }
  for (const [i, edge] of map.edges.entries()) {
    if (edge.regions.length !== 2) continue;
    const pair = edge.regions.map(id => regions.get(id).biome);
    if (pair[0] === pair[1] && !(ridgeArt && pair.includes('mountains'))) continue;
    const contact = CONTACT_PAIRS.findIndex(p => p.includes(pair[0]) && p.includes(pair[1]));
    paths.push({ points: edge.points.map(pixel), family: ridgeArt && pair.includes('mountains') ? 'terrain-ridge-border' : `contact-${contact}`,
      directional: ridgeArt && pair.includes('mountains'), indices: ridgeArt && pair.includes('mountains') ? [0, 1, 2, 3, 4, 6, 7, 10] : [0, 1, 2, 3, 4],
      allowedBiomes: pair, salt: 20003 + i * 919, context: ridgeArt && pair.includes('mountains') ? 'ridge-boundary' : 'boundary' });
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
  paths.sort((a, b) => Number(b.context === 'ridge-boundary') - Number(a.context === 'ridge-boundary'));
  for (const path of paths) {
    diagnostics.paths++;
    let travelled = 0, next = rand(path.salt) * 12 * detail, previous = null, attempts = 0;
    for (let j = 1; j < path.points.length; j++) {
      const a = path.points[j - 1], b = path.points[j], length = Math.hypot(b.x - a.x, b.y - a.y);
      while (length && next <= travelled + length) {
        const t = (next - travelled) / length, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const salt = path.salt + (++attempts) * 719;
        const dx = b.x - a.x, dy = b.y - a.y;
        const recipe = { ...path, indices: !path.directional ? path.indices : Math.abs(dy) < Math.abs(dx) * .4 ? [0, 1, 6, 7, 10]
          : Math.abs(dy) > Math.abs(dx) * 2 ? [4, 5, 7, 10] : dx * dy < 0 ? [2, 6, 7, 10] : [3, 6, 7, 10] };
        let prop = choose({ ...recipe, x, y, salt, previous });
        // Search either side of the predicted join before declaring a gap.
        // This adapts to differently shaped paintings and curved boundaries.
        if (!prop && previous) for (const offset of [-5, 5, -9]) {
          prop = choose({ ...recipe, x: x + (b.x - a.x) / length * offset * detail,
            y: y + (b.y - a.y) / length * offset * detail, salt: salt + offset * 113, previous });
          if (prop) break;
        }
        if (!prop && previous) { diagnostics.breaks++; previous = null; }
        if (!prop) prop = choose({ ...recipe, x, y, salt });
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
    const outline = region.outline.map(pixel), family = region.biome === 'islands' ? islandFamily : `terrain-${region.biome}`;
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
    let placed = 0, limit = Math.ceil(area / ((region.biome === 'islands' ? (islandStyle === 'caldera' ? 600 : 1000) : region.biome === 'swamp' ? 1100 : dense ? 320 : region.biome === 'plains' ? 950 : 560) * detail * detail));
    for (const candidate of candidates) {
      if (placed >= limit || props.length >= 600) break;
      const prop = choose({ ...candidate, family, indices: region.biome === 'forest' && candidate.density < .57 ? [4,5,8,9,10,11] : region.biome === 'islands' ? [8,9,10,11] : region.biome === 'mountains' ? [7, 8, 9, 11] : INTERIORS[region.biome], allowedBiomes: [region.biome], context: 'interior' });
      if (!prop) continue;
      const near = nearby(prop), overlap = near.reduce((n, p) => Math.max(n, illustrationOverlap(prop, p, art)), 0);
      // Moderate-density fringe extends an existing mass; high-density cores
      // can start another patch, leaving coherent open ground between them.
      if (dense && candidate.density < .57 && overlap < .05 && rand(candidate.salt + 8) > .16) continue;
      add(prop); placed++; diagnostics.interiors++;
    }
  }
  diagnostics.islandScaledPieces = props.filter(p => p.family.startsWith('terrain-island-') && /-(compact|small)(-mirror)?$/.test(p.kind)).length;
  diagnostics.islandStyle = islandStyle;
  diagnostics.islandCraters = props.filter(p => p.context === 'island-crater').length;
  diagnostics.placements = props.length;
  return { props, diagnostics };
}
