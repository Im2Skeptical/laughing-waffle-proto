import { createGameSessionController } from "../controllers/game-session-controller.js";
import { createGameMenuDom } from "./game-menu-dom.js";
import { preloadChronicleArt } from './chronicle-art.js';
import { createChronicleFrame } from './chronicle-skin.js';
import { createTimelineAudio } from './timeline-audio.js';
const BOOT_SETUP_ID = "devPlaytesting01";

import { createSimRunner } from "../controllers/sim-runner.js";
import { createMapLabController } from "../controllers/map-lab-controller.js";
import { createDebugConfigurationController } from "../controllers/debug-configuration-controller.js";
import { createLifeMapLabController } from "../controllers/life-map-lab-controller.js";
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
  getSettlementPracticeSlotsByClass,
  getSettlementSelectedVassalRealizedSegments,
  getSettlementStructureSlots,
  getSettlementVassalBoundarySeconds,
  getSettlementVassalElderEventSeconds,
} from "../model/settlement-state.js";
import {
  getSettlementCurrentVassal,
  getSettlementFirstSelectedVassal,
  getVassalNodeDecisionPresentation,
  getVassalPendingResolution,
} from "../model/vassal-life-map.js";
import { getPrimaryDetailedSiteState } from "../model/world-state.js";
import { computeHistoryZoneSegments } from "../model/timegraph/edit-policy.js";
import { createTimeGraphController } from "../model/timegraph-controller.js";
import {
  VIEWPORT_DESIGN_HEIGHT,
  VIEWPORT_DESIGN_WIDTH,
} from "./layout-pixi.js";
import { createSettlementPrototypeView } from "./settlement-prototype-view.js";
import { createRunCompleteView } from "./run-complete-pixi.js";
import { createSettlementNavigationView } from "./settlement-navigation-pixi.js";
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
import { createSettlementPlayback } from "./ui-root/settlement-playback.js";
import { createSettlementVassalFlow } from "./ui-root/settlement-vassal-flow.js";
import {
  getLatestRunCompleteEntry,
  getSettlementNavigationState as buildSettlementNavigationState,
} from "./ui-root/settlement-navigation-state.js";
import { createSettlementDebugMenuDom } from "./settlement-debug-menu-dom.js";
import { createWorldMapView } from "./world-map-pixi.js";
import { createWorldMapVassalDrawerView } from "./world-map-vassal-drawer-pixi.js";
import { createVassalLifeMapView } from "./vassal-life-map-pixi.js";
import { createVassalLevelUpModalView } from "./vassal-level-up-modal-pixi.js";
import { createVassalNodeDecisionModalView } from "./vassal-node-decision-modal-pixi.js";

if (typeof globalThis !== "undefined" && globalThis.__PERF_ENABLED__ == null) {
  globalThis.__PERF_ENABLED__ = false;
}

export const app = new PIXI.Application({
  width: VIEWPORT_DESIGN_WIDTH,
  height: VIEWPORT_DESIGN_HEIGHT,
  backgroundColor: 0x121819,
  antialias: false,
});

installGlobalTextStylePolicy(PIXI, {
  fontFamily: "Georgia",
  titleVariant: "small-caps",
  titleMinSize: 32,
  titleWeightMinSize: 26,
});
preloadChronicleArt();

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
  document.body.style.backgroundColor = "#090e10";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.height = "100%";
  document.documentElement.style.backgroundColor = "#090e10";
  document.documentElement.style.height = "100%";
}

fitCanvasToViewport(app.view);
stylePage();

const playfieldLayer = new PIXI.Container();
createChronicleFrame(app.stage);
const graphLayer = new PIXI.Container();
const controlLayer = new PIXI.Container();
controlLayer.sortableChildren = true;
const tooltipLayer = new PIXI.Container();
const modalLayer = new PIXI.Container();
const SETTLEMENT_GRAPH_WINDOW_SEC =
  Math.max(1, Math.floor(SEASON_DURATION_SEC)) *
  4 *
  Math.max(1, Math.floor(SETTLEMENT_VISIBLE_WINDOW_YEARS));
const MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES = 24;
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
let settlementNavigationView = null;
let vassalLifeMapView = null;
let vassalNodeDecisionModalView = null;
let vassalLevelUpModalView = null;
let runCompleteView = null;
let settlementForecastController = null;
let settlementGraphSeriesMenu = null;
let settlementDebugMenu = null;
let mapLabController = null;
let debugConfigurationController = null;
let lifeMapLabController = null;
let vassalDebugPresetController = null;
let debugProfileController = null;
let settlementGraphHorizonOverrideSec = null;
let settlementGraphRevealMode = "";
let settlementEdgeTransferBatchCache = {
  key: null,
  batch: null,
};

function setWorldViewMode(mode) {
  const nextWorldViewMode = mode === "settlement" ? "settlement" : mode === "vassalLife" ? "vassalLife" : "map";
  if (nextWorldViewMode !== worldViewMode) {
    // Navigation is passive: preserve the current visual forecast edge until
    // an explicit game action begins a new reveal.
    settlementGraphView?.pauseForecastReveal?.();
  }
  worldViewMode = nextWorldViewMode;
  const settlementVisible = worldViewMode === "settlement";
  const lifeMapVisible = worldViewMode === "vassalLife";
  worldMapRegionSelectionActive = settlementVisible;
  prototypeView?.setVisible?.(settlementVisible);
  worldMapView?.setVisible?.(!settlementVisible && !lifeMapVisible);
  vassalLifeMapView?.setVisible?.(lifeMapVisible);
  if (!lifeMapVisible) vassalNodeDecisionModalView?.close?.();
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
  if (contextChanged && nextScope === "settlement") settlementGraphSeriesMenu?.selectDefaultGroup?.();
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

const settlementPlayback = createSettlementPlayback({
  getRunner: () => runner,
  getForecastController: () => settlementForecastController,
  getGraphController: () => settlementGraphController,
  getGraphView: () => settlementGraphView,
  onInvalidateProjectedLoss: invalidateSettlementProjectedLossCache,
  onSyncGraphHorizon: syncSettlementGraphHorizon,
});
const {
  getSettlementPreviewCapSec,
  getSettlementViewedSec,
  getSettlementVisualTime,
  ensureSettlementRunnerPaused,
  getSettlementPlaybackTarget,
  setSettlementPlaybackTarget,
  getSettlementPlaybackState,
  getSettlementViewedState,
  getSettlementFrontierSec,
  getSettlementFrontierState,
  getSettlementLifeMapPresentation,
  setSettlementViewedSecond,
  restoreSettlementPendingPreviewTarget,
  updateSettlementPreviewPlayback,
  returnSettlementViewToPresent,
} = settlementPlayback;

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
  // Changing screen pauses a reveal. Navigate first, then explicitly restart
  // the civilization reveal so a completed Vassal immediately exposes the
  // next forecast span rather than leaving it frozen at the boundary.
  setWorldViewMode("map");
  syncSettlementGraphHorizon();
  settlementGraphView?.restartForecastRevealFrom?.(getSettlementFrontierSec(), {
    allowForecastStart: true,
  });
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

const settlementVassalFlow = createSettlementVassalFlow({
  getRunner: () => runner,
  playback: settlementPlayback,
  getForecastController: () => settlementForecastController,
  getGraphController: () => settlementGraphController,
  getGraphView: () => settlementGraphView,
  getChooserView: () => settlementVassalChooserView,
  getWorldMapView: () => worldMapView,
  getLifeMapView: () => vassalLifeMapView,
  getNodeDecisionView: () => vassalNodeDecisionModalView,
  getLevelUpView: () => vassalLevelUpModalView,
  getPrototypeView: () => prototypeView,
  getNavigationView: () => settlementNavigationView,
  requestPause: () => requestPauseBeforeDrag(),
  setWorldViewMode,
  setSelectedWorldRegionId: (regionId) => {
    selectedWorldRegionId = regionId;
  },
  isRunComplete: isSettlementStateRunComplete,
  revealCivilizationAfterVassalEnd,
  onInvalidateProjectedLoss: invalidateSettlementProjectedLossCache,
  onSyncGraphHorizon: syncSettlementGraphHorizon,
  getLossInfoForDisplay: getSettlementLossInfoForDisplay,
});
const {
  syncSettlementVassalSelectionPauseState,
  closeSettlementVassalSelection,
  openLifeMapVassalSelection,
  dispatchLifeMapAction,
  selectLifeMapCandidate,
  previewLifeMapCandidate,
  rerollLifeMapCandidates,
  replaceSettlementVassalCandidate,
} = settlementVassalFlow;

function applySettlementDebugOverrides(overrides) {
  const cleanOverrides = (Array.isArray(overrides) ? overrides : []).filter(
    (override) => override && typeof override === "object"
  );
  if (!cleanOverrides.length) return { ok: false, reason: "noOverrides" };

  setSettlementPlaybackTarget(0);
  const viewedSec = getSettlementViewedSec();
  const targetSec = Math.max(0, Math.floor(viewedSec));
  const frontierBeforeEdit = getSettlementFrontierSec();
  const hadPendingSelection = !!settlementVassalFlow.getPendingSelection();
  settlementVassalFlow.clearPendingSelection();
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
      const frontierState = getSettlementFrontierState();
      const forecastStatus = settlementForecastController?.getForecastStatus?.() ?? null;
      settlementVassalFlow.restorePendingSelection(
        frontierState,
        forecastStatus?.nextVassalEnabled === true
      );
    }
    syncSettlementGraphHorizon();
    if (targetSec > getSettlementFrontierSec()) {
      settlementGraphController?.ensureForecastCoverageTo?.(targetSec);
      settlementGraphView?.restartForecastRevealFrom?.(targetSec, {
        allowForecastStart: true,
        clearProjectionReplacementTransition: true,
      });
      settlementPlayback.setPendingPreviewRestoreSec(targetSec);
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

function getSettlementNavigationState() {
  return buildSettlementNavigationState({
    frontierState: getSettlementFrontierState(),
    viewedState: getSettlementViewedState(),
    frontierSec: getSettlementFrontierSec(),
    viewedSec: getSettlementViewedSec(),
    presentation: getSettlementLifeMapPresentation(),
    worldViewMode,
    pendingVassalSelection: settlementVassalFlow.getPendingSelection(),
    selectedVassalCandidateIndex: settlementVassalFlow.getSelectedCandidateIndex(),
    selectedWorldRegionId,
    worldMapRegionSelectionActive,
  });
}

function focusSettlementVassalLocation({ openSettlement = false } = {}) {
  const location = getSettlementNavigationState().location;
  if (!location || (openSettlement && !location.hasSettlement)) return;
  if (settlementVassalFlow.getPendingSelection()) closeSettlementVassalSelection();
  selectedWorldRegionId = location.regionId;
  setWorldViewMode(openSettlement ? "settlement" : "map");
  worldMapRegionSelectionActive = true;
  setSettlementGraphContext(location.hasSettlement ? "settlement" : "civilization", location.regionId);
  worldMapView?.refresh?.();
  prototypeView?.refresh?.();
}

function navigateSettlementControl(id) {
  const destination = getSettlementNavigationState().destinations.find((entry) => entry.id === id);
  if (!destination || destination.enabled === false) return;
  tooltipView?.hide?.();
  if (id === "vassal") {
    if (settlementVassalFlow.getPendingSelection()) {
      return selectLifeMapCandidate(settlementVassalFlow.getSelectedCandidateIndex());
    }
    if (isSettlementStateRunComplete(getSettlementFrontierState())) return openSettlementRunCompleteOverlay();
    return openLifeMapVassalSelection();
  }
  if (settlementVassalFlow.getPendingSelection()) closeSettlementVassalSelection();
  if (id === "settlement") selectedWorldRegionId = destination.regionId;
  setWorldViewMode(id === "life" ? "vassalLife" : id === "settlement" ? "settlement" : "map");
  prototypeView?.refresh?.();
  worldMapView?.refresh?.();
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
      ? ["food", "gold", "totalPopulation", "housingCapacity"]
      : ["monsterCount", "chaosResistance", "chaosRawPressure"],
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
  getVisualTime: getSettlementVisualTime,
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
    const candidate = settlementVassalFlow.getHoveredCandidate();
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
    x: 2286,
    y: 942,
    scale: 0.4752,
  },
  season: {
    ...SUN_AND_MOON_DISKS_LAYOUT.season,
    x: 2286,
    y: 942,
    scale: 0.72,
  },
};

const timeControlsView = createTimeControlsView({
  app,
  layer: controlLayer,
  getGameState: () => ({
    ...(getSettlementViewedState() ?? {}),
    paused: getSettlementPlaybackTarget() === 0 && !settlementGraphView?.isFollowingForecastReveal?.(),
    followingForecast: settlementGraphView?.isFollowingForecastReveal?.() === true,
  }),
  getTimeScale: () => getSettlementPlaybackState(),
  setTimeScaleTarget: (speed, opts) => {
    settlementGraphView?.suspendForecastRevealPlayheadFollow?.();
    return setSettlementPlaybackTarget(speed, opts);
  },
  layout: {
    enabled: true,
    zIndex: 4,
    screenPadding: 16,
    diskTextureRadiusPx: 220,
  },
  sunMoonLayout: DISK_LAYOUT,
});

const sunMoonDisksView = createSunAndMoonDisksView({
  app,
  layer: controlLayer,
  referenceLayer: modalLayer,
  getState: () => getSettlementViewedState(),
  getVisualTime: getSettlementVisualTime,
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
  canAutoPreviewForecastReveal: () => !settlementVassalFlow.getPendingSelection(),
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
  openPosition: { x: 356, y: 828 },
  windowWidth: 1700,
  windowHeight: 258,
  displayScale: 0.935,
  headerHeight: 42,
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
  onToggleSystemTargetMode: () => settlementGraphSeriesMenu?.toggle?.(),
  getActiveSeriesGroups: () => settlementGraphSeriesMenu?.getActiveGroups?.() ?? [],
  onToggleSeriesGroup: (id) => settlementGraphSeriesMenu?.toggleGroup?.(id),
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
  getCivilizationLossInfo: () => getSettlementLossInfoForDisplay(),
  layer: playfieldLayer,
  tooltipView,
  getPresentation: () => getSettlementLifeMapPresentation(),
  isVisible: () => worldViewMode === "vassalLife",
  onEnterNode: (nodeId) => dispatchLifeMapAction(ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId }),
  onReadOnlyAction: () => settlementNavigationView?.showReadOnlyFeedback?.(),
  onOpenDecision: (nodeId) => {
    tooltipView?.hide?.();
    vassalNodeDecisionModalView?.open?.(nodeId);
  },
});
vassalLifeMapView.setVisible(false);

