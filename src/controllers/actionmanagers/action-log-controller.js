// src/controllers/actionmanagers/action-log-controller.js
// View-model helpers for action log rows and navigation.

import { hubStructureDefs }  from "../../defs/gamepieces/hub-structure-defs.js";
const itemDefs = Object.freeze({});
import { envTileDefs } from "../../defs/gamepieces/env-tiles-defs.js";
import { cropDefs } from "../../defs/gamepieces/crops-defs.js";
import { recipeDefs } from "../../defs/gamepieces/recipes-defs.js";
import { envTagDefs } from "../../defs/gamesystems/env-tags-defs.js";
import { hubTagDefs } from "../../defs/gamesystems/hub-tag-defs.js";
import { ActionKinds } from "../../model/actions.js";
import {
  buildRecipePriorityFromSelectedRecipe,
  buildRecipePrioritySignature,
  getEnabledRecipeIds,
  getRecipeKindForHubSystem,
  getTopEnabledRecipeId,
  normalizeRecipePriority,
} from "../../model/recipe-priority.js";
import { getItemQuantity } from "./action-currency-utils.js";
import {
  describePlannerAction,
  describePlannerIntent,
  getCurrencyGroupInfoForAction,
  getCurrencyGroupInfoForIntent,
  getPlannerActionApCost,
  getPlannerIntentId,
  getPlannerIntentPlanSignature,
  isHubPlanAction as registryIsHubPlanAction,
  isHubPlanIntent as registryIsHubPlanIntent,
  isTilePlanAction as registryIsTilePlanAction,
  isTilePlanIntent as registryIsTilePlanIntent,
  shouldLogPlannerAction,
  shouldLogPlannerIntent,
} from "./action-plan-registry.js";

function formatItemNameFromKind(kind) {
  if (kind && itemDefs[kind]) return itemDefs[kind].name || kind;
  return kind || "";
}

function formatCropName(cropId) {
  if (!cropId) return "None";
  return cropDefs[cropId]?.name || cropDefs[cropId]?.cropId || cropId;
}

function formatRecipeName(recipeId) {
  if (!recipeId) return "None";
  return recipeDefs[recipeId]?.name || recipeDefs[recipeId]?.id || recipeId;
}

function normalizeRecipePriorityForLog(systemId, value, fallbackRecipeId = null) {
  if (value && typeof value === "object") {
    return normalizeRecipePriority(value, {
      systemId,
      state: null,
      includeLocked: true,
    });
  }
  return buildRecipePriorityFromSelectedRecipe(fallbackRecipeId, {
    systemId,
    state: null,
    includeLocked: true,
  });
}

function formatRecipePriorityLabel(systemId, recipePriority) {
  const enabled = getEnabledRecipeIds(recipePriority);
  const topRecipeId = getTopEnabledRecipeId(recipePriority);
  const topLabel = formatRecipeName(topRecipeId);
  if (enabled.length <= 0) {
    const kind = getRecipeKindForHubSystem(systemId);
    return kind === "cook" ? "0 enabled (Cooking paused)" : "0 enabled (Crafting paused)";
  }
  return `${enabled.length} enabled (Top: ${topLabel})`;
}

function formatCropPriorityLabel(recipePriority) {
  const enabled = getEnabledRecipeIds(recipePriority);
  const topCropId = getTopEnabledRecipeId(recipePriority);
  const topLabel = formatCropName(topCropId);
  if (enabled.length <= 0) {
    return "0 enabled (Planting paused)";
  }
  return `${enabled.length} enabled (Top: ${topLabel})`;
}

function formatEnvTagName(tagId) {
  if (!tagId) return "Tag";
  return envTagDefs[tagId]?.ui?.name || tagId;
}

function formatHubTagName(tagId) {
  if (!tagId) return "Tag";
  return hubTagDefs[tagId]?.ui?.name || tagId;
}

function formatOwnerName(ownerId, getOwnerLabel) {
  if (typeof getOwnerLabel === "function") return getOwnerLabel(ownerId);
  return `Owner ${ownerId}`;
}

function formatPawnName(pawnId, state) {
  const pawn = state?.pawns?.find((candidatePawn) => candidatePawn.id === pawnId);
  return pawn?.name || `Pawn ${pawnId}`;
}

function formatHubName(hubCol, state) {
  const slots = state?.hub?.slots || [];
  const slot = slots[hubCol];
  const structure = slot?.structure;
  if (structure) {
    const def = hubStructureDefs[structure.defId];
    return def?.name || def?.id || `Hub ${hubCol}`;
  }
  return `Hub ${hubCol}`;
}

