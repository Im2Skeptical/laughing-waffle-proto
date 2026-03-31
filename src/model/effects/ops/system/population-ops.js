import { cloneSerializable } from "../../core/clone.js";
import { resolveAmount } from "../../core/amount.js";
import { resolveEffectDef } from "../../core/registry.js";
import { ensureSystemState } from "../../core/system-state.js";
import { resolveEffectTargets } from "./targets.js";
import {
  getSettlementClassIds,
  getSettlementPopulationClassState,
  getSettlementPopulationSummary,
} from "../../../settlement-state.js";

function resolveReleaseSec(effect, context) {
  if (Number.isFinite(effect.releaseSec)) {
    return Math.max(0, Math.floor(effect.releaseSec));
  }
  if (effect.releaseSecVar && Number.isFinite(context?.vars?.[effect.releaseSecVar])) {
    return Math.max(0, Math.floor(context.vars[effect.releaseSecVar]));
  }

  const baseSec = Number.isFinite(context?.tSec) ? Math.floor(context.tSec) : 0;
  if (Number.isFinite(effect.releaseOffsetSec)) {
    return Math.max(0, baseSec + Math.floor(effect.releaseOffsetSec));
  }
  if (
    effect.releaseOffsetSecVar &&
    Number.isFinite(context?.vars?.[effect.releaseOffsetSecVar])
  ) {
    return Math.max(0, baseSec + Math.floor(context.vars[effect.releaseOffsetSecVar]));
  }
  return null;
}

function getNextCommitmentId(state) {
  const nextId = Number.isFinite(state?.nextPopulationCommitmentId)
    ? Math.max(1, Math.floor(state.nextPopulationCommitmentId))
    : 1;
  if (state && typeof state === "object") {
    state.nextPopulationCommitmentId = nextId + 1;
  }
  return nextId;
}

function resolveTargetClassId(effect, context) {
  const classId =
    (typeof effect.populationClassId === "string" && effect.populationClassId) ||
    (typeof effect.targetPopulationClassId === "string" && effect.targetPopulationClassId) ||
    (typeof context?.populationClassId === "string" && context.populationClassId) ||
    (typeof context?.targetPopulationClassId === "string" && context.targetPopulationClassId) ||
    null;
  return classId;
}

function getTargetClassState(target, state, classId) {
  if (
    target?.kind === "hubCore" &&
    target?.systemState?.populationClasses &&
    typeof target.systemState.populationClasses === "object"
  ) {
    return getSettlementPopulationClassState(state, classId);
  }
  return ensureSystemState(target, "population");
}

function getFreePopulationByClass(state) {
  const summary = getSettlementPopulationSummary(state);
  const out = {};
  for (const classId of getSettlementClassIds(state)) {
    out[classId] = Math.max(0, Math.floor(summary?.byClass?.[classId]?.free ?? 0));
  }
  return out;
}

function splitAmountByDemographic(state, amount) {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const classIds = getSettlementClassIds(state);
  const freeByClass = getFreePopulationByClass(state);
  const totalFree = classIds.reduce((sum, classId) => sum + (freeByClass[classId] ?? 0), 0);
  const allocations = {};
  for (const classId of classIds) allocations[classId] = 0;
  if (safeAmount <= 0 || totalFree <= 0) return allocations;

  let allocated = 0;
  for (const classId of classIds) {
    const free = Math.max(0, Math.floor(freeByClass[classId] ?? 0));
    if (free <= 0) continue;
    const share = Math.min(free, Math.floor((safeAmount * free) / totalFree));
    allocations[classId] = share;
    allocated += share;
  }

  let remaining = Math.max(0, safeAmount - allocated);
  while (remaining > 0) {
    let claimed = false;
    for (const classId of classIds) {
      const free = Math.max(0, Math.floor(freeByClass[classId] ?? 0));
      if (free <= allocations[classId]) continue;
      allocations[classId] += 1;
      remaining -= 1;
      claimed = true;
      if (remaining <= 0) break;
    }
    if (!claimed) break;
  }
  return allocations;
}

