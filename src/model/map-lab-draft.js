import {
  REGIONAL_PRACTICE_IDS,
  regionalPracticeDefs,
} from "../defs/gamepieces/regional-practice-defs.js";
import { worldMapDefs } from "../defs/world/world-map-defs.js";
import {
  REGION_COLOURS,
  REGION_CONTROLLERS,
  canonicalizeWorldConnections,
  getWorldConnectionKey,
} from "./world-state.js";
import {
  evaluateRegionalPracticePlacement,
  validateRegionalPracticeInstallation,
} from "./regional-practices.js";

export const MAP_LAB_DRAFT_SCHEMA_VERSION = 1;
export const MAP_LAB_STORAGE_KEY = "civsurvivor.mapLabDraft.v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getDefinition(definitionId) {
  return worldMapDefs[definitionId] ?? null;
}

function draftState(draft) {
  return {
    world: {
      definitionId: draft.worldDefinitionId,
      regions: draft.regions,
      connections: draft.connections,
      sites: [],
    },
  };
}

export function createAuthoredMapLabDraft(worldDefinitionId = "riverBasin01") {
  const definition = getDefinition(worldDefinitionId);
  if (!definition) throw new Error(`Unknown world definition: ${worldDefinitionId}`);
  return canonicalizeMapLabDraft({
    schemaVersion: MAP_LAB_DRAFT_SCHEMA_VERSION,
    worldDefinitionId,
    regions: definition.regions.map((entry) => ({ id: entry.id, ...clone(entry.initialState) })),
    connections: clone(definition.connections),
  });
}

export function canonicalizeMapLabDraft(value) {
  const draft = clone(value);
  const definition = getDefinition(draft?.worldDefinitionId);
  if (!definition) return draft;
  const regionById = new Map((Array.isArray(draft.regions) ? draft.regions : [])
    .map((entry) => [entry?.id, entry]));
  draft.schemaVersion = MAP_LAB_DRAFT_SCHEMA_VERSION;
  draft.regions = definition.regions.map((entry) => {
    const region = regionById.get(entry.id) ?? {};
    return {
      id: entry.id,
      colour: region.colour,
      capacity: region.capacity,
      controller: region.controller,
      installedPracticeIds: Array.isArray(region.installedPracticeIds)
        ? [...region.installedPracticeIds]
        : region.installedPracticeIds,
    };
  });
  draft.connections = canonicalizeWorldConnections(draft.connections, definition);
  return draft;
}

