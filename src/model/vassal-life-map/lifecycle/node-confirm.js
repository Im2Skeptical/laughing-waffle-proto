import { addActionChaos } from '../../detailed-settlements/practice-events.js';
import { classActionOptions, validateClassAction, applyClassAction, completeCommission } from "../class-actions.js";
import { stockTotal, consumeStock } from "../../detailed-settlements/stock.js";
import { selectPopulationComposition } from "../../detailed-settlements/helpers.js";
import { removePopulationComposition } from "../../detailed-settlements/phases/migration.js";
import { emitPracticeEvent, withPracticeRoot } from '../../detailed-settlements/practice-events.js';
import { flushPracticeEvents } from '../../detailed-settlements/practices.js';
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
  getVassalActionPhaseCost,
  getVassalAge,
  getVassalStatPresentation,
  getVassalLifeMapNode,
  getVassalLifeMapOutgoingNodeIds,
  getVassalLineage,
  getVassalNodeResolutionGains,
  markHeirloomTimeAction,
  shuffle,
} from "../selectors.js";
import {
  acquireHeirloom,
  validateHeirloomAcquisition,
  generateRelicOffers,
  getEquippedHeirloomModifiers,
  hasPendingHeirloomLoadout,
  resolveHeirloomInheritance,
  spendMandateProtection,
} from "../heirlooms.js";
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
    nextSlot = {...createDetailedPracticeSlot(intervention.practiceId, intervention.resultingTier),stock:existing.stock,charge:existing.charge,work:existing.work};
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

function buildDevelopmentOptions(state, vassal) {
  const statIds = shuffle(state, VASSAL_STAT_IDS).slice(0, 3);
  return VASSAL_DEVELOPMENT_OPTIONS.map((template, index) => {
    const statId = statIds[index];
    const statLabel=getVassalStatPresentation(vassal,statId).label;
    const option = { ...clone(template), statId, statLabel, label: `${template.label}: ${statLabel}` };
    if (template.lossStatDelta) {
      const losses = VASSAL_STAT_IDS.filter((id) => id !== statId);
      option.lossStatId = losses[state.rngNextVassalInt(0, losses.length - 1)];
      option.lossStatLabel=getVassalStatPresentation(vassal,option.lossStatId).label;
    }
    if (template.id==='deepStudy' && ['cunning','wisdom'].includes(statId)) option.effects=[{op:'addChaos',amount:20}];
    return option;
  });
}

function createNodeState(state, vassal, node) {
  const nodeState = {
    nodeId: node.id,
    family: node.family,
    ...(node.stockOutput ? { stockOutput: node.stockOutput } : {}),
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
    nextCommissionId: 0,
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
    nodeState.options = classActionOptions(state,vassal,"campaign");
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
  } else if (node.family === "patronage") {
    nodeState.options = clone(VASSAL_PATRONAGE_OPTIONS).map(option => {
      if (!option.statId) return option;
      return {
        ...option,
        statLabel: getVassalStatPresentation(vassal, option.statId).label,
        ...(vassal.classId === "scholar" && option.statId === "cunning"
          ? { label: "Cultivate Ingenuity" } : {}),
      };
    });
  } else if (node.family === "development") nodeState.options = buildDevelopmentOptions(state, vassal);
  else if (node.family === "travel") nodeState.options = buildTravelOptions(state, vassal);
  else if (node.family === "settlement") nodeState.options = buildSettlementOptions(state, vassal);
  else if (classActionOptions(state, vassal, node.family)) nodeState.options = classActionOptions(state, vassal, node.family);
  else if (node.family === "legacy") nodeState.options = clone(VASSAL_LEGACY_OPTIONS);
  else if (node.family === "relic") nodeState.options = generateRelicOffers(state, vassal);
  else if (SHOP_FAMILIES.has(node.family)) {
    nodeState.contentMode = "shop";
    nodeState.inventory = generateShopInventory(state, vassal, nodeState);
  }
  return nodeState;
}

