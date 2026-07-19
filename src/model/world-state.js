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

function pairKey(regionAId, regionBId) {
  return [String(regionAId), String(regionBId)].sort().join("|");
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

  const connectionKeys = new Set();
  const neighbors = new Map(Array.from(regionById.keys(), (id) => [id, new Set()]));
  for (const entry of connections) {
    const a = entry?.regionAId;
    const b = entry?.regionBId;
    if (!regionById.has(a) || !regionById.has(b) || a === b) {
      errors.push(`invalid connection ${a ?? "?"}-${b ?? "?"}`);
      continue;
    }
    const key = pairKey(a, b);
    if (connectionKeys.has(key)) errors.push(`duplicate connection ${key}`);
    connectionKeys.add(key);
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
  const definition = getWorldDefinition(state);
  if (!definition) return [];
  const out = [];
  for (const entry of definition.connections ?? []) {
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
  return { ok: errors.length === 0, errors };
}

export function canonicalizeWorldState(state) {
  const definition = getWorldDefinition(state);
  if (!definition || !Array.isArray(state?.world?.regions)) return;
  const order = new Map(definition.regions.map((entry, index) => [entry.id, index]));
  state.world.regions.sort((a, b) => (order.get(a?.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b?.id) ?? Number.MAX_SAFE_INTEGER));
}

export function createWorldState(definitionId, detailedState) {
  const definition = worldMapDefs[definitionId];
  const validation = validateWorldDefinition(definition, { requireConnected: true });
  if (!validation.ok) throw new Error(`Invalid world definition ${definitionId}: ${validation.errors.join("; ")}`);
  const regions = definition.regions.map((entry) => ({
    id: entry.id,
    ...cloneSerializable(entry.initialState),
  }));
  const sites = definition.sites.map((site) => ({
    ...cloneSerializable(site),
    ...(site.simulationMode === "detailed" ? { detailedState } : {}),
  }));
  return { definitionId, regions, sites };
}
