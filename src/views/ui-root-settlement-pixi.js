const BOOT_SETUP_ID = "devPlaytesting01";

import { createSimRunner } from "../controllers/sim-runner.js";
import { createMapLabController } from "../controllers/map-lab-controller.js";
import { createDebugConfigurationController } from "../controllers/debug-configuration-controller.js";
import { createVassalDebugPresetController } from "../controllers/vassal-debug-preset-controller.js";
import { createDebugProfileController } from "../controllers/debug-profile-controller.js";
import { createSettlementForecastController } from "../controllers/settlement-forecast-controller.js";
import { createTimegraphForecastWorkerService } from "../controllers/timegraph-forecast-worker-service.js";
import {
  SEASON_DURATION_SEC,
  SETTLEMENT_VISIBLE_WINDOW_YEARS,
} from "../defs/gamesettings/gamerules-defs.js";
import { ActionKinds } from "../model/actions.js";
import {
  buildEdgeTransferBatchAtBoundary,
  getLatestEdgeTransferBoundarySec,
} from "../model/edge-transfers.js";
import { GRAPH_METRICS } from "../model/graph-metrics.js";
import {
  getSettlementClassIds,
  getSettlementCurrentVassal,
  getSettlementFirstSelectedVassal,
  getSettlementPracticeSlotsByClass,
  getSettlementSelectedVassalRealizedSegments,
  getSettlementStructureSlots,
  getSettlementVassalBoundarySeconds,
  getSettlementVassalElderEventSeconds,
} from "../model/settlement-state.js";
import {
  buildDetailedVassalSelectionPool,
  replaceDetailedVassalSelectionCandidate,
} from "../model/detailed-settlements.js";
import {
  getCommittedVassalLifeMapNodeIds,
  getCurrentLifeMapVassal,
  getLifeMapVassalAtSecond,
  getVassalLifeMapPlayheadNodeId,
  getVassalPendingResolution,
} from "../model/vassal-life-map.js";
import {
  getPrimaryDetailedSiteState,
} from "../model/world-state.js";
import { computeHistoryZoneSegments } from "../model/timegraph/edit-policy.js";
import { createTimeGraphController } from "../model/timegraph-controller.js";
import {
  VIEWPORT_DESIGN_HEIGHT,
  VIEWPORT_DESIGN_WIDTH,
} from "./layout-pixi.js";
import { createSettlementPrototypeView } from "./settlement-prototype-view.js";
import { createRunCompleteView } from "./run-complete-pixi.js";
import { createSettlementVassalControlsView } from "./settlement-vassal-controls-pixi.js";
import { createTimeControlsView } from "./time-controls-pixi.js";
import { createMetricGraphView } from "./timegraphs-pixi.js";
import { createTooltipView } from "./tooltip-pixi.js";
import {
  createSunAndMoonDisksView,
  SUN_AND_MOON_DISKS_LAYOUT,
} from "./sunandmoon-disks-pixi.js";
import { installGlobalTextStylePolicy } from "./ui-helpers/text-style-policy.js";
import {
  computeSettlementGraphWindowSpec,
  SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC,
  createSettlementProjectionCache,
  SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
} from "./ui-root/settlement-timegraph-window.js";
import {
  publishSettlementDebugApi as publishSettlementDebugApiForSettlement,
} from "./ui-root/settlement-debug-api.js";
import { createSettlementGraphSeriesMenu } from "./ui-root/settlement-graph-series-menu.js";
import { createSettlementDebugMenuDom } from "./settlement-debug-menu-dom.js";
import { createWorldMapView } from "./world-map-pixi.js";
import { createWorldMapVassalDrawerView } from "./world-map-vassal-drawer-pixi.js";
import { createVassalLifeMapView } from "./vassal-life-map-pixi.js";

if (typeof globalThis !== "undefined" && globalThis.__PERF_ENABLED__ == null) {
  globalThis.__PERF_ENABLED__ = false;
}

export const app = new PIXI.Application({
  width: VIEWPORT_DESIGN_WIDTH,
  height: VIEWPORT_DESIGN_HEIGHT,
  backgroundColor: 0x847b68,
  antialias: true,
});

installGlobalTextStylePolicy(PIXI, {
  fontFamily: "Georgia",
  titleVariant: "small-caps",
});

document.body.appendChild(app.view);
app.view.style.touchAction = "none";
app.view.style.userSelect = "none";
app.view.style.webkitUserSelect = "none";
app.view.style.display = "block";

function getViewportSizePx() {
  const vv = window.visualViewport;
  if (
    vv &&
    Number.isFinite(vv.width) &&
    Number.isFinite(vv.height) &&
    vv.width > 0 &&
    vv.height > 0
  ) {
    return {
      width: Math.max(1, Math.floor(vv.width)),
      height: Math.max(1, Math.floor(vv.height)),
    };
  }
  return {
    width: Math.max(
      1,
      Math.floor(
        window.innerWidth ||
          document.documentElement.clientWidth ||
          VIEWPORT_DESIGN_WIDTH
      )
    ),
    height: Math.max(
      1,
      Math.floor(
        window.innerHeight ||
          document.documentElement.clientHeight ||
          VIEWPORT_DESIGN_HEIGHT
      )
    ),
  };
}

function fitCanvasToViewport(view) {
  const vp = getViewportSizePx();
  const scale = Math.min(
    vp.width / VIEWPORT_DESIGN_WIDTH,
    vp.height / VIEWPORT_DESIGN_HEIGHT
  );
  const cssWidth = Math.max(1, Math.floor(VIEWPORT_DESIGN_WIDTH * scale));
  const cssHeight = Math.max(1, Math.floor(VIEWPORT_DESIGN_HEIGHT * scale));
  const left = Math.floor((vp.width - cssWidth) * 0.5);
  const top = Math.floor((vp.height - cssHeight) * 0.5);
  view.style.width = `${cssWidth}px`;
  view.style.height = `${cssHeight}px`;
  view.style.position = "fixed";
  view.style.left = `${left}px`;
  view.style.top = `${top}px`;
}

function stylePage() {
  document.body.style.backgroundColor = "#302a28";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.height = "100%";
  document.documentElement.style.backgroundColor = "#302a28";
  document.documentElement.style.height = "100%";
}

fitCanvasToViewport(app.view);
stylePage();

const playfieldLayer = new PIXI.Container();
const graphLayer = new PIXI.Container();
const controlLayer = new PIXI.Container();
const tooltipLayer = new PIXI.Container();
const modalLayer = new PIXI.Container();
const SETTLEMENT_GRAPH_WINDOW_SEC =
  Math.max(1, Math.floor(SEASON_DURATION_SEC)) *
  4 *
  Math.max(1, Math.floor(SETTLEMENT_VISIBLE_WINDOW_YEARS));
const MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES = 5;
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.addChild(playfieldLayer, graphLayer, controlLayer, modalLayer, tooltipLayer);

let prototypeView = null;
let worldMapView = null;
let worldViewMode = "map";
let settlementGraphScope = "civilization";
let selectedWorldRegionId = "river-crown";
let worldMapRegionSelectionActive = false;
let settlementGraphController = null;
let selectedPracticeClassId = "villager";
let settlementGraphView = null;
let settlementVassalChooserView = null;
let settlementVassalControlsView = null;
let vassalLifeMapView = null;
let runCompleteView = null;
let settlementForecastController = null;
let settlementGraphSeriesMenu = null;
let settlementDebugMenu = null;
let mapLabController = null;
let debugConfigurationController = null;
let vassalDebugPresetController = null;
let debugProfileController = null;
let settlementPendingVassalSelection = null;
let settlementHoveredVassalCandidate = null;
let settlementVassalSelectionWasOpen = false;
let settlementVassalSelectionResumeSpeed = 0;
let settlementLastVassalSelectionResult = null;
let settlementGraphHorizonOverrideSec = null;
let settlementPlaybackSpeedTarget = 0;
let settlementPlaybackSpeedCurrent = 0;
let settlementPlaybackViewSecFloat = null;
let settlementGraphRevealMode = "";
let settlementPendingPreviewRestoreSec = null;
let settlementEdgeTransferBatchCache = {
  key: null,
  batch: null,
};
let settlementFrontierStateCache = {
  historyEndSec: -1,
  revision: -1,
  state: null,
};

function setWorldViewMode(mode) {
  worldViewMode = mode === "settlement" ? "settlement" : mode === "vassalLife" ? "vassalLife" : "map";
  const settlementVisible = worldViewMode === "settlement";
  const lifeMapVisible = worldViewMode === "vassalLife";
  worldMapRegionSelectionActive = settlementVisible;
  prototypeView?.setVisible?.(settlementVisible);
  worldMapView?.setVisible?.(!settlementVisible && !lifeMapVisible);
  vassalLifeMapView?.setVisible?.(lifeMapVisible);
  // The Vassal controls are a shared time-control affordance. Keeping them in
  // the control layer makes the route available from both map and settlement.
  settlementVassalControlsView?.setVisible?.(true);
  setSettlementGraphContext(
    settlementVisible ? "settlement" : "civilization",
    selectedWorldRegionId
  );
}

