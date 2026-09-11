// Vassal candidate generation, selection, prestige, and interventions.

import {
  DETAILED_PRACTICE_SLOT_COUNT,
  VASSAL_INTERVENTION_PRACTICE_IDS,
  settlementStructureDefs,
} from "../../defs/gamepieces/detailed-settlement-defs.js";
import { MOON_PHASE_INDEX_BY_ID } from "../../defs/gamesettings/moon-phase-defs.js";
import { createInitialDetailedSettlementData } from "../../defs/world/detailed-settlement-scenario.js";
import { createDetailedPracticeSlot } from "../detailed-practice-tiers.js";
import {
  getDetailedPracticeDef,
  getDetailedStructureDef,
  getGameSetting,
} from "../game-config.js";
import { getNextMoonPhaseBoundarySec } from "../moon-phases.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import { applyBuild, findStructurePlacement } from "../structure-layout.js";
import { getVassalCandidatePool } from "../vassal-life-map.js";
import {
  addWorldConnection,
  establishDetailedSettlement,
  getConnectedRegionIds,
  getRegionReference,
  getRegionState,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  getWorldDefinition,
  removeWorldConnection,
} from "../world-state.js";
import { clone, getDetailedYearStartSec } from "./helpers.js";
import { tryCreateStructure } from "./practices.js";
import {
  getDetailedSettlement,
  getDetailedSettlementSites,
  getElderOrderSummary,
} from "./queries.js";

const TRAITS = Object.freeze([
  { id: "hardworker", prestigeDelta: 4 },
  { id: "goodTeacher", prestigeDelta: 3 },
  { id: "fairTrader", prestigeDelta: 2 },
  { id: "pious", prestigeDelta: 1 },
  { id: "slothful", prestigeDelta: -4 },
  { id: "philanderer", prestigeDelta: -3 },
  { id: "quarrelsome", prestigeDelta: -2 },
]);
const PROFESSIONS = Object.freeze([
  "fisher", "farmer", "potter", "builder", "herder", "scribe",
]);

