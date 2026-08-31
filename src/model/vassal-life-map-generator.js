import {
  VASSAL_LIFE_MAP_GRAPH_SCHEMA_VERSION,
  VASSAL_NORMAL_NODE_FAMILY_IDS,
} from "../defs/gamepieces/vassal-life-map-defs.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const BANDS = Object.freeze(["early", "mid", "late"]);
const DEFAULT_WEIGHTS = Object.freeze({
  early: Object.freeze([5, 5, 5, 1, 1, 1, 0]),
  mid: Object.freeze([3, 3, 3, 3, 3, 3, 1]),
  late: Object.freeze([1, 2, 2, 4, 4, 4, 5]),
});

export const VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION = 1;

export function createAuthoredVassalLifeMapGeneratorConfig() {
  return {
    schemaVersion: VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION,
    laneCount: 6,
    normalDepthCount: 11,
    routeCount: 6,
    earlyDepthCount: 4,
    midDepthCount: 4,
    layoutSmoothing: 0.5,
    minimumNodeGap: 0.12,
    nonRepeatFamilyIds: ["crisis"],
    weights: Object.fromEntries(BANDS.map((band) => [
      band,
      Object.fromEntries(VASSAL_NORMAL_NODE_FAMILY_IDS.map((familyId, index) => [
        familyId, DEFAULT_WEIGHTS[band][index],
      ])),
    ])),
  };
}

export function canonicalizeVassalLifeMapGeneratorConfig(value) {
  const fallback = createAuthoredVassalLifeMapGeneratorConfig();
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schemaVersion: VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION,
    laneCount: Number.isFinite(source.laneCount) ? Math.floor(source.laneCount) : fallback.laneCount,
    normalDepthCount: Number.isFinite(source.normalDepthCount)
      ? Math.floor(source.normalDepthCount) : fallback.normalDepthCount,
    routeCount: Number.isFinite(source.routeCount) ? Math.floor(source.routeCount) : fallback.routeCount,
    earlyDepthCount: Number.isFinite(source.earlyDepthCount)
      ? Math.floor(source.earlyDepthCount) : fallback.earlyDepthCount,
    midDepthCount: Number.isFinite(source.midDepthCount)
      ? Math.floor(source.midDepthCount) : fallback.midDepthCount,
    layoutSmoothing: Number.isFinite(source.layoutSmoothing)
      ? Number(source.layoutSmoothing) : fallback.layoutSmoothing,
    minimumNodeGap: Number.isFinite(source.minimumNodeGap)
      ? Number(source.minimumNodeGap) : fallback.minimumNodeGap,
    nonRepeatFamilyIds: [...new Set(Array.isArray(source.nonRepeatFamilyIds)
      ? source.nonRepeatFamilyIds.filter((id) => VASSAL_NORMAL_NODE_FAMILY_IDS.includes(id))
      : fallback.nonRepeatFamilyIds)],
    weights: Object.fromEntries(BANDS.map((band) => [
      band,
      Object.fromEntries(VASSAL_NORMAL_NODE_FAMILY_IDS.map((familyId) => [
        familyId,
        Number.isFinite(source?.weights?.[band]?.[familyId])
          ? Number(source.weights[band][familyId]) : fallback.weights[band][familyId],
      ])),
    ])),
  };
}

