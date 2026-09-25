import { ActionKinds } from "../../model/actions.js";
import {
  buildDetailedVassalSelectionPool,
  replaceDetailedVassalSelectionCandidate,
} from "../../model/detailed-settlements.js";
import { VASSAL_LIFE_TUNING } from "../../defs/gamepieces/vassal-life-map-defs.js";
import {
  formatVassalPhaseDuration,
  getCurrentLifeMapVassal,
  getVassalAge,
  getVassalPendingResolution,
  getVassalNodeResolutionGains,
  hasPendingHeirloomOverflow,
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
  getRecapView,
  getHeirloomFlowView,
  getPrototypeView,
  getNavigationView,
  requestPause,
  setWorldViewMode,
  setSelectedWorldRegionId,
  isRunComplete,
  revealCivilizationAfterVassalEnd,
  onInvalidateProjectedLoss,
  onSyncGraphHorizon,
  isInputLocked = () => false,
  getLossInfoForDisplay,
} = {}) {
  let settlementPendingVassalSelection = null;
  let settlementHoveredVassalCandidate = null;
  let settlementSelectedVassalCandidateIndex = null;
  let settlementVassalSelectionWasOpen = false;
  let settlementVassalSelectionResumeSpeed = 0;
  let settlementLastVassalSelectionResult = null;
  let resolutionRecap = null;

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
    if (isInputLocked()) return { ok: false, reason: "openingReveal" };
    const runner = getRunner?.();
    settlementLastVassalSelectionResult = null;
    const state = playback.getSettlementFrontierState();
    if (isRunComplete?.(state)) return { ok: false, reason: "runComplete" };
    if (hasPendingHeirloomOverflow(state)) return { ok: false, reason: "heirloomOverflowPending" };
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

  function captureResolutionRecap({
    vassalId, beforeState, prestigeIncome, developmentIncome, phaseCost,
    prestigeBefore, expBefore, ageBefore,
  } = {}) {
    const afterState = playback.getSettlementFrontierState();
    const afterVassal = afterState?.civilization?.vassalLineage?.vassalsById?.[vassalId] ?? null;
    const threshold = VASSAL_LIFE_TUNING.developmentThreshold;
    const startPrestige = Number.isFinite(prestigeBefore) ? prestigeBefore : 0;
    const startExp = Number.isFinite(expBefore) ? expBefore : 0;
    const earnedLevelCount = afterVassal?.developmentChoiceQueue?.length
      ?? Math.floor((startExp + (developmentIncome ?? 0)) / threshold);
    resolutionRecap = {
      vassalId,
      timeLabel: formatVassalPhaseDuration(phaseCost ?? 0, beforeState),
      prestigeIncome: prestigeIncome ?? 0,
      developmentIncome: developmentIncome ?? 0,
      ageBefore: Number.isFinite(ageBefore) ? ageBefore : 0,
      ageAfter: getVassalAge(afterState, afterVassal) || ageBefore || 0,
      prestigeBefore: startPrestige,
      prestigeAfter: Number.isFinite(afterVassal?.prestige)
        ? afterVassal.prestige : startPrestige + (prestigeIncome ?? 0),
      expBefore: startExp,
      expAfter: Number.isFinite(afterVassal?.developmentProgress)
        ? afterVassal.developmentProgress
        : (startExp + (developmentIncome ?? 0)) % threshold,
      expThreshold: threshold,
      earnedLevelCount,
      endedReason: afterVassal?.endedReason ?? null,
      deathCause: afterVassal?.deathCause ?? null,
      queuedLevelUp: earnedLevelCount > 0,
    };
    getRecapView?.()?.refresh?.();
    getLevelUpView?.()?.refresh?.();
  }

  function noteResolutionSettled({
    beforeState, beforeVassalId, pending, prestigeIncome, developmentIncome,
    prestigeBefore, expBefore, ageBefore,
  } = {}) {
    if (!beforeVassalId) return;
    captureResolutionRecap({
      vassalId: beforeVassalId,
      beforeState,
      prestigeIncome,
      developmentIncome,
      prestigeBefore,
      expBefore,
      ageBefore,
      phaseCost: pending?.phaseCost ?? 0,
    });
  }

  function dismissResolutionRecap() {
    const recap = resolutionRecap;
    resolutionRecap = null;
    getRecapView?.()?.refresh?.();
    getLevelUpView?.()?.refresh?.();
    if (recap?.endedReason === "died" || recap?.endedReason === "retired") {
      setWorldViewMode?.("map");
      // Screen navigation pauses reveal; resume the gameplay-triggered unveil
      // after returning to the civilization map, without the old node cap.
      revealCivilizationAfterVassalEnd?.(recap.vassalId, playback.getSettlementFrontierState());
      getWorldMapView?.()?.refresh?.();
    }
    return { ok: true };
  }

  function dispatchLifeMapAction(kind, payload = {}) {
    if (isInputLocked()) return { ok: false, reason: "openingReveal" };
    const runner = getRunner?.();
    if (playback.getSettlementViewedSec() !== playback.getSettlementFrontierSec()) {
      getNavigationView?.()?.showReadOnlyFeedback?.();
      return { ok: false, reason: "readOnlyTimeline" };
    }
    requestPause?.();
    // These actions only edit the pending node decision. Civilization effects
    // and elapsed time are applied when the node is confirmed.
    const stagedDecision = kind === ActionKinds.VASSAL_SELECT_LIFE_OPTION
      || kind === ActionKinds.VASSAL_PURCHASE_SHOP_OFFER
      || kind === ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE
      || kind === ActionKinds.VASSAL_UNDO_SHOP_PURCHASE
      || kind === ActionKinds.VASSAL_REORDER_SHOP_PURCHASE;
    const beforeState = stagedDecision ? null : playback.getSettlementFrontierState();
    const beforeVassal = stagedDecision ? null : getCurrentLifeMapVassal(beforeState);
    const activeVassalId = beforeVassal?.vassalId ?? null;
    const recapIncome = beforeVassal ? {
      prestigeIncome: getVassalNodeResolutionGains(
        beforeVassal, beforeVassal.lifeMap?.nodeStates?.[beforeVassal.lifeMap?.currentNodeId]?.family
      ).prestige,
      developmentIncome: getVassalNodeResolutionGains(
        beforeVassal, beforeVassal.lifeMap?.nodeStates?.[beforeVassal.lifeMap?.currentNodeId]?.family
      ).development,
      prestigeBefore: beforeVassal.prestige ?? 0,
      expBefore: beforeVassal.developmentProgress ?? 0,
      ageBefore: getVassalAge(beforeState, beforeVassal),
    } : null;
    const result = runner.dispatchActionAtCurrentSecond?.(kind, payload, {
      reason: `vassalLife:${kind}`,
      viewInvalidationReason: stagedDecision ? "vassalDecisionStaged" : undefined,
    }) ?? { ok: false, reason: "dispatchFailed" };
    if (!result.ok) return result;
    if (stagedDecision) {
      getNodeDecisionView?.()?.refresh?.();
      return result;
    }
    onInvalidateProjectedLoss?.();
    const state = playback.getSettlementFrontierState();
    const vassalEndedImmediately = revealCivilizationAfterVassalEnd?.(activeVassalId, state);
    const pending = getVassalPendingResolution(state);
    if (kind === ActionKinds.VASSAL_CONFIRM_LIFE_NODE && !pending && recapIncome) {
      const afterNode = state?.civilization?.vassalLineage?.vassalsById?.[activeVassalId]
        ?.lifeMap?.nodeStates?.[payload.nodeId];
      captureResolutionRecap({
        vassalId: activeVassalId,
        beforeState,
        ...recapIncome,
        phaseCost: afterNode?.accumulatedPhaseCost ?? 0,
      });
    }
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
    getRecapView?.()?.refresh?.();
    getHeirloomFlowView?.()?.refresh?.();
    getWorldMapView?.()?.refresh?.();
    getPrototypeView?.()?.refresh?.();
    return result;
  }

  function selectLifeMapCandidate(candidateIndex) {
    if (isInputLocked()) return { ok: false, reason: "openingReveal" };
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
    if (isInputLocked()) return { ok: false, reason: "openingReveal" };
    const candidate = settlementPendingVassalSelection?.candidates?.[candidateIndex] ?? null;
    if (!candidate) return { ok: false, reason: "invalidCandidate" };
    settlementSelectedVassalCandidateIndex = candidateIndex;
    settlementHoveredVassalCandidate = candidate;
    getChooserView?.()?.refresh?.();
    getWorldMapView?.()?.refresh?.();
    return { ok: true, candidateIndex };
  }

  function rerollLifeMapCandidates() {
    if (isInputLocked()) return { ok: false, reason: "openingReveal" };
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
    resolutionRecap = null;
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
    getResolutionRecap: () => resolutionRecap,
    noteResolutionSettled,
    dismissResolutionRecap,
  };
}
