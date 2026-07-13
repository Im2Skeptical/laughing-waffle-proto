import {
  getFeaturePath,
  getWorldTerrainDef,
} from "./world-state.js";

function pointDistanceKm(definition, a, b) {
  const extent = definition?.geometry?.extentKm ?? { width: 1, height: 1 };
  return Math.hypot(
    (b.x - a.x) * extent.width,
    (b.y - a.y) * extent.height
  );
}

function pathDistanceKm(definition, points) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += pointDistanceKm(definition, points[index], points[index + 1]);
  }
  return total;
}

function roundedDistance(value) {
  return Math.max(0, Math.round(value));
}

function getNode(definition, nodeId) {
  return definition?.transportNodes?.find((entry) => entry?.id === nodeId) ?? null;
}

function getRegion(definition, regionId) {
  return definition?.regions?.find((entry) => entry?.id === regionId) ?? null;
}

function getBorder(definition, borderId) {
  return definition?.borders?.find((entry) => entry?.id === borderId) ?? null;
}

function featureTypesForBorder(definition, borderId) {
  return (definition?.geographicFeatures ?? [])
    .filter((feature) => feature?.segments?.some((segment) => segment?.borderId === borderId))
    .map((feature) => feature.type);
}

function effectiveLandSpeed(definition, region) {
  const terrain = getWorldTerrainDef(region?.terrainId);
  const base = Math.max(1, terrain?.landSpeedKmPerDay ?? 20);
  const forestCoverage = Math.max(0, Math.min(1, region?.landCover?.forest ?? 0));
  const slowdown = Math.max(0, Math.min(0.8, definition?.travelRules?.forestSlowdown ?? 0));
  return Math.max(1, base * (1 - forestCoverage * slowdown));
}

