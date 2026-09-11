import { ActionKinds } from "../../model/actions.js";
import {
  buildDetailedVassalSelectionPool,
  replaceDetailedVassalSelectionCandidate,
} from "../../model/detailed-settlements.js";
import {
  getCurrentLifeMapVassal,
  getVassalPendingResolution,
} from "../../model/vassal-life-map.js";

export const SETTLEMENT_VASSAL_GRAPH_REPLACE_TRANSITION_MS = 1500;
export const SETTLEMENT_VASSAL_GRAPH_REPLACE_FLASH_MS = 360;
export const SETTLEMENT_VASSAL_GRAPH_REPLACE_FADE_STRENGTH = 0.5;

export function createSettlementVassalFlow({
  getRunner,
  playback,
  getForecastController,
  getGraphController,
  getGraphView,
  getChooserView,
  getWorldMapView,
  getLifeMapView,
  getNodeDecisionView,
  getLevelUpView,
  getPrototypeView,
  getNavigationView,
  requestPause,
  setWorldViewMode,
  setSelectedWorldRegionId,
  isRunComplete,
  revealCivilizationAfterVassalEnd,
  onInvalidateProjectedLoss,
  onSyncGraphHorizon,
  getLossInfoForDisplay,
} = {}) {
  let settlementPendingVassalSelection = null;
  let settlementHoveredVassalCandidate = null;
  let settlementSelectedVassalCandidateIndex = null;
  let settlementVassalSelectionWasOpen = false;
  let settlementVassalSelectionResumeSpeed = 0;
  let settlementLastVassalSelectionResult = null;

  function shouldResumeAfterBlockingVassalSelection(
    state = playback.getSettlementAuthoritativeState()
  ) {
    return playback.getSettlementPlaybackTarget() !== 0;
  }

  function syncSettlementVassalSelectionPauseState() {
    const selectionOpen = !!settlementPendingVassalSelection;
    if (selectionOpen && !settlementVassalSelectionWasOpen) {
      if (!Number.isFinite(settlementVassalSelectionResumeSpeed)) {
        settlementVassalSelectionResumeSpeed = 0;
      }
      if (settlementVassalSelectionResumeSpeed === 0) {
        settlementVassalSelectionResumeSpeed = shouldResumeAfterBlockingVassalSelection()
          ? playback.getSettlementPlaybackTarget()
          : 0;
      }
      requestPause?.();
    }
    if (!selectionOpen && settlementVassalSelectionWasOpen) {
      const resumeSpeed = Number.isFinite(settlementVassalSelectionResumeSpeed)
        ? settlementVassalSelectionResumeSpeed
        : 0;
      settlementVassalSelectionResumeSpeed = 0;
      if (resumeSpeed !== 0) {
        playback.setSettlementPlaybackTarget(resumeSpeed);
      }
    }
    settlementVassalSelectionWasOpen = selectionOpen;
    return selectionOpen;
  }

  function closeSettlementVassalSelection() {
    if (!settlementPendingVassalSelection) return { ok: false, reason: "missingSelectionPool" };
    settlementPendingVassalSelection = null;
    settlementHoveredVassalCandidate = null;
    settlementSelectedVassalCandidateIndex = null;
    settlementVassalSelectionResumeSpeed = 0;
    getGraphView?.()?.clearProjectionReplacementTransition?.();
    getWorldMapView?.()?.refresh?.();
    getChooserView?.()?.refresh?.();
    syncSettlementVassalSelectionPauseState();
    return { ok: true };
  }

  function openLifeMapVassalSelection() {
    const runner = getRunner?.();
    settlementLastVassalSelectionResult = null;
    const state = playback.getSettlementFrontierState();
    if (isRunComplete?.(state)) return { ok: false, reason: "runComplete" };
    if (getCurrentLifeMapVassal(state)) return { ok: false, reason: "currentVassalAlive" };
    setWorldViewMode?.("map");
    requestPause?.();
    runner.clearPreviewState?.();
    getGraphView?.()?.resetForecastPreviewState?.();
    settlementPendingVassalSelection = buildDetailedVassalSelectionPool(state);
    settlementHoveredVassalCandidate = null;
    settlementSelectedVassalCandidateIndex = null;
    getChooserView?.()?.refresh?.();
    syncSettlementVassalSelectionPauseState();
    return settlementPendingVassalSelection
      ? { ok: true, poolId: settlementPendingVassalSelection.poolId }
      : { ok: false, reason: "poolFailed" };
  }

  function dispatchLifeMapAction(kind, payload = {}) {
    const runner = getRunner?.();
    if (playback.getSettlementViewedSec() !== playback.getSettlementFrontierSec()) {
      getNavigationView?.()?.showReadOnlyFeedback?.();
      return { ok: false, reason: "readOnlyTimeline" };
    }
    requestPause?.();
    const activeVassalId = getCurrentLifeMapVassal(playback.getSettlementFrontierState())?.vassalId ?? null;
    const result = runner.dispatchActionAtCurrentSecond?.(kind, payload, {
      reason: `vassalLife:${kind}`,
    }) ?? { ok: false, reason: "dispatchFailed" };
    if (!result.ok) return result;
    onInvalidateProjectedLoss?.();
    const state = playback.getSettlementFrontierState();
    const vassalEndedImmediately = revealCivilizationAfterVassalEnd?.(activeVassalId, state);
    const pending = getVassalPendingResolution(state);
    if (!vassalEndedImmediately && pending?.resolveSec > playback.getSettlementFrontierSec()) {
      getForecastController?.()?.schedulePendingCommit?.(
        playback.getSettlementFrontierSec(),
        getCurrentLifeMapVassal(state)
      );
      onSyncGraphHorizon?.();
      getGraphView?.()?.restartForecastRevealFrom?.(playback.getSettlementFrontierSec(), {
        allowForecastStart: true,
        revealTargetEndSec: pending.resolveSec,
      });
    }
    getLifeMapView?.()?.refresh?.();
    getNodeDecisionView?.()?.refresh?.();
    getLevelUpView?.()?.refresh?.();
    getWorldMapView?.()?.refresh?.();
    getPrototypeView?.()?.refresh?.();
    return result;
  }

  function selectLifeMapCandidate(candidateIndex) {
    const pool = settlementPendingVassalSelection;
    if (!pool) return { ok: false, reason: "missingSelectionPool" };
    const candidate = pool.candidates?.[candidateIndex] ?? null;
    const selectionSec = playback.getSettlementFrontierSec();
    const priorLoss = getLossInfoForDisplay?.();
    const priorCoverageSec = getGraphController?.()?.getData?.()?.forecastCoverageEndSec;
    getGraphView?.()?.stageProjectionReplacementTransition?.({
      truncationStartSec: selectionSec,
      maxSecFloor: Number.isFinite(priorLoss?.lossSec)
        ? priorLoss.lossSec
        : priorCoverageSec,
      transitionDurationMs: SETTLEMENT_VASSAL_GRAPH_REPLACE_TRANSITION_MS,
      flashDurationMs: SETTLEMENT_VASSAL_GRAPH_REPLACE_FLASH_MS,
      fadeStrength: SETTLEMENT_VASSAL_GRAPH_REPLACE_FADE_STRENGTH,
    });
    const result = dispatchLifeMapAction(ActionKinds.SETTLEMENT_SELECT_VASSAL, {
      candidateIndex,
      expectedPoolHash: pool.expectedPoolHash,
      candidateOverride: candidate?.debugInjected === true ? candidate : null,
    });
    settlementLastVassalSelectionResult = result;
    if (result.ok) {
      if (candidate?.locationRegionId) setSelectedWorldRegionId?.(candidate.locationRegionId);
      settlementPendingVassalSelection = null;
      settlementHoveredVassalCandidate = null;
      settlementSelectedVassalCandidateIndex = null;
      syncSettlementVassalSelectionPauseState();
      onSyncGraphHorizon?.();
      getGraphView?.()?.restartForecastRevealFrom?.(selectionSec, {
        allowForecastStart: true,
        revealTargetEndSec: selectionSec,
        activateProjectionReplacementTransition: true,
      });
      setWorldViewMode?.("vassalLife");
    } else if (result.reason === "selectionPoolMismatch") {
      settlementPendingVassalSelection = buildDetailedVassalSelectionPool(playback.getSettlementFrontierState());
      settlementHoveredVassalCandidate = null;
      settlementSelectedVassalCandidateIndex = null;
      getChooserView?.()?.refresh?.();
    }
    return result;
  }

  function previewLifeMapCandidate(candidateIndex) {
    const candidate = settlementPendingVassalSelection?.candidates?.[candidateIndex] ?? null;
    if (!candidate) return { ok: false, reason: "invalidCandidate" };
    settlementSelectedVassalCandidateIndex = candidateIndex;
    settlementHoveredVassalCandidate = candidate;
    getChooserView?.()?.refresh?.();
    getWorldMapView?.()?.refresh?.();
    return { ok: true, candidateIndex };
  }

  function rerollLifeMapCandidates() {
    if (!settlementPendingVassalSelection) return { ok: false, reason: "missingSelectionPool" };
    const result = dispatchLifeMapAction(ActionKinds.SETTLEMENT_REROLL_VASSALS);
    if (result.ok) {
      settlementPendingVassalSelection = buildDetailedVassalSelectionPool(playback.getSettlementFrontierState());
      settlementHoveredVassalCandidate = null;
      settlementSelectedVassalCandidateIndex = null;
      getChooserView?.()?.refresh?.();
    }
    return result;
  }

  function replaceSettlementVassalCandidate(candidateIndex, spec) {
    if (!settlementPendingVassalSelection) {
      const opened = openLifeMapVassalSelection();
      if (!opened?.ok) return opened;
    }
    const result = replaceDetailedVassalSelectionCandidate(
      playback.getSettlementFrontierState(),
      settlementPendingVassalSelection,
      candidateIndex,
      spec
    );
    if (!result.ok) return result;
    settlementPendingVassalSelection = result.pool;
    settlementHoveredVassalCandidate = null;
    settlementSelectedVassalCandidateIndex = null;
    getWorldMapView?.()?.refresh?.();
    getChooserView?.()?.refresh?.();
    return { ok: true, candidate: result.pool.candidates[candidateIndex] ?? null };
  }

  function hoverCandidate(candidate) {
    settlementHoveredVassalCandidate = candidate
      ?? settlementPendingVassalSelection?.candidates?.[settlementSelectedVassalCandidateIndex]
      ?? null;
    getWorldMapView?.()?.refresh?.();
  }

  function restorePendingSelection(frontierState, enabled) {
    settlementPendingVassalSelection =
      enabled === true
        ? buildDetailedVassalSelectionPool(frontierState)
        : null;
    getChooserView?.()?.refresh?.();
  }

  function clearPendingSelection() {
    settlementPendingVassalSelection = null;
    settlementHoveredVassalCandidate = null;
    settlementSelectedVassalCandidateIndex = null;
  }

  function resetSelectionForFreshRun() {
    clearPendingSelection();
    settlementLastVassalSelectionResult = null;
  }

  return {
    shouldResumeAfterBlockingVassalSelection,
    syncSettlementVassalSelectionPauseState,
    closeSettlementVassalSelection,
    openLifeMapVassalSelection,
    dispatchLifeMapAction,
    selectLifeMapCandidate,
    previewLifeMapCandidate,
    rerollLifeMapCandidates,
    replaceSettlementVassalCandidate,
    hoverCandidate,
    restorePendingSelection,
    clearPendingSelection,
    resetSelectionForFreshRun,
    getPendingSelection: () => settlementPendingVassalSelection,
    getHoveredCandidate: () => settlementHoveredVassalCandidate,
    getSelectedCandidateIndex: () => settlementSelectedVassalCandidateIndex,
    getLastSelectionResult: () => settlementLastVassalSelectionResult,
  };
}
