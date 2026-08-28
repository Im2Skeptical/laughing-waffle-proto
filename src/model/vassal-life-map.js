import {
  VASSAL_CRISIS_OPTIONS,
  VASSAL_DEVELOPMENT_OPTIONS,
  VASSAL_LEGACY_OPTIONS,
  VASSAL_LIFE_MAP_ENTRY_NODE_IDS,
  VASSAL_LIFE_MAP_ID,
  VASSAL_LIFE_MAP_NODE_BY_ID,
  VASSAL_LIFE_TUNING,
  VASSAL_PATRONAGE_OPTIONS,
  VASSAL_LEVEL_UP_STAT_IDS,
  VASSAL_STAT_IDS,
  getVassalMortalityChance,
} from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  VASSAL_INTERVENTION_PRACTICE_IDS,
  DETAILED_PRACTICE_SLOT_COUNT,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import { getDetailedPracticeDef, getDetailedStructureDef, getGameSetting } from "./game-config.js";
import {
  createDetailedPracticeSlot,
  getDetailedPracticeTierIndex,
  getDetailedPracticeWorkerCapacity,
  getNextDetailedPracticeTier,
  getQualityMultiplier,
} from "./detailed-practice-tiers.js";
import { getMoonPhaseDurationSec } from "./moon-phases.js";
import {
  addWorldConnection,
  getRegionReference,
  getRegionPolygon,
  getRegionState,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  getWorldDefinition,
  removeWorldConnection,
} from "./world-state.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const SHOP_FAMILIES = new Set(["practiceReform", "publicWorks", "routes"]);
const QUALITY_IDS = Object.freeze(["bronze", "silver", "gold", "diamond"]);

function qualityLabel(tier) { return `${tier[0].toUpperCase()}${tier.slice(1)}`; }
function getUnlockedQualityIndex(state) {
  const research = Math.max(0, Number(state?.civilization?.research?.total) || 0);
  if (research >= getGameSetting(state, "researchDiamondThreshold")) return 3;
  if (research >= getGameSetting(state, "researchGoldThreshold")) return 2;
  if (research >= getGameSetting(state, "researchSilverThreshold")) return 1;
  return 0;
}
function getUniversityFloor(state, regionId) {
  const tiers = (getDetailedSite(state, regionId)?.detailedState?.structureSlots ?? [])
    .filter((slot) => slot?.structureId === "university")
    .map((slot) => getDetailedPracticeTierIndex(slot.tier ?? "bronze"));
  const highest = tiers.length ? Math.max(...tiers) : -1;
  return highest >= 3 ? 3 : highest >= 2 ? 2 : 0;
}
function rollOfferQuality(state, regionId, floor = 0) {
  const max = getUnlockedQualityIndex(state);
  const min = Math.min(max, Math.max(0, floor, getUniversityFloor(state, regionId)));
  return QUALITY_IDS[state.rngNextVassalInt(min, max)];
}
function isDefinitionUnlocked(state, def) {
  return getDetailedPracticeTierIndex(def?.minimumQuality ?? "bronze") <= getUnlockedQualityIndex(state);
}

function getYearDurationSec(state) {
  const seasons = Array.isArray(state?.seasons) && state.seasons.length > 0
    ? state.seasons.length : 4;
  const seasonDurationSec = Number.isFinite(state?.seasonDurationSec)
    ? Math.max(1, Math.floor(state.seasonDurationSec)) : 8;
  return seasons * seasonDurationSec;
}

function shuffle(state, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = state.rngNextVassalInt(0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function getDetailedSite(state, regionId) {
  return (state?.world?.sites ?? []).find((site) =>
    site?.regionId === regionId && site?.simulationMode === "detailed" && site?.detailedState
  ) ?? null;
}

function getPlayerDetailedSites(state) {
  return (state?.world?.sites ?? []).filter((site) =>
    site?.simulationMode === "detailed" && site?.detailedState
      && getRegionState(state, site.regionId)?.controller === "player"
  );
}

export function getVassalLineage(state) {
  return state?.civilization?.vassalLineage ?? null;
}

export function getCurrentLifeMapVassal(state) {
  const lineage = getVassalLineage(state);
  return lineage?.currentVassalId ? lineage?.vassalsById?.[lineage.currentVassalId] ?? null : null;
}

export function getSelectedLifeMapVassals(state) {
  const lineage = getVassalLineage(state);
  return (lineage?.selectedVassalIds ?? [])
    .map((id) => lineage?.vassalsById?.[id] ?? null)
    .filter(Boolean);
}

export function getLifeMapVassalAtSecond(state, tSec = null) {
  const safeTSec = Number.isFinite(tSec)
    ? Math.max(0, Math.floor(tSec))
    : Math.max(0, Math.floor(state?.tSec ?? 0));
  let selected = null;
  for (const vassal of getSelectedLifeMapVassals(state)) {
    const selectedSec = Number.isFinite(vassal?.selectedSec)
      ? Math.max(0, Math.floor(vassal.selectedSec))
      : null;
    if (selectedSec == null || selectedSec > safeTSec) continue;
    if (
      !selected ||
      selectedSec >= Math.max(0, Math.floor(selected.selectedSec ?? 0))
    ) {
      selected = vassal;
    }
  }
  return selected;
}

function getCommittedNodeSec(vassal, nodeId) {
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId] ?? null;
  if (Number.isFinite(nodeState?.confirmedSec)) {
    return Math.max(0, Math.floor(nodeState.confirmedSec));
  }
  if (
    vassal?.lifeMap?.currentNodeId === nodeId &&
    ["died", "retired"].includes(vassal?.endedReason) &&
    Number.isFinite(vassal?.endSec)
  ) {
    return Math.max(0, Math.floor(vassal.endSec));
  }
  return null;
}

export function getCommittedVassalLifeMapNodeIds(vassal) {
  const completedIds = Array.isArray(vassal?.lifeMap?.completedNodeIds)
    ? vassal.lifeMap.completedNodeIds
    : [];
  const committedIds = [...completedIds];
  for (const nodeId of Object.keys(vassal?.lifeMap?.nodeStates ?? {})) {
    if (getCommittedNodeSec(vassal, nodeId) != null && !committedIds.includes(nodeId)) {
      committedIds.push(nodeId);
    }
  }
  return committedIds;
}

export function getVassalLifeMapPlayheadNodeId(vassal, tSec = null) {
  const safeTSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec)) : null;
  if (safeTSec == null) return null;
  let latest = null;
  let latestSec = -1;
  for (const nodeId of getCommittedVassalLifeMapNodeIds(vassal)) {
    const committedSec = getCommittedNodeSec(vassal, nodeId);
    if (committedSec == null || committedSec > safeTSec || committedSec < latestSec) continue;
    latest = nodeId;
    latestSec = committedSec;
  }
  return latest;
}

export function getVassalAge(state, vassal = null, tSec = null) {
  const current = vassal ?? getCurrentLifeMapVassal(state);
  if (!current) return 0;
  const atSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec))
    : Math.max(0, Math.floor(state?.tSec ?? 0));
  return Math.max(0, Math.floor(current.initialAge ?? 0))
    + Math.max(0, Math.floor((atSec - Math.floor(current.selectedSec ?? 0)) / getYearDurationSec(state)));
}

export function getVassalPrestigeIncome(vassal) {
  return VASSAL_LIFE_TUNING.basePrestigeIncome
    + Math.max(0, Math.floor(vassal?.stats?.cunning ?? 0));
}

export function getVassalDevelopmentIncome(vassal) {
  return VASSAL_LIFE_TUNING.baseDevelopmentIncome
    + Math.max(0, Math.floor(vassal?.stats?.wisdom ?? 0));
}

const VASSAL_STAT_LABELS = Object.freeze({
  cunning: "Cunning",
  wisdom: "Wisdom",
  effectiveness: "Effectiveness",
  intelligence: "Intelligence",
});