vassalNodeDecisionModalView = createVassalNodeDecisionModalView({
  app,
  layer: modalLayer,
  getState: () => getSettlementViewedState(),
  getPresentation: () => getSettlementLifeMapPresentation(),
  onReadOnlyAction: () => settlementNavigationView?.showReadOnlyFeedback?.(),
  getDecisionPresentation: (nodeId, preview) => getVassalNodeDecisionPresentation(
    getSettlementFrontierState(), nodeId, preview
  ),
  onEnterNode: (nodeId) => dispatchLifeMapAction(ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId }),
  onSelectOption: (nodeId, optionId) => dispatchLifeMapAction(
    ActionKinds.VASSAL_SELECT_LIFE_OPTION, { nodeId, optionId }
  ),
  onPurchaseOffer: (nodeId, offerId, origin, toIndex) => dispatchLifeMapAction(
    ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId, origin, toIndex }
  ),
  onMoveStructure: (nodeId, offerId, origin) => dispatchLifeMapAction(
    ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE, { nodeId, offerId, origin }
  ),
  onUndoPurchase: (nodeId, offerId) => dispatchLifeMapAction(
    ActionKinds.VASSAL_UNDO_SHOP_PURCHASE, { nodeId, offerId }
  ),
  onReorderPurchase: (nodeId, offerId, toIndex) => dispatchLifeMapAction(
    ActionKinds.VASSAL_REORDER_SHOP_PURCHASE, { nodeId, offerId, toIndex }
  ),
  onRerollShop: (nodeId) => dispatchLifeMapAction(ActionKinds.VASSAL_REROLL_SHOP, { nodeId }),
  onConfirmNode: (nodeId) => dispatchLifeMapAction(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId }),
  onWorldMap: (regionId) => {
    if (regionId) selectedWorldRegionId = regionId;
    setWorldViewMode("map");
    worldMapView?.refresh?.();
  },
});

