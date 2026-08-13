import { worldMapDefs } from "../defs/world/world-map-defs.js";
import {
  DETAILED_PRACTICE_SLOT_COUNT,
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import { createInitialDetailedSettlementData } from "../defs/world/detailed-settlement-scenario.js";
import {
  REGION_COLOURS,
  REGION_CONTROLLERS,
  canonicalizeWorldConnections,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  isWorldConnectionCandidate,
} from "./world-state.js";

export const MAP_LAB_DRAFT_SCHEMA_VERSION = 3;
export const MAP_LAB_STORAGE_KEY = "civsurvivor.mapLabDraft.v3";

const clone = (value) => JSON.parse(JSON.stringify(value));
const definitionFor = (id) => worldMapDefs[id] ?? null;

function normalizeDetailedState(raw, capacity) {
  const fallback = createInitialDetailedSettlementData();
  const state = raw && typeof raw === "object" ? clone(raw) : fallback;
  state.populationByClass = state.populationByClass ?? fallback.populationByClass;
  state.storedFood = Number.isFinite(state.storedFood) ? state.storedFood : 0;
  state.looseFood = Number.isFinite(state.looseFood) ? state.looseFood : 0;
  state.currency = Number.isFinite(state.currency) ? Math.max(0, state.currency) : 0;
  state.practiceSlots = Array.isArray(state.practiceSlots)
    ? state.practiceSlots.slice(0, DETAILED_PRACTICE_SLOT_COUNT)
    : [];
  while (state.practiceSlots.length < DETAILED_PRACTICE_SLOT_COUNT) state.practiceSlots.push(null);
  state.structureSlots = Array.isArray(state.structureSlots)
    ? state.structureSlots.slice(0, capacity)
    : [];
  while (state.structureSlots.length < capacity) state.structureSlots.push(null);
  state.elderOrder = state.elderOrder ?? fallback.elderOrder;
  state.lastMeal = null;
  state.lastMoonResult = null;
  return state;
}

export function canonicalizeMapLabDraft(value) {
  const draft = clone(value);
  const definition = definitionFor(draft?.worldDefinitionId);
  if (!definition) return draft;
  const regionById = new Map((draft.regions ?? []).map((entry) => [entry?.id, entry]));
  draft.schemaVersion = MAP_LAB_DRAFT_SCHEMA_VERSION;
  draft.regions = definition.regions.map((regionDef) => {
    const source = regionById.get(regionDef.id) ?? regionDef.initialState;
    const structureCapacity = Number.isInteger(source.structureCapacity)
      ? source.structureCapacity
      : regionDef.initialState.structureCapacity;
    const detailedSettlementEnabled = source.detailedSettlementEnabled === true;
    return {
      id: regionDef.id,
      colour: source.colour,
      controller: source.controller,
      structureCapacity,
      detailedSettlementEnabled,
      detailedState: detailedSettlementEnabled
        ? normalizeDetailedState(source.detailedState, structureCapacity)
        : null,
    };
  });
  draft.connections = canonicalizeWorldConnections(draft.connections ?? [], definition);
  return draft;
}

export function createAuthoredMapLabDraft(worldDefinitionId = "riverBasin01") {
  const definition = definitionFor(worldDefinitionId);
  if (!definition) throw new Error(`Unknown world definition: ${worldDefinitionId}`);
  const siteByRegion = new Map(definition.sites.map((site) => [site.regionId, site]));
  return canonicalizeMapLabDraft({
    schemaVersion: MAP_LAB_DRAFT_SCHEMA_VERSION,
    worldDefinitionId,
    regions: definition.regions.map((entry) => ({
      id: entry.id,
      ...clone(entry.initialState),
      detailedState: siteByRegion.has(entry.id) ? createInitialDetailedSettlementData() : null,
    })),
    connections: clone(definition.connections),
  });
}

export function createMapLabDraftFromGameState(state) {
  const draft = {
    schemaVersion: MAP_LAB_DRAFT_SCHEMA_VERSION,
    worldDefinitionId: state?.world?.definitionId,
    regions: (state?.world?.regions ?? []).map((region) => {
      const site = (state?.world?.sites ?? []).find((entry) => entry.regionId === region.id);
      return {
        id: region.id,
        colour: region.colour,
        controller: region.controller,
        structureCapacity: region.structureCapacity,
        detailedSettlementEnabled: region.detailedSettlementEnabled === true,
        detailedState: site?.detailedState ? clone(site.detailedState) : null,
      };
    }),
    connections: clone(state?.world?.connections ?? []),
  };
  const validation = validateMapLabDraft(draft);
  return validation.ok
    ? { ok: true, draft: canonicalizeMapLabDraft(draft), errors: [], warnings: validation.warnings }
    : { ok: false, reason: "invalidGameState", errors: validation.errors };
}

function countStructures(detailedState, structureId) {
  return (detailedState?.structureSlots ?? []).filter(
    (slot) => slot?.structureId === structureId
  ).length;
}

function populationTotal(detailedState) {
  let total = 0;
  for (const classState of Object.values(detailedState?.populationByClass ?? {})) {
    total += Math.max(0, Math.floor(classState?.children ?? 0));
    total += Math.max(0, Math.floor(classState?.adults ?? 0));
    total += (classState?.eldersByAge ?? []).reduce(
      (sum, cohort) => sum + Math.max(0, Math.floor(cohort?.count ?? 0)), 0
    );
  }
  return total;
}

function validateDetailedState(region, path, errors, warnings) {
  const state = region.detailedState;
  if (!state || typeof state !== "object") {
    errors.push(`${path}.detailedState: required when enabled`);
    return;
  }
  if (!Array.isArray(state.practiceSlots)
      || state.practiceSlots.length !== DETAILED_PRACTICE_SLOT_COUNT) {
    errors.push(`${path}.detailedState.practiceSlots: expected five slots`);
  } else {
    state.practiceSlots.forEach((slot, index) => {
      if (slot && !detailedSettlementPracticeDefs[slot.practiceId]) {
        errors.push(`${path}.detailedState.practiceSlots[${index}]: invalid practice`);
      }
    });
  }
  if (!Array.isArray(state.structureSlots)
      || state.structureSlots.length !== region.structureCapacity) {
    errors.push(`${path}.detailedState.structureSlots: expected ${region.structureCapacity} slots`);
  } else {
    state.structureSlots.forEach((slot, index) => {
      if (slot && !settlementStructureDefs[slot.structureId]) {
        errors.push(`${path}.detailedState.structureSlots[${index}]: invalid structure`);
      }
    });
  }
  const granaries = countStructures(state, "granary");
  const foodCapacity = 100 * granaries * granaries;
  if (!Number.isFinite(state.storedFood) || state.storedFood < 0
      || state.storedFood > foodCapacity) {
    errors.push(`${path}.detailedState.storedFood: expected 0..${foodCapacity}`);
  }
  if (!Number.isFinite(state.looseFood) || state.looseFood < 0) {
    errors.push(`${path}.detailedState.looseFood: expected non-negative number`);
  }
  if (!Number.isFinite(state.currency) || state.currency < 0) {
    errors.push(`${path}.detailedState.currency: expected non-negative number`);
  }
  for (const [classId, classState] of Object.entries(state.populationByClass ?? {})) {
    if (!Number.isInteger(classState?.children) || classState.children < 0
        || !Number.isInteger(classState?.adults) || classState.adults < 0) {
      errors.push(`${path}.detailedState.populationByClass.${classId}: invalid cohorts`);
    }
    for (const [index, cohort] of (classState?.eldersByAge ?? []).entries()) {
      if (!Number.isInteger(cohort?.age) || cohort.age < 45
          || !Number.isInteger(cohort?.count) || cohort.count < 1) {
        errors.push(`${path}.detailedState.populationByClass.${classId}.eldersByAge[${index}]: invalid cohort`);
      }
    }
  }
  const houses = countStructures(state, "mudHouses");
  const housing = 20 * houses * houses;
  if (populationTotal(state) > housing) {
    warnings.push(`${path}: population ${populationTotal(state)} exceeds housing ${housing}`);
  }
}

export function validateMapLabDraft(value) {
  const errors = [];
  const warnings = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["draft: expected a JSON object"], warnings };
  }
  if (value.schemaVersion !== MAP_LAB_DRAFT_SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${MAP_LAB_DRAFT_SCHEMA_VERSION}`);
  }
  const definition = definitionFor(value.worldDefinitionId);
  if (!definition) errors.push("worldDefinitionId: unknown definition");
  if (!Array.isArray(value.regions)) errors.push("regions: expected an array");
  if (!Array.isArray(value.connections)) errors.push("connections: expected an array");
  if (!definition || !Array.isArray(value.regions) || !Array.isArray(value.connections)) {
    return { ok: false, errors, warnings };
  }
  if (value.regions.length !== definition.regions.length) {
    errors.push(`regions: expected ${definition.regions.length}`);
  }
  const seen = new Set();
  value.regions.forEach((region, index) => {
    const path = `regions[${index}]`;
    if (!definition.regions.some((entry) => entry.id === region?.id) || seen.has(region?.id)) {
      errors.push(`${path}.id: invalid or duplicate`);
    }
    seen.add(region?.id);
    if (!REGION_COLOURS.includes(region?.colour)) errors.push(`${path}.colour: invalid`);
    if (!REGION_CONTROLLERS.includes(region?.controller)) errors.push(`${path}.controller: invalid`);
    if (!Number.isInteger(region?.structureCapacity) || region.structureCapacity < 0) {
      errors.push(`${path}.structureCapacity: expected non-negative integer`);
    }
    if (typeof region?.detailedSettlementEnabled !== "boolean") {
      errors.push(`${path}.detailedSettlementEnabled: expected boolean`);
    }
    if ("capacity" in (region ?? {}) || "installedPracticeIds" in (region ?? {})) {
      errors.push(`${path}: v1 fields are not accepted`);
    }
    if (region?.detailedSettlementEnabled) validateDetailedState(region, path, errors, warnings);
    else if (region?.detailedState != null) errors.push(`${path}.detailedState: expected null when disabled`);
  });
  const keys = new Set();
  for (const connection of value.connections) {
    if (!isWorldConnectionCandidate(definition, connection?.regionAId, connection?.regionBId)) {
      errors.push(`connections: invalid ${connection?.regionAId ?? "?"}-${connection?.regionBId ?? "?"}`);
    }
    const key = getWorldConnectionKey(connection?.regionAId, connection?.regionBId);
    if (keys.has(key)) errors.push(`connections: duplicate ${key}`);
    keys.add(key);
  }
  return { ok: errors.length === 0, errors, warnings };
}

function updateDraft(draft, mutator) {
  const next = canonicalizeMapLabDraft(draft);
  const outcome = mutator(next);
  if (outcome?.ok === false) return outcome;
  const validation = validateMapLabDraft(next);
  return validation.ok
    ? { ok: true, draft: canonicalizeMapLabDraft(next), warnings: validation.warnings }
    : { ok: false, reason: "invalidDraft", errors: validation.errors, warnings: validation.warnings };
}

export function updateMapLabRegion(draft, regionId, patch) {
  return updateDraft(draft, (next) => {
    const region = next.regions.find((entry) => entry.id === regionId);
    if (!region) return { ok: false, reason: "invalidRegionId" };
    const capacity = Object.hasOwn(patch, "structureCapacity")
      ? Number(patch.structureCapacity)
      : region.structureCapacity;
    const occupied = region.detailedState?.structureSlots?.filter(Boolean).length ?? 0;
    if (!Number.isInteger(capacity) || capacity < occupied) {
      return { ok: false, reason: "structureCapacityBelowOccupied" };
    }
    if (Object.hasOwn(patch, "colour")) region.colour = patch.colour;
    if (Object.hasOwn(patch, "controller")) region.controller = patch.controller;
    if (Object.hasOwn(patch, "structureCapacity")) region.structureCapacity = capacity;
    if (Object.hasOwn(patch, "detailedSettlementEnabled")) {
      region.detailedSettlementEnabled = patch.detailedSettlementEnabled === true;
      region.detailedState = region.detailedSettlementEnabled
        ? normalizeDetailedState(region.detailedState, region.structureCapacity)
        : null;
    }
    if (region.detailedState) {
      region.detailedState = normalizeDetailedState(region.detailedState, region.structureCapacity);
    }
    return { ok: true };
  });
}

export function updateMapLabDetailedState(draft, regionId, patch) {
  return updateDraft(draft, (next) => {
    const region = next.regions.find((entry) => entry.id === regionId);
    if (!region?.detailedSettlementEnabled || !region.detailedState) {
      return { ok: false, reason: "detailedSettlementDisabled" };
    }
    region.detailedState = {
      ...region.detailedState,
      ...clone(patch),
    };
    return { ok: true };
  });
}

export function setMapLabPracticeSlot(draft, regionId, slotIndex, practiceId) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= DETAILED_PRACTICE_SLOT_COUNT) {
    return { ok: false, reason: "invalidSlotIndex" };
  }
  if (practiceId != null && !detailedSettlementPracticeDefs[practiceId]) {
    return { ok: false, reason: "invalidPracticeId" };
  }
  return updateMapLabDetailedState(draft, regionId, {
    practiceSlots: draft.regions.find((entry) => entry.id === regionId)
      ?.detailedState?.practiceSlots.map((slot, index) =>
        index === slotIndex
          ? practiceId == null ? null : { practiceId, charge: 0, work: 0 }
          : slot),
  });
}

export function setMapLabStructureSlot(draft, regionId, slotIndex, structureId) {
  const region = draft.regions.find((entry) => entry.id === regionId);
  if (!region || !Number.isInteger(slotIndex) || slotIndex < 0
      || slotIndex >= region.structureCapacity) return { ok: false, reason: "invalidSlotIndex" };
  if (structureId != null && !settlementStructureDefs[structureId]) {
    return { ok: false, reason: "invalidStructureId" };
  }
  return updateMapLabDetailedState(draft, regionId, {
    structureSlots: region.detailedState?.structureSlots.map((slot, index) =>
      index === slotIndex ? structureId == null ? null : { structureId } : slot),
  });
}

export function toggleMapLabConnection(draft, regionAId, regionBId) {
  if (regionAId === regionBId) return { ok: false, reason: "selfConnection" };
  const definition = definitionFor(draft?.worldDefinitionId);
  if (!isWorldConnectionCandidate(definition, regionAId, regionBId)) {
    return { ok: false, reason: "notPolygonAdjacent" };
  }
  let connected = true;
  const result = updateDraft(draft, (next) => {
    const key = getWorldConnectionKey(regionAId, regionBId);
    const index = next.connections.findIndex((entry) =>
      getWorldConnectionKey(entry.regionAId, entry.regionBId) === key);
    if (index >= 0) {
      next.connections.splice(index, 1);
      connected = false;
    } else {
      next.connections.push({ regionAId, regionBId });
    }
  });
  return { ...result, connected };
}

export function getMapLabConnectionCandidates(draft) {
  return getWorldConnectionCandidates(definitionFor(draft?.worldDefinitionId));
}

export function getMapLabConnectedComponents(draft) {
  const definition = definitionFor(draft?.worldDefinitionId);
  if (!definition) return [];
  const neighbours = new Map(definition.regions.map((entry) => [entry.id, []]));
  for (const edge of draft.connections ?? []) {
    neighbours.get(edge.regionAId)?.push(edge.regionBId);
    neighbours.get(edge.regionBId)?.push(edge.regionAId);
  }
  const remaining = new Set(definition.regions.map((entry) => entry.id));
  const components = [];
  while (remaining.size) {
    const start = definition.regions.find((entry) => remaining.has(entry.id)).id;
    remaining.delete(start);
    const queue = [start];
    const component = [];
    while (queue.length) {
      const id = queue.shift();
      component.push(id);
      for (const neighbour of neighbours.get(id) ?? []) {
        if (!remaining.has(neighbour)) continue;
        remaining.delete(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(component);
  }
  return components;
}

export function evaluateMapLabPractice(draft, practiceId = "cultivate") {
  if (practiceId !== "cultivate") return [];
  return draft.regions.map((region) => {
    let bonus = 0;
    for (const edge of draft.connections) {
      const neighbourId = edge.regionAId === region.id
        ? edge.regionBId
        : edge.regionBId === region.id ? edge.regionAId : null;
      const neighbour = draft.regions.find((entry) => entry.id === neighbourId);
      if (neighbour?.controller === "player" && neighbour.colour === region.colour) bonus += 1;
    }
    return { regionId: region.id, eligible: region.controller === "player", evaluation: { ok: true, score: 1 + bonus } };
  });
}

export function getMapLabDiagnostics(draft) {
  const validation = validateMapLabDraft(draft);
  const components = getMapLabConnectedComponents(draft);
  return {
    components,
    disconnected: components.length > 1,
    warnings: validation.warnings,
    detailedRegionCount: draft.regions.filter((entry) => entry.detailedSettlementEnabled).length,
  };
}

export function parseMapLabDraftJson(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`json: ${error.message}`] };
  }
  const validation = validateMapLabDraft(value);
  return validation.ok
    ? { ok: true, draft: canonicalizeMapLabDraft(value), errors: [], warnings: validation.warnings }
    : validation;
}

export function serializeMapLabDraft(draft) {
  const validation = validateMapLabDraft(draft);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  return JSON.stringify(canonicalizeMapLabDraft(draft), null, 2);
}
