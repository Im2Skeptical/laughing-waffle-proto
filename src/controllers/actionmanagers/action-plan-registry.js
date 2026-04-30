const INTENT_AP_COSTS = Object.freeze({});
import { ActionKinds } from "../../model/actions.js";
import { recipePrioritiesEqual } from "../../model/recipe-priority.js";
import {
  getCurrencyGroupInfo,
  getItemQuantity,
  isCurrencyItem,
} from "./action-currency-utils.js";
import {
  IntentKinds,
  makeBuildDesignateIntent,
  makeHubRecipeSelectIntent,
  makeHubTagOrderIntent,
  makeHubTagToggleIntent,
  makeItemTransferIntent,
  makePawnMoveIntent,
  makeTileCropSelectIntent,
  makeTileTagOrderIntent,
  makeTileTagToggleIntent,
} from "./action-intents.js";
import { getPlacementRow, placementEquals } from "./action-placement-utils.js";

function normalizeActionApCost(action) {
  const payload = action?.payload || {};
  const raw = action?.apCost ?? payload?.apCost;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

function tagsEqual(a, b) {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i += 1) {
    if (listA[i] !== listB[i]) return false;
  }
  return true;
}

function getIntentId(intent) {
  return intent?.id ?? intent?.subjectKey ?? null;
}

function getTilePlanCost() {
  return INTENT_AP_COSTS.tilePlan ?? INTENT_AP_COSTS.tileTagOrder ?? 0;
}

function getHubPlanCost() {
  return (
    INTENT_AP_COSTS.hubPlan ??
    INTENT_AP_COSTS.tilePlan ??
    INTENT_AP_COSTS.hubTagOrder ??
    0
  );
}

function resolveIntentApCost(intent, ctx = {}) {
  const intentId = getIntentId(intent);
  const costById = ctx?.costById && typeof ctx.costById === "object" ? ctx.costById : null;
  if (intentId != null && costById && Number.isFinite(costById[intentId])) {
    return Math.max(0, Math.floor(costById[intentId]));
  }
  return estimatePlannerIntentApCost(intent, { stateStart: ctx?.stateStart ?? ctx?.state });
}

function formatCurrencyTransferDescription(source, ctx = {}) {
  const itemName = ctx?.formatItemNameFromKind?.(source?.item?.kind);
  const fallback =
    itemName || `Item ${source?.itemId ?? ""}`.trim() || "Item";
  const dest = ctx?.formatOwnerName?.(source?.toOwnerId, ctx?.getOwnerLabel);
  return `${fallback} > ${dest}`;
}

function formatPawnMoveDescription(source, ctx = {}) {
  const pawnName = ctx?.formatPawnName?.(source?.pawnId, ctx?.state);
  const dest = ctx?.formatPlacementName?.(source?.toPlacement, ctx?.state);
  return `${pawnName} > ${dest}`;
}

function formatTileTagToggleDescription(source, ctx = {}) {
  const tileName = ctx?.formatTileName?.(source?.envCol, ctx?.state);
  const tagName = ctx?.formatEnvTagName?.(source?.tagId);
  const status = source?.disabled ? "Off" : "On";
  return `Tag ${tagName} > ${tileName}: ${status}`;
}

function formatHubTagToggleDescription(source, ctx = {}) {
  const hubName = ctx?.formatHubName?.(source?.hubCol, ctx?.state);
  const tagName = ctx?.formatHubTagName?.(source?.tagId);
  const status = source?.disabled ? "Off" : "On";
  return `Tag ${tagName} > ${hubName}: ${status}`;
}

function formatTileCropDescription(source, ctx = {}) {
  const tileName = ctx?.formatTileName?.(source?.envCol, ctx?.state);
  const priority = ctx?.normalizeRecipePriorityForLog?.(
    "growth",
    source?.recipePriority,
    source?.cropId ?? null
  );
  const summary = ctx?.formatCropPriorityLabel?.(priority);
  return `Seeds > ${tileName}: ${summary}`;
}

function formatHubRecipeDescription(source, ctx = {}) {
  const hubName = ctx?.formatHubName?.(source?.hubCol, ctx?.state);
  const priority = ctx?.normalizeRecipePriorityForLog?.(
    source?.systemId ?? null,
    source?.recipePriority,
    source?.recipeId ?? null
  );
  const summary = ctx?.formatRecipePriorityLabel?.(source?.systemId ?? null, priority);
  return `Recipes > ${hubName}: ${summary}`;
}

