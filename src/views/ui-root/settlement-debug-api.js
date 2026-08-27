import { getPerfSnapshot } from "../../model/perf.js";
import { getPrimaryDetailedSiteState } from "../../model/world-state.js";

function nonNegativeFloor(value, fallback = 0) {
  const next = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.floor(next ?? 0));
}

function summarizeGraphControllerData(data) {
  if (!data) return null;
  const boundaryKeys =
    data.cache?.stateDataByBoundary instanceof Map
      ? Array.from(data.cache.stateDataByBoundary.keys()).sort((a, b) => a - b)
      : null;
  return {
    metricId: data.metric?.id ?? null,
    scope:
      data.metric?.id === "civilization"
        ? "civilization"
        : data.metric?.id === "settlement"
          ? "settlement"
          : null,
    label: data.label ?? null,
    subjectKey: data.subjectKey ?? null,
    seriesIds: Array.isArray(data.series)
      ? data.series.map((series) => series?.id).filter(Boolean)
      : [],
    horizonSec: nonNegativeFloor(data.horizonSec),
    forecastStepSec: nonNegativeFloor(data.forecastStepSec),
    computedCoverageEndSec: nonNegativeFloor(data.forecastCoverageEndSec),
    forecastRequestedEndSec: nonNegativeFloor(data.forecastRequestedEndSec),
    forecastPending: data.forecastPending === true,
    graphBoundarySecs: boundaryKeys
      ? {
          count: data.cache.stateDataByBoundary.size,
          first: boundaryKeys.slice(0, 32),
          last: boundaryKeys.slice(-32),
        }
      : null,
  };
}

function summarizeTimeline(timeline) {
  const actions = Array.isArray(timeline?.actions) ? timeline.actions : [];
  return timeline
    ? {
        cursorSec: nonNegativeFloor(timeline.cursorSec),
        historyEndSec: nonNegativeFloor(timeline.historyEndSec),
        maxReachedHistoryEndSec: nonNegativeFloor(
          timeline.maxReachedHistoryEndSec
        ),
        revision: nonNegativeFloor(timeline.revision),
        actionContentVersion: nonNegativeFloor(timeline._actionContentVersion),
        actionCount: actions.length,
        actions: actions.slice(-16).map((action) => ({
          kind: action?.kind ?? null,
          tSec: nonNegativeFloor(action?.tSec),
          payload: action?.payload ?? null,
        })),
      }
    : null;
}

function summarizeLineage(state) {
  const lineage = state?.civilization?.vassalLineage ?? null;
  const current = lineage?.currentVassalId
    ? lineage.vassalsById?.[lineage.currentVassalId] ?? null
    : null;
  return lineage
    ? {
        currentVassalId: lineage.currentVassalId ?? null,
        currentVassal: current
          ? {
              vassalId: current.vassalId,
              locationRegionId: current.locationRegionId,
              initialAge: current.initialAge,
              prestige: current.prestige,
              stats: current.stats,
              currentNodeId: current.lifeMap?.currentNodeId ?? null,
              availableNodeIds: current.lifeMap?.availableNodeIds ?? [],
              pendingResolution: current.lifeMap?.pendingResolution ?? null,
              debugInjected: current.debugInjected === true,
            }
          : null,
        selectedVassalIds: lineage.selectedVassalIds ?? [],
        vassalIds: Object.keys(lineage.vassalsById ?? {}),
        futureStartingPrestigeBonus: lineage.futureStartingPrestigeBonus ?? 0,
      }
    : null;
}

