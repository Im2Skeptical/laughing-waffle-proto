// Disposable map study. No GameState, live simulation or save is attached.
import { attachRngHelpers } from '../../../src/model/rng.js';

export const BIOMES = {
  plains: { name: 'Plains', colour: 0xc4b679, ink: 0x77734b },
  forest: { name: 'Forest', colour: 0x61866a, ink: 0x244b3b },
  islands: { name: 'Islands', colour: 0x70a2ac, ink: 0x365e6a },
  swamp: { name: 'Swamp', colour: 0x727e69, ink: 0x3c504b },
  mountains: { name: 'Mountains', colour: 0xa59887, ink: 0x5d5d59 },
};
export const FEATURE_SETS = [
  ['river', 'ridge'], ['river', 'chasm'], ['valley', 'ridge'], ['river', 'ridge', 'chasm', 'valley'],
];
const ASPECT = 2.15;
const distance = (a, b) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);
const key = p => `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;
const edgeKey = (a, b) => [a, b].sort().join('|');
const lerp = (a, b, t) => a + (b - a) * t;

function clip(polygon, a, b, c) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const dp = a * p.x + b * p.y - c, dq = a * q.x + b * q.y - c;
    if (dp <= 1e-10) result.push(p);
    if ((dp < 0) !== (dq < 0)) {
      const t = dp / (dp - dq);
      result.push({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
    }
  }
  return result;
}

export function polygonArea(polygon) {
  return Math.abs(polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}

export function insidePolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function centroid(polygon) {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], cross = p.x * q.y - q.x * p.y;
    area += cross; x += (p.x + q.x) * cross; y += (p.y + q.y) * cross;
  }
  return { x: x / (3 * area), y: y / (3 * area) };
}

function shuffle(values, state) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = state.rngNextInt(0, i);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function buildGeography(vertices, edges, types, state) {
  const outer = new Set(edges.filter(e => e.regions.length === 1).flatMap(e => [e.a, e.b]));
  const connections = new Map([...vertices.keys()].map(id => [id, []]));
  for (const edge of edges) {
    connections.get(edge.a).push({ to: edge.b, edge });
    connections.get(edge.b).push({ to: edge.a, edge });
  }
  const specs = {
    river: [{ x: .35 + state.rngNextFloat() * .25, y: .02 }, { x: .4 + state.rngNextFloat() * .3, y: .97 }],
    ridge: [{ x: .05, y: .15 }, { x: .96, y: .22 + state.rngNextFloat() * .12 }],
    chasm: [{ x: .04, y: .63 }, { x: .93, y: .75 }],
    valley: [{ x: .07, y: .4 }, { x: .96, y: .5 }],
  };
  const used = new Set(), features = [];
  for (const type of types) {
    const [source, destination] = specs[type];
    const nearest = p => [...outer].sort((a, b) => distance(vertices.get(a), p) - distance(vertices.get(b), p))[0];
    const start = nearest(source), end = nearest(destination);
    const scores = new Map([[start, 0]]), previous = new Map(), pending = new Set(vertices.keys());
    while (pending.size) {
      const current = [...pending].reduce((best, id) => (scores.get(id) ?? Infinity) < (scores.get(best) ?? Infinity) ? id : best);
      if (!scores.has(current) || current === end) break;
      pending.delete(current);
      for (const { to, edge } of connections.get(current)) {
        if (!pending.has(to)) continue;
        const a = vertices.get(current), b = vertices.get(to), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const targetY = lerp(source.y, destination.y, mid.x);
        const deviation = type === 'river' ? Math.abs(mid.x - lerp(source.x, destination.x, mid.y)) : Math.abs(mid.y - targetY);
        const cost = distance(a, b) * (1 + deviation * 4 + (edge.regions.length === 1 ? 8 : 0) + (used.has(edge.id) ? 12 : 0))
          + (type === 'river' ? Math.max(0, a.y - b.y) * 3 : 0);
        const candidate = scores.get(current) + cost;
        if (candidate < (scores.get(to) ?? Infinity)) { scores.set(to, candidate); previous.set(to, { from: current, edge }); }
      }
    }
    if (!previous.has(end)) continue;
    const route = [], vertexIds = [end];
    let current = end;
    while (current !== start) {
      const step = previous.get(current);
      route.unshift(step.edge.id); vertexIds.unshift(step.from); current = step.from;
    }
    const feature = { type, edgeIds: route, vertexIds };
    features.push(feature);
    let offset = 0;
    const phase = state.rngNextFloat() * Math.PI * 2;
    route.forEach((id, index) => {
      used.add(id);
      const edge = edges.find(e => e.id === id);
      edge.feature = type; edge.featureOffset = offset; edge.featurePhase = phase;
      edge.featureDirection = edge.a === vertexIds[index] ? 1 : -1;
      offset += distance(vertices.get(edge.a), vertices.get(edge.b));
    });
  }
  return features;
}

function assignBiomes(regions, edges, quota, clustering, state) {
  const assignment = shuffle(Object.entries(quota).flatMap(([biome, count]) => Array(count).fill(biome)), state);
  const shared = edges.filter(e => e.regions.length === 2);
  const regionById = new Map(regions.map((r, i) => [r.id, i]));
  const affinity = regions.map(region => {
    const features = edges.filter(e => e.regions.includes(region.id)).map(e => e.feature);
    const coastal = edges.some(e => e.regions.length === 1 && e.regions[0] === region.id);
    return { plains: .15, forest: .2, islands: coastal ? .85 : -.35,
      swamp: features.includes('river') ? .65 : 0,
      mountains: features.includes('ridge') ? .85 : -.1 };
  });
  const score = () => shared.reduce((sum, edge) => sum + (assignment[regionById.get(edge.regions[0])] === assignment[regionById.get(edge.regions[1])] ? clustering * 1.8 : 0), 0)
    + assignment.reduce((sum, biome, i) => sum + affinity[i][biome] * .5, 0);
  let current = score();
  for (let step = 0; step < 3500; step++) {
    const a = state.rngNextInt(0, 19), b = state.rngNextInt(0, 19);
    if (assignment[a] === assignment[b]) continue;
    [assignment[a], assignment[b]] = [assignment[b], assignment[a]];
    const candidate = score(), temperature = .5 * (1 - step / 3500) + .015;
    if (candidate >= current || state.rngNextFloat() < Math.exp((candidate - current) / temperature)) current = candidate;
    else [assignment[a], assignment[b]] = [assignment[b], assignment[a]];
  }
  regions.forEach((region, i) => { region.biome = assignment[i]; });
}

function shapeEdge(edge, vertices, regions, roughness, state) {
  const a = vertices.get(edge.a), b = vertices.get(edge.b), length = distance(a, b);
  const dx = (b.x - a.x) * ASPECT, dy = b.y - a.y;
  const phase = state.rngNextFloat() * Math.PI * 2;
  const nearCentres = edge.regions.map(id => distance(regions.find(r => r.id === id).centre, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
  const amplitude = Math.min(.016, length * .1, ...nearCentres.map(d => d * .16)) * roughness;
  const samples = Math.max(4, Math.ceil(length * 150));
  const featureFrequency = { river: 2, valley: 1.4, chasm: 14, ridge: 5 }[edge.feature];
  edge.points = Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    const along = (edge.featureOffset ?? 0) + (edge.featureDirection === -1 ? 1 - t : t) * length;
    const wave = edge.feature ? edge.featureDirection * (Math.sin(along * Math.PI * 2 * featureFrequency + edge.featurePhase)
      + .25 * Math.sin(along * 83 + edge.featurePhase)) : Math.sin(t * Math.PI * 4.8 + phase) + .25 * Math.sin(t * 43 + phase);
    const offset = amplitude * Math.sin(Math.PI * t) ** 2 * wave;
    return { x: lerp(a.x, b.x, t) - dy / length * offset / ASPECT, y: lerp(a.y, b.y, t) + dx / length * offset };
  });
}

export function generateMap({ seed = 1847, clustering = .45, sizeVariation = .6, roughness = .65, featureSet = 0 } = {}) {
  const state = { rng: { seed: Math.floor(seed) } }; attachRngHelpers(state);
  const coastline = [{ x: .035, y: .14 }, { x: .14, y: .025 }, { x: .58, y: .015 }, { x: .9, y: .06 },
    { x: .985, y: .25 }, { x: .965, y: .77 }, { x: .85, y: .96 }, { x: .43, y: .99 }, { x: .1, y: .92 }, { x: .025, y: .68 }];
  const sites = Array.from({ length: 20 }, (_, i) => ({
    x: .12 + (i % 5) * .19 + (state.rngNextFloat() - .5) * .13 * sizeVariation,
    y: .14 + Math.floor(i / 5) * .235 + (state.rngNextFloat() - .5) * .17 * sizeVariation,
    weight: (state.rngNextFloat() - .5) * .012 * sizeVariation,
  }));
  const regions = sites.map((site, index) => {
    let polygon = coastline;
    for (const other of sites) {
      if (site === other) continue;
      polygon = clip(polygon, 2 * ASPECT ** 2 * (other.x - site.x), 2 * (other.y - site.y),
        ASPECT ** 2 * (other.x ** 2 - site.x ** 2) + other.y ** 2 - site.y ** 2 + site.weight - other.weight);
    }
    // Equal-sized cells can meet exactly at a clip plane: retain one junction.
    polygon = polygon.filter((p, i) => key(p) !== key(polygon[(i + polygon.length - 1) % polygon.length]));
    return { id: `R${String(index + 1).padStart(2, '0')}`, polygon, centre: centroid(polygon), area: polygonArea(polygon), neighbours: [] };
  });
  const vertices = new Map(), edgeMap = new Map();
  for (const region of regions) {
    region.vertexIds = region.polygon.map(p => { const id = key(p); vertices.set(id, p); return id; });
    region.edgeIds = region.vertexIds.map((a, i) => {
      const b = region.vertexIds[(i + 1) % region.vertexIds.length], id = edgeKey(a, b);
      const [first, second] = [a, b].sort();
      const edge = edgeMap.get(id) ?? { id, a: first, b: second, regions: [], feature: null };
      edge.regions.push(region.id); edgeMap.set(id, edge); return id;
    });
  }
  const edges = [...edgeMap.values()];
  for (const edge of edges.filter(e => e.regions.length === 2)) {
    const [a, b] = edge.regions;
    regions.find(r => r.id === a).neighbours.push(b); regions.find(r => r.id === b).neighbours.push(a);
  }
  const features = buildGeography(vertices, edges, FEATURE_SETS[featureSet], state);
  const biomes = shuffle(Object.keys(BIOMES), state), quota = Object.fromEntries(biomes.map((biome, i) => [biome, 6 - i]));
  assignBiomes(regions, edges, quota, clustering, state);
  for (const edge of edges) shapeEdge(edge, vertices, regions, roughness, state);
  for (const region of regions) {
    region.outline = region.edgeIds.flatMap((id, i) => {
      const edge = edgeMap.get(id), points = edge.a === region.vertexIds[i] ? edge.points : [...edge.points].reverse();
      return points.slice(0, -1);
    });
    region.area = polygonArea(region.outline);
    region.centre = centroid(region.outline);
  }
  const totalArea = regions.reduce((sum, r) => sum + r.area, 0);
  const biomeAreas = Object.fromEntries(Object.keys(BIOMES).map(b => [b, regions.filter(r => r.biome === b).reduce((sum, r) => sum + r.area, 0) / totalArea]));
  const shared = edges.filter(e => e.regions.length === 2);
  const matching = shared.filter(e => regions.find(r => r.id === e.regions[0]).biome === regions.find(r => r.id === e.regions[1]).biome).length;
  return { seed, regions, edges, features, quota, biomeAreas, totalArea, matchingBorders: matching, sharedBorders: shared.length };
}

// Stable decoration positions: independent of generation and presentation mode.
export function decorationRandom(seed, index) {
  let value = Math.imul((seed ^ index) >>> 0, 1597334677);
  value = Math.imul(value ^ value >>> 16, 2246822519);
  return ((value ^ value >>> 13) >>> 0) / 4294967296;
}
