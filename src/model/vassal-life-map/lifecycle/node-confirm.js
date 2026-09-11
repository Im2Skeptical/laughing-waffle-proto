// Enter, option select, confirm, finish, and development-choice apply.

import {
  VASSAL_CRISIS_OPTIONS,
  VASSAL_DEVELOPMENT_OPTIONS,
  VASSAL_LEGACY_OPTIONS,
  VASSAL_LIFE_TUNING,
  VASSAL_MONSTER_HUNT_OPTIONS,
  VASSAL_PATRONAGE_OPTIONS,
  VASSAL_LEVEL_UP_STAT_IDS,
  VASSAL_STAT_IDS,
  getVassalMortalityChance,
} from "../../../defs/gamepieces/vassal-life-map-defs.js";
import {
  DETAILED_PRACTICE_SLOT_COUNT,
} from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { createInitialDetailedSettlementData } from "../../../defs/world/detailed-settlement-scenario.js";
import {
  createDetailedPracticeSlot,
} from "../../detailed-practice-tiers.js";
import { getMoonPhaseDurationSec } from "../../moon-phases.js";
import { getSettlementChaosGodState } from "../../settlement-chaos.js";
import {
  addWorldConnection,
  establishDetailedSettlement,
  getRegionReference,
  getRegionState,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  getWorldDefinition,
  removeWorldConnection,
} from "../../world-state.js";
import {
  clone,
  getAdjustedVassalPhaseCost,
  getAdjustedVassalPrestigeCost,
  getCurrentLifeMapVassal,
  getDetailedSite,
  getPlayerDetailedSites,
  getVassalAge,
  getVassalDevelopmentIncome,
  getVassalLifeMapNode,
  getVassalLifeMapOutgoingNodeIds,
  getVassalLineage,
  getVassalPrestigeIncome,
  shuffle,
} from "../selectors.js";
import {
  SHOP_FAMILIES,
  generateShopInventory,
  isShopNodeState,
  validatePurchaseInterventions,
} from "../shop.js";
import { generateCandidatePool } from "./candidates.js";

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

export function completeNodeResolution(state, vassal, nodeState) {
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