export function getTransportLinkPath(definition, link, reverse = false) {
  let path;
  if (link?.mode === "river") {
    const featurePath = getFeaturePath(definition, link.featureId, link.fromVertexId, link.toVertexId);
    const nodeA = getNode(definition, link.nodeAId);
    const nodeB = getNode(definition, link.nodeBId);
    path = [nodeA?.point, ...featurePath, nodeB?.point]
      .filter(Boolean)
      .filter((point, index, points) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  } else {
    path = (link?.path ?? []).map((point) => ({ x: point.x, y: point.y }));
  }
  if (reverse) path = [...path].reverse();
  return path;
}

export function calculateTransportLinkTravel(definition, link, reverse = false) {
  if (!definition || !link) return null;
  const rules = definition.travelRules ?? {};
  const nodeA = getNode(definition, reverse ? link.nodeBId : link.nodeAId);
  const nodeB = getNode(definition, reverse ? link.nodeAId : link.nodeBId);
  const path = getTransportLinkPath(definition, link, reverse);
  if (!nodeA || !nodeB || path.length < 2) return null;

  if (link.mode === "river") {
    const speed = Math.max(1, rules.riverKmPerDay ?? 1);
    const distanceKm = pathDistanceKm(definition, path);
    return {
      days: Math.max(1, Math.ceil(distanceKm / speed)),
      distanceKm: roundedDistance(distanceKm),
      mode: "river",
      modifiers: [],
      path,
    };
  }

  if (link.mode === "sea") {
    const distanceKm = pathDistanceKm(definition, path);
    const speed = Math.max(1, rules.seaKmPerDay ?? 1);
    return {
      days: Math.max(1, Math.ceil(distanceKm / speed)),
      distanceKm: roundedDistance(distanceKm),
      mode: "sea",
      modifiers: [],
      path,
    };
  }

  const midpointIndex = Math.floor((path.length - 1) / 2);
  const firstPath = path.slice(0, midpointIndex + 1);
  const secondPath = path.slice(midpointIndex);
  const regionA = getRegion(definition, nodeA.regionId);
  const regionB = getRegion(definition, nodeB.regionId);
  const firstDistance = pathDistanceKm(definition, firstPath);
  const secondDistance = pathDistanceKm(definition, secondPath);
  const distanceKm = firstDistance + secondDistance;
  let rawDays = firstDistance / effectiveLandSpeed(definition, regionA)
    + secondDistance / effectiveLandSpeed(definition, regionB);
  const border = getBorder(definition, link.borderId);
  const modifiers = [];
  const crossingPenalty = Math.max(0, rules?.crossingPenaltyDays?.[border?.crossingKind] ?? 0);
  if (crossingPenalty > 0) {
    rawDays += crossingPenalty;
    modifiers.push({ kind: "crossing", label: border.crossingKind, days: crossingPenalty });
  }
  if (featureTypesForBorder(definition, link.borderId).includes("forestBelt")) {
    const forestPenalty = Math.max(0, rules.forestBeltPenaltyDays ?? 0);
    rawDays += forestPenalty;
    modifiers.push({ kind: "forestBelt", label: "Forested border", days: forestPenalty });
  }
  return {
    days: Math.max(1, Math.ceil(rawDays)),
    distanceKm: roundedDistance(distanceKm),
    mode: "land",
    modifiers,
    path,
  };
}

function compareCandidate(a, b) {
  if (a.days !== b.days) return a.days - b.days;
  if (a.legCount !== b.legCount) return a.legCount - b.legCount;
  return a.pathKey < b.pathKey ? -1 : a.pathKey > b.pathKey ? 1 : 0;
}

function resolveEndpointNode(definition, { nodeId = null, siteId = null } = {}) {
  if (nodeId) return getNode(definition, nodeId);
  return definition?.transportNodes?.find((entry) => entry?.siteId === siteId) ?? null;
}

export function findFastestRoute(definition, {
  originNodeId = null,
  destinationNodeId = null,
  originSiteId = null,
  destinationSiteId = null,
  enabledModes = ["land", "river", "sea"],
} = {}) {
  const origin = resolveEndpointNode(definition, { nodeId: originNodeId, siteId: originSiteId });
  const destination = resolveEndpointNode(definition, { nodeId: destinationNodeId, siteId: destinationSiteId });
  if (!origin || !destination) return { ok: false, reason: "invalidEndpoint" };
  if (origin.id === destination.id) return { ok: true, totalDays: 0, totalDistanceKm: 0, legs: [], nodeIds: [origin.id] };

  const modes = new Set(enabledModes.filter((mode) => ["land", "river", "sea"].includes(mode)));
  if (modes.size === 0) return { ok: false, reason: "noModesEnabled" };
  const adjacency = new Map((definition.transportNodes ?? []).map((node) => [node.id, []]));
  for (const link of definition.transportLinks ?? []) {
    if (!modes.has(link.mode)) continue;
    adjacency.get(link.nodeAId)?.push({ link, reverse: false, nextNodeId: link.nodeBId });
    if (link.bidirectional) adjacency.get(link.nodeBId)?.push({ link, reverse: true, nextNodeId: link.nodeAId });
  }
  for (const entries of adjacency.values()) {
    entries.sort((a, b) => (a.link.id < b.link.id ? -1 : a.link.id > b.link.id ? 1 : 0));
  }

  const best = new Map();
  const pending = [{ nodeId: origin.id, days: 0, legCount: 0, pathKey: "", legs: [], nodeIds: [origin.id] }];
  best.set(origin.id, pending[0]);
  while (pending.length) {
    pending.sort(compareCandidate);
    const current = pending.shift();
    if (best.get(current.nodeId) !== current) continue;
    if (current.nodeId === destination.id) {
      return {
        ok: true,
        totalDays: current.days,
        totalDistanceKm: current.legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
        legs: current.legs,
        nodeIds: current.nodeIds,
      };
    }
    for (const arc of adjacency.get(current.nodeId) ?? []) {
      const travel = calculateTransportLinkTravel(definition, arc.link, arc.reverse);
      if (!travel) continue;
      const next = {
        nodeId: arc.nextNodeId,
        days: current.days + travel.days,
        legCount: current.legCount + 1,
        pathKey: `${current.pathKey}|${arc.link.id}:${arc.reverse ? "r" : "f"}`,
        legs: [...current.legs, {
          linkId: arc.link.id,
          fromNodeId: current.nodeId,
          toNodeId: arc.nextNodeId,
          ...travel,
        }],
        nodeIds: [...current.nodeIds, arc.nextNodeId],
      };
      const previous = best.get(next.nodeId);
      if (!previous || compareCandidate(next, previous) < 0) {
        best.set(next.nodeId, next);
        pending.push(next);
      }
    }
  }
  return { ok: false, reason: "noRoute" };
}