function formatTileName(envCol, state) {
  const col = Math.floor(envCol);
  const tile = state?.board?.occ?.tile?.[col];
  const def = tile ? envTileDefs[tile.defId] : null;
  return def?.name || tile?.defId || `Tile ${col}`;
}

function isTilePlanIntent(intent) {
  return registryIsTilePlanIntent(intent);
}

function isHubPlanIntent(intent) {
  return registryIsHubPlanIntent(intent);
}

function isTilePlanAction(action) {
  return registryIsTilePlanAction(action);
}

function isHubPlanAction(action) {
  return registryIsHubPlanAction(action);
}

function formatSkillNodeName(nodeId) {
  if (!nodeId) return "Skill";
  return nodeId;
}

function formatTilePlanLabel(envCol, state) {
  const tileName = formatTileName(envCol, state);
  return `Tags > ${tileName} changed`;
}

function formatHubPlanLabel(hubCol, state) {
  const hubName = formatHubName(hubCol, state);
  return `Tags > ${hubName} changed`;
}

function getTilePlanIntentSignature(intent) {
  return getPlannerIntentPlanSignature(intent, createActionLogDescribeContext(null, null));
}

function getHubPlanIntentSignature(intent) {
  return getPlannerIntentPlanSignature(intent, createActionLogDescribeContext(null, null));
}

function formatPlacementName(placement, state) {
  if (!placement) return "Location";
  if (Number.isFinite(placement.envCol)) {
    return formatTileName(placement.envCol, state);
  }
  if (Number.isFinite(placement.hubCol)) {
    return formatHubName(placement.hubCol, state);
  }
  return "Location";
}

function resolvePlacementFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.toPlacement) return payload.toPlacement;
  if (Number.isFinite(payload.toEnvCol) || Number.isFinite(payload.envCol)) {
    return {
      envCol: Number.isFinite(payload.toEnvCol)
        ? payload.toEnvCol
        : payload.envCol,
    };
  }
  if (Number.isFinite(payload.toHubCol) || Number.isFinite(payload.hubCol)) {
    return {
      hubCol: Number.isFinite(payload.toHubCol)
        ? payload.toHubCol
        : payload.hubCol,
    };
  }
  return null;
}

function createActionLogDescribeContext(state, getOwnerLabel) {
  return {
    state,
    getOwnerLabel,
    buildRecipePrioritySignature,
    formatBuildCancelDefName(defId) {
      if (!defId) return "Structure";
      return hubStructureDefs[defId]?.name || defId;
    },
    formatCropPriorityLabel,
    formatEnvTagName,
    formatHubName,
    formatHubTagName,
    formatItemNameFromKind,
    formatOwnerName,
    formatPawnName,
    formatPlacementName,
    formatRecipePriorityLabel,
    formatSkillNodeName,
    formatTileName,
    normalizeRecipePriorityForLog,
    resolvePlacementFromPayload,
  };
}

function describeIntent(intent, state, getOwnerLabel) {
  return describePlannerIntent(
    intent,
    createActionLogDescribeContext(state, getOwnerLabel)
  );
}

function formatCurrencyGroupDescription(group, getOwnerLabel) {
  if (!group) return "";
  const itemName = formatItemNameFromKind(group.kind) || "Item";
  if (group.net) {
    const qty = Math.abs(group.net);
    const toOwnerId = group.net > 0 ? group.maxId : group.minId;
    const dest = formatOwnerName(toOwnerId, getOwnerLabel);
    return `${qty} ${itemName} > ${dest}`;
  }
  const ownerA = formatOwnerName(group.minId, getOwnerLabel);
  const ownerB = formatOwnerName(group.maxId, getOwnerLabel);
  return `Shuffled ${itemName} (${ownerA} <-> ${ownerB})`;
}

