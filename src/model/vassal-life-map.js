import {
  VASSAL_CRISIS_OPTIONS,
  VASSAL_DEVELOPMENT_OPTIONS,
  VASSAL_LEGACY_OPTIONS,
  VASSAL_LIFE_MAP_ENTRY_NODE_IDS,
  VASSAL_LIFE_MAP_ID,
  VASSAL_LIFE_MAP_NODE_BY_ID,
  VASSAL_LIFE_TUNING,
  VASSAL_PATRONAGE_OPTIONS,
  VASSAL_RECURRING_DEVELOPMENT_STAT_IDS,
  VASSAL_STAT_IDS,
  getVassalMortalityChance,
} from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  VASSAL_INTERVENTION_PRACTICE_IDS,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import { getDetailedPracticeDef } from "./game-config.js";
import { getMoonPhaseDurationSec } from "./moon-phases.js";
import {
  addWorldConnection,
  getRegionReference,
  getRegionState,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  getWorldDefinition,
  removeWorldConnection,
} from "./world-state.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const SHOP_FAMILIES = new Set(["practiceReform", "publicWorks", "routes"]);

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
    (_, index) => ({
      candidateId: `candidate-${Math.max(1, Math.floor(lineage.nextVassalId ?? 1))}-${index + 1}`,
      age: state.rngNextVassalInt(VASSAL_LIFE_TUNING.candidateAgeMin, VASSAL_LIFE_TUNING.candidateAgeMax),
      locationRegionId: locations[state.rngNextVassalInt(0, locations.length - 1)],
      prestige: state.rngNextVassalInt(
        VASSAL_LIFE_TUNING.candidatePrestigeMin,
        VASSAL_LIFE_TUNING.candidatePrestigeMax
      ) + legacyBonus,
      stats: Object.fromEntries(VASSAL_STAT_IDS.map((statId) => [
        statId,
        state.rngNextVassalInt(VASSAL_LIFE_TUNING.candidateStatMin, VASSAL_LIFE_TUNING.candidateStatMax),
      ])),
    })
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
    pendingDevelopmentChoices: 0,
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
    .sort((a, b) => a.graphDistance - b.graphDistance || a.locationRegionId.localeCompare(b.locationRegionId));
}

function applyReservedIntervention(reservation, intervention) {
  if (intervention.kind === "practice") {
    reservation.practiceSlots[intervention.slotIndex] = intervention.practiceId;
  } else if (intervention.kind === "structure") {
    reservation.structureSlots[intervention.slotIndex] = intervention.structureId;
  } else if (intervention.kind === "connection") {
    const key = getWorldConnectionKey(intervention.regionAId, intervention.regionBId);
    if (intervention.mode === "add") reservation.connectionKeys.add(key);
    else reservation.connectionKeys.delete(key);
  }
}