export function getVassalStatPresentation(vassal, statId, valueOverride = null) {
  const value = Number.isFinite(valueOverride)
    ? Math.max(0, Math.floor(valueOverride))
    : Math.max(0, Math.floor(vassal?.stats?.[statId] ?? 0));
  const cap = VASSAL_LIFE_TUNING.maximumDiscount;
  const discount = Math.min(cap, value * VASSAL_LIFE_TUNING.discountPerStat);
  const pointsToCap = Math.max(0, Math.ceil(
    (cap - discount) / VASSAL_LIFE_TUNING.discountPerStat
  ));
  if (statId === "cunning") {
    const power = VASSAL_LIFE_TUNING.basePrestigeIncome + value;
    return {
      statId, label: VASSAL_STAT_LABELS[statId], value,
      powerLabel: `+${power} Prestige per completed node`,
      formula: `${VASSAL_LIFE_TUNING.basePrestigeIncome} base + ${value} Cunning`,
      pointsToCap: null,
    };
  }
  if (statId === "wisdom") {
    const power = VASSAL_LIFE_TUNING.baseDevelopmentIncome + value;
    return {
      statId, label: VASSAL_STAT_LABELS[statId], value,
      powerLabel: `+${power} EXP per completed node`,
      formula: `${VASSAL_LIFE_TUNING.baseDevelopmentIncome} base + ${value} Wisdom`,
      pointsToCap: null,
    };
  }
  const percent = Math.round(discount * 100);
  const noun = statId === "effectiveness" ? "Phase" : "Prestige";
  return {
    statId, label: VASSAL_STAT_LABELS[statId] ?? statId, value,
    powerLabel: `${percent}% ${noun}-cost discount`,
    formula: `${Math.round(VASSAL_LIFE_TUNING.discountPerStat * 100)}% per point · ${Math.round(cap * 100)}% cap · costs round up`,
    pointsToCap,
    multiplier: Math.round((1 - discount) * 100) / 100,
  };
}

export function getVassalStatsPresentation(vassal) {
  return VASSAL_STAT_IDS.map((statId) => getVassalStatPresentation(vassal, statId));
}

function adjustedCost(base, stat, { allowZero = true } = {}) {
  const safeBase = Math.max(0, Number(base) || 0);
  if (safeBase <= 0) return 0;
  const discount = Math.min(
    VASSAL_LIFE_TUNING.maximumDiscount,
    Math.max(0, Math.floor(stat ?? 0)) * VASSAL_LIFE_TUNING.discountPerStat
  );
  const result = Math.ceil(safeBase * (1 - discount));
  return allowZero ? Math.max(0, result) : Math.max(1, result);
}

export function getAdjustedVassalPrestigeCost(vassal, baseCost) {
  return adjustedCost(baseCost, vassal?.stats?.intelligence, { allowZero: true });
}

export function getAdjustedVassalPhaseCost(vassal, baseCost) {
  return adjustedCost(baseCost, vassal?.stats?.effectiveness, { allowZero: false });
}

function candidatePoolHash(candidates) {
  return JSON.stringify(candidates ?? []);
}

export function getVassalCandidatePool(state) {
  const lineage = getVassalLineage(state);
  const candidates = clone(lineage?.pendingCandidates ?? []).map((candidate, candidateIndex) => ({
    ...candidate, candidateIndex,
  }));
  return {
    poolId: `life-vassal-${Math.max(1, Math.floor(lineage?.nextVassalId ?? 1))}-reroll-${Math.max(0, Math.floor(lineage?.candidateRerollCount ?? 0))}`,
    createdSec: Math.max(0, Math.floor(state?.tSec ?? 0)),
    rerollIndex: Math.max(0, Math.floor(lineage?.candidateRerollCount ?? 0)),
    candidates,
    expectedPoolHash: candidatePoolHash(candidates.map(({ candidateIndex: _index, ...candidate }) => candidate)),
  };
}

function generateCandidatePool(state) {
  const lineage = getVassalLineage(state);
  const locations = getPlayerDetailedSites(state).map((site) => site.regionId);
  const legacyBonus = Math.max(0, Math.floor(
    state?.civilization?.vassalLegacy?.futureStartingPrestigeBonus ?? 0
  ));
  lineage.pendingCandidates = locations.length === 0 ? [] : Array.from(
    { length: VASSAL_LIFE_TUNING.candidateCount },
    (_, index) => {
      const locationRegionId = locations[state.rngNextVassalInt(0, locations.length - 1)];
      const academyBonus = (getDetailedSite(state, locationRegionId)?.detailedState?.structureSlots ?? [])
        .filter((slot) => slot?.structureId === "academy")
        .reduce((sum, slot) => sum + Math.max(0, getDetailedStructureDef(state, "academy")?.candidateIntelligenceBonus ?? 0) * (1 + getDetailedPracticeTierIndex(slot.tier ?? "bronze")), 0);
      return ({
      candidateId: `candidate-${Math.max(1, Math.floor(lineage.nextVassalId ?? 1))}-${index + 1}`,
      age: state.rngNextVassalInt(VASSAL_LIFE_TUNING.candidateAgeMin, VASSAL_LIFE_TUNING.candidateAgeMax),
      locationRegionId, originRegionId: locationRegionId,
      prestige: state.rngNextVassalInt(
        VASSAL_LIFE_TUNING.candidatePrestigeMin,
        VASSAL_LIFE_TUNING.candidatePrestigeMax
      ) + legacyBonus,
      stats: Object.fromEntries(VASSAL_STAT_IDS.map((statId) => [
        statId,
        state.rngNextVassalInt(VASSAL_LIFE_TUNING.candidateStatMin, VASSAL_LIFE_TUNING.candidateStatMax) + (statId === "intelligence" ? academyBonus : 0),
      ])),
    }); }
  );
  return lineage.pendingCandidates;
}

export function initializeVassalLifeMapCivilization(state) {
  state.civilization.vassalLegacy = { futureStartingPrestigeBonus: 0 };
  state.civilization.vassalLineage = {
    nextVassalId: 1,
    currentVassalId: null,
    selectedVassalIds: [],
    vassalsById: {},
    pendingCandidates: [],
    candidateRerollCount: 0,
  };
  generateCandidatePool(state);
}

export function rerollVassalCandidates(state) {
  const lineage = getVassalLineage(state);
  if (!lineage || lineage.currentVassalId) return { ok: false, reason: "currentVassalAlive" };
  lineage.candidateRerollCount = Math.max(0, Math.floor(lineage.candidateRerollCount ?? 0)) + 1;
  generateCandidatePool(state);
  return { ok: true, pool: getVassalCandidatePool(state) };
}

function createLifeMapState() {
  return {
    mapId: VASSAL_LIFE_MAP_ID,
    currentNodeId: null,
    completedNodeIds: [],
    availableNodeIds: [...VASSAL_LIFE_MAP_ENTRY_NODE_IDS],
    nodeStates: {},
    pendingResolution: null,
  };
}

export function selectLifeMapVassal(state, candidateIndex, expectedPoolHash = null, override = null) {
  const lineage = getVassalLineage(state);
  if (!lineage || lineage.currentVassalId) return { ok: false, reason: "currentVassalAlive" };
  const safeIndex = Number.isFinite(candidateIndex) ? Math.floor(candidateIndex) : -1;
  const candidates = (lineage.pendingCandidates ?? []).map((candidate, index) => {
    const source = index === safeIndex && override ? override : candidate;
    const copy = clone(source);
    delete copy.candidateIndex;
    return copy;
  });
  const actualHash = candidatePoolHash(candidates);
  if (expectedPoolHash && expectedPoolHash !== actualHash) {
    return { ok: false, reason: "selectionPoolMismatch", actualPoolHash: actualHash };
  }
  const source = candidates[safeIndex];
  if (!source) return { ok: false, reason: "invalidCandidate" };
  const idNumber = Math.max(1, Math.floor(lineage.nextVassalId ?? 1));
  const vassalId = `vassal-${idNumber}`;
  const record = {
    ...clone(source),
    vassalId,
    initialAge: Math.max(0, Math.floor(source.age ?? 0)),
    selectedSec: Math.max(0, Math.floor(state.tSec ?? 0)),
    selectedYear: Math.max(1, Math.floor(state.year ?? 1)),
    developmentProgress: 0,
    developmentChoiceQueue: [],
    nextDevelopmentChoiceId: 1,
    lifeMap: createLifeMapState(),
    lifeEvents: [{
      eventId: `${vassalId}:selected`, kind: "selected", tSec: state.tSec,
      text: `Selected at ${getRegionReference(state, source.locationRegionId) ?? source.locationRegionId}`,
    }],
    isDead: false,
    endedReason: null,
    deathCause: null,
    endSec: null,
  };
  delete record.age;
  lineage.nextVassalId = idNumber + 1;
  lineage.currentVassalId = vassalId;
  lineage.selectedVassalIds.push(vassalId);
  lineage.vassalsById[vassalId] = record;
  lineage.pendingCandidates = [];
  lineage.candidateRerollCount = 0;
  return { ok: true, vassal: record };
}

