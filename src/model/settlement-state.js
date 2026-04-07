import {
  FAITH_STARTING_TIER,
  SETTLEMENT_HAPPINESS_FULL_FEED_STREAK_FOR_INCREASE,
  SETTLEMENT_HAPPINESS_MISSED_FEED_STREAK_FOR_STARVATION,
  SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH,
  SETTLEMENT_HAPPINESS_STARTING_LEVEL,
} from "../defs/gamesettings/gamerules-defs.js";
import { envTileDefs } from "../defs/gamepieces/env-tiles-defs.js";
import { TIER_ASC } from "./effects/core/tiers.js";

const DEFAULT_ORDER_SLOT_COUNT = 1;
const DEFAULT_PRACTICE_SLOT_COUNT = 5;
const DEFAULT_STRUCTURE_SLOT_COUNT = 6;
const DEFAULT_CLASS_ORDER = Object.freeze(["villager", "stranger"]);
const HAPPINESS_ASC = Object.freeze(["negative", "neutral", "positive"]);
const DEFAULT_VASSAL_LINEAGE_STATE = Object.freeze({
  nextVassalId: 1,
  nextPoolId: 1,
  selectedVassalIds: [],
  currentVassalId: null,
  pendingSelection: null,
  vassalsById: {},
});

export const SETTLEMENT_STOCKPILE_KEYS = Object.freeze([
  "food",
  "redResource",
  "greenResource",
  "blueResource",
  "blackResource",
]);

function cloneSerializable(value) {
  if (value == null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function createZoneSlots(count, key) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return new Array(safeCount).fill(null).map(() => ({ [key]: null }));
}

function normalizeStockpiles(raw) {
  const next = raw && typeof raw === "object" ? { ...raw } : {};
  for (const key of SETTLEMENT_STOCKPILE_KEYS) {
    next[key] = Number.isFinite(next[key]) ? Number(next[key]) : 0;
  }
  return next;
}

function normalizeTierId(value, fallback = "bronze") {
  const safeFallback = TIER_ASC.includes(fallback) ? fallback : TIER_ASC[0] || "bronze";
  if (typeof value !== "string") return safeFallback;
  return TIER_ASC.includes(value) ? value : safeFallback;
}

function getFaithStartingTier() {
  return normalizeTierId(FAITH_STARTING_TIER, "gold");
}

function normalizeHappinessStatus(value) {
  if (typeof value !== "string") {
    return HAPPINESS_ASC.includes(SETTLEMENT_HAPPINESS_STARTING_LEVEL)
      ? SETTLEMENT_HAPPINESS_STARTING_LEVEL
      : "neutral";
  }
  return HAPPINESS_ASC.includes(value)
    ? value
    : HAPPINESS_ASC.includes(SETTLEMENT_HAPPINESS_STARTING_LEVEL)
      ? SETTLEMENT_HAPPINESS_STARTING_LEVEL
      : "neutral";
}

function normalizeClassId(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeClassOrder(raw) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw) ? raw : DEFAULT_CLASS_ORDER) {
    const classId = normalizeClassId(entry);
    if (!classId || seen.has(classId)) continue;
    seen.add(classId);
    out.push(classId);
  }
  if (!out.length) {
    out.push(...DEFAULT_CLASS_ORDER);
  }
  return out;
}

function normalizePopulationYearlyState(raw) {
  const next =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  return {
    year: Number.isFinite(next.year) ? Math.max(1, Math.floor(next.year)) : 1,
    mealAttempts: Number.isFinite(next.mealAttempts)
      ? Math.max(0, Number(next.mealAttempts))
      : 0,
    mealSuccesses: Number.isFinite(next.mealSuccesses)
      ? Math.max(0, Number(next.mealSuccesses))
      : 0,
    attractionProgress: Number.isFinite(next.attractionProgress)
      ? Math.max(0, Number(next.attractionProgress))
      : 0,
    lastMealAttempts: Number.isFinite(next.lastMealAttempts)
      ? Math.max(0, Number(next.lastMealAttempts))
      : 0,
    lastMealSuccesses: Number.isFinite(next.lastMealSuccesses)
      ? Math.max(0, Number(next.lastMealSuccesses))
      : 0,
    lastOutcomeKind:
      typeof next.lastOutcomeKind === "string" && next.lastOutcomeKind.length > 0
        ? next.lastOutcomeKind
        : null,
    lastSeasonOutcomeKind:
      typeof next.lastSeasonOutcomeKind === "string" && next.lastSeasonOutcomeKind.length > 0
        ? next.lastSeasonOutcomeKind
        : null,
    lastSeasonFeedRatio: Number.isFinite(next.lastSeasonFeedRatio)
      ? Math.max(0, Math.min(1, Number(next.lastSeasonFeedRatio)))
      : 0,
  };
}

function normalizeFaithState(raw, fallbackTier = null) {
  const next =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  return {
    tier: normalizeTierId(next.tier, normalizeTierId(fallbackTier, getFaithStartingTier())),
  };
}

