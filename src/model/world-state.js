import { worldMapDefs } from "../defs/world/world-map-defs.js";
import {
  DEFAULT_REGION_STRUCTURE_CAPACITY_MAX,
  DEFAULT_REGION_STRUCTURE_CAPACITY_MIN,
  createInitialDetailedSettlementData,
} from "../defs/world/detailed-settlement-scenario.js";
import {
  DETAILED_PRACTICE_SLOT_COUNT,
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import { isDetailedPracticeTier } from "./detailed-practice-tiers.js";

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

// Region references are deliberately derived from immutable definition order so
// they remain stable without becoming save data or a second naming system.
export function getRegionReference(state, regionId) {
  const index = (getWorldDefinition(state)?.regions ?? []).findIndex(
    (region) => region?.id === regionId
  );
  return index >= 0 ? `R${String(index + 1).padStart(2, "0")}` : null;
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
  if (!Number.isInteger(region?.structureCapacity) || region.structureCapacity < 0) {
    errors.push(`${label} ${region?.id ?? "?"} has invalid structure capacity`);
  }
  if (typeof region?.detailedSettlementEnabled !== "boolean") {
    errors.push(`${label} ${region?.id ?? "?"} has invalid detailed-settlement toggle`);
  }
}

function validateDetailedSettlement(site, region, errors) {
  const settlement = site?.detailedState;
  if (!settlement || typeof settlement !== "object") {
    errors.push(`site ${site?.id ?? "?"} has no detailed state`);
    return;
  }
  if (!Array.isArray(settlement.practiceSlots)
      || settlement.practiceSlots.length !== DETAILED_PRACTICE_SLOT_COUNT) {
    errors.push(`site ${site.id} must have ${DETAILED_PRACTICE_SLOT_COUNT} practice slots`);
  } else {
    const practiceIds = new Set();
    for (const slot of settlement.practiceSlots) {
      if (slot && !detailedSettlementPracticeDefs[slot.practiceId]) {
        errors.push(`site ${site.id} has invalid practice ${slot.practiceId}`);
      }
      if (slot && !isDetailedPracticeTier(slot.tier)) {
        errors.push(`site ${site.id} has invalid practice tier ${slot.tier ?? "?"}`);
      }
      if (slot && practiceIds.has(slot.practiceId)) {
        errors.push(`site ${site.id} has duplicate practice ${slot.practiceId}`);
      }
      if (slot) practiceIds.add(slot.practiceId);
    }
  }
  if (!Array.isArray(settlement.structureSlots)
      || settlement.structureSlots.length !== region?.structureCapacity) {
    errors.push(`site ${site.id} structure slots do not match regional capacity`);
  } else {
    for (const slot of settlement.structureSlots) {
      if (slot && !settlementStructureDefs[slot.structureId]) {
        errors.push(`site ${site.id} has invalid structure ${slot.structureId}`);
      }
      if (slot && !isDetailedPracticeTier(slot.tier ?? "bronze")) {
        errors.push(`site ${site.id} has invalid structure tier ${slot.tier ?? "?"}`);
      }
    }
  }
  if (!Number.isFinite(settlement.storedFood) || settlement.storedFood < 0
      || !Number.isFinite(settlement.looseFood) || settlement.looseFood < 0) {
    errors.push(`site ${site.id} has invalid food`);
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

export function addWorldConnection(state, regionAId, regionBId) {
  const definition = getWorldDefinition(state);
  if (!definition || !isWorldConnectionCandidate(definition, regionAId, regionBId)) {
    return { ok: false, reason: "invalidConnection" };
  }
  const key = getWorldConnectionKey(regionAId, regionBId);
  const connections = Array.isArray(state?.world?.connections)
    ? state.world.connections
    : null;
  if (!connections) return { ok: false, reason: "missingConnections" };
  if (connections.some((entry) => getWorldConnectionKey(entry.regionAId, entry.regionBId) === key)) {
    return { ok: false, reason: "connectionExists" };
  }
  connections.push({ regionAId, regionBId });
  state.world.connections = canonicalizeWorldConnections(connections, definition);
  return { ok: true, connectionKey: key };
}

export function removeWorldConnection(state, regionAId, regionBId) {
  const definition = getWorldDefinition(state);
  const connections = Array.isArray(state?.world?.connections)
    ? state.world.connections
    : null;
  if (!definition || !connections) return { ok: false, reason: "missingConnections" };
  const key = getWorldConnectionKey(regionAId, regionBId);
  const index = connections.findIndex(
    (entry) => getWorldConnectionKey(entry.regionAId, entry.regionBId) === key
  );
  if (index < 0) return { ok: false, reason: "connectionMissing" };
  connections.splice(index, 1);
  state.world.connections = canonicalizeWorldConnections(connections, definition);
  return { ok: true, connectionKey: key };
}

export function establishDetailedSettlement(state, regionId, detailedState) {
  const definition = getWorldDefinition(state);
  const regionDef = definition?.regions?.find((entry) => entry.id === regionId);
  const region = getRegionState(state, regionId);
  if (!definition || !regionDef || !region) return { ok: false, reason: "invalidRegion" };
  if (region.controller !== "frontier" || region.detailedSettlementEnabled === true) {
    return { ok: false, reason: "regionUnavailable" };
  }
  if (!detailedState || typeof detailedState !== "object") {
    return { ok: false, reason: "invalidDetailedState" };
  }
  const nextState = cloneSerializable(detailedState);
  const capacity = Math.max(0, Math.floor(region.structureCapacity));
  nextState.structureSlots = Array.isArray(nextState.structureSlots)
    ? nextState.structureSlots.slice(0, capacity)
    : [];
  while (nextState.structureSlots.length < capacity) nextState.structureSlots.push(null);
  region.controller = "player";
  region.detailedSettlementEnabled = true;
  state.world.sites.push({
    id: `${regionId}-settlement`,
    regionId,
    simulationMode: "detailed",
    name: regionDef.name,
    detailedState: nextState,
  });
  canonicalizeWorldState(state);
  const validation = validateWorldState(state);
  if (!validation.ok) {
    state.world.sites = state.world.sites.filter((site) => site.regionId !== regionId);
    region.controller = "frontier";
    region.detailedSettlementEnabled = false;
    return { ok: false, reason: "invalidDetailedState", errors: validation.errors };
  }
  return { ok: true, siteId: `${regionId}-settlement` };
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
  for (const site of state?.world?.sites ?? []) {
    const region = regions.find((entry) => entry.id === site?.regionId);
    if (!region || region.detailedSettlementEnabled !== true) {
      errors.push(`site ${site?.id ?? "?"} is not enabled by its region`);
      continue;
    }
    validateDetailedSettlement(site, region, errors);
  }
  return { ok: errors.length === 0, errors };
}

export function canonicalizeWorldState(state) {
  const definition = getWorldDefinition(state);
  if (!definition || !Array.isArray(state?.world?.regions)) return;
  const order = new Map(definition.regions.map((entry, index) => [entry.id, index]));
  state.world.regions.sort((a, b) => (order.get(a?.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b?.id) ?? Number.MAX_SAFE_INTEGER));
  state.world.connections = canonicalizeWorldConnections(state.world.connections, definition);
  if (Array.isArray(state.world.sites)) {
    state.world.sites.sort((a, b) =>
      (order.get(a?.regionId) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(b?.regionId) ?? Number.MAX_SAFE_INTEGER));
    for (const site of state.world.sites) {
      for (const slot of site?.detailedState?.practiceSlots ?? []) {
        if (slot && slot.tier == null) slot.tier = "bronze";
      }
      for (const slot of site?.detailedState?.structureSlots ?? []) {
        if (slot && slot.tier == null) slot.tier = "bronze";
      }
    }
  }
}

export function createWorldState(
  definitionId,
  _legacyDetailedState = null,
  mechanicalDraft = null,
  rngNextInt = null
) {
  const definition = worldMapDefs[definitionId];
  const validation = validateWorldDefinition(definition);
  if (!validation.ok) throw new Error(`Invalid world definition ${definitionId}: ${validation.errors.join("; ")}`);
  if (mechanicalDraft?.starterRandomization?.kind === "twoRegionStarter" && typeof rngNextInt === "function") {
    const starterEdge = definition.connections[rngNextInt(0, definition.connections.length - 1)];
    const playerIds = new Set([starterEdge.regionAId, starterEdge.regionBId]);
    const remaining = definition.connections.filter((edge) => edge !== starterEdge);
    for (let i = remaining.length - 1; i > 0; i -= 1) {
      const j = rngNextInt(0, i); [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    const connections = [starterEdge, ...remaining.slice(0, 8)];
    mechanicalDraft = {
      ...mechanicalDraft,
      regions: definition.regions.map((entry) => ({
        id: entry.id, colour: entry.initialState.colour, structureCapacity: entry.initialState.structureCapacity,
        randomizeStructureCapacity: true, controller: playerIds.has(entry.id) ? "player" : "frontier",
        detailedSettlementEnabled: playerIds.has(entry.id),
        detailedState: playerIds.has(entry.id) ? (() => {
          const start = createInitialDetailedSettlementData("cedar-woods");
          start.practiceSlots = [{ practiceId: "forage", tier: "bronze", charge: 0, work: 0 }, null, null, null, null];
          start.structureSlots = [{ structureId: "granary", tier: "bronze" }, { structureId: "mudHouses", tier: "bronze" }];
          return start;
        })() : null,
      })),
      connections,
    };
  }
  const draftRegionById = new Map(
    (Array.isArray(mechanicalDraft?.regions) ? mechanicalDraft.regions : [])
      .map((entry) => [entry?.id, entry])
  );
  const regions = definition.regions.map((entry) => {
    const mechanics = draftRegionById.get(entry.id) ?? entry.initialState;
    const structureCapacity = mechanics.randomizeStructureCapacity === true
      && typeof rngNextInt === "function"
      ? rngNextInt(
        DEFAULT_REGION_STRUCTURE_CAPACITY_MIN,
        DEFAULT_REGION_STRUCTURE_CAPACITY_MAX
      )
      : mechanics.structureCapacity;
    return {
      id: entry.id,
      colour: mechanics.colour,
      controller: mechanics.controller,
      structureCapacity,
      detailedSettlementEnabled: mechanics.detailedSettlementEnabled === true,
    };
  });
  const connections = canonicalizeWorldConnections(
    mechanicalDraft?.connections ?? definition.connections,
    definition
  );
  const draftDetailedByRegion = new Map(
    (Array.isArray(mechanicalDraft?.regions) ? mechanicalDraft.regions : [])
      .filter((entry) => entry?.detailedSettlementEnabled === true && entry?.detailedState)
      .map((entry) => [entry.id, entry.detailedState])
  );
  const sites = definition.regions
    .filter((regionDef) => {
      const mechanics = regions.find((entry) => entry.id === regionDef.id);
      return mechanics?.detailedSettlementEnabled === true;
    })
    .map((regionDef) => {
      const authoredSite = definition.sites.find((entry) => entry.regionId === regionDef.id);
      const region = regions.find((entry) => entry.id === regionDef.id);
      const detailedState = cloneSerializable(
        draftDetailedByRegion.get(regionDef.id) ?? createInitialDetailedSettlementData(regionDef.id)
      );
      const capacity = Math.max(0, Math.floor(region.structureCapacity));
      detailedState.structureSlots = Array.isArray(detailedState.structureSlots)
        ? detailedState.structureSlots.slice(0, capacity)
        : [];
      while (detailedState.structureSlots.length < capacity) detailedState.structureSlots.push(null);
      return {
        ...(authoredSite ? cloneSerializable(authoredSite) : {
          id: `${regionDef.id}-settlement`,
          regionId: regionDef.id,
          simulationMode: "detailed",
          name: regionDef.name,
        }),
        detailedState,
      };
    });
  const world = { definitionId, regions, connections, sites };
  const stateValidation = validateWorldState({ world });
  if (!stateValidation.ok) {
    throw new Error(`Invalid world mechanics ${definitionId}: ${stateValidation.errors.join("; ")}`);
  }
  return world;
}