export function validateMapLabDraft(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["draft: expected a JSON object"] };
  }
  if (value.schemaVersion !== MAP_LAB_DRAFT_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${MAP_LAB_DRAFT_SCHEMA_VERSION}`);
  }
  const definition = getDefinition(value.worldDefinitionId);
  if (!definition) {
    errors.push(`worldDefinitionId: unknown definition ${String(value.worldDefinitionId)}`);
    return { ok: false, errors };
  }
  const expectedIds = new Set(definition.regions.map((entry) => entry.id));
  const seenIds = new Set();
  if (!Array.isArray(value.regions)) {
    errors.push("regions: expected an array");
  } else {
    value.regions.forEach((region, index) => {
      const path = `regions[${index}]`;
      if (!expectedIds.has(region?.id)) errors.push(`${path}.id: unknown region ${String(region?.id)}`);
      else if (seenIds.has(region.id)) errors.push(`${path}.id: duplicate region ${region.id}`);
      else seenIds.add(region.id);
      if (!REGION_COLOURS.includes(region?.colour)) errors.push(`${path}.colour: invalid colour`);
      if (!REGION_CONTROLLERS.includes(region?.controller)) errors.push(`${path}.controller: invalid controller`);
      if (!Number.isInteger(region?.capacity) || region.capacity < 0) {
        errors.push(`${path}.capacity: expected a non-negative integer`);
      }
      if (!Array.isArray(region?.installedPracticeIds)) {
        errors.push(`${path}.installedPracticeIds: expected an array`);
      } else {
        if (Number.isInteger(region?.capacity) && region.installedPracticeIds.length > region.capacity) {
          errors.push(`${path}.installedPracticeIds: ${region.installedPracticeIds.length} practices exceed capacity ${region.capacity}`);
        }
        region.installedPracticeIds.forEach((practiceId, practiceIndex) => {
          if (!regionalPracticeDefs[practiceId]) {
            errors.push(`${path}.installedPracticeIds[${practiceIndex}]: invalid practice ${String(practiceId)}`);
          }
        });
      }
    });
  }
  for (const regionId of expectedIds) {
    if (!seenIds.has(regionId)) errors.push(`regions: missing region ${regionId}`);
  }
  const connectionKeys = new Set();
  if (!Array.isArray(value.connections)) {
    errors.push("connections: expected an array");
  } else {
    value.connections.forEach((entry, index) => {
      const path = `connections[${index}]`;
      const a = entry?.regionAId;
      const b = entry?.regionBId;
      if (!expectedIds.has(a)) errors.push(`${path}.regionAId: unknown region ${String(a)}`);
      if (!expectedIds.has(b)) errors.push(`${path}.regionBId: unknown region ${String(b)}`);
      if (a === b) errors.push(`${path}: self-connections are not allowed`);
      if (expectedIds.has(a) && expectedIds.has(b) && a !== b) {
        const key = getWorldConnectionKey(a, b);
        if (connectionKeys.has(key)) errors.push(`${path}: duplicate undirected connection ${key}`);
        connectionKeys.add(key);
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

export function parseMapLabDraftJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`json: ${error.message}`] };
  }
  const validation = validateMapLabDraft(raw);
  return validation.ok
    ? { ok: true, draft: canonicalizeMapLabDraft(raw), errors: [] }
    : validation;
}

export function serializeMapLabDraft(draft) {
  const validation = validateMapLabDraft(draft);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return JSON.stringify(canonicalizeMapLabDraft(draft), null, 2);
}

function updateDraft(draft, mutate) {
  const next = canonicalizeMapLabDraft(draft);
  mutate(next);
  return { ok: true, draft: canonicalizeMapLabDraft(next) };
}

export function updateMapLabRegion(draft, regionId, patch) {
  const region = draft?.regions?.find((entry) => entry.id === regionId);
  if (!region) return { ok: false, reason: "invalidRegionId" };
  if (patch.colour != null && !REGION_COLOURS.includes(patch.colour)) return { ok: false, reason: "invalidColour" };
  if (patch.controller != null && !REGION_CONTROLLERS.includes(patch.controller)) return { ok: false, reason: "invalidController" };
  if (patch.capacity != null && (!Number.isInteger(patch.capacity) || patch.capacity < 0)) return { ok: false, reason: "invalidCapacity" };
  if (patch.capacity != null && patch.capacity < region.installedPracticeIds.length) return { ok: false, reason: "capacityBelowInstalled" };
  return updateDraft(draft, (next) => Object.assign(
    next.regions.find((entry) => entry.id === regionId),
    patch
  ));
}

export function addMapLabPractice(draft, regionId, practiceId) {
  if (!regionalPracticeDefs[practiceId]) return { ok: false, reason: "invalidPracticeId" };
  const region = draft?.regions?.find((entry) => entry.id === regionId);
  if (!region) return { ok: false, reason: "invalidRegionId" };
  if (region.installedPracticeIds.length >= region.capacity) return { ok: false, reason: "capacityFull" };
  return updateDraft(draft, (next) => next.regions
    .find((entry) => entry.id === regionId).installedPracticeIds.push(practiceId));
}

export function removeMapLabPractice(draft, regionId, installedIndex) {
  const region = draft?.regions?.find((entry) => entry.id === regionId);
  if (!region || !Number.isInteger(installedIndex) || installedIndex < 0 || installedIndex >= region.installedPracticeIds.length) {
    return { ok: false, reason: "invalidInstalledIndex" };
  }
  return updateDraft(draft, (next) => next.regions
    .find((entry) => entry.id === regionId).installedPracticeIds.splice(installedIndex, 1));
}

export function moveMapLabPractice(draft, regionId, fromIndex, toIndex) {
  const region = draft?.regions?.find((entry) => entry.id === regionId);
  if (!region || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
      || fromIndex < 0 || toIndex < 0
      || fromIndex >= region.installedPracticeIds.length || toIndex >= region.installedPracticeIds.length) {
    return { ok: false, reason: "invalidInstalledIndex" };
  }
  return updateDraft(draft, (next) => {
    const ids = next.regions.find((entry) => entry.id === regionId).installedPracticeIds;
    const [practiceId] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, practiceId);
  });
}

export function toggleMapLabConnection(draft, regionAId, regionBId) {
  if (regionAId === regionBId) return { ok: false, reason: "selfConnection" };
  const definition = getDefinition(draft?.worldDefinitionId);
  const validIds = new Set(definition?.regions?.map((entry) => entry.id) ?? []);
  if (!validIds.has(regionAId) || !validIds.has(regionBId)) return { ok: false, reason: "invalidRegionId" };
  const key = getWorldConnectionKey(regionAId, regionBId);
  let connected = true;
  const result = updateDraft(draft, (next) => {
    const index = next.connections.findIndex((entry) => getWorldConnectionKey(
      entry.regionAId, entry.regionBId
    ) === key);
    if (index >= 0) {
      next.connections.splice(index, 1);
      connected = false;
    } else {
      next.connections.push({ regionAId, regionBId });
    }
  });
  return { ...result, connected };
}

export function getMapLabConnectedComponents(draft) {
  const definition = getDefinition(draft?.worldDefinitionId);
  if (!definition) return [];
  const neighbors = new Map(definition.regions.map((entry) => [entry.id, []]));
  for (const connection of draft.connections ?? []) {
    neighbors.get(connection.regionAId)?.push(connection.regionBId);
    neighbors.get(connection.regionBId)?.push(connection.regionAId);
  }
  const order = new Map(definition.regions.map((entry, index) => [entry.id, index]));
  const remaining = new Set(definition.regions.map((entry) => entry.id));
  const components = [];
  while (remaining.size) {
    const start = definition.regions.find((entry) => remaining.has(entry.id)).id;
    const component = [];
    const queue = [start];
    remaining.delete(start);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const next of neighbors.get(current) ?? []) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        queue.push(next);
      }
    }
    component.sort((a, b) => order.get(a) - order.get(b));
    components.push(component);
  }
  return components;
}

export function evaluateMapLabPractice(draft, practiceId) {
  const state = draftState(draft);
  const definition = getDefinition(draft?.worldDefinitionId);
  return (definition?.regions ?? []).map((regionDef) => {
    const eligibility = validateRegionalPracticeInstallation(state, {
      regionId: regionDef.id,
      practiceId,
    });
    const evaluation = evaluateRegionalPracticePlacement(state, {
      regionId: regionDef.id,
      practiceId,
    });
    return { regionId: regionDef.id, eligible: eligibility.ok, eligibility, evaluation };
  });
}

export function getMapLabDiagnostics(draft) {
  const definition = getDefinition(draft?.worldDefinitionId);
  const practiceOrder = REGIONAL_PRACTICE_IDS;
  const regionOrder = new Map((definition?.regions ?? []).map((entry, index) => [entry.id, index]));
  const practices = practiceOrder.map((practiceId) => {
    const eligible = evaluateMapLabPractice(draft, practiceId).filter((entry) => entry.eligible && entry.evaluation.ok);
    const scores = eligible.map((entry) => entry.evaluation.score);
    const minScore = scores.length ? Math.min(...scores) : null;
    const maxScore = scores.length ? Math.max(...scores) : null;
    const bestRegionIds = eligible.filter((entry) => entry.evaluation.score === maxScore)
      .map((entry) => entry.regionId)
      .sort((a, b) => regionOrder.get(a) - regionOrder.get(b));
    return {
      practiceId,
      eligibleRegionCount: eligible.length,
      minScore,
      maxScore,
      scoreRange: scores.length ? maxScore - minScore : null,
      bestRegionIds,
      flat: eligible.length >= 2 && minScore === maxScore,
      comparisonStatus: eligible.length >= 2 ? "comparable" : "insufficient",
    };
  });
  const soleBestByRegion = new Map();
  const bestAppearances = new Map();
  for (const entry of practices) {
    if (entry.bestRegionIds.length === 1) {
      const id = entry.bestRegionIds[0];
      soleBestByRegion.set(id, [...(soleBestByRegion.get(id) ?? []), entry.practiceId]);
    }
    for (const id of entry.bestRegionIds) bestAppearances.set(id, (bestAppearances.get(id) ?? 0) + 1);
  }
  const sharedSoleBestRegions = [...soleBestByRegion.entries()]
    .filter(([, practiceIds]) => practiceIds.length >= 2)
    .map(([regionId, practiceIds]) => ({ regionId, practiceIds }));
  const dominantRegions = [...bestAppearances.entries()]
    .filter(([, evaluatorCount]) => evaluatorCount >= 2)
    .map(([regionId, evaluatorCount]) => ({ regionId, evaluatorCount }))
    .sort((a, b) => b.evaluatorCount - a.evaluatorCount || regionOrder.get(a.regionId) - regionOrder.get(b.regionId));
  const components = getMapLabConnectedComponents(draft);
  return { practices, sharedSoleBestRegions, dominantRegions, components, disconnected: components.length > 1 };
}