function buildIntentRowSpecs(intents, planner, state, focus, getOwnerLabel) {
  const groupByKey = new Map();
  const groupKeyByIntentId = new Map();
  const tilePlanGroups = new Map();
  const hubPlanGroups = new Map();

  for (const intent of intents) {
    const info = getCurrencyGroupInfoForIntent(intent);
    if (!info) continue;

    const intentId = getPlannerIntentId(intent);
    const qty = getItemQuantity(intent.item);
    let group = groupByKey.get(info.key);
    if (!group) {
      group = {
        kind: intent.item?.kind ?? null,
        minId: info.minId,
        maxId: info.maxId,
        net: 0,
        intentIds: [],
        cost: 0,
      };
      groupByKey.set(info.key, group);
    }
    group.net += info.dir * qty;
    if (intentId != null) {
      group.intentIds.push(intentId);
      groupKeyByIntentId.set(intentId, info.key);
    }
    group.cost += planner?.getIntentCost?.(intentId) ?? 0;
  }

  const rowsOut = [];
  const emittedGroups = new Set();
  const emittedTilePlans = new Set();
  const emittedHubPlans = new Set();

  for (const intent of intents) {
    if (!isTilePlanIntent(intent)) continue;
    const envCol = Number.isFinite(intent.envCol)
      ? Math.floor(intent.envCol)
      : null;
    if (envCol == null) continue;
    const key = envCol;
    let group = tilePlanGroups.get(key);
    if (!group) {
      group = {
        envCol,
        intentIds: [],
        cost: 0,
        isFocused: false,
        focusIntentId: null,
        signatures: [],
      };
      tilePlanGroups.set(key, group);
    }
    const intentId = intent?.id ?? intent?.subjectKey ?? null;
    if (intentId != null) {
      group.intentIds.push(intentId);
      const cost = planner?.getIntentCost?.(intentId) ?? 0;
      if (cost > group.cost) group.cost = cost;
      if (!group.focusIntentId) group.focusIntentId = intentId;
      if (focus && focus.id === intentId) group.isFocused = true;
    }
    const sig = getTilePlanIntentSignature(intent);
    if (sig) group.signatures.push(sig);
  }

  for (const intent of intents) {
    if (!isHubPlanIntent(intent)) continue;
    const hubCol = Number.isFinite(intent.hubCol)
      ? Math.floor(intent.hubCol)
      : null;
    if (hubCol == null) continue;
    const key = hubCol;
    let group = hubPlanGroups.get(key);
    if (!group) {
      group = {
        hubCol,
        intentIds: [],
        cost: 0,
        isFocused: false,
        focusIntentId: null,
        signatures: [],
      };
      hubPlanGroups.set(key, group);
    }
    const intentId = intent?.id ?? intent?.subjectKey ?? null;
    if (intentId != null) {
      group.intentIds.push(intentId);
      const cost = planner?.getIntentCost?.(intentId) ?? 0;
      if (cost > group.cost) group.cost = cost;
      if (!group.focusIntentId) group.focusIntentId = intentId;
      if (focus && focus.id === intentId) group.isFocused = true;
    }
    const sig = getHubPlanIntentSignature(intent);
    if (sig) group.signatures.push(sig);
  }

  for (const intent of intents) {
    const intentId = intent?.id ?? intent?.subjectKey ?? null;
    const groupKey = intentId ? groupKeyByIntentId.get(intentId) : null;
    if (groupKey) {
      if (emittedGroups.has(groupKey)) continue;
      emittedGroups.add(groupKey);
      const group = groupByKey.get(groupKey);
      if (!group) continue;
      const desc = formatCurrencyGroupDescription(group, getOwnerLabel);
      if (!desc) continue;
      const isFocused =
        focus && group.intentIds.some((id) => id === focus.id);
      if (!group.net || group.cost <= 0) continue;
      rowsOut.push({
        id: groupKey,
        description: desc,
        cost: group.cost,
        intentIds: group.intentIds.slice(),
        focusIntentId: isFocused ? focus.id : group.intentIds[0] ?? null,
        isFocused,
        isUndoable: true,
      });
      continue;
    }

    if (isTilePlanIntent(intent)) {
      const envCol = Number.isFinite(intent.envCol)
        ? Math.floor(intent.envCol)
        : null;
      if (envCol == null) continue;
      if (emittedTilePlans.has(envCol)) continue;
      emittedTilePlans.add(envCol);
      const group = tilePlanGroups.get(envCol);
      if (!group || group.cost <= 0) continue;
      rowsOut.push({
        id: `tilePlan:${envCol}`,
        description: formatTilePlanLabel(envCol, state),
        cost: group.cost,
        signature: group.signatures.slice().sort().join("|"),
        intentIds: group.intentIds.slice(),
        focusIntentId: group.focusIntentId,
        isFocused: group.isFocused,
        isUndoable: true,
      });
      continue;
    }

    if (isHubPlanIntent(intent)) {
      const hubCol = Number.isFinite(intent.hubCol)
        ? Math.floor(intent.hubCol)
        : null;
      if (hubCol == null) continue;
      if (emittedHubPlans.has(hubCol)) continue;
      emittedHubPlans.add(hubCol);
      const group = hubPlanGroups.get(hubCol);
      if (!group || group.cost <= 0) continue;
      rowsOut.push({
        id: `hubPlan:${hubCol}`,
        description: formatHubPlanLabel(hubCol, state),
        cost: group.cost,
        signature: group.signatures.slice().sort().join("|"),
        intentIds: group.intentIds.slice(),
        focusIntentId: group.focusIntentId,
        isFocused: group.isFocused,
        isUndoable: true,
      });
      continue;
    }

    if (!intent) continue;
    const intentCost = planner?.getIntentCost?.(intentId) ?? 0;
    if (!shouldLogPlannerIntent(intent, intentCost)) continue;
    const rowId = intentId ?? `intent:${rowsOut.length}`;
    rowsOut.push({
      id: rowId,
      description: describeIntent(intent, state, getOwnerLabel),
      cost: intentCost,
      intentIds: intentId ? [intentId] : [],
      focusIntentId: intentId,
      isFocused: !!(focus && intentId && focus.id === intentId),
      isUndoable: true,
    });
  }

  return rowsOut;
}

