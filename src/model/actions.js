// src/model/actions.js
// Active settlement timeline action registry.

import {
  cmdDebugSelectCheatVassal,
  cmdSelectSettlementVassal,
} from "./commands/settlement-vassal-commands.js";
import { cmdDebugSetSettlementSlotOverrides } from "./commands/debug-commands.js";
import { getApCapForSecond, normalizeApState } from "./commands/ap-helpers.js";

export const ActionKinds = {
  PLACE_PAWN: "placePawn",
  INVENTORY_MOVE: "inventoryMove",
  INVENTORY_SPLIT: "inventorySplit",
  INVENTORY_STACK: "inventoryStack",
  INVENTORY_DISCARD: "inventoryDiscard",
  INVENTORY_USE_ITEM: "inventoryUseItem",
  INVENTORY_OPEN_GRAPH_ITEM: "inventoryOpenGraphItem",
  PROCESS_DROPBOX_MOVE: "processDropboxMove",
  DEPOSIT_ITEM_TO_BASKET: "depositItemToBasket",
  EQUIP_ITEM: "equipItem",
  UNEQUIP_ITEM: "unequipItem",
  MOVE_EQUIPPED_ITEM: "moveEquippedItem",
  BUILD_DESIGNATE: "buildDesignate",
  BUILD_CANCEL: "buildCancel",
  SET_TILE_TAG_ORDER: "setTileTagOrder",
  SET_HUB_TAG_ORDER: "setHubTagOrder",
  TOGGLE_TILE_TAG: "toggleTileTag",
  TOGGLE_HUB_TAG: "toggleHubTag",
  SET_TILE_CROP_SELECTION: "setTileCropSelection",
  SET_HUB_RECIPE_SELECTION: "setHubRecipeSelection",
  SET_REGION_NAME: "setRegionName",
  SET_HUB_NAME: "setHubName",
  WITHDRAW_HUB_POOL_ITEM: "withdrawHubPoolItem",
  WITHDRAW_PAWN_BASKET_POOL_ITEM: "withdrawPawnBasketPoolItem",
  SET_PROCESS_ROUTING: "setProcessRouting",
  REORDER_PROCESS_ROUTING_ENDPOINT: "reorderProcessRoutingEndpoint",
  TOGGLE_PROCESS_ROUTING_ENDPOINT: "toggleProcessRoutingEndpoint",
  SET_ROUTING_TEMPLATE: "setRoutingTemplate",
  REORDER_ROUTING_TEMPLATE_ENDPOINT: "reorderRoutingTemplateEndpoint",
  TOGGLE_ROUTING_TEMPLATE_ENDPOINT: "toggleRoutingTemplateEndpoint",
  ADJUST_FOLLOWER_COUNT: "adjustFollowerCount",
  ADJUST_WORKER_COUNT: "adjustWorkerCount",
  SETTLEMENT_SELECT_VASSAL: "settlementSelectVassal",
  UNLOCK_SKILL_NODE: "unlockSkillNode",
  DEBUG_SET_CAP: "debugSetCap",
  DEBUG_QUEUE_ENV_EVENT: "debugQueueEnvEvent",
  DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES: "debugSetSettlementSlotOverrides",
  DEBUG_SELECT_CHEAT_VASSAL: "debugSelectCheatVassal",
};

function ensureAPState(state) {
  if (typeof state.actionPoints !== "number") state.actionPoints = 0;
  if (typeof state.actionPointCap !== "number") state.actionPointCap = 0;
}

function getActionApCost(action) {
  const raw = action?.apCost ?? action?.payload?.apCost;
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

function isActionPointCostEnabled(state) {
  return state?.variantFlags?.actionPointCostsEnabled !== false;
}

function cmdDebugSetCap(state, { cap, points, enabled } = {}) {
  normalizeApState(state);

  const enableOverride =
    typeof enabled === "boolean"
      ? enabled
      : typeof cap === "number" || typeof points === "number";

  if (enableOverride) {
    const overrideCap =
      typeof cap === "number"
        ? Math.max(0, Math.floor(cap))
        : Math.max(0, Math.floor(state.actionPointCap ?? 0));
    const overridePoints =
      typeof points === "number" ? Math.floor(points) : overrideCap;

    state.apCapOverride = {
      enabled: true,
      cap: overrideCap,
      points: overridePoints,
    };
    state.actionPointCap = overrideCap;
    state.actionPoints = Math.min(
      state.actionPointCap,
      Math.max(0, overridePoints)
    );
  } else {
    state.apCapOverride = null;
    state.actionPointCap = getApCapForSecond(state, state.tSec ?? 0);
    state.actionPoints = Math.min(state.actionPoints, state.actionPointCap);
  }

  return {
    ok: true,
    actionPointCap: state.actionPointCap,
    actionPoints: state.actionPoints,
    apCapOverride: state.apCapOverride,
  };
}

export function applyAction(state, action, context = {}) {
  if (!action || typeof action !== "object") {
    return { ok: false, reason: "badAction" };
  }

  const { isReplay } = context;
  const kind = action.kind;
  const payload = action.payload || {};

  if (!kind) {
    throw new Error(
      `Unknown action kind: '${action?.kind}'. Action: ${JSON.stringify(action)}`
    );
  }

  ensureAPState(state);

  const isControlAction = kind === ActionKinds.DEBUG_SET_CAP;
  if (!isReplay && !isControlAction && !state.paused) {
    return { ok: false, reason: "mustBePaused" };
  }

  const cost = isActionPointCostEnabled(state) ? getActionApCost(action) : 0;
  if (cost > 0 && state.actionPoints < cost) {
    return {
      ok: false,
      reason: "insufficientAP",
      needed: cost,
      current: state.actionPoints,
    };
  }

  let result;
  switch (kind) {
    case ActionKinds.SETTLEMENT_SELECT_VASSAL:
      result = cmdSelectSettlementVassal(state, payload);
      break;
    case ActionKinds.DEBUG_SET_CAP:
      result = cmdDebugSetCap(state, payload);
      break;
    case ActionKinds.DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES:
      result = cmdDebugSetSettlementSlotOverrides(state, payload);
      break;
    case ActionKinds.DEBUG_SELECT_CHEAT_VASSAL:
      result = cmdDebugSelectCheatVassal(state, payload);
      break;
    default:
      return { ok: false, reason: "unsupportedAction", kind };
  }

  if (!result?.ok) return result || { ok: false, reason: "cmdFailed" };

  if (cost > 0) {
    state.actionPoints -= cost;
  }

  return {
    ok: true,
    ...result,
    apCost: cost,
    actionPoints: state.actionPoints,
    actionPointCap: state.actionPointCap,
  };
}
