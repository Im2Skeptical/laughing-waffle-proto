import {
  worldFacilityDefs,
  worldMapDefs,
  worldTerrainDefs,
} from "../defs/world/world-map-defs.js";

function cloneSerializable(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPoint(point) {
  return Number.isFinite(point?.x)
    && point.x >= 0
    && point.x <= 1
    && Number.isFinite(point?.y)
    && point.y >= 0
    && point.y <= 1;
}

function edgeKey(a, b) {
  return [a, b].sort().join("|");
}

function pairKey(a, b) {
  return [a, b].sort().join("|");
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function getFeatureSegmentVertexIds(definition, segment) {
  const border = definition?.borders?.find((entry) => entry?.id === segment?.borderId);
  if (!border) return null;
  const fromIndex = border.vertexIds.indexOf(segment.fromVertexId);
  const toIndex = border.vertexIds.indexOf(segment.toVertexId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
  const low = Math.min(fromIndex, toIndex);
  const high = Math.max(fromIndex, toIndex);
  const path = border.vertexIds.slice(low, high + 1);
  return fromIndex < toIndex ? path : path.reverse();
}

export function getGeographicFeatureVertexIds(definition, featureId) {
  const feature = definition?.geographicFeatures?.find((entry) => entry?.id === featureId);
  if (!feature) return [];
  const path = [];
  for (const segment of feature.segments ?? []) {
    const segmentPath = getFeatureSegmentVertexIds(definition, segment);
    if (!segmentPath) return [];
    path.push(...(path.length ? segmentPath.slice(1) : segmentPath));
  }
  return path;
}

export function getWorldVertex(definition, vertexId) {
  return definition?.geometry?.vertices?.find((entry) => entry?.id === vertexId) ?? null;
}

export function getRegionPolygon(definition, regionOrId) {
  const region = typeof regionOrId === "string"
    ? definition?.regions?.find((entry) => entry?.id === regionOrId)
    : regionOrId;
  if (!region) return [];
  return (region.polygonVertexIds ?? [])
    .map((vertexId) => getWorldVertex(definition, vertexId))
    .filter(Boolean)
    .map(({ x, y }) => [x, y]);
}

export function getFeaturePath(definition, featureId, fromVertexId = null, toVertexId = null) {
  const ids = getGeographicFeatureVertexIds(definition, featureId);
  if (!fromVertexId || !toVertexId) return ids.map((id) => getWorldVertex(definition, id)).filter(Boolean);
  const fromIndex = ids.indexOf(fromVertexId);
  const toIndex = ids.indexOf(toVertexId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [];
  const low = Math.min(fromIndex, toIndex);
  const high = Math.max(fromIndex, toIndex);
  const path = ids.slice(low, high + 1);
  if (fromIndex > toIndex) path.reverse();
  return path.map((id) => getWorldVertex(definition, id)).filter(Boolean);
}

export function validateWorldDefinition(definition, { requireConnected = false } = {}) {
  const errors = [];
  if (!definition || typeof definition !== "object") return { ok: false, errors: ["definition is required"] };

  const vertices = Array.isArray(definition?.geometry?.vertices) ? definition.geometry.vertices : [];
  const regions = Array.isArray(definition.regions) ? definition.regions : [];
  const sites = Array.isArray(definition.sites) ? definition.sites : [];
  const borders = Array.isArray(definition.borders) ? definition.borders : [];
  const features = Array.isArray(definition.geographicFeatures) ? definition.geographicFeatures : [];
  const nodes = Array.isArray(definition.transportNodes) ? definition.transportNodes : [];
  const links = Array.isArray(definition.transportLinks) ? definition.transportLinks : [];
  const vertexById = new Map();
  const regionById = new Map();
  const siteById = new Map();

  for (const entry of vertices) {
    if (typeof entry?.id !== "string" || !entry.id) errors.push("vertex has no id");
    else if (vertexById.has(entry.id)) errors.push(`duplicate vertex ${entry.id}`);
    else vertexById.set(entry.id, entry);
    if (!isPoint(entry)) errors.push(`invalid vertex ${entry?.id ?? "?"}`);
  }

  const edgeOwners = new Map();
  const geometryEdges = new Map();
  for (const entry of regions) {
    if (typeof entry?.id !== "string" || !entry.id) errors.push("region has no id");
    else if (regionById.has(entry.id)) errors.push(`duplicate region ${entry.id}`);
    else regionById.set(entry.id, entry);
    if (!worldTerrainDefs[entry?.terrainId]) errors.push(`unknown terrain ${entry?.terrainId ?? "?"}`);
    if (!Number.isFinite(entry?.landCover?.forest) || entry.landCover.forest < 0 || entry.landCover.forest > 1) {
      errors.push(`invalid forest coverage ${entry?.id ?? "?"}`);
    }
    if (!isPoint(entry?.display?.labelPoint) || !isPoint(entry?.display?.sitePoint)) {
      errors.push(`invalid display points ${entry?.id ?? "?"}`);
    }
    const polygonIds = Array.isArray(entry?.polygonVertexIds) ? entry.polygonVertexIds : [];
    if (polygonIds.length < 3) errors.push(`invalid polygon ${entry?.id ?? "?"}`);
    for (const vertexId of polygonIds) {
      if (!vertexById.has(vertexId)) errors.push(`region ${entry?.id ?? "?"} references unknown vertex ${vertexId}`);
    }
    for (let index = 0; index < polygonIds.length; index += 1) {
      const a = polygonIds[index];
      const b = polygonIds[(index + 1) % polygonIds.length];
      if (a === b) errors.push(`region ${entry?.id ?? "?"} repeats adjacent vertex ${a}`);
      const key = edgeKey(a, b);
      if (!edgeOwners.has(key)) edgeOwners.set(key, []);
      edgeOwners.get(key).push(entry.id);
      geometryEdges.set(key, { a, b });
    }

    for (let aIndex = 0; aIndex < polygonIds.length; aIndex += 1) {
      const aNext = (aIndex + 1) % polygonIds.length;
      for (let bIndex = aIndex + 1; bIndex < polygonIds.length; bIndex += 1) {
        const bNext = (bIndex + 1) % polygonIds.length;
        if (aIndex === bIndex || aNext === bIndex || bNext === aIndex) continue;
        const a = vertexById.get(polygonIds[aIndex]);
        const b = vertexById.get(polygonIds[aNext]);
        const c = vertexById.get(polygonIds[bIndex]);
        const d = vertexById.get(polygonIds[bNext]);
        if (a && b && c && d && segmentsCross(a, b, c, d)) errors.push(`self-intersecting polygon ${entry.id}`);
      }
    }
  }

  for (const [key, owners] of edgeOwners) {
    if (owners.length > 2) errors.push(`mesh edge ${key} belongs to more than two regions`);
  }

  const uniqueEdges = Array.from(geometryEdges.values());
  for (let aIndex = 0; aIndex < uniqueEdges.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < uniqueEdges.length; bIndex += 1) {
      const first = uniqueEdges[aIndex];
      const second = uniqueEdges[bIndex];
      if ([first.a, first.b].some((id) => id === second.a || id === second.b)) continue;
      const a = vertexById.get(first.a);
      const b = vertexById.get(first.b);
      const c = vertexById.get(second.a);
      const d = vertexById.get(second.b);
      if (a && b && c && d && segmentsCross(a, b, c, d)) errors.push(`mesh edges ${edgeKey(first.a, first.b)} and ${edgeKey(second.a, second.b)} cross`);
    }
  }

  for (const site of sites) {
    if (typeof site?.id !== "string" || !site.id) errors.push("site has no id");
    else if (siteById.has(site.id)) errors.push(`duplicate site ${site.id}`);
    else siteById.set(site.id, site);
    if (!regionById.has(site?.regionId)) errors.push(`site ${site?.id ?? "?"} references unknown region`);
    if (site?.simulationMode !== "summary" && site?.simulationMode !== "detailed") errors.push(`site ${site?.id ?? "?"} has invalid simulation mode`);
    for (const facilityId of Array.isArray(site?.facilityDefIds) ? site.facilityDefIds : []) {
      if (!worldFacilityDefs[facilityId]) errors.push(`site ${site.id} references unknown facility ${facilityId}`);
    }
  }

  const borderById = new Map();
  const coveredSharedEdges = new Set();
  const regionNeighbors = new Map(Array.from(regionById.keys(), (id) => [id, new Set()]));
  for (const entry of borders) {
    if (typeof entry?.id !== "string" || !entry.id) errors.push("border has no id");
    else if (borderById.has(entry.id)) errors.push(`duplicate border ${entry.id}`);
    else borderById.set(entry.id, entry);
    if (!regionById.has(entry?.regionAId) || !regionById.has(entry?.regionBId) || entry.regionAId === entry.regionBId) {
      errors.push(`border ${entry?.id ?? "?"} has invalid regions`);
    }
    if (!["open","ford","bridge","ferry","pass","blocked"].includes(entry?.crossingKind)) errors.push(`border ${entry?.id ?? "?"} has invalid crossing`);
    if (!Array.isArray(entry?.vertexIds) || entry.vertexIds.length < 2) errors.push(`border ${entry?.id ?? "?"} has invalid vertices`);
    for (let index = 0; index < (entry?.vertexIds?.length ?? 0) - 1; index += 1) {
      const key = edgeKey(entry.vertexIds[index], entry.vertexIds[index + 1]);
      const owners = edgeOwners.get(key) ?? [];
      const expected = pairKey(entry.regionAId, entry.regionBId);
      if (owners.length !== 2 || pairKey(owners[0], owners[1]) !== expected) errors.push(`border ${entry.id} does not follow shared mesh edge ${key}`);
      if (coveredSharedEdges.has(key)) errors.push(`shared mesh edge ${key} is covered by multiple borders`);
      coveredSharedEdges.add(key);
    }
    regionNeighbors.get(entry?.regionAId)?.add(entry?.regionBId);
    regionNeighbors.get(entry?.regionBId)?.add(entry?.regionAId);
  }
  for (const [key, owners] of edgeOwners) {
    if (owners.length === 2 && !coveredSharedEdges.has(key)) errors.push(`shared mesh edge ${key} has no border`);
  }

  const featureById = new Map();
  for (const feature of features) {
    if (typeof feature?.id !== "string" || !feature.id) errors.push("feature has no id");
    else if (featureById.has(feature.id)) errors.push(`duplicate feature ${feature.id}`);
    else featureById.set(feature.id, feature);
    if (!["river","mountainRange","forestBelt"].includes(feature?.type)) errors.push(`feature ${feature?.id ?? "?"} has invalid type`);
    if (!Array.isArray(feature?.segments) || feature.segments.length === 0) errors.push(`feature ${feature?.id ?? "?"} has no segments`);
    let previousEnd = null;
    for (const segment of feature?.segments ?? []) {
      const segmentPath = getFeatureSegmentVertexIds(definition, segment);
      if (!borderById.has(segment?.borderId) || !segmentPath) errors.push(`feature ${feature.id} has invalid segment ${segment?.borderId ?? "?"}`);
      if (previousEnd && previousEnd !== segment?.fromVertexId) errors.push(`feature ${feature.id} is discontinuous at ${segment?.borderId ?? "?"}`);
      previousEnd = segment?.toVertexId ?? null;
    }
  }
  const coastlineVertices = new Set();
  for (const [key, owners] of edgeOwners) {
    if (owners.length !== 1) continue;
    for (const id of key.split("|")) coastlineVertices.add(id);
  }
  for (const feature of features.filter((entry) => entry?.type === "river")) {
    const path = getGeographicFeatureVertexIds(definition, feature.id);
    if (new Set(path).size !== path.length) errors.push(`river ${feature.id} contains a cycle`);
    if (feature.outflow) {
      const target = featureById.get(feature.outflow.featureId);
      if (target?.type !== "river" || !getGeographicFeatureVertexIds(definition, target.id).includes(feature.outflow.vertexId) || path.at(-1) !== feature.outflow.vertexId) {
        errors.push(`river ${feature.id} has invalid outflow`);
      }
    } else if (path.length && !coastlineVertices.has(path.at(-1))) {
      errors.push(`river ${feature.id} has no coastal outlet`);
    }
  }
  for (const feature of features.filter((entry) => entry?.type === "river")) {
    const visited = new Set();
    let current = feature;
    while (current?.outflow?.featureId) {
      if (visited.has(current.id)) {
        errors.push(`river ${feature.id} has a cyclic outflow`);
        break;
      }
      visited.add(current.id);
      current = featureById.get(current.outflow.featureId);
    }
  }

  const nodeById = new Map();
  for (const node of nodes) {
    if (typeof node?.id !== "string" || !node.id) errors.push("transport node has no id");
    else if (nodeById.has(node.id)) errors.push(`duplicate transport node ${node.id}`);
    else nodeById.set(node.id, node);
    if (!regionById.has(node?.regionId) || !isPoint(node?.point)) errors.push(`transport node ${node?.id ?? "?"} is invalid`);
    if (node?.siteId && siteById.get(node.siteId)?.regionId !== node.regionId) errors.push(`transport node ${node.id} has invalid site`);
  }

  const linkIds = new Set();
  const transportNeighbors = new Map(Array.from(nodeById.keys(), (id) => [id, new Set()]));
  for (const link of links) {
    if (typeof link?.id !== "string" || !link.id) errors.push("transport link has no id");
    else if (linkIds.has(link.id)) errors.push(`duplicate transport link ${link.id}`);
    else linkIds.add(link.id);
    if (!nodeById.has(link?.nodeAId) || !nodeById.has(link?.nodeBId) || link.nodeAId === link.nodeBId) errors.push(`transport link ${link?.id ?? "?"} has invalid nodes`);
    if (!["land","river","sea"].includes(link?.mode)) errors.push(`transport link ${link?.id ?? "?"} has invalid mode`);
    if (link?.mode === "land" && !borderById.has(link?.borderId)) errors.push(`land link ${link?.id ?? "?"} has invalid border`);
    if (link?.mode === "river") {
      const feature = featureById.get(link?.featureId);
      if (feature?.type !== "river" || getFeaturePath(definition, link.featureId, link.fromVertexId, link.toVertexId).length < 2) errors.push(`river link ${link?.id ?? "?"} has invalid feature path`);
    }
    if (link?.mode !== "river" && (!Array.isArray(link?.path) || link.path.length < 2 || !link.path.every(isPoint))) errors.push(`transport link ${link?.id ?? "?"} has invalid path`);
    transportNeighbors.get(link?.nodeAId)?.add(link?.nodeBId);
    if (link?.bidirectional) transportNeighbors.get(link?.nodeBId)?.add(link?.nodeAId);
    const regionAId = nodeById.get(link?.nodeAId)?.regionId;
    const regionBId = nodeById.get(link?.nodeBId)?.regionId;
    regionNeighbors.get(regionAId)?.add(regionBId);
    if (link?.bidirectional) regionNeighbors.get(regionBId)?.add(regionAId);
  }

  if (requireConnected && regionById.size > 0) {
    const visitGraph = (neighbors, message) => {
      const ids = Array.from(neighbors.keys());
      const visited = new Set();
      const pending = ids.length ? [ids[0]] : [];
      while (pending.length) {
        const id = pending.pop();
        if (visited.has(id)) continue;
        visited.add(id);
        for (const neighbor of neighbors.get(id) ?? []) pending.push(neighbor);
      }
      if (visited.size !== ids.length) errors.push(message);
    };
    visitGraph(regionNeighbors, "region graph is disconnected");
    visitGraph(transportNeighbors, "transport graph is disconnected");
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
  const validation = validateWorldDefinition(definition, { requireConnected: true });
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