function getSettlementGraphMetric() {
  return settlementGraphScope === "settlement"
    ? GRAPH_METRICS.settlement
    : GRAPH_METRICS.civilization;
}

function setSettlementGraphContext(scope, regionId = selectedWorldRegionId) {
  const nextScope = scope === "settlement" ? "settlement" : "civilization";
  const nextRegionId =
    typeof regionId === "string" && regionId.length
      ? regionId
      : selectedWorldRegionId;
  const previousScope = settlementGraphScope;
  const previousSubjectKey =
    settlementGraphController?.getData?.()?.subjectKey ?? null;
  const nextSubjectKey =
    nextScope === "settlement" ? nextRegionId : "civilization";
  const contextChanged =
    previousScope !== nextScope || previousSubjectKey !== nextSubjectKey;

  if (contextChanged && previousSubjectKey != null) {
    settlementGraphView?.clearProjectionReplacementTransition?.();
  }

  settlementGraphScope = nextScope;
  const metric = getSettlementGraphMetric();
  settlementGraphController?.setMetric?.(metric);
  settlementGraphController?.setSubject?.(
    nextScope === "settlement" ? { regionId: nextRegionId } : null,
    nextSubjectKey
  );
  settlementGraphSeriesMenu?.setContext?.(nextScope);
  settlementGraphSeriesMenu?.syncSelection?.();
  if (contextChanged) {
    settlementGraphController?.ensureCache?.();
    settlementGraphView?.resetDataContext?.();
  }
  settlementGraphView?.render?.();
  return contextChanged;
}
const SETTLEMENT_AUTO_COMMIT_BUFFER_SEC = 16;
const SETTLEMENT_AUTO_COMMIT_CHUNK_SEC = 128;
const SETTLEMENT_AUTO_COMMIT_MIN_INTERVAL_MS = 900;
const SETTLEMENT_AUTO_COMMIT_FORCE_LAG_SEC = 448;
const SETTLEMENT_AUTO_COMMIT_FALLBACK_MS = 1800;
const SETTLEMENT_DYNAMIC_DISPLAY_BUFFER_YEARS = 4;
const SETTLEMENT_DYNAMIC_DISPLAY_QUANTUM_SEC = 1;
const SETTLEMENT_GRAPH_SNAPSHOT_BOUNDS_QUANTUM_SEC = 512;
const SETTLEMENT_GRAPH_SNAPSHOT_LEAD_SEC = 1024;
const SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_YEARS = 100;
const SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_SEC =
  SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_YEARS * 32;
const SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_STRIDE_SEC = 16;
const SETTLEMENT_GRAPH_BOOT_FADE_DURATION_MS = 1500;
const SETTLEMENT_VASSAL_GRAPH_REPLACE_TRANSITION_MS = 1500;
const SETTLEMENT_VASSAL_GRAPH_REPLACE_FLASH_MS = 360;
const SETTLEMENT_VASSAL_GRAPH_REPLACE_FADE_STRENGTH = 0.5;
const SETTLEMENT_EXACT_LOSS_SEARCH_BUCKET_SEC = 16;
const SETTLEMENT_HORIZON_UPDATE_QUANTUM_SEC = 16;
const SETTLEMENT_HORIZON_LEAD_BUFFER_SEC = 256;
const SETTLEMENT_UNRESOLVED_BROWSE_LEAD_SEC = 256;
const SETTLEMENT_GRAPH_REVEAL_DEFAULT = Object.freeze({
  targetDurationSec: 14,
  minRateSecPerSec: 60,
  maxRateSecPerSec: 112,
  startDelayMs: 400,
  followGapSec: 36,
  followResponseSec: 1.1,
  accelerationSecPerSec2: 180,
  decelerationSecPerSec2: 260,
});
const SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT = Object.freeze({
  targetDurationSec: 13,
  minRateSecPerSec: 72,
  maxRateSecPerSec: 132,
  startDelayMs: 250,
  followGapSec: 48,
  followResponseSec: 0.95,
  accelerationSecPerSec2: 220,
  decelerationSecPerSec2: 320,
});
const forecastWorkerService = createTimegraphForecastWorkerService();
const settlementProjectionCache = createSettlementProjectionCache({
  horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
  stepSec: SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
});
const tooltipView = createTooltipView({
  layer: tooltipLayer,
  app,
});

function shouldInvalidateSettlementTimelineForecast(reason) {
  if (typeof reason !== "string" || reason.length <= 0) return true;
  if (reason === "init" || reason === "saveLoad") return true;
  if (reason === "actionDispatched" || reason === "actionDispatchedCurrentSec") {
    return true;
  }
  if (reason === "actionScheduled") return true;
  if (reason === "scrubCommit") return true;
  if (reason === "plannerClear") return true;
  if (reason.startsWith("plannerCommit:")) return true;
  return false;
}

function invalidateSettlementProjectedLossCache() {
  settlementForecastController?.invalidateLossCache?.();
}

function clearSettlementPendingCommitJob() {
  settlementForecastController?.clearPendingCommitJob?.();
}

function scheduleSettlementPendingCommit(frontierSec, currentVassal) {
  return settlementForecastController?.schedulePendingCommit?.(frontierSec, currentVassal) ?? null;
}

function resyncSettlementPendingCommitForFrontier() {
  clearSettlementPendingCommitJob();
  const frontierState = getSettlementFrontierState();
  if (isSettlementStateRunComplete(frontierState)) return null;
  const currentVassal = getSettlementCurrentVassal(frontierState);
  if (!currentVassal || currentVassal.isDead === true) return null;
  const frontierSec = getSettlementFrontierSec();
  const resolutionSec = Number.isFinite(currentVassal?.lifeMap?.pendingResolution?.resolveSec)
    ? Math.max(0, Math.floor(currentVassal.lifeMap.pendingResolution.resolveSec))
    : null;
  if (resolutionSec == null || resolutionSec <= frontierSec) return null;
  return scheduleSettlementPendingCommit(frontierSec, currentVassal);
}

function clampSettlementPlaybackSpeed(speed) {
  if (!Number.isFinite(speed)) return 0;
  return Math.max(-4, Math.min(4, Number(speed)));
}

function getSettlementPreviewCapSec() {
  const forecastStatus = settlementForecastController?.getForecastStatus?.() ?? null;
  return Math.max(
    getSettlementFrontierSec(),
    Math.floor(forecastStatus?.browseCapSec ?? getSettlementFrontierSec())
  );
}

function getSettlementViewedSec() {
  return Math.max(0, Math.floor(getSettlementViewedState()?.tSec ?? getSettlementFrontierSec()));
}

function ensureSettlementRunnerPaused() {
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
  settlementGraphView?.resetForecastPreviewState?.();
  invalidateSettlementProjectedLossCache();
  syncSettlementGraphHorizon();
  return { ...commitRes, promoted: true, targetSec };
}

function setSettlementPlaybackTarget(speed, opts = {}) {
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
  settlementPlaybackViewSecFloat =
    settlementPlaybackSpeedTarget !== 0 ? getSettlementViewedSec() : null;
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
  return runner?.getCursorState?.() ?? runner?.getState?.() ?? null;
}

function getSettlementViewedState() {
  return runner?.getState?.() ?? runner?.getCursorState?.() ?? null;
}

function getSettlementFrontierSec() {
  return Math.max(0, Math.floor(runner?.getTimeline?.()?.historyEndSec ?? 0));
}

function getSettlementFrontierState() {
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
    settlementGraphController?.getStateAt?.(frontierSec) ??
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
    providedStateData ?? settlementGraphController?.getStateDataAt?.(safeTargetSec) ?? null;
  const commitRes = runner.commitCursorSecond?.(safeTargetSec, stateData);
  if (commitRes?.ok !== true) {
    return commitRes ?? { ok: false, reason: "commitFailed" };
  }
  settlementGraphView?.resetForecastPreviewState?.();
  invalidateSettlementProjectedLossCache();
  syncSettlementGraphHorizon();
  return { ...commitRes, tSec: safeTargetSec, promoted: true };
}

function previewSettlementViewedSecond(tSec, { respectBrowseCap = true } = {}) {
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
  settlementGraphController?.ensureForecastCoverageTo?.(safeTargetSec);
  const previewState = settlementGraphController?.getStateAt?.(safeTargetSec) ?? null;
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
  settlementPendingPreviewRestoreSec = null;
  setSettlementPlaybackTarget(0);
  runner.clearPreviewState?.();
  settlementGraphView?.resetForecastPreviewState?.();
  const frontierSec = getSettlementFrontierSec();
  const safeTargetSec = Number.isFinite(targetSec)
    ? Math.max(0, Math.min(Math.floor(targetSec), frontierSec))
    : frontierSec;
  return runner.browseCursorSecond?.(safeTargetSec);
}

function getEffectiveSettlementGraphHorizonSec() {
  return settlementGraphHorizonOverrideSec ?? SETTLEMENT_GRAPH_WINDOW_SEC;
}

