// Legacy hub/settlement state. Current/selected vassal reads live in
// vassal-life-map/selectors.js; this file still owns hub/history helpers.
// On the serialization/replay path; retains pre-redesign substrate.
// Do not add new detailed-settlement gameplay here.
// New site simulation belongs in src/model/detailed-settlements.js (barrel) / its folder.
// New Vassal Life Map rules belong in src/model/vassal-life-map.js.
// Hub-core constructors, floodplain/hinterland food, stockpile accessors:
// ./settlement-state/hub-legacy.js

import {
  SETTLEMENT_HAPPINESS_FULL_FEED_STREAK_FOR_INCREASE,
  SETTLEMENT_HAPPINESS_MISSED_FEED_STREAK_FOR_STARVATION,
  SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH,
} from "../defs/gamesettings/gamerules-defs.js";
import { TIER_ASC } from "./effects/core/tiers.js";
import { getPrimaryDetailedSiteState } from "./world-state.js";
import {
  getSettlementCurrentVassal,
  getSettlementSelectedVassals,
} from "./vassal-life-map/selectors.js";
import {
  DEFAULT_CLASS_ORDER,
  getFaithStartingTier,
  getHubCore,
  normalizeClassId,
  normalizeClassOrder,
  normalizeHappinessStatus,
  normalizeTierId,
} from "./settlement-state/hub-legacy.js";

export {
  SETTLEMENT_FLOODPLAIN_FOOD_CAP,
  SETTLEMENT_STOCKPILE_KEYS,
  addSettlementFloodplainFood,
  clearSettlementFloodplainFood,
  consumeSettlementFood,
  createHubCore,
  createSettlementCardInstance,
  ensureHubCoreShape,
  ensureHubSettlementState,
  getHubCore,
  getSettlementFloodplainFoodTotal,
  getSettlementFloodplainTiles,
  getSettlementHinterlandBlueTotal,
  getSettlementHinterlandTiles,
  getSettlementStockpile,
  getSettlementTileBlueResource,
  getSettlementTileFood,
  getSettlementTotalFood,
  removeSettlementFloodplainFood,
  setSettlementTileBlueResource,
  setSettlementTileFood,
  syncSettlementHinterlandBlueResource,
} from "./settlement-state/hub-legacy.js";

export function getSettlementClassIds(state) {
  const detailed = getPrimaryDetailedSiteState(state);
  if (detailed?.populationByClass) {
    return normalizeClassOrder(Object.keys(detailed.populationByClass));
  }
  const hub = getPrimaryDetailedSiteState(state)?.hub;
  const explicitOrder = Array.isArray(hub?.classOrder) ? hub.classOrder : [];
  const populationClasses = getHubCore(state)?.systemState?.populationClasses;
  return normalizeClassOrder(
    explicitOrder.length ? explicitOrder : Object.keys(populationClasses || {})
  );
}

export function getSettlementPrimaryClassId(state) {
  return getSettlementClassIds(state)[0] ?? DEFAULT_CLASS_ORDER[0];
}

export function getSettlementPopulationClasses(state) {
  const detailed = getPrimaryDetailedSiteState(state);
  if (detailed?.populationByClass) {
    return Object.fromEntries(Object.entries(detailed.populationByClass).map(([classId, entry]) => {
      const elders = (entry.eldersByAge ?? []).reduce(
        (sum, cohort) => sum + Math.max(0, Math.floor(cohort?.count ?? 0)), 0
      );
      return [classId, {
        ...entry,
        youth: Math.max(0, Math.floor(entry.children ?? 0)),
        adults: Math.max(0, Math.floor(entry.adults ?? 0)) + elders,
        total: Math.max(0, Math.floor(entry.children ?? 0))
          + Math.max(0, Math.floor(entry.adults ?? 0)) + elders,
        commitments: [],
      }];
    }));
  }
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
  return state?.civilization?.vassalLineage ?? null;
}

export function getSettlementLatestSelectedVassalEndSec(state) {
  let latestEndSec = 0;
  for (const vassal of getSettlementSelectedVassals(state)) {
    latestEndSec = Math.max(
      latestEndSec,
      Number.isFinite(vassal?.endSec)
        ? Math.max(0, Math.floor(vassal.endSec))
        : Number.isFinite(vassal?.deathSec) ? Math.max(0, Math.floor(vassal.deathSec)) : 0
    );
  }
  return latestEndSec;
}

