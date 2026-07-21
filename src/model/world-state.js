import { regionalPracticeDefs } from "../defs/gamepieces/regional-practice-defs.js";
import { worldMapDefs } from "../defs/world/world-map-defs.js";

export const REGION_COLOURS = Object.freeze(["red", "blue", "green", "black"]);
export const REGION_CONTROLLERS = Object.freeze([
  "player",
  "frontier",
  "external-a",
  "external-b",
]);

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPoint(point) {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function getWorldConnectionKey(regionAId, regionBId) {
  return [String(regionAId), String(regionBId)].sort().join("|");
}

function getPolygonEdgeKey(vertexAId, vertexBId) {
  return [String(vertexAId), String(vertexBId)].sort().join("|");
}

function getRegionPolygonEdgeKeys(region) {
  const vertexIds = Array.isArray(region?.polygonVertexIds)
    ? region.polygonVertexIds
    : [];
  if (vertexIds.length < 2) return new Set();
  return new Set(vertexIds.map((vertexId, index) => getPolygonEdgeKey(
    vertexId,
    vertexIds[(index + 1) % vertexIds.length]
  )));
}

export function getWorldConnectionCandidates(definition) {
  const regions = Array.isArray(definition?.regions) ? definition.regions : [];
  const edgeKeysByRegionId = new Map(regions.map((region) => [
    region.id,
    getRegionPolygonEdgeKeys(region),
  ]));
  const candidates = [];
  for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
    const left = regions[leftIndex];
    const leftEdges = edgeKeysByRegionId.get(left.id);
    for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
      const right = regions[rightIndex];
      const rightEdges = edgeKeysByRegionId.get(right.id);
      if ([...leftEdges].some((edgeKey) => rightEdges.has(edgeKey))) {
        candidates.push({ regionAId: left.id, regionBId: right.id });
      }
    }
  }
  return candidates;
}

export function isWorldConnectionCandidate(definition, regionAId, regionBId) {
  if (regionAId === regionBId) return false;
  const key = getWorldConnectionKey(regionAId, regionBId);
  return getWorldConnectionCandidates(definition).some((entry) =>
    getWorldConnectionKey(entry.regionAId, entry.regionBId) === key
  );
}

export function canonicalizeWorldConnections(connections, definition) {
  const order = new Map((definition?.regions ?? []).map((entry, index) => [entry.id, index]));
  return (Array.isArray(connections) ? connections : [])
    .map((entry) => {
      const a = entry?.regionAId;
      const b = entry?.regionBId;
      return (order.get(a) ?? Number.MAX_SAFE_INTEGER) <= (order.get(b) ?? Number.MAX_SAFE_INTEGER)
        ? { regionAId: a, regionBId: b }
        : { regionAId: b, regionBId: a };
    })
    .sort((left, right) => {
      const leftA = order.get(left.regionAId) ?? Number.MAX_SAFE_INTEGER;
      const rightA = order.get(right.regionAId) ?? Number.MAX_SAFE_INTEGER;
      if (leftA !== rightA) return leftA - rightA;
      return (order.get(left.regionBId) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(right.regionBId) ?? Number.MAX_SAFE_INTEGER);
    });
}

function validateConnections(
  connections,
  regionById,
  errors,
  label = "connection",
  definition = null
) {
  if (!Array.isArray(connections)) {
    errors.push(`invalid ${label} list`);
    return;
  }
  const connectionKeys = new Set();
  for (const entry of connections) {
    const a = entry?.regionAId;
    const b = entry?.regionBId;
    if (!regionById.has(a) || !regionById.has(b) || a === b) {
      errors.push(`invalid ${label} ${a ?? "?"}-${b ?? "?"}`);
      continue;
    }
    if (definition && !isWorldConnectionCandidate(definition, a, b)) {
      errors.push(`non-adjacent ${label} ${a}-${b}`);
    }
    const key = getWorldConnectionKey(a, b);
    if (connectionKeys.has(key)) errors.push(`duplicate ${label} ${key}`);
    connectionKeys.add(key);
  }
}