function setSettlementGraphHorizonOverride(nextHorizonSec) {
  const normalized = Number.isFinite(nextHorizonSec)
    ? Math.max(1, Math.floor(nextHorizonSec))
    : null;
  if (normalized === settlementGraphHorizonOverrideSec) return;
  settlementGraphHorizonOverrideSec = normalized;
  settlementGraphController?.setHorizonSecOverride?.(normalized);
}

function isSettlementStateRunComplete(state) {
  return state?.runStatus?.complete === true;
}

function getProjectedSettlementLossInfo({ deferDuringPendingCommit = true } = {}) {
  return settlementForecastController?.getProjectedLossInfo?.({
    deferDuringPendingCommit,
  }) ?? { lossSec: null, lossYear: null, resolved: false };
}

function getDisplayedSettlementLossInfo() {
  return settlementForecastController?.getDisplayedLossInfo?.() ?? {
    lossSec: null,
    lossYear: null,
    resolved: false,
    finalLossSec: null,
    finalLossYear: null,
  };
}

function shouldResumeAfterBlockingVassalSelection(state = getSettlementAuthoritativeState()) {
  return getSettlementPlaybackTarget() !== 0;
}

function getSettlementVisibleVassalTimeSec(state = null) {
  return settlementForecastController?.getVisibleVassalTimeSec?.(state) ?? 0;
}

function getSettlementRenderedHistoryEndSec({
  actualHistoryEndSec = null,
  displayHistoryEndSec = null,
  visibleForecastCoverageEndSec = null,
} = {}) {
  return settlementForecastController?.getRenderedHistoryEndSec?.({
    actualHistoryEndSec,
    displayHistoryEndSec,
    revealedCoverageEndSec: visibleForecastCoverageEndSec,
  }) ?? Math.max(0, Math.floor(displayHistoryEndSec ?? actualHistoryEndSec ?? 0));
}

function getSettlementDebugOverrideMarkerSeconds() {
  const actions = runner?.getTimeline?.()?.actions;
  if (!Array.isArray(actions) || actions.length <= 0) return [];
  const seconds = [];
  for (const action of actions) {
    if (action?.kind !== ActionKinds.DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES) {
      continue;
    }
    const tSec = Math.max(0, Math.floor(action?.tSec ?? 0));
    if (!seconds.includes(tSec)) seconds.push(tSec);
  }
  return seconds.sort((a, b) => a - b);
}

function getSettlementViewedSlotSummary() {
  const state = getSettlementViewedState();
  if (!getPrimaryDetailedSiteState(state)?.hub) return null;
  const practices = {};
  for (const classId of getSettlementClassIds(state)) {
    practices[classId] = getSettlementPracticeSlotsByClass(state, classId).map((slot) => {
      const card = slot?.card ?? null;
      return {
        defId: card?.defId ?? null,
        tier: card?.tier ?? card?.props?.settlement?.upgradeTier ?? null,
      };
    });
  }
  const structures = getSettlementStructureSlots(state).map((slot) => {
    const structure = slot?.structure ?? null;
    return {
      defId: structure?.defId ?? null,
      tier: structure?.tier ?? structure?.props?.settlement?.upgradeTier ?? null,
    };
  });
  return { practices, structures };
}

function syncSettlementGraphRevealConfig() {
  const nextMode = settlementForecastController?.getRevealMode?.() ?? "default";
  if (nextMode === settlementGraphRevealMode) return;
  settlementGraphRevealMode = nextMode;
  settlementGraphView?.setForecastRevealConfig?.(
    nextMode === "pendingCommit"
      ? SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT
      : SETTLEMENT_GRAPH_REVEAL_DEFAULT
  );
}

function syncSettlementGraphHorizon() {
  settlementForecastController?.syncHorizon?.();
}

function revealCivilizationAfterVassalEnd(vassalId, state = getSettlementFrontierState()) {
  const endedVassal = state?.civilization?.vassalLineage?.vassalsById?.[vassalId] ?? null;
  if (
    !vassalId ||
    state?.civilization?.vassalLineage?.currentVassalId != null ||
    !["died", "retired"].includes(endedVassal?.endedReason)
  ) return false;
  syncSettlementGraphHorizon();
  settlementGraphView?.restartForecastRevealFrom?.(getSettlementFrontierSec(), {
    allowForecastStart: true,
  });
  setWorldViewMode("map");
  return true;
}

function processSettlementPendingCommit() {
  const beforeState = getSettlementFrontierState();
  const beforeVassalId = beforeState?.civilization?.vassalLineage?.currentVassalId ?? null;
  const beforePendingResolution = getVassalPendingResolution(beforeState);
  settlementForecastController?.processPendingCommit?.({
    clearForecastRevealRestart: () =>
      settlementGraphView?.clearForecastRevealRestart?.(),
  });
  if (!beforeVassalId) return;
  const afterState = getSettlementFrontierState();
  const afterPendingResolution = getVassalPendingResolution(afterState);
  if (beforePendingResolution && !afterPendingResolution) {
    settlementGraphController?.refreshAuthoritativeRangeFrom?.(
      beforePendingResolution.startSec
    );
    settlementGraphView?.render?.();
  }
  revealCivilizationAfterVassalEnd(beforeVassalId, afterState);
}

function syncSettlementVassalSelectionPauseState() {
  const selectionOpen = !!settlementPendingVassalSelection;
  if (selectionOpen && !settlementVassalSelectionWasOpen) {
    if (!Number.isFinite(settlementVassalSelectionResumeSpeed)) {
      settlementVassalSelectionResumeSpeed = 0;
    }
    if (settlementVassalSelectionResumeSpeed === 0) {
      settlementVassalSelectionResumeSpeed = shouldResumeAfterBlockingVassalSelection()
        ? getSettlementPlaybackTarget()
        : 0;
    }
    requestPauseBeforeDrag();
  }
  if (!selectionOpen && settlementVassalSelectionWasOpen) {
    const resumeSpeed = Number.isFinite(settlementVassalSelectionResumeSpeed)
      ? settlementVassalSelectionResumeSpeed
      : 0;
    settlementVassalSelectionResumeSpeed = 0;
    if (resumeSpeed !== 0) {
      setSettlementPlaybackTarget(resumeSpeed);
    }
  }
  settlementVassalSelectionWasOpen = selectionOpen;
  return selectionOpen;
}

function closeSettlementVassalSelection() {
  if (!settlementPendingVassalSelection) return { ok: false, reason: "missingSelectionPool" };
  settlementPendingVassalSelection = null;
  settlementHoveredVassalCandidate = null;
  settlementVassalSelectionResumeSpeed = 0;
  settlementGraphView?.clearProjectionReplacementTransition?.();
  worldMapView?.refresh?.();
  settlementVassalChooserView?.refresh?.();
  syncSettlementVassalSelectionPauseState();
  return { ok: true };
}

function openLifeMapVassalSelection() {
  settlementLastVassalSelectionResult = null;
  const state = getSettlementFrontierState();
  if (isSettlementStateRunComplete(state)) return { ok: false, reason: "runComplete" };
  if (getCurrentLifeMapVassal(state)) return { ok: false, reason: "currentVassalAlive" };
  setWorldViewMode("map");
  requestPauseBeforeDrag();
  runner.clearPreviewState?.();
  settlementGraphView?.resetForecastPreviewState?.();
  settlementPendingVassalSelection = buildDetailedVassalSelectionPool(state);
  settlementHoveredVassalCandidate = null;
  settlementVassalChooserView?.refresh?.();
  syncSettlementVassalSelectionPauseState();
  return settlementPendingVassalSelection
    ? { ok: true, poolId: settlementPendingVassalSelection.poolId }
    : { ok: false, reason: "poolFailed" };
}

function dispatchLifeMapAction(kind, payload = {}) {
  requestPauseBeforeDrag();
  const activeVassalId = getCurrentLifeMapVassal(getSettlementFrontierState())?.vassalId ?? null;
  const result = runner.dispatchActionAtCurrentSecond?.(kind, payload, {
    reason: `vassalLife:${kind}`,
  }) ?? { ok: false, reason: "dispatchFailed" };
  if (!result.ok) return result;
  invalidateSettlementProjectedLossCache();
  const state = getSettlementFrontierState();
  const vassalEndedImmediately = revealCivilizationAfterVassalEnd(activeVassalId, state);
  const pending = getVassalPendingResolution(state);
  if (!vassalEndedImmediately && pending?.resolveSec > getSettlementFrontierSec()) {
    settlementForecastController?.schedulePendingCommit?.(
      getSettlementFrontierSec(),
      getCurrentLifeMapVassal(state)
    );
    syncSettlementGraphHorizon();
    settlementGraphView?.restartForecastRevealFrom?.(getSettlementFrontierSec(), {
      allowForecastStart: true,
      revealTargetEndSec: pending.resolveSec,
    });
  }
  vassalLifeMapView?.refresh?.();
  worldMapView?.refresh?.();
  prototypeView?.refresh?.();
  return result;
}