function normalizeHappinessState(raw) {
  const next =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const partialFeedRatios = Array.isArray(next.partialFeedRatios)
    ? next.partialFeedRatios
        .map((value) =>
          Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : null
        )
        .filter((value) => value != null)
        .slice(-Math.max(1, Math.floor(SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH || 3)))
    : [];
  return {
    status: normalizeHappinessStatus(next.status),
    fullFeedStreak: Number.isFinite(next.fullFeedStreak ?? next.positiveFeedStreak)
      ? Math.max(0, Math.floor(next.fullFeedStreak ?? next.positiveFeedStreak))
      : 0,
    missedFeedStreak: Number.isFinite(next.missedFeedStreak ?? next.negativeFeedStreak)
      ? Math.max(0, Math.floor(next.missedFeedStreak ?? next.negativeFeedStreak))
      : 0,
    partialFeedRatios,
  };
}

function normalizeCommitment(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const startSec = Number.isFinite(raw.startSec)
    ? Math.max(0, Math.floor(raw.startSec))
    : null;
  const releaseSec = Number.isFinite(raw.releaseSec)
    ? Math.max(0, Math.floor(raw.releaseSec))
    : null;
  if (releaseSec == null) return null;
  const amount = Number.isFinite(raw.amount) ? Math.max(0, Math.floor(raw.amount)) : 0;
  if (amount <= 0) return null;
  return {
    id: Number.isFinite(raw.id) ? Math.floor(raw.id) : null,
    amount,
    startSec,
    releaseSec,
    sourceId: typeof raw.sourceId === "string" ? raw.sourceId : null,
    label: typeof raw.label === "string" ? raw.label : null,
    vars:
      raw.vars && typeof raw.vars === "object" && !Array.isArray(raw.vars)
        ? cloneSerializable(raw.vars)
        : {},
    onReleaseEffects: Array.isArray(raw.onReleaseEffects) || raw.onReleaseEffects
      ? cloneSerializable(raw.onReleaseEffects)
      : null,
  };
}

function normalizePopulationClassState(raw, fallbackTier = null) {
  const next =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const commitments = Array.isArray(next.commitments)
    ? next.commitments.map(normalizeCommitment).filter(Boolean)
    : [];
  const legacyTotal = Number.isFinite(next.total) ? Math.max(0, Math.floor(next.total)) : 0;
  const adults = Number.isFinite(next.adults)
    ? Math.max(0, Math.floor(next.adults))
    : legacyTotal;
  const youth = Number.isFinite(next.youth) ? Math.max(0, Math.floor(next.youth)) : 0;
  return {
    adults,
    youth,
    commitments,
    yearly: normalizePopulationYearlyState(next.yearly),
    faith: normalizeFaithState(next.faith, fallbackTier),
    happiness: normalizeHappinessState(next.happiness),
  };
}

function normalizePopulationClasses(raw, classOrder, fallbackTier = null) {
  const next =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const safeOrder = normalizeClassOrder(classOrder);
  const out = {};
  for (const classId of safeOrder) {
    out[classId] = normalizePopulationClassState(next[classId], fallbackTier);
  }
  for (const [key, value] of Object.entries(next)) {
    const classId = normalizeClassId(key);
    if (!classId || Object.prototype.hasOwnProperty.call(out, classId)) continue;
    out[classId] = normalizePopulationClassState(value, fallbackTier);
  }
  return out;
}

function normalizeVassalLifeEvent(raw, fallbackIndex = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return {
    eventId:
      typeof raw.eventId === "string" && raw.eventId.length > 0
        ? raw.eventId
        : `vassal-event-${Math.max(0, Math.floor(fallbackIndex))}`,
    kind: typeof raw.kind === "string" && raw.kind.length > 0 ? raw.kind : "event",
    tSec: Number.isFinite(raw.tSec) ? Math.max(0, Math.floor(raw.tSec)) : 0,
    ageYears: Number.isFinite(raw.ageYears) ? Math.max(0, Math.floor(raw.ageYears)) : 0,
    classId: typeof raw.classId === "string" && raw.classId.length > 0 ? raw.classId : null,
    professionId:
      typeof raw.professionId === "string" && raw.professionId.length > 0 ? raw.professionId : null,
    traitId: typeof raw.traitId === "string" && raw.traitId.length > 0 ? raw.traitId : null,
    causeOfDeath:
      typeof raw.causeOfDeath === "string" && raw.causeOfDeath.length > 0 ? raw.causeOfDeath : null,
    text: typeof raw.text === "string" ? raw.text : "",
  };
}