export function publishSettlementDebugApi({
  getForecastStatus,
  getFrontierSec,
  getViewedSec,
  getPreviewCapSec,
  getPlaybackTarget,
  getPlaybackCurrent,
  getProjectedLossInfo,
  getDisplayedLossInfo,
  getGraphDebugState,
  getGraphControllerData,
  getProjectionForecastMeta,
  getProjectionDebugSecondKeys,
  getViewSemanticSnapshot,
  getWorldMapSnapshot,
  getWorldMapClickPoint,
  getTimeLeverScreenRect,
  getTimeActionClickPoint,
  getLifeMapPresentation,
  browseSecond,
  getVassalPrimaryClickPoint,
  getVassalCandidateClickPoint,
  getVassalRerollClickPoint,
  getVassalCloseClickPoint,
  getLifeMapNodeClickPoint,
  getLifeMapEnterNodeClickPoint,
  getLifeMapOptionClickPoint,
  getLifeMapOfferClickPoint,
  getLifeMapConfirmClickPoint,
  selectWorldRegion,
  getWorldPracticeClickPoint,
  getWorldInstalledPracticeClickPoint,
  getViewedSlotSummary,
  getPendingCommitJob,
  getTimeline,
  getPreviewStatus,
  getCursorState,
  getState,
  getFrontierState,
  getGraphPlotScreenRect,
  renderGraph,
  refreshPrototypeView,
  refreshWorldMap,
  getGraphController,
  hasStateDataAt,
  hasStateAt,
  applyOverrides,
  openNextSelection,
  selectCandidate,
  closeVassalSelection,
  getLastVassalSelectionResult,
  getVassalSelectionPool,
  isVassalSelectionOpen,
} = {}) {
  if (typeof globalThis === "undefined") return;
  globalThis.__SETTLEMENT_DEBUG__ = {
    getSnapshot: () => {
      const forecastStatus = getForecastStatus?.() ?? null;
      const timeline = getTimeline?.() ?? null;
      const cursorState = getCursorState?.() ?? null;
      const state = getState?.() ?? null;
      return {
        frontierSec: nonNegativeFloor(getFrontierSec?.()),
        viewedSec: nonNegativeFloor(getViewedSec?.()),
        browseCapSec: nonNegativeFloor(forecastStatus?.browseCapSec),
        previewCapSec: nonNegativeFloor(getPreviewCapSec?.()),
        playbackTarget: getPlaybackTarget?.() ?? 0,
        playbackCurrent: getPlaybackCurrent?.() ?? 0,
        forecastStatus,
        projectedLossInfo: getProjectedLossInfo?.() ?? null,
        displayedLossInfo: getDisplayedLossInfo?.() ?? null,
        graph: getGraphDebugState?.() ?? null,
        controller: summarizeGraphControllerData(getGraphControllerData?.()),
        projection: getProjectionForecastMeta?.() ?? null,
        projectionKeys: getProjectionDebugSecondKeys?.(32) ?? null,
        view: getViewSemanticSnapshot?.() ?? null,
        worldMap: getWorldMapSnapshot?.() ?? null,
        lifeMap: getLifeMapPresentation?.() ?? null,
        slots: getViewedSlotSummary?.() ?? null,
        pendingCommitJob: getPendingCommitJob?.() ?? null,
        runner: {
          timeline: summarizeTimeline(timeline),
          previewStatus: getPreviewStatus?.() ?? null,
          cursorStateSec: nonNegativeFloor(cursorState?.tSec),
          stateSec: nonNegativeFloor(state?.tSec),
        },
        gameConfig: state?.gameConfig ?? null,
        lineage: summarizeLineage(getFrontierState?.()),
        vassalSelectionPool: getVassalSelectionPool?.() ?? null,
        lastVassalSelectionResult: getLastVassalSelectionResult?.() ?? null,
        vassalSelectionOpen: isVassalSelectionOpen?.() === true,
      };
    },
    getGraphClickPoint: (ratioX = 0, ratioY = 0.5) => {
      const plotRect = getGraphPlotScreenRect?.();
      if (!plotRect) return null;
      const rx = Math.max(0, Math.min(1, Number(ratioX ?? 0)));
      const ry = Math.max(0, Math.min(1, Number(ratioY ?? 0.5)));
      return {
        x: plotRect.x + plotRect.width * rx,
        y: plotRect.y + plotRect.height * ry,
      };
    },
    getWorldMapClickPoint: (regionId) => getWorldMapClickPoint?.(regionId) ?? null,
    getTimeLeverScreenRect: () => getTimeLeverScreenRect?.() ?? null,
    getTimeActionClickPoint: () => getTimeActionClickPoint?.() ?? null,
    browseSecond: (tSec) => browseSecond?.(nonNegativeFloor(tSec)),
    getVassalPrimaryClickPoint: () => getVassalPrimaryClickPoint?.() ?? null,
    getVassalCandidateClickPoint: (candidateIndex = 0) =>
      getVassalCandidateClickPoint?.(
        Math.max(0, Math.floor(candidateIndex ?? 0))
      ) ?? null,
    getVassalRerollClickPoint: () => getVassalRerollClickPoint?.() ?? null,
    getVassalCloseClickPoint: () => getVassalCloseClickPoint?.() ?? null,
    getLifeMapNodeClickPoint: (nodeId) => getLifeMapNodeClickPoint?.(nodeId) ?? null,
    getLifeMapEnterNodeClickPoint: () => getLifeMapEnterNodeClickPoint?.() ?? null,
    getLifeMapOptionClickPoint: (index = 0) =>
      getLifeMapOptionClickPoint?.(Math.max(0, Math.floor(index ?? 0))) ?? null,
    getLifeMapOfferClickPoint: (index = 0) =>
      getLifeMapOfferClickPoint?.(Math.max(0, Math.floor(index ?? 0))) ?? null,
    getLifeMapConfirmClickPoint: () => getLifeMapConfirmClickPoint?.() ?? null,
    selectWorldRegion: (regionId) => selectWorldRegion?.(regionId) ?? false,
    getWorldPracticeClickPoint: (practiceId) =>
      getWorldPracticeClickPoint?.(practiceId) ?? null,
    getWorldInstalledPracticeClickPoint: (installedIndex) =>
      getWorldInstalledPracticeClickPoint?.(installedIndex) ?? null,
    forceRender: () => {
      renderGraph?.();
      refreshPrototypeView?.();
      refreshWorldMap?.();
      return true;
    },
    getPerfSnapshot: () =>
      getPerfSnapshot({
        timeline: getTimeline?.() ?? null,
        controllers: [getGraphController?.()].filter(Boolean),
      }),
    hasStateDataAt: (tSec) => hasStateDataAt?.(Math.floor(tSec ?? 0)) === true,
    hasStateAt: (tSec) => hasStateAt?.(Math.floor(tSec ?? 0)) === true,
    applyOverrides: (overrides) => applyOverrides?.(overrides),
    openNextSelection: () => openNextSelection?.(),
    selectCandidate: (candidateIndex) =>
      selectCandidate?.(Math.max(0, Math.floor(candidateIndex ?? 0))),
    closeVassalSelection: () => closeVassalSelection?.(),
    getLastVassalSelectionResult: () => getLastVassalSelectionResult?.() ?? null,
    isVassalSelectionOpen: () => isVassalSelectionOpen?.() === true,
  };
}