function selectLifeMapCandidate(candidateIndex) {
  const pool = settlementPendingVassalSelection;
  if (!pool) return { ok: false, reason: "missingSelectionPool" };
  const candidate = pool.candidates?.[candidateIndex] ?? null;
  const selectionSec = getSettlementFrontierSec();
  const priorLoss = getSettlementLossInfoForDisplay();
  const priorCoverageSec = settlementGraphController?.getData?.()?.forecastCoverageEndSec;
  settlementGraphView?.stageProjectionReplacementTransition?.({
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
    if (candidate?.locationRegionId) selectedWorldRegionId = candidate.locationRegionId;
    settlementPendingVassalSelection = null;
    settlementHoveredVassalCandidate = null;
    syncSettlementVassalSelectionPauseState();
    syncSettlementGraphHorizon();
    settlementGraphView?.restartForecastRevealFrom?.(selectionSec, {
      allowForecastStart: true,
      revealTargetEndSec: selectionSec,
      activateProjectionReplacementTransition: true,
    });
    setWorldViewMode("vassalLife");
  } else if (result.reason === "selectionPoolMismatch") {
    settlementPendingVassalSelection = buildDetailedVassalSelectionPool(getSettlementFrontierState());
    settlementVassalChooserView?.refresh?.();
  }
  return result;
}

function rerollLifeMapCandidates() {
  if (!settlementPendingVassalSelection) return { ok: false, reason: "missingSelectionPool" };
  const result = dispatchLifeMapAction(ActionKinds.SETTLEMENT_REROLL_VASSALS);
  if (result.ok) {
    settlementPendingVassalSelection = buildDetailedVassalSelectionPool(getSettlementFrontierState());
    settlementHoveredVassalCandidate = null;
    settlementVassalChooserView?.refresh?.();
  }
  return result;
}

function replaceSettlementVassalCandidate(candidateIndex, spec) {
  if (!settlementPendingVassalSelection) {
    const opened = openLifeMapVassalSelection();
    if (!opened?.ok) return opened;
  }
  const result = replaceDetailedVassalSelectionCandidate(
    getSettlementFrontierState(),
    settlementPendingVassalSelection,
    candidateIndex,
    spec
  );
  if (!result.ok) return result;
  settlementPendingVassalSelection = result.pool;
  settlementHoveredVassalCandidate = null;
  worldMapView?.refresh?.();
  settlementVassalChooserView?.refresh?.();
  return { ok: true, candidate: result.pool.candidates[candidateIndex] ?? null };
}

function applySettlementDebugOverrides(overrides) {
  const cleanOverrides = (Array.isArray(overrides) ? overrides : []).filter(
    (override) => override && typeof override === "object"
  );
  if (!cleanOverrides.length) return { ok: false, reason: "noOverrides" };

  setSettlementPlaybackTarget(0);
  const viewedSec = getSettlementViewedSec();
  const targetSec = Math.max(0, Math.floor(viewedSec));
  const frontierBeforeEdit = getSettlementFrontierSec();
  const hadPendingSelection = !!settlementPendingVassalSelection;
  settlementPendingVassalSelection = null;
  let moveResult = { ok: true };
  if (targetSec <= frontierBeforeEdit) {
    moveResult = setSettlementViewedSecond(targetSec, { mode: "commit" });
  } else {
    runner.clearPreviewState?.();
  }
  if (!moveResult?.ok) return moveResult || { ok: false, reason: "targetBrowseFailed" };
  settlementGraphView?.resetForecastPreviewState?.();

  const previousFullHistoryEdit = runner.getFullHistoryEditOverride?.() === true;
  runner.setFullHistoryEditOverride?.(true);
  let result;
  try {
    const payload = {
      overrides: cleanOverrides,
    };
    result =
      targetSec > frontierBeforeEdit
        ? runner.dispatchActionAtSecond?.(
            ActionKinds.DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES,
            payload,
            targetSec,
            {
              reason: "debugSettlementOverrides",
              truncateFuture: true,
            }
          )
        : runner.dispatchActionAtCurrentSecond?.(
            ActionKinds.DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES,
            payload,
            {
              reason: "debugSettlementOverrides",
              resetMaxReachedHistoryEndSec: true,
            }
          );
  } finally {
    runner.setFullHistoryEditOverride?.(previousFullHistoryEdit);
  }

  if (result?.ok) {
    invalidateSettlementProjectedLossCache();
    resyncSettlementPendingCommitForFrontier();
    if (hadPendingSelection) {
      const frontierSec = getSettlementFrontierSec();
      const frontierState = getSettlementFrontierState();
      const forecastStatus = settlementForecastController?.getForecastStatus?.() ?? null;
      settlementPendingVassalSelection =
        forecastStatus?.nextVassalEnabled === true
          ? buildDetailedVassalSelectionPool(frontierState)
          : null;
      settlementVassalChooserView?.refresh?.();
    }
    syncSettlementGraphHorizon();
    if (targetSec > getSettlementFrontierSec()) {
      settlementGraphController?.ensureForecastCoverageTo?.(targetSec);
      settlementGraphView?.restartForecastRevealFrom?.(targetSec, {
        allowForecastStart: true,
        clearProjectionReplacementTransition: true,
      });
      settlementPendingPreviewRestoreSec = targetSec;
      restoreSettlementPendingPreviewTarget();
    } else {
      settlementGraphView?.restartForecastRevealFrom?.(targetSec, {
        clearProjectionReplacementTransition: true,
      });
    }
    prototypeView?.refresh?.();
    settlementGraphView?.render?.();
  }

  return {
    ...(result ?? { ok: false, reason: "dispatchFailed" }),
    targetSec,
  };
}

function getSettlementPrimaryVassalState() {
  const frontierState = getSettlementFrontierState();
  const lifeMapPresentation = getSettlementLifeMapPresentation();
  const hasPendingSelection = !!settlementPendingVassalSelection;
  const hasSelectedVassal = !!getSettlementFirstSelectedVassal(frontierState);
  const currentVassal = getCurrentLifeMapVassal(frontierState);
  const runComplete = isSettlementStateRunComplete(frontierState);
  const runCompleteEntry = getLatestRunCompleteEntry(frontierState);
  const browsingHistoricalVassal = getSettlementViewedSec() < getSettlementFrontierSec()
    && !!lifeMapPresentation.vassal;
  if (runComplete && !browsingHistoricalVassal) {
    return {
      enabled: !!runCompleteEntry,
      label: "Gameover",
    };
  }
  if (currentVassal) {
    return {
      enabled: hasPendingSelection !== true,
      label: worldViewMode === "vassalLife" ? "World Map" : "Life Map",
    };
  }
  if (browsingHistoricalVassal) {
    return {
      enabled: hasPendingSelection !== true,
      label: worldViewMode === "vassalLife" ? "World Map" : "Life Map",
    };
  }
  return {
    enabled: hasPendingSelection !== true && runComplete !== true,
    label: hasSelectedVassal ? "Next Vassal" : "Intervene",
  };
}

function getSettlementLossInfoForDisplay() {
  return settlementForecastController?.getLossInfoForDisplay?.() ?? {
    lossSec: null,
    lossYear: null,
    resolved: false,
    finalLossSec: null,
    finalLossYear: null,
    maxLossYear: null,
  };
}

function getLatestRunCompleteEntry(state = runner?.getState?.() ?? null) {
  const feed = Array.isArray(state?.gameEventFeed) ? state.gameEventFeed : [];
  for (let index = feed.length - 1; index >= 0; index -= 1) {
    const entry = feed[index];
    if (entry?.type === "runComplete") return entry;
  }
  if (state?.runStatus?.complete === true) {
    const runYear = Number.isFinite(state?.runStatus?.year)
      ? Math.max(1, Math.floor(state.runStatus.year))
      : Number.isFinite(state?.year)
        ? Math.max(1, Math.floor(state.year))
        : 1;
    const runSec = Number.isFinite(state?.runStatus?.tSec)
      ? Math.max(0, Math.floor(state.runStatus.tSec))
      : Math.max(0, Math.floor(state?.tSec ?? 0));
    const runReason =
      typeof state?.runStatus?.reason === "string" && state.runStatus.reason.length > 0
        ? state.runStatus.reason
        : "unknown";
    return {
      id: null,
      type: "runComplete",
      tSec: runSec,
      text: `Civilization lasted until Year ${runYear}.`,
      data: {
        runComplete: true,
        year: runYear,
        reason: runReason,
      },
    };
  }
  return null;
}

function openSettlementRunCompleteOverlay() {
  const latestEntry = getLatestRunCompleteEntry(getSettlementFrontierState());
  if (!latestEntry) return { ok: false, reason: "noRunCompleteEntry" };
  return runCompleteView?.openForEntry?.(latestEntry, { source: "settlement" }) ?? {
    ok: false,
    reason: "overlayUnavailable",
  };
}

function syncSettlementRunCompletePresentation() {
  const viewedState = getSettlementViewedState();
  runCompleteView?.setBackdropVisible?.(isSettlementStateRunComplete(viewedState));
}

function invalidateSettlementEdgeTransferBatchCache() {
  settlementEdgeTransferBatchCache = {
    key: null,
    batch: null,
  };
}

function getSettlementViewedEdgeTransferBatch() {
  const viewedSec = getSettlementViewedSec();
  const boundarySec = getLatestEdgeTransferBoundarySec(
    viewedSec,
    getSettlementViewedState()
  );
  if (boundarySec <= 0) return null;
  const timeline = runner.getTimeline?.() ?? null;
  const cacheKey = [
    boundarySec,
    Math.max(0, Math.floor(timeline?.revision ?? 0)),
    Math.max(0, Math.floor(timeline?._actionContentVersion ?? 0)),
    Math.max(0, Math.floor(timeline?.historyEndSec ?? 0)),
  ].join(":");
  if (settlementEdgeTransferBatchCache.key === cacheKey) {
    return settlementEdgeTransferBatchCache.batch;
  }
  const preBoundaryState =
    settlementGraphController?.getStateAt?.(boundarySec - 1) ?? null;
  const batch = preBoundaryState
    ? buildEdgeTransferBatchAtBoundary(preBoundaryState, boundarySec)
    : null;
  settlementEdgeTransferBatchCache = {
    key: cacheKey,
    batch,
  };
  return batch;
}

const runner = createSimRunner({
  setupId: BOOT_SETUP_ID,
  onInvalidate: (reason) => {
    if (shouldInvalidateSettlementTimelineForecast(reason)) {
      forecastWorkerService.handleTimelineInvalidation?.(reason);
      settlementGraphController?.handleInvalidate?.(reason);
    }
    invalidateSettlementEdgeTransferBatchCache();
    invalidateSettlementProjectedLossCache();
    syncSettlementGraphHorizon();
    prototypeView?.refresh?.();
    settlementDebugMenu?.refresh?.();
  },
  onRebuildViews: () => {
    invalidateSettlementEdgeTransferBatchCache();
    invalidateSettlementProjectedLossCache();
    syncSettlementGraphHorizon();
    prototypeView?.refresh?.();
    settlementDebugMenu?.refresh?.();
  },
});

settlementGraphController = createTimeGraphController({
  getTimeline: () => runner.getTimeline?.(),
  getCursorState: () => runner.getCursorState?.(),
  metric: GRAPH_METRICS.civilization,
  projectionCache: settlementProjectionCache,
  forecastWorkerService,
  forecastStepSec: SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
  horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
  nonFocusStablePrefixSpanSec: SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_SEC,
  nonFocusStablePrefixStrideSec:
    SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_STRIDE_SEC,
});
settlementGraphController.setSubject?.(
  null,
  "civilization"
);
settlementForecastController = createSettlementForecastController({
  getTimeline: () => runner.getTimeline?.(),
  ensureControllerCache: () => settlementGraphController?.ensureCache?.(),
  getControllerData: () => settlementGraphController?.getData?.(),
  getControllerStateAt: (tSec) => settlementGraphController?.getStateAt?.(tSec),
  getControllerStateDataAt: (tSec) =>
    settlementGraphController?.getStateDataAt?.(tSec),
  getControllerSummaryAt: (tSec) => settlementGraphController?.getSummaryAt?.(tSec),
  getFrontierSec: () => getSettlementFrontierSec(),
  getFrontierState: () => getSettlementFrontierState(),
  getViewedState: () => getSettlementViewedState(),
  getViewedSec: () => getSettlementViewedSec(),
  getRevealedCoverageEndSec: () =>
    Math.floor(settlementGraphView?.getForecastScrubCapSec?.() ?? getSettlementFrontierSec()),
  getEffectiveGraphHorizonSec: () => getEffectiveSettlementGraphHorizonSec(),
  setHorizonSecOverride: (nextHorizonSec) => setSettlementGraphHorizonOverride(nextHorizonSec),
  commitCursorSecond: (tSec) => runner.commitCursorSecond?.(tSec),
  browseCursorSecond: (tSec) => runner.browseCursorSecond?.(tSec),
  clearPreviewState: () => runner.clearPreviewState?.(),
  setPlaybackViewSec: () => {},
  getMaxObservedSurvivalYear: () =>
    runner.getTimeline?.()?.persistentKnowledge
      ?.maxObservedCivilizationSurvivalYear ?? null,
  rememberObservedSurvivalYear: (year) =>
    runner.rememberCivilizationSurvivalYear?.(year),
  graphWindowSec: SETTLEMENT_GRAPH_WINDOW_SEC,
  lossSearchCapacitySec: SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC,
  autoCommitBufferSec: SETTLEMENT_AUTO_COMMIT_BUFFER_SEC,
  autoCommitChunkSec: SETTLEMENT_AUTO_COMMIT_CHUNK_SEC,
  autoCommitMinIntervalMs: SETTLEMENT_AUTO_COMMIT_MIN_INTERVAL_MS,
  autoCommitForceLagSec: SETTLEMENT_AUTO_COMMIT_FORCE_LAG_SEC,
  autoCommitFallbackMs: SETTLEMENT_AUTO_COMMIT_FALLBACK_MS,
  dynamicDisplayBufferYears: SETTLEMENT_DYNAMIC_DISPLAY_BUFFER_YEARS,
  dynamicDisplayQuantumSec: SETTLEMENT_DYNAMIC_DISPLAY_QUANTUM_SEC,
  exactLossSearchBucketSec: SETTLEMENT_EXACT_LOSS_SEARCH_BUCKET_SEC,
  horizonUpdateQuantumSec: SETTLEMENT_HORIZON_UPDATE_QUANTUM_SEC,
  horizonLeadBufferSec: SETTLEMENT_HORIZON_LEAD_BUFFER_SEC,
  unresolvedBrowseLeadSec: SETTLEMENT_UNRESOLVED_BROWSE_LEAD_SEC,
});
settlementGraphSeriesMenu = createSettlementGraphSeriesMenu({
  PIXI,
  layer: controlLayer,
  getAllSeries: () => {
    const state = runner?.getCursorState?.() ?? runner?.getState?.() ?? null;
    const metric = getSettlementGraphMetric();
    if (typeof metric?.getSeries === "function") {
      return metric.getSeries(
        settlementGraphScope === "settlement"
          ? { regionId: selectedWorldRegionId }
          : null,
        state
      );
    }
    return Array.isArray(metric?.series)
      ? metric.series
      : [];
  },
  getGraphScreenRect: () => settlementGraphView?.getScreenRect?.() ?? null,
  applySeriesSelection: (visibleSeries) =>
    settlementGraphController?.setSeries?.(visibleSeries),
  renderGraph: () => settlementGraphView?.render?.(),
  getPreferredSeriesIds: (contextId) =>
    contextId === "settlement"
      ? ["totalPopulation", "food", "population:villager"]
      : ["totalPopulation", "food", "chaosPower", "chaosRawPressure", "chaosResistance"],
  maxVisibleSeries: MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES,
  viewportWidth: VIEWPORT_DESIGN_WIDTH,
  viewportHeight: VIEWPORT_DESIGN_HEIGHT,
});
settlementGraphSeriesMenu.setContext("civilization");
settlementGraphSeriesMenu.applySelection();

prototypeView = createSettlementPrototypeView({
  app,
  layer: playfieldLayer,
  getState: () => runner.getState?.(),
  getSelectedRegionId: () => selectedWorldRegionId,
  getCivilizationLossInfo: () => getSettlementLossInfoForDisplay(),
  getSelectedPracticeClassId: () => selectedPracticeClassId,
  getVisibleVassalTimeSec: (state) => getSettlementVisibleVassalTimeSec(state),
  tooltipView,
  onReturnToMap: () => setWorldViewMode("map"),
  setSelectedPracticeClassId: (classId) => {
    selectedPracticeClassId = typeof classId === "string" && classId.length > 0 ? classId : "villager";
  },
});
prototypeView.setVisible(false);

function selectWorldMapRegion(regionId) {
  const state = runner.getState?.();
  if (!state?.world?.regions?.some((entry) => entry.id === regionId)) {
    return false;
  }
  const isSelectedAgain =
    worldMapRegionSelectionActive && selectedWorldRegionId === regionId;
  selectedWorldRegionId = regionId;
  worldMapRegionSelectionActive = !isSelectedAgain;
  const hasDetailedSettlement = state.world.sites?.some(
    (site) => site.regionId === regionId
  );
  setSettlementGraphContext(
    worldMapRegionSelectionActive && hasDetailedSettlement
      ? "settlement"
      : "civilization",
    regionId
  );
  worldMapView?.refresh?.();
  return true;
}

worldMapView = createWorldMapView({
  layer: playfieldLayer,
  getState: () => runner.getState?.(),
  getEdgeTransferBatch: () => getSettlementViewedEdgeTransferBatch(),
  getCivilizationLossInfo: () => getSettlementLossInfoForDisplay(),
  getSelectedRegionId: () => selectedWorldRegionId,
  getRegionSelectionActive: () => worldMapRegionSelectionActive,
  getGraphScope: () => settlementGraphScope,
  setSelectedRegionId: selectWorldMapRegion,
  onShowCivilizationGraph: () => {
    worldMapRegionSelectionActive = false;
    setSettlementGraphContext("civilization");
    worldMapView?.refresh?.();
  },
  onShowSelectedRegionGraph: (regionId) => {
    selectedWorldRegionId = regionId;
    worldMapRegionSelectionActive = true;
    setSettlementGraphContext("settlement", regionId);
    worldMapView?.refresh?.();
  },
  getVassalHighlight: () => {
    const candidate = settlementHoveredVassalCandidate;
    if (!candidate) return null;
    return {
      targetRegionId: candidate.locationRegionId,
      intervention: null,
    };
  },
  tooltipView,
  onOpenDetailedSite: (_siteId, regionId) => {
    if (typeof regionId === "string") {
      selectedWorldRegionId = regionId;
    }
    worldMapRegionSelectionActive = true;
    setWorldViewMode("settlement");
  },
});

const DISK_LAYOUT = {
  ...SUN_AND_MOON_DISKS_LAYOUT,
  moon: {
    ...SUN_AND_MOON_DISKS_LAYOUT.moon,
    x: 2105,
    y: 895,
    scale: 0.42,
  },
  season: {
    ...SUN_AND_MOON_DISKS_LAYOUT.season,
    x: 2105,
    y: 895,
    scale: 0.58,
  },
};

const timeControlsView = createTimeControlsView({
  app,
  layer: controlLayer,
  getGameState: () => ({
    ...(getSettlementViewedState() ?? {}),
    paused: getSettlementPlaybackTarget() === 0,
  }),
  togglePause,
  isPausePending: () => false,
  getCommitPreviewState: () => ({ visible: false, enabled: false }),
  onCommitPreview: () => ({ ok: false, reason: "settlementPreviewOnly" }),
  getReturnToPresentState: () => {
    const frontierSec = getSettlementFrontierSec();
    return {
      visible: getSettlementViewedSec() !== frontierSec,
      enabled: true,
      targetSec: frontierSec,
    };
  },
  onReturnToPresent: (targetSec) => returnSettlementViewToPresent(targetSec),
  getTimeScale: () => getSettlementPlaybackState(),
  setTimeScaleTarget: (speed, opts) => {
    settlementGraphView?.suspendForecastRevealPlayheadFollow?.();
    return setSettlementPlaybackTarget(speed, opts);
  },
  layout: {
    enabled: true,
    zIndex: 4,
    gap: 14,
    screenPadding: 16,
    verticalGapFromDiskPx: -38,
    diskTextureRadiusPx: 220,
    buttonAlignOffsetY: 0,
  },
  sunMoonLayout: DISK_LAYOUT,
});

const sunMoonDisksView = createSunAndMoonDisksView({
  app,
  layer: controlLayer,
  getState: () => getSettlementViewedState(),
  getTimeline: () => runner.getTimeline?.(),
  getEditableHistoryBounds: () => runner.getEditableHistoryBounds?.(),
  getForecastPreviewCapSec: () => getSettlementPreviewCapSec(),
  browseCursorSecond: (tSec) => setSettlementViewedSecond(tSec, { mode: "browse" }),
  commitCursorSecond: (tSec) => setSettlementViewedSecond(tSec, { mode: "commit" }),
  previewCursorSecond: (tSec) => setSettlementViewedSecond(tSec, { mode: "preview" }),
  clearPreviewState: () => runner.clearPreviewState?.(),
  commitPreviewToLive: () => ({ ok: true, previewOnly: true }),
  requestPauseBeforeDrag: requestPauseBeforeDrag,
  tooltipView,
  layout: DISK_LAYOUT,
});

settlementGraphView = createMetricGraphView({
  app,
  layer: graphLayer,
  controller: settlementGraphController,
  tooltipView,
  metric: GRAPH_METRICS.settlement,
  getTimeline: () => runner.getTimeline?.(),
  getCursorState: () => runner.getCursorState?.(),
  getPreviewStatus: () => runner.getPreviewStatus?.(),
  canAutoPreviewForecastReveal: () => !settlementPendingVassalSelection,
  getEditableHistoryBounds: () => runner.getEditableHistoryBounds?.(),
  setPreviewState: (state) => runner.setPreviewState?.(state),
  clearPreviewState: () => runner.clearPreviewState?.(),
  commitSecond: (tSec, stateData) =>
    setSettlementViewedSecond(tSec, { mode: "commit", stateData }),
  commitForecastOnScrubRelease: false,
  commitHistoryOnScrubRelease: false,
  forecastPreviewStatusNote: "Viewing forecast",
  getWindowSpec: ({ timeline, cursorState, zoomed }) => {
    const preview = runner.getPreviewStatus?.();
    const frontierState = getSettlementFrontierState();
    const firstSelectedVassal = getSettlementFirstSelectedVassal(frontierState);
    const currentVassal = getSettlementCurrentVassal(frontierState);
    const displayedLossInfo = getDisplayedSettlementLossInfo();
    return computeSettlementGraphWindowSpec({
      historyEndSec: timeline?.historyEndSec,
      cursorSec: cursorState?.tSec,
      forecastPreviewSec: preview?.isForecastPreview ? preview.previewSec : null,
      horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
      zoomed,
      lineageStartSec: firstSelectedVassal?.selectedSec ?? null,
      currentVassalStartSec: currentVassal?.selectedSec ?? null,
      projectedLossSec: displayedLossInfo?.lossSec ?? null,
    });
  },
  openPosition: { x: 432, y: 884 },
  windowWidth: 1560,
  windowHeight: 190,
  headerHeight: 34,
  getRenderedHistoryEndSec: (spec) =>
    getSettlementRenderedHistoryEndSec({
      actualHistoryEndSec: spec?.actualHistoryEndSec,
      displayHistoryEndSec: spec?.displayHistoryEndSec,
      visibleForecastCoverageEndSec: spec?.visibleForecastCoverageEndSec,
    }),
  forecastRevealTargetDurationSec: SETTLEMENT_GRAPH_REVEAL_DEFAULT.targetDurationSec,
  forecastRevealMinRateSecPerSec: SETTLEMENT_GRAPH_REVEAL_DEFAULT.minRateSecPerSec,
  forecastRevealMaxRateSecPerSec: SETTLEMENT_GRAPH_REVEAL_DEFAULT.maxRateSecPerSec,
  forecastRevealStartDelayMs: SETTLEMENT_GRAPH_REVEAL_DEFAULT.startDelayMs,
  forecastRevealFollowGapSec: SETTLEMENT_GRAPH_REVEAL_DEFAULT.followGapSec,
  forecastRevealFollowResponseSec: SETTLEMENT_GRAPH_REVEAL_DEFAULT.followResponseSec,
  forecastRevealAccelerationSecPerSec2:
    SETTLEMENT_GRAPH_REVEAL_DEFAULT.accelerationSecPerSec2,
  forecastRevealDecelerationSecPerSec2:
    SETTLEMENT_GRAPH_REVEAL_DEFAULT.decelerationSecPerSec2,
  plotSnapshotBoundsQuantumSec:
    SETTLEMENT_GRAPH_SNAPSHOT_BOUNDS_QUANTUM_SEC,
  plotSnapshotCoverForecast: true,
  plotSnapshotLeadSec: SETTLEMENT_GRAPH_SNAPSHOT_LEAD_SEC,
  freezeRevealedPlotPrefix: true,
  freezeScaleMaxDuringReveal: true,
  bootFadeDurationMs: SETTLEMENT_GRAPH_BOOT_FADE_DURATION_MS,
  bootRevealDelayMs: SETTLEMENT_GRAPH_BOOT_FADE_DURATION_MS,
  getSystemTargetModeLabel: () => settlementGraphSeriesMenu?.getButtonLabel?.() ?? "Series 0/0",
  onToggleSystemTargetMode: () => settlementGraphSeriesMenu?.toggle?.(),
  showClose: false,
  showPin: false,
  draggable: false,
});
settlementGraphView.setHistoryZoneResolver?.((zoneSpec) => {
  const timeline = runner.getTimeline?.();
  const frontierState = getSettlementFrontierState();
  const baseBounds = runner.getEditableHistoryBounds?.();
  const baseSegments = computeHistoryZoneSegments({
    minSec: zoneSpec?.minSec,
    maxSec: zoneSpec?.maxSec,
    historyEndSec: zoneSpec?.historyEndSec,
    baseMinEditableSec: baseBounds?.minEditableSec,
  });
  const realizedSegments = getSettlementSelectedVassalRealizedSegments(
    frontierState,
    Math.floor(timeline?.historyEndSec ?? 0)
  );
  if (!realizedSegments.length) {
    return baseSegments;
  }
  return [
    ...baseSegments,
    ...realizedSegments.map((segment) => ({
      kind: "fixedHistory",
      startSec: segment.startSec,
      endSec: segment.endSec,
    })),
  ];
});
settlementGraphView.setCommitPolicyResolver?.(({ scrubSec, historyEndSec }) => {
  const frontierState = getSettlementFrontierState();
  const realizedSegments = getSettlementSelectedVassalRealizedSegments(
    frontierState,
    historyEndSec
  );
  for (const segment of realizedSegments) {
    const insideFixedSegment =
      scrubSec >= segment.startSec &&
      (scrubSec < segment.endSec ||
        (isSettlementStateRunComplete(frontierState) && scrubSec === segment.endSec));
    if (insideFixedSegment) {
      return { allow: false, reason: "Vassal history is fixed" };
    }
  }
  return { allow: true };
});

vassalLifeMapView = createVassalLifeMapView({
  layer: playfieldLayer,
  getPresentation: () => getSettlementLifeMapPresentation(),
  isVisible: () => worldViewMode === "vassalLife",
  onEnterNode: (nodeId) => dispatchLifeMapAction(ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId }),
  onSelectOption: (nodeId, optionId) => dispatchLifeMapAction(
    ActionKinds.VASSAL_SELECT_LIFE_OPTION, { nodeId, optionId }
  ),
  onPurchaseOffer: (nodeId, offerId) => dispatchLifeMapAction(
    ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId }
  ),
  onRerollShop: (nodeId) => dispatchLifeMapAction(ActionKinds.VASSAL_REROLL_SHOP, { nodeId }),
  onConfirmNode: (nodeId) => dispatchLifeMapAction(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId }),
  onChooseDevelopmentStat: (statId) => dispatchLifeMapAction(
    ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT, { statId }
  ),
  tooltipView,
});
vassalLifeMapView.setVisible(false);