function buildReservation(state, vassal, nodeState) {
  const settlement = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
  const reservation = {
    practiceSlots: (settlement?.practiceSlots ?? []).map((slot) => slot?.practiceId ?? null),
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
    if (!def) continue;
    let slotIndex = reservation.practiceSlots.findIndex((value) => value == null);
    if (slotIndex < 0) slotIndex = reservation.practiceSlots.findIndex((value) => value !== practiceId);
    if (slotIndex < 0) continue;
    const replacedPracticeId = reservation.practiceSlots[slotIndex];
    const intervention = {
      kind: "practice", targetRegionId: vassal.locationRegionId, practiceId, slotIndex,
      mode: replacedPracticeId ? "replace" : "add", replacedPracticeId: replacedPracticeId ?? null,
    };
    reservation.practiceSlots[slotIndex] = practiceId;
    offers.push({
      offerId: `${nodeState.nodeId}:r${roll}:practice:${offers.length}`,
      label: replacedPracticeId ? `Replace ${replacedPracticeId} with ${def.label}` : `Add ${def.label}`,
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
  const defIds = shuffle(state, Object.keys(settlementStructureDefs));
  let defIndex = 0;
  while (offers.length < 3) {
    const slotIndex = reservation.structureSlots.findIndex((value) => value == null);
    if (slotIndex < 0 || defIds.length === 0) break;
    const structureId = defIds[defIndex % defIds.length];
    const def = settlementStructureDefs[structureId];
    reservation.structureSlots[slotIndex] = structureId;
    offers.push({
      offerId: `${nodeState.nodeId}:r${roll}:structure:${offers.length}`,
      label: `Build ${def.label}`,
      basePrestigeCost: Math.max(0, def.vassalPrestigeCost ?? 0),
      basePhaseCost: Math.max(0, def.vassalPhaseCost ?? 0),
      intervention: { kind: "structure", targetRegionId: vassal.locationRegionId, structureId, slotIndex },
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
  if (nodeState.family === "practiceReform") return buildPracticeOffers(state, vassal, nodeState, roll);
  if (nodeState.family === "publicWorks") return buildStructureOffers(state, vassal, nodeState, roll);
  return buildRouteOffers(state, vassal, nodeState, roll);
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
  if (vassal.pendingDevelopmentChoices > 0) return { ok: false, reason: "developmentChoiceRequired" };
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
  if (prestigeCost > vassal.prestige) return { ok: false, reason: "insufficientPrestige" };
  vassal.prestige -= prestigeCost;
  nodeState.inventory.splice(index, 1);
  nodeState.purchasedOfferIds.push(offer.offerId);
  nodeState.purchasedOffers.push({ ...clone(offer), prestigeCost, phaseCost, purchasedSec: state.tSec });
  nodeState.accumulatedPhaseCost += phaseCost;
  return { ok: true, offerId, prestigeCost, phaseCost };
}

export function rerollVassalShop(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !SHOP_FAMILIES.has(nodeState?.family)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  if (nodeState.rerollUsed) return { ok: false, reason: "rerollUsed" };
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
    settlement.practiceSlots[intervention.slotIndex] = {
      practiceId: intervention.practiceId, charge: 0, work: 0,
    };
    return { ok: true };
  }
  if (intervention.kind === "structure" && settlement
      && settlement.structureSlots[intervention.slotIndex] == null) {
    settlement.structureSlots[intervention.slotIndex] = { structureId: intervention.structureId };
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

function completeNodeResolution(state, vassal, nodeState) {
  vassal.prestige += getVassalPrestigeIncome(vassal);
  vassal.developmentProgress += getVassalDevelopmentIncome(vassal);
  while (vassal.developmentProgress >= VASSAL_LIFE_TUNING.developmentThreshold) {
    vassal.developmentProgress -= VASSAL_LIFE_TUNING.developmentThreshold;
    vassal.pendingDevelopmentChoices += 1;
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
    vassal.pendingDevelopmentChoices = 0;
    finishVassal(state, vassal, { reason: "retired" });
    return { ok: true, ended: true, retired: true };
  }
  vassal.lifeMap.availableNodeIds = [...node.outgoingNodeIds];
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

export function chooseVassalDevelopmentStat(state, statId) {
  const vassal = getCurrentLifeMapVassal(state);
  if (!vassal) return { ok: false, reason: "noCurrentVassal" };
  if (!VASSAL_RECURRING_DEVELOPMENT_STAT_IDS.includes(statId)) {
    return { ok: false, reason: "invalidStat" };
  }
  if (vassal.pendingDevelopmentChoices <= 0) return { ok: false, reason: "noDevelopmentChoice" };
  vassal.stats[statId] = Math.max(0, Math.floor(vassal.stats[statId] ?? 0)) + 1;
  vassal.pendingDevelopmentChoices -= 1;
  addLifeEvent(state, vassal, "developmentChosen", { statId });
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
      && (vassal.pendingDevelopmentChoices ?? 0) === 0,
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