function validateRegionMechanics(region, errors, label = "region") {
  if (!REGION_COLOURS.includes(region?.colour)) {
    errors.push(`${label} ${region?.id ?? "?"} has invalid colour`);
  }
  if (!REGION_CONTROLLERS.includes(region?.controller)) {
    errors.push(`${label} ${region?.id ?? "?"} has invalid controller`);
  }
  if (!Number.isInteger(region?.capacity) || region.capacity < 0) {
    errors.push(`${label} ${region?.id ?? "?"} has invalid capacity`);
  }
  if (!Array.isArray(region?.installedPracticeIds)) {
    errors.push(`${label} ${region?.id ?? "?"} has invalid installed practices`);
    return;
  }
  if (region.installedPracticeIds.length > region.capacity) {
    errors.push(`${label} ${region?.id ?? "?"} exceeds capacity`);
  }
  for (const practiceId of region.installedPracticeIds) {
    if (!regionalPracticeDefs[practiceId]) {
      errors.push(`${label} ${region?.id ?? "?"} has invalid practice ${practiceId}`);
    }
  }
}

export function validateWorldDefinition(definition, { requireConnected = false } = {}) {
  const errors = [];
  if (!definition || typeof definition !== "object") {
    return { ok: false, errors: ["missing world definition"] };
  }

  const vertices = Array.isArray(definition?.geometry?.vertices)
    ? definition.geometry.vertices
    : [];
  const regions = Array.isArray(definition.regions) ? definition.regions : [];
  const connections = Array.isArray(definition.connections) ? definition.connections : [];
  const sites = Array.isArray(definition.sites) ? definition.sites : [];
  const vertexById = new Map();
  const regionById = new Map();

  for (const entry of vertices) {
    if (typeof entry?.id !== "string" || !entry.id || !isPoint(entry)) {
      errors.push("invalid world vertex");
      continue;
    }
    if (vertexById.has(entry.id)) errors.push(`duplicate vertex ${entry.id}`);
    vertexById.set(entry.id, entry);
  }

  for (const entry of regions) {
    if (typeof entry?.id !== "string" || !entry.id) {
      errors.push("region has no id");
      continue;
    }
    if (regionById.has(entry.id)) errors.push(`duplicate region ${entry.id}`);
    regionById.set(entry.id, entry);
    if (!Array.isArray(entry.polygonVertexIds) || entry.polygonVertexIds.length < 3) {
      errors.push(`region ${entry.id} has invalid polygon`);
    } else {
      for (const vertexId of entry.polygonVertexIds) {
        if (!vertexById.has(vertexId)) errors.push(`region ${entry.id} references unknown vertex ${vertexId}`);
      }
    }
    if (!isPoint(entry?.display?.labelPoint) || !isPoint(entry?.display?.sitePoint)) {
      errors.push(`region ${entry.id} has invalid display points`);
    }
    validateRegionMechanics({ id: entry.id, ...entry.initialState }, errors, "initial region");
  }

  const neighbors = new Map(Array.from(regionById.keys(), (id) => [id, new Set()]));
  validateConnections(connections, regionById, errors, "connection", definition);
  for (const entry of connections) {
    const a = entry?.regionAId;
    const b = entry?.regionBId;
    if (!regionById.has(a) || !regionById.has(b) || a === b) {
      errors.push(`invalid connection ${a ?? "?"}-${b ?? "?"}`);
      continue;
    }
    neighbors.get(a)?.add(b);
    neighbors.get(b)?.add(a);
  }

  const siteIds = new Set();
  for (const site of sites) {
    if (typeof site?.id !== "string" || !site.id) errors.push("site has no id");
    else if (siteIds.has(site.id)) errors.push(`duplicate site ${site.id}`);
    else siteIds.add(site.id);
    if (!regionById.has(site?.regionId)) errors.push(`site ${site?.id ?? "?"} has invalid region`);
    if (site?.simulationMode !== "detailed") {
      errors.push(`site ${site?.id ?? "?"} has unsupported simulation mode`);
    }
  }

  const coastlineIds = definition?.mapContext?.coastlineVertexIds;
  if (!Array.isArray(coastlineIds) || coastlineIds.length < 2 || coastlineIds.some((id) => !vertexById.has(id))) {
    errors.push("invalid decorative coastline");
  }
  if (!Array.isArray(definition?.mapContext?.oceanBoundaryPoints)
      || !definition.mapContext.oceanBoundaryPoints.every(isPoint)) {
    errors.push("invalid decorative ocean boundary");
  }

  if (requireConnected && regionById.size > 0) {
    const start = regionById.keys().next().value;
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      for (const next of neighbors.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    if (visited.size !== regionById.size) errors.push("region graph is disconnected");
  }

  return { ok: errors.length === 0, errors };
}

export function getWorldDefinition(state) {
  const id = state?.world?.definitionId;
  return typeof id === "string" ? worldMapDefs[id] ?? null : null;
}

export function getWorldVertex(definition, vertexId) {
  return definition?.geometry?.vertices?.find((entry) => entry?.id === vertexId) ?? null;
}

export function getRegionDefinition(state, regionId) {
  return getWorldDefinition(state)?.regions?.find((region) => region?.id === regionId) ?? null;
}

export function getRegionPolygon(definition, regionOrId) {
  const region = typeof regionOrId === "string"
    ? definition?.regions?.find((entry) => entry?.id === regionOrId)
    : regionOrId;
  if (!region) return [];
  return region.polygonVertexIds
    .map((vertexId) => getWorldVertex(definition, vertexId))
    .filter(Boolean);
}

export function getRegionState(state, regionId) {
  return state?.world?.regions?.find((region) => region?.id === regionId) ?? null;
}

export function getConnectedRegionIds(state, regionId) {
  const out = [];
  for (const entry of state?.world?.connections ?? []) {
    if (entry.regionAId === regionId) out.push(entry.regionBId);
    else if (entry.regionBId === regionId) out.push(entry.regionAId);
  }
  return out;
}

export function getSiteById(state, siteId) {
  return state?.world?.sites?.find((site) => site?.id === siteId) ?? null;
}

export function getSitesInRegion(state, regionId) {
  return Array.isArray(state?.world?.sites)
    ? state.world.sites.filter((site) => site?.regionId === regionId)
    : [];
}

export function getDetailedSiteState(state, siteId) {
  const site = getSiteById(state, siteId);
  return site?.simulationMode === "detailed" && site?.detailedState ? site.detailedState : null;
}

export function getPrimaryDetailedSiteId(state) {
  const capitalSiteId = state?.civilization?.capitalSiteId;
  if (getDetailedSiteState(state, capitalSiteId)) return capitalSiteId;
  return state?.world?.sites?.find((site) => site?.simulationMode === "detailed")?.id ?? null;
}

export function getPrimaryDetailedSiteState(state) {
  return getDetailedSiteState(state, getPrimaryDetailedSiteId(state));
}

export function validateWorldState(state) {
  const errors = [];
  const definition = getWorldDefinition(state);
  if (!definition) return { ok: false, errors: ["unknown world definition"] };
  const regions = Array.isArray(state?.world?.regions) ? state.world.regions : [];
  const expectedIds = new Set(definition.regions.map((entry) => entry.id));
  const seen = new Set();
  for (const region of regions) {
    if (!expectedIds.has(region?.id)) errors.push(`unknown region state ${region?.id ?? "?"}`);
    else if (seen.has(region.id)) errors.push(`duplicate region state ${region.id}`);
    else seen.add(region.id);
    validateRegionMechanics(region, errors, "region state");
  }
  for (const id of expectedIds) {
    if (!seen.has(id)) errors.push(`missing region state ${id}`);
  }
  validateConnections(state?.world?.connections, new Map(
    definition.regions.map((entry) => [entry.id, entry])
  ), errors, "world-state connection", definition);
  return { ok: errors.length === 0, errors };
}

export function canonicalizeWorldState(state) {
  const definition = getWorldDefinition(state);
  if (!definition || !Array.isArray(state?.world?.regions)) return;
  const order = new Map(definition.regions.map((entry, index) => [entry.id, index]));
  state.world.regions.sort((a, b) => (order.get(a?.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b?.id) ?? Number.MAX_SAFE_INTEGER));
  state.world.connections = canonicalizeWorldConnections(state.world.connections, definition);
}

export function createWorldState(definitionId, detailedState, mechanicalDraft = null) {
  const definition = worldMapDefs[definitionId];
  const validation = validateWorldDefinition(definition);
  if (!validation.ok) throw new Error(`Invalid world definition ${definitionId}: ${validation.errors.join("; ")}`);
  const draftRegionById = new Map(
    (Array.isArray(mechanicalDraft?.regions) ? mechanicalDraft.regions : [])
      .map((entry) => [entry?.id, entry])
  );
  const regions = definition.regions.map((entry) => {
    const mechanics = draftRegionById.get(entry.id) ?? entry.initialState;
    return { id: entry.id, ...cloneSerializable(mechanics) };
  });
  const connections = canonicalizeWorldConnections(
    mechanicalDraft?.connections ?? definition.connections,
    definition
  );
  const sites = definition.sites.map((site) => ({
    ...cloneSerializable(site),
    ...(site.simulationMode === "detailed" ? { detailedState } : {}),
  }));
  const world = { definitionId, regions, connections, sites };
  const stateValidation = validateWorldState({ world });
  if (!stateValidation.ok) {
    throw new Error(`Invalid world mechanics ${definitionId}: ${stateValidation.errors.join("; ")}`);
  }
  return world;
}