function getSettlementVassalInterventionMarkers(state) {
  const lineage = state?.civilization?.vassalLineage;
  const selected = (lineage?.selectedVassalIds ?? [])
    .map((vassalId) => lineage?.vassalsById?.[vassalId])
    .filter(Boolean);
  const markerByKey = new Map();
  for (const vassal of selected) {
    for (const [index, event] of (vassal?.lifeEvents ?? []).entries()) {
      const tSec = Number.isFinite(event?.tSec) ? Math.max(0, Math.floor(event.tSec)) : null;
      if (tSec == null || event.kind === "selected") continue;
      const key = `${vassal.vassalId ?? "vassal"}:${index}:${tSec}`;
      markerByKey.set(key, {
        tSec,
        severity: event.kind === "died" ? "critical" : "warning",
        color: 0xd48f3f,
        lineWidth: 2,
        radius: 4,
        alpha: 0.92,
        tooltip: {
          title: `Vassal: ${event.kind}`,
          lines: [event.text ?? event.kind],
          maxWidth: 280,
        },
      });
    }
  }
  return [...markerByKey.values()];
}

settlementGraphView.setEventMarkerResolver?.(({
  historyEndSec,
  visibleForecastCoverageEndSec,
}) => {
  const frontierState = getSettlementFrontierState();
  const safeHistoryEndSec = Number.isFinite(historyEndSec)
    ? Math.max(0, Math.floor(historyEndSec))
    : 0;
  const runComplete = isSettlementStateRunComplete(frontierState);
  const boundarySeconds = getSettlementVassalBoundarySeconds(frontierState, safeHistoryEndSec);
  const boundaryMarkers = boundarySeconds
    .filter((sec, index, arr) => arr.indexOf(sec) === index)
    .map((tSec) => ({
      tSec,
      severity: "critical",
      color: 0xe3c46c,
      lineWidth: tSec === safeHistoryEndSec && !runComplete ? 4 : 3,
      radius: tSec === safeHistoryEndSec && !runComplete ? 6 : 5,
      alpha: tSec === safeHistoryEndSec && !runComplete ? 0.92 : 0.78,
    }));
  const elderMarkerCapSec = Number.isFinite(visibleForecastCoverageEndSec)
    ? Math.max(safeHistoryEndSec, Math.floor(visibleForecastCoverageEndSec))
    : safeHistoryEndSec;
  const elderMarkers = getSettlementVassalElderEventSeconds(
    frontierState,
    elderMarkerCapSec
  ).map((tSec) => ({
    tSec,
    severity: "critical",
    color: 0xa4be8d,
    lineWidth: 2,
    radius: 4,
    alpha: 0.86,
  }));
  const debugMarkers = getSettlementDebugOverrideMarkerSeconds().map((tSec) => ({
    tSec,
    severity: "critical",
    color: 0x7bdff2,
    lineWidth: 2,
    radius: 4,
    alpha: 0.9,
  }));
  const interventionMarkers = getSettlementVassalInterventionMarkers(frontierState);
  return [
    ...boundaryMarkers,
    ...elderMarkers,
    ...debugMarkers,
    ...interventionMarkers,
  ];
});

