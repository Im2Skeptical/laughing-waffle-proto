import { envEventDefs } from "../../defs/gamepieces/env-events-defs.js";
import { hubStructureDefs } from "../../defs/gamepieces/hub-structure-defs.js";
import { settlementPracticeDefs } from "../../defs/gamepieces/settlement-practice-defs.js";
import {
  buildSeasonDeckForCurrentSeason,
  getCurrentSeasonKey,
  makeHubStructureInstance,
  rebuildHubOccupancy,
} from "../state.js";
import { getApCapForSecond, normalizeApState } from "./ap-helpers.js";
import {
  createSettlementCardInstance,
  ensureHubSettlementState,
  getSettlementClassIds,
  getSettlementPracticeSlotsByClass,
  getSettlementStructureSlots,
} from "../settlement-state.js";
import { syncSettlementDerivedState } from "../settlement-exec.js";
import { setDebugPracticeBoardSlot } from "../settlement-order-exec.js";
import { TIER_ASC } from "../effects/core/tiers.js";

function normalizeTier(value, fallback = "bronze") {
  const safeFallback = TIER_ASC.includes(fallback) ? fallback : "bronze";
  return typeof value === "string" && TIER_ASC.includes(value)
    ? value
    : safeFallback;
}

function normalizeSlotIndex(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function isPracticeEligibleForClass(def, classId) {
  const eligible = Array.isArray(def?.orderEligibleClassIds)
    ? def.orderEligibleClassIds
    : [];
  return eligible.length === 0 || eligible.includes(classId);
}

function clearOwnerInventoryForStructure(state, structure) {
  const instanceId = structure?.instanceId;
  if (instanceId == null || !state?.ownerInventories) return;
  delete state.ownerInventories[instanceId];
}

function getStructureSpan(structureOrDefId) {
  const defId =
    typeof structureOrDefId === "string"
      ? structureOrDefId
      : structureOrDefId?.defId;
  const def = typeof defId === "string" ? hubStructureDefs[defId] : null;
  const rawSpan = Number.isFinite(structureOrDefId?.span)
    ? structureOrDefId.span
    : def?.defaultSpan;
  return Number.isFinite(rawSpan) && rawSpan > 0 ? Math.floor(rawSpan) : 1;
}

function clearStructuresOverlappingRange(state, startSlot, span) {
  const slots = getSettlementStructureSlots(state);
  const start = Math.max(0, Math.floor(startSlot));
  const end = start + Math.max(1, Math.floor(span));
  for (let index = 0; index < slots.length; index += 1) {
    const structure = slots[index]?.structure ?? null;
    if (!structure) continue;
    const anchor = Number.isFinite(structure.col) ? Math.floor(structure.col) : index;
    const structureSpan = getStructureSpan(structure);
    const structureEnd = anchor + structureSpan;
    const overlaps = anchor < end && structureEnd > start;
    if (!overlaps) continue;
    clearOwnerInventoryForStructure(state, structure);
    setDebugStructureOverrideSlot(state, index, false);
    slots[index].structure = null;
  }
}

function ensureDebugStructureOverrideSlots(state) {
  ensureHubSettlementState(state.hub, state.hub?.cols);
  const structuresZone = state.hub?.zones?.structures;
  if (!structuresZone || typeof structuresZone !== "object" || Array.isArray(structuresZone)) {
    return null;
  }
  if (
    !structuresZone.debugOverrideSlots ||
    typeof structuresZone.debugOverrideSlots !== "object" ||
    Array.isArray(structuresZone.debugOverrideSlots)
  ) {
    structuresZone.debugOverrideSlots = {};
  }
  return structuresZone.debugOverrideSlots;
}

function setDebugStructureOverrideSlot(state, slotIndex, active) {
  const slots = getSettlementStructureSlots(state);
  const safeSlotIndex = normalizeSlotIndex(slotIndex);
  if (safeSlotIndex == null || safeSlotIndex >= slots.length) return false;
  const overrides = ensureDebugStructureOverrideSlots(state);
  if (!overrides) return false;
  if (active === true) {
    overrides[String(safeSlotIndex)] = true;
  } else {
    delete overrides[String(safeSlotIndex)];
  }
  if (Object.keys(overrides).length === 0) {
    delete state.hub.zones.structures.debugOverrideSlots;
  }
  return true;
}

function clearDebugStructureOverrideSlotsInRange(state, startSlot, span) {
  const start = Math.max(0, Math.floor(startSlot));
  const end = start + Math.max(1, Math.floor(span));
  for (let slotIndex = start; slotIndex < end; slotIndex += 1) {
    setDebugStructureOverrideSlot(state, slotIndex, false);
  }
}

function applyPracticeOverride(state, override) {
  const classId = typeof override?.classId === "string" ? override.classId : null;
  const classIds = getSettlementClassIds(state);
  if (!classId || !classIds.includes(classId)) {
    return { ok: false, reason: "badClassId", classId };
  }

  const slots = getSettlementPracticeSlotsByClass(state, classId);
  const slotIndex = normalizeSlotIndex(override?.slotIndex);
  if (slotIndex == null || slotIndex >= slots.length) {
    return { ok: false, reason: "badPracticeSlot", classId, slotIndex };
  }

  if (override?.clearOverride === true) {
    setDebugPracticeBoardSlot(state, classId, slotIndex, null, {
      clearOverride: true,
    });
    return { ok: true, changed: true };
  }

  const defId = typeof override?.defId === "string" ? override.defId : null;
  if (!defId) {
    slots[slotIndex].card = null;
    setDebugPracticeBoardSlot(state, classId, slotIndex, null);
    return { ok: true, changed: true };
  }

  const def = settlementPracticeDefs[defId];
  if (!def || !isPracticeEligibleForClass(def, classId)) {
    return { ok: false, reason: "badPracticeDef", classId, defId };
  }

  slots[slotIndex].card = createSettlementCardInstance(
    defId,
    "settlementPractice",
    state,
    {
      tier: normalizeTier(override?.tier),
    }
  );
  setDebugPracticeBoardSlot(state, classId, slotIndex, defId);
  return { ok: true, changed: true };
}

function applyStructureOverride(state, override) {
  ensureHubSettlementState(state.hub, state.hub?.cols);
  rebuildHubOccupancy(state);

  const slots = getSettlementStructureSlots(state);
  const slotIndex = normalizeSlotIndex(override?.slotIndex);
  if (slotIndex == null || slotIndex >= slots.length) {
    return { ok: false, reason: "badStructureSlot", slotIndex };
  }

  if (override?.clearOverride === true) {
    setDebugStructureOverrideSlot(state, slotIndex, false);
    return { ok: true, changed: true };
  }

  const defId = typeof override?.defId === "string" ? override.defId : null;
  if (!defId) {
    clearStructuresOverlappingRange(state, slotIndex, 1);
    setDebugStructureOverrideSlot(state, slotIndex, true);
    rebuildHubOccupancy(state);
    return { ok: true, changed: true };
  }

  const def = hubStructureDefs[defId];
  if (!def) return { ok: false, reason: "badStructureDef", defId };

  const span =
    Number.isFinite(def.defaultSpan) && def.defaultSpan > 0
      ? Math.floor(def.defaultSpan)
      : 1;
  if (slotIndex + span > slots.length) {
    return { ok: false, reason: "structureDoesNotFit", defId, slotIndex, span };
  }

  clearStructuresOverlappingRange(state, slotIndex, span);
  clearDebugStructureOverrideSlotsInRange(state, slotIndex, span);
  const structure = makeHubStructureInstance(defId, state, {
    tier: normalizeTier(override?.tier),
  });
  structure.tier = normalizeTier(override?.tier);
  slots[slotIndex] = { structure };
  setDebugStructureOverrideSlot(state, slotIndex, true);
  rebuildHubOccupancy(state);
  return { ok: true, changed: true };
}

export function cmdDebugSetCap(state, { cap, points, enabled } = {}) {
  normalizeApState(state);

  const enableOverride =
    typeof enabled === "boolean"
      ? enabled
      : typeof cap === "number" || typeof points === "number";

  if (enableOverride) {
    const overrideCap =
      typeof cap === "number"
        ? Math.max(0, Math.floor(cap))
        : Math.max(0, Math.floor(state.actionPointCap ?? 0));
    const overridePoints = typeof points === "number" ? Math.floor(points) : overrideCap;

    state.apCapOverride = {
      enabled: true,
      cap: overrideCap,
      points: overridePoints,
    };

    state.actionPointCap = overrideCap;
    state.actionPoints = Math.min(state.actionPointCap, Math.max(0, overridePoints));
  } else {
    state.apCapOverride = null;
    state.actionPointCap = getApCapForSecond(state, state.tSec ?? 0);
    state.actionPoints = Math.min(state.actionPoints, state.actionPointCap);
  }

  return {
    ok: true,
    actionPointCap: state.actionPointCap,
    actionPoints: state.actionPoints,
    apCapOverride: state.apCapOverride,
  };
}

export function cmdDebugQueueEnvEvent(state, { defId } = {}) {
  if (!defId || typeof defId !== "string") {
    return { ok: false, reason: "badDefId" };
  }
  if (!envEventDefs[defId]) {
    return { ok: false, reason: "unknownEvent" };
  }

  const seasonKey = getCurrentSeasonKey(state);
  const seasonIndex = Number.isFinite(state?.currentSeasonIndex)
    ? Math.floor(state.currentSeasonIndex)
    : 0;
  const year = Number.isFinite(state?.year) ? Math.floor(state.year) : 1;
  if (!state.currentSeasonDeck || state.currentSeasonDeck.seasonKey !== seasonKey) {
    buildSeasonDeckForCurrentSeason(state);
  }
  if (!state.currentSeasonDeck || !Array.isArray(state.currentSeasonDeck.deck)) {
    state.currentSeasonDeck = { seasonKey, seasonIndex, year, deck: [] };
  }

  state.currentSeasonDeck.deck.unshift({ defId });
  return { ok: true, result: "eventQueued", defId };
}

export function cmdDebugSetSettlementSlotOverrides(state, { overrides } = {}) {
  if (!state?.hub || !Array.isArray(overrides)) {
    return { ok: false, reason: "badOverrides" };
  }

  ensureHubSettlementState(state.hub, state.hub?.cols);
  const results = [];
  let changed = false;

  for (const override of overrides) {
    if (!override || typeof override !== "object") {
      return { ok: false, reason: "badOverrideEntry", results };
    }
    const zone = override.zone;
    const result =
      zone === "practice"
        ? applyPracticeOverride(state, override)
        : zone === "structure"
          ? applyStructureOverride(state, override)
          : { ok: false, reason: "badOverrideZone", zone };
    results.push(result);
    if (!result?.ok) {
      return { ok: false, reason: result?.reason ?? "overrideFailed", results };
    }
    changed = result.changed === true || changed;
  }

  if (changed) {
    rebuildHubOccupancy(state);
    syncSettlementDerivedState(state, state.tSec ?? 0);
  }

  return {
    ok: true,
    result: "settlementSlotOverridesApplied",
    count: overrides.length,
    results,
  };
}
