// Workers, slot evaluation, practice effects, and administration routing.

import {
  DETAILED_PRACTICE_SLOT_COUNT,
  POPULATION_CLASS_ORDER,
  detailedSettlementEffectOps,
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../../defs/gamepieces/detailed-settlement-defs.js";
import {
  getDetailedPracticeTierIndex,
  getDetailedPracticeWorkerCapacity,
  getQualityMultiplier,
} from "../detailed-practice-tiers.js";
import {
  getDetailedPracticeDef,
  getDetailedStructureDef,
  getGameSetting,
} from "../game-config.js";
import {
  deserializeGameState,
  getCurrentSeasonKey,
  serializeGameState,
} from "../state.js";
import { applyBuild, findStructurePlacement } from "../structure-layout.js";
import { getRegionState } from "../world-state.js";
import { clone, eldersCount, ensureMoonRegionResult, roundFood } from "./helpers.js";
import {
  getDetailedSettlement,
  getDetailedSettlementSite,
  getDetailedSettlementSites,
  getPopulationSummary,
  getStoredFoodCapacity,
  getStructureQualityUnits,
  hasStructureCapability,
} from "./queries.js";
import {
  evaluateDetailedMapScore,
  getWorldRegionOrder,
  resolveDetailedRegionScope,
  validateRegionScopeDefinition,
} from "./scopes.js";

function validateScaledValueDefinition(scaledValue, label, errors) {
  if (!scaledValue || typeof scaledValue !== "object") {
    errors.push(`${label}: missing scaledValue`);
    return;
  }
  if (!Number.isFinite(scaledValue.baseAmount) || scaledValue.baseAmount < 0) {
    errors.push(`${label}: invalid baseAmount`);
  }
  if (!Number.isFinite(scaledValue.workerMultiplier?.base)
      || scaledValue.workerMultiplier.base < 0) {
    errors.push(`${label}: invalid worker multiplier base`);
  }
  if (!Number.isFinite(scaledValue.workerMultiplier?.perEffectiveWorker)
      || scaledValue.workerMultiplier.perEffectiveWorker < 0) {
    errors.push(`${label}: invalid worker multiplier contribution`);
  }
  const evaluator = scaledValue.evaluator;
  if (evaluator?.kind === "constant") {
    if (!Number.isFinite(evaluator.score) || evaluator.score < 0) {
      errors.push(`${label}: invalid constant evaluator score`);
    }
  } else if (evaluator?.kind === "countRegions") {
    validateRegionScopeDefinition(evaluator.scope, `${label}.evaluator.scope`, errors);
  } else if (["countDistinctRegionalColours", "countAlliedConnectedRegions"].includes(evaluator?.kind)) {
    // These evaluators have fixed local/allied scopes and need no nested scope.
  } else {
    errors.push(`${label}: invalid evaluator ${evaluator?.kind}`);
  }
}

export function validateDetailedPracticeDefinitions() {
  const errors = [];
  const validOps = new Set(detailedSettlementEffectOps);
  for (const [id, def] of Object.entries(detailedSettlementPracticeDefs)) {
    if (def.id !== id) errors.push(`${id}: id mismatch`);
    if (!Number.isInteger(def.workerCapacity) || def.workerCapacity < 0) {
      errors.push(`${id}: invalid workerCapacity`);
    }
    if (!["season", "birth", "food", "passive", "housing", "faith", "trigger"].includes(def.activation?.type)) {
      errors.push(`${id}: invalid activation`);
    }
    if (def.activation?.stage != null
        && (def.activation.type !== "food"
          || !["preRouting", "postRouting"].includes(def.activation.stage))) {
      errors.push(`${id}: invalid activation stage`);
    }
    if (def.activation?.seasonKeys != null
        && (!Array.isArray(def.activation.seasonKeys)
          || def.activation.seasonKeys.some((key) => typeof key !== "string"))) {
      errors.push(`${id}: invalid season keys`);
    }
    for (const effect of def.effects ?? []) {
      if (!validOps.has(effect?.op)) errors.push(`${id}: invalid effect op ${effect?.op}`);
      if (["addLocalFood", "addLocalCurrency", "routeLocalFood", "reduceFoodDecay"].includes(effect?.op)) {
        validateScaledValueDefinition(effect.scaledValue, `${id}.${effect.op}`, errors);
      }
      if (effect?.op === "routeLocalFood") {
        validateRegionScopeDefinition(effect.targetScope, `${id}.routeLocalFood.targets`, errors);
      }
      if (effect?.op === "reduceFoodDecay"
          && !["stored", "loose"].includes(effect.foodKind)) {
        errors.push(`${id}: invalid food decay kind ${effect.foodKind}`);
      }
      if (effect?.op === "createLocalStructureAtWork"
          && !settlementStructureDefs[effect.structureDefId]) {
        errors.push(`${id}: invalid structure ${effect.structureDefId}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function resolveScaledValue(state, site, assignment, scaledValue) {
  const evaluation = evaluateDetailedMapScore(
    state,
    site.regionId,
    scaledValue?.evaluator
  );
  const baseAmount = Math.max(0, Number(scaledValue?.baseAmount) || 0);
  const evaluatorScore = evaluation.ok ? evaluation.score : 0;
  const baseValue = roundFood(baseAmount * evaluatorScore);
  const multiplierBase = Math.max(
    0,
    Number(scaledValue?.workerMultiplier?.base) || 0
  );
  const perEffectiveWorker = Math.max(
    0,
    Number(getDetailedPracticeDef(state, assignment.practiceId)?.workerBonus ?? scaledValue?.workerMultiplier?.perEffectiveWorker ?? .25)
  );
  const workerMultiplier = roundFood(
    multiplierBase + assignment.effectiveWorkers * perEffectiveWorker
  );
  return {
    ok: evaluation.ok,
    baseAmount,
    evaluatorScore,
    evaluatorBreakdown: evaluation.breakdown ?? [],
    diagnostics: evaluation.diagnostics ?? {},
    baseValue,
    workerMultiplier,
    effectiveValue: roundFood(baseValue * workerMultiplier),
  };
}

export function assignDetailedSettlementWorkers(state, regionId) {
  const settlement = getDetailedSettlement(state, regionId);
  const slots = settlement?.practiceSlots ?? [];
  const assignments = slots.map(() => []);
  for (const classId of POPULATION_CLASS_ORDER) {
    const classState = settlement?.populationByClass?.[classId];
    let tokens = Math.floor(
      (Math.max(0, Math.floor(classState?.adults ?? 0)) + eldersCount(classState))
        / Math.max(1, getGameSetting(state, "populationPerToken"))
    );
    for (let slotIndex = 0; slotIndex < slots.length && tokens > 0; slotIndex += 1) {
      const def = getDetailedPracticeDef(state, slots[slotIndex]?.practiceId);
      const room = Math.max(0, getDetailedPracticeWorkerCapacity(def, slots[slotIndex]?.tier)
        - assignments[slotIndex].length);
      const count = Math.min(tokens, room);
      for (let index = 0; index < count; index += 1) {
        assignments[slotIndex].push({
          classId,
          effectiveness: getGameSetting(
            state,
            classId === "villager" ? "villagerEffectiveness" : "strangerEffectiveness"
          ),
        });
      }
      tokens -= count;
    }
  }
  return assignments.map((tokens, slotIndex) => ({
    slotIndex,
    practiceId: slots[slotIndex]?.practiceId ?? null,
    tokens,
    effectiveWorkers: tokens.reduce((sum, token) => sum + token.effectiveness, 0),
  }));
}

function getPracticeChargeThreshold(def, tier) {
  const reduction = def.activation.chargeThresholdReductionPerQuality ?? .5;
  return Math.max(1, Math.floor((def.activation.chargeThreshold ?? 1) - getDetailedPracticeTierIndex(tier) * reduction));
}

export function buildDetailedPracticeEvaluation(state, site, assignment) {
  const slot = site?.detailedState?.practiceSlots?.[assignment.slotIndex] ?? null;
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  if (!def) return null;
  return {
    practiceId: def.id,
    label: def.label,
    workerCapacity: getDetailedPracticeWorkerCapacity(def, slot.tier),
    activation: { ...clone(def.activation), ...(def.activation.type === "trigger"
      ? { chargeThreshold: getPracticeChargeThreshold(def, slot.tier) } : {}) },
    rule: def.ui?.rule ?? "",
    effects: (def.effects ?? []).map((effect) => ({
      op: effect.op,
      foodKind: effect.foodKind ?? null,
      importCalculation: effect.op === "importMissingFood"
        ? getImportCalculation(state, site.regionId)
        : null,
      scaledValue: effect.scaledValue
        ? resolveScaledValue(state, site, assignment, effect.scaledValue)
        : null,
      targetRegionIds: effect.targetScope
        ? resolveDetailedRegionScope(state, site.regionId, effect.targetScope)
        : [],
    })),
  };
}

export function evaluateDetailedPracticeSlot(state, regionId, slotIndex) {
  const site = getDetailedSettlementSite(state, regionId);
  if (!site || !Number.isInteger(slotIndex)) return null;
  const assignment = assignDetailedSettlementWorkers(state, regionId)[slotIndex];
  return assignment ? buildDetailedPracticeEvaluation(state, site, assignment) : null;
}

function addFoodToSettlement(state, regionId, amount) {
  const settlement = getDetailedSettlement(state, regionId);
  if (!settlement || amount <= 0) return 0;
  const capacity = getStoredFoodCapacity(state, regionId);
  const room = Math.max(0, capacity - settlement.storedFood);
  const stored = Math.min(room, amount);
  settlement.storedFood = roundFood(settlement.storedFood + stored);
  settlement.looseFood = roundFood(settlement.looseFood + amount - stored);
  return roundFood(amount);
}

function addCurrencyToSettlement(state, regionId, amount) {
  const settlement = getDetailedSettlement(state, regionId);
  if (!settlement || amount <= 0) return 0;
  settlement.currency = roundFood(Math.max(0, settlement.currency ?? 0) + amount);
  return roundFood(amount);
}

function recordCurrencySpent(state, regionId, amount) {
  const spent = roundFood(Math.max(0, amount ?? 0));
  const turn = state?.civilization?.currentMoonTurn;
  if (!turn || spent <= 0) return;
  const result = ensureMoonRegionResult(turn, regionId);
  result.currencySpent = roundFood((result.currencySpent ?? 0) + spent);
}

export function consumeFood(settlement, amount) {
  const demand = roundFood(amount);
  const fromLoose = Math.min(settlement.looseFood, demand);
  settlement.looseFood = roundFood(settlement.looseFood - fromLoose);
  const remainder = roundFood(demand - fromLoose);
  const fromStored = Math.min(settlement.storedFood, remainder);
  settlement.storedFood = roundFood(settlement.storedFood - fromStored);
  return roundFood(fromLoose + fromStored);
}

function getImportFunding(state, regionId) {
  const local = getDetailedSettlement(state, regionId);
  if (!local) return [];
  const sources = [{ regionId, settlement: local }];
  if (!hasStructureCapability(state, regionId, "remoteImportFunding")) return sources;
  for (const remoteId of resolveDetailedRegionScope(state, regionId, {
    kind: "commercialAdjacent",
    includeHost: false,
    regionFilters: { controller: "player", detailedSettlement: true },
  })) {
    const settlement = getDetailedSettlement(state, remoteId);
    if (settlement) sources.push({ regionId: remoteId, settlement });
  }
  return sources;
}

function getImportCalculation(state, regionId) {
  const settlement = getDetailedSettlement(state, regionId);
  if (!settlement) return { missingFood: 0, localCurrency: 0, remoteCurrency: 0, importedFood: 0 };
  const mealDemand = getPopulationSummary(state, regionId).mealDemand;
  const missingFood = roundFood(Math.max(0, mealDemand - settlement.looseFood - settlement.storedFood));
  const sources = getImportFunding(state, regionId);
  const localCurrency = roundFood(Math.max(0, sources[0]?.settlement?.currency ?? 0));
  const remoteCurrency = roundFood(sources.slice(1).reduce(
    (sum, source) => sum + Math.max(0, source.settlement.currency ?? 0), 0
  ));
  return {
    missingFood,
    localCurrency,
    remoteCurrency,
    importedFood: roundFood(Math.min(missingFood, localCurrency + remoteCurrency)),
    remoteRegionIds: sources.slice(1).map((source) => source.regionId),
  };
}

function importMissingFood(state, regionId) {
  const calculation = getImportCalculation(state, regionId);
  let remaining = calculation.importedFood;
  for (const source of getImportFunding(state, regionId)) {
    if (remaining <= 0) break;
    const spent = Math.min(remaining, Math.max(0, source.settlement.currency ?? 0));
    source.settlement.currency = roundFood(source.settlement.currency - spent);
    recordCurrencySpent(state, source.regionId, spent);
    remaining = roundFood(remaining - spent);
  }
  if (calculation.importedFood > 0) {
    // Imported Food exists only for this meal, so add it directly to loose Food.
    const settlement = getDetailedSettlement(state, regionId);
    settlement.looseFood = roundFood(settlement.looseFood + calculation.importedFood);
  }
  return calculation;
}

function compactPracticeSlots(settlement) {
  const active = settlement.practiceSlots.filter(Boolean).slice(0, DETAILED_PRACTICE_SLOT_COUNT);
  while (active.length < DETAILED_PRACTICE_SLOT_COUNT) active.push(null);
  settlement.practiceSlots = active;
}

export function tryCreateStructure(state, regionId, structureId) {
  const settlement = getDetailedSettlement(state, regionId);
  const region = getRegionState(state, regionId);
  if (!settlement || !region || !getDetailedStructureDef(state, structureId)) return false;
  const width = getDetailedStructureDef(state, structureId).footprint ?? 1;
  const location = findStructurePlacement(settlement.structureSlots, width);
  if (!location.ok) return false;
  const result = applyBuild(settlement.structureSlots, { structureId, tier: 'bronze', width, origin: location.origin,
    placementId: regionId + ':' + state.tSec + ':' + location.origin });
  if (!result.ok) return false;
  settlement.structureSlots = result.slots;
  return true;
}

function markCompletedBuildInterventionResolved(state, regionId, practiceId) {
  // Life-map purchases are complete when the Practice is installed. A later
  // build-Practice completion no longer mutates a Vassal agenda.
  void state;
  void regionId;
  void practiceId;
}

function practiceMatchesActivation(state, def, activationType, stage = null) {
  if (def?.activation?.type !== activationType) return false;
  if (activationType === "food" && stage != null
      && (def.activation.stage ?? "postRouting") !== stage) return false;
  if (activationType !== "season" || !Array.isArray(def.activation.seasonKeys)) {
    return true;
  }
  return def.activation.seasonKeys.includes(getCurrentSeasonKey(state));
}

export function getPracticeTags(state, practiceId) {
  return getDetailedPracticeDef(state, practiceId)?.tags ?? [];
}

export function getLocalTaggedPieceCount(state, regionId, tag, { excludeStructureId = null } = {}) {
  const settlement = getDetailedSettlement(state, regionId);
  const practices = (settlement?.practiceSlots ?? []).filter((slot) =>
    slot && getPracticeTags(state, slot.practiceId).includes(tag)).length;
  const structures = (settlement?.structureSlots ?? []).filter((slot) =>
    slot && slot.structureId !== excludeStructureId && (getDetailedStructureDef(state, slot.structureId)?.tags ?? []).includes(tag)).length;
  return practices + structures;
}

export function getLocalDistinctPieceTags(state, regionId) {
  const settlement = getDetailedSettlement(state, regionId);
  return [...new Set([
    ...(settlement?.practiceSlots ?? []).flatMap((slot) => slot ? getPracticeTags(state, slot.practiceId) : []),
    ...(settlement?.structureSlots ?? []).flatMap((slot) => slot ? (getDetailedStructureDef(state, slot.structureId)?.tags ?? []) : []),
  ])].sort();
}

export function getPhaseModifiers(state) {
  if (!state.civilization.phaseModifiers || typeof state.civilization.phaseModifiers !== "object") {
    state.civilization.phaseModifiers = { housingByRegion: {}, foodByRegion: {}, faithResistance: 0 };
  }
  return state.civilization.phaseModifiers;
}

function addPracticeTrace(site, entry) {
  const trace = Array.isArray(site.detailedState.practiceActivationTrace) ? site.detailedState.practiceActivationTrace : [];
  trace.push(entry);
  site.detailedState.practiceActivationTrace = trace.slice(-20);
}

function getResearchStructureBonus(state, regionId, practiceId) {
  if (!getPracticeTags(state, practiceId).includes("Knowledge")) return 1;
  const library = getDetailedStructureDef(state, "library");
  const units = getStructureQualityUnits(state, regionId, "library");
  const archive = getDetailedStructureDef(state, "archive");
  const retired = (state.civilization.retiredVassals ?? []).filter((entry) => entry.retirementRegionId === regionId)
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.finalIntelligence) || 0), 0);
  return Math.max(0, 1 + units * (library?.knowledgeResearchMultiplierPerLevel ?? 0)
    + retired * (archive?.researchPerRetiredIntelligence ?? 0) * getStructureQualityUnits(state, regionId, "archive"));
}

function executePracticeEffects(state, site, assignment, activationType, stage = null, { force = false } = {}) {
  const settlement = site.detailedState;
  const slot = settlement.practiceSlots[assignment.slotIndex];
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  if (!def || (!force && !practiceMatchesActivation(state, def, activationType, stage))) return false;
  if ((def.activation.type === "season" || def.activation.type === "food")
      && getRegionState(state, site.regionId)?.controller !== "player"
      && (def.effects ?? []).some((effect) =>
        effect.op === "addLocalFood" || effect.op === "addLocalCurrency" || effect.op === "routeLocalFood")) return false;

  for (const effect of def.effects ?? []) {
    if (effect.op === "addLocalFood") {
      const resolved = resolveScaledValue(state, site, assignment, effect.scaledValue);
      const otherFoodPieces = getLocalTaggedPieceCount(state, site.regionId, "Food", { excludeStructureId: "agrarianGuild" });
      const guild = getDetailedStructureDef(state, "agrarianGuild");
      const guildUnits = getStructureQualityUnits(state, site.regionId, "agrarianGuild");
      addFoodToSettlement(
        state,
        site.regionId,
        resolved.effectiveValue * (1 + Math.max(0, otherFoodPieces - 1) * (guild?.foodOutputBonusPerOtherFoodPiece ?? 0) * guildUnits)
      );
    } else if (effect.op === "addLocalCurrency") {
      const resolved = resolveScaledValue(state, site, assignment, effect.scaledValue);
      addCurrencyToSettlement(state, site.regionId, resolved.effectiveValue);
    } else if (effect.op === "importMissingFood") {
      importMissingFood(state, site.regionId);
    } else if (effect.op === "advanceWork") {
      slot.work = roundFood((slot.work ?? 0)
        + resolveScaledValue(state, site, assignment, effect.scaledValue).effectiveValue);
    } else if (effect.op === "createLocalStructureAtWork") {
      if ((slot.work ?? 0) < effect.requiredWork) continue;
      if (!tryCreateStructure(state, site.regionId, effect.structureDefId)) continue;
      markCompletedBuildInterventionResolved(state, site.regionId, slot.practiceId);
      if (effect.repeat === true) slot.work = roundFood((slot.work ?? 0) - effect.requiredWork);
      else { settlement.practiceSlots[assignment.slotIndex] = null; compactPracticeSlots(settlement); break; }
    } else if (effect.op === "addCivilizationResearch") {
      const amount = resolveScaledValue(state, site, assignment, effect.scaledValue).effectiveValue
        * getResearchStructureBonus(state, site.regionId, slot.practiceId);
      state.civilization.research = state.civilization.research ?? { total: 0 };
      state.civilization.research.total = roundFood((state.civilization.research.total ?? 0) + amount);
    } else if (effect.op === "reduceLocalFoodRequirement") {
      getPhaseModifiers(state).foodByRegion[site.regionId] = roundFood((getPhaseModifiers(state).foodByRegion[site.regionId] ?? 0) + resolveScaledValue(state, site, assignment, effect.scaledValue).effectiveValue);
    } else if (effect.op === "addHousingForPhase") {
      getPhaseModifiers(state).housingByRegion[site.regionId] = roundFood((getPhaseModifiers(state).housingByRegion[site.regionId] ?? 0) + resolveScaledValue(state, site, assignment, effect.scaledValue).effectiveValue);
    } else if (effect.op === "spendCurrencyForHousing") {
      const cap = resolveScaledValue(state, site, assignment, effect.scaledValue).effectiveValue;
      const amount = Math.min(cap, Math.floor(Math.max(0, settlement.currency ?? 0) / Math.max(0.0001, effect.currencyPerHousing ?? 1)));
      settlement.currency = roundFood(Math.max(0, settlement.currency - amount * (effect.currencyPerHousing ?? 1)));
      recordCurrencySpent(state, site.regionId, amount * (effect.currencyPerHousing ?? 1));
      getPhaseModifiers(state).housingByRegion[site.regionId] = roundFood((getPhaseModifiers(state).housingByRegion[site.regionId] ?? 0) + amount);
    } else if (effect.op === "extendHappinessFloor") {
      settlement.happinessFloor = { status: effect.status, remainingResolutions: Math.min(effect.maximumResolutions, (settlement.happinessFloor?.remainingResolutions ?? 0) + effect.durationResolutions) };
    } else if (effect.op === "addFaithChaosResistance") {
      getPhaseModifiers(state).faithResistance = roundFood((getPhaseModifiers(state).faithResistance ?? 0) + resolveScaledValue(state, site, assignment, effect.scaledValue).effectiveValue);
    }
  }
  return true;
}

export function runPracticeActivation(state, activationType, stage = null) {
  const events = [];
  for (const site of getDetailedSettlementSites(state)) {
    const assignments = assignDetailedSettlementWorkers(state, site.regionId);
    for (const assignment of assignments) {
      if (executePracticeEffects(state, site, assignment, activationType, stage)) {
        events.push({ rootEventId: `${state.tSec}:${site.regionId}:${assignment.slotIndex}:${activationType}:${stage ?? ""}`, sourceRegionId: site.regionId, sourceSlotIndex: assignment.slotIndex });
      }
    }
  }
  resolvePracticeActivatedEvents(state, events);
}

function triggerMatches(def, sourceTags) {
  const trigger = def?.activation?.trigger;
  if (trigger?.event !== "practiceActivated") return false;
  if (Array.isArray(trigger.sourceTagsAny) && !trigger.sourceTagsAny.some((tag) => sourceTags.includes(tag))) return false;
  if (Array.isArray(trigger.sourceMissingTagsAll) && trigger.sourceMissingTagsAll.some((tag) => sourceTags.includes(tag))) return false;
  return true;
}

function resolvePracticeActivatedEvents(state, initialEvents) {
  const queue = [...initialEvents];
  const reacted = new Set();
  const cap = Math.max(20, Math.floor(getGameSetting(state, "practiceReactionResolutionCap") || 200));
  let processed = 0;
  while (queue.length && processed < cap) {
    const event = queue.shift(); processed += 1;
    const source = getDetailedSettlement(state, event.sourceRegionId)?.practiceSlots?.[event.sourceSlotIndex];
    if (!source) continue;
    const sourceTags = getPracticeTags(state, source.practiceId);
    const site = getDetailedSettlementSite(state, event.sourceRegionId);
    for (const assignment of assignDetailedSettlementWorkers(state, event.sourceRegionId)) {
      const slot = site?.detailedState?.practiceSlots?.[assignment.slotIndex];
      const def = getDetailedPracticeDef(state, slot?.practiceId);
      if (!slot || !def || def.activation?.type !== "trigger" || assignment.slotIndex === event.sourceSlotIndex || !triggerMatches(def, sourceTags)) continue;
      const key = `${event.rootEventId}:${event.sourceRegionId}:${event.sourceSlotIndex}:${assignment.slotIndex}`;
      if (reacted.has(key)) continue;
      reacted.add(key);
      slot.charge = roundFood((slot.charge ?? 0) + 1);
      addPracticeTrace(site, { tSec: state.tSec, rootEventId: event.rootEventId, kind: "charged", sourcePracticeId: source.practiceId, targetPracticeId: slot.practiceId, charge: slot.charge });
      const threshold = getPracticeChargeThreshold(def, slot.tier);
      while (slot.charge >= threshold && processed < cap) {
        slot.charge = roundFood(slot.charge - threshold);
        if (executePracticeEffects(state, site, assignment, "trigger", null, { force: true })) {
          addPracticeTrace(site, { tSec: state.tSec, rootEventId: event.rootEventId, kind: "activated", sourcePracticeId: source.practiceId, targetPracticeId: slot.practiceId, charge: slot.charge });
          queue.push({ rootEventId: event.rootEventId, sourceRegionId: event.sourceRegionId, sourceSlotIndex: assignment.slotIndex });
        }
      }
    }
  }
  if (queue.length) {
    state.civilization.lastPracticeReactionDiagnostic = { tSec: state.tSec, kind: "reactionCapReached", cap, remaining: queue.length };
  }
}

export function getPreserveReduction(state, site) {
  return site.detailedState.structureSlots.reduce((sum, slot) => {
    const def = slot && getDetailedStructureDef(state, slot.structureId);
    return sum + (def?.effects ?? []).reduce((total, effect) => total + (effect.op === 'reduceFoodDecay' && effect.foodKind === 'stored'
      ? effect.amount * getQualityMultiplier(slot.tier, def.qualityMultiplierPerLevel) : 0), 0);
  }, 0);
}

function buildFoodSnapshot(state) {
  return Object.fromEntries(getDetailedSettlementSites(state).map((site) => {
    const summary = getPopulationSummary(state, site.regionId);
    return [site.regionId, {
      stored: roundFood(site.detailedState.storedFood),
      loose: roundFood(site.detailedState.looseFood),
      capacity: getStoredFoodCapacity(state, site.regionId),
      demand: summary.mealDemand,
    }];
  }));
}

export function planDetailedAdministrationMoves(state) {
  const snapshot = buildFoodSnapshot(state);
  const sourceAvailable = clone(snapshot);
  const destinationProjected = clone(snapshot);
  const moves = [];
  const worldOrder = getWorldRegionOrder(state);
  const compareByAmountThenWorldOrder = (amountFor) => (left, right) =>
    amountFor(right) - amountFor(left)
      || (worldOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (worldOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      || (String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0);
  const shortage = (entry) => roundFood(Math.max(
    0,
    (entry?.demand ?? 0) - (entry?.loose ?? 0) - (entry?.stored ?? 0)
  ));
  const surplus = (entry) => roundFood(Math.max(
    0,
    (entry?.loose ?? 0) + (entry?.stored ?? 0) - (entry?.demand ?? 0)
  ));
  const reserveMove = (sourceId, destinationId, amount) => {
    const source = sourceAvailable[sourceId];
    const destination = destinationProjected[destinationId];
    const safeAmount = roundFood(Math.max(0, amount));
    if (!source || !destination || safeAmount <= 0) return 0;
    const looseAmount = Math.min(source.loose, safeAmount);
    source.loose = roundFood(source.loose - looseAmount);
    source.stored = roundFood(source.stored - (safeAmount - looseAmount));
    const room = Math.max(0, destination.capacity - destination.stored);
    const storedAmount = Math.min(room, safeAmount);
    destination.stored = roundFood(destination.stored + storedAmount);
    destination.loose = roundFood(destination.loose + safeAmount - storedAmount);
    moves.push({ sourceId, destinationId, amount: safeAmount, looseAmount });
    return safeAmount;
  };

  for (const site of getDetailedSettlementSites(state)) {
    if (getRegionState(state, site.regionId)?.controller !== "player") continue;
    const assignments = assignDetailedSettlementWorkers(state, site.regionId);
    for (const assignment of assignments.filter(
      (entry) => entry.practiceId === "administrate"
    )) {
      const def = getDetailedPracticeDef(state, assignment.practiceId);
      const effect = (def?.effects ?? []).find((entry) => entry?.op === "routeLocalFood");
      if (!effect) continue;
      let remainingCapacity = resolveScaledValue(
        state,
        site,
        assignment,
        effect.scaledValue
      ).effectiveValue;
      const targets = resolveDetailedRegionScope(state, site.regionId, effect.targetScope)
        .filter((id) => snapshot[id]);
      const hostShortage = shortage(destinationProjected[site.regionId]);
      if (hostShortage > 0) {
        const sources = targets
          .filter((id) => surplus(sourceAvailable[id]) > 0)
          .sort(compareByAmountThenWorldOrder((id) => surplus(sourceAvailable[id])));
        for (const sourceId of sources) {
          if (remainingCapacity <= 0) break;
          const amount = Math.min(
            remainingCapacity,
            shortage(destinationProjected[site.regionId]),
            surplus(sourceAvailable[sourceId])
          );
          remainingCapacity = roundFood(
            remainingCapacity - reserveMove(sourceId, site.regionId, amount)
          );
        }
      } else {
        const destinations = targets
          .filter((id) => shortage(destinationProjected[id]) > 0)
          .sort(compareByAmountThenWorldOrder((id) => shortage(destinationProjected[id])));
        for (const destinationId of destinations) {
          if (remainingCapacity <= 0) break;
          const amount = Math.min(
            remainingCapacity,
            surplus(sourceAvailable[site.regionId]),
            shortage(destinationProjected[destinationId])
          );
          remainingCapacity = roundFood(
            remainingCapacity - reserveMove(site.regionId, destinationId, amount)
          );
        }
      }
    }
  }
  return moves;
}

export function planDetailedAdministrationMovesAtBoundary(
  preBoundaryState,
  boundarySec
) {
  const planningState = deserializeGameState(
    serializeGameState(preBoundaryState)
  );
  const sec = Math.max(0, Math.floor(boundarySec ?? 0));
  const seasonDurationSec = Math.max(
    1,
    Math.floor(planningState?.seasonDurationSec ?? 1)
  );
  // Seasonal production resolves before new-moon Administration when both
  // stages share a second. Mirror that order without running the later
  // transfer, decay, meal, demographic, or RNG-consuming stages.
  if (sec > 0 && sec % seasonDurationSec === 0) {
    const seasons = Array.isArray(planningState.seasons) ? planningState.seasons : [];
    if (seasons.length > 0) {
      const nextSeasonIndex = ((planningState.currentSeasonIndex ?? 0) + 1) % seasons.length;
      planningState.currentSeasonIndex = nextSeasonIndex;
      if (nextSeasonIndex === 0) planningState.year = Math.max(1, planningState.year + 1);
    }
    runPracticeActivation(planningState, "season");
  }
  runPracticeActivation(planningState, "food", "preRouting");
  return planDetailedAdministrationMoves(planningState);
}

export function applyAdministrationMoves(state, moves) {
  // Remove every packet from its activation-start source before any
  // destination receives food. This preserves simultaneous resolution even
  // when two sites send packets in opposite directions.
  for (const move of moves) {
    const source = getDetailedSettlement(state, move.sourceId);
    if (!source) continue;
    const looseRemoved = Math.min(source.looseFood, move.looseAmount);
    source.looseFood = roundFood(source.looseFood - looseRemoved);
    source.storedFood = roundFood(source.storedFood - (move.amount - looseRemoved));
  }
  for (const move of moves) {
    const destination = getDetailedSettlement(state, move.destinationId);
    if (!destination) continue;
    addFoodToSettlement(state, move.destinationId, move.amount);
  }
}