function shortestDistance(state, startId, targetId) {
  if (startId === targetId) return 0;
  const adjacency = new Map();
  for (const edge of state?.world?.connections ?? []) {
    if (!adjacency.has(edge.regionAId)) adjacency.set(edge.regionAId, []);
    if (!adjacency.has(edge.regionBId)) adjacency.set(edge.regionBId, []);
    adjacency.get(edge.regionAId).push(edge.regionBId);
    adjacency.get(edge.regionBId).push(edge.regionAId);
  }
  const queue = [{ id: startId, distance: 0 }];
  const seen = new Set([startId]);
  while (queue.length) {
    const current = queue.shift();
    for (const nextId of adjacency.get(current.id) ?? []) {
      if (seen.has(nextId)) continue;
      if (nextId === targetId) return current.distance + 1;
      seen.add(nextId);
      queue.push({ id: nextId, distance: current.distance + 1 });
    }
  }
  return null;
}

function buildTravelOptions(state, vassal) {
  return getPlayerDetailedSites(state)
    .filter((site) => site.regionId !== vassal.locationRegionId)
    .map((site) => ({
      id: `travel-${site.regionId}`,
      label: `Travel to ${getRegionReference(state, site.regionId) ?? site.name ?? site.regionId}`,
      locationRegionId: site.regionId,
      graphDistance: shortestDistance(state, vassal.locationRegionId, site.regionId),
    }))
    .filter((option) => Number.isFinite(option.graphDistance))
    .map((option) => ({
      ...option,
      phaseCost: Math.max(1, option.graphDistance) * VASSAL_LIFE_TUNING.phasesPerTravelStep,
    }))
    .sort((a, b) => a.graphDistance - b.graphDistance || a.locationRegionId.localeCompare(b.locationRegionId))
    .slice(0, VASSAL_LIFE_TUNING.travelOptionCount);
}

function applyPracticeIntervention(practiceSlots, intervention) {
  const existingIndex = practiceSlots.findIndex((slot) =>
    slot?.practiceId === intervention.practiceId);
  let nextSlot;
  if (intervention.mode === "upgrade") {
    const existing = practiceSlots[existingIndex];
    if (!existing || existing.tier !== intervention.tier
        || existing.tier === "diamond") return false;
    nextSlot = createDetailedPracticeSlot(intervention.practiceId, intervention.resultingTier);
    practiceSlots.splice(existingIndex, 1);
  } else {
    if (existingIndex >= 0 || intervention.mode !== "learn") return false;
    nextSlot = createDetailedPracticeSlot(intervention.practiceId, intervention.resultingTier);
  }
  practiceSlots.unshift(nextSlot);
  practiceSlots.length = DETAILED_PRACTICE_SLOT_COUNT;
  while (practiceSlots.length < DETAILED_PRACTICE_SLOT_COUNT) practiceSlots.push(null);
  return true;
}

function applyReservedIntervention(reservation, intervention) {
  if (intervention.kind === "practice") {
    applyPracticeIntervention(reservation.practiceSlots, intervention);
  } else if (intervention.kind === "structure") {
    reservation.structureSlots[intervention.slotIndex] = intervention.structureId;
  } else if (intervention.kind === "connection") {
    const key = getWorldConnectionKey(intervention.regionAId, intervention.regionBId);
    if (intervention.mode === "add") reservation.connectionKeys.add(key);
    else reservation.connectionKeys.delete(key);
  }
}

function validatePurchaseInterventions(state, vassal, purchases) {
  const reservation = buildReservation(state, vassal, { purchasedOffers: [] });
  for (const purchase of purchases ?? []) {
    const intervention = purchase?.intervention;
    if (intervention?.kind === "practice") {
      if (!applyPracticeIntervention(reservation.practiceSlots, intervention)) {
        return { ok: false, reason: "practiceUnavailable" };
      }
    } else if (intervention?.kind === "structure") {
      if (reservation.structureSlots[intervention.slotIndex] != null) {
        return { ok: false, reason: "structureUnavailable" };
      }
      reservation.structureSlots[intervention.slotIndex] = intervention.structureId;
    } else if (intervention?.kind === "connection") {
      const key = getWorldConnectionKey(intervention.regionAId, intervention.regionBId);
      const exists = reservation.connectionKeys.has(key);
      if ((intervention.mode === "add" && exists) || (intervention.mode === "remove" && !exists)) {
        return { ok: false, reason: "connectionUnavailable" };
      }
      if (intervention.mode === "add") reservation.connectionKeys.add(key);
      else reservation.connectionKeys.delete(key);
    } else {
      return { ok: false, reason: "interventionUnavailable" };
    }
  }
  return { ok: true, reservation };
}

function buildReservation(state, vassal, nodeState) {
  const settlement = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
  const reservation = {
    practiceSlots: (settlement?.practiceSlots ?? []).map((slot) => slot
      ? { practiceId: slot.practiceId, tier: slot.tier }
      : null),
    structureSlots: (settlement?.structureSlots ?? []).map((slot) => slot?.structureId ?? null),
    connectionKeys: new Set((state?.world?.connections ?? []).map((edge) =>
      getWorldConnectionKey(edge.regionAId, edge.regionBId)
    )),
  };
  for (const purchase of nodeState?.purchasedOffers ?? []) {
    applyReservedIntervention(reservation, purchase.intervention);
  }
  return reservation;
}

function buildPracticeOffers(state, vassal, nodeState, roll) {
  const reservation = buildReservation(state, vassal, nodeState);
  const offers = [];
  for (const practiceId of shuffle(state, VASSAL_INTERVENTION_PRACTICE_IDS)) {
    if (offers.length >= 3) break;
    const def = getDetailedPracticeDef(state, practiceId);
    if (!def || !isDefinitionUnlocked(state, def)) continue;
    const installed = reservation.practiceSlots.find((slot) => slot?.practiceId === practiceId);
    if (installed?.tier === "diamond") continue;
    const tier = installed?.tier ?? "bronze";
    const offeredTier = rollOfferQuality(state, vassal.locationRegionId);
    const resultingTier = installed ? getNextDetailedPracticeTier(tier) : offeredTier;
    if (!resultingTier) continue;
    const intervention = {
      kind: "practice", targetRegionId: vassal.locationRegionId, practiceId,
      mode: installed ? "upgrade" : "learn", tier, resultingTier,
    };
    applyPracticeIntervention(reservation.practiceSlots, intervention);
    offers.push({
      offerId: `${nodeState.nodeId}:r${roll}:practice:${offers.length}`,
      label: installed
        ? `Upgrade ${def.label} ${tier[0].toUpperCase()}${tier.slice(1)} → ${resultingTier[0].toUpperCase()}${resultingTier.slice(1)}`
        : `Learn ${qualityLabel(resultingTier)} ${def.label}`,
      basePrestigeCost: Math.max(0, def.vassalPrestigeCost ?? 0),
      basePhaseCost: Math.max(0, def.vassalPhaseCost ?? 0),
      intervention,
    });
  }
  return offers;
}

function buildStructureOffers(state, vassal, nodeState, roll) {
  const reservation = buildReservation(state, vassal, nodeState);
  const offers = [];
  const defIds = shuffle(state, Object.keys(settlementStructureDefs)).filter((id) => isDefinitionUnlocked(state, settlementStructureDefs[id]));
  let defIndex = 0;
  while (offers.length < 3) {
    const slotIndex = reservation.structureSlots.findIndex((value) => value == null);
    if (slotIndex < 0 || defIds.length === 0) break;
    const structureId = defIds[defIndex % defIds.length];
    const def = settlementStructureDefs[structureId];
    const tier = rollOfferQuality(state, vassal.locationRegionId);
    reservation.structureSlots[slotIndex] = structureId;
    offers.push({
      offerId: `${nodeState.nodeId}:r${roll}:structure:${offers.length}`,
      label: `Build ${qualityLabel(tier)} ${def.label}`,
      basePrestigeCost: Math.max(0, def.vassalPrestigeCost ?? 0),
      basePhaseCost: Math.max(0, def.vassalPhaseCost ?? 0),
      intervention: { kind: "structure", targetRegionId: vassal.locationRegionId, structureId, tier, slotIndex },
    });
    defIndex += 1;
  }
  return offers;
}