export function enterVassalLifeNode(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  if (!vassal) return { ok: false, reason: "noCurrentVassal" };
  if (hasPendingHeirloomLoadout(state)) return { ok: false, reason: "heirloomLoadoutRequired" };
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
    if (effect?.op === "addChaos") {
      addActionChaos(state,effect.amount);
    } else if (effect?.op === "AdjustSettlementChaosGodState") {
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
      classId: vassal.classId, completedCommissions: vassal.completedCommissions ?? 0,
      finalCunning: Math.max(0, Math.floor(vassal.stats?.cunning ?? 0)),
      finalWisdom: Math.max(0, Math.floor(vassal.stats?.wisdom ?? 0)),
      finalEffectiveness: Math.max(0, Math.floor(vassal.stats?.effectiveness ?? 0)),
      finalIntelligence: Math.max(0, Math.floor(vassal.stats?.intelligence ?? 0)),
    });
  }
  addLifeEvent(state, vassal, reason === "died" ? "died" : "retired", {
    causeOfDeath: cause, text: reason === "died" ? `Died: ${cause}` : "Retired after completing the life map",
  });
  resolveHeirloomInheritance(state, vassal);
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
  const classValidation = validateClassAction(state, vassal, option?.classAction);
  if (!classValidation.ok) return classValidation;
  const prestigeCost = getAdjustedVassalPrestigeCost(vassal, option?.prestigeCost ?? 0);
  if (prestigeCost > vassal.prestige) return { ok: false, reason: "insufficientPrestige" };
  vassal.prestige -= prestigeCost;
  if (!option?.classAction && Number.isFinite(option?.prestigeDelta)) {
    let delta = Math.floor(option.prestigeDelta);
    if (nodeState.family === "patronage" && delta > 0) {
      delta = Math.floor(delta * getEquippedHeirloomModifiers(vassal).patronageOptionMultiplier);
    }
    vassal.prestige = Math.max(0, vassal.prestige + delta);
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
    const adultSource = structuredClone(source);
    for (const cohort of Object.values(adultSource.populationByClass)) {
      cohort.children=0;cohort.eldersByAge=[];
      for (const specialist of Object.values(cohort.specialists)) {specialist.children=0;specialist.eldersByAge=[];}
    }
    const settlers=selectPopulationComposition(adultSource,['villager'],10);
    settlement.populationByClass.villager.children = 0;
    settlement.populationByClass.villager.adults = 10;
    settlement.populationByClass.villager.eldersByAge = [];
    settlement.populationByClass.villager.specialists=settlers.villager.specialists;
    settlement.populationByClass.stranger.children = 0;
    settlement.populationByClass.stranger.adults = 0;
    settlement.populationByClass.stranger.eldersByAge = [];
    settlement.practiceSlots = Array.from({length: DETAILED_PRACTICE_SLOT_COUNT}, (_,i) => i === 0 ? {practiceId:"forage",tier:"bronze",stock:2,charge:0,work:0} : null);
    settlement.structureSlots = [
      { structureId: "granary" },
      { structureId: "mudHouses" },
    ];
    const result = establishDetailedSettlement(state, targetRegionId, settlement);
    if (!result.ok) return result;
    removePopulationComposition(source,settlers);
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
  if (Number.isFinite(option?.immediateDeathChance) && option.immediateDeathChance > 0
      && state.rngNextVassalFloat() < option.immediateDeathChance) {
    const cause = nodeState.family === "relic" ? "relic" : "crisis";
    if (spendMandateProtection(vassal)) {
      nodeState.mandatePreventedDeath = true;
      addLifeEvent(state, vassal, "mandatePrevented", {
        nodeId: nodeState.nodeId, cause,
        text: cause === "relic" ? "Mandate of Heaven prevented a fatal Relic search."
          : "Mandate of Heaven prevented a fatal Crisis.",
      });
    } else {
      nodeState.resolutionResult = `${cause}Death`;
      finishVassal(state, vassal, { reason: "died", cause });
      return { ok: true, immediateDeath: true, prestigeCost, phaseCost: 0 };
    }
  }
  withPracticeRoot(state,{kind:'vassalAction',regionId:vassal.locationRegionId,classId:vassal.classId},()=>{
    if ((option?.immediateDeathChance??0)>0) emitPracticeEvent(state,{kind:'dangerSurvived',regionId:vassal.locationRegionId,classId:vassal.classId,
      martial:['campaign','challenge'].includes(option?.classAction?.kind)});
    if (!option?.classAction?.onCompletion) applyClassAction(state, vassal, option?.classAction);
  });
  flushPracticeEvents(state);
  if (option?.classAction && Number.isFinite(option.prestigeDelta)) vassal.prestige+=option.prestigeDelta;
  if (vassal.classId === "warrior" && (option?.baseDanger??option?.immediateDeathChance) > 0) vassal.prestige += Math.ceil((option.baseDanger??option.immediateDeathChance) * 50);
  const phaseCost = getVassalActionPhaseCost(vassal, option?.phaseCost ?? 0, {
    nodeState,
    isTravel: nodeState.family === "travel",
  });
  markHeirloomTimeAction(nodeState, phaseCost);
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
  const option = nodeState.options.find(entry => entry.id === nodeState.selectedOptionId);
  if (option?.classAction?.onCompletion) applyClassAction(state, vassal, option.classAction);
  completeCommission(state, vassal);
  const gains = getVassalNodeResolutionGains(vassal, nodeState.family);
  vassal.prestige += gains.prestige;
  vassal.developmentProgress += gains.development;
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
  vassal.lifeMap.pendingResolution = null;
  if (!vassal.lifeMap.completedNodeIds.includes(nodeState.nodeId)) {
    vassal.lifeMap.completedNodeIds.push(nodeState.nodeId);
  }
  if (mortalityRoll < mortalityChance) {
    if (spendMandateProtection(vassal)) {
      nodeState.mandatePreventedDeath = true;
      nodeState.resolutionResult = "mandatePrevented";
      addLifeEvent(state, vassal, "mandatePrevented", {
        nodeId: nodeState.nodeId, cause: "naturalMortality",
        text: "Mandate of Heaven prevented natural mortality.",
      });
    } else {
      nodeState.resolutionResult = "naturalDeath";
      addLifeEvent(state, vassal, "nodeResolved", {
        nodeId: nodeState.nodeId, result: nodeState.resolutionResult, age,
      });
      finishVassal(state, vassal, { reason: "died", cause: "naturalMortality" });
      return { ok: true, ended: true, died: true };
    }
  } else {
    nodeState.resolutionResult = "survived";
  }
  addLifeEvent(state, vassal, "nodeResolved", {
    nodeId: nodeState.nodeId, result: nodeState.resolutionResult, age,
  });
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

export function confirmVassalLifeNode(state, nodeId, acquire = null) {
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
  // Charge the search before the new Heirloom is equipped, so a time-reducing
  // find cannot discount the choice that discovered it.
  const relicPhaseCost = nodeState.family === "relic"
    ? getVassalActionPhaseCost(vassal, option?.phaseCost ?? 0, { nodeState, isTravel: false })
    : null;
  if (nodeState.family === "relic") {
    if (option?.emptyRelic) {
      acquire = { destination: "decline" };
    } else if (!acquire?.destination) {
      return { ok: false, reason: "acquireRequired" };
    }
    if (option?.definitionId && acquire.destination !== "decline") {
      const acquired = validateHeirloomAcquisition(state, vassal, option.definitionId, acquire);
      if (!acquired.ok) return acquired;
    }
  }
  const stagedPrestigeCost = (nodeState.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), 0);
  const stagedCurrencyCost = (nodeState.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.currencyCost ?? 0), 0);
  if (stagedPrestigeCost > vassal.prestige) {
    return { ok: false, reason: "insufficientPrestige" };
  }
  const settlement = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
  if (stagedCurrencyCost > stockTotal(state, settlement, "Currency")) {
    return { ok: false, reason: "insufficientCurrency" };
  }
  const validation = validatePurchaseInterventions(state, vassal, nodeState.purchasedOffers);
  if (!validation.ok) return validation;
  const layoutChanged = settlement && (
    JSON.stringify(settlement.practiceSlots) !== JSON.stringify(validation.reservation.practiceSlots)
    || JSON.stringify(settlement.structureSlots) !== JSON.stringify(validation.reservation.structureSlots));
  vassal.prestige -= stagedPrestigeCost;
  if (settlement) {
    consumeStock(state, settlement, "Currency", stagedCurrencyCost);
    // Upgrades create a new slot object; carry the post-payment Stock into it.
    for (const slot of validation.reservation.practiceSlots) {
      if (slot) {
        const existing=settlement.practiceSlots.find(old=>old?.practiceId===slot.practiceId);
        slot.stock=existing?.stock??0;slot.charge=existing?.charge??0;
      }
    }
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
  if (nodeState.purchasedOffers.length > 0 || layoutChanged) {
    emitPracticeEvent(state,{kind:'settlementChanged',regionId:vassal.locationRegionId,reason:'shopConfirmed'});
    flushPracticeEvents(state);
  }
  if (isShopNodeState(nodeState) && nodeState.purchasedOffers.length === 0) {
    const emptyCost = getVassalActionPhaseCost(
      vassal, VASSAL_LIFE_TUNING.emptyShopConfirmPhaseCost, { nodeState }
    );
    nodeState.accumulatedPhaseCost += emptyCost;
    markHeirloomTimeAction(nodeState, emptyCost);
  }
  let optionResult = { ok: true, phaseCost: 0 };
  if (option) optionResult = applyOptionEffect(state, vassal, nodeState, option);
  if (!optionResult.ok || optionResult.immediateDeath) return optionResult;
  if (nodeState.family === "relic" && option?.definitionId && acquire.destination !== "decline") {
    const acquired = acquireHeirloom(state, vassal, option.definitionId, acquire);
    if (!acquired.ok) return acquired;
  }
  if (relicPhaseCost != null) optionResult = { ...optionResult, phaseCost: relicPhaseCost };
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