settlementVassalControlsView = createSettlementVassalControlsView({
  app,
  layer: controlLayer,
  getPrimaryState: () => getSettlementPrimaryVassalState(),
  onPrimary: () => {
    const current = getCurrentLifeMapVassal(getSettlementFrontierState());
    const historical = getSettlementViewedSec() < getSettlementFrontierSec()
      ? getSettlementLifeMapPresentation().vassal
      : null;
    if (current || historical) {
      setWorldViewMode(worldViewMode === "vassalLife" ? "map" : "vassalLife");
      return { ok: true };
    }
    if (isSettlementStateRunComplete(getSettlementFrontierState())) {
      return openSettlementRunCompleteOverlay();
    }
    setWorldViewMode("map");
    return openLifeMapVassalSelection();
  },
});

settlementVassalChooserView = createWorldMapVassalDrawerView({
  layer: controlLayer,
  getState: () => runner.getState?.(),
  getSelectionPool: () => settlementPendingVassalSelection,
  isOpen: () => worldViewMode === "map" && !!settlementPendingVassalSelection,
  onSelectCandidate: (candidateIndex) => selectLifeMapCandidate(candidateIndex),
  onReroll: () => rerollLifeMapCandidates(),
  onClose: () => closeSettlementVassalSelection(),
  onHoverCandidate: (candidate) => {
    settlementHoveredVassalCandidate = candidate;
    worldMapView?.refresh?.();
  },
});
runCompleteView = createRunCompleteView({
  app,
  layer: modalLayer,
});
function handleDebugFreshRunApplied(reason) {
  settlementPendingVassalSelection = null;
  settlementHoveredVassalCandidate = null;
  settlementLastVassalSelectionResult = null;
  settlementPendingPreviewRestoreSec = null;
  settlementDebugMenu?.close?.();
  runCompleteView?.close?.(reason);
  worldMapView?.resetEdgeTransferPackets?.();
  forecastWorkerService.handleTimelineInvalidation?.(`${reason}:freshRun`);
  settlementProjectionCache.clear?.();
  settlementGraphController?.handleInvalidate?.("init");
  runner.clearPreviewState?.();
  settlementGraphView?.resetForecastPreviewState?.();
  settlementGraphView?.resetDataContext?.();
  settlementGraphView?.restartForecastRevealFrom?.(0, {
    clearProjectionReplacementTransition: true,
  });
  setWorldViewMode("map");
  worldMapView?.refresh?.();
  settlementGraphView?.render?.();
}
mapLabController = createMapLabController({
  runner,
  setupId: BOOT_SETUP_ID,
  getGameConfig: () => debugConfigurationController?.getGameConfig?.() ?? null,
  onApplied: () => handleDebugFreshRunApplied("mapLabApply"),
});
debugConfigurationController = createDebugConfigurationController({
  runner,
  mapLabController,
  setupId: BOOT_SETUP_ID,
  onApplied: () => handleDebugFreshRunApplied("debugConfigurationApply"),
});
vassalDebugPresetController = createVassalDebugPresetController();
debugProfileController = createDebugProfileController({
  mapLabController,
  debugConfigurationController,
  vassalDebugPresetController,
});
settlementDebugMenu = createSettlementDebugMenuDom({
  getState: () => getSettlementViewedState(),
  getFrontierSec: () => getSettlementFrontierSec(),
  getViewedSec: () => getSettlementViewedSec(),
  getPreviewStatus: () => runner.getPreviewStatus?.(),
  applyOverrides: (overrides) => applySettlementDebugOverrides(overrides),
  getVassalSelectionPool: () => settlementPendingVassalSelection,
  isVassalSelectionOpen: () => !!settlementPendingVassalSelection,
  replaceVassalCandidate: (candidateIndex, spec) =>
    replaceSettlementVassalCandidate(candidateIndex, spec),
  getDebugSnapshot: () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.() ?? null,
  isInteractionBlocked: () => !!settlementPendingVassalSelection,
  mapLabController,
  debugConfigurationController,
  debugProfileController,
  vassalDebugPresetController,
});