export function buildActionRowSpecs(actions, state, getOwnerLabel) {
  const groupByKey = new Map();
  const groupKeyByAction = new Map();
  const tilePlanGroups = new Map();
  const hubPlanGroups = new Map();

  for (const action of actions) {
    const info = getCurrencyGroupInfoForAction(action);
    if (!info) continue;
    const payload = action.payload || {};
    const qty = getItemQuantity(payload.item);
    let group = groupByKey.get(info.key);
    if (!group) {
      group = {
        kind,
        minId: info.minId,
        maxId: info.maxId,
        net: 0,
        cost: 0,
      };
      groupByKey.set(info.key, group);
    }
    group.net += info.dir * qty;
    group.cost += getPlannerActionApCost(action);
    groupKeyByAction.set(action, info.key);
  }

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!isTilePlanAction(action)) continue;
    const payload = action.payload || {};
    const envCol = Number.isFinite(payload.envCol)
      ? Math.floor(payload.envCol)
      : Number.isFinite(payload.toEnvCol)
      ? Math.floor(payload.toEnvCol)
      : null;
    if (envCol == null) continue;
    let group = tilePlanGroups.get(envCol);
    if (!group) {
      group = { envCol, cost: 0, firstIndex: i };
      tilePlanGroups.set(envCol, group);
    }
    const apCost = getPlannerActionApCost(action);
    if (apCost > group.cost) group.cost = apCost;
  }

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!isHubPlanAction(action)) continue;
    const payload = action.payload || {};
    const hubCol = Number.isFinite(payload.hubCol)
      ? Math.floor(payload.hubCol)
      : Number.isFinite(payload.toHubCol)
      ? Math.floor(payload.toHubCol)
      : null;
    if (hubCol == null) continue;
    let group = hubPlanGroups.get(hubCol);
    if (!group) {
      group = { hubCol, cost: 0, firstIndex: i };
      hubPlanGroups.set(hubCol, group);
    }
    const apCost = getPlannerActionApCost(action);
    if (apCost > group.cost) group.cost = apCost;
  }

  const rowsOut = [];
  const emittedGroups = new Set();
  const emittedTilePlans = new Set();
  const emittedHubPlans = new Set();

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const payload = action.payload || {};

    const groupKey = groupKeyByAction.get(action);
    if (groupKey) {
      if (emittedGroups.has(groupKey)) continue;
      emittedGroups.add(groupKey);
      const group = groupByKey.get(groupKey);
      if (!group || !group.net || group.cost <= 0) continue;
      const desc = formatCurrencyGroupDescription(group, getOwnerLabel);
      if (!desc) continue;
      rowsOut.push({
        id: groupKey,
        description: desc,
        cost: group.cost,
        isUndoable: false,
      });
      continue;
    }

    if (isTilePlanAction(action)) {
      const envCol = Number.isFinite(payload.envCol)
        ? Math.floor(payload.envCol)
        : Number.isFinite(payload.toEnvCol)
        ? Math.floor(payload.toEnvCol)
        : null;
      if (envCol == null) continue;
      if (emittedTilePlans.has(envCol)) continue;
      emittedTilePlans.add(envCol);
      const group = tilePlanGroups.get(envCol);
      if (!group || group.cost <= 0) continue;
      rowsOut.push({
        id: `tilePlan:${envCol}:${group.firstIndex}`,
        description: formatTilePlanLabel(envCol, state),
        cost: group.cost,
        isUndoable: false,
      });
      continue;
    }

    if (isHubPlanAction(action)) {
      const hubCol = Number.isFinite(payload.hubCol)
        ? Math.floor(payload.hubCol)
        : Number.isFinite(payload.toHubCol)
        ? Math.floor(payload.toHubCol)
        : null;
      if (hubCol == null) continue;
      if (emittedHubPlans.has(hubCol)) continue;
      emittedHubPlans.add(hubCol);
      const group = hubPlanGroups.get(hubCol);
      if (!group || group.cost <= 0) continue;
      rowsOut.push({
        id: `hubPlan:${hubCol}:${group.firstIndex}`,
        description: formatHubPlanLabel(hubCol, state),
        cost: group.cost,
        isUndoable: false,
      });
      continue;
    }

    const kind = action.kind;
    const apCost = getPlannerActionApCost(action);
    const desc = describePlannerAction(
      action,
      createActionLogDescribeContext(state, getOwnerLabel)
    );
    if (!shouldLogPlannerAction(action, apCost)) continue;
    rowsOut.push({
      id: `${kind}:${i}`,
      description: desc,
      cost: apCost,
      isUndoable: false,
    });
  }

  return rowsOut;
}

