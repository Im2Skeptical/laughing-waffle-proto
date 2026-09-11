import {
  VASSAL_CRISIS_OPTIONS,
  VASSAL_DEVELOPMENT_OPTIONS,
  VASSAL_LEGACY_OPTIONS,
  VASSAL_LIFE_TUNING,
  VASSAL_MONSTER_HUNT_OPTIONS,
  VASSAL_PATRONAGE_OPTIONS,
  VASSAL_LEVEL_UP_STAT_IDS,
  VASSAL_SIGNATURE_NODE_GROUP_IDS,
  VASSAL_SIGNATURE_NODE_VARIANTS,
  VASSAL_SIGNATURE_VARIANT_IDS_BY_GROUP,
  VASSAL_STAT_IDS,
  getVassalMortalityChance,
} from "../../defs/gamepieces/vassal-life-map-defs.js";
import {
  DETAILED_PRACTICE_SLOT_COUNT,
} from "../../defs/gamepieces/detailed-settlement-defs.js";
import { createInitialDetailedSettlementData } from "../../defs/world/detailed-settlement-scenario.js";
import { getDetailedStructureDef } from "../game-config.js";
import {
  createDetailedPracticeSlot,
  getDetailedPracticeTierIndex,
} from "../detailed-practice-tiers.js";
import { getMoonPhaseDurationSec } from "../moon-phases.js";
import { getSettlementChaosGodState } from "../settlement-chaos.js";
import {
  addWorldConnection,
  establishDetailedSettlement,
  getRegionReference,
  getRegionState,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  getWorldDefinition,
  removeWorldConnection,
} from "../world-state.js";
import {
  generateVassalLifeMap,
  validateVassalLifeMapGraph,
} from "../vassal-life-map-generator.js";
import {
  candidatePoolHash,
  clone,
  getAdjustedVassalPhaseCost,
  getAdjustedVassalPrestigeCost,
  getCurrentLifeMapVassal,
  getDetailedSite,
  getPlayerDetailedSites,
  getVassalAge,
  getVassalCandidatePool,
  getVassalDevelopmentIncome,
  getVassalLifeMapNode,
  getVassalLifeMapOutgoingNodeIds,
  getVassalLineage,
  getVassalPrestigeIncome,
  shuffle,
} from "./selectors.js";
import {
  SHOP_FAMILIES,
  generateShopInventory,
  isShopNodeState,
  validatePurchaseInterventions,
} from "./shop.js";

const VASSAL_PORTRAIT_KEYS = Object.freeze([
  "skinTone", "hairStyle", "hairColor", "faceShape",
  "clothingColor", "accessory", "expression",
]);

function isValidPortraitDescriptor(portrait) {
  return !!portrait && typeof portrait === "object" && !Array.isArray(portrait)
    && VASSAL_PORTRAIT_KEYS.every((key) => typeof portrait[key] === "string" && portrait[key]);
}

function isValidSignatureDescriptor(descriptor) {
  const variant = VASSAL_SIGNATURE_NODE_VARIANTS[descriptor?.variantId];
  return !!variant
    && descriptor.id === variant.id
    && descriptor.groupId === variant.groupId
    && descriptor.label === variant.label
    && descriptor.glyph === variant.glyph
    && descriptor.color === variant.color
    && descriptor.description === variant.description
    && descriptor.removalKind === variant.removalKind
    && descriptor.tag === variant.tag;
}

function generateVassalPortrait(state) {
  const pick = (values) => values[state.rngNextVassalPortraitInt(0, values.length - 1)];
  return {
    skinTone: pick(["umber", "sienna", "ochre", "olive", "rose", "ivory"]),
    hairStyle: pick(["crop", "waves", "braids", "coils", "long", "shaved"]),
    hairColor: pick(["black", "brown", "auburn", "gold", "silver"]),
    faceShape: pick(["round", "oval", "angular"]),
    clothingColor: pick(["red", "blue", "green", "gold", "purple", "charcoal"]),
    accessory: pick(["none", "band", "pin", "beads", "earring"]),
    expression: pick(["calm", "bright", "stern"]),
  };
}