function isPlayerDetailedRegion(state, regionId) {
  return getRegionState(state, regionId)?.controller === "player" && !!getDetailedSite(state, regionId);
}

function buildRouteOffers(state, vassal, nodeState, roll) {
  const reservation = buildReservation(state, vassal, nodeState);
  const currentId = vassal.locationRegionId;
  const candidates = getWorldConnectionCandidates(getWorldDefinition(state)).flatMap((edge) => {
    if (edge.regionAId !== currentId && edge.regionBId !== currentId) return [];
    const key = getWorldConnectionKey(edge.regionAId, edge.regionBId);
    const exists = reservation.connectionKeys.has(key);
    if (!exists && isPlayerDetailedRegion(state, edge.regionAId)
        && isPlayerDetailedRegion(state, edge.regionBId)) {
      return [{ mode: "add", edge }];
    }
    return exists ? [{ mode: "remove", edge }] : [];
  });
  return shuffle(state, candidates).slice(0, 3).map((candidate, index) => {
    const { edge, mode } = candidate;
    const left = getRegionReference(state, edge.regionAId) ?? edge.regionAId;
    const right = getRegionReference(state, edge.regionBId) ?? edge.regionBId;
    return {
      offerId: `${nodeState.nodeId}:r${roll}:route:${index}`,
      label: `${mode === "add" ? "Connect" : "Remove"} ${left} ↔ ${right}`,
      basePrestigeCost: mode === "add"
        ? VASSAL_LIFE_TUNING.routeAddPrestigeCost : VASSAL_LIFE_TUNING.routeRemovePrestigeCost,
      basePhaseCost: mode === "add"
        ? VASSAL_LIFE_TUNING.routeAddPhaseCost : VASSAL_LIFE_TUNING.routeRemovePhaseCost,
      intervention: { kind: "connection", mode, regionAId: edge.regionAId, regionBId: edge.regionBId },
    };
  });
}

function generateShopInventory(state, vassal, nodeState) {
  const roll = Math.max(0, Math.floor(nodeState.inventoryRoll ?? 0));
  const offers = nodeState.family === "practiceReform"
    ? buildPracticeOffers(state, vassal, nodeState, roll)
    : nodeState.family === "publicWorks"
      ? buildStructureOffers(state, vassal, nodeState, roll)
      : buildRouteOffers(state, vassal, nodeState, roll);
  return offers.map((offer, inventoryIndex) => ({ ...offer, inventoryIndex }));
}

function createNodeState(state, vassal, node) {
  const nodeState = {
    nodeId: node.id,
    family: node.family,
    entered: true,
    enteredSec: Math.max(0, Math.floor(state.tSec ?? 0)),
    resolved: false,
    resolving: false,
    options: [],
    inventory: [],
    purchasedOffers: [],
    purchasedOfferIds: [],
    rerollUsed: false,
    inventoryRoll: 0,
    selectedOptionId: null,
    accumulatedPhaseCost: 0,
    resolutionResult: null,
  };
  if (node.family === "patronage") nodeState.options = clone(VASSAL_PATRONAGE_OPTIONS);
  else if (node.family === "development") {
    nodeState.options = shuffle(state, VASSAL_DEVELOPMENT_OPTIONS).slice(0, 3).map(clone);
  } else if (node.family === "travel") nodeState.options = buildTravelOptions(state, vassal);
  else if (node.family === "crisis") nodeState.options = clone(VASSAL_CRISIS_OPTIONS);
  else if (node.family === "legacy") nodeState.options = clone(VASSAL_LEGACY_OPTIONS);
  else if (SHOP_FAMILIES.has(node.family)) nodeState.inventory = generateShopInventory(state, vassal, nodeState);
  return nodeState;
}

export function enterVassalLifeNode(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  if (!vassal) return { ok: false, reason: "noCurrentVassal" };
  if ((vassal.developmentChoiceQueue ?? []).length > 0) {
    return { ok: false, reason: "developmentChoiceRequired" };
  }
  if (vassal.lifeMap.pendingResolution) return { ok: false, reason: "resolutionPending" };
  if (vassal.lifeMap.currentNodeId) return { ok: false, reason: "nodeAlreadyActive" };
  if (!(vassal.lifeMap.availableNodeIds ?? []).includes(nodeId)) return { ok: false, reason: "nodeUnavailable" };
  const node = VASSAL_LIFE_MAP_NODE_BY_ID[nodeId];
  if (!node) return { ok: false, reason: "invalidNode" };
  const nodeState = vassal.lifeMap.nodeStates[nodeId] ?? createNodeState(state, vassal, node);
  vassal.lifeMap.nodeStates[nodeId] = nodeState;
  vassal.lifeMap.currentNodeId = nodeId;
  vassal.lifeMap.availableNodeIds = [];
  vassal.lifeEvents.push({
    eventId: `${vassal.vassalId}:enter:${nodeId}`,
    kind: "nodeEntered", nodeId, tSec: state.tSec, text: `Entered ${node.family}`,
  });
  return { ok: true, nodeState };
}

export function selectVassalNodeOption(state, nodeId, optionId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !nodeState || nodeState.resolving) {
    return { ok: false, reason: "nodeUnavailable" };
  }
  const option = nodeState.options.find((entry) => entry.id === optionId);
  if (!option) return { ok: false, reason: "invalidOption" };
  const prestigeCost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
  if (prestigeCost > vassal.prestige) return { ok: false, reason: "insufficientPrestige" };
  nodeState.selectedOptionId = optionId;
  return { ok: true, optionId };
}

export function purchaseVassalShopOffer(state, nodeId, offerId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !SHOP_FAMILIES.has(nodeState?.family)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  const index = nodeState.inventory.findIndex((offer) => offer.offerId === offerId);
  if (index < 0) return { ok: false, reason: "offerUnavailable" };
  const offer = nodeState.inventory[index];
  const prestigeCost = getAdjustedVassalPrestigeCost(vassal, offer.basePrestigeCost);
  const phaseCost = getAdjustedVassalPhaseCost(vassal, offer.basePhaseCost);
  const stagedPrestigeCost = (nodeState.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), 0);
  if (prestigeCost > vassal.prestige - stagedPrestigeCost) {
    return { ok: false, reason: "insufficientPrestige" };
  }
  nodeState.inventory.splice(index, 1);
  nodeState.purchasedOfferIds.push(offer.offerId);
  nodeState.purchasedOffers.push({
    ...clone(offer), prestigeCost, phaseCost, purchasedSec: state.tSec,
    sourceInventoryRoll: Math.max(0, Math.floor(nodeState.inventoryRoll ?? 0)),
    sourceInventoryIndex: Math.max(0, Math.floor(offer.inventoryIndex ?? index)),
  });
  nodeState.accumulatedPhaseCost += phaseCost;
  return { ok: true, offerId, prestigeCost, phaseCost };
}

export function undoVassalShopPurchase(state, nodeId, offerId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !SHOP_FAMILIES.has(nodeState?.family)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  const index = nodeState.purchasedOffers.findIndex((purchase) => purchase.offerId === offerId);
  if (index < 0) return { ok: false, reason: "purchaseUnavailable" };
  const [purchase] = nodeState.purchasedOffers.splice(index, 1);
  nodeState.purchasedOfferIds = nodeState.purchasedOffers.map((entry) => entry.offerId);
  const restored = clone(purchase);
  delete restored.prestigeCost;
  delete restored.phaseCost;
  delete restored.purchasedSec;
  delete restored.sourceInventoryRoll;
  const originalIndex = Math.max(0, Math.floor(restored.sourceInventoryIndex ?? nodeState.inventory.length));
  delete restored.sourceInventoryIndex;
  restored.inventoryIndex = originalIndex;
  nodeState.inventory.push(restored);
  nodeState.inventory.sort((left, right) =>
    Math.floor(left.inventoryIndex ?? 0) - Math.floor(right.inventoryIndex ?? 0));
  nodeState.accumulatedPhaseCost = Math.max(
    0, nodeState.accumulatedPhaseCost - Math.max(0, purchase.phaseCost ?? 0)
  );
  return { ok: true, offerId, prestigeCost: purchase.prestigeCost, phaseCost: purchase.phaseCost };
}