function normalizeVassalRecord(raw, fallbackId = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const vassalId =
    typeof raw.vassalId === "string" && raw.vassalId.length > 0 ? raw.vassalId : fallbackId;
  if (!vassalId) return null;
  return {
    vassalId,
    poolId: typeof raw.poolId === "string" && raw.poolId.length > 0 ? raw.poolId : null,
    sourceClassId:
      typeof raw.sourceClassId === "string" && raw.sourceClassId.length > 0 ? raw.sourceClassId : "villager",
    currentClassId:
      typeof raw.currentClassId === "string" && raw.currentClassId.length > 0
        ? raw.currentClassId
        : typeof raw.sourceClassId === "string" && raw.sourceClassId.length > 0
          ? raw.sourceClassId
          : "villager",
    birthSec: Number.isFinite(raw.birthSec) ? Math.max(0, Math.floor(raw.birthSec)) : 0,
    birthYear: Number.isFinite(raw.birthYear) ? Math.max(1, Math.floor(raw.birthYear)) : 1,
    selectedSec: Number.isFinite(raw.selectedSec) ? Math.max(0, Math.floor(raw.selectedSec)) : 0,
    deathSec: Number.isFinite(raw.deathSec) ? Math.max(0, Math.floor(raw.deathSec)) : 0,
    deathYear: Number.isFinite(raw.deathYear) ? Math.max(1, Math.floor(raw.deathYear)) : 1,
    initialAgeYears: Number.isFinite(raw.initialAgeYears) ? Math.max(0, Math.floor(raw.initialAgeYears)) : 0,
    deathAgeYears: Number.isFinite(raw.deathAgeYears) ? Math.max(0, Math.floor(raw.deathAgeYears)) : 0,
    villagerAgeYears:
      Number.isFinite(raw.villagerAgeYears) ? Math.max(0, Math.floor(raw.villagerAgeYears)) : null,
    professionAgeYears:
      Number.isFinite(raw.professionAgeYears) ? Math.max(0, Math.floor(raw.professionAgeYears)) : null,
    traitAgeYears: Number.isFinite(raw.traitAgeYears) ? Math.max(0, Math.floor(raw.traitAgeYears)) : null,
    elderAgeYears: Number.isFinite(raw.elderAgeYears) ? Math.max(0, Math.floor(raw.elderAgeYears)) : null,
    agendaByClass:
      raw.agendaByClass && typeof raw.agendaByClass === "object" && !Array.isArray(raw.agendaByClass)
        ? cloneSerializable(raw.agendaByClass)
        : {},
    professionId:
      typeof raw.professionId === "string" && raw.professionId.length > 0 ? raw.professionId : null,
    traitId: typeof raw.traitId === "string" && raw.traitId.length > 0 ? raw.traitId : null,
    deathCause:
      typeof raw.deathCause === "string" && raw.deathCause.length > 0 ? raw.deathCause : null,
    councilMemberId:
      typeof raw.councilMemberId === "string" && raw.councilMemberId.length > 0
        ? raw.councilMemberId
        : null,
    joinedCouncilSec:
      Number.isFinite(raw.joinedCouncilSec) ? Math.max(0, Math.floor(raw.joinedCouncilSec)) : null,
    removedFromCouncilSec:
      Number.isFinite(raw.removedFromCouncilSec) ? Math.max(0, Math.floor(raw.removedFromCouncilSec)) : null,
    isDead: raw.isDead === true,
    isElder: raw.isElder === true,
    lifeEvents: Array.isArray(raw.lifeEvents)
      ? raw.lifeEvents.map((entry, index) => normalizeVassalLifeEvent(entry, index)).filter(Boolean)
      : [],
  };
}

function normalizeVassalCandidatePool(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates
        .map((entry, index) =>
          normalizeVassalRecord(
            entry,
            typeof entry?.vassalId === "string" && entry.vassalId.length > 0
              ? entry.vassalId
              : `vassal-pending-${index + 1}`
          )
        )
        .filter(Boolean)
    : [];
  return {
    poolId: typeof raw.poolId === "string" && raw.poolId.length > 0 ? raw.poolId : null,
    createdSec: Number.isFinite(raw.createdSec) ? Math.max(0, Math.floor(raw.createdSec)) : 0,
    candidates,
  };
}

function normalizeVassalLineageState(raw) {
  const next =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? cloneSerializable(raw)
      : cloneSerializable(DEFAULT_VASSAL_LINEAGE_STATE);
  const selectedVassalIds = Array.isArray(next.selectedVassalIds)
    ? next.selectedVassalIds.filter((entry) => typeof entry === "string" && entry.length > 0)
    : [];
  const vassalsById = {};
  if (next.vassalsById && typeof next.vassalsById === "object" && !Array.isArray(next.vassalsById)) {
    for (const [vassalId, value] of Object.entries(next.vassalsById)) {
      const record = normalizeVassalRecord(value, vassalId);
      if (!record) continue;
      vassalsById[record.vassalId] = record;
    }
  }
  const pendingSelection = normalizeVassalCandidatePool(next.pendingSelection);
  return {
    nextVassalId: Number.isFinite(next.nextVassalId) ? Math.max(1, Math.floor(next.nextVassalId)) : 1,
    nextPoolId: Number.isFinite(next.nextPoolId) ? Math.max(1, Math.floor(next.nextPoolId)) : 1,
    selectedVassalIds,
    currentVassalId:
      typeof next.currentVassalId === "string" && next.currentVassalId.length > 0
        ? next.currentVassalId
        : null,
    pendingSelection,
    vassalsById,
  };
}

function getTileSettlementState(tile) {
  const settlement = tile?.props?.settlement;
  if (!settlement || typeof settlement !== "object" || Array.isArray(settlement)) {
    return null;
  }
  return settlement;
}

function ensureTileSettlementState(tile) {
  if (!tile || typeof tile !== "object") return null;
  if (!tile.props || typeof tile.props !== "object" || Array.isArray(tile.props)) {
    tile.props = {};
  }
  if (
    !tile.props.settlement ||
    typeof tile.props.settlement !== "object" ||
    Array.isArray(tile.props.settlement)
  ) {
    tile.props.settlement = {};
  }
  const settlement = tile.props.settlement;
  settlement.greenResourceStored = Number.isFinite(settlement.greenResourceStored)
    ? Math.max(0, Math.floor(settlement.greenResourceStored))
    : 0;
  settlement.blueResourceStored = Number.isFinite(settlement.blueResourceStored)
    ? Math.max(0, Math.floor(settlement.blueResourceStored))
    : 0;
  return settlement;
}

