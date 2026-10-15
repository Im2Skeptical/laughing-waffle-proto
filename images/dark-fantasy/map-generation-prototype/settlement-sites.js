import { decorationRandom } from './generator.js';

// Canonical texture-space site planning. Camera and zoom never enter this model.
export function planSettlementSites({ map, pixel, world, width, height, land, waterIndices, regionIds, detail }) {
  detail *= .5;
  const sites = [];
  const dry = (x, y, id) => x >= 0 && y >= 0 && x < width && y < height
    && land[Math.floor(y) * width + Math.floor(x)] && !waterIndices[Math.floor(y) * width + Math.floor(x)]
    && map.regions[regionIds[Math.floor(y) * width + Math.floor(x)]]?.id === id;
  for (const [bi, biome] of ['plains', 'forest', 'islands', 'swamp', 'mountains'].entries()) {
    let best = null;
    for (const region of map.regions.filter(r => r.biome === biome)) {
      const outline = region.outline.map(pixel), centre = pixel(region.centre);
      for (let y = Math.ceil(Math.min(...outline.map(p => p.y))); y <= Math.max(...outline.map(p => p.y)); y += 5 * detail)
        for (let x = Math.ceil(Math.min(...outline.map(p => p.x))); x <= Math.max(...outline.map(p => p.x)); x += 5 * detail) {
          if (!dry(x, y, region.id)) continue;
          const rx = 23 * detail, ry = 16 * detail;
          let fits = true;
          for (let dy = -ry; dy <= ry && fits; dy += 2 * detail) for (let dx = -rx; dx <= rx; dx += 2 * detail)
            if ((dx / rx) ** 2 + (dy / ry) ** 2 < 1 && !dry(x + dx, y + dy, region.id)) { fits = false; break; }
          if (!fits) continue;
          const score = Math.hypot(x - centre.x, (y - centre.y) * 1.3) + decorationRandom(map.seed, x * 9173 ^ y * 673) * 4;
          if (!best || score < best.score) best = { x, y, rx, ry, score, biome, regionId: region.id, point: world(x, y), kind: bi === 0 || bi === 3 ? 'player' : 'neutral', buildings: [], streets: [] };
        }
    }
    if (best) sites.push(best);
  }
  return sites;
}

export function siteContains(sites, x, y, margin = 1) {
  return sites.some(s => ((x - s.x) / (s.rx * margin)) ** 2 + ((y - s.y) / (s.ry * margin)) ** 2 < 1);
}

export function layOutSettlements(sites, roads, { detail, dry, world, seed }) {
  detail *= .5;
  for (const site of sites) {
    site.buildings = []; site.streets = [];
    const near = roads.flat().filter(p => Math.hypot(p.x - site.x, p.y - site.y) < 24 * detail
      && Math.hypot(p.x - site.x, p.y - site.y) > 10 * detail);
    const target = near[0];
    // Streets follow the road but keep a broad, shallow site footprint.
    const slope = target ? Math.max(-.4, Math.min(.4, (target.y - site.y) / (target.x - site.x || 1))) : .16;
    const at = (u, v) => ({ x: site.x + u * detail, y: site.y + (v + u * slope) * detail });
    const safe = p => dry(p.x, p.y, site.regionId);
    const street = points => {
      const valid = points.every(safe) && points.slice(1).every((b, i) => {
        const a = points[i], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
        for (let n = 0; n <= steps; n++) {
          const t = steps ? n / steps : 0;
          if (!safe({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
        }
        return true;
      });
      if (valid) site.streets.push(points);
    };
    street([at(-20, 0), at(-7, -1), at(5, 1), at(20, 0)]);
    if (target) street([{ x: site.x, y: site.y }, target]);
    const occupied = [];
    for (const [row, v] of [-7, 7].entries()) for (let col = 0; col < 5; col++) {
      const u = -15 + col * 7.5, salt = Number(site.regionId.slice(1)) * 3571 + row * 113 + col * 83;
      const p = at(u + (decorationRandom(seed, salt) - .5) * 3, v + (decorationRandom(seed, salt + 17) - .5) * 4);
      const role = col === 2 && row === 0 ? (site.kind === 'player' ? 'hall' : 'market')
        : col === 4 ? 'workshop' : (col + row) % 3 === 0 ? 'pair' : 'house';
      const w = (role === 'pair' ? 7 : role === 'hall' || role === 'market' ? 8 : 5.5) * detail, h = w * .72;
      if (![-1, 0, 1].every(dx => [-1, 0, 1].every(dy => safe({ x: p.x + dx * w / 2, y: p.y + dy * h / 2 })))) continue;
      if (occupied.some(b => Math.abs(b.x - p.x) < (b.w + w) * .42 && Math.abs(b.y - p.y) < h)) continue;
      occupied.push({ ...p, w });
      site.buildings.push({ ...p, w, h, role, point: world(p.x, p.y), biome: site.biome });
      street([p, at(u, 0)]);
    }
  }
}

export function paintSettlementSites(sites, { width, height, colours, waterIndices, regionIds, map, surfaces, mixColour, detail, dot }) {
  detail *= .5;
  for (const site of sites) {
    const dry = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !waterIndices[y * width + x]
      && map.regions[regionIds[y * width + x]]?.id === site.regionId;
    // Blend the original biome material into worked ground, with irregular,
    // feathered margins. No imported ground plates or blanket biome tint.
    for (let y = Math.floor(site.y - site.ry * 1.2); y <= site.y + site.ry * 1.2; y++)
      for (let x = Math.floor(site.x - site.rx * 1.2); x <= site.x + site.rx * 1.2; x++) {
        if (!dry(x, y)) continue;
        const d = Math.hypot((x - site.x) / site.rx, (y - site.y) / site.ry);
        const noise = decorationRandom(map.seed, x * 9173 ^ y * 673);
        const strength = Math.max(0, 1 - d + (noise - .5) * .15) * .45;
        const i = y * width + x;
        colours[i] = mixColour(colours[i], surfaces.ground(site.biome, x, y), strength);
      }
    const ink = site.biome === 'swamp' ? ['#423a3d', '#877767'] : site.biome === 'mountains' ? ['#66544f', '#aa9180'] : ['#6b5c43', '#ad9a75'];
    for (const path of site.streets) for (let n = 1; n < path.length; n++) {
      const a = path[n - 1], b = path[n], length = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let k = 0; k <= length; k++) {
        const t = length ? k / length : 0, x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
        if (!dry(x, y)) continue;
        dot(x, y, 0, k % 5 === 0 ? ink[0] : ink[1]);
        if (site.biome === 'swamp' && k % 3 === 0) dot(x + 1, y, 0, '#a09178');
      }
    }
    for (const b of site.buildings) {
      for (let y = Math.floor(b.y - b.h / 3); y <= b.y + b.h / 2; y++) for (let x = Math.floor(b.x - b.w / 2); x <= b.x + b.w / 2; x++) {
        if (!dry(x, y)) continue;
        const i = y * width + x, base = surfaces.ground(site.biome, x, y);
        colours[i] = mixColour(colours[i], base, .6);
        if (site.biome === 'mountains' && y === Math.floor(b.y + b.h / 2)) dot(x, y, 0, '#76605a');
      }
    }
  }
}