function requestPauseBeforeDrag() {
  settlementGraphView?.suspendForecastRevealPlayheadFollow?.();
  setSettlementPlaybackTarget(0);
  ensureSettlementRunnerPaused();
}

function togglePause() {
  settlementGraphView?.suspendForecastRevealPlayheadFollow?.();
  if (getSettlementPlaybackTarget() !== 0) return requestPauseBeforeDrag();
  return setSettlementPlaybackTarget(1);
}

function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable === true
  );
}

function handleGlobalKeyDown(ev) {
  if (!ev || ev.repeat || isTypingTarget(ev.target)) return;
  if (ev.code === "Space" || ev.key === " ") {
    ev.preventDefault();
    togglePause();
  }
}

function resizeCanvas() {
  fitCanvasToViewport(app.view);
  stylePage();
  prototypeView?.refresh?.();
  worldMapView?.refresh?.();
  settlementDebugMenu?.refresh?.();
  settlementGraphView.render?.();
  settlementGraphSeriesMenu?.render?.();
  sunMoonDisksView.applyLayout?.();
  settlementVassalChooserView?.refresh?.();
  runCompleteView?.resize?.();
}

function publishSettlementDebugApi() {
  publishSettlementDebugApiForSettlement({
    getForecastStatus: () => settlementForecastController?.getForecastStatus?.() ?? null,
    getFrontierSec: () => getSettlementFrontierSec(),
    getViewedSec: () => getSettlementViewedSec(),
    getPreviewCapSec: () => getSettlementPreviewCapSec(),
    getPlaybackTarget: () => getSettlementPlaybackState().target,
    getPlaybackCurrent: () => getSettlementPlaybackState().current,
    getProjectedLossInfo: () => getProjectedSettlementLossInfo(),
    getDisplayedLossInfo: () => getSettlementLossInfoForDisplay(),
    getGraphDebugState: () => settlementGraphView?.getDebugState?.() ?? null,
    getGraphControllerData: () => settlementGraphController?.getData?.() ?? null,
    getProjectionForecastMeta: () =>
      settlementProjectionCache?.getForecastMeta?.() ?? null,
    getProjectionDebugSecondKeys: (limit) =>
      settlementProjectionCache?.getDebugSecondKeys?.(limit) ?? null,
    getViewSemanticSnapshot: () => prototypeView?.getSemanticSnapshot?.() ?? null,
    getWorldMapSnapshot: () => ({
      ...(worldMapView?.getSemanticSnapshot?.() ?? {}),
      mode: worldViewMode,
    }),
    getLifeMapPresentation: () => {
      const presentation = getSettlementLifeMapPresentation();
      return {
        vassalId: presentation.vassal?.vassalId ?? null,
        profileVassalId: presentation.profileVassal?.vassalId ?? null,
        readOnly: presentation.readOnly === true,
        viewedSec: presentation.viewedSec,
        frontierSec: presentation.frontierSec,
        committedNodeIds: presentation.committedNodeIds ?? [],
        playheadNodeId: presentation.playheadNodeId ?? null,
        profile: presentation.profileVassal ? {
          prestige: presentation.profileVassal.prestige,
          stats: presentation.profileVassal.stats,
          locationRegionId: presentation.profileVassal.locationRegionId,
        } : null,
      };
    },
    getWorldMapClickPoint: (regionId) => worldMapView?.getRegionClickPoint?.(regionId) ?? null,
    getTimeLeverScreenRect: () =>
      timeControlsView?.getTimeLeverScreenRect?.() ?? null,
    getTimeActionClickPoint: () =>
      timeControlsView?.getActionButtonClickPoint?.() ?? null,
    browseSecond: (tSec) => setSettlementViewedSecond(tSec, { mode: "browse" }),
    getVassalPrimaryClickPoint: () => settlementVassalControlsView?.getPrimaryClickPoint?.() ?? null,
    getVassalCandidateClickPoint: (candidateIndex) =>
      settlementVassalChooserView?.getCandidateClickPoint?.(candidateIndex) ??
      null,
    getVassalRerollClickPoint: () => settlementVassalChooserView?.getRerollClickPoint?.() ?? null,
    getVassalCloseClickPoint: () => settlementVassalChooserView?.getCloseClickPoint?.() ?? null,
    selectWorldRegion: (regionId) => {
      if (worldViewMode === "settlement") {
        if (!runner.getState?.()?.world?.regions?.some((entry) => entry.id === regionId)) {
          return false;
        }
        selectedWorldRegionId = regionId;
        setSettlementGraphContext("settlement", regionId);
        prototypeView?.refresh?.();
        worldMapView?.refresh?.();
        return true;
      }
      return selectWorldMapRegion(regionId);
    },
    getWorldPracticeClickPoint: (practiceId) => worldMapView?.getPracticeClickPoint?.(practiceId) ?? null,
    getWorldInstalledPracticeClickPoint: (installedIndex) =>
      worldMapView?.getInstalledPracticeClickPoint?.(installedIndex) ?? null,
    getViewedSlotSummary: () => getSettlementViewedSlotSummary(),
    getPendingCommitJob: () =>
      settlementForecastController?.getPendingCommitJob?.() ?? null,
    getTimeline: () => runner?.getTimeline?.() ?? null,
    getPreviewStatus: () => runner?.getPreviewStatus?.() ?? null,
    getCursorState: () => runner?.getCursorState?.() ?? null,
    getState: () => runner?.getState?.() ?? null,
    getFrontierState: () => getSettlementFrontierState(),
    getGraphPlotScreenRect: () => settlementGraphView?.getPlotScreenRect?.() ?? null,
    renderGraph: () => settlementGraphView?.render?.(),
    refreshPrototypeView: () => prototypeView?.refresh?.(),
    refreshWorldMap: () => worldMapView?.refresh?.(),
    getGraphController: () => settlementGraphController,
    hasStateDataAt: (tSec) =>
      settlementGraphController?.getStateDataAt?.(tSec) != null,
    hasStateAt: (tSec) => settlementGraphController?.getStateAt?.(tSec) != null,
    applyOverrides: (overrides) => applySettlementDebugOverrides(overrides),
    openNextSelection: () => openLifeMapVassalSelection(),
    selectCandidate: (candidateIndex) => selectLifeMapCandidate(candidateIndex),
    closeVassalSelection: () => closeSettlementVassalSelection(),
    getLastVassalSelectionResult: () => settlementLastVassalSelectionResult,
    getVassalSelectionPool: () => settlementPendingVassalSelection,
    isVassalSelectionOpen: () => !!settlementPendingVassalSelection,
    getLifeMapNodeClickPoint: (nodeId) => vassalLifeMapView?.getNodeClickPoint?.(nodeId) ?? null,
    getLifeMapEnterNodeClickPoint: () => vassalLifeMapView?.getEnterNodeClickPoint?.() ?? null,
    getLifeMapOptionClickPoint: (index) => vassalLifeMapView?.getOptionClickPoint?.(index) ?? null,
    getLifeMapOfferClickPoint: (index) => vassalLifeMapView?.getOfferClickPoint?.(index) ?? null,
    getLifeMapConfirmClickPoint: () => vassalLifeMapView?.getConfirmClickPoint?.() ?? null,
  });
}