function getFloodplainSettlementSpec(tile) {
  const def = envTileDefs?.[tile?.defId] ?? null;
  const settlementSpec =
    def?.settlementPrototype && typeof def.settlementPrototype === "object"
      ? def.settlementPrototype
      : null;
  return settlementSpec?.autumnFloods ? settlementSpec : null;
}

function createDerivedProps(raw = null) {
  const next = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  next.floodWindowArmed = next.floodWindowArmed === true;
  next.foodCapacity = Number.isFinite(next.foodCapacity)
    ? Math.max(0, Math.floor(next.foodCapacity))
    : 0;
  next.populationCapacity = Number.isFinite(next.populationCapacity)
    ? Math.max(0, Math.floor(next.populationCapacity))
    : 0;
  next.structureStaffingReserved = Number.isFinite(next.structureStaffingReserved)
    ? Math.max(0, Math.floor(next.structureStaffingReserved))
    : 0;
  next.committedPopulation = Number.isFinite(next.committedPopulation)
    ? Math.max(0, Math.floor(next.committedPopulation))
    : 0;
  next.freePopulation = Number.isFinite(next.freePopulation)
    ? Math.max(0, Math.floor(next.freePopulation))
    : 0;
  next.capabilities = Array.isArray(next.capabilities)
    ? next.capabilities.filter((entry) => typeof entry === "string")
    : [];
  next.activeStructureIds = Array.isArray(next.activeStructureIds)
    ? next.activeStructureIds
        .map((entry) => (Number.isFinite(entry) ? Math.floor(entry) : null))
        .filter((entry) => entry != null)
    : [];
  next.classSummaries =
    next.classSummaries && typeof next.classSummaries === "object" && !Array.isArray(next.classSummaries)
      ? cloneSerializable(next.classSummaries)
      : {};
  next.practicePassiveBonusesByClass =
    next.practicePassiveBonusesByClass &&
    typeof next.practicePassiveBonusesByClass === "object" &&
    !Array.isArray(next.practicePassiveBonusesByClass)
      ? cloneSerializable(next.practicePassiveBonusesByClass)
      : {};
  return next;
}

export function createHubCore() {
  const classOrder = normalizeClassOrder(null);
  return {
    instanceId: "hub.core",
    kind: "hubCore",
    props: createDerivedProps(),
    systemTiers: {
      stockpiles: "bronze",
      population: "bronze",
    },
    systemState: {
      stockpiles: normalizeStockpiles(null),
      populationClasses: normalizePopulationClasses(null, classOrder, getFaithStartingTier()),
      vassalLineage: normalizeVassalLineageState(null),
    },
  };
}

export function ensureHubCoreShape(core) {
  const target =
    core && typeof core === "object" && !Array.isArray(core) ? core : createHubCore();
  target.instanceId = "hub.core";
  target.kind = "hubCore";
  if (!target.systemTiers || typeof target.systemTiers !== "object") {
    target.systemTiers = {};
  }
  if (!target.systemState || typeof target.systemState !== "object") {
    target.systemState = {};
  }
  if (target.systemTiers.stockpiles == null) target.systemTiers.stockpiles = "bronze";
  if (target.systemTiers.population == null) target.systemTiers.population = "bronze";
  const fallbackTier = normalizeTierId(target.systemTiers.faith, getFaithStartingTier());
  target.systemState.stockpiles = normalizeStockpiles(target.systemState.stockpiles);

  const legacyPopulation =
    target.systemState.population &&
    typeof target.systemState.population === "object" &&
    !Array.isArray(target.systemState.population)
      ? target.systemState.population
      : null;
  const legacyFaith =
    target.systemState.faith &&
    typeof target.systemState.faith === "object" &&
    !Array.isArray(target.systemState.faith)
      ? target.systemState.faith
      : null;
  const rawPopulationClasses =
    target.systemState.populationClasses &&
    typeof target.systemState.populationClasses === "object" &&
    !Array.isArray(target.systemState.populationClasses)
      ? target.systemState.populationClasses
      : legacyPopulation
        ? {
            villager: {
              ...legacyPopulation,
              faith: {
                ...(legacyFaith || {}),
                tier: fallbackTier,
              },
            },
          }
        : null;
  target.systemState.populationClasses = normalizePopulationClasses(
    rawPopulationClasses,
    null,
    fallbackTier
  );
  target.systemState.vassalLineage = normalizeVassalLineageState(target.systemState.vassalLineage);
  delete target.systemState.population;
  delete target.systemState.faith;
  target.props = createDerivedProps(target.props);
  return target;
}

function ensureSlotShape(slot, key) {
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) return { [key]: null };
  if (!Object.prototype.hasOwnProperty.call(slot, key)) {
    slot[key] = null;
  }
  return slot;
}

function ensureZone(zone, count, key) {
  const target = zone && typeof zone === "object" && !Array.isArray(zone) ? zone : {};
  const fallbackCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!Array.isArray(target.slots)) {
    target.slots = createZoneSlots(fallbackCount, key);
  }
  if (target.slots.length < fallbackCount) {
    const missing = fallbackCount - target.slots.length;
    target.slots.push(...createZoneSlots(missing, key));
  }
  for (let i = 0; i < target.slots.length; i += 1) {
    target.slots[i] = ensureSlotShape(target.slots[i], key);
  }
  return target;
}