export function reorderVassalShopPurchase(state, nodeId, offerId, toIndex) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !SHOP_FAMILIES.has(nodeState?.family)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  const fromIndex = nodeState.purchasedOffers.findIndex((purchase) => purchase.offerId === offerId);
  const targetIndex = Number.isFinite(toIndex) ? Math.floor(toIndex) : -1;
  if (fromIndex < 0 || targetIndex < 0 || targetIndex >= nodeState.purchasedOffers.length) {
    return { ok: false, reason: "invalidPurchaseOrder" };
  }
  if (fromIndex !== targetIndex) {
    const [purchase] = nodeState.purchasedOffers.splice(fromIndex, 1);
    nodeState.purchasedOffers.splice(targetIndex, 0, purchase);
    nodeState.purchasedOfferIds = nodeState.purchasedOffers.map((entry) => entry.offerId);
  }
  return { ok: true, offerId, fromIndex, toIndex: targetIndex };
}

export function rerollVassalShop(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !SHOP_FAMILIES.has(nodeState?.family)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  if (nodeState.rerollUsed) return { ok: false, reason: "rerollUsed" };
  if ((nodeState.purchasedOffers ?? []).length > 0) {
    return { ok: false, reason: "stagedPurchases" };
  }
  const prestigeCost = getAdjustedVassalPrestigeCost(
    vassal, VASSAL_LIFE_TUNING.shopRerollPrestigeCost
  );
  const phaseCost = getAdjustedVassalPhaseCost(vassal, VASSAL_LIFE_TUNING.shopRerollPhaseCost);
  if (prestigeCost > vassal.prestige) return { ok: false, reason: "insufficientPrestige" };
  vassal.prestige -= prestigeCost;
  nodeState.accumulatedPhaseCost += phaseCost;
  nodeState.rerollUsed = true;
  nodeState.inventoryRoll += 1;
  nodeState.inventory = generateShopInventory(state, vassal, nodeState);
  return { ok: true, prestigeCost, phaseCost, inventory: clone(nodeState.inventory) };
}

function applyIntervention(state, intervention) {
  const settlement = getDetailedSite(state, intervention.targetRegionId)?.detailedState;
  if (intervention.kind === "practice" && settlement) {
    return applyPracticeIntervention(settlement.practiceSlots, intervention)
      ? { ok: true }
      : { ok: false, reason: "practiceUnavailable" };
  }
  if (intervention.kind === "structure" && settlement
      && settlement.structureSlots[intervention.slotIndex] == null) {
    settlement.structureSlots[intervention.slotIndex] = { structureId: intervention.structureId, tier: intervention.tier ?? "bronze" };
    return { ok: true };
  }
  if (intervention.kind === "connection") {
    return intervention.mode === "add"
      ? addWorldConnection(state, intervention.regionAId, intervention.regionBId)
      : removeWorldConnection(state, intervention.regionAId, intervention.regionBId);
  }
  return { ok: false, reason: "interventionUnavailable" };
}

function addLifeEvent(state, vassal, kind, extra = {}) {
  vassal.lifeEvents.push({
    eventId: `${vassal.vassalId}:${kind}:${vassal.lifeEvents.length}`,
    kind, tSec: Math.max(0, Math.floor(state.tSec ?? 0)), ...extra,
  });
}

function finishVassal(state, vassal, { reason, cause = null } = {}) {
  const lineage = getVassalLineage(state);
  vassal.isDead = reason === "died";
  vassal.endedReason = reason;
  vassal.deathCause = cause;
  vassal.endSec = Math.max(0, Math.floor(state.tSec ?? 0));
  if (vassal.isDead) vassal.deathSec = vassal.endSec;
  vassal.lifeMap.pendingResolution = null;
  lineage.currentVassalId = null;
  lineage.candidateRerollCount = 0;
  if (reason === "retired") {
    state.civilization.retiredVassals = state.civilization.retiredVassals ?? [];
    state.civilization.retiredVassals.push({
      vassalId: vassal.vassalId, retirementRegionId: vassal.locationRegionId,
      finalCunning: Math.max(0, Math.floor(vassal.stats?.cunning ?? 0)),
      finalWisdom: Math.max(0, Math.floor(vassal.stats?.wisdom ?? 0)),
      finalEffectiveness: Math.max(0, Math.floor(vassal.stats?.effectiveness ?? 0)),
      finalIntelligence: Math.max(0, Math.floor(vassal.stats?.intelligence ?? 0)),
    });
  }
  addLifeEvent(state, vassal, reason === "died" ? "died" : "retired", {
    causeOfDeath: cause, text: reason === "died" ? `Died: ${cause}` : "Retired after completing the life map",
  });
  generateCandidatePool(state);
}

function applyOptionEffect(state, vassal, nodeState, option) {
  const prestigeCost = getAdjustedVassalPrestigeCost(vassal, option?.prestigeCost ?? 0);
  if (prestigeCost > vassal.prestige) return { ok: false, reason: "insufficientPrestige" };
  vassal.prestige -= prestigeCost;
  if (Number.isFinite(option?.prestigeDelta)) {
    vassal.prestige = Math.max(0, vassal.prestige + Math.floor(option.prestigeDelta));
  }
  if (option?.statId && Number.isFinite(option.statDelta)) {
    vassal.stats[option.statId] = Math.max(
      0, Math.floor(vassal.stats[option.statId] ?? 0) + Math.floor(option.statDelta)
    );
  }
  if (option?.forcedRelocation) {
    const destinations = getPlayerDetailedSites(state)
      .map((site) => site.regionId)
      .filter((id) => id !== vassal.locationRegionId)
      .sort();
    if (destinations.length) {
      vassal.locationRegionId = destinations[0];
    }
  } else if (option?.locationRegionId) {
    vassal.locationRegionId = option.locationRegionId;
  }
  if (Number.isFinite(option?.legacyStartingPrestigeBonus)) {
    const legacy = state.civilization.vassalLegacy;
    legacy.futureStartingPrestigeBonus = Math.min(
      VASSAL_LIFE_TUNING.legacyStartingPrestigeBonusCap,
      Math.max(0, Math.floor(legacy.futureStartingPrestigeBonus ?? 0))
        + Math.max(0, Math.floor(option.legacyStartingPrestigeBonus))
    );
  }
  if (Number.isFinite(option?.immediateDeathChance)
      && state.rngNextVassalFloat() < option.immediateDeathChance) {
    nodeState.resolutionResult = "crisisDeath";
    finishVassal(state, vassal, { reason: "died", cause: "crisis" });
    return { ok: true, immediateDeath: true, prestigeCost, phaseCost: 0 };
  }
  const phaseCost = getAdjustedVassalPhaseCost(vassal, option?.phaseCost ?? 0);
  return { ok: true, prestigeCost, phaseCost };
}

function enqueueVassalDevelopmentChoices(state, vassal, count) {
  const queue = vassal.developmentChoiceQueue ?? [];
  let nextId = Math.max(1, Math.floor(vassal.nextDevelopmentChoiceId ?? 1));
  for (let index = 0; index < Math.max(0, Math.floor(count ?? 0)); index += 1) {
    const excludedIndex = state.rngNextVassalDevelopmentInt(
      0, VASSAL_LEVEL_UP_STAT_IDS.length - 1
    );
    queue.push({
      choiceId: `${vassal.vassalId}:level:${nextId}`,
      offeredStatIds: VASSAL_LEVEL_UP_STAT_IDS.filter(
        (_statId, statIndex) => statIndex !== excludedIndex
      ),
    });
    nextId += 1;
  }
  vassal.developmentChoiceQueue = queue;
  vassal.nextDevelopmentChoiceId = nextId;
  return queue;
}