runner.init();
const bootDebugProfile = debugProfileController.loadBootProfile();
if (bootDebugProfile.applied === true) {
  debugConfigurationController.applyToFreshRun();
}
requestPauseBeforeDrag();
syncSettlementGraphHorizon();
syncSettlementGraphRevealConfig();
syncSettlementVassalSelectionPauseState();
prototypeView.init();
worldMapView.init();
vassalLifeMapView.init();
setWorldViewMode("map");
settlementGraphView.open();
settlementGraphSeriesMenu?.render?.();
timeControlsView.init();
sunMoonDisksView.init();
settlementVassalControlsView.init();
settlementVassalChooserView.init();
runCompleteView.init();
settlementDebugMenu.init();
syncSettlementRunCompletePresentation();
publishSettlementDebugApi();

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", handleGlobalKeyDown);

app.ticker.add((delta) => {
  const frameDt = delta / 60;
  runner.update(frameDt);
  settlementGraphController.update?.();
  settlementForecastController?.syncObservedSurvivalYear?.();
  processSettlementPendingCommit();
  syncSettlementGraphRevealConfig();
  syncSettlementGraphHorizon();
  restoreSettlementPendingPreviewTarget();
  updateSettlementPreviewPlayback(frameDt);
  syncSettlementVassalSelectionPauseState();
  settlementGraphSeriesMenu?.syncSelection?.();
  prototypeView.update(frameDt);
  worldMapView.update(frameDt);
  vassalLifeMapView.update(frameDt);
  settlementGraphView.render();
  settlementGraphSeriesMenu?.render?.();
  timeControlsView.update(frameDt);
  sunMoonDisksView.update(frameDt);
  settlementVassalControlsView.update(frameDt);
  settlementVassalChooserView.update(frameDt);
  syncSettlementRunCompletePresentation();
  runCompleteView.update(frameDt);
  settlementDebugMenu.update(frameDt);
});