function getZoneSlotCount(rawZone, fallbackCount) {
  if (Array.isArray(rawZone?.slots)) return rawZone.slots.length;
  return fallbackCount;
}

function countOccupiedStructures(slots) {
  if (!Array.isArray(slots)) return 0;
  let count = 0;
  for (const slot of slots) {
    if (slot?.structure) count += 1;
  }
  return count;
}

export function ensureHubSettlementState(hub, colHint = DEFAULT_STRUCTURE_SLOT_COUNT) {
  const target = hub && typeof hub === "object" && !Array.isArray(hub) ? hub : {};
  const structureCountHint = Number.isFinite(colHint)
    ? Math.max(1, Math.floor(colHint))
    : DEFAULT_STRUCTURE_SLOT_COUNT;

  target.core = ensureHubCoreShape(target.core);
  target.classOrder = normalizeClassOrder(
    Array.isArray(target.classOrder)
      ? target.classOrder
      : Object.keys(target.core.systemState.populationClasses || {})
  );
  if (!target.zones || typeof target.zones !== "object" || Array.isArray(target.zones)) {
    target.zones = {};
  }

  const zoneStructureSlots = Array.isArray(target.zones?.structures?.slots)
    ? target.zones.structures.slots
    : null;
  const legacyStructureSlots = Array.isArray(target.slots) ? target.slots : null;
  let structureSlotsSource = zoneStructureSlots ?? legacyStructureSlots;
  if (zoneStructureSlots && legacyStructureSlots && zoneStructureSlots !== legacyStructureSlots) {
    structureSlotsSource =
      countOccupiedStructures(legacyStructureSlots) >= countOccupiedStructures(zoneStructureSlots)
        ? legacyStructureSlots
        : zoneStructureSlots;
  }
  if (!structureSlotsSource) {
    structureSlotsSource = createZoneSlots(structureCountHint, "structure");
  }
  const structureCount = getZoneSlotCount(
    { slots: structureSlotsSource },
    structureCountHint
  );

  target.zones.order = ensureZone(
    target.zones.order,
    getZoneSlotCount(target.zones.order, DEFAULT_ORDER_SLOT_COUNT),
    "card"
  );
  if (
    !target.zones.practiceByClass ||
    typeof target.zones.practiceByClass !== "object" ||
    Array.isArray(target.zones.practiceByClass)
  ) {
    target.zones.practiceByClass = {};
  }
  for (const classId of target.classOrder) {
    const existingZone =
      target.zones.practiceByClass[classId] ??
      (classId === target.classOrder[0] ? target.zones.practice : null);
    target.zones.practiceByClass[classId] = ensureZone(
      existingZone,
      getZoneSlotCount(existingZone, DEFAULT_PRACTICE_SLOT_COUNT),
      "card"
    );
  }
  delete target.zones.practice;
  target.zones.structures = ensureZone(
    { ...(target.zones.structures || {}), slots: structureSlotsSource },
    structureCount,
    "structure"
  );

  target.slots = target.zones.structures.slots;
  target.cols = target.zones.structures.slots.length;
  return target;
}

export function createSettlementCardInstance(defId, cardKind, state, overrides = null) {
  const nextId = Number.isFinite(state?.nextSettlementCardInstanceId)
    ? Math.max(1, Math.floor(state.nextSettlementCardInstanceId))
    : 1;
  if (state && typeof state === "object") {
    state.nextSettlementCardInstanceId = nextId + 1;
  }
  const instance = {
    instanceId: nextId,
    defId,
    kind: cardKind,
    props: {},
    systemTiers: {},
    systemState: {},
  };
  if (overrides && typeof overrides === "object") {
    for (const key of ["props", "systemTiers", "systemState"]) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        instance[key] = cloneSerializable(overrides[key]);
      }
    }
  }
  return instance;
}

export function getHubCore(state) {
  return state?.hub?.core ?? null;
}

export function getSettlementClassIds(state) {
  const explicitOrder = Array.isArray(state?.hub?.classOrder) ? state.hub.classOrder : [];
  const populationClasses = getHubCore(state)?.systemState?.populationClasses;
  return normalizeClassOrder(
    explicitOrder.length ? explicitOrder : Object.keys(populationClasses || {})
  );
}

export function getSettlementPrimaryClassId(state) {
  return getSettlementClassIds(state)[0] ?? DEFAULT_CLASS_ORDER[0];
}

export function getSettlementPopulationClasses(state) {
  const core = getHubCore(state);
  const populationClasses = core?.systemState?.populationClasses;
  return populationClasses && typeof populationClasses === "object" ? populationClasses : {};
}

export function getSettlementYearDurationSec(state) {
  const seasons = Array.isArray(state?.seasons) && state.seasons.length > 0 ? state.seasons : [0, 1, 2, 3];
  const seasonDurationSec = Number.isFinite(state?.seasonDurationSec)
    ? Math.max(1, Math.floor(state.seasonDurationSec))
    : 32;
  return seasonDurationSec * seasons.length;
}

export function getSettlementYearStartSec(state, year) {
  const safeYear = Number.isFinite(year) ? Math.max(1, Math.floor(year)) : 1;
  return Math.max(0, (safeYear - 1) * getSettlementYearDurationSec(state));
}

export function getSettlementVassalLineageState(state) {
  return getHubCore(state)?.systemState?.vassalLineage ?? null;
}

