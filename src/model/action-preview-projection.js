import { collectActionTouchedTargets } from "./action-target-metadata.js";
import { canonicalizeSnapshot } from "./canonicalize.js";
import {
  advanceReplayStateToSecond,
  applyReplayActionsAtSecond,
} from "./replay-second-runner.js";
import { deserializeGameState, serializeGameState } from "./state.js";

function cloneState(state) {
  return deserializeGameState(serializeGameState(state));
}

function cloneStateData(stateData) {
  return deserializeGameState(stateData);
}

function normalizeBucketSec(entry) {
  if (Number.isFinite(entry?.tSec)) return Math.max(0, Math.floor(entry.tSec));
  if (Number.isFinite(entry?.sec)) return Math.max(0, Math.floor(entry.sec));
  if (Number.isFinite(entry?.second)) return Math.max(0, Math.floor(entry.second));
  const firstAction = Array.isArray(entry?.actions) ? entry.actions[0] : null;
  if (Number.isFinite(firstAction?.tSec)) {
    return Math.max(0, Math.floor(firstAction.tSec));
  }
  return 0;
}

function cloneAction(action) {
  if (!action || typeof action !== "object") return null;
  return {
    ...action,
    payload:
      action.payload && typeof action.payload === "object"
        ? JSON.parse(JSON.stringify(action.payload))
        : action.payload ?? null,
  };
}

function normalizeActionBuckets(actionsBySecond) {
  const bucketsBySec = new Map();
  const input = Array.isArray(actionsBySecond) ? actionsBySecond : [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    if (Array.isArray(entry.actions)) {
      const sec = normalizeBucketSec(entry);
      const list = bucketsBySec.get(sec) || [];
      for (const action of entry.actions) {
        const cloned = cloneAction(action);
        if (!cloned?.kind) continue;
        cloned.tSec = sec;
        list.push(cloned);
      }
      if (list.length > 0) bucketsBySec.set(sec, list);
      continue;
    }

    if (!entry.kind) continue;
    const sec = Number.isFinite(entry.tSec) ? Math.max(0, Math.floor(entry.tSec)) : 0;
    const cloned = cloneAction(entry);
    if (!cloned) continue;
    cloned.tSec = sec;
    const list = bucketsBySec.get(sec) || [];
    list.push(cloned);
    bucketsBySec.set(sec, list);
  }

  return Array.from(bucketsBySec.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([tSec, actions]) => ({ tSec, actions }));
}

function createTouchedTargets() {
  return {
    ownerIds: new Set(),
    pawnIds: new Set(),
    envCols: new Set(),
    hubCols: new Set(),
  };
}

function addTouchedTarget(set, value) {
  if (value == null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    set.add(Math.floor(value));
    return;
  }
  set.add(value);
}

function collectResultTouchedTargets(result, touchedTargets) {
  addTouchedTarget(touchedTargets.ownerIds, result?.fromOwnerId);
  addTouchedTarget(touchedTargets.ownerIds, result?.toOwnerId);
  addTouchedTarget(touchedTargets.ownerIds, result?.ownerId);
  addTouchedTarget(touchedTargets.pawnIds, result?.pawnId);
  addTouchedTarget(touchedTargets.envCols, result?.envCol);
  addTouchedTarget(touchedTargets.hubCols, result?.hubCol);
}

function advanceStateToSecond(state, targetSec) {
  return advanceReplayStateToSecond(state, targetSec);
}

function projectIntoState(projectedState, buckets) {
  const actionResults = [];
  const touchedTargets = createTouchedTargets();
  let startSec = null;
  let endSec = null;

  canonicalizeSnapshot(projectedState);

  for (const bucket of buckets) {
    if (!bucket || !Array.isArray(bucket.actions) || bucket.actions.length <= 0) continue;
    const sec = Math.max(0, Math.floor(bucket.tSec ?? 0));
    const advanceRes = advanceStateToSecond(projectedState, sec);
    if (!advanceRes?.ok) {
      return {
        ok: false,
        reason: advanceRes?.reason ?? "advanceFailed",
        projectedState,
        actionResults,
        touchedTargets,
        appliedSecondRange:
          startSec == null ? null : { startSec, endSec: endSec ?? startSec },
      };
    }

    if (startSec == null) startSec = sec;
    endSec = sec;

    for (const action of bucket.actions) {
      collectActionTouchedTargets(action, touchedTargets);
      const replayRes = applyReplayActionsAtSecond(projectedState, [action], sec);
      const result = replayRes?.ok
        ? replayRes.result ?? { ok: true }
        : {
            ok: false,
            reason: replayRes?.reason ?? "actionFailed",
            detail: replayRes?.detail ?? null,
          };
      actionResults.push({
        action,
        result,
      });
      if (!result?.ok) {
        return {
          ok: false,
          reason: result?.reason ?? "actionFailed",
          detail: result ?? null,
          projectedState,
          actionResults,
          touchedTargets,
          appliedSecondRange:
            startSec == null ? null : { startSec, endSec: endSec ?? startSec },
        };
      }
      collectResultTouchedTargets(result, touchedTargets);
    }

    canonicalizeSnapshot(projectedState, sec);
  }

  return {
    ok: true,
    projectedState,
    actionResults,
    touchedTargets,
    appliedSecondRange:
      startSec == null ? null : { startSec, endSec: endSec ?? startSec },
  };
}

export function projectActionsFromBoundaryStateData({
  boundaryStateData,
  actionsBySecond,
} = {}) {
  if (boundaryStateData == null) return { ok: false, reason: "noBoundaryStateData" };
  const baselineState = cloneStateData(boundaryStateData);
  const projectedState = cloneStateData(boundaryStateData);
  canonicalizeSnapshot(baselineState);
  const buckets = normalizeActionBuckets(actionsBySecond);
  const projection = projectIntoState(projectedState, buckets);
  return {
    ...projection,
    baselineState,
  };
}

export function projectActionsFromState({ state, actionsBySecond } = {}) {
  if (!state || typeof state !== "object") return { ok: false, reason: "noState" };
  const baselineState = cloneState(state);
  const projectedState = cloneState(state);
  canonicalizeSnapshot(baselineState);
  const buckets = normalizeActionBuckets(actionsBySecond);
  const projection = projectIntoState(projectedState, buckets);
  return {
    ...projection,
    baselineState,
  };
}