function createTilePlanGroup(scopeKey) {
  if (!Number.isFinite(scopeKey)) return null;
  return { scope: "tile", key: Math.floor(scopeKey) };
}

function createHubPlanGroup(scopeKey) {
  if (!Number.isFinite(scopeKey)) return null;
  return { scope: "hub", key: Math.floor(scopeKey) };
}

function createRegistryEntry(entry) {
  return entry;
}

const PLANNER_ACTION_ENTRIES = [
  createRegistryEntry({
    intentKind: IntentKinds.ITEM_TRANSFER,
    actionKind: ActionKinds.INVENTORY_MOVE,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const fromOwnerId = payload.fromOwnerId;
      const toOwnerId = payload.toOwnerId;
      if (fromOwnerId === toOwnerId) return null;
      const itemId = payload.itemId ?? payload.item?.id ?? null;
      if (itemId == null) return null;
      const fromPlacement = payload.fromPlacement ? { ...payload.fromPlacement } : null;
      const toPlacement = payload.toPlacement
        ? { ...payload.toPlacement }
        : {
            ownerId: toOwnerId,
            gx: payload.targetGX,
            gy: payload.targetGY,
          };
      const fallbackItem =
        typeof ctx.findTimelineItemSnapshot === "function"
          ? ctx.findTimelineItemSnapshot(action)
          : null;
      const itemSnapshot = payload.item ? { ...payload.item } : fallbackItem;
      const subjectKey = `item:${itemId}`;
      return makeItemTransferIntent({
        id: subjectKey,
        subjectKey,
        itemId,
        item: itemSnapshot,
        fromOwnerId,
        toOwnerId,
        fromPlacement,
        toPlacement,
        baselinePlacement: ctx?.clonePlacement?.(toPlacement) ?? toPlacement,
        apCostOverride: null,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      const to = intent?.toPlacement;
      if (!to) return null;
      return {
        kind: ActionKinds.INVENTORY_MOVE,
        payload: {
          fromOwnerId: intent.fromOwnerId,
          toOwnerId: intent.toOwnerId,
          itemId: intent.itemId,
          targetGX: to.gx,
          targetGY: to.gy,
          fromPlacement: intent.fromPlacement,
          toPlacement: intent.toPlacement,
          item: intent.item,
        },
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      const isCurrencyTransfer =
        intent.kind === IntentKinds.ITEM_TRANSFER && isCurrencyItem(intent.item);
      if (Number.isFinite(intent.apCostOverride) && !isCurrencyTransfer) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      if (intent.fromOwnerId === intent.toOwnerId) return 0;
      if (placementEquals(intent.fromPlacement, intent.toPlacement)) return 0;
      if (isCurrencyTransfer) {
        return INTENT_AP_COSTS.currencyTransfer ?? INTENT_AP_COSTS.itemTransfer ?? 0;
      }
      return INTENT_AP_COSTS.itemTransfer ?? 0;
    },
    getCurrencyGroupInfoForIntent(intent) {
      return getCurrencyGroupInfo({
        item: intent?.item ?? null,
        fromOwnerId: intent?.fromOwnerId,
        toOwnerId: intent?.toOwnerId,
      });
    },
    getCurrencyGroupInfoForAction(action) {
      const payload = action?.payload || {};
      return getCurrencyGroupInfo({
        item: payload.item ?? null,
        kind: payload.item?.kind ?? null,
        fromOwnerId: payload.fromOwnerId,
        toOwnerId: payload.toOwnerId,
      });
    },
    describeIntent(intent, ctx) {
      return formatCurrencyTransferDescription(intent, ctx);
    },
    describeAction(action, ctx) {
      return formatCurrencyTransferDescription(action?.payload || {}, ctx);
    },
    shouldLogIntent(intent, cost) {
      return intent?.fromOwnerId !== intent?.toOwnerId && cost > 0;
    },
    shouldLogAction(action, cost) {
      const payload = action?.payload || {};
      return payload.fromOwnerId != null && payload.toOwnerId != null && payload.fromOwnerId !== payload.toOwnerId && cost > 0;
    },
  }),
  createRegistryEntry({
    intentKind: IntentKinds.PAWN_MOVE,
    actionKind: ActionKinds.PLACE_PAWN,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const pawnId = payload.pawnId != null ? payload.pawnId : null;
      if (pawnId == null) return null;
      const normalizePawnPlacement = ctx?.normalizePawnPlacement;
      const makePawnPlacement = ctx?.makePawnPlacement;
      const toHubCol = payload.toHubCol ?? payload.hubCol ?? null;
      const toEnvCol = payload.toEnvCol ?? payload.envCol ?? null;
      const fromHubCol = payload.fromHubCol != null ? payload.fromHubCol : null;
      const fromEnvCol = payload.fromEnvCol != null ? payload.fromEnvCol : null;
      const fromPlacement =
        normalizePawnPlacement?.(payload.fromPlacement) ??
        makePawnPlacement?.({ hubCol: fromHubCol, envCol: fromEnvCol }) ??
        null;
      const toPlacement =
        normalizePawnPlacement?.(payload.toPlacement) ??
        makePawnPlacement?.({ hubCol: toHubCol, envCol: toEnvCol }) ??
        null;
      const subjectKey = `pawn:${pawnId}`;
      return makePawnMoveIntent({
        id: subjectKey,
        subjectKey,
        pawnId,
        fromPlacement,
        toPlacement,
        baselinePlacement: ctx?.clonePlacement?.(toPlacement) ?? toPlacement,
        apCostOverride: ctx?.normalizeApCost?.(action?.apCost ?? payload.apCost) ?? 0,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      const toPlacement = intent?.toPlacement ?? null;
      const toHubCol = toPlacement?.hubCol ?? null;
      const toEnvCol = toPlacement?.envCol ?? null;
      if (toHubCol == null && toEnvCol == null) return null;
      const payload = {
        pawnId: intent.pawnId,
        fromPlacement: ctx?.clonePlacement?.(intent.fromPlacement) ?? intent.fromPlacement,
        toPlacement: ctx?.clonePlacement?.(toPlacement) ?? toPlacement,
      };
      if (toHubCol != null) {
        payload.hubCol = toHubCol;
        payload.toHubCol = toHubCol;
        payload.fromHubCol = intent?.fromPlacement?.hubCol ?? null;
      }
      if (toEnvCol != null) {
        payload.envCol = toEnvCol;
        payload.toEnvCol = toEnvCol;
        payload.fromEnvCol = intent?.fromPlacement?.envCol ?? null;
      }
      return {
        kind: ActionKinds.PLACE_PAWN,
        payload,
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      if (Number.isFinite(intent.apCostOverride)) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      if (placementEquals(intent.fromPlacement, intent.toPlacement)) return 0;
      const fromRow = getPlacementRow(intent.fromPlacement);
      const toRow = getPlacementRow(intent.toPlacement);
      if (fromRow && toRow) {
        if (fromRow === toRow) {
          return INTENT_AP_COSTS.pawnMoveSameRow ?? INTENT_AP_COSTS.pawnMove ?? 0;
        }
        if (fromRow === "hub" && toRow === "env") {
          return INTENT_AP_COSTS.pawnMoveHubToEnv ?? INTENT_AP_COSTS.pawnMove ?? 0;
        }
        if (fromRow === "env" && toRow === "hub") {
          return INTENT_AP_COSTS.pawnMoveEnvToHub ?? INTENT_AP_COSTS.pawnMove ?? 0;
        }
      }
      return INTENT_AP_COSTS.pawnMove ?? 0;
    },
    describeIntent(intent, ctx) {
      return formatPawnMoveDescription(intent, ctx);
    },
    describeAction(action, ctx) {
      const payload = action?.payload || {};
      const resolvePlacementFromPayload = ctx?.resolvePlacementFromPayload;
      return formatPawnMoveDescription(
        {
          pawnId: payload.pawnId,
          toPlacement: resolvePlacementFromPayload?.(payload) ?? payload.toPlacement ?? null,
        },
        ctx
      );
    },
    shouldLogIntent() {
      return true;
    },
    shouldLogAction() {
      return true;
    },
  }),
  createRegistryEntry({
    intentKind: IntentKinds.BUILD_DESIGNATE,
    actionKind: ActionKinds.BUILD_DESIGNATE,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const buildKey = payload.buildKey ?? payload.targetKey ?? null;
      if (buildKey == null) return null;
      const subjectKey = `build:${buildKey}`;
      return makeBuildDesignateIntent({
        id: subjectKey,
        subjectKey,
        buildKey,
        defId: payload.defId ?? null,
        target: payload.target ?? null,
        apCostOverride: ctx?.normalizeApCost?.(action?.apCost ?? payload.apCost) ?? 0,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      return {
        kind: ActionKinds.BUILD_DESIGNATE,
        payload: {
          buildKey: intent.buildKey,
          defId: intent.defId ?? null,
          target: intent.target ?? null,
        },
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      if (Number.isFinite(intent.apCostOverride)) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      return INTENT_AP_COSTS.buildDesignate ?? 0;
    },
    describeIntent(intent) {
      return `Build ${intent?.defId || intent?.buildKey || "Plan"}`;
    },
    describeAction(action) {
      const payload = action?.payload || {};
      return `Build ${payload.defId || payload.buildKey || "Plan"}`;
    },
    shouldLogIntent() {
      return true;
    },
    shouldLogAction() {
      return true;
    },
  }),
  createRegistryEntry({
    intentKind: IntentKinds.TILE_TAG_ORDER,
    actionKind: ActionKinds.SET_TILE_TAG_ORDER,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const envCol = payload.envCol ?? null;
      if (!Number.isFinite(envCol)) return null;
      const col = Math.floor(envCol);
      const subjectKey = `tileTags:${col}`;
      const tagIds = ctx?.normalizeTagList?.(payload.tagIds ?? payload.tags) ?? [];
      return makeTileTagOrderIntent({
        id: subjectKey,
        subjectKey,
        envCol: col,
        tagIds,
        baselineTags: tagIds,
        apCostOverride: ctx?.normalizeApCost?.(action?.apCost ?? payload.apCost) ?? 0,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      if (!Number.isFinite(intent?.envCol)) return null;
      return {
        kind: ActionKinds.SET_TILE_TAG_ORDER,
        payload: {
          envCol: Math.floor(intent.envCol),
          tagIds: Array.isArray(intent.tagIds) ? intent.tagIds.slice() : [],
        },
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      if (Number.isFinite(intent.apCostOverride)) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      if (tagsEqual(intent.tagIds, intent.baselineTags)) return 0;
      return INTENT_AP_COSTS.tileTagOrder ?? 0;
    },
    getIntentPlanGroup(intent) {
      return createTilePlanGroup(intent?.envCol);
    },
    getActionPlanGroup(action) {
      const payload = action?.payload || {};
      return createTilePlanGroup(payload.envCol ?? payload.toEnvCol);
    },
    getIntentPlanSignature(intent) {
      const tags = Array.isArray(intent?.tagIds) ? intent.tagIds : [];
      return `order:${tags.join(",")}`;
    },
    describeIntent(intent, ctx) {
      return `Tags > ${ctx?.formatTileName?.(intent?.envCol, ctx?.state)}`;
    },
    describeAction(action, ctx) {
      const payload = action?.payload || {};
      return `Tags > ${ctx?.formatTileName?.(payload.envCol, ctx?.state)}`;
    },
    shouldLogIntent(intent, cost) {
      return cost > 0;
    },
    shouldLogAction(action, cost) {
      return cost > 0;
    },
  }),
  createRegistryEntry({
    intentKind: IntentKinds.HUB_TAG_ORDER,
    actionKind: ActionKinds.SET_HUB_TAG_ORDER,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const hubCol = payload.hubCol ?? null;
      if (!Number.isFinite(hubCol)) return null;
      const col = Math.floor(hubCol);
      const subjectKey = `hubTags:${col}`;
      const tagIds = ctx?.normalizeTagList?.(payload.tagIds ?? payload.tags) ?? [];
      return makeHubTagOrderIntent({
        id: subjectKey,
        subjectKey,
        hubCol: col,
        tagIds,
        baselineTags: tagIds,
        apCostOverride: ctx?.normalizeApCost?.(action?.apCost ?? payload.apCost) ?? 0,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      if (!Number.isFinite(intent?.hubCol)) return null;
      return {
        kind: ActionKinds.SET_HUB_TAG_ORDER,
        payload: {
          hubCol: Math.floor(intent.hubCol),
          tagIds: Array.isArray(intent.tagIds) ? intent.tagIds.slice() : [],
        },
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      if (Number.isFinite(intent.apCostOverride)) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      if (tagsEqual(intent.tagIds, intent.baselineTags)) return 0;
      return INTENT_AP_COSTS.hubTagOrder ?? INTENT_AP_COSTS.tileTagOrder ?? 0;
    },
    getIntentPlanGroup(intent) {
      return createHubPlanGroup(intent?.hubCol);
    },
    getActionPlanGroup(action) {
      const payload = action?.payload || {};
      return createHubPlanGroup(payload.hubCol ?? payload.toHubCol);
    },
    getIntentPlanSignature(intent) {
      const tags = Array.isArray(intent?.tagIds) ? intent.tagIds : [];
      return `order:${tags.join(",")}`;
    },
    describeIntent(intent, ctx) {
      return `Tags > ${ctx?.formatHubName?.(intent?.hubCol, ctx?.state)}`;
    },
    describeAction(action, ctx) {
      const payload = action?.payload || {};
      return `Tags > ${ctx?.formatHubName?.(payload.hubCol, ctx?.state)}`;
    },
    shouldLogIntent(intent, cost) {
      return cost > 0;
    },
    shouldLogAction(action, cost) {
      return cost > 0;
    },
  }),
  createRegistryEntry({
    intentKind: IntentKinds.TILE_TAG_TOGGLE,
    actionKind: ActionKinds.TOGGLE_TILE_TAG,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const envCol = payload.envCol ?? null;
      const tagId = payload.tagId ?? null;
      if (!Number.isFinite(envCol) || !tagId) return null;
      const col = Math.floor(envCol);
      const subjectKey = `tileTagToggle:${col}:${tagId}`;
      const disabled = payload.disabled === true;
      return makeTileTagToggleIntent({
        id: subjectKey,
        subjectKey,
        envCol: col,
        tagId,
        disabled,
        baselineDisabled: disabled,
        apCostOverride: ctx?.normalizeApCost?.(action?.apCost ?? payload.apCost) ?? 0,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      if (!Number.isFinite(intent?.envCol) || !intent?.tagId) return null;
      return {
        kind: ActionKinds.TOGGLE_TILE_TAG,
        payload: {
          envCol: Math.floor(intent.envCol),
          tagId: intent.tagId,
          disabled: intent.disabled === true,
        },
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      if (Number.isFinite(intent.apCostOverride)) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      if ((intent.disabled ?? null) === (intent.baselineDisabled ?? null)) return 0;
      return INTENT_AP_COSTS.tileTagToggle ?? INTENT_AP_COSTS.tileTagOrder ?? 0;
    },
    getIntentPlanGroup(intent) {
      return createTilePlanGroup(intent?.envCol);
    },
    getActionPlanGroup(action) {
      const payload = action?.payload || {};
      return createTilePlanGroup(payload.envCol ?? payload.toEnvCol);
    },
    getIntentPlanSignature(intent) {
      return `toggle:${intent?.tagId ?? ""}:${intent?.disabled === true}`;
    },
    describeIntent(intent, ctx) {
      return formatTileTagToggleDescription(intent, ctx);
    },
    describeAction(action, ctx) {
      return formatTileTagToggleDescription(action?.payload || {}, ctx);
    },
    shouldLogIntent(intent, cost) {
      return cost > 0;
    },
    shouldLogAction(action, cost) {
      return cost > 0;
    },
  }),
  createRegistryEntry({
    intentKind: IntentKinds.HUB_TAG_TOGGLE,
    actionKind: ActionKinds.TOGGLE_HUB_TAG,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const hubCol = payload.hubCol ?? null;
      const tagId = payload.tagId ?? null;
      if (!Number.isFinite(hubCol) || !tagId) return null;
      const col = Math.floor(hubCol);
      const subjectKey = `hubTagToggle:${col}:${tagId}`;
      const disabled = payload.disabled === true;
      return makeHubTagToggleIntent({
        id: subjectKey,
        subjectKey,
        hubCol: col,
        tagId,
        disabled,
        baselineDisabled: disabled,
        apCostOverride: ctx?.normalizeApCost?.(action?.apCost ?? payload.apCost) ?? 0,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      if (!Number.isFinite(intent?.hubCol) || !intent?.tagId) return null;
      return {
        kind: ActionKinds.TOGGLE_HUB_TAG,
        payload: {
          hubCol: Math.floor(intent.hubCol),
          tagId: intent.tagId,
          disabled: intent.disabled === true,
        },
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      if (Number.isFinite(intent.apCostOverride)) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      if ((intent.disabled ?? null) === (intent.baselineDisabled ?? null)) return 0;
      return INTENT_AP_COSTS.hubTagToggle ?? INTENT_AP_COSTS.hubTagOrder ?? 0;
    },
    getIntentPlanGroup(intent) {
      return createHubPlanGroup(intent?.hubCol);
    },
    getActionPlanGroup(action) {
      const payload = action?.payload || {};
      return createHubPlanGroup(payload.hubCol ?? payload.toHubCol);
    },
    getIntentPlanSignature(intent) {
      return `toggle:${intent?.tagId ?? ""}:${intent?.disabled === true}`;
    },
    describeIntent(intent, ctx) {
      return formatHubTagToggleDescription(intent, ctx);
    },
    describeAction(action, ctx) {
      return formatHubTagToggleDescription(action?.payload || {}, ctx);
    },
    shouldLogIntent(intent, cost) {
      return cost > 0;
    },
    shouldLogAction(action, cost) {
      return cost > 0;
    },
  }),
  createRegistryEntry({
    intentKind: IntentKinds.TILE_CROP_SELECT,
    actionKind: ActionKinds.SET_TILE_CROP_SELECTION,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const envCol = payload.envCol ?? null;
      if (!Number.isFinite(envCol)) return null;
      const col = Math.floor(envCol);
      const subjectKey = `tileCrop:${col}`;
      const recipePriority = ctx?.normalizeRecipePriorityPayload?.(
        {
          recipePriority: payload.recipePriority,
          recipeId: ctx?.normalizeCropId?.(payload.cropId),
        },
        { systemId: "growth", state: ctx?.state }
      );
      return makeTileCropSelectIntent({
        id: subjectKey,
        subjectKey,
        envCol: col,
        recipePriority,
        baselineRecipePriority: recipePriority,
        apCostOverride: ctx?.normalizeApCost?.(action?.apCost ?? payload.apCost) ?? 0,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      if (!Number.isFinite(intent?.envCol)) return null;
      return {
        kind: ActionKinds.SET_TILE_CROP_SELECTION,
        payload: {
          envCol: Math.floor(intent.envCol),
          cropId: intent.cropId ?? null,
          recipePriority: ctx?.cloneRecipePriority?.(intent.recipePriority) ?? intent.recipePriority,
        },
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      if (Number.isFinite(intent.apCostOverride)) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      if (recipePrioritiesEqual(intent.recipePriority, intent.baselineRecipePriority)) {
        return 0;
      }
      return INTENT_AP_COSTS.tileCropSelect ?? 0;
    },
    getIntentPlanGroup(intent) {
      return createTilePlanGroup(intent?.envCol);
    },
    getActionPlanGroup(action) {
      const payload = action?.payload || {};
      return createTilePlanGroup(payload.envCol ?? payload.toEnvCol);
    },
    getIntentPlanSignature(intent, ctx) {
      const priority = ctx?.normalizeRecipePriorityForLog?.(
        "growth",
        intent?.recipePriority,
        intent?.cropId ?? null
      );
      const signature = ctx?.buildRecipePrioritySignature?.(priority);
      return `crop:${signature ?? ""}`;
    },
    describeIntent(intent, ctx) {
      return formatTileCropDescription(intent, ctx);
    },
    describeAction(action, ctx) {
      return formatTileCropDescription(action?.payload || {}, ctx);
    },
    shouldLogIntent(intent, cost) {
      return cost > 0;
    },
    shouldLogAction(action, cost) {
      return cost > 0;
    },
  }),
  createRegistryEntry({
    intentKind: IntentKinds.HUB_RECIPE_SELECT,
    actionKind: ActionKinds.SET_HUB_RECIPE_SELECTION,
    decodeTimelineAction(action, ctx = {}) {
      const payload = action?.payload || {};
      const hubCol = payload.hubCol ?? null;
      const systemId = payload.systemId ?? null;
      if (!Number.isFinite(hubCol) || !systemId) return null;
      const col = Math.floor(hubCol);
      const subjectKey = `hubRecipe:${col}:${systemId}`;
      const recipePriority = ctx?.normalizeRecipePriorityPayload?.(
        {
          recipePriority: payload.recipePriority,
          recipeId: ctx?.normalizeRecipeId?.(payload.recipeId),
        },
        { systemId, state: ctx?.state }
      );
      return makeHubRecipeSelectIntent({
        id: subjectKey,
        subjectKey,
        hubCol: col,
        systemId,
        recipePriority,
        baselineRecipePriority: recipePriority,
        apCostOverride: ctx?.normalizeApCost?.(action?.apCost ?? payload.apCost) ?? 0,
        source: "timeline",
      });
    },
    encodeIntentToAction(intent, ctx = {}) {
      if (!Number.isFinite(intent?.hubCol) || !intent?.systemId) return null;
      return {
        kind: ActionKinds.SET_HUB_RECIPE_SELECTION,
        payload: {
          hubCol: Math.floor(intent.hubCol),
          systemId: intent.systemId,
          recipePriority: ctx?.cloneRecipePriority?.(intent.recipePriority) ?? intent.recipePriority,
        },
        apCost: resolveIntentApCost(intent, ctx),
      };
    },
    estimateIntentApCost(intent, { stateStart } = {}) {
      if (!intent || typeof intent !== "object") return 0;
      if (stateStart?.variantFlags?.actionPointCostsEnabled === false) return 0;
      if (Number.isFinite(intent.apCostOverride)) {
        return Math.max(0, Math.floor(intent.apCostOverride));
      }
      if (recipePrioritiesEqual(intent.recipePriority, intent.baselineRecipePriority)) {
        return 0;
      }
      return INTENT_AP_COSTS.hubRecipeSelect ?? INTENT_AP_COSTS.hubPlan ?? 0;
    },
    getIntentPlanGroup(intent) {
      return createHubPlanGroup(intent?.hubCol);
    },
    getActionPlanGroup(action) {
      const payload = action?.payload || {};
      return createHubPlanGroup(payload.hubCol ?? payload.toHubCol);
    },
    getIntentPlanSignature(intent, ctx) {
      const priority = ctx?.normalizeRecipePriorityForLog?.(
        intent?.systemId ?? null,
        intent?.recipePriority,
        intent?.recipeId ?? null
      );
      const signature = ctx?.buildRecipePrioritySignature?.(priority);
      return `recipe:${intent?.systemId ?? ""}:${signature ?? ""}`;
    },
    describeIntent(intent, ctx) {
      return formatHubRecipeDescription(intent, ctx);
    },
    describeAction(action, ctx) {
      return formatHubRecipeDescription(action?.payload || {}, ctx);
    },
    shouldLogIntent(intent, cost) {
      return cost > 0;
    },
    shouldLogAction(action, cost) {
      return cost > 0;
    },
  }),
  createRegistryEntry({
    actionKind: ActionKinds.BUILD_CANCEL,
    describeAction(action, ctx) {
      const payload = action?.payload || {};
      const hubCol = Number.isFinite(payload.hubCol) ? Math.floor(payload.hubCol) : null;
      const hubName = hubCol != null ? ctx?.formatHubName?.(hubCol, ctx?.state) : "Hub";
      const defName =
        ctx?.formatBuildCancelDefName?.(payload.defId) ??
        payload.defName ??
        payload.defId ??
        "Structure";
      return `Cancel ${defName} @ ${hubName}`;
    },
    shouldLogAction() {
      return true;
    },
  }),
  createRegistryEntry({
    actionKind: ActionKinds.UNLOCK_SKILL_NODE,
    describeAction(action, ctx) {
      const payload = action?.payload || {};
      const leaderPawnId =
        payload.leaderPawnId != null
          ? payload.leaderPawnId
          : payload.pawnId != null
            ? payload.pawnId
            : null;
      const pawnName = ctx?.formatPawnName?.(leaderPawnId, ctx?.state);
      const skillName = ctx?.formatSkillNodeName?.(payload.nodeId);
      return `Skill > ${pawnName}: ${skillName}`;
    },
    shouldLogAction() {
      return true;
    },
  }),
];

const ENTRY_BY_INTENT_KIND = new Map();
const ENTRY_BY_ACTION_KIND = new Map();
for (const entry of PLANNER_ACTION_ENTRIES) {
  if (entry.intentKind) ENTRY_BY_INTENT_KIND.set(entry.intentKind, entry);
  if (entry.actionKind) ENTRY_BY_ACTION_KIND.set(entry.actionKind, entry);
}

export function getActionPlanEntryByIntentKind(kind) {
  return ENTRY_BY_INTENT_KIND.get(kind) ?? null;
}

export function getActionPlanEntryByActionKind(kind) {
  return ENTRY_BY_ACTION_KIND.get(kind) ?? null;
}

export function decodeTimelineActionToIntent(action, ctx = {}) {
  const entry = getActionPlanEntryByActionKind(action?.kind);
  if (!entry?.decodeTimelineAction) return null;
  return entry.decodeTimelineAction(action, ctx);
}

export function encodeIntentToPlannerAction(intent, ctx = {}) {
  const entry = getActionPlanEntryByIntentKind(intent?.kind);
  if (!entry?.encodeIntentToAction) return null;
  return entry.encodeIntentToAction(intent, ctx);
}

export function estimatePlannerIntentApCost(intent, ctx = {}) {
  const entry = getActionPlanEntryByIntentKind(intent?.kind);
  if (!entry?.estimateIntentApCost) return 0;
  return entry.estimateIntentApCost(intent, ctx);
}

export function getCurrencyGroupInfoForIntent(intent) {
  const entry = getActionPlanEntryByIntentKind(intent?.kind);
  return entry?.getCurrencyGroupInfoForIntent?.(intent) ?? null;
}

export function getCurrencyGroupInfoForAction(action) {
  const entry = getActionPlanEntryByActionKind(action?.kind);
  return entry?.getCurrencyGroupInfoForAction?.(action) ?? null;
}

export function getIntentPlanGroup(intent) {
  const entry = getActionPlanEntryByIntentKind(intent?.kind);
  return entry?.getIntentPlanGroup?.(intent) ?? null;
}

export function getActionPlanGroup(action) {
  const entry = getActionPlanEntryByActionKind(action?.kind);
  return entry?.getActionPlanGroup?.(action) ?? null;
}

export function getPlannerIntentPlanSignature(intent, ctx = {}) {
  const entry = getActionPlanEntryByIntentKind(intent?.kind);
  return entry?.getIntentPlanSignature?.(intent, ctx) ?? "";
}

export function describePlannerIntent(intent, ctx = {}) {
  const entry = getActionPlanEntryByIntentKind(intent?.kind);
  if (!entry?.describeIntent) return intent?.kind || "Action";
  return entry.describeIntent(intent, ctx);
}

export function describePlannerAction(action, ctx = {}) {
  const entry = getActionPlanEntryByActionKind(action?.kind);
  if (!entry?.describeAction) return action?.kind || "Action";
  return entry.describeAction(action, ctx);
}

export function shouldLogPlannerIntent(intent, cost) {
  const entry = getActionPlanEntryByIntentKind(intent?.kind);
  return entry?.shouldLogIntent?.(intent, cost) === true;
}

export function shouldLogPlannerAction(action, cost) {
  const entry = getActionPlanEntryByActionKind(action?.kind);
  return entry?.shouldLogAction?.(action, cost) === true;
}

export function isTilePlanIntent(intent) {
  return getIntentPlanGroup(intent)?.scope === "tile";
}

export function isHubPlanIntent(intent) {
  return getIntentPlanGroup(intent)?.scope === "hub";
}

export function isTilePlanAction(action) {
  return getActionPlanGroup(action)?.scope === "tile";
}

export function isHubPlanAction(action) {
  return getActionPlanGroup(action)?.scope === "hub";
}

export function getTilePlanAnchorCost() {
  return getTilePlanCost();
}

export function getHubPlanAnchorCost() {
  return getHubPlanCost();
}

export function getPlannerIntentId(intent) {
  return getIntentId(intent);
}

export function getPlannerActionApCost(action) {
  return normalizeActionApCost(action);
}

export function getPlannerActionEntries() {
  return PLANNER_ACTION_ENTRIES.slice();
}

export { getItemQuantity };
