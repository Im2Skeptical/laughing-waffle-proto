import { envSystemDefs } from "../../../../defs/gamesystems/env-systems-defs.js";
import { pawnSystemDefs } from "../../../../defs/gamesystems/pawn-systems-defs.js";
import { hubSystemDefs } from "../../../../defs/gamesystems/hub-system-defs.js";
import { itemSystemDefs } from "../../../../defs/gamesystems/item-system-defs.js";
import { resolveAmount } from "../../core/amount.js";
import { clamp } from "../../core/clamp.js";
import { cloneSerializable } from "../../core/clone.js";
import { resolveEffectDef } from "../../core/registry.js";
import { ensureSystemState } from "../../core/system-state.js";
import { resolveEffectTargets } from "./targets.js";
import { getSettlementChaosGodState } from "../../../settlement-chaos.js";
import {
  addSettlementFloodplainFood,
  consumeSettlementFood,
  getHubCore,
  removeSettlementFloodplainFood,
} from "../../../settlement-state.js";

export function handleAddToSystemState(state, effect, context) {
  const systemId = effect.system;
  const key = effect.key;
  if (!systemId || typeof systemId !== "string") return false;
  if (!key || typeof key !== "string") return false;

  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  let changed = false;
  for (const target of targets) {
    if (!target) continue;
    const systemState = ensureSystemState(target, systemId);
    const { def } = resolveEffectDef(effect, target, context);
    const amount = resolveAmount(effect, systemState, def, context);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const current = Number.isFinite(systemState[key]) ? systemState[key] : 0;
    const next = current + amount;
    if (next !== current) {
      systemState[key] = next;
      changed = true;
    }
  }

  return changed;
}

export function handleClampSystemState(state, effect, context) {
  const systemId = effect.system;
  const key = effect.key;
  if (!systemId || typeof systemId !== "string") return false;
  if (!key || typeof key !== "string") return false;

  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  let changed = false;
  for (const target of targets) {
    if (!target) continue;
    const systemState = ensureSystemState(target, systemId);
    const value = Number.isFinite(systemState[key]) ? systemState[key] : 0;
    const minRaw = Number.isFinite(effect.min)
      ? effect.min
      : effect.minKey
        ? systemState[effect.minKey]
        : null;
    const maxRaw = Number.isFinite(effect.max)
      ? effect.max
      : effect.maxKey
        ? systemState[effect.maxKey]
        : null;
    const min = Number.isFinite(minRaw) ? minRaw : -Infinity;
    const max = Number.isFinite(maxRaw) ? maxRaw : Infinity;
    const next = clamp(value, min, max);
    if (next !== value) {
      systemState[key] = next;
      changed = true;
    }
  }

  return changed;
}

export function handleAccumulateRatio(state, effect, context) {
  const systemId = effect.system;
  const numeratorKey = effect.numeratorKey;
  const denominatorKey = effect.denominatorKey;
  const targetKey = effect.targetKey || "sumRatio";
  if (!systemId || typeof systemId !== "string") return false;
  if (!numeratorKey || typeof numeratorKey !== "string") return false;
  if (!denominatorKey || typeof denominatorKey !== "string") return false;

  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  let changed = false;
  for (const target of targets) {
    if (!target) continue;
    const systemState = ensureSystemState(target, systemId);
    const numerator = Number.isFinite(systemState[numeratorKey])
      ? systemState[numeratorKey]
      : 0;
    const denominator = Number.isFinite(systemState[denominatorKey])
      ? systemState[denominatorKey]
      : 0;
    let ratio = denominator > 0 ? numerator / denominator : 0;
    if (Number.isFinite(effect.min)) ratio = Math.max(effect.min, ratio);
    if (Number.isFinite(effect.max)) ratio = Math.min(effect.max, ratio);
    const current = Number.isFinite(systemState[targetKey])
      ? systemState[targetKey]
      : 0;
    systemState[targetKey] = current + ratio;
    changed = true;
  }

  return changed;
}

export function handleResetSystemState(state, effect, context) {
  const systemId = effect.system;
  if (!systemId || typeof systemId !== "string") return false;

  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  const defaults =
    envSystemDefs[systemId]?.stateDefaults ??
    pawnSystemDefs[systemId]?.stateDefaults ??
    hubSystemDefs[systemId]?.stateDefaults ??
    itemSystemDefs[systemId]?.stateDefaults ??
    {};
  let changed = false;
  for (const target of targets) {
    if (!target) continue;
    if (!target.systemState || typeof target.systemState !== "object") {
      target.systemState = {};
    }
    target.systemState[systemId] = cloneSerializable(defaults);
    changed = true;
  }

  return changed;
}

