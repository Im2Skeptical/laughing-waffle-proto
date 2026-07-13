import {
  worldFacilityDefs,
  worldMapDefs,
  worldTerrainDefs,
} from "../defs/world/world-map-defs.js";

function cloneSerializable(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPoint(point) {
  if (Array.isArray(point)) {
    return point.length >= 2 && point.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  }
  return Number.isFinite(point?.x) && point.x >= 0 && point.x <= 1 && Number.isFinite(point?.y) && point.y >= 0 && point.y <= 1;
}

const GEOMETRY_EPSILON = 1e-9;

function pointCoordinates(point) {
  return Array.isArray(point) ? point : [point?.x, point?.y];
}

function segmentsShareLength(aStart, aEnd, bStart, bEnd) {
  const [ax1, ay1] = pointCoordinates(aStart);
  const [ax2, ay2] = pointCoordinates(aEnd);
  const [bx1, by1] = pointCoordinates(bStart);
  const [bx2, by2] = pointCoordinates(bEnd);
  const adx = ax2 - ax1;
  const ady = ay2 - ay1;
  const bdx = bx2 - bx1;
  const bdy = by2 - by1;
  const cross = (x1, y1, x2, y2) => x1 * y2 - y1 * x2;
  if (Math.abs(cross(adx, ady, bdx, bdy)) > GEOMETRY_EPSILON) return false;
  if (Math.abs(cross(adx, ady, bx1 - ax1, by1 - ay1)) > GEOMETRY_EPSILON) return false;

  const useX = Math.abs(adx) >= Math.abs(ady);
  const [aMin, aMax] = useX
    ? [Math.min(ax1, ax2), Math.max(ax1, ax2)]
    : [Math.min(ay1, ay2), Math.max(ay1, ay2)];
  const [bMin, bMax] = useX
    ? [Math.min(bx1, bx2), Math.max(bx1, bx2)]
    : [Math.min(by1, by2), Math.max(by1, by2)];
  return Math.min(aMax, bMax) - Math.max(aMin, bMin) > GEOMETRY_EPSILON;
}

function polygonsShareBoundarySegment(polygonA, polygonB) {
  for (let aIndex = 0; aIndex < polygonA.length; aIndex += 1) {
    const aStart = polygonA[aIndex];
    const aEnd = polygonA[(aIndex + 1) % polygonA.length];
    for (let bIndex = 0; bIndex < polygonB.length; bIndex += 1) {
      const bStart = polygonB[bIndex];
      const bEnd = polygonB[(bIndex + 1) % polygonB.length];
      if (segmentsShareLength(aStart, aEnd, bStart, bEnd)) return true;
    }
  }
  return false;
}

export function validateWorldDefinition(definition, { requireConnected = false, requireMappedBorders = false } = {}) {
  const errors = [];
  if (!definition || typeof definition !== "object") return { ok: false, errors: ["definition is required"] };
  const regions = Array.isArray(definition.regions) ? definition.regions : [];
  const sites = Array.isArray(definition.sites) ? definition.sites : [];
  const connections = Array.isArray(definition.connections) ? definition.connections : [];
  const regionIds = new Set();
  const siteIds = new Set();
  const regionsById = new Map();

  for (const region of regions) {
    if (typeof region?.id !== "string" || !region.id) errors.push("region has no id");
    else if (regionIds.has(region.id)) errors.push(`duplicate region ${region.id}`);
    else {
      regionIds.add(region.id);
      regionsById.set(region.id, region);
    }
    if (!worldTerrainDefs[region?.terrainId]) errors.push(`unknown terrain ${region?.terrainId ?? "?"}`);
    if (!Array.isArray(region?.polygon) || region.polygon.length < 3 || !region.polygon.every(isPoint)) {
      errors.push(`invalid polygon ${region?.id ?? "?"}`);
    }
    if (!isPoint(region?.display?.labelPoint) || !isPoint(region?.display?.sitePoint)) {
      errors.push(`invalid display points ${region?.id ?? "?"}`);
    }
  }

  for (const site of sites) {
    if (typeof site?.id !== "string" || !site.id) errors.push("site has no id");
    else if (siteIds.has(site.id)) errors.push(`duplicate site ${site.id}`);
    else siteIds.add(site.id);
    if (!regionIds.has(site?.regionId)) errors.push(`site ${site?.id ?? "?"} references unknown region`);
    if (site?.simulationMode !== "summary" && site?.simulationMode !== "detailed") {
      errors.push(`site ${site?.id ?? "?"} has invalid simulation mode`);
    }
    for (const facilityId of Array.isArray(site?.facilityDefIds) ? site.facilityDefIds : []) {
      if (!worldFacilityDefs[facilityId]) errors.push(`site ${site.id} references unknown facility ${facilityId}`);
    }
  }

  const pairKeys = new Set();
  const neighbors = new Map(Array.from(regionIds, (id) => [id, new Set()]));
  for (const edge of connections) {
    const a = edge?.regionAId;
    const b = edge?.regionBId;
    if (!regionIds.has(a) || !regionIds.has(b)) errors.push(`connection ${a ?? "?"}-${b ?? "?"} has unknown region`);
    if (a === b) errors.push(`connection ${a ?? "?"} is self-referential`);
    const key = [a, b].sort().join("|");
    if (pairKeys.has(key)) errors.push(`duplicate connection ${key}`);
    pairKeys.add(key);
    if (edge?.physicalRelation !== "border" && edge?.physicalRelation !== "separated") errors.push(`connection ${key} has invalid physical relation`);
    const regionA = regionsById.get(a);
    const regionB = regionsById.get(b);
    const validPolygons = Array.isArray(regionA?.polygon) && Array.isArray(regionB?.polygon);
    const sharesBoundary = validPolygons && polygonsShareBoundarySegment(regionA.polygon, regionB.polygon);
    if (edge?.physicalRelation === "border" && validPolygons && !sharesBoundary) {
      errors.push(`border connection ${key} has no shared polygon boundary`);
    }
    if (edge?.physicalRelation === "separated" && sharesBoundary) {
      errors.push(`separated connection ${key} has a shared polygon boundary`);
    }
    const routeModes = new Set();
    if (!Array.isArray(edge?.routes) || edge.routes.length === 0) errors.push(`connection ${key} has no routes`);
    for (const route of Array.isArray(edge?.routes) ? edge.routes : []) {
      if (!["land", "river", "sea"].includes(route?.mode)) errors.push(`connection ${key} has invalid route mode`);
      if (routeModes.has(route?.mode)) errors.push(`connection ${key} repeats route mode ${route?.mode}`);
      routeModes.add(route?.mode);
      if (!Number.isFinite(route?.weight) || route.weight <= 0) errors.push(`connection ${key} has invalid weight`);
    }
    if (!Array.isArray(edge?.display?.path) || edge.display.path.length < 2 || !edge.display.path.every(isPoint)) {
      errors.push(`connection ${key} has invalid display path`);
    }
    neighbors.get(a)?.add(b);
    neighbors.get(b)?.add(a);
  }

  if (requireMappedBorders) {
    const regionList = Array.from(regionsById.values());
    for (let aIndex = 0; aIndex < regionList.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < regionList.length; bIndex += 1) {
        const regionA = regionList[aIndex];
        const regionB = regionList[bIndex];
        if (!Array.isArray(regionA.polygon) || !Array.isArray(regionB.polygon)) continue;
        if (!polygonsShareBoundarySegment(regionA.polygon, regionB.polygon)) continue;
        const key = [regionA.id, regionB.id].sort().join("|");
        if (!pairKeys.has(key)) errors.push(`shared polygon boundary ${key} has no connection`);
      }
    }
  }

  if (requireConnected && regionIds.size > 0) {
    const visited = new Set();
    const pending = [regionIds.values().next().value];
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      for (const neighbor of neighbors.get(id) ?? []) pending.push(neighbor);
    }
    if (visited.size !== regionIds.size) errors.push("region graph is disconnected");
  }
  return { ok: errors.length === 0, errors };
}

export function getWorldDefinition(state) {
  const id = state?.world?.definitionId;
  return typeof id === "string" ? worldMapDefs[id] ?? null : null;
}

export function getRegionDefinition(state, regionId) {
  return getWorldDefinition(state)?.regions?.find((region) => region?.id === regionId) ?? null;
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

export function createWorldState(definitionId, detailedState) {
  const definition = worldMapDefs[definitionId];
  const validation = validateWorldDefinition(definition, { requireConnected: true, requireMappedBorders: true });
  if (!validation.ok) throw new Error(`Invalid world definition ${definitionId}: ${validation.errors.join("; ")}`);
  const sites = definition.sites.map((site) => ({
    ...cloneSerializable(site),
    ...(site.simulationMode === "detailed" ? { detailedState } : {}),
  }));
  return { definitionId, sites };
}

export function getWorldFacilityDef(facilityId) {
  return worldFacilityDefs[facilityId] ?? null;
}

export function getWorldTerrainDef(terrainId) {
  return worldTerrainDefs[terrainId] ?? null;
}