function shuffleWithStateRng(state, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = state.rngNextInt(0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

const VASSAL_INTERVENTION_KINDS = Object.freeze([
  "practice",
  "structure",
  "addConnection",
  "expandSettlement",
  "globalStructure",
]);

function isPlayerDetailedRegion(state, regionId) {
  const region = getRegionState(state, regionId);
  return region?.controller === "player" && region.detailedSettlementEnabled === true;
}

function getExpansionCandidates(state, targetRegionId, reservedRegionIds = new Set()) {
  return getConnectedRegionIds(state, targetRegionId).filter((regionId) => {
    const region = getRegionState(state, regionId);
    return region?.controller === "frontier"
      && region.detailedSettlementEnabled !== true
      && !reservedRegionIds.has(regionId);
  });
}

function getCandidateConnectionEntries(state, targetRegionId, mode, connectionKeys = null) {
  const definition = getWorldDefinition(state);
  const connections = Array.isArray(state?.world?.connections) ? state.world.connections : [];
  const existing = connectionKeys ?? new Set(connections.map((entry) =>
    getWorldConnectionKey(entry.regionAId, entry.regionBId)
  ));
  const touchingTarget = (entry) =>
    entry.regionAId === targetRegionId || entry.regionBId === targetRegionId;
  if (mode === "add") {
    return getWorldConnectionCandidates(definition).filter((entry) =>
      touchingTarget(entry)
      && isPlayerDetailedRegion(state, entry.regionAId)
      && isPlayerDetailedRegion(state, entry.regionBId)
      && !existing.has(getWorldConnectionKey(entry.regionAId, entry.regionBId))
    );
  }
  return getWorldConnectionCandidates(definition).filter((entry) =>
    touchingTarget(entry) && existing.has(getWorldConnectionKey(entry.regionAId, entry.regionBId))
  );
}

function reserveStructureBuild(state, slots, structureId, origin = null) {
  const width = getDetailedStructureDef(state, structureId)?.footprint;
  if (!width) return null;
  const location = origin == null ? findStructurePlacement(slots, width) : { ok: true, origin };
  if (!location.ok) return null;
  const result = applyBuild(slots, { structureId, tier: "bronze", width, origin: location.origin,
    placementId: `reserved:${location.origin}` });
  if (!result.ok) return null;
  slots.splice(0, slots.length, ...result.slots);
  return location.origin;
}

function buildCandidateIntervention(state, targetRegionId, kind, reserved = {}) {
  const settlement = getDetailedSettlement(state, targetRegionId);
  if (!settlement) return null;
  if (kind === "practice") {
    const slots = reserved.practiceSlots ?? settlement.practiceSlots.map((slot) => slot?.practiceId ?? null);
    const slotIndex = slots.findIndex((entry) => entry == null);
    const replacementIndex = slotIndex >= 0 ? slotIndex : slots.length - 1;
    const replacedPracticeId = slots[replacementIndex] ?? null;
    const practiceId = shuffleWithStateRng(state, VASSAL_INTERVENTION_PRACTICE_IDS)
      .find((id) => id !== slots[replacementIndex]) ?? null;
    if (!practiceId || replacementIndex < 0) return null;
    slots[replacementIndex] = practiceId;
    reserved.practiceSlots = slots;
    return {
      kind: "practice",
      targetRegionId,
      mode: replacedPracticeId ? "replace" : "add",
      replacedPracticeId,
      practiceId,
      slotIndex: replacementIndex,
    };
  }
  if (kind === "structure") {
    const slots = reserved.structureSlots ?? settlement.structureSlots.map(slot => slot ? { ...slot } : null);
    for (const structureId of shuffleWithStateRng(state, Object.keys(settlementStructureDefs))) {
      const slotIndex = reserveStructureBuild(state, slots, structureId);
      if (slotIndex == null) continue;
      reserved.structureSlots = slots;
      return { kind: "structure", targetRegionId, structureId, slotIndex };
    }
    return null;
  }
  if (kind === "expandSettlement") {
    const expandedRegionIds = reserved.expandedRegionIds ?? new Set();
    const regionId = shuffleWithStateRng(
      state,
      getExpansionCandidates(state, targetRegionId, expandedRegionIds)
    )[0] ?? null;
    if (!regionId) return null;
    expandedRegionIds.add(regionId);
    reserved.expandedRegionIds = expandedRegionIds;
    return { kind: "expandSettlement", sourceRegionId: targetRegionId, regionId };
  }
  if (kind === "globalStructure") {
    const globalSlots = reserved.globalStructureSlots ?? Object.fromEntries(
      getDetailedSettlementSites(state, { playerOnly: true }).map((site) => [
        site.regionId,
        site.detailedState.structureSlots.map(slot => slot ? { ...slot } : null),
      ])
    );
    const structureId = shuffleWithStateRng(
      state,
      Object.keys(settlementStructureDefs)
    )[0] ?? null;
    if (!structureId) return null;
    let reservedCount = 0;
    for (const site of getDetailedSettlementSites(state, { playerOnly: true })) {
      const slots = globalSlots[site.regionId] ?? [];
      const slotIndex = reserveStructureBuild(state, slots, structureId);
      if (slotIndex == null) continue;
      globalSlots[site.regionId] = slots;
      reservedCount += 1;
    }
    if (reservedCount === 0) return null;
    reserved.globalStructureSlots = globalSlots;
    return { kind: "globalStructure", structureId };
  }
  if (kind === "addConnection" || kind === "removeConnection") {
    const connectionKeys = reserved.connectionKeys ?? new Set(
      (state.world.connections ?? []).map((entry) =>
        getWorldConnectionKey(entry.regionAId, entry.regionBId)
      )
    );
    const entries = getCandidateConnectionEntries(
      state,
      targetRegionId,
      kind === "addConnection" ? "add" : "remove",
      connectionKeys
    );
    const entry = shuffleWithStateRng(state, entries)[0] ?? null;
    if (!entry) return null;
    const key = getWorldConnectionKey(entry.regionAId, entry.regionBId);
    if (kind === "addConnection") connectionKeys.add(key);
    else connectionKeys.delete(key);
    reserved.connectionKeys = connectionKeys;
    return {
      kind: "connection",
      mode: kind === "addConnection" ? "add" : "remove",
      regionAId: entry.regionAId,
      regionBId: entry.regionBId,
    };
  }
  return null;
}

function buildRandomCandidateAgenda(state, targetRegionId) {
  const reserved = {};
  const agenda = [];
  for (let interventionIndex = 0; interventionIndex < 3; interventionIndex += 1) {
    let intervention = null;
    for (const kind of shuffleWithStateRng(state, VASSAL_INTERVENTION_KINDS)) {
      intervention = buildCandidateIntervention(state, targetRegionId, kind, reserved);
      if (intervention) break;
    }
    if (!intervention) {
      intervention = buildCandidateIntervention(state, targetRegionId, "practice", reserved);
    }
    if (!intervention) return null;
    agenda.push(intervention);
  }
  return agenda;
}

export function generateDetailedVassalCandidates(state) {
  const targetIds = getDetailedSettlementSites(state, { playerOnly: true })
    .map((site) => site.regionId);
  if (targetIds.length === 0) {
    state.civilization.vassalLineage.pendingCandidates = [];
    return [];
  }
  const candidates = [];
  for (let candidateIndex = 0; candidateIndex < 3; candidateIndex += 1) {
    const targetRegionId = shuffleWithStateRng(state, targetIds).find((id) =>
      buildRandomCandidateAgenda(state, id) != null
    );
    if (!targetRegionId) continue;
    const interventions = buildRandomCandidateAgenda(state, targetRegionId);
    if (!interventions) continue;
    const resistance = getElderOrderSummary(state, targetRegionId).resistance;
    const trait = TRAITS[state.rngNextInt(0, TRAITS.length - 1)];
    const initialAge = state.rngNextInt(
      getGameSetting(state, "vassalStartingAgeMin"),
      getGameSetting(state, "vassalStartingAgeMax")
    );
    const deathAge = state.rngNextInt(
      getGameSetting(state, "vassalDeathAgeMin"),
      getGameSetting(state, "vassalDeathAgeMax")
    );
    const requirementOffsets = [
      getGameSetting(state, "interventionRequirement01"),
      getGameSetting(state, "interventionRequirement02"),
      getGameSetting(state, "interventionRequirement03"),
    ];
    candidates.push({
      candidateId: `candidate-${state.civilization.vassalLineage.nextVassalId}-${candidateIndex + 1}`,
      targetRegionId,
      resistanceSnapshot: resistance,
      initialAge,
      deathAge,
      traitId: trait.id,
      traitPrestigeModifier: trait.prestigeDelta,
      professionId: PROFESSIONS[state.rngNextInt(0, PROFESSIONS.length - 1)],
      interventions: interventions.map((entry, index) => ({
        ...entry,
        requiredPrestige: resistance + requirementOffsets[index],
        status: "pending",
        appliedYear: null,
        appliedSec: null,
      })),
    });
  }
  state.civilization.vassalLineage.pendingCandidates = candidates;
  return candidates;
}

function candidatePoolHash(candidates) {
  return JSON.stringify(candidates);
}

function generateDetailedVassalCandidatesFromRngSnapshot(state, rerollIndex = 0) {
  const cloneState = deserializeGameState(serializeGameState(state));
  const safeRerollIndex = Number.isFinite(rerollIndex)
    ? Math.max(0, Math.min(999, Math.floor(rerollIndex)))
    : 0;
  let candidates = [];
  for (let index = 0; index <= safeRerollIndex; index += 1) {
    candidates = generateDetailedVassalCandidates(cloneState);
  }
  return candidates;
}

export function buildDetailedVassalSelectionPool(state, rerollIndex = 0) {
  void rerollIndex;
  if (!state || state.civilization?.vassalLineage?.currentVassalId) return null;
  return getVassalCandidatePool(state);
}

export function getDetailedVassalDebugOptions(state) {
  return {
    targetRegions: getDetailedSettlementSites(state, { playerOnly: true }).map((site) => ({
      id: site.regionId,
      label: site.name ?? site.regionId,
    })),
  };
}

function createDebugInterventionReservation(state, targetRegionId) {
  const settlement = getDetailedSettlement(state, targetRegionId);
  return {
    practiceSlotsByRegion: {
      [targetRegionId]: settlement?.practiceSlots.map((slot) => slot?.practiceId ?? null) ?? [],
    },
    structureSlotsByRegion: {
      [targetRegionId]: settlement?.structureSlots.map(slot => slot ? { ...slot } : null) ?? [],
    },
    connectionKeys: new Set((state?.world?.connections ?? []).map((entry) =>
      getWorldConnectionKey(entry.regionAId, entry.regionBId)
    )),
    connectionCandidates: getWorldConnectionCandidates(getWorldDefinition(state)),
    expandedRegionIds: new Set(),
  };
}

function getDebugTargetSlots(state, reservation, regionId, kind) {
  const field = kind === "practice" ? "practiceSlotsByRegion" : "structureSlotsByRegion";
  const collection = reservation[field];
  if (Array.isArray(collection?.[regionId])) return collection[regionId];
  const settlement = getDetailedSettlement(state, regionId);
  const slots = kind === "practice"
    ? settlement?.practiceSlots.map((slot) => slot?.practiceId ?? null)
    : settlement?.structureSlots.map(slot => slot ? { ...slot } : null);
  collection[regionId] = slots ?? [];
  return collection[regionId];
}

function normalizeDebugIntervention(state, targetRegionId, raw, reservation) {
  const source = typeof raw === "string" ? { kind: "practice", practiceId: raw } : raw;
  if (!source || typeof source !== "object") return null;
  if (source.kind === "practice") {
    const interventionTargetRegionId = typeof source.targetRegionId === "string"
      ? source.targetRegionId : targetRegionId;
    if (!isPlayerDetailedRegion(state, interventionTargetRegionId)) return null;
    const practiceSlots = getDebugTargetSlots(
      state, reservation, interventionTargetRegionId, "practice"
    );
    if (!getDetailedPracticeDef(state, source.practiceId)) return null;
    const firstEmpty = practiceSlots.findIndex((practiceId) => practiceId == null);
    const slotIndex = Number.isInteger(source.slotIndex)
      ? source.slotIndex
      : (firstEmpty >= 0 ? firstEmpty : practiceSlots.length - 1);
    if (slotIndex < 0 || slotIndex >= practiceSlots.length) return null;
    const intervention = {
      kind: "practice",
      targetRegionId: interventionTargetRegionId,
      mode: practiceSlots[slotIndex] ? "replace" : "add",
      replacedPracticeId: practiceSlots[slotIndex] ?? null,
      practiceId: source.practiceId,
      slotIndex,
    };
    practiceSlots[slotIndex] = source.practiceId;
    return intervention;
  }
  if (source.kind === "structure") {
    const interventionTargetRegionId = typeof source.targetRegionId === "string"
      ? source.targetRegionId : targetRegionId;
    if (!isPlayerDetailedRegion(state, interventionTargetRegionId)) return null;
    const structureSlots = getDebugTargetSlots(
      state, reservation, interventionTargetRegionId, "structure"
    );
    const slotIndex = reserveStructureBuild(state, structureSlots, source.structureId,
      Number.isInteger(source.slotIndex) ? source.slotIndex : null);
    if (slotIndex == null) return null;
    return {
      kind: "structure", targetRegionId: interventionTargetRegionId,
      structureId: source.structureId, slotIndex,
    };
  }
  if (source.kind === "expandSettlement") {
    const sourceRegionId = typeof source.sourceRegionId === "string"
      ? source.sourceRegionId : targetRegionId;
    if (!isPlayerDetailedRegion(state, sourceRegionId)) return null;
    const candidates = getExpansionCandidates(
      state,
      sourceRegionId,
      reservation.expandedRegionIds
    );
    const regionId = typeof source.regionId === "string"
      ? candidates.find((id) => id === source.regionId)
      : candidates[0];
    if (!regionId) return null;
    reservation.expandedRegionIds.add(regionId);
    return { kind: "expandSettlement", sourceRegionId, regionId };
  }
  if (source.kind === "globalStructure") {
    if (!settlementStructureDefs[source.structureId]) return null;
    let hasRoom = false;
    for (const site of getDetailedSettlementSites(state, { playerOnly: true })) {
      const slots = getDebugTargetSlots(state, reservation, site.regionId, "structure");
      if (reserveStructureBuild(state, slots, source.structureId) != null) hasRoom = true;
    }
    return hasRoom
      ? { kind: "globalStructure", structureId: source.structureId }
      : null;
  }
  if (source.kind === "connection" && ["add", "remove"].includes(source.mode)) {
    const candidates = reservation.connectionCandidates.filter((entry) => {
        const key = getWorldConnectionKey(entry.regionAId, entry.regionBId);
        const playerPair = isPlayerDetailedRegion(state, entry.regionAId)
          && isPlayerDetailedRegion(state, entry.regionBId);
        return playerPair && (source.mode === "add"
          ? !reservation.connectionKeys.has(key)
          : reservation.connectionKeys.has(key));
      });
    const sourceHasEndpoints = typeof source.regionAId === "string"
      && typeof source.regionBId === "string";
    const candidate = sourceHasEndpoints
      ? candidates.find((entry) =>
        getWorldConnectionKey(entry.regionAId, entry.regionBId) ===
          getWorldConnectionKey(source.regionAId, source.regionBId)
      )
      : candidates[0];
    const a = candidate?.regionAId;
    const b = candidate?.regionBId;
    const key = getWorldConnectionKey(a, b);
    const exists = reservation.connectionKeys.has(key);
    if (!candidate || (source.mode === "add" && exists) || (source.mode === "remove" && !exists)) {
      return null;
    }
    if (source.mode === "add") reservation.connectionKeys.add(key);
    else reservation.connectionKeys.delete(key);
    return { kind: "connection", mode: source.mode, regionAId: a, regionBId: b };
  }
  return null;
}

export function buildDetailedDebugVassalCandidate(state, rawSpec = {}, candidateIndex = 0) {
  const lineage = state?.civilization?.vassalLineage;
  if (!lineage) return { ok: false, reason: "noLineage" };
  const locationRegionId = typeof rawSpec.locationRegionId === "string"
    ? rawSpec.locationRegionId : null;
  if (!getDetailedVassalDebugOptions(state).targetRegions.some(
    (entry) => entry.id === locationRegionId
  )) {
    return { ok: false, reason: "invalidLocationRegion" };
  }
  const read = (key, fallback) => Number.isFinite(rawSpec[key])
    ? Math.max(0, Math.floor(rawSpec[key])) : fallback;
  return {
    ok: true,
    candidate: {
      candidateId: `debug-candidate-${lineage.nextVassalId}-${Math.max(1, Math.floor(candidateIndex) + 1)}`,
      locationRegionId,
      age: read("age", 22),
      prestige: read("prestige", 11),
      stats: {
        cunning: read("cunning", 1),
        wisdom: read("wisdom", 1),
        effectiveness: read("effectiveness", 1),
        intelligence: read("intelligence", 1),
      },
      debugInjected: true,
    },
  };
}

export function replaceDetailedVassalSelectionCandidate(
  state,
  selectionPool,
  candidateIndex,
  rawSpec = {}
) {
  const safeIndex = Number.isFinite(candidateIndex) ? Math.floor(candidateIndex) : -1;
  if (!Array.isArray(selectionPool?.candidates) || safeIndex < 0
      || safeIndex >= selectionPool.candidates.length) {
    return { ok: false, reason: "invalidCandidate" };
  }
  const debugCandidate = buildDetailedDebugVassalCandidate(state, rawSpec, safeIndex);
  if (!debugCandidate.ok) return debugCandidate;
  const candidates = selectionPool.candidates.map((candidate, index) =>
    index === safeIndex
      ? {
        ...candidate,
        ...debugCandidate.candidate,
        originRegionId: debugCandidate.candidate.locationRegionId,
        portrait: clone(candidate.portrait),
        signatureNode: clone(candidate.signatureNode),
        candidateIndex: safeIndex,
      }
      : { ...candidate, candidateIndex: index }
  );
  return {
    ok: true,
    pool: {
      ...selectionPool,
      candidates,
      expectedPoolHash: candidatePoolHash(candidates.map(({ candidateIndex: _candidateIndex, ...candidate }) => candidate)),
    },
  };
}

export function selectDetailedVassalCandidate(
  state,
  candidateIndex,
  expectedPoolHash = null,
  rerollIndex = 0,
  candidateOverride = null
) {
  const lineage = state?.civilization?.vassalLineage;
  if (lineage?.currentVassal) return { ok: false, reason: "currentVassalAlive" };
  const safeRerollIndex = Number.isFinite(rerollIndex)
    ? Math.max(0, Math.min(999, Math.floor(rerollIndex)))
    : 0;
  let candidates = Array.isArray(lineage?.pendingCandidates)
    ? lineage.pendingCandidates
    : [];
  if (!Array.isArray(lineage?.pendingCandidates) || lineage.pendingCandidates.length === 0) {
    candidates = generateDetailedVassalCandidatesFromRngSnapshot(state, safeRerollIndex);
    if (candidateOverride != null) {
      const overrideResult = buildDetailedDebugVassalCandidate(state, candidateOverride, candidateIndex);
      if (!overrideResult.ok) return overrideResult;
      if (candidateIndex < 0 || candidateIndex >= candidates.length) {
        return { ok: false, reason: "invalidCandidate" };
      }
      candidates = candidates.map((candidate, index) =>
        index === candidateIndex ? overrideResult.candidate : candidate
      );
    }
    const actualHash = candidatePoolHash(candidates);
    if (expectedPoolHash && expectedPoolHash !== actualHash) {
      lineage.pendingCandidates = [];
      return { ok: false, reason: "selectionPoolMismatch", actualPoolHash: actualHash };
    }
  }
  const candidate = candidates[candidateIndex];
  if (!candidate) return { ok: false, reason: "invalidCandidate" };
  const schedule = getDetailedVassalCandidateSchedule(state, candidate);
  if (!schedule) return { ok: false, reason: "invalidCandidateSchedule" };
  const selected = {
    ...clone(candidate),
    vassalId: `vassal-${lineage.nextVassalId++}`,
    selectedYear: schedule.selectedYear,
    selectedSec: schedule.selectedSec,
    deathYear: schedule.deathYear,
    deathSec: schedule.deathSec,
    lastFaithYear: schedule.selectedYear,
    isDead: false,
  };
  lineage.currentVassal = selected;
  lineage.selectedVassals.push(clone(selected));
  lineage.pendingCandidates = [];
  return { ok: true, vassal: selected };
}

export function getDetailedVassalCandidateSchedule(state, candidate) {
  if (!state || !candidate || !Number.isFinite(candidate.initialAge)
      || !Number.isFinite(candidate.deathAge)) return null;
  const selectedYear = Math.max(1, Math.floor(state.year ?? 1));
  const selectedSec = Math.max(0, Math.floor(state.tSec ?? 0));
  const yearsUntilDeath = Math.max(
    1,
    Math.floor(candidate.deathAge) - Math.floor(candidate.initialAge)
  );
  const deathYear = selectedYear + yearsUntilDeath;
  const deathSec = getNextMoonPhaseBoundarySec(
    state,
    getDetailedYearStartSec(state, deathYear),
    MOON_PHASE_INDEX_BY_ID.faith
  );
  const scheduledVassal = {
    ...candidate,
    selectedYear,
    selectedSec,
    deathYear,
    deathSec,
  };
  const interventionEffectSecs = (candidate.interventions ?? []).map(
    (intervention) => getDetailedVassalInterventionEffectSec(
      state,
      scheduledVassal,
      intervention
    )
  );
  const finiteEffectSecs = interventionEffectSecs.filter(Number.isFinite);
  return {
    selectedYear,
    selectedSec,
    deathYear,
    deathSec,
    interventionEffectSecs,
    firstInterventionSec: finiteEffectSecs.length
      ? Math.min(...finiteEffectSecs)
      : null,
  };
}

export function getDetailedVassalPrestige(state, vassal = null) {
  const current = vassal ?? state?.civilization?.vassalLineage?.vassalsById?.[
    state?.civilization?.vassalLineage?.currentVassalId
  ];
  return current ? Math.max(0, Math.floor(current.prestige ?? 0)) : 0;
}

function createExpansionDetailedState(structureCapacity) {
  const state = createInitialDetailedSettlementData();
  state.populationByClass.villager = {
    children: 0,
    adults: 10,
    eldersByAge: [],
    faith: { tier: "gold", trend: null, streak: 0 },
    happiness: {
      status: "neutral",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
  };
  state.populationByClass.stranger = {
    children: 0,
    adults: 0,
    eldersByAge: [],
    faith: { tier: "gold", trend: null, streak: 0 },
    happiness: {
      status: "neutral",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
  };
  state.storedFood = 0;
  state.looseFood = 20;
  state.currency = 0;
  state.practiceSlots = [
    createDetailedPracticeSlot("forage"),
    null,
    null,
    null,
    null,
  ];
  state.structureSlots = Array.from(
    { length: Math.max(0, Math.floor(structureCapacity ?? 0)) },
    (_, index) => index === 0 ? { structureId: "mudHouses", tier: "bronze", width: 1, origin: 0, placementId: "founding:0" } : null
  );
  state.lastMeal = null;
  state.lastMoonResult = null;
  return state;
}

function applyExpansionIntervention(state, vassal, intervention) {
  const regionId = intervention.regionId;
  const sourceRegionId = intervention.sourceRegionId ?? vassal.targetRegionId;
  if (!getConnectedRegionIds(state, sourceRegionId).includes(regionId)) {
    return { ok: false, reason: "frontierNotConnected" };
  }
  const region = getRegionState(state, regionId);
  if (region?.controller !== "frontier" || region.detailedSettlementEnabled === true) {
    return { ok: false, reason: "frontierUnavailable" };
  }
  return establishDetailedSettlement(
    state,
    regionId,
    createExpansionDetailedState(region.structureCapacity)
  );
}

function applyGlobalStructureIntervention(state, intervention) {
  if (!settlementStructureDefs[intervention.structureId]) {
    return { ok: false, reason: "invalidStructure" };
  }
  const appliedRegionIds = [];
  const skippedRegionIds = [];
  for (const site of getDetailedSettlementSites(state, { playerOnly: true })) {
    if (!tryCreateStructure(state, site.regionId, intervention.structureId)) {
      skippedRegionIds.push(site.regionId);
      continue;
    }
    appliedRegionIds.push(site.regionId);
  }
  intervention.appliedRegionIds = appliedRegionIds;
  intervention.skippedRegionIds = skippedRegionIds;
  return appliedRegionIds.length > 0
    ? { ok: true }
    : { ok: false, reason: "structureSlotsUnavailable" };
}

// This is deliberately a selector, rather than a forecast mutation. The
// timeline can therefore describe a pending intervention at the exact Faith
// boundary where the annual Vassal stage will evaluate it.
export function getDetailedVassalInterventionEffectSec(state, vassal, intervention) {
  if (!state || !vassal || !intervention) return null;
  if (Number.isFinite(intervention.appliedSec)) {
    return Math.max(0, Math.floor(intervention.appliedSec));
  }
  if (intervention.status !== "pending" || !Number.isFinite(intervention.requiredPrestige)) {
    return null;
  }
  const selectedYear = Math.max(1, Math.floor(vassal.selectedYear ?? state.year ?? 1));
  const initialAge = Math.max(0, Math.floor(vassal.initialAge ?? 0));
  const traitModifier = Math.floor(vassal.traitPrestigeModifier ?? 0);
  const yearsUntilGate = Math.max(
    1,
    Math.ceil(Math.floor(intervention.requiredPrestige) - initialAge - traitModifier)
  );
  const effectYear = selectedYear + yearsUntilGate;
  const effectSec = getNextMoonPhaseBoundarySec(
    state,
    getDetailedYearStartSec(state, effectYear),
    MOON_PHASE_INDEX_BY_ID.faith
  );
  const deathSec = Number.isFinite(vassal.deathSec)
    ? Math.max(0, Math.floor(vassal.deathSec))
    : null;
  return deathSec != null && effectSec > deathSec ? null : effectSec;
}

function applyIntervention(state, vassal, intervention) {
  const localTargetRegionId = intervention?.targetRegionId ?? vassal.targetRegionId;
  const settlement = getDetailedSettlement(state, localTargetRegionId);
  let result = { ok: false, reason: "missingSettlement" };
  if (settlement && intervention?.kind === "practice") {
    const slotIndex = Math.floor(intervention.slotIndex);
    result = getDetailedPracticeDef(state, intervention.practiceId)
      && slotIndex >= 0 && slotIndex < DETAILED_PRACTICE_SLOT_COUNT
      ? { ok: true }
      : { ok: false, reason: "invalidPractice" };
    if (result.ok) {
      settlement.practiceSlots[slotIndex] = createDetailedPracticeSlot(intervention.practiceId);
    }
  } else if (settlement && intervention?.kind === "structure") {
    const slotIndex = Math.floor(intervention.slotIndex);
    const def = getDetailedStructureDef(state, intervention.structureId);
    result = def ? applyBuild(settlement.structureSlots, {
      structureId: intervention.structureId, tier: 'bronze', width: def.footprint ?? 1, origin: slotIndex,
      placementId: localTargetRegionId + ':' + state.tSec + ':' + slotIndex,
    }) : { ok: false, reason: 'invalidStructure' };
    if (result.ok) settlement.structureSlots = result.slots;
  } else if (intervention?.kind === "expandSettlement") {
    result = applyExpansionIntervention(state, vassal, intervention);
  } else if (intervention?.kind === "globalStructure") {
    result = applyGlobalStructureIntervention(state, intervention);
  } else if (intervention?.kind === "connection") {
    result = intervention.mode === "add"
      ? isPlayerDetailedRegion(state, intervention.regionAId)
          && isPlayerDetailedRegion(state, intervention.regionBId)
        ? addWorldConnection(state, intervention.regionAId, intervention.regionBId)
        : { ok: false, reason: "playerSettlementUnavailable" }
      : intervention.mode === "remove"
        ? removeWorldConnection(state, intervention.regionAId, intervention.regionBId)
        : { ok: false, reason: "invalidConnectionMode" };
  }
  intervention.appliedYear = state.year;
  intervention.appliedSec = state.tSec;
  if (result.ok) {
    intervention.status = "applied";
    return true;
  }
  intervention.status = "failed";
  intervention.failureReason = result.reason ?? "applyFailed";
  return false;
}

export function describeDetailedVassalIntervention(state, targetRegionId, intervention) {
  if (!intervention || typeof intervention !== "object") return "Unknown intervention";
  const targetRef = getRegionReference(state, targetRegionId) ?? targetRegionId;
  const localTargetRef = getRegionReference(state, intervention.targetRegionId) ?? targetRef;
  if (intervention.kind === "practice") {
    const label = getDetailedPracticeDef(state, intervention.practiceId)?.label
      ?? intervention.practiceId;
    const replaced = getDetailedPracticeDef(state, intervention.replacedPracticeId)?.label
      ?? intervention.replacedPracticeId;
    return intervention.mode === "replace" && replaced
      ? `Replace ${replaced} with ${label} — ${localTargetRef} slot ${Number(intervention.slotIndex) + 1}`
      : `Add ${label} — ${localTargetRef} slot ${Number(intervention.slotIndex) + 1}`;
  }
  if (intervention.kind === "structure") {
    const label = settlementStructureDefs[intervention.structureId]?.label
      ?? intervention.structureId;
    return `Add ${label} — ${localTargetRef}`;
  }
  if (intervention.kind === "expandSettlement") {
    const regionRef = getRegionReference(state, intervention.regionId) ?? intervention.regionId;
    const sourceRef = getRegionReference(state, intervention.sourceRegionId) ?? targetRef;
    return `Establish settlement ${regionRef} from ${sourceRef}`;
  }
  if (intervention.kind === "globalStructure") {
    const label = settlementStructureDefs[intervention.structureId]?.label
      ?? intervention.structureId;
    return `Add ${label} to all settlements with space`;
  }
  if (intervention.kind === "connection") {
    const left = getRegionReference(state, intervention.regionAId) ?? intervention.regionAId;
    const right = getRegionReference(state, intervention.regionBId) ?? intervention.regionBId;
    return `${intervention.mode === "remove" ? "Remove" : "Connect"} ${left} ↔ ${right}`;
  }
  return "Unknown intervention";
}

function runVassalAnnualBoundary(state) {
  const lineage = state.civilization.vassalLineage;
  const vassal = lineage.currentVassal;
  if (!vassal || vassal.isDead) return;
  const processedYear = Math.max(
    vassal.selectedYear,
    Math.floor(vassal.lastFaithYear ?? vassal.selectedYear)
  );
  if (state.year <= processedYear) return;
  const prestige = getDetailedVassalPrestige(state, vassal);
  for (const intervention of vassal.interventions) {
    if (intervention.status === "pending" && prestige >= intervention.requiredPrestige) {
      applyIntervention(state, vassal, intervention);
    }
  }
  const age = vassal.initialAge + Math.max(0, state.year - vassal.selectedYear);
  if (age >= vassal.deathAge) {
    vassal.isDead = true;
    vassal.deathYear = state.year;
    vassal.deathSec = state.tSec;
    for (const intervention of vassal.interventions) {
      if (intervention.status === "pending") intervention.status = "expired";
    }
    lineage.selectedVassals[lineage.selectedVassals.length - 1] = clone(vassal);
    lineage.currentVassal = null;
  } else {
    vassal.lastFaithYear = state.year;
    lineage.selectedVassals[lineage.selectedVassals.length - 1] = clone(vassal);
  }
}