export function handleAdjustSystemState(state, effect, context) {
  const systemId = effect.system;
  const key = effect.key;
  if (!systemId || typeof systemId !== "string") return false;
  if (!key || typeof key !== "string") return false;

  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  let changed = false;
  for (const target of targets) {
    if (!target) continue;
    const systemState = ensureSystemState(target, systemId);
    const { def } = resolveEffectDef(effect, target, context);
    const deltaRaw = resolveAmount(effect, systemState, def, context);
    const delta = Number.isFinite(deltaRaw) ? deltaRaw : 0;
    let percent = null;
    if (Number.isFinite(effect.percent)) percent = effect.percent;
    if (percent == null && effect.percentFromKey) {
      percent = systemState[effect.percentFromKey];
    }
    if (percent == null && effect.percentFromDefKey && def) {
      percent = def[effect.percentFromDefKey];
    }
    if (percent == null && effect.percentVar && context?.vars) {
      percent = context.vars[effect.percentVar];
    }
    if (!Number.isFinite(percent)) percent = 0;

    const current = Number.isFinite(systemState[key]) ? systemState[key] : 0;
    const nextRaw = current + delta + current * percent;
    const minRaw = Number.isFinite(effect.min)
      ? effect.min
      : effect.minKey
        ? systemState[effect.minKey]
        : null;
    const maxRaw = Number.isFinite(effect.max)
      ? effect.max
      : effect.maxKey
        ? systemState[effect.maxKey]
        : null;
    const min = Number.isFinite(minRaw) ? minRaw : -Infinity;
    const max = Number.isFinite(maxRaw) ? maxRaw : Infinity;
    const next = clamp(nextRaw, min, max);

    if (next !== current) {
      systemState[key] = next;
      changed = true;
    }
  }

  return changed;
}

export function handleAdjustSettlementTileStore(state, effect, context) {
  const tileDefId = typeof effect?.tileDefId === "string" ? effect.tileDefId : null;
  const key = typeof effect?.key === "string" ? effect.key : null;
  if (tileDefId !== "tile_floodplains" || key !== "food") return false;

  const deltaRaw = resolveAmount(effect, null, null, context);
  const delta = Number.isFinite(deltaRaw) ? Math.floor(deltaRaw) : 0;
  if (delta === 0) return false;

  if (delta > 0) {
    return addSettlementFloodplainFood(state, delta) > 0;
  }
  return removeSettlementFloodplainFood(state, Math.abs(delta)) > 0;
}

export function handleAdjustSettlementFood(state, effect, context) {
  const deltaRaw = resolveAmount(effect, null, null, context);
  const delta = Number.isFinite(deltaRaw) ? Number(deltaRaw) : 0;
  if (delta === 0) return false;

  if (delta < 0) {
    return consumeSettlementFood(state, Math.abs(delta)) > 0;
  }

  const stockpiles = getHubCore(state)?.systemState?.stockpiles ?? null;
  if (!stockpiles || typeof stockpiles !== "object") return false;
  const current = Number.isFinite(stockpiles.food) ? Number(stockpiles.food) : 0;
  stockpiles.food = current + delta;
  return true;
}

export function handleAdjustSettlementChaosGodState(state, effect, context) {
  const godId = typeof effect?.godId === "string" ? effect.godId : null;
  const key = typeof effect?.key === "string" ? effect.key : null;
  if (!godId || !key) return false;

  const targets = resolveEffectTargets(state, effect, context);
  if (!targets.length) return false;

  let changed = false;
  for (const target of targets) {
    if (target?.kind !== "hubCore") continue;
    const godState = getSettlementChaosGodState(state, godId);
    if (!godState || !Object.prototype.hasOwnProperty.call(godState, key)) continue;
    const { def } = resolveEffectDef(effect, target, context);
    const deltaRaw = resolveAmount(effect, godState, def, context);
    const delta = Number.isFinite(deltaRaw) ? deltaRaw : 0;
    const current = Number.isFinite(godState[key]) ? godState[key] : 0;
    const nextRaw = current + delta;
    const min = Number.isFinite(effect.min) ? effect.min : -Infinity;
    const max = Number.isFinite(effect.max) ? effect.max : Infinity;
    const next = clamp(nextRaw, min, max);
    if (next === current) continue;
    godState[key] = next;
    changed = true;
  }

  return changed;
}