export function getSettlementSelectedVassalRealizedSegments(state, historyEndSec = null) {
  const selectedVassals = getSettlementSelectedVassals(state);
  const safeHistoryEndSec = Number.isFinite(historyEndSec)
    ? Math.max(0, Math.floor(historyEndSec))
    : Math.max(0, Math.floor(state?.tSec ?? 0));
  const runComplete = state?.runStatus?.complete === true;
  const segments = [];

  for (let index = 0; index < selectedVassals.length; index += 1) {
    const current = selectedVassals[index];
    const next = selectedVassals[index + 1] ?? null;
    const startSec = Number.isFinite(current?.birthSec)
      ? Math.max(0, Math.floor(current.birthSec))
      : Number.isFinite(current?.selectedSec)
        ? Math.max(0, Math.floor(current.selectedSec))
        : null;
    if (startSec == null || startSec > safeHistoryEndSec) continue;

    const nextStartSec = Number.isFinite(next?.birthSec)
      ? Math.max(0, Math.floor(next.birthSec))
      : Number.isFinite(next?.selectedSec)
        ? Math.max(0, Math.floor(next.selectedSec))
        : null;
    const deathSec = Number.isFinite(current?.endSec)
      ? Math.max(0, Math.floor(current.endSec))
      : Number.isFinite(current?.deathSec)
        ? Math.max(0, Math.floor(current.deathSec))
        : safeHistoryEndSec;
    const nominalEndSec = nextStartSec != null
      ? nextStartSec
      : runComplete
        ? safeHistoryEndSec
        : deathSec;
    const endSec = Math.max(startSec, Math.min(safeHistoryEndSec, nominalEndSec));
    segments.push({
      vassalId: current?.vassalId ?? null,
      startSec,
      endSec,
      complete: safeHistoryEndSec >= nominalEndSec,
    });
  }

  return segments;
}

export function getSettlementVassalBoundarySeconds(state, historyEndSec = null) {
  const selectedVassals = getSettlementSelectedVassals(state);
  const safeHistoryEndSec = Number.isFinite(historyEndSec)
    ? Math.max(0, Math.floor(historyEndSec))
    : Math.max(0, Math.floor(state?.tSec ?? 0));
  const runComplete = state?.runStatus?.complete === true;
  const seconds = new Set();

  for (let index = 1; index < selectedVassals.length; index += 1) {
    const startSec = Number.isFinite(selectedVassals[index]?.birthSec)
      ? Math.max(0, Math.floor(selectedVassals[index].birthSec))
      : Number.isFinite(selectedVassals[index]?.selectedSec)
        ? Math.max(0, Math.floor(selectedVassals[index].selectedSec))
        : null;
    if (startSec != null) {
      seconds.add(startSec);
    }
  }
  if (!runComplete && selectedVassals.length > 0) {
    const currentVassal = getSettlementCurrentVassal(state) ?? selectedVassals[selectedVassals.length - 1] ?? null;
    const currentStartSec = Number.isFinite(currentVassal?.birthSec)
      ? Math.max(0, Math.floor(currentVassal.birthSec))
      : Number.isFinite(currentVassal?.selectedSec)
        ? Math.max(0, Math.floor(currentVassal.selectedSec))
        : null;
    const deathSec = Number.isFinite(currentVassal?.endSec)
      ? Math.max(0, Math.floor(currentVassal.endSec))
      : Number.isFinite(currentVassal?.deathSec)
        ? Math.max(0, Math.floor(currentVassal.deathSec))
        : null;
    const activeBoundarySec =
      deathSec == null ? safeHistoryEndSec : Math.min(safeHistoryEndSec, deathSec);
    if (currentStartSec == null || activeBoundarySec >= currentStartSec) {
      seconds.add(activeBoundarySec);
    }
  }

  return [...seconds].sort((a, b) => a - b);
}

