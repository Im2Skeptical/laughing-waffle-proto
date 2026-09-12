// src/model/actions.js
// Active settlement timeline action registry.
// Leftover placePawn/inventory/build/tag kinds stay because sim-runner
// planner helpers still match those strings.

import {
  cmdChooseVassalDevelopmentStat,
  cmdConfirmVassalLifeNode,
  cmdEnterVassalLifeNode,
  cmdPurchaseVassalShopOffer,
  cmdMoveVassalShopStructure,
  cmdReorderVassalShopPurchase,
  cmdRerollSettlementVassals,
  cmdRerollVassalShop,
  cmdSelectSettlementVassal,
  cmdSelectVassalLifeOption,
  cmdUndoVassalShopPurchase,
} from "./commands/settlement-vassal-commands.js";
import { cmdDebugSetSettlementSlotOverrides } from "./commands/debug-commands.js";
import {
  cmdInstallRegionalPractice,
  cmdUninstallRegionalPractice,
} from "./commands/regional-practice-commands.js";
import { getApCapForSecond, normalizeApState } from "./commands/ap-helpers.js";

export const ActionKinds = {
  PLACE_PAWN: "placePawn",
  INVENTORY_MOVE: "inventoryMove",
  INVENTORY_SPLIT: "inventorySplit",
  INVENTORY_STACK: "inventoryStack",
  BUILD_DESIGNATE: "buildDesignate",
  SET_TILE_TAG_ORDER: "setTileTagOrder",
  SET_HUB_TAG_ORDER: "setHubTagOrder",
  TOGGLE_TILE_TAG: "toggleTileTag",
  TOGGLE_HUB_TAG: "toggleHubTag",
  SET_TILE_CROP_SELECTION: "setTileCropSelection",
  SET_HUB_RECIPE_SELECTION: "setHubRecipeSelection",
  SETTLEMENT_SELECT_VASSAL: "settlementSelectVassal",
  SETTLEMENT_REROLL_VASSALS: "settlementRerollVassals",
  VASSAL_ENTER_LIFE_NODE: "vassalEnterLifeNode",
  VASSAL_SELECT_LIFE_OPTION: "vassalSelectLifeOption",
  VASSAL_MOVE_SHOP_STRUCTURE: "vassalMoveShopStructure",
  VASSAL_PURCHASE_SHOP_OFFER: "vassalPurchaseShopOffer",
  VASSAL_UNDO_SHOP_PURCHASE: "vassalUndoShopPurchase",
  VASSAL_REORDER_SHOP_PURCHASE: "vassalReorderShopPurchase",
  VASSAL_REROLL_SHOP: "vassalRerollShop",
  VASSAL_CONFIRM_LIFE_NODE: "vassalConfirmLifeNode",
  VASSAL_CHOOSE_DEVELOPMENT_STAT: "vassalChooseDevelopmentStat",
  DEBUG_SET_CAP: "debugSetCap",
  DEBUG_QUEUE_ENV_EVENT: "debugQueueEnvEvent",
  DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES: "debugSetSettlementSlotOverrides",
  REGION_INSTALL_PRACTICE: "regionInstallPractice",
  REGION_UNINSTALL_PRACTICE: "regionUninstallPractice",
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
    case ActionKinds.SETTLEMENT_REROLL_VASSALS:
      result = cmdRerollSettlementVassals(state, payload);
      break;
    case ActionKinds.VASSAL_ENTER_LIFE_NODE:
      result = cmdEnterVassalLifeNode(state, payload);
      break;
    case ActionKinds.VASSAL_SELECT_LIFE_OPTION:
      result = cmdSelectVassalLifeOption(state, payload);
      break;
    case ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE:
      result = cmdMoveVassalShopStructure(state, payload);
      break;
    case ActionKinds.VASSAL_PURCHASE_SHOP_OFFER:
      result = cmdPurchaseVassalShopOffer(state, payload);
      break;
    case ActionKinds.VASSAL_UNDO_SHOP_PURCHASE:
      result = cmdUndoVassalShopPurchase(state, payload);
      break;
    case ActionKinds.VASSAL_REORDER_SHOP_PURCHASE:
      result = cmdReorderVassalShopPurchase(state, payload);
      break;
    case ActionKinds.VASSAL_REROLL_SHOP:
      result = cmdRerollVassalShop(state, payload);
      break;
    case ActionKinds.VASSAL_CONFIRM_LIFE_NODE:
      result = cmdConfirmVassalLifeNode(state, payload);
      break;
    case ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT:
      result = cmdChooseVassalDevelopmentStat(state, payload);
      break;
    case ActionKinds.DEBUG_SET_CAP:
      result = cmdDebugSetCap(state, payload);
      break;
    case ActionKinds.DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES:
      result = cmdDebugSetSettlementSlotOverrides(state, payload);
      break;
    case ActionKinds.REGION_INSTALL_PRACTICE:
      result = cmdInstallRegionalPractice(state, payload);
      break;
    case ActionKinds.REGION_UNINSTALL_PRACTICE:
      result = cmdUninstallRegionalPractice(state, payload);
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
