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
const WORLD_SIDES = ['north', 'east', 'south', 'west'];

function createWorld(seed) {
  const state = { rng: { seed: seed ^ 0x537a91 } }; attachRngHelpers(state);
  const first = state.rngNextInt(0, 3), count = state.rngNextInt(1, 2);
  const oceanSides = Array.from({ length: count }, (_, i) => WORLD_SIDES[(first + i) % 4]);
  const phases = Array.from({ length: 2 }, () => state.rngNextFloat() * Math.PI * 2);
  return { oceanSides, shape: { method: 'connected-cells', phases } };
}

function worldSide(p) {
  const distances = [p.y, 1 - p.x, 1 - p.y, p.x];
  return WORLD_SIDES[distances.indexOf(Math.min(...distances))];
}

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

function buildGeography(vertices, edges, types, state, oceanSides) {
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
  const turn = (WORLD_SIDES.indexOf(oceanSides[0]) + 2) % 4;
  const rotate = p => turn === 0 ? p : turn === 1 ? { x: 1 - p.y, y: p.x }
    : turn === 2 ? { x: 1 - p.x, y: 1 - p.y } : { x: p.y, y: 1 - p.x };
  specs.river = specs.river.map(rotate);
  const landSides = WORLD_SIDES.filter(side => !oceanSides.includes(side));
  const sidePoint = side => ({ north: { x: .35, y: .02 }, east: { x: .98, y: .35 },
    south: { x: .65, y: .98 }, west: { x: .02, y: .65 } })[side];
  specs.ridge = [sidePoint(landSides[0]), sidePoint(landSides.at(-1))];
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
        const deviation = segmentDistance(mid, source, destination);
        const forward = ((b.x - a.x) * (destination.x - source.x) * ASPECT ** 2 + (b.y - a.y) * (destination.y - source.y))
          / distance(source, destination);
        const cost = distance(a, b) * (1 + deviation * 4 + (edge.regions.length === 1 ? 8 : 0) + (used.has(edge.id) ? 12 : 0))
          + (type === 'river' ? Math.max(0, -forward) * 3 : 0);
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

function segmentDistance(p, a, b) {
  const dx = (b.x - a.x) * ASPECT, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ASPECT * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return distance(p, { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
}

// March triangles to recover coastlines from one continuous cluster-wide field.
function islandContours(bounds, field, anchors) {
  const columns = Math.ceil((bounds.maxX - bounds.minX) * ASPECT / .017), lines = Math.ceil((bounds.maxY - bounds.minY) / .017);
  // Keep narrow shared-edge crossings on the sampling grid, so a genuine
  // island neck cannot disappear merely because it falls between samples.
  const coordinates = (min, max, count, axis) => [...new Set([...Array.from({ length: count + 1 }, (_, i) => lerp(min, max, i / count)),
    ...anchors.map(p => p[axis])].map(v => +v.toFixed(10)))].sort((a, b) => a - b);
  const xs = coordinates(bounds.minX, bounds.maxX, columns, 'x'), ys = coordinates(bounds.minY, bounds.maxY, lines, 'y');
  const nx = xs.length - 1, ny = ys.length - 1;
  const rows = ys.map(y => xs.map(x => {
    const p = { x, y };
    return { ...p, value: field(p) };
  }));
  const joins = new Map(), points = new Map();
  const triangle = vertices => {
    const crossings = [];
    vertices.forEach((a, i) => {
      const b = vertices[(i + 1) % 3];
      if ((a.value > 0) === (b.value > 0)) return;
      const t = a.value / (a.value - b.value), p = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      crossings.push(key(p)); points.set(key(p), p);
    });
    if (crossings.length !== 2 || crossings[0] === crossings[1]) return;
    const [a, b] = crossings;
    if (!joins.has(a)) joins.set(a, new Set());
    if (!joins.has(b)) joins.set(b, new Set());
    joins.get(a).add(b); joins.get(b).add(a);
  };
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const a = rows[y][x], b = rows[y][x + 1], c = rows[y + 1][x + 1], d = rows[y + 1][x];
    triangle([a, b, c]); triangle([a, c, d]);
  }
  const remaining = new Set(joins.keys()), contours = [];
  while (remaining.size) {
    const start = remaining.values().next().value, loop = [];
    let current = start, previous = null;
    do {
      remaining.delete(current); loop.push(points.get(current));
      const next = [...joins.get(current)].find(id => id !== previous);
      previous = current; current = next;
    } while (current && current !== start && remaining.has(current));
    if (current === start && loop.length > 3 && polygonArea(loop) > .0001) contours.push(loop);
  }
  return contours.sort((a, b) => polygonArea(b) - polygonArea(a));
}

function buildIslandClusters(regions, edges, seed) {
  const remaining = new Set(regions.filter(r => r.biome === 'islands').map(r => r.id)), clusters = [];
  while (remaining.size) {
    const regionIds = [], pending = [remaining.values().next().value];
    while (pending.length) {
      const id = pending.pop();
      if (!remaining.delete(id)) continue;
      regionIds.push(id);
      pending.push(...regions.find(r => r.id === id).neighbours.filter(n => remaining.has(n)));
    }
    const members = regions.filter(r => regionIds.includes(r.id));
    const cores = members.map(region => {
      const clearance = Math.min(...region.edgeIds.map(id => {
        const edge = edges.find(e => e.id === id);
        return segmentDistance(region.centre, edge.points[0], edge.points.at(-1));
      }));
      const radius = Math.max(.025, clearance * .85), phase = decorationRandom(seed, regions.indexOf(region) + 87000) * Math.PI * 2;
      return { regionId: region.id, centre: region.centre, radius, phase,
        foliage: Array.from({ length: 7 }, (_, i) => ({ x: region.centre.x + Math.cos(i * 2.4 + phase) * radius * .55 / ASPECT,
          y: region.centre.y + Math.sin(i * 2.4 + phase) * radius * .55 })) };
    });
    const bridges = edges.filter(e => e.regions.length === 2 && e.regions.every(id => regionIds.includes(id))).map(edge => {
      const [a, b] = edge.regions.map(id => cores.find(c => c.regionId === id));
      return { edgeId: edge.id, points: [a.centre, edge.points[Math.floor(edge.points.length / 2)], b.centre],
        width: Math.min(a.radius, b.radius) * .7 };
    });
    const shore = edges.filter(e => e.regions.filter(id => regionIds.includes(id)).length === 1);
    const allPoints = members.flatMap(r => r.outline);
    const bounds = { minX: Math.min(...allPoints.map(p => p.x)) - .02, maxX: Math.max(...allPoints.map(p => p.x)) + .02,
      minY: Math.min(...allPoints.map(p => p.y)) - .04, maxY: Math.max(...allPoints.map(p => p.y)) + .04 };
    const field = p => {
      let value = Math.max(...cores.map(core => {
        const angle = Math.atan2(p.y - core.centre.y, (p.x - core.centre.x) * ASPECT);
        return core.radius * (1 + .13 * Math.sin(angle * 3 + core.phase) + .07 * Math.sin(angle * 5 - core.phase)) - distance(p, core.centre);
      }), ...bridges.map(bridge => bridge.width - Math.min(segmentDistance(p, bridge.points[0], bridge.points[1]), segmentDistance(p, bridge.points[1], bridge.points[2]))));
      const clearance = Math.min(...shore.map(e => segmentDistance(p, e.points[0], e.points.at(-1))));
      if (!members.some(region => insidePolygon(p, region.outline))) return -Math.max(.00001, clearance);
      const coastInset = .008 * Math.min(1, ...bridges.map(b => distance(p, b.points[1]) / (b.width * 1.5)));
      value = Math.min(value, clearance - coastInset);
      return value;
    };
    const contours = islandContours(bounds, field, [...cores.map(c => c.centre), ...bridges.map(b => b.points[1])]);
    clusters.push({ id: `island-${clusters.length + 1}`, regionIds, cores, bridges, contours });
  }
  return clusters;
}

function buildSurroundings(regions, edges, features, seed, oceanSides) {
  const patches = edges.filter(e => e.regions.length === 1).map(edge => {
    const region = regions.find(r => r.id === edge.regions[0]);
    const kind = oceanSides.includes(edge.worldSide) ? 'ocean'
      : ({ mountains: 'highlands', forest: 'scrub', swamp: 'marsh', islands: 'marsh' })[region.biome] ?? 'badlands';
    return { edgeId: edge.id, regionId: region.id, kind, side: edge.worldSide,
      points: [edge.points[0], edge.points.at(-1)], biome: region.biome };
  });
  const anchors = [], continuations = [];
  const oceanVertices = new Set(edges.filter(e => e.regions.length === 1 && oceanSides.includes(e.worldSide)).flatMap(e => [e.a, e.b]));
  for (const feature of features) for (const end of [0, 1]) {
    const i = end ? feature.vertexIds.length - 1 : 0;
    const vertex = feature.vertexIds[i];
    if (oceanVertices.has(vertex)) continue;
    const edge = edges.find(e => e.id === feature.edgeIds[end ? feature.edgeIds.length - 1 : 0]);
    const ordered = edge.a === vertex ? edge.points : [...edge.points].reverse();
    const p = ordered[0], inner = ordered[Math.min(8, ordered.length - 1)];
    const length = distance(p, inner), dx = (p.x - inner.x) / length, dy = (p.y - inner.y) / length;
    const bend = (decorationRandom(seed, 95000 + anchors.length) - .5) * .2;
    const curve = Array.from({ length: 17 }, (_, j) => {
      const t = j / 16, across = bend * Math.sin(t * Math.PI / 2);
      return { x: p.x + dx * .22 * t - dy * across / ASPECT, y: p.y + dy * .22 * t + dx * ASPECT * across };
    });
    const points = [];
    for (const q of curve) {
      if (sampleSurroundings({ seed, oceanSides, patches, anchors: [] }, q).ocean > .45) break;
      points.push(q);
    }
    if (points.length < 2) continue;
    anchors.push({ type: feature.type, point: points.at(-1) });
    if (feature.type === 'river') continuations.push({ type: 'river', end: end ? 'end' : 'start', points });
  }
  return { seed, oceanSides, patches, anchors, continuations, bounds: { minX: -3.5, maxX: 6, minY: -3.5, maxY: 6 } };
}

const smooth = (a, b, value) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
function terrainNoise(seed, p, frequency, salt) {
  const x = p.x * ASPECT * frequency, y = p.y * frequency, ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(0, 1, x - ix), fy = smooth(0, 1, y - iy);
  const value = (a, b) => decorationRandom(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ salt);
  return lerp(lerp(value(ix, iy), value(ix + 1, iy), fx), lerp(value(ix, iy + 1), value(ix + 1, iy + 1), fx), fy);
}

// One continuous field for the non-playable world, not edge-shaped wedges.
// JSON geometry is the input; callers can sample or bake it without a sim tick.
export function sampleSurroundings(surroundings, p) {
  let seaDistance = Infinity, landDistance = Infinity, total = 0;
  const affinity = { highlands: 0, marsh: 0, scrub: 0, badlands: 0 };
  for (const patch of surroundings.patches) {
    const d = segmentDistance(p, ...patch.points);
    if (patch.kind === 'ocean') seaDistance = Math.min(seaDistance, d);
    else {
      landDistance = Math.min(landDistance, d);
      const weight = 1 / (.004 + d ** 3); total += weight; affinity[patch.kind] += weight;
    }
  }
  const n = terrainNoise(surroundings.seed, p, 1.2, 98432), fine = terrainNoise(surroundings.seed, p, 3.4, 56321);
  const directions = { north: .5 - p.y, east: p.x - .5, south: p.y - .5, west: .5 - p.x };
  const seaDirection = Math.max(...surroundings.oceanSides.map(side => directions[side]));
  const landDirection = Math.max(...WORLD_SIDES.filter(side => !surroundings.oceanSides.includes(side)).map(side => directions[side]));
  const farOcean = .5 + (seaDirection - landDirection) / (2 * (Math.abs(seaDirection) + Math.abs(landDirection) + .1));
  const nearest = Math.min(seaDistance, landDistance);
  const coastalOcean = landDistance / (seaDistance + landDistance || .0001);
  const ocean = lerp(coastalOcean, farOcean, smooth(.35, 1.5, nearest))
    + (n - .5) * .2 * smooth(.015, .18, nearest);
  const influence = 1 / (1 + landDistance ** 2 * 2);
  for (const kind of Object.keys(affinity)) affinity[kind] = affinity[kind] / (total || 1) * influence;
  let height = .3 + n * .35 + fine * .16 + affinity.highlands * .55;
  let wet = .08 + (1 - n) * .3 + affinity.marsh * .7;
  for (const anchor of surroundings.anchors) {
    const strength = Math.exp(-(distance(p, anchor.point) ** 2) / .09);
    if (anchor.type === 'ridge' || anchor.type === 'chasm') height += strength * .45;
    else wet += strength * .65;
  }
  const highlands = smooth(.52, .85, height), marsh = smooth(.32, .7, wet) * (1 - highlands);
  const scrub = Math.min(1 - highlands - marsh, (.12 + affinity.scrub * .7 + fine * .12) * (1 - highlands));
  return { ocean: Math.max(0, Math.min(1, ocean)), highlands, marsh, scrub, badlands: 1 - highlands - marsh - scrub };
}

function buildFootprint(state, sizeVariation, phases) {
  // Grow a connected patch of normal-sized cells. The silhouette advances and
  // retreats by whole regions; no displacement is applied to the partition.
  const sites = Array.from({ length: 96 }, (_, i) => ({
    x: -.6 + (i % 12 + .5 + (state.rngNextFloat() - .5) * .65) * 2.2 / 12,
    y: -.95 + (Math.floor(i / 12) + .5 + (state.rngNextFloat() - .5) * .65) * 2.9 / 8,
    weight: (state.rngNextFloat() - .5) * .045 * sizeVariation,
  }));
  const cells = sites.map((site, index) => {
    let polygon = [{ x: -2, y: -2 }, { x: 3, y: -2 }, { x: 3, y: 3 }, { x: -2, y: 3 }];
    for (const other of sites) {
      if (site === other) continue;
      polygon = clip(polygon, 2 * ASPECT ** 2 * (other.x - site.x), 2 * (other.y - site.y),
        ASPECT ** 2 * (other.x ** 2 - site.x ** 2) + other.y ** 2 - site.y ** 2 + site.weight - other.weight);
    }
    // Equal-sized cells can meet exactly at a clip plane: retain one junction.
    polygon = polygon.filter((p, i) => key(p) !== key(polygon[(i + polygon.length - 1) % polygon.length]));
    return { index, polygon, centre: centroid(polygon), neighbours: [] };
  });
  const owners = new Map();
  for (const cell of cells) for (let i = 0; i < cell.polygon.length; i++) {
    const id = edgeKey(key(cell.polygon[i]), key(cell.polygon[(i + 1) % cell.polygon.length]));
    if (owners.has(id)) {
      const other = cells[owners.get(id)]; cell.neighbours.push(other.index); other.neighbours.push(cell.index);
    } else owners.set(id, cell.index);
  }
  const score = cell => {
    const x = (cell.centre.x - .5) / .7, y = (cell.centre.y - .5) / .56;
    const angle = Math.atan2(y, x);
    const radius = 1 + .19 * Math.sin(angle * 3 + phases[0]) + .12 * Math.sin(angle * 5 + phases[1]);
    return Math.hypot(x, y) / radius;
  };
  const start = cells.reduce((best, cell) => score(cell) < score(best) ? cell : best).index;
  const selected = new Set([start]), frontier = new Set(cells[start].neighbours);
  const perimeter = cells.filter(cell => cell.polygon.some(p => p.x === -2 || p.x === 3 || p.y === -2 || p.y === 3)).map(cell => cell.index);
  const keepsExteriorConnected = candidate => {
    const seen = new Set(), pending = [...perimeter];
    while (pending.length) {
      const i = pending.pop();
      if (i === candidate || selected.has(i) || seen.has(i)) continue;
      seen.add(i); pending.push(...cells[i].neighbours);
    }
    return seen.size === cells.length - selected.size - 1;
  };
  while (selected.size < 20) {
    const next = [...frontier].sort((a, b) => score(cells[a]) - score(cells[b])).find(keepsExteriorConnected);
    selected.add(next); frontier.delete(next);
    cells[next].neighbours.forEach(i => { if (!selected.has(i)) frontier.add(i); });
  }
  return [...selected].sort((a, b) => a - b).map((index, i) => ({
    id: `R${String(i + 1).padStart(2, '0')}`, polygon: cells[index].polygon, centre: cells[index].centre,
    area: polygonArea(cells[index].polygon), neighbours: [],
  }));
}

export function generateMap({ seed = 1847, clustering = .45, sizeVariation = .6, roughness = .65, featureSet = 0 } = {}) {
  const state = { rng: { seed: Math.floor(seed) } }; attachRngHelpers(state);
  const world = createWorld(Math.floor(seed));
  const regions = buildFootprint(state, sizeVariation, world.shape.phases);
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
  for (const edge of edges.filter(e => e.regions.length === 1)) {
    const a = vertices.get(edge.a), b = vertices.get(edge.b);
    edge.worldSide = worldSide({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  for (const edge of edges.filter(e => e.regions.length === 2)) {
    const [a, b] = edge.regions;
    regions.find(r => r.id === a).neighbours.push(b); regions.find(r => r.id === b).neighbours.push(a);
  }
  const features = buildGeography(vertices, edges, FEATURE_SETS[featureSet], state, world.oceanSides);
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
  const islandClusters = buildIslandClusters(regions, edges, seed);
  const surroundings = buildSurroundings(regions, edges, features, seed, world.oceanSides);
  for (const edge of edges) edge.topologyPoints = [edge.points[0], edge.points.at(-1)];
  const totalArea = regions.reduce((sum, r) => sum + r.area, 0);
  const biomeAreas = Object.fromEntries(Object.keys(BIOMES).map(b => [b, regions.filter(r => r.biome === b).reduce((sum, r) => sum + r.area, 0) / totalArea]));
  const shared = edges.filter(e => e.regions.length === 2);
  const matching = shared.filter(e => regions.find(r => r.id === e.regions[0]).biome === regions.find(r => r.id === e.regions[1]).biome).length;
  return { seed, regions, edges, features, quota, biomeAreas, totalArea, matchingBorders: matching, sharedBorders: shared.length,
    islandClusters, surroundings, world: { oceanSides: world.oceanSides, shape: world.shape } };
}

// Stable decoration positions: independent of generation and presentation mode.
export function decorationRandom(seed, index) {
  let value = Math.imul((seed ^ index) >>> 0, 1597334677);
  value = Math.imul(value ^ value >>> 16, 2246822519);
  return ((value ^ value >>> 13) >>> 0) / 4294967296;
}