export function getSettlementVassalElderEventSeconds(state, visibleThroughSec = null) {
  const selectedVassals = getSettlementSelectedVassals(state);
  const safeVisibleThroughSec = Number.isFinite(visibleThroughSec)
    ? Math.max(0, Math.floor(visibleThroughSec))
    : Math.max(0, Math.floor(state?.tSec ?? 0));
  const seconds = new Set();

  for (const vassal of selectedVassals) {
    const lifeEvents = Array.isArray(vassal?.lifeEvents) ? vassal.lifeEvents : [];
    for (const event of lifeEvents) {
      if (event?.kind !== "becameElder") continue;
      const eventSec = Number.isFinite(event?.tSec)
        ? Math.max(0, Math.floor(event.tSec))
        : null;
      if (eventSec == null || eventSec > safeVisibleThroughSec) continue;
      seconds.add(eventSec);
    }
  }

  return [...seconds].sort((a, b) => a - b);
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
  return getPrimaryDetailedSiteState(state)?.hub?.zones?.[zoneId] ?? null;
}

export function getSettlementStructureSlots(state) {
  const detailed = getPrimaryDetailedSiteState(state);
  if (Array.isArray(detailed?.structureSlots)) return detailed.structureSlots;
  const hub = getPrimaryDetailedSiteState(state)?.hub;
  return Array.isArray(hub?.zones?.structures?.slots)
    ? hub.zones.structures.slots
    : [];
}

export function getSettlementPracticeSlotsByClass(state, classId = null) {
  const detailed = getPrimaryDetailedSiteState(state);
  if (Array.isArray(detailed?.practiceSlots)) {
    return detailed.practiceSlots.map((slot) => slot
      ? { card: { defId: slot.practiceId, props: { settlement: { work: slot.work ?? 0 } } } }
      : { card: null });
  }
  const safeClassId = normalizeClassId(classId) ?? getSettlementPrimaryClassId(state);
  const hub = getPrimaryDetailedSiteState(state)?.hub;
  return Array.isArray(hub?.zones?.practiceByClass?.[safeClassId]?.slots)
    ? hub.zones.practiceByClass[safeClassId].slots
    : [];
}

export function getSettlementDebugOverrideSlotSummary(state) {
  const hub = getPrimaryDetailedSiteState(state)?.hub;
  const practiceByClass = {};
  const orderSlots = getSettlementOrderSlots(state);
  const orderCard =
    orderSlots.find((slot) => slot?.card?.defId === "elderCouncil")?.card ??
    orderSlots.find((slot) => slot?.card?.systemState?.elderCouncil)?.card ??
    null;
  const debugPracticeByClass =
    orderCard?.systemState?.elderCouncil?.debugPracticeBoardByClass;
  for (const classId of getSettlementClassIds(state)) {
    const slotCount = getSettlementPracticeSlotsByClass(state, classId).length;
    const active = new Array(slotCount).fill(false);
    const bySlot =
      debugPracticeByClass?.[classId] &&
      typeof debugPracticeByClass[classId] === "object" &&
      !Array.isArray(debugPracticeByClass[classId])
        ? debugPracticeByClass[classId]
        : null;
    if (bySlot) {
      for (const rawIndex of Object.keys(bySlot)) {
        const slotIndex = Number.isFinite(Number(rawIndex))
          ? Math.max(0, Math.floor(Number(rawIndex)))
          : null;
        if (slotIndex != null && slotIndex < slotCount) active[slotIndex] = true;
      }
    }
    practiceByClass[classId] = active;
  }

  const structureSlots = getSettlementStructureSlots(state);
  const rawStructureOverrides =
    hub?.zones?.structures?.debugOverrideSlots &&
    typeof hub.zones.structures.debugOverrideSlots === "object" &&
    !Array.isArray(hub.zones.structures.debugOverrideSlots)
      ? hub.zones.structures.debugOverrideSlots
      : {};
  const structures = structureSlots.map((_, index) => {
    const key = String(index);
    return rawStructureOverrides[key] === true;
  });

  return {
    practices: practiceByClass,
    structures,
  };
}

export function getSettlementPracticeSlots(state, classId = null) {
  return getSettlementPracticeSlotsByClass(state, classId);
}

export function getSettlementOrderSlots(state) {
  const hub = getPrimaryDetailedSiteState(state)?.hub;
  return Array.isArray(hub?.zones?.order?.slots)
    ? hub.zones.order.slots
    : [];
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
