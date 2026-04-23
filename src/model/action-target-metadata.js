import { ActionKinds } from "./actions.js";

function addTouchedTarget(set, value) {
  if (value == null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    set.add(Math.floor(value));
    return;
  }
  set.add(value);
}

const ACTION_TARGET_ENTRIES = {
  [ActionKinds.INVENTORY_MOVE]: {
    collect(action, touchedTargets) {
      const payload = action?.payload || {};
      addTouchedTarget(touchedTargets.ownerIds, payload.fromOwnerId);
      addTouchedTarget(
        touchedTargets.ownerIds,
        payload.toPlacement?.ownerId ?? payload.toOwnerId
      );
    },
  },
  [ActionKinds.PLACE_PAWN]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.pawnIds, action?.payload?.pawnId);
    },
  },
  [ActionKinds.ADJUST_FOLLOWER_COUNT]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.pawnIds, action?.payload?.leaderId);
    },
  },
  [ActionKinds.ADJUST_WORKER_COUNT]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.pawnIds, action?.payload?.leaderId);
    },
  },
  [ActionKinds.SET_TILE_TAG_ORDER]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.envCols, action?.payload?.envCol);
    },
  },
  [ActionKinds.TOGGLE_TILE_TAG]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.envCols, action?.payload?.envCol);
    },
  },
  [ActionKinds.SET_TILE_CROP_SELECTION]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.envCols, action?.payload?.envCol);
    },
  },
  [ActionKinds.SET_HUB_TAG_ORDER]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.hubCols, action?.payload?.hubCol);
    },
  },
  [ActionKinds.TOGGLE_HUB_TAG]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.hubCols, action?.payload?.hubCol);
    },
  },
  [ActionKinds.SET_HUB_RECIPE_SELECTION]: {
    collect(action, touchedTargets) {
      addTouchedTarget(touchedTargets.hubCols, action?.payload?.hubCol);
    },
  },
  [ActionKinds.BUILD_DESIGNATE]: {
    collect(action, touchedTargets) {
      const payload = action?.payload || {};
      addTouchedTarget(touchedTargets.hubCols, payload.hubCol);
      addTouchedTarget(touchedTargets.hubCols, payload.target?.hubCol);
      addTouchedTarget(touchedTargets.hubCols, payload.target?.col);
    },
  },
};

export function collectActionTouchedTargets(action, touchedTargets) {
  const entry = ACTION_TARGET_ENTRIES[action?.kind];
  if (!entry?.collect) return;
  entry.collect(action, touchedTargets);
}