vassalLevelUpModalView = createVassalLevelUpModalView({
  app,
  layer: modalLayer,
  getPresentation: () => getSettlementLifeMapPresentation(),
  isLifegraphVisible: () => worldViewMode === "vassalLife",
  onChoose: (choiceId, statId) => dispatchLifeMapAction(
    ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT, { choiceId, statId }
  ),
  onWorldMap: (regionId) => {
    if (regionId) selectedWorldRegionId = regionId;
    setWorldViewMode("map");
    worldMapView?.refresh?.();
  },
});

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

settlementNavigationView = createSettlementNavigationView({
  app,
  layer: modalLayer,
  getState: getSettlementNavigationState,
  onNavigate: navigateSettlementControl,
  onLocateVassal: () => focusSettlementVassalLocation(),
  onOpenVassalSettlement: () => focusSettlementVassalLocation({ openSettlement: true }),
  onReturnToPresent: () => {
    tooltipView?.hide?.();
    settlementGraphView?.suspendForecastRevealPlayheadFollow?.();
    return returnSettlementViewToPresent();
  },
  tooltipView,
});

settlementVassalChooserView = createWorldMapVassalDrawerView({
  layer: controlLayer,
  getState: () => runner.getState?.(),
  getSelectionPool: () => settlementVassalFlow.getPendingSelection(),
  getSelectedCandidateIndex: () => settlementVassalFlow.getSelectedCandidateIndex(),
  isOpen: () => worldViewMode === "map" && !!settlementVassalFlow.getPendingSelection(),
  onPreviewCandidate: (candidateIndex) => previewLifeMapCandidate(candidateIndex),
  onConfirmCandidate: (candidateIndex) => selectLifeMapCandidate(candidateIndex),
  onReroll: () => rerollLifeMapCandidates(),
  onClose: () => closeSettlementVassalSelection(),
  onHoverCandidate: (candidate) => settlementVassalFlow.hoverCandidate(candidate),
});
runCompleteView = createRunCompleteView({
  app,
  layer: modalLayer,
});
function handleDebugFreshRunApplied(reason) {
  requestPauseBeforeDrag();
  settlementVassalFlow.resetSelectionForFreshRun();
  settlementPlayback.clearPendingPreviewRestore();
  settlementDebugMenu?.close?.();
  runCompleteView?.close?.(reason);
  worldMapView?.resetEdgeTransferPackets?.();
  forecastWorkerService.handleTimelineInvalidation?.(`${reason}:freshRun`);
  settlementProjectionCache.clear?.();
  settlementGraphController?.handleInvalidate?.("init");
  runner.clearPreviewState?.();
  settlementGraphView?.resetForecastPreviewState?.();
  settlementGraphView?.resetDataContext?.();
  // Navigation and transport reset must precede the new reveal: neither is
  // player intervention that should detach or pause its default follow.
  setWorldViewMode("map");
  settlementGraphSeriesMenu?.reset?.();
  settlementGraphView?.restartForecastRevealFrom?.(0, {
    clearProjectionReplacementTransition: true,
  });
  worldMapView?.refresh?.();
  settlementGraphView?.render?.();
}
mapLabController = createMapLabController({
  runner,
  setupId: BOOT_SETUP_ID,
  getGameConfig: () => debugConfigurationController?.getGameConfig?.() ?? null,
  onApplied: () => handleDebugFreshRunApplied("mapLabApply"),
});
lifeMapLabController = createLifeMapLabController();
debugConfigurationController = createDebugConfigurationController({
  runner,
  mapLabController,
  lifeMapLabController,
  setupId: BOOT_SETUP_ID,
  onApplied: () => handleDebugFreshRunApplied("debugConfigurationApply"),
});
vassalDebugPresetController = createVassalDebugPresetController();
debugProfileController = createDebugProfileController({
  mapLabController,
  lifeMapLabController,
  debugConfigurationController,
  vassalDebugPresetController,
});
settlementDebugMenu = createSettlementDebugMenuDom({
  getState: () => getSettlementViewedState(),
  getFrontierSec: () => getSettlementFrontierSec(),
  getViewedSec: () => getSettlementViewedSec(),
  getPreviewStatus: () => runner.getPreviewStatus?.(),
  applyOverrides: (overrides) => applySettlementDebugOverrides(overrides),
  getVassalSelectionPool: () => settlementVassalFlow.getPendingSelection(),
  isVassalSelectionOpen: () => !!settlementVassalFlow.getPendingSelection(),
  replaceVassalCandidate: (candidateIndex, spec) =>
    replaceSettlementVassalCandidate(candidateIndex, spec),
  getDebugSnapshot: () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.() ?? null,
  isInteractionBlocked: () => !!settlementVassalFlow.getPendingSelection(),
  mapLabController,
  lifeMapLabController,
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
  const following = settlementGraphView?.isFollowingForecastReveal?.() === true;
  settlementGraphView?.suspendForecastRevealPlayheadFollow?.();
  if (following || getSettlementPlaybackTarget() !== 0) return requestPauseBeforeDrag();
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
  if (gameSession.isInMenu() || !ev || ev.repeat || isTypingTarget(ev.target)) return;
  if (ev.key === "Escape" && vassalNodeDecisionModalView?.isOpen?.()) {
    ev.preventDefault();
    vassalNodeDecisionModalView.close();
    return;
  }
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
  vassalNodeDecisionModalView?.resize?.();
  vassalLevelUpModalView?.resize?.();
}

function publishSettlementDebugApi() {
  publishSettlementDebugApiForSettlement({
    getForecastStatus: () => settlementForecastController?.getForecastStatus?.() ?? null,
    getFrontierSec: () => getSettlementFrontierSec(),
    getViewedSec: () => getSettlementViewedSec(),
    getPreviewCapSec: () => getSettlementPreviewCapSec(),
    getPlaybackTarget: () => getSettlementPlaybackState().target,
    getPlaybackCurrent: () => getSettlementPlaybackState().current,
    getTooltipDebugState: () => tooltipView.getDebugState(),
    getProjectedLossInfo: () => getProjectedSettlementLossInfo(),
    getDisplayedLossInfo: () => getSettlementLossInfoForDisplay(),
    getGraphDebugState: () => ({ ...settlementGraphView?.getDebugState?.(), seriesMenu: settlementGraphSeriesMenu?.getDebugState?.() }),
    getGraphControllerData: () => settlementGraphController?.getData?.() ?? null,
    getProjectionForecastMeta: () =>
      settlementProjectionCache?.getForecastMeta?.() ?? null,
    getProjectionDebugSecondKeys: (limit) =>
      settlementProjectionCache?.getDebugSecondKeys?.(limit) ?? null,
    getViewSemanticSnapshot: () => prototypeView?.getSemanticSnapshot?.() ?? null,
    getWorldMapSnapshot: () => ({
      ...(worldMapView?.getSemanticSnapshot?.() ?? {}),
      mode: worldViewMode,
      presentationTimeSec: getSettlementVisualTime(),
      audio: timelineAudio.getSnapshot(),
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
    getLifeMapDecisionSnapshot: () => vassalNodeDecisionModalView?.getSemanticSnapshot?.() ?? null,
    getLifeMapLevelUpSnapshot: () => vassalLevelUpModalView?.getSemanticSnapshot?.() ?? null,
    getWorldMapClickPoint: (regionId) => worldMapView?.getRegionClickPoint?.(regionId) ?? null,
    getTimeLeverScreenRect: () =>
      timeControlsView?.getTimeLeverScreenRect?.() ?? null,
    getTimeWheelSnapshot: () => sunMoonDisksView?.getSemanticSnapshot?.() ?? null,
    getPhaseReferenceSnapshot: () => sunMoonDisksView?.getPhaseReferenceSnapshot?.() ?? null,
    getPhaseReferenceClickPoint: id => sunMoonDisksView?.getPhaseReferenceClickPoint?.(id) ?? null,
    getTimeActionClickPoint: () =>
      settlementNavigationView?.getClickPoint?.("present") ?? null,
    browseSecond: (tSec) => setSettlementViewedSecond(tSec, { mode: "browse" }),
    getNavigationSnapshot: () => settlementNavigationView?.getSemanticSnapshot?.() ?? null,
    getNavigationClickPoint: (id) => settlementNavigationView?.getClickPoint?.(id) ?? null,
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
    enterBootTestRun: () => { gameSession.resume(); gameMenu.hide(); },
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
    getLastVassalSelectionResult: () => settlementVassalFlow.getLastSelectionResult(),
    getVassalSelectionPool: () => settlementVassalFlow.getPendingSelection(),
    isVassalSelectionOpen: () => !!settlementVassalFlow.getPendingSelection(),
    getLifeMapNodeClickPoint: (nodeId) => vassalLifeMapView?.getNodeClickPoint?.(nodeId) ?? null,
    getLifeMapEnterNodeClickPoint: () => vassalNodeDecisionModalView?.getEnterNodeClickPoint?.() ?? null,
    getLifeMapOptionClickPoint: (index) => vassalNodeDecisionModalView?.getOptionClickPoint?.(index) ?? null,
    getLifeMapOfferFacePoint: index => vassalNodeDecisionModalView?.getOfferFacePoint?.(index) ?? null,
    getLifeMapInspectionClosePoint: () => vassalNodeDecisionModalView?.getInspectionClosePoint?.() ?? null,
    getLifeMapInspectionCostPoint: () => vassalNodeDecisionModalView?.getInspectionCostPoint?.() ?? null,
    getLifeMapTableauClickPoint: index => vassalNodeDecisionModalView?.getTableauClickPoint?.(index) ?? null,
    getLifeMapConstructionPoint: origin => vassalNodeDecisionModalView?.getConstructionPoint?.(origin) ?? null,
    getLifeMapUndoClickPoint: index => vassalNodeDecisionModalView?.getUndoClickPoint?.(index) ?? null,
    getLifeMapOfferClickPoint: (index) => vassalNodeDecisionModalView?.getOfferClickPoint?.(index) ?? null,
    getLifeMapConfirmClickPoint: () => vassalNodeDecisionModalView?.getConfirmClickPoint?.() ?? null,
    getLifeMapLevelUpChoiceClickPoint: (index) =>
      vassalLevelUpModalView?.getChoiceClickPoint?.(index) ?? null,
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
vassalNodeDecisionModalView.init();
vassalLevelUpModalView.init();
setWorldViewMode("map");
settlementGraphView.open();
settlementGraphSeriesMenu?.render?.();
timeControlsView.init();
sunMoonDisksView.init();
settlementNavigationView.init();
settlementVassalChooserView.init();
runCompleteView.init();
settlementDebugMenu.init();
syncSettlementRunCompletePresentation();
publishSettlementDebugApi();

let gameMenu;
const gameSession = createGameSessionController({
  runner,
  onEnter: () => {
    handleDebugFreshRunApplied("sessionEnter");
  },
  onError: (message) => gameMenu?.showError(message),
  onSaved: () => gameMenu?.clearError(),
});
gameMenu = createGameMenuDom({
  session: gameSession,
  onResume: () => settlementGraphView?.setPresentationSuspended?.(false),
  onPause: () => {
    settlementGraphView?.setPresentationSuspended?.(true);
    timelineAudio?.update(0);
  },
});
setInterval(() => { if (!gameSession.isInMenu()) gameSession.save(); }, 10000);

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", handleGlobalKeyDown);

const timelineAudio = createTimelineAudio({
  getTime:getSettlementVisualTime,
  getRate:getSettlementPlaybackTarget,
  isSuspended:()=>gameSession.isInMenu()||gameMenu.requiresLandscape(),
  parent:document.querySelector('[data-testid="utility-controls"]'),
});

app.ticker.add((delta) => {
  if (gameSession.isInMenu() || gameMenu.requiresLandscape()) {
    timelineAudio.update(0);
    return;
  }
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
  vassalNodeDecisionModalView.update(frameDt);
  vassalLevelUpModalView.update(frameDt);
  settlementGraphView.render();
  settlementGraphSeriesMenu?.render?.();
  timeControlsView.update(frameDt);
  sunMoonDisksView.update(frameDt);
  timelineAudio.update(frameDt);
  settlementNavigationView.update(frameDt);
  settlementVassalChooserView.update(frameDt);
  syncSettlementRunCompletePresentation();
  runCompleteView.update(frameDt);
  settlementDebugMenu.update(frameDt);
});