function generateSignatureNodes(state) {
  const groups = shuffle(state, VASSAL_SIGNATURE_NODE_GROUP_IDS).slice(0, VASSAL_LIFE_TUNING.candidateCount);
  return groups.map((groupId) => {
    const variants = VASSAL_SIGNATURE_VARIANT_IDS_BY_GROUP[groupId];
    const variantId = variants[state.rngNextVassalInt(0, variants.length - 1)];
    return { ...clone(VASSAL_SIGNATURE_NODE_VARIANTS[variantId]), variantId };
  });
}

function generateCandidatePool(state) {
  const lineage = getVassalLineage(state);
  const locations = getPlayerDetailedSites(state).map((site) => site.regionId);
  const legacyBonus = Math.max(0, Math.floor(
    state?.civilization?.vassalLegacy?.futureStartingPrestigeBonus ?? 0
  ));
  const candidates = locations.length === 0 ? [] : Array.from(
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
      portrait: generateVassalPortrait(state),
    }); }
  );
  const signatureNodes = generateSignatureNodes(state);
  lineage.pendingCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    signatureNode: signatureNodes[index],
  }));
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

function createLifeMapState(state, vassalId, signatureNode = null) {
  const generationSeed = Math.floor(state?.rng?.vassalLifeMapSeed ?? 0);
  const generated = generateVassalLifeMap(state?.gameConfig?.lifeMapGenerator, {
    nextFloat: () => state.rngNextVassalLifeMapFloat(),
    nextInt: (min, max) => state.rngNextVassalLifeMapInt(min, max),
  }, {
    graphId: `${vassalId}-life-map`,
    generationSeed,
    signatureNode,
  });
  if (!generated.ok) {
    throw new Error(`Could not generate Vassal Life Map: ${generated.errors?.join("; ") ?? generated.reason}`);
  }
  return {
    graph: generated.graph,
    currentNodeId: null,
    completedNodeIds: [],
    availableNodeIds: [...generated.graph.entryNodeIds],
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
    lifeMap: createLifeMapState(state, vassalId, source.signatureNode),
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
  if (intervention.mode === "remove") {
    if (existingIndex < 0) return false;
    practiceSlots[existingIndex] = null;
    return true;
  }
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

function getSettlementTargets(state, vassal) {
  const source = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
  const adults = Math.max(0, Math.floor(source?.populationByClass?.villager?.adults ?? 0));
  if (adults < 10) return [];
  return (state?.world?.connections ?? []).flatMap((edge) => {
    const targetRegionId = edge.regionAId === vassal.locationRegionId ? edge.regionBId
      : edge.regionBId === vassal.locationRegionId ? edge.regionAId : null;
    const target = targetRegionId ? getRegionState(state, targetRegionId) : null;
    return target?.controller === "frontier" && Math.floor(target.structureCapacity ?? 0) >= 1
      ? [targetRegionId] : [];
  }).sort();
}

function buildSettlementFallbackOptions(state, vassal) {
  if (vassal.prestige < VASSAL_LIFE_TUNING.settlementPrestigeCost) {
    return [{ id: "settlement-favor", label: "Seek Settlement Favor", prestigeDelta: 10, phaseCost: 0 }];
  }
  const currentId = vassal.locationRegionId;
  const existing = new Set((state?.world?.connections ?? []).map((edge) =>
    getWorldConnectionKey(edge.regionAId, edge.regionBId)));
  const edge = getWorldConnectionCandidates(getWorldDefinition(state)).find((candidate) => {
    if (candidate.regionAId !== currentId && candidate.regionBId !== currentId) return false;
    const otherId = candidate.regionAId === currentId ? candidate.regionBId : candidate.regionAId;
    return getRegionState(state, otherId)?.controller === "frontier"
      && !existing.has(getWorldConnectionKey(candidate.regionAId, candidate.regionBId));
  });
  if (edge) return [{
    id: `settlement-edge:${edge.regionAId}:${edge.regionBId}`,
    label: `Open Route to ${getRegionReference(state, edge.regionAId === currentId ? edge.regionBId : edge.regionAId)}`,
    prestigeCost: VASSAL_LIFE_TUNING.routeAddPrestigeCost,
    phaseCost: VASSAL_LIFE_TUNING.routeAddPhaseCost,
    intervention: { kind: "connection", mode: "add", regionAId: edge.regionAId, regionBId: edge.regionBId },
  }];
  return [{ id: "settlement-favor", label: "Seek Settlement Favor", prestigeDelta: 10, phaseCost: 0 }];
}

export function getSettlementRequirements(state, vassal, option) {
  if (!option?.settlementRegionId && option?.id !== "settlement-unavailable") return [];
  const targetId = option.settlementRegionId;
  const target = getRegionState(state, targetId);
  const adults = Math.floor(getDetailedSite(state, vassal.locationRegionId)
    ?.detailedState?.populationByClass?.villager?.adults ?? 0);
  const cost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
  const connected = (state.world.connections ?? []).some((edge) =>
    getWorldConnectionKey(edge.regionAId, edge.regionBId)
      === getWorldConnectionKey(vassal.locationRegionId, targetId));
  return [
    { label: `${cost} Prestige (have ${vassal.prestige})`, met: vassal.prestige >= cost },
    { label: `10 adult Villagers move (have ${adults})`, met: adults >= 10 },
    { label: "Frontier destination", met: target?.controller === "frontier" },
    { label: "Existing route to destination", met: connected },
    { label: "Destination capacity: at least 1", met: (target?.structureCapacity ?? 0) >= 1 },
  ];
}

function buildSettlementOptions(state, vassal) {
  const eligible = getSettlementTargets(state, vassal);
  const targets = eligible.length ? eligible : getWorldConnectionCandidates(getWorldDefinition(state))
    .flatMap((edge) => {
      const otherId = edge.regionAId === vassal.locationRegionId ? edge.regionBId
        : edge.regionBId === vassal.locationRegionId ? edge.regionAId : null;
      return otherId && getRegionState(state, otherId)?.controller === "frontier" ? [otherId] : [];
    });
  const options = shuffle(state, targets).slice(0, 3).map((targetRegionId) => ({
    id: `small-settlement:${targetRegionId}`,
    label: `Found ${getRegionReference(state, targetRegionId)}`,
    prestigeCost: VASSAL_LIFE_TUNING.settlementPrestigeCost,
    phaseCost: 0,
    settlementRegionId: targetRegionId,
  }));
  if (!options.length) options.push({
    id: "settlement-unavailable", label: "Found Settlement",
    prestigeCost: VASSAL_LIFE_TUNING.settlementPrestigeCost, phaseCost: 0,
  });
  if (!options.some((option) => getSettlementRequirements(state, vassal, option).every((entry) => entry.met))) {
    return [...options.slice(0, 2), ...buildSettlementFallbackOptions(state, vassal)];
  }
  return options;
}

function buildDevelopmentOptions(state) {
  const statIds = shuffle(state, VASSAL_STAT_IDS).slice(0, 3);
  return VASSAL_DEVELOPMENT_OPTIONS.map((template, index) => {
    const statId = statIds[index];
    const option = { ...clone(template), statId, label: `${template.label}: ${statId}` };
    if (template.lossStatDelta) {
      const losses = VASSAL_STAT_IDS.filter((id) => id !== statId);
      option.lossStatId = losses[state.rngNextVassalInt(0, losses.length - 1)];
    }
    return option;
  });
}

function createNodeState(state, vassal, node) {
  const nodeState = {
    nodeId: node.id,
    family: node.family,
    signatureNode: node.signatureNode ? clone(node.signatureNode) : null,
    contentMode: "choice",
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
  if (node.signatureNode?.variantId === "settlement") {
    nodeState.options = buildSettlementOptions(state, vassal);
  } else if (node.signatureNode?.variantId === "legacyPlus") {
    nodeState.options = clone(VASSAL_LEGACY_OPTIONS).map((option) => ({
      ...option,
      legacyStartingPrestigeBonus: Math.max(0, option.legacyStartingPrestigeBonus ?? 0) * 2,
    }));
  } else if (node.signatureNode?.variantId === "monsterHunt") {
    nodeState.options = clone(VASSAL_MONSTER_HUNT_OPTIONS);
  } else if (["removal", "tagShop"].includes(node.signatureNode?.groupId)) {
    nodeState.contentMode = "shop";
    nodeState.inventory = generateShopInventory(state, vassal, nodeState);
    if (node.signatureNode.groupId === "removal" && nodeState.inventory.length === 0) {
      nodeState.contentMode = "choice";
      nodeState.options = [{
        id: "removalFallback", label: "Reorganize Local Affairs",
        prestigeDelta: 10, phaseCost: 0,
      }];
    }
  } else if (node.family === "patronage") nodeState.options = clone(VASSAL_PATRONAGE_OPTIONS);
  else if (node.family === "development") nodeState.options = buildDevelopmentOptions(state);
  else if (node.family === "travel") nodeState.options = buildTravelOptions(state, vassal);
  else if (node.family === "settlement") nodeState.options = buildSettlementOptions(state, vassal);
  else if (node.family === "crisis") nodeState.options = clone(VASSAL_CRISIS_OPTIONS);
  else if (node.family === "legacy") nodeState.options = clone(VASSAL_LEGACY_OPTIONS);
  else if (SHOP_FAMILIES.has(node.family)) {
    nodeState.contentMode = "shop";
    nodeState.inventory = generateShopInventory(state, vassal, nodeState);
  }
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
  const node = getVassalLifeMapNode(vassal, nodeId);
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
  if (getSettlementRequirements(state, vassal, option).some((entry) => !entry.met)) {
    return { ok: false, reason: "settlementUnavailable" };
  }
  const prestigeCost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
  if (prestigeCost > vassal.prestige) return { ok: false, reason: "insufficientPrestige" };
  nodeState.selectedOptionId = optionId;
  return { ok: true, optionId };
}

function applyIntervention(state, intervention) {
  const settlement = getDetailedSite(state, intervention.targetRegionId)?.detailedState;
  if (intervention.kind === "practice" && settlement) {
    return applyPracticeIntervention(settlement.practiceSlots, intervention)
      ? { ok: true }
      : { ok: false, reason: "practiceUnavailable" };
  }
  if (intervention.kind === "connection") {
    return intervention.mode === "add"
      ? addWorldConnection(state, intervention.regionAId, intervention.regionBId)
      : removeWorldConnection(state, intervention.regionAId, intervention.regionBId);
  }
  return { ok: false, reason: "interventionUnavailable" };
}

function applyVassalNodeEffects(state, effects = []) {
  for (const effect of effects) {
    if (effect?.op === "AdjustSettlementChaosGodState") {
      const god = getSettlementChaosGodState(state, effect.godId)
        ?? (effect.godId === "redGod" ? state?.civilization?.chaos : null);
      if (!god || typeof effect.key !== "string" || !Number.isFinite(god[effect.key])) {
        return { ok: false, reason: "chaosGodStateUnavailable" };
      }
      const minimum = Number.isFinite(effect.min) ? effect.min : Number.NEGATIVE_INFINITY;
      const maximum = Number.isFinite(effect.max) ? effect.max : Number.POSITIVE_INFINITY;
      god[effect.key] = Math.floor(Math.min(maximum, Math.max(
        minimum, Math.floor(god[effect.key]) + Math.floor(effect.amount ?? 0)
      )));
    } else {
      return { ok: false, reason: "unsupportedVassalNodeEffect" };
    }
  }
  return { ok: true };
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
  if (getSettlementRequirements(state, vassal, option).some((entry) => !entry.met)) {
    return { ok: false, reason: "settlementUnavailable" };
  }
  if (option?.settlementRegionId) {
    const source = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
    if (Math.floor(source?.populationByClass?.villager?.adults ?? 0) < 10
        || !getSettlementTargets(state, vassal).includes(option.settlementRegionId)) {
      return { ok: false, reason: "settlementUnavailable" };
    }
  }
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
  if (option?.lossStatId && Number.isFinite(option.lossStatDelta)) {
    vassal.stats[option.lossStatId] = Math.max(
      0, Math.floor(vassal.stats[option.lossStatId] ?? 0) + Math.floor(option.lossStatDelta)
    );
  }
  if (option?.settlementRegionId) {
    const source = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
    const targetRegionId = option.settlementRegionId;
    const settlement = createInitialDetailedSettlementData(targetRegionId);
    settlement.populationByClass.villager.children = 0;
    settlement.populationByClass.villager.adults = 10;
    settlement.populationByClass.villager.eldersByAge = [];
    settlement.populationByClass.stranger.children = 0;
    settlement.populationByClass.stranger.adults = 0;
    settlement.populationByClass.stranger.eldersByAge = [];
    settlement.practiceSlots = [
      { practiceId: "forage", tier: "bronze", charge: 0, work: 0 },
      null, null, null, null,
    ];
    settlement.structureSlots = [
      { structureId: "granary", tier: "bronze" },
      { structureId: "mudHouses", tier: "bronze" },
    ];
    const result = establishDetailedSettlement(state, targetRegionId, settlement);
    if (!result.ok) return result;
    source.populationByClass.villager.adults -= 10;
    vassal.locationRegionId = targetRegionId;
  }
  if (option?.intervention) {
    const result = applyIntervention(state, option.intervention);
    if (!result.ok) return result;
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
  const effectsResult = applyVassalNodeEffects(state, option?.effects);
  if (!effectsResult.ok) return effectsResult;
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
  const node = getVassalLifeMapNode(vassal, nodeState.nodeId);
  vassal.lifeMap.currentNodeId = null;
  if (getVassalLifeMapOutgoingNodeIds(vassal, node?.id).length === 0) {
    finishVassal(state, vassal, { reason: "retired" });
    return { ok: true, ended: true, retired: true };
  }
  vassal.lifeMap.availableNodeIds = getVassalLifeMapOutgoingNodeIds(vassal, node.id);
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
  if (!isShopNodeState(nodeState)) {
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
  const settlement = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
  if (settlement) {
    settlement.practiceSlots = validation.reservation.practiceSlots;
    settlement.structureSlots = validation.reservation.structureSlots;
  }
  for (const purchase of [...nodeState.purchasedOffers].reverse()) {
    if (purchase.intervention.kind === 'connection') {
      const result = applyIntervention(state, purchase.intervention);
      if (!result.ok) return result;
    }
    addLifeEvent(state, vassal, "interventionApplied", {
      nodeId, offerId: purchase.offerId, intervention: clone(purchase.intervention),
    });
  }
  if (isShopNodeState(nodeState) && nodeState.purchasedOffers.length === 0) {
    nodeState.accumulatedPhaseCost += VASSAL_LIFE_TUNING.emptyShopConfirmPhaseCost;
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
  const node = getVassalLifeMapNode(vassal, nodeId);
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
  } else {
    const groups = new Set();
    for (const [index, candidate] of lineage.pendingCandidates.entries()) {
      const variant = VASSAL_SIGNATURE_NODE_VARIANTS[candidate?.signatureNode?.variantId];
      if (!isValidSignatureDescriptor(candidate?.signatureNode)) {
        errors.push(`vassalLineage.pendingCandidates[${index}].signatureNode: invalid`);
      } else if (groups.has(variant.groupId)) {
        errors.push("vassalLineage.pendingCandidates: duplicate signature group");
      } else groups.add(variant.groupId);
      if (!isValidPortraitDescriptor(candidate?.portrait)) {
        errors.push(`vassalLineage.pendingCandidates[${index}].portrait: invalid`);
      }
    }
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
    if (!isValidSignatureDescriptor(vassal?.signatureNode)
        || !isValidPortraitDescriptor(vassal?.portrait)) {
      errors.push(`${vassalId}: invalid signature node or portrait`);
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
    const graphValidation = validateVassalLifeMapGraph(vassal?.lifeMap?.graph);
    if (!graphValidation.ok
        || !Array.isArray(vassal?.lifeMap?.completedNodeIds)
        || !Array.isArray(vassal?.lifeMap?.availableNodeIds)
        || !vassal?.lifeMap?.nodeStates || Array.isArray(vassal.lifeMap.nodeStates)) {
      errors.push(`${vassalId}.lifeMap: invalid Life Map state`);
      for (const error of graphValidation.errors ?? []) {
        errors.push(`${vassalId}.lifeMap.graph.${error}`);
      }
    }
    const nodeIds = [
      ...(vassal?.lifeMap?.completedNodeIds ?? []),
      ...(vassal?.lifeMap?.availableNodeIds ?? []),
      ...Object.keys(vassal?.lifeMap?.nodeStates ?? {}),
    ];
    if (nodeIds.some((nodeId) => !getVassalLifeMapNode(vassal, nodeId))) {
      errors.push(`${vassalId}.lifeMap: unknown node id`);
    }
    for (const [nodeId, nodeState] of Object.entries(vassal?.lifeMap?.nodeStates ?? {})) {
      if (!isShopNodeState(nodeState)) continue;
      const purchases = nodeState.purchasedOffers;
      if (!Array.isArray(purchases) || !Array.isArray(nodeState.purchasedOfferIds)
          || JSON.stringify(purchases.map(p => p?.offerId)) !== JSON.stringify(nodeState.purchasedOfferIds)
          || new Set(purchases.map(p => p?.offerId)).size !== purchases.length) {
        errors.push(`${vassalId}.${nodeId}: invalid staged purchases`);
        continue;
      }
      const malformed = purchases.some(p => {
        if (!p?.intervention || !Number.isFinite(p.prestigeCost) || !Number.isFinite(p.phaseCost)) return true;
        if (p.intervention.kind !== 'structure') return false;
        const placement = p.placement, def = getDetailedStructureDef(state, p.intervention.structureId);
        return !placement || !def || placement.structureId !== def.id || placement.width !== def.footprint
          || (placement.mode === 'upgrade' ? typeof placement.targetPlacementId !== 'string'
            : typeof placement.placementId !== 'string' || !Number.isInteger(placement.origin));
      });
      if (malformed) errors.push(`${vassalId}.${nodeId}: invalid staged placement`);
      else if (lineage.currentVassalId === vassalId && vassal.lifeMap.currentNodeId === nodeId
          && !nodeState.resolving && !vassal.lifeMap.completedNodeIds.includes(nodeId)
          && !validatePurchaseInterventions(state, vassal, purchases).ok) {
        errors.push(`${vassalId}.${nodeId}: incompatible staged settlement`);
      }
    }
  }
  if (!legacy || !Number.isFinite(legacy.futureStartingPrestigeBonus)
      || legacy.futureStartingPrestigeBonus < 0
      || legacy.futureStartingPrestigeBonus > VASSAL_LIFE_TUNING.legacyStartingPrestigeBonusCap) {
    errors.push("civilization.vassalLegacy.futureStartingPrestigeBonus: invalid value");
  }
  return { ok: errors.length === 0, errors };
}
