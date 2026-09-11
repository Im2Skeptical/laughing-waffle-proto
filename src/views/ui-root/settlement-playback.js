import { resolveVisualTime } from "../timeline-presentation.js";
import {
  getCommittedVassalLifeMapNodeIds,
  getCurrentLifeMapVassal,
  getLifeMapVassalAtSecond,
  getVassalLifeMapPlayheadNodeId,
} from "../../model/vassal-life-map.js";

export function clampSettlementPlaybackSpeed(speed) {
  if (!Number.isFinite(speed)) return 0;
  return Math.max(-4, Math.min(4, Number(speed)));
}

export function createSettlementPlayback({
  getRunner,
  getForecastController,
  getGraphController,
  getGraphView,
  onInvalidateProjectedLoss,
  onSyncGraphHorizon,
} = {}) {
  let settlementPlaybackSpeedTarget = 0;
  let settlementPlaybackSpeedCurrent = 0;
  let settlementPlaybackViewSecFloat = null;
  let settlementPendingPreviewRestoreSec = null;
  let settlementFrontierStateCache = {
    historyEndSec: -1,
    revision: -1,
    state: null,
  };

  function getSettlementPreviewCapSec() {
    const forecastStatus = getForecastController?.()?.getForecastStatus?.() ?? null;
    return Math.max(
      getSettlementFrontierSec(),
      Math.floor(forecastStatus?.browseCapSec ?? getSettlementFrontierSec())
    );
  }

  function getSettlementViewedSec() {
    return Math.max(0, Math.floor(getSettlementViewedState()?.tSec ?? getSettlementFrontierSec()));
  }

  function getSettlementVisualTime() {
    return resolveVisualTime(getSettlementViewedSec(), settlementPlaybackViewSecFloat);
  }

  function ensureSettlementRunnerPaused() {
    const runner = getRunner?.();
    runner.setTimeScaleTarget?.(0, { requestPause: true });
    if (runner.getCursorState?.()?.paused !== true && !(runner.getPreviewStatus?.()?.active)) {
      const currentSec = Math.max(0, Math.floor(runner.getCursorState?.()?.tSec ?? getSettlementFrontierSec()));
      runner.browseCursorSecond?.(currentSec);
    }
  }

  function getSettlementPlaybackTarget() {
    return clampSettlementPlaybackSpeed(settlementPlaybackSpeedTarget);
  }

  function promoteSettlementPreviewToLive() {
    const runner = getRunner?.();
    const preview = runner.getPreviewStatus?.() ?? null;
    if (!preview?.active) return { ok: true, promoted: false };
    if (!preview.isForecastPreview) {
      runner.clearPreviewState?.();
      return { ok: true, promoted: false };
    }

    const targetSec = Math.max(0, Math.floor(preview.previewSec ?? 0));
    const commitRes = runner.commitPreviewToLive?.();
    if (commitRes?.ok !== true) {
      return commitRes ?? { ok: false, reason: "commitPreviewFailed" };
    }
    getGraphView?.()?.resetForecastPreviewState?.();
    onInvalidateProjectedLoss?.();
    onSyncGraphHorizon?.();
    return { ...commitRes, promoted: true, targetSec };
  }

  function setSettlementPlaybackTarget(speed, opts = {}) {
    const runner = getRunner?.();
    const visualSec = getSettlementVisualTime();
    const next = clampSettlementPlaybackSpeed(speed);
    const result = runner.setTimeScaleTarget?.(0, {
      ...opts,
      immediate: true,
      requestPause: true,
    }) ?? {
      ok: false,
      reason: "runnerUnavailable",
    };
    settlementPlaybackSpeedTarget = result?.ok ? next : 0;
    settlementPlaybackSpeedCurrent = settlementPlaybackSpeedTarget;
    settlementPlaybackViewSecFloat = visualSec;
    if (result?.ok) {
      ensureSettlementRunnerPaused();
    }
    return result?.ok
      ? { ...result, target: settlementPlaybackSpeedTarget }
      : result;
  }

  function getSettlementPlaybackState() {
    return {
      current: settlementPlaybackSpeedCurrent,
      target: settlementPlaybackSpeedTarget,
      max: 4,
    };
  }

  function getSettlementAuthoritativeState() {
    const runner = getRunner?.();
    return runner?.getCursorState?.() ?? runner?.getState?.() ?? null;
  }

  function getSettlementViewedState() {
    const runner = getRunner?.();
    return runner?.getState?.() ?? runner?.getCursorState?.() ?? null;
  }

  function getSettlementFrontierSec() {
    return Math.max(0, Math.floor(getRunner?.()?.getTimeline?.()?.historyEndSec ?? 0));
  }

  function getSettlementFrontierState() {
    const runner = getRunner?.();
    const timeline = runner?.getTimeline?.() ?? null;
    const frontierSec = getSettlementFrontierSec();
    const cursorSec = Math.max(0, Math.floor(runner?.getCursorState?.()?.tSec ?? 0));
    const revision = Math.max(0, Math.floor(timeline?.revision ?? 0));
    if (cursorSec === frontierSec) {
      const authoritativeState = getSettlementAuthoritativeState();
      settlementFrontierStateCache = {
        historyEndSec: frontierSec,
        revision,
        state: authoritativeState,
      };
      return authoritativeState;
    }
    if (
      settlementFrontierStateCache.state &&
      settlementFrontierStateCache.historyEndSec === frontierSec &&
      settlementFrontierStateCache.revision === revision
    ) {
      return settlementFrontierStateCache.state;
    }
    const frontierState =
      getGraphController?.()?.getStateAt?.(frontierSec) ??
      getSettlementAuthoritativeState();
    settlementFrontierStateCache = {
      historyEndSec: frontierSec,
      revision,
      state: frontierState,
    };
    return frontierState;
  }

  function getSettlementLifeMapPresentation() {
    const frontierState = getSettlementFrontierState();
    const viewedState = getSettlementViewedState();
    const frontierSec = getSettlementFrontierSec();
    const viewedSec = getSettlementViewedSec();
    const displaySec = Math.min(viewedSec, frontierSec);
    const vassal = getLifeMapVassalAtSecond(frontierState, displaySec);
    if (!vassal) {
      return {
        state: viewedState ?? frontierState,
        vassal: null,
        profileVassal: null,
        viewedSec,
        profileSec: Math.min(viewedSec, frontierSec),
        frontierSec,
        committedNodeIds: [],
        playheadNodeId: null,
        readOnly: true,
      };
    }
    const viewedRecord = viewedSec <= frontierSec
      ? viewedState?.civilization?.vassalLineage?.vassalsById?.[vassal.vassalId] ?? null
      : null;
    const currentVassal = getCurrentLifeMapVassal(frontierState);
    const atPresent = viewedSec === frontierSec;
    const interactive = atPresent && currentVassal?.vassalId === vassal.vassalId;
    return {
      state: viewedRecord ? viewedState : frontierState,
      vassal,
      profileVassal: viewedRecord ?? vassal,
      viewedSec,
      profileSec: viewedRecord ? viewedSec : frontierSec,
      frontierSec,
      committedNodeIds: getCommittedVassalLifeMapNodeIds(vassal),
      playheadNodeId: getVassalLifeMapPlayheadNodeId(vassal, displaySec),
      readOnly: !interactive,
    };
  }

  function commitSettlementViewedSecond(tSec, { stateData: providedStateData = null } = {}) {
    const runner = getRunner?.();
    const frontierSec = getSettlementFrontierSec();
    const previewCapSec = getSettlementPreviewCapSec();
    const boundedTargetSec = Math.max(0, Math.min(Number(tSec ?? 0), previewCapSec));
    const safeTargetSec = Math.floor(boundedTargetSec);
    if (safeTargetSec <= frontierSec) {
      runner.clearPreviewState?.();
      return runner.browseCursorSecond?.(safeTargetSec);
    }

    const preview = runner.getPreviewStatus?.() ?? null;
    if (
      preview?.active === true &&
      preview?.isForecastPreview === true &&
      Math.floor(preview.previewSec ?? -1) === safeTargetSec
    ) {
      const previewCommit = promoteSettlementPreviewToLive();
      if (previewCommit?.ok === true) return previewCommit;
    }

    const stateData =
      providedStateData ?? getGraphController?.()?.getStateDataAt?.(safeTargetSec) ?? null;
    const commitRes = runner.commitCursorSecond?.(safeTargetSec, stateData);
    if (commitRes?.ok !== true) {
      return commitRes ?? { ok: false, reason: "commitFailed" };
    }
    getGraphView?.()?.resetForecastPreviewState?.();
    onInvalidateProjectedLoss?.();
    onSyncGraphHorizon?.();
    return { ...commitRes, tSec: safeTargetSec, promoted: true };
  }

  function previewSettlementViewedSecond(tSec, { respectBrowseCap = true } = {}) {
    const runner = getRunner?.();
    const frontierSec = getSettlementFrontierSec();
    const previewCapSec = getSettlementPreviewCapSec();
    const rawTargetSec = Math.max(0, Number(tSec ?? 0));
    const boundedTargetSec = respectBrowseCap
      ? Math.max(0, Math.min(rawTargetSec, previewCapSec))
      : rawTargetSec;
    const safeTargetSec = Math.floor(boundedTargetSec);
    if (safeTargetSec <= frontierSec) {
      runner.clearPreviewState?.();
      return runner.browseCursorSecond?.(safeTargetSec);
    }
    getGraphController?.()?.ensureForecastCoverageTo?.(safeTargetSec);
    const previewState = getGraphController?.()?.getStateAt?.(safeTargetSec) ?? null;
    if (!previewState) {
      return { ok: false, reason: "previewUnavailable" };
    }
    const cursorSec = Math.max(0, Math.floor(runner.getCursorState?.()?.tSec ?? frontierSec));
    if (cursorSec !== frontierSec) {
      runner.browseCursorSecond?.(frontierSec);
    }
    runner.setPreviewState?.(previewState);
    return { ok: true, tSec: safeTargetSec, preview: true };
  }

  function setSettlementViewedSecond(tSec, { mode = "commit", stateData = null } = {}) {
    const runner = getRunner?.();
    settlementPendingPreviewRestoreSec = null;
    if (mode === "preview") return previewSettlementViewedSecond(tSec);
    if (mode === "browse") {
      const safeTargetSec = Math.max(0, Math.floor(tSec ?? 0));
      if (safeTargetSec > getSettlementFrontierSec()) {
        return previewSettlementViewedSecond(safeTargetSec);
      }
      runner.clearPreviewState?.();
      return runner.browseCursorSecond?.(safeTargetSec);
    }
    return commitSettlementViewedSecond(tSec, { stateData });
  }

  function restoreSettlementPendingPreviewTarget() {
    if (!Number.isFinite(settlementPendingPreviewRestoreSec)) return null;
    const targetSec = Math.max(0, Math.floor(settlementPendingPreviewRestoreSec));
    if (targetSec <= getSettlementFrontierSec()) {
      settlementPendingPreviewRestoreSec = null;
      return null;
    }
    const res = previewSettlementViewedSecond(targetSec, {
      respectBrowseCap: false,
    });
    if (res?.ok === true) {
      settlementPendingPreviewRestoreSec = null;
    }
    return res;
  }

  function updateSettlementPreviewPlayback(frameDt) {
    const speed = clampSettlementPlaybackSpeed(settlementPlaybackSpeedTarget);
    if (speed === 0) return;
    const dt = Number.isFinite(frameDt) ? Math.max(0, Number(frameDt)) : 0;
    const currentFloat = Number.isFinite(settlementPlaybackViewSecFloat)
      ? settlementPlaybackViewSecFloat
      : getSettlementViewedSec();
    const previewCapSec = getSettlementPreviewCapSec();
    const nextFloat = Math.max(0, Math.min(previewCapSec, currentFloat + speed * dt));
    settlementPlaybackViewSecFloat = nextFloat;
    const targetSec = Math.max(0, Math.min(previewCapSec, Math.floor(nextFloat)));
    if (targetSec !== getSettlementViewedSec()) {
      setSettlementViewedSecond(targetSec, { mode: "browse" });
    }
    if (
      (speed > 0 && nextFloat >= previewCapSec) ||
      (speed < 0 && nextFloat <= 0)
    ) {
      setSettlementPlaybackTarget(0);
    }
  }

  function returnSettlementViewToPresent(targetSec = null) {
    const runner = getRunner?.();
    settlementPendingPreviewRestoreSec = null;
    setSettlementPlaybackTarget(0);
    runner.clearPreviewState?.();
    getGraphView?.()?.resetForecastPreviewState?.();
    const frontierSec = getSettlementFrontierSec();
    const safeTargetSec = Number.isFinite(targetSec)
      ? Math.max(0, Math.min(Math.floor(targetSec), frontierSec))
      : frontierSec;
    return runner.browseCursorSecond?.(safeTargetSec);
  }

  function setPendingPreviewRestoreSec(tSec) {
    settlementPendingPreviewRestoreSec = tSec;
  }

  function clearPendingPreviewRestore() {
    settlementPendingPreviewRestoreSec = null;
  }

  return {
    getSettlementPreviewCapSec,
    getSettlementViewedSec,
    getSettlementVisualTime,
    ensureSettlementRunnerPaused,
    getSettlementPlaybackTarget,
    promoteSettlementPreviewToLive,
    setSettlementPlaybackTarget,
    getSettlementPlaybackState,
    getSettlementAuthoritativeState,
    getSettlementViewedState,
    getSettlementFrontierSec,
    getSettlementFrontierState,
    getSettlementLifeMapPresentation,
    commitSettlementViewedSecond,
    previewSettlementViewedSecond,
    setSettlementViewedSecond,
    restoreSettlementPendingPreviewTarget,
    updateSettlementPreviewPlayback,
    returnSettlementViewToPresent,
    setPendingPreviewRestoreSec,
    clearPendingPreviewRestore,
  };
}