function buildCommitmentBase(state, effect, context, amount, releaseSec) {
  const startSec = Number.isFinite(context?.tSec) ? Math.max(0, Math.floor(context.tSec)) : 0;
  return {
    id: getNextCommitmentId(state),
    amount,
    startSec,
    releaseSec,
    sourceId:
      typeof context?.practiceSourceId === "string"
        ? context.practiceSourceId
        : typeof effect.sourceId === "string"
          ? effect.sourceId
          : typeof context?.practiceDef?.id === "string"
            ? context.practiceDef.id
            : typeof context?.structureDef?.id === "string"
              ? context.structureDef.id
              : null,
    label:
      typeof context?.practiceSourceLabel === "string"
        ? context.practiceSourceLabel
        : typeof effect.label === "string"
          ? effect.label
          : typeof context?.practiceDef?.name === "string"
            ? context.practiceDef.name
            : typeof context?.structureDef?.name === "string"
              ? context.structureDef.name
              : null,
    vars:
      context?.vars && typeof context.vars === "object" && !Array.isArray(context.vars)
        ? cloneSerializable(context.vars)
        : {},
    onReleaseEffects:
      Array.isArray(effect.onReleaseEffects) || effect.onReleaseEffects
        ? cloneSerializable(effect.onReleaseEffects)
        : null,
  };
}

export function handleReservePopulation(state, effect, context) {
  const systemId = typeof effect.system === "string" ? effect.system : "population";
  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  let changed = false;
  for (const target of targets) {
    if (!target) continue;
    const { def } = resolveEffectDef(effect, target, context);
    const targetClassId = resolveTargetClassId(effect, context);
    const amountRaw = resolveAmount(
      effect,
      getTargetClassState(target, state, targetClassId) || {},
      def,
      context
    );
    const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.floor(amountRaw)) : 0;
    if (amount <= 0) continue;
    const releaseSec = resolveReleaseSec(effect, context);
    if (!Number.isFinite(releaseSec)) continue;

    const baseCommitment = buildCommitmentBase(state, effect, context, amount, releaseSec);
    if (effect.allocationMode === "demographic" && target?.kind === "hubCore") {
      const allocations = splitAmountByDemographic(state, amount);
      for (const classId of getSettlementClassIds(state)) {
        const classAmount = Math.max(0, Math.floor(allocations[classId] ?? 0));
        if (classAmount <= 0) continue;
        const classState = getSettlementPopulationClassState(state, classId);
        if (!classState) continue;
        if (!Array.isArray(classState.commitments)) {
          classState.commitments = [];
        }
        classState.commitments.push({
          ...baseCommitment,
          amount: classAmount,
          vars: {
            ...(baseCommitment.vars || {}),
            practiceAmount: classAmount,
          },
        });
        changed = true;
      }
      continue;
    }

    const systemState = getTargetClassState(target, state, targetClassId);
    if (!systemState) continue;
    if (!Array.isArray(systemState.commitments)) {
      systemState.commitments = [];
    }
    systemState.commitments.push(baseCommitment);
    changed = true;
  }

  return changed;
}

function resolveTransferClassId(effectValue, contextValue, fallback = null) {
  if (typeof effectValue === "string" && effectValue.length > 0) return effectValue;
  if (typeof contextValue === "string" && contextValue.length > 0) return contextValue;
  return fallback;
}

export function handleTransferPopulationClass(state, effect, context) {
  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  let changed = false;
  for (const target of targets) {
    if (!target?.systemState?.populationClasses) continue;
    const fromClassId = resolveTransferClassId(
      effect.fromPopulationClassId,
      context?.fromPopulationClassId,
      context?.populationClassId
    );
    const toClassId = resolveTransferClassId(
      effect.toPopulationClassId,
      context?.toPopulationClassId,
      null
    );
    if (!fromClassId || !toClassId || fromClassId === toClassId) continue;
    const fromClassState = getSettlementPopulationClassState(state, fromClassId);
    const toClassState = getSettlementPopulationClassState(state, toClassId);
    if (!fromClassState || !toClassState) continue;

    const { def } = resolveEffectDef(effect, target, context);
    const amountRaw = resolveAmount(effect, fromClassState, def, context);
    const requested = Number.isFinite(amountRaw) ? Math.max(0, Math.floor(amountRaw)) : 0;
    const available = Number.isFinite(fromClassState.total)
      ? Math.max(0, Math.floor(fromClassState.total))
      : 0;
    const amount = Math.min(requested, available);
    if (amount <= 0) continue;

    fromClassState.total = Math.max(0, available - amount);
    toClassState.total = Math.max(
      0,
      Math.floor(toClassState.total ?? 0) + amount
    );
    changed = true;
  }

  return changed;
}