function completeNodeResolution(state, vassal, nodeState) {
  vassal.prestige += getVassalPrestigeIncome(vassal);
  vassal.developmentProgress += getVassalDevelopmentIncome(vassal);
  let earnedDevelopmentChoices = 0;
  while (vassal.developmentProgress >= VASSAL_LIFE_TUNING.developmentThreshold) {
    vassal.developmentProgress -= VASSAL_LIFE_TUNING.developmentThreshold;
    earnedDevelopmentChoices += 1;
  }
  const age = getVassalAge(state, vassal);
  const mortalityChance = getVassalMortalityChance(age);
  const mortalityRoll = state.rngNextVassalFloat();
  nodeState.mortality = { age, chance: mortalityChance, roll: mortalityRoll };
  nodeState.resolving = false;
  nodeState.resolved = true;
  nodeState.resolvedSec = Math.max(0, Math.floor(state.tSec ?? 0));
  nodeState.resolutionResult = mortalityRoll < mortalityChance ? "naturalDeath" : "survived";
  vassal.lifeMap.pendingResolution = null;
  if (!vassal.lifeMap.completedNodeIds.includes(nodeState.nodeId)) {
    vassal.lifeMap.completedNodeIds.push(nodeState.nodeId);
  }
  addLifeEvent(state, vassal, "nodeResolved", {
    nodeId: nodeState.nodeId, result: nodeState.resolutionResult, age,
  });
  if (mortalityRoll < mortalityChance) {
    finishVassal(state, vassal, { reason: "died", cause: "naturalMortality" });
    return { ok: true, ended: true, died: true };
  }
  const node = VASSAL_LIFE_MAP_NODE_BY_ID[nodeState.nodeId];
  vassal.lifeMap.currentNodeId = null;
  if (!node?.outgoingNodeIds?.length) {
    finishVassal(state, vassal, { reason: "retired" });
    return { ok: true, ended: true, retired: true };
  }
  vassal.lifeMap.availableNodeIds = [...node.outgoingNodeIds];
  enqueueVassalDevelopmentChoices(state, vassal, earnedDevelopmentChoices);
  return { ok: true, ended: false };
}

export function confirmVassalLifeNode(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !nodeState || nodeState.resolving) {
    return { ok: false, reason: "nodeUnavailable" };
  }
  let option = null;
  if (!SHOP_FAMILIES.has(nodeState.family)) {
    option = nodeState.options.find((entry) => entry.id === nodeState.selectedOptionId) ?? null;
    if (!option) return { ok: false, reason: "optionRequired" };
  }
  const stagedPrestigeCost = (nodeState.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), 0);
  if (stagedPrestigeCost > vassal.prestige) {
    return { ok: false, reason: "insufficientPrestige" };
  }
  const validation = validatePurchaseInterventions(state, vassal, nodeState.purchasedOffers);
  if (!validation.ok) return validation;
  vassal.prestige -= stagedPrestigeCost;
  for (const purchase of nodeState.purchasedOffers) {
    const result = applyIntervention(state, purchase.intervention);
    if (!result.ok) return result;
    addLifeEvent(state, vassal, "interventionApplied", {
      nodeId, offerId: purchase.offerId, intervention: clone(purchase.intervention),
    });
  }
  let optionResult = { ok: true, phaseCost: 0 };
  if (option) optionResult = applyOptionEffect(state, vassal, nodeState, option);
  if (!optionResult.ok || optionResult.immediateDeath) return optionResult;
  nodeState.accumulatedPhaseCost += optionResult.phaseCost;
  nodeState.resolving = true;
  nodeState.confirmedSec = Math.max(0, Math.floor(state.tSec ?? 0));
  const resolveSec = nodeState.confirmedSec
    + Math.max(0, Math.floor(nodeState.accumulatedPhaseCost)) * getMoonPhaseDurationSec(state);
  vassal.lifeMap.pendingResolution = {
    kind: "nodeResolution", nodeId, startSec: nodeState.confirmedSec,
    resolveSec, phaseCost: Math.max(0, Math.floor(nodeState.accumulatedPhaseCost)),
  };
  if (resolveSec <= nodeState.confirmedSec) {
    return completeNodeResolution(state, vassal, nodeState);
  }
  return { ok: true, pendingResolution: clone(vassal.lifeMap.pendingResolution) };
}