export function getSettlementCurrentVassal(state) {
  const lineage = getSettlementVassalLineageState(state);
  const currentVassalId =
    typeof lineage?.currentVassalId === "string" && lineage.currentVassalId.length > 0
      ? lineage.currentVassalId
      : null;
  if (!currentVassalId) return null;
  return lineage?.vassalsById?.[currentVassalId] ?? null;
}

export function getSettlementPendingVassalSelection(state) {
  return getSettlementVassalLineageState(state)?.pendingSelection ?? null;
}

export function getSettlementSelectedVassals(state) {
  const lineage = getSettlementVassalLineageState(state);
  const selectedIds = Array.isArray(lineage?.selectedVassalIds) ? lineage.selectedVassalIds : [];
  const byId = lineage?.vassalsById ?? {};
  return selectedIds.map((vassalId) => byId?.[vassalId] ?? null).filter(Boolean);
}

export function getSettlementFirstSelectedVassal(state) {
  return getSettlementSelectedVassals(state)[0] ?? null;
}

export function getSettlementLatestSelectedVassalDeathSec(state) {
  let latestDeathSec = 0;
  for (const vassal of getSettlementSelectedVassals(state)) {
    latestDeathSec = Math.max(
      latestDeathSec,
      Number.isFinite(vassal?.deathSec) ? Math.max(0, Math.floor(vassal.deathSec)) : 0
    );
  }
  return latestDeathSec;
}

export function getSettlementVisibleVassalLifeEvents(state, vassalId, tSec = null) {
  const lineage = getSettlementVassalLineageState(state);
  const record =
    typeof vassalId === "string" && vassalId.length > 0 ? lineage?.vassalsById?.[vassalId] ?? null : null;
  if (!record) return [];
  const safeTSec = Number.isFinite(tSec)
    ? Math.max(0, Math.floor(tSec))
    : Math.max(0, Math.floor(state?.tSec ?? 0));
  return (Array.isArray(record.lifeEvents) ? record.lifeEvents : []).filter(
    (entry) => Math.max(0, Math.floor(entry?.tSec ?? 0)) <= safeTSec
  );
}

export function getSettlementPopulationClassState(state, classId = null) {
  const safeClassId = normalizeClassId(classId) ?? getSettlementPrimaryClassId(state);
  return getSettlementPopulationClasses(state)?.[safeClassId] ?? null;
}

export function getSettlementZone(state, zoneId) {
  return state?.hub?.zones?.[zoneId] ?? null;
}

export function getSettlementStructureSlots(state) {
  return Array.isArray(state?.hub?.zones?.structures?.slots)
    ? state.hub.zones.structures.slots
    : [];
}

export function getSettlementPracticeSlotsByClass(state, classId = null) {
  const safeClassId = normalizeClassId(classId) ?? getSettlementPrimaryClassId(state);
  return Array.isArray(state?.hub?.zones?.practiceByClass?.[safeClassId]?.slots)
    ? state.hub.zones.practiceByClass[safeClassId].slots
    : [];
}

export function getSettlementPracticeSlots(state, classId = null) {
  return getSettlementPracticeSlotsByClass(state, classId);
}

export function getSettlementOrderSlots(state) {
  return Array.isArray(state?.hub?.zones?.order?.slots)
    ? state.hub.zones.order.slots
    : [];
}

export function getSettlementFloodplainTiles(state) {
  const tiles = Array.isArray(state?.board?.layers?.tile?.anchors)
    ? state.board.layers.tile.anchors
    : [];
  return tiles.filter((tile) => getFloodplainSettlementSpec(tile));
}

export function getSettlementHinterlandTiles(state) {
  const tiles = Array.isArray(state?.board?.layers?.tile?.anchors)
    ? state.board.layers.tile.anchors
    : [];
  return tiles.filter((tile) => tile?.defId === "tile_hinterland");
}