export function validateVassalLifeMapGeneratorConfig(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["draft: expected an object"] };
  }
  if (value.schemaVersion !== VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION}`);
  }
  const integers = [
    ["laneCount", 2, 12], ["normalDepthCount", 3, 20], ["routeCount", 2, 24],
    ["earlyDepthCount", 1, 18], ["midDepthCount", 1, 18],
  ];
  for (const [key, min, max] of integers) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) {
      errors.push(`${key}: expected an integer from ${min} to ${max}`);
    }
  }
  if (Number.isInteger(value.routeCount) && Number.isInteger(value.laneCount)
      && value.routeCount > value.laneCount * 2) {
    errors.push("routeCount: cannot exceed twice the lane count");
  }
  if (Number.isInteger(value.earlyDepthCount) && Number.isInteger(value.midDepthCount)
      && Number.isInteger(value.normalDepthCount)
      && value.earlyDepthCount + value.midDepthCount >= value.normalDepthCount) {
    errors.push("depth bands: Early + Mid must leave at least one Late depth");
  }
  if (!Number.isFinite(value.layoutSmoothing)
      || value.layoutSmoothing < 0 || value.layoutSmoothing > 1) {
    errors.push("layoutSmoothing: expected 0 to 1");
  }
  if (!Number.isFinite(value.minimumNodeGap)
      || value.minimumNodeGap < 0.02 || value.minimumNodeGap > 0.3) {
    errors.push("minimumNodeGap: expected 0.02 to 0.3");
  } else if (Number.isInteger(value.laneCount)
      && (value.laneCount - 1) * value.minimumNodeGap > 0.84 + 1e-9) {
    errors.push("minimumNodeGap: too large for the lane count");
  }
  if (!Array.isArray(value.nonRepeatFamilyIds)
      || value.nonRepeatFamilyIds.some((id) => !VASSAL_NORMAL_NODE_FAMILY_IDS.includes(id))
      || new Set(value.nonRepeatFamilyIds).size !== value.nonRepeatFamilyIds.length) {
    errors.push("nonRepeatFamilyIds: expected unique normal family ids");
  }
  for (const band of BANDS) {
    const weights = value?.weights?.[band];
    if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
      errors.push(`weights.${band}: expected an object`);
      continue;
    }
    const positive = [];
    for (const familyId of VASSAL_NORMAL_NODE_FAMILY_IDS) {
      const weight = weights[familyId];
      if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
        errors.push(`weights.${band}.${familyId}: expected 0 to 100`);
      } else if (weight > 0) positive.push(familyId);
    }
    if (positive.length === 0) errors.push(`weights.${band}: at least one family must be positive`);
    if (band === "early" && positive.length < 2) {
      errors.push("weights.early: at least two families must be positive for the opening choice");
    }
    if (positive.length > 0 && positive.every((id) => value.nonRepeatFamilyIds?.includes(id))) {
      errors.push(`weights.${band}: at least one positive family must allow repetition`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function edgeKey(depth, fromLane, toLane) {
  return `${depth}:${fromLane}>${toLane}`;
}

function crossesExisting(existingEdges, depth, fromLane, toLane) {
  for (const edge of existingEdges) {
    if (edge.depth !== depth) continue;
    if ((edge.fromLane < fromLane && edge.toLane > toLane)
        || (edge.fromLane > fromLane && edge.toLane < toLane)) return true;
  }
  return false;
}

function shuffled(rng, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = rng.nextInt(0, index);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function findPath(config, existingEdges, startLane, endLane, rng = null) {
  const path = [startLane];
  function visit(depth, lane) {
    if (depth === config.normalDepthCount - 1) return lane === endLane;
    const remaining = config.normalDepthCount - depth - 2;
    let candidates = [lane - 1, lane, lane + 1].filter((nextLane) =>
      nextLane >= 0 && nextLane < config.laneCount
      && Math.abs(endLane - nextLane) <= remaining
      && !crossesExisting(existingEdges, depth, lane, nextLane));
    candidates = rng ? shuffled(rng, candidates) : candidates;
    for (const nextLane of candidates) {
      path.push(nextLane);
      if (visit(depth + 1, nextLane)) return true;
      path.pop();
    }
    return false;
  }
  return visit(0, startLane) ? path : null;
}

function randomRoute(config, existingEdges, routeIndex, firstStartLane, rng) {
  const starts = Array.from({ length: config.laneCount }, (_, lane) => lane)
    .filter((lane) => routeIndex !== 1 || lane !== firstStartLane);
  const startLane = starts[rng.nextInt(0, starts.length - 1)];
  const endLane = rng.nextInt(0, config.laneCount - 1);
  return findPath(config, existingEdges, startLane, endLane, rng);
}

function fallbackRoute(config, existingEdges, routeIndex, firstStartLane, seen) {
  for (let startLane = 0; startLane < config.laneCount; startLane += 1) {
    if (routeIndex === 1 && startLane === firstStartLane) continue;
    for (let endLane = 0; endLane < config.laneCount; endLane += 1) {
      const path = findPath(config, existingEdges, startLane, endLane);
      if (path && !seen.has(path.join(","))) return path;
    }
  }
  return null;
}

function rollFamily(rng, weights, excluded = new Set()) {
  const candidates = VASSAL_NORMAL_NODE_FAMILY_IDS.filter((id) =>
    weights[id] > 0 && !excluded.has(id));
  const total = candidates.reduce((sum, id) => sum + weights[id], 0);
  let roll = rng.nextFloat() * total;
  for (const id of candidates) {
    roll -= weights[id];
    if (roll < 0) return id;
  }
  return candidates.at(-1);
}

function bandForDepth(config, depth) {
  if (depth < config.earlyDepthCount) return "early";
  if (depth < config.earlyDepthCount + config.midDepthCount) return "mid";
  return "late";
}

function dedupeEquivalentChoices(nodes, edges, entryNodeIds) {
  let activeEdges = [...edges];
  const signatures = new Map();
  const maxDepth = Math.max(...nodes.map((node) => node.depth));
  for (let depth = maxDepth; depth >= 0; depth -= 1) {
    for (const node of nodes.filter((entry) => entry.depth === depth)) {
      const seen = new Set();
      activeEdges = activeEdges.filter((edge) => {
        if (edge.fromNodeId !== node.id) return true;
        const signature = signatures.get(edge.toNodeId) ?? edge.toNodeId;
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      });
      const childSignatures = activeEdges.filter((edge) => edge.fromNodeId === node.id)
        .map((edge) => signatures.get(edge.toNodeId) ?? edge.toNodeId).sort();
      signatures.set(node.id, `${node.family}[${childSignatures.join("|")}]`);
    }
  }
  const retainedEntries = [];
  const entrySignatures = new Set();
  for (const id of entryNodeIds) {
    const signature = signatures.get(id) ?? id;
    if (entrySignatures.has(signature)) continue;
    entrySignatures.add(signature);
    retainedEntries.push(id);
  }
  const reachable = new Set(retainedEntries);
  const queue = [...retainedEntries];
  while (queue.length) {
    const id = queue.shift();
    for (const edge of activeEdges.filter((entry) => entry.fromNodeId === id)) {
      if (reachable.has(edge.toNodeId)) continue;
      reachable.add(edge.toNodeId);
      queue.push(edge.toNodeId);
    }
  }
  return {
    nodes: nodes.filter((node) => reachable.has(node.id)),
    edges: activeEdges.filter((edge) => reachable.has(edge.fromNodeId) && reachable.has(edge.toNodeId)),
    entryNodeIds: retainedEntries.filter((id) => reachable.has(id)),
  };
}

function enforceDepthGap(nodes, depth, gap) {
  const entries = nodes.filter((node) => node.depth === depth).sort((a, b) => a.lane - b.lane);
  for (let index = 1; index < entries.length; index += 1) {
    entries[index]._y = Math.max(entries[index]._y, entries[index - 1]._y + gap);
  }
  if (entries.at(-1)?._y > 0.92) {
    const shift = entries.at(-1)._y - 0.92;
    entries.forEach((node) => { node._y -= shift; });
  }
  for (let index = entries.length - 2; index >= 0; index -= 1) {
    entries[index]._y = Math.min(entries[index]._y, entries[index + 1]._y - gap);
  }
  if (entries[0]?._y < 0.08) {
    const shift = 0.08 - entries[0]._y;
    entries.forEach((node) => { node._y += shift; });
  }
}

function applyLayout(config, nodes, edges) {
  const parents = new Map(nodes.map((node) => [node.id, []]));
  const children = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    parents.get(edge.toNodeId)?.push(edge.fromNodeId);
    children.get(edge.fromNodeId)?.push(edge.toNodeId);
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    node._baseY = node.family === "legacy"
      ? 0.5 : 0.08 + 0.84 * node.lane / (config.laneCount - 1);
    node._y = node._baseY;
  }
  const maxDepth = config.normalDepthCount;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    for (const node of nodes.filter((entry) => entry.depth === depth)) {
      const linked = parents.get(node.id).map((id) => nodeById.get(id)?._y).filter(Number.isFinite);
      if (linked.length) {
        const mean = linked.reduce((sum, value) => sum + value, 0) / linked.length;
        node._y = (1 - config.layoutSmoothing) * node._baseY + config.layoutSmoothing * mean;
      }
    }
    enforceDepthGap(nodes, depth, config.minimumNodeGap);
  }
  for (let depth = maxDepth - 1; depth >= 0; depth -= 1) {
    for (const node of nodes.filter((entry) => entry.depth === depth)) {
      const linked = children.get(node.id).map((id) => nodeById.get(id)?._y).filter(Number.isFinite);
      if (linked.length) {
        const mean = linked.reduce((sum, value) => sum + value, 0) / linked.length;
        node._y = (1 - config.layoutSmoothing) * node._y + config.layoutSmoothing * mean;
      }
    }
    enforceDepthGap(nodes, depth, config.minimumNodeGap);
  }
  return nodes.map((node) => {
    const { _baseY, _y, ...clean } = node;
    return {
      ...clean,
      position: {
        x: Math.round((node.depth / config.normalDepthCount) * 1000000) / 1000000,
        y: Math.round(_y * 1000000) / 1000000,
      },
    };
  });
}

export function generateVassalLifeMap(rawConfig, rng, {
  graphId = "generated-life-map", generationSeed = null,
} = {}) {
  const config = canonicalizeVassalLifeMapGeneratorConfig(rawConfig);
  const validation = validateVassalLifeMapGeneratorConfig(config);
  if (!validation.ok) return { ok: false, reason: "invalidConfiguration", errors: validation.errors };
  if (!rng || typeof rng.nextInt !== "function" || typeof rng.nextFloat !== "function") {
    return { ok: false, reason: "invalidRng", errors: ["rng: nextInt and nextFloat are required"] };
  }
  const routeTraces = [];
  const seen = new Set();
  const existingEdges = [];
  const existingEdgeKeys = new Set();
  let firstStartLane = null;
  for (let routeIndex = 0; routeIndex < config.routeCount; routeIndex += 1) {
    let path = null;
    for (let attempt = 0; attempt < 96 && !path; attempt += 1) {
      const candidate = randomRoute(config, existingEdges, routeIndex, firstStartLane, rng);
      if (candidate && !seen.has(candidate.join(","))) path = candidate;
    }
    path ??= fallbackRoute(config, existingEdges, routeIndex, firstStartLane, seen);
    if (!path) {
      return { ok: false, reason: "routesImpossible", errors: [`routeCount: could not draw route ${routeIndex + 1}`] };
    }
    if (routeIndex === 0) firstStartLane = path[0];
    seen.add(path.join(","));
    routeTraces.push(path);
    for (let depth = 0; depth < path.length - 1; depth += 1) {
      const key = edgeKey(depth, path[depth], path[depth + 1]);
      if (existingEdgeKeys.has(key)) continue;
      existingEdgeKeys.add(key);
      existingEdges.push({ depth, fromLane: path[depth], toLane: path[depth + 1] });
    }
  }

  const occupied = new Set(routeTraces.flatMap((path) =>
    path.map((lane, depth) => `${depth}:${lane}`)));
  const nodeId = (depth, lane) => `life-d${String(depth + 1).padStart(2, "0")}-r${String(lane + 1).padStart(2, "0")}`;
  let nodes = [...occupied].map((key) => {
    const [depth, lane] = key.split(":").map(Number);
    return { id: nodeId(depth, lane), depth, lane, band: bandForDepth(config, depth), family: null };
  }).sort((a, b) => a.depth - b.depth || a.lane - b.lane);
  let edges = existingEdges.map((edge) => ({
    fromNodeId: nodeId(edge.depth, edge.fromLane),
    toNodeId: nodeId(edge.depth + 1, edge.toLane),
  }));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) incoming.get(edge.toNodeId)?.push(edge.fromNodeId);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const entryNodes = nodes.filter((node) => node.depth === 0);
  for (const node of nodes) {
    const excluded = new Set();
    for (const parentId of incoming.get(node.id) ?? []) {
      const family = nodeById.get(parentId)?.family;
      if (config.nonRepeatFamilyIds.includes(family)) excluded.add(family);
    }
    if (node.depth === 0 && entryNodes.indexOf(node) === 1 && entryNodes[0]?.family) {
      excluded.add(entryNodes[0].family);
    }
    node.family = rollFamily(rng, config.weights[node.band], excluded);
  }
  const bossNodeId = `life-d${String(config.normalDepthCount + 1).padStart(2, "0")}-boss`;
  nodes.push({
    id: bossNodeId, depth: config.normalDepthCount, lane: Math.floor((config.laneCount - 1) / 2),
    band: "legacy", family: "legacy",
  });
  for (const node of nodes.filter((entry) => entry.depth === config.normalDepthCount - 1)) {
    edges.push({ fromNodeId: node.id, toNodeId: bossNodeId });
  }
  const deduped = dedupeEquivalentChoices(
    nodes,
    edges,
    nodes.filter((node) => node.depth === 0).map((node) => node.id)
  );
  nodes = applyLayout(config, deduped.nodes, deduped.edges);
  edges = deduped.edges.sort((a, b) =>
    a.fromNodeId.localeCompare(b.fromNodeId) || a.toNodeId.localeCompare(b.toNodeId));
  return {
    ok: true,
    graph: {
      schemaVersion: VASSAL_LIFE_MAP_GRAPH_SCHEMA_VERSION,
      graphId,
      generationSeed,
      generatorConfig: clone(config),
      nodes,
      edges,
      entryNodeIds: deduped.entryNodeIds,
      bossNodeId,
    },
    routeTraces: clone(routeTraces),
  };
}

export function validateVassalLifeMapGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    return { ok: false, errors: ["graph: expected an object"] };
  }
  if (graph.schemaVersion !== VASSAL_LIFE_MAP_GRAPH_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${VASSAL_LIFE_MAP_GRAPH_SCHEMA_VERSION}`);
  }
  if (typeof graph.graphId !== "string" || !graph.graphId) errors.push("graphId: expected a string");
  if (!Number.isInteger(graph.generationSeed)) errors.push("generationSeed: expected an integer");
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)
      || !Array.isArray(graph.entryNodeIds)) {
    errors.push("graph: nodes, edges, and entryNodeIds must be arrays");
    return { ok: false, errors };
  }
  const ids = new Set();
  const nodeById = new Map();
  for (const [index, node] of graph.nodes.entries()) {
    if (typeof node?.id !== "string" || ids.has(node.id)) errors.push(`nodes[${index}].id: invalid or duplicate`);
    ids.add(node?.id);
    nodeById.set(node?.id, node);
    if (!Number.isInteger(node?.depth) || !Number.isInteger(node?.lane)) errors.push(`nodes[${index}]: invalid grid position`);
    if (![...VASSAL_NORMAL_NODE_FAMILY_IDS, "legacy"].includes(node?.family)) errors.push(`nodes[${index}].family: invalid`);
    if (!Number.isFinite(node?.position?.x) || node.position.x < 0 || node.position.x > 1
        || !Number.isFinite(node?.position?.y) || node.position.y < 0 || node.position.y > 1) {
      errors.push(`nodes[${index}].position: invalid`);
    }
  }
  const edgeKeys = new Set();
  for (const [index, edge] of graph.edges.entries()) {
    if (!ids.has(edge?.fromNodeId) || !ids.has(edge?.toNodeId)) errors.push(`edges[${index}]: unknown endpoint`);
    const key = `${edge?.fromNodeId}>${edge?.toNodeId}`;
    if (edgeKeys.has(key)) errors.push(`edges[${index}]: duplicate edge`);
    edgeKeys.add(key);
    const from = nodeById.get(edge?.fromNodeId);
    const to = nodeById.get(edge?.toNodeId);
    if (from && to && to.depth !== from.depth + 1) errors.push(`edges[${index}]: expected next-depth edge`);
  }
  if (graph.entryNodeIds.length < 2 || graph.entryNodeIds.some((id) => !ids.has(id))) {
    errors.push("entryNodeIds: expected at least two known nodes");
  }
  if (!ids.has(graph.bossNodeId)
      || graph.nodes.find((node) => node.id === graph.bossNodeId)?.family !== "legacy") {
    errors.push("bossNodeId: expected the Legacy node");
  }
  const configValidation = validateVassalLifeMapGeneratorConfig(graph.generatorConfig);
  errors.push(...configValidation.errors.map((error) => `generatorConfig.${error}`));
  const config = graph.generatorConfig;
  const boss = nodeById.get(graph.bossNodeId);
  if (boss && boss.depth !== config?.normalDepthCount) errors.push("bossNodeId: invalid depth");
  if (graph.nodes.filter((node) => node.family === "legacy").length !== 1) {
    errors.push("nodes: expected exactly one Legacy node");
  }
  for (const entryId of graph.entryNodeIds) {
    if (nodeById.get(entryId)?.depth !== 0) errors.push("entryNodeIds: entries must be at depth zero");
  }
  for (const [index, edge] of graph.edges.entries()) {
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    if (!from || !to) continue;
    if (to.id !== graph.bossNodeId && Math.abs(to.lane - from.lane) > 1) {
      errors.push(`edges[${index}]: normal edges must use shared or adjacent lanes`);
    }
    if (config?.nonRepeatFamilyIds?.includes(from.family) && from.family === to.family) {
      errors.push(`edges[${index}]: prohibited sequential ${from.family}`);
    }
  }
  if (graph.edges.some((edge) => edge.fromNodeId === graph.bossNodeId)) {
    errors.push("bossNodeId: boss must be terminal");
  }
  for (const node of graph.nodes.filter((entry) => entry.depth === (config?.normalDepthCount ?? 0) - 1)) {
    if (!edgeKeys.has(`${node.id}>${graph.bossNodeId}`)) errors.push(`${node.id}: final node must connect to boss`);
  }
  const reachable = new Set(graph.entryNodeIds);
  const queue = [...graph.entryNodeIds];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of graph.edges.filter((entry) => entry.fromNodeId === current)) {
      if (!reachable.has(edge.toNodeId)) { reachable.add(edge.toNodeId); queue.push(edge.toNodeId); }
    }
  }
  if (graph.nodes.some((node) => !reachable.has(node.id))) errors.push("nodes: every node must be entry-reachable");
  for (let depth = 0; depth < (config?.normalDepthCount ?? 0) - 1; depth += 1) {
    const depthEdges = graph.edges.filter((edge) => nodeById.get(edge.fromNodeId)?.depth === depth);
    for (let a = 0; a < depthEdges.length; a += 1) {
      for (let b = a + 1; b < depthEdges.length; b += 1) {
        const a0 = nodeById.get(depthEdges[a].fromNodeId)?.lane;
        const a1 = nodeById.get(depthEdges[a].toNodeId)?.lane;
        const b0 = nodeById.get(depthEdges[b].fromNodeId)?.lane;
        const b1 = nodeById.get(depthEdges[b].toNodeId)?.lane;
        if ((a0 < b0 && a1 > b1) || (a0 > b0 && a1 < b1)) {
          errors.push(`edges: crossing edges at depth ${depth}`);
          a = depthEdges.length;
          break;
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