function capitalize(value) {
  const text = String(value ?? "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}

function structureNumericDetails(def, tier) {
  const multiplier = getQualityMultiplier(tier, def?.qualityMultiplierPerLevel ?? 0);
  const scaled = (value) => Math.round(Math.max(0, Number(value) || 0) * multiplier * 100) / 100;
  if (Number.isFinite(def?.capacityPerCountSquared)) {
    return [`${scaled(def.capacityPerCountSquared)} ${def.capacityKind === "housing" ? "Housing" : "stored-Food capacity"} coefficient`];
  }
  if (Number.isFinite(def?.migrantHousingReserve)) return [`${scaled(def.migrantHousingReserve)} reserved Housing`];
  if (Number.isFinite(def?.knowledgeResearchMultiplierPerLevel)) return [`+${Math.round(scaled(def.knowledgeResearchMultiplierPerLevel) * 100)}% Knowledge Research`];
  if (Number.isFinite(def?.researchPerRetiredIntelligence)) return [`${scaled(def.researchPerRetiredIntelligence)} Research per retired Intelligence`];
  if (Number.isFinite(def?.faithResistancePerRetiredWisdom)) return [`${scaled(def.faithResistancePerRetiredWisdom)} resistance per retired Wisdom`];
  if (Number.isFinite(def?.foodOutputBonusPerOtherFoodPiece)) return [`+${Math.round(scaled(def.foodOutputBonusPerOtherFoodPiece) * 100)}% Food output per other Food piece`];
  if (Number.isFinite(def?.faithResistancePerDistinctTag)) return [`${scaled(def.faithResistancePerDistinctTag)} resistance per distinct tag`];
  if (Number.isFinite(def?.candidateIntelligenceBonus)) return [`+${scaled(def.candidateIntelligenceBonus)} candidate Intelligence`];
  if (def?.id === "university") return [`${tier === "diamond" ? "Diamond" : "Gold"} offer floor`];
  return [];
}

export function getVassalGamepiecePresentation(state, kind, definitionId, tier = "bronze") {
  const def = kind === "practice"
    ? getDetailedPracticeDef(state, definitionId)
    : getDetailedStructureDef(state, definitionId);
  if (!def) return null;
  return {
    kind,
    definitionId,
    label: def.label ?? definitionId,
    tier,
    qualityLabel: capitalize(tier),
    tags: [...(def.tags ?? [])],
    rule: def.ui?.rule ?? "",
    details: kind === "practice"
      ? [`${getDetailedPracticeWorkerCapacity(def, tier)} worker capacity`]
      : structureNumericDetails(def, tier),
  };
}

function buildShortestRegionPath(state, startId, targetId) {
  if (startId === targetId) return [startId];
  const definition = getWorldDefinition(state);
  const order = new Map((definition?.regions ?? []).map((region, index) => [region.id, index]));
  const adjacency = new Map((definition?.regions ?? []).map((region) => [region.id, []]));
  for (const edge of state?.world?.connections ?? []) {
    adjacency.get(edge.regionAId)?.push(edge.regionBId);
    adjacency.get(edge.regionBId)?.push(edge.regionAId);
  }
  for (const neighbours of adjacency.values()) {
    neighbours.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  }
  const queue = [startId];
  const previous = new Map([[startId, null]]);
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      if (next === targetId) {
        const path = [targetId];
        let cursor = current;
        while (cursor != null) {
          path.unshift(cursor);
          cursor = previous.get(cursor) ?? null;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

function buildRegionalMapPresentation(state, vassal, nodeState, {
  previewOptionId = null,
  previewOfferId = null,
} = {}) {
  if (!vassal || !nodeState || !["travel", "routes"].includes(nodeState.family)) return null;
  const definition = getWorldDefinition(state);
  const currentRegionId = vassal.locationRegionId;
  const selectedOption = nodeState.options?.find((option) =>
    option.id === (previewOptionId ?? nodeState.selectedOptionId)) ?? null;
  const previewOffer = [
    ...(nodeState.inventory ?? []),
    ...(nodeState.purchasedOffers ?? []),
  ].find((offer) => offer.offerId === previewOfferId) ?? null;
  const geographicAdjacentIds = getWorldConnectionCandidates(definition).flatMap((edge) => {
    if (edge.regionAId === currentRegionId) return [edge.regionBId];
    if (edge.regionBId === currentRegionId) return [edge.regionAId];
    return [];
  });
  const offeredRegionIds = nodeState.family === "travel"
    ? (nodeState.options ?? []).map((option) => option.locationRegionId)
    : [...(nodeState.inventory ?? []), ...(nodeState.purchasedOffers ?? [])]
      .flatMap((offer) => [offer.intervention?.regionAId, offer.intervention?.regionBId])
      .filter(Boolean);
  const selectedPath = nodeState.family === "travel" && selectedOption?.locationRegionId
    ? buildShortestRegionPath(state, currentRegionId, selectedOption.locationRegionId)
    : [];
  const includedIds = new Set([
    currentRegionId,
    ...geographicAdjacentIds,
    ...offeredRegionIds,
    ...selectedPath,
  ]);
  const regionOrder = new Map((definition?.regions ?? []).map((region, index) => [region.id, index]));
  const regions = (definition?.regions ?? []).filter((region) => includedIds.has(region.id)).map((region) => {
    const runtime = getRegionState(state, region.id);
    return {
      regionId: region.id,
      reference: getRegionReference(state, region.id),
      name: region.name,
      colour: runtime?.colour ?? "black",
      controller: runtime?.controller ?? "frontier",
      polygon: getRegionPolygon(definition, region).map(({ x, y }) => ({ x, y })),
      labelPoint: clone(region.display?.labelPoint ?? { x: 0, y: 0 }),
      current: region.id === currentRegionId,
      offered: offeredRegionIds.includes(region.id),
      selected: region.id === selectedOption?.locationRegionId,
      onSelectedPath: selectedPath.includes(region.id),
    };
  });
  const actualKeys = new Set((state?.world?.connections ?? []).map((edge) =>
    getWorldConnectionKey(edge.regionAId, edge.regionBId)));
  const stagedByKey = new Map((nodeState.purchasedOffers ?? [])
    .filter((purchase) => purchase.intervention?.kind === "connection")
    .map((purchase) => [
      getWorldConnectionKey(purchase.intervention.regionAId, purchase.intervention.regionBId),
      purchase.intervention.mode,
    ]));
  const previewIntervention = previewOffer?.intervention?.kind === "connection"
    ? previewOffer.intervention : null;
  const previewKey = previewIntervention
    ? getWorldConnectionKey(previewIntervention.regionAId, previewIntervention.regionBId) : null;
  const candidateEdges = new Map();
  for (const edge of state?.world?.connections ?? []) {
    candidateEdges.set(getWorldConnectionKey(edge.regionAId, edge.regionBId), edge);
  }
  for (const purchase of nodeState.purchasedOffers ?? []) {
    const intervention = purchase.intervention;
    if (intervention?.kind === "connection") {
      candidateEdges.set(getWorldConnectionKey(intervention.regionAId, intervention.regionBId), intervention);
    }
  }
  if (previewIntervention) candidateEdges.set(previewKey, previewIntervention);
  const connections = [...candidateEdges.entries()].filter(([, edge]) =>
    includedIds.has(edge.regionAId) && includedIds.has(edge.regionBId)).map(([key, edge]) => ({
      regionAId: edge.regionAId,
      regionBId: edge.regionBId,
      status: previewKey === key
        ? `preview-${previewIntervention.mode}`
        : stagedByKey.has(key)
          ? `staged-${stagedByKey.get(key)}`
          : actualKeys.has(key) ? "existing" : "absent",
      onSelectedPath: selectedPath.slice(1).some((regionId, index) =>
        getWorldConnectionKey(selectedPath[index], regionId) === key),
    }));
  return {
    kind: nodeState.family,
    currentRegionId,
    selectedDestinationId: selectedOption?.locationRegionId ?? null,
    selectedPath,
    distance: selectedPath.length > 0 ? selectedPath.length - 1 : null,
    regions: regions.sort((left, right) =>
      (regionOrder.get(left.regionId) ?? 0) - (regionOrder.get(right.regionId) ?? 0)),
    connections,
  };
}

function buildVassalOptionProjection(vassal, nodeState, optionId = null) {
  if (!vassal || !nodeState || !["patronage", "development"].includes(nodeState.family)) {
    return null;
  }
  const option = nodeState.options?.find((entry) =>
    entry.id === (optionId ?? nodeState.selectedOptionId)) ?? null;
  const immediate = clone(vassal);
  if (option) {
    const cost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
    immediate.prestige = Math.max(0, immediate.prestige - cost + Math.floor(option.prestigeDelta ?? 0));
    if (option.statId && Number.isFinite(option.statDelta)) {
      immediate.stats[option.statId] = Math.max(
        0, Math.floor(immediate.stats[option.statId] ?? 0) + Math.floor(option.statDelta)
      );
    }
  }
  const completionPrestigeIncome = getVassalPrestigeIncome(immediate);
  const completionExpIncome = getVassalDevelopmentIncome(immediate);
  const completionExpTotal = Math.max(0, immediate.developmentProgress ?? 0) + completionExpIncome;
  return {
    optionId: option?.id ?? null,
    baseline: {
      prestige: vassal.prestige,
      developmentProgress: vassal.developmentProgress,
      stats: getVassalStatsPresentation(vassal),
    },
    immediate: {
      prestige: immediate.prestige,
      developmentProgress: immediate.developmentProgress,
      stats: getVassalStatsPresentation(immediate),
    },
    ifSurvives: {
      prestige: immediate.prestige + completionPrestigeIncome,
      developmentProgress: completionExpTotal % VASSAL_LIFE_TUNING.developmentThreshold,
      earnedLevelCount: Math.floor(completionExpTotal / VASSAL_LIFE_TUNING.developmentThreshold),
      prestigeIncome: completionPrestigeIncome,
      developmentIncome: completionExpIncome,
    },
  };
}

export function getVassalNodeDecisionPresentation(state, nodeId = null, preview = {}) {
  const vassal = getCurrentLifeMapVassal(state);
  const activeNodeId = nodeId ?? vassal?.lifeMap?.currentNodeId ?? null;
  const node = VASSAL_LIFE_MAP_NODE_BY_ID[activeNodeId] ?? null;
  const nodeState = vassal?.lifeMap?.nodeStates?.[activeNodeId] ?? null;
  if (!vassal || !node) return null;
  const stagedPrestigeCost = (nodeState?.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), 0);
  const selectedOption = nodeState?.options?.find(
    (option) => option.id === (preview.previewOptionId ?? nodeState.selectedOptionId)
  ) ?? null;
  const optionPrestigeCost = selectedOption
    ? getAdjustedVassalPrestigeCost(vassal, selectedOption.prestigeCost ?? 0) : 0;
  const previewRegionId = selectedOption?.locationRegionId ?? vassal.locationRegionId;
  const previewSite = getDetailedSite(state, previewRegionId);
  const beforePractices = (previewSite?.detailedState?.practiceSlots ?? []).map((slot) => slot ? clone(slot) : null);
  const beforeStructures = (previewSite?.detailedState?.structureSlots ?? []).map((slot) => slot ? clone(slot) : null);
  const afterPractices = beforePractices.map((slot) => slot ? clone(slot) : null);
  const afterStructures = beforeStructures.map((slot) => slot ? clone(slot) : null);
  if (previewRegionId === vassal.locationRegionId) {
    for (const purchase of nodeState?.purchasedOffers ?? []) {
      const intervention = purchase.intervention;
      if (intervention?.kind === "practice") applyPracticeIntervention(afterPractices, intervention);
      if (intervention?.kind === "structure") {
        afterStructures[intervention.slotIndex] = {
          structureId: intervention.structureId, tier: intervention.tier ?? "bronze",
        };
      }
    }
  }
  const decorate = (kind, slots, before) => slots.map((slot, index) => {
    if (!slot) return null;
    const idKey = kind === "practice" ? "practiceId" : "structureId";
    const original = before[index];
    const staged = !original || original[idKey] !== slot[idKey]
      || (original.tier ?? "bronze") !== (slot.tier ?? "bronze");
    return {
      ...slot,
      staged,
      presentation: getVassalGamepiecePresentation(state, kind, slot[idKey], slot.tier ?? "bronze"),
    };
  });
  const decorateOffer = (offer, purchased = false) => {
    const intervention = offer.intervention;
    const kind = intervention?.kind;
    const definitionId = kind === "practice" ? intervention.practiceId
      : kind === "structure" ? intervention.structureId : null;
    return {
      ...clone(offer),
      purchased,
      presentation: definitionId
        ? getVassalGamepiecePresentation(state, kind, definitionId, intervention.resultingTier ?? intervention.tier ?? "bronze")
        : null,
      prestigeCost: purchased ? offer.prestigeCost
        : getAdjustedVassalPrestigeCost(vassal, offer.basePrestigeCost ?? 0),
      phaseCost: purchased ? offer.phaseCost
        : getAdjustedVassalPhaseCost(vassal, offer.basePhaseCost ?? 0),
    };
  };
  const displacedPractices = beforePractices.filter((slot) => slot
    && !afterPractices.some((after) => after?.practiceId === slot.practiceId));
  return {
    node, nodeState,
    currentPrestige: vassal.prestige,
    projectedPrestige: Math.max(0, vassal.prestige - stagedPrestigeCost - optionPrestigeCost),
    stagedPrestigeCost,
    previewRegionId,
    previewRegionLabel: getRegionReference(state, previewRegionId) ?? previewSite?.name ?? previewRegionId,
    settlement: previewSite ? {
      storedFood: previewSite.detailedState.storedFood,
      looseFood: previewSite.detailedState.looseFood,
      currency: previewSite.detailedState.currency ?? 0,
      practices: decorate("practice", afterPractices, beforePractices),
      displacedPractices: displacedPractices.map((slot) =>
        getVassalGamepiecePresentation(state, "practice", slot.practiceId, slot.tier ?? "bronze")),
      structures: decorate("structure", afterStructures, beforeStructures),
      structureCapacity: afterStructures.length,
    } : null,
    offers: (nodeState?.inventory ?? []).map((offer) => decorateOffer(offer)),
    purchases: (nodeState?.purchasedOffers ?? []).map((offer) => decorateOffer(offer, true)),
    contextKind: ["practiceReform", "publicWorks"].includes(nodeState?.family)
      ? "settlement"
      : ["travel", "routes"].includes(nodeState?.family)
        ? "regionalMap"
        : ["patronage", "development"].includes(nodeState?.family)
          ? "vassal" : "none",
    regionalMap: buildRegionalMapPresentation(state, vassal, nodeState, preview),
    vassalProjection: buildVassalOptionProjection(
      vassal, nodeState, preview.previewOptionId ?? null
    ),
  };
}

export function chooseVassalDevelopmentStat(state, choiceId, statId) {
  const vassal = getCurrentLifeMapVassal(state);
  if (!vassal) return { ok: false, reason: "noCurrentVassal" };
  const choice = vassal.developmentChoiceQueue?.[0] ?? null;
  if (!choice) return { ok: false, reason: "noDevelopmentChoice" };
  if (choice.choiceId !== choiceId) return { ok: false, reason: "staleDevelopmentChoice" };
  if (!choice.offeredStatIds.includes(statId)) {
    return { ok: false, reason: "invalidStat" };
  }
  vassal.stats[statId] = Math.max(0, Math.floor(vassal.stats[statId] ?? 0)) + 1;
  vassal.developmentChoiceQueue.shift();
  addLifeEvent(state, vassal, "developmentChosen", { choiceId, statId });
  return { ok: true, statId, value: vassal.stats[statId] };
}

export function stepVassalLifeMapSecond(state, tSec) {
  const vassal = getCurrentLifeMapVassal(state);
  const pending = vassal?.lifeMap?.pendingResolution;
  if (!vassal || !pending || Math.floor(tSec ?? 0) < Math.floor(pending.resolveSec ?? 0)) {
    return { ok: true, resolved: false };
  }
  const nodeState = vassal.lifeMap.nodeStates[pending.nodeId];
  if (!nodeState) return { ok: false, reason: "missingPendingNode" };
  return { ...completeNodeResolution(state, vassal, nodeState), resolved: true };
}

export function getVassalPendingResolution(state) {
  const pending = getCurrentLifeMapVassal(state)?.lifeMap?.pendingResolution;
  return pending ? clone(pending) : null;
}

export function getVassalNodeDisplayState(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  const node = VASSAL_LIFE_MAP_NODE_BY_ID[nodeId];
  if (!node) return null;
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId] ?? null;
  return {
    node,
    nodeState,
    available: !!vassal?.lifeMap?.availableNodeIds?.includes(nodeId)
      && (vassal.developmentChoiceQueue ?? []).length === 0,
    current: vassal?.lifeMap?.currentNodeId === nodeId,
    completed: !!vassal?.lifeMap?.completedNodeIds?.includes(nodeId),
  };
}

export function validateVassalLifeMapState(state) {
  const errors = [];
  const lineage = state?.civilization?.vassalLineage;
  const legacy = state?.civilization?.vassalLegacy;
  if (!lineage || typeof lineage !== "object" || Array.isArray(lineage)) {
    return { ok: false, errors: ["civilization.vassalLineage: expected an object"] };
  }
  if (!Number.isInteger(lineage.nextVassalId) || lineage.nextVassalId < 1) {
    errors.push("vassalLineage.nextVassalId: expected a positive integer");
  }
  if (!Array.isArray(lineage.selectedVassalIds)) {
    errors.push("vassalLineage.selectedVassalIds: expected an array");
  }
  if (!lineage.vassalsById || typeof lineage.vassalsById !== "object"
      || Array.isArray(lineage.vassalsById)) {
    errors.push("vassalLineage.vassalsById: expected an object");
  }
  if (!Array.isArray(lineage.pendingCandidates)) {
    errors.push("vassalLineage.pendingCandidates: expected an array");
  }
  if (lineage.currentVassalId != null
      && !lineage.vassalsById?.[lineage.currentVassalId]) {
    errors.push("vassalLineage.currentVassalId: expected an existing Vassal id");
  }
  for (const [vassalId, vassal] of Object.entries(lineage.vassalsById ?? {})) {
    if (vassal?.vassalId !== vassalId) errors.push(`${vassalId}: mismatched vassalId`);
    if (!Number.isFinite(vassal?.prestige) || !Number.isFinite(vassal?.initialAge)
        || !Number.isFinite(vassal?.selectedSec)) {
      errors.push(`${vassalId}: expected finite age origin and Prestige`);
    }
    if (!VASSAL_STAT_IDS.every((statId) => Number.isFinite(vassal?.stats?.[statId]))) {
      errors.push(`${vassalId}.stats: expected all four finite stats`);
    }
    if (!Array.isArray(vassal?.developmentChoiceQueue)
        || !Number.isInteger(vassal?.nextDevelopmentChoiceId)
        || vassal.nextDevelopmentChoiceId < 1) {
      errors.push(`${vassalId}.developmentChoiceQueue: invalid queue state`);
    } else {
      for (const choice of vassal.developmentChoiceQueue) {
        const offered = choice?.offeredStatIds;
        if (typeof choice?.choiceId !== "string" || !Array.isArray(offered)
            || offered.length !== 3 || new Set(offered).size !== 3
            || offered.some((statId) => !VASSAL_LEVEL_UP_STAT_IDS.includes(statId))) {
          errors.push(`${vassalId}.developmentChoiceQueue: invalid choice`);
        }
      }
    }
    if (vassal?.lifeMap?.mapId !== VASSAL_LIFE_MAP_ID
        || !Array.isArray(vassal?.lifeMap?.completedNodeIds)
        || !Array.isArray(vassal?.lifeMap?.availableNodeIds)
        || !vassal?.lifeMap?.nodeStates || Array.isArray(vassal.lifeMap.nodeStates)) {
      errors.push(`${vassalId}.lifeMap: invalid Life Map state`);
    }
    const nodeIds = [
      ...(vassal?.lifeMap?.completedNodeIds ?? []),
      ...(vassal?.lifeMap?.availableNodeIds ?? []),
      ...Object.keys(vassal?.lifeMap?.nodeStates ?? {}),
    ];
    if (nodeIds.some((nodeId) => !VASSAL_LIFE_MAP_NODE_BY_ID[nodeId])) {
      errors.push(`${vassalId}.lifeMap: unknown node id`);
    }
  }
  if (!legacy || !Number.isFinite(legacy.futureStartingPrestigeBonus)
      || legacy.futureStartingPrestigeBonus < 0
      || legacy.futureStartingPrestigeBonus > VASSAL_LIFE_TUNING.legacyStartingPrestigeBonusCap) {
    errors.push("civilization.vassalLegacy.futureStartingPrestigeBonus: invalid value");
  }
  return { ok: errors.length === 0, errors };
}