export function getSettlementTileGreenResource(tile) {
  const value = getTileSettlementState(tile)?.greenResourceStored;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function getSettlementTileBlueResource(tile) {
  const value = getTileSettlementState(tile)?.blueResourceStored;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function setSettlementTileGreenResource(tile, amount) {
  const settlement = ensureTileSettlementState(tile);
  if (!settlement) return 0;
  settlement.greenResourceStored = Number.isFinite(amount)
    ? Math.max(0, Math.floor(amount))
    : 0;
  return settlement.greenResourceStored;
}

export function setSettlementTileBlueResource(tile, amount) {
  const settlement = ensureTileSettlementState(tile);
  if (!settlement) return 0;
  settlement.blueResourceStored = Number.isFinite(amount)
    ? Math.max(0, Math.floor(amount))
    : 0;
  return settlement.blueResourceStored;
}

export function getSettlementFloodplainGreenTotal(state) {
  return getSettlementFloodplainTiles(state).reduce(
    (sum, tile) => sum + getSettlementTileGreenResource(tile),
    0
  );
}

export function getSettlementHinterlandBlueTotal(state) {
  return getSettlementHinterlandTiles(state).reduce(
    (sum, tile) => sum + getSettlementTileBlueResource(tile),
    0
  );
}

export function syncSettlementFloodplainGreenResource(state, desiredTotal = null) {
  const stockpiles = getHubCore(state)?.systemState?.stockpiles ?? null;
  const floodplainTiles = getSettlementFloodplainTiles(state);
  const currentTotal = floodplainTiles.reduce(
    (sum, tile) => sum + getSettlementTileGreenResource(tile),
    0
  );
  const targetTotal = Number.isFinite(desiredTotal)
    ? Math.max(0, Math.floor(desiredTotal))
    : currentTotal;

  if (targetTotal < currentTotal) {
    let remainingToRemove = currentTotal - targetTotal;
    for (const tile of floodplainTiles) {
      if (remainingToRemove <= 0) break;
      const current = getSettlementTileGreenResource(tile);
      const removed = Math.min(current, remainingToRemove);
      setSettlementTileGreenResource(tile, current - removed);
      remainingToRemove -= removed;
    }
  } else if (targetTotal > currentTotal && floodplainTiles.length > 0) {
    const firstTile = floodplainTiles[0];
    const current = getSettlementTileGreenResource(firstTile);
    setSettlementTileGreenResource(firstTile, current + (targetTotal - currentTotal));
  }

  const actualTotal = floodplainTiles.reduce(
    (sum, tile) => sum + getSettlementTileGreenResource(tile),
    0
  );
  if (stockpiles && typeof stockpiles === "object") {
    stockpiles.greenResource = actualTotal;
  }
  return actualTotal;
}

export function clearSettlementFloodplainGreenResource(state) {
  const floodplainTiles = getSettlementFloodplainTiles(state);
  for (const tile of floodplainTiles) {
    setSettlementTileGreenResource(tile, 0);
  }
  return syncSettlementFloodplainGreenResource(state, 0);
}

export function syncSettlementHinterlandBlueResource(state, desiredTotal = null) {
  const stockpiles = getHubCore(state)?.systemState?.stockpiles ?? null;
  const hinterlandTiles = getSettlementHinterlandTiles(state);
  const currentTotal = hinterlandTiles.reduce(
    (sum, tile) => sum + getSettlementTileBlueResource(tile),
    0
  );
  const targetTotal = Number.isFinite(desiredTotal)
    ? Math.max(0, Math.floor(desiredTotal))
    : currentTotal;

  if (targetTotal < currentTotal) {
    let remainingToRemove = currentTotal - targetTotal;
    for (let index = hinterlandTiles.length - 1; index >= 0 && remainingToRemove > 0; index -= 1) {
      const tile = hinterlandTiles[index];
      const current = getSettlementTileBlueResource(tile);
      const removed = Math.min(current, remainingToRemove);
      setSettlementTileBlueResource(tile, current - removed);
      remainingToRemove -= removed;
    }
  } else if (targetTotal > currentTotal && hinterlandTiles.length > 0) {
    let remainingToAdd = targetTotal - currentTotal;
    for (const tile of hinterlandTiles) {
      if (remainingToAdd <= 0) break;
      setSettlementTileBlueResource(
        tile,
        getSettlementTileBlueResource(tile) + 1
      );
      remainingToAdd -= 1;
    }
    if (remainingToAdd > 0) {
      const lastTile = hinterlandTiles[hinterlandTiles.length - 1];
      setSettlementTileBlueResource(
        lastTile,
        getSettlementTileBlueResource(lastTile) + remainingToAdd
      );
    }
  }

  const actualTotal = hinterlandTiles.reduce(
    (sum, tile) => sum + getSettlementTileBlueResource(tile),
    0
  );
  if (stockpiles && typeof stockpiles === "object") {
    stockpiles.blueResource = actualTotal;
  }
  return actualTotal;
}

export function getSettlementStockpile(state, key) {
  const stockpiles = getHubCore(state)?.systemState?.stockpiles;
  if (!stockpiles || typeof stockpiles !== "object") return 0;
  return Number.isFinite(stockpiles[key]) ? Number(stockpiles[key]) : 0;
}

function getCommitmentAmount(commitment) {
  return Number.isFinite(commitment?.amount) ? Math.max(0, Math.floor(commitment.amount)) : 0;
}

function buildClassPopulationSummary(state, classId) {
  const populationClass = getSettlementPopulationClassState(state, classId);
  const props = getHubCore(state)?.props;
  const derived =
    props?.classSummaries && typeof props.classSummaries === "object"
      ? props.classSummaries[classId]
      : null;
  const adults = Number.isFinite(derived?.adults)
    ? Math.max(0, Math.floor(derived.adults))
    : Number.isFinite(populationClass?.adults)
      ? Math.max(0, Math.floor(populationClass.adults))
      : Number.isFinite(populationClass?.total)
        ? Math.max(0, Math.floor(populationClass.total))
        : 0;
  const youth = Number.isFinite(derived?.youth)
    ? Math.max(0, Math.floor(derived.youth))
    : Number.isFinite(populationClass?.youth)
      ? Math.max(0, Math.floor(populationClass.youth))
      : 0;
  const total = Number.isFinite(derived?.total)
    ? Math.max(0, Math.floor(derived.total))
    : adults + youth;
  const committed = Number.isFinite(derived?.committed)
    ? Math.max(0, Math.floor(derived.committed))
    : Array.isArray(populationClass?.commitments)
      ? populationClass.commitments.reduce(
          (sum, commitment) => sum + getCommitmentAmount(commitment),
          0
        )
      : 0;
  const staffed = Number.isFinite(derived?.staffed)
    ? Math.max(0, Math.floor(derived.staffed))
    : 0;
  const free = Number.isFinite(derived?.free)
    ? Math.max(0, Math.floor(derived.free))
    : Math.max(0, adults - committed - staffed);
  const reserved = Number.isFinite(derived?.reserved)
    ? Math.max(0, Math.floor(derived.reserved))
    : committed + staffed;
  const faith = populationClass?.faith ?? null;
  const happiness = populationClass?.happiness ?? null;
  return {
    classId,
    adults,
    youth,
    total,
    workPopulation: adults,
    committed,
    staffed,
    reserved,
    free,
    capacity: Number.isFinite(props?.populationCapacity)
      ? Math.max(0, Math.floor(props.populationCapacity))
      : 0,
    faithTier: normalizeTierId(faith?.tier, getFaithStartingTier()),
    happinessStatus: normalizeHappinessStatus(happiness?.status),
    fullFeedStreak: Number.isFinite(happiness?.fullFeedStreak)
      ? Math.max(0, Math.floor(happiness.fullFeedStreak))
      : 0,
    missedFeedStreak: Number.isFinite(happiness?.missedFeedStreak)
      ? Math.max(0, Math.floor(happiness.missedFeedStreak))
      : 0,
    partialFeedRatios: Array.isArray(happiness?.partialFeedRatios)
      ? happiness.partialFeedRatios.map((value) =>
          Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : 0
        )
      : [],
  };
}

export function getSettlementPopulationSummary(state, classId = null) {
  if (classId) {
    return buildClassPopulationSummary(state, classId);
  }
  const classIds = getSettlementClassIds(state);
  const byClass = {};
  let adults = 0;
  let youth = 0;
  let total = 0;
  let committed = 0;
  let staffed = 0;
  let reserved = 0;
  let free = 0;
  for (const id of classIds) {
    const summary = buildClassPopulationSummary(state, id);
    byClass[id] = summary;
    adults += summary.adults;
    youth += summary.youth;
    total += summary.total;
    committed += summary.committed;
    staffed += summary.staffed;
    reserved += summary.reserved;
    free += summary.free;
  }
  const props = getHubCore(state)?.props;
  return {
    adults,
    youth,
    total,
    workPopulation: adults,
    committed,
    staffed,
    reserved,
    free,
    capacity: Number.isFinite(props?.populationCapacity)
      ? Math.max(0, Math.floor(props.populationCapacity))
      : 0,
    byClass,
  };
}

export function getSettlementCapabilities(state) {
  const capabilities = getHubCore(state)?.props?.capabilities;
  if (!Array.isArray(capabilities)) return [];
  return capabilities.filter((entry) => typeof entry === "string");
}

export function getSettlementFaithTier(state, classId = null) {
  return normalizeTierId(
    getSettlementPopulationClassState(state, classId)?.faith?.tier,
    getFaithStartingTier()
  );
}

export function getSettlementFaithState(state, classId = null) {
  const faith = getSettlementPopulationClassState(state, classId)?.faith;
  return faith && typeof faith === "object" ? faith : null;
}

export function getSettlementFaithSummary(state, classId = null) {
  const tier = getSettlementFaithTier(state, classId);
  return {
    tier,
  };
}

export function getSettlementFaithGraphValue(state, classId = null) {
  const tier = getSettlementFaithTier(state, classId);
  const rank = Math.max(0, TIER_ASC.indexOf(tier));
  return (rank + 1) * 25;
}

export function getSettlementHappinessState(state, classId = null) {
  const happiness = getSettlementPopulationClassState(state, classId)?.happiness;
  return happiness && typeof happiness === "object" ? happiness : null;
}

export function getSettlementHappinessSummary(state, classId = null) {
  const happinessState = getSettlementHappinessState(state, classId);
  const fullFeedThreshold = Number.isFinite(SETTLEMENT_HAPPINESS_FULL_FEED_STREAK_FOR_INCREASE)
    ? Math.max(1, Math.floor(SETTLEMENT_HAPPINESS_FULL_FEED_STREAK_FOR_INCREASE))
    : 3;
  const missedFeedThreshold = Number.isFinite(SETTLEMENT_HAPPINESS_MISSED_FEED_STREAK_FOR_STARVATION)
    ? Math.max(1, Math.floor(SETTLEMENT_HAPPINESS_MISSED_FEED_STREAK_FOR_STARVATION))
    : 3;
  const partialMemoryLength = Number.isFinite(SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH)
    ? Math.max(1, Math.floor(SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH))
    : 3;
  return {
    status: normalizeHappinessStatus(happinessState?.status),
    fullFeedStreak: Number.isFinite(happinessState?.fullFeedStreak)
      ? Math.max(0, Math.floor(happinessState.fullFeedStreak))
      : 0,
    missedFeedStreak: Number.isFinite(happinessState?.missedFeedStreak)
      ? Math.max(0, Math.floor(happinessState.missedFeedStreak))
      : 0,
    partialFeedRatios: Array.isArray(happinessState?.partialFeedRatios)
      ? happinessState.partialFeedRatios.map((value) =>
          Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : 0
        )
      : [],
    fullFeedThreshold,
    missedFeedThreshold,
    partialMemoryLength,
  };
}

export function getSettlementHappinessGraphValue(state, classId = null) {
  const status = getSettlementHappinessSummary(state, classId).status;
  if (status === "positive") return 100;
  if (status === "negative") return 0;
  return 50;
}

export function isSettlementPrototypeEnabled(state) {
  return state?.variantFlags?.settlementPrototypeEnabled === true;
}