function isLogAction(action) {
  return shouldLogPlannerAction(action, getPlannerActionApCost(action));
}

function getActionsAtSecond(timeline, sec) {
  if (!timeline) return [];
  if (timeline.actionsBySec && typeof timeline.actionsBySec.get === "function") {
    return timeline.actionsBySec.get(sec) || [];
  }
  return (timeline.actions || []).filter(
    (a) => Math.floor(a.tSec ?? 0) === sec
  );
}

function lowerBoundSorted(list, value) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundSorted(list, value) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function createActionLogController({
  getPlanner,
  getTimeline,
  getState,
  getCursorState,
  getOwnerLabel,
  getPendingActionRowSpecs,
} = {}) {
  let cachedActionSecs = [];
  let lastActionSig = null;

  function computeActionSig(tl) {
    const acts = Array.isArray(tl?.actions) ? tl.actions : [];
    const len = acts.length;
    const last = len ? acts[len - 1] : null;
    return {
      ref: acts,
      len,
      lastRef: last,
      lastSec: last ? Math.floor(last.tSec ?? 0) : 0,
    };
  }

  function actionSigEquals(a, b) {
    if (!a || !b) return false;
    return (
      a.ref === b.ref &&
      a.len === b.len &&
      a.lastRef === b.lastRef &&
      a.lastSec === b.lastSec
    );
  }

  function getTimelineSafe() {
    return typeof getTimeline === "function" ? getTimeline() : null;
  }

  function getStateSafe() {
    return typeof getState === "function" ? getState() : null;
  }

  function getCursorStateSafe() {
    return typeof getCursorState === "function" ? getCursorState() : null;
  }

  function rebuildActionSecs() {
    const tl = getTimelineSafe();
    if (!tl) {
      cachedActionSecs = [];
      lastActionSig = null;
      return;
    }
    const sig = computeActionSig(tl);
    if (actionSigEquals(sig, lastActionSig)) return;

    const prevSig = lastActionSig;
    const appendOnly =
      prevSig &&
      sig.ref === prevSig.ref &&
      sig.len === prevSig.len + 1 &&
      sig.lastRef !== prevSig.lastRef &&
      sig.lastSec >= prevSig.lastSec;
    if (appendOnly) {
      lastActionSig = sig;
      const lastAction = sig.lastRef;
      if (!isLogAction(lastAction)) return;
      const sec = Math.max(0, Math.floor(lastAction?.tSec ?? 0));
      const lastIdx = cachedActionSecs.length - 1;
      const lastSec = lastIdx >= 0 ? cachedActionSecs[lastIdx] : null;
      if (lastSec == null || sec > lastSec) {
        cachedActionSecs.push(sec);
        return;
      }
      if (sec === lastSec) return;
      const insertIdx = lowerBoundSorted(cachedActionSecs, sec);
      if (cachedActionSecs[insertIdx] !== sec) {
        cachedActionSecs.splice(insertIdx, 0, sec);
      }
      return;
    }

    const mutationKind = tl?._lastMutationKind ?? null;
    const mutationSecRaw = tl?._lastMutationSec;
    const mutationSec = Number.isFinite(mutationSecRaw)
      ? Math.max(0, Math.floor(mutationSecRaw))
      : null;
    const canPatchBySecond =
      prevSig &&
      mutationSec != null &&
      (mutationKind === "replaceActionsAtSec" ||
        mutationKind === "truncateTimelineAfterSec");
    if (canPatchBySecond) {
      lastActionSig = sig;

      if (mutationKind === "replaceActionsAtSec") {
        const actionsAtSec = getActionsAtSecond(tl, mutationSec);
        const hasLogActionAtSec = actionsAtSec.some(isLogAction);
        const insertIdx = lowerBoundSorted(cachedActionSecs, mutationSec);
        const existsAtSec = cachedActionSecs[insertIdx] === mutationSec;
        if (hasLogActionAtSec && !existsAtSec) {
          cachedActionSecs.splice(insertIdx, 0, mutationSec);
        } else if (!hasLogActionAtSec && existsAtSec) {
          cachedActionSecs.splice(insertIdx, 1);
        }
      }

      const truncateFrom = upperBoundSorted(cachedActionSecs, mutationSec);
      if (truncateFrom < cachedActionSecs.length) {
        cachedActionSecs.splice(truncateFrom);
      }
      return;
    }

    lastActionSig = sig;

    const set = new Set();
    for (const action of tl?.actions || []) {
      if (!isLogAction(action)) continue;
      set.add(Math.max(0, Math.floor(action.tSec ?? 0)));
    }
    cachedActionSecs = Array.from(set.values()).sort((a, b) => a - b);
  }

  function getActionSecs() {
    rebuildActionSecs();
    return cachedActionSecs;
  }

  function getPrevNextSecs(currentSec) {
    const list = getActionSecs();
    if (!list.length) return { prev: null, next: null };

    let lo = 0;
    let hi = list.length - 1;
    let prev = null;
    let next = null;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const val = list[mid];
      if (val < currentSec) {
        prev = val;
        lo = mid + 1;
      } else if (val > currentSec) {
        next = val;
        hi = mid - 1;
      } else {
        prev = mid > 0 ? list[mid - 1] : null;
        next = mid < list.length - 1 ? list[mid + 1] : null;
        return { prev, next };
      }
    }

    return { prev, next };
  }

  function getPrevNextForCursor() {
    const cursor = getCursorStateSafe();
    const currentSec = Math.floor(cursor?.tSec ?? 0);
    return getPrevNextSecs(currentSec);
  }

  function getPreviewSec() {
    const state = getStateSafe();
    return Math.floor(state?.tSec ?? 0);
  }

  function getIntentRowSpecs() {
    const planner = typeof getPlanner === "function" ? getPlanner() : null;
    const pendingRows =
      typeof getPendingActionRowSpecs === "function"
        ? getPendingActionRowSpecs() || []
        : [];
    if (!planner) return pendingRows;
    const state = getStateSafe();
    const intents = planner.getOrderedIntents?.() || [];
    const focus = planner.getFocusIntent?.();
    return buildIntentRowSpecs(intents, planner, state, focus, getOwnerLabel).concat(
      pendingRows
    );
  }

  function getActionRowSpecsForCurrentSec() {
    const state = getStateSafe();
    const tl = getTimelineSafe();
    const tSec = Math.floor(state?.tSec ?? 0);
    const actions = getActionsAtSecond(tl, tSec).filter(isLogAction);
    return buildActionRowSpecs(actions, state, getOwnerLabel);
  }

  function getApText(previewing) {
    const planner = typeof getPlanner === "function" ? getPlanner() : null;
    const state = getStateSafe();

    if (previewing && state) {
      const cur = Math.floor(state.actionPoints ?? 0);
      const cap = Math.floor(state.actionPointCap ?? 0);
      return `${cur}/${cap}`;
    }

    const ap = planner?.getApPreview?.();
    if (ap) {
      return `${Math.floor(ap.remaining)}/${Math.floor(ap.base)}`;
    }

    return "--/--";
  }

  return {
    getActionSecs,
    getPrevNextSecs,
    getPrevNextForCursor,
    getPreviewSec,
    getIntentRowSpecs,
    getActionRowSpecsForCurrentSec,
    getApText,
  };
}

