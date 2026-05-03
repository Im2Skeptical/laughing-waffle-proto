const BOOT_SETUP_ID = "devPlaytesting01";

import { createSimRunner } from "../controllers/sim-runner.js";
import { createSettlementForecastController } from "../controllers/settlement-forecast-controller.js";
import { createTimegraphForecastWorkerService } from "../controllers/timegraph-forecast-worker-service.js";
import {
  SEASON_DURATION_SEC,
  SETTLEMENT_VISIBLE_WINDOW_YEARS,
} from "../defs/gamesettings/gamerules-defs.js";
import { ActionKinds } from "../model/actions.js";
import { GRAPH_METRICS } from "../model/graph-metrics.js";
import {
  getSettlementClassIds,
  getSettlementCurrentVassal,
  getSettlementFirstSelectedVassal,
  getSettlementPracticeSlotsByClass,
  getSettlementSelectedVassalRealizedSegments,
  getSettlementStructureSlots,
  getSettlementVassalBoundarySeconds,
} from "../model/settlement-state.js";
import { buildSettlementVassalSelectionPool } from "../model/settlement-vassal-exec.js";
import { computeHistoryZoneSegments } from "../model/timegraph/edit-policy.js";
import { createTimeGraphController } from "../model/timegraph-controller.js";
import {
  VIEWPORT_DESIGN_HEIGHT,
  VIEWPORT_DESIGN_WIDTH,
} from "./layout-pixi.js";
import { createSettlementPrototypeView } from "./settlement-prototype-view.js";
import { createRunCompleteView } from "./run-complete-pixi.js";
import { createSettlementVassalChooserView } from "./settlement-vassal-chooser-pixi.js";
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
let settlementGraphController = null;
let selectedPracticeClassId = "villager";
let settlementGraphView = null;
let settlementVassalChooserView = null;
let settlementVassalControlsView = null;
let runCompleteView = null;
let settlementForecastController = null;
let settlementGraphSeriesMenu = null;
let settlementDebugMenu = null;
let settlementPendingVassalSelection = null;
let settlementVassalSelectionWasOpen = false;
let settlementVassalSelectionResumeSpeed = 0;
let settlementLastVassalSelectionResult = null;
let settlementGraphHorizonOverrideSec = null;
let settlementPlaybackSpeedTarget = 0;
let settlementPlaybackSpeedCurrent = 0;
let settlementPlaybackViewSecFloat = null;
let settlementGraphRevealMode = "";
let settlementPendingPreviewRestoreSec = null;
let settlementFrontierStateCache = {
  historyEndSec: -1,
  revision: -1,
  state: null,
};
const SETTLEMENT_AUTO_COMMIT_BUFFER_SEC = 16;
const SETTLEMENT_AUTO_COMMIT_CHUNK_SEC = 128;
const SETTLEMENT_AUTO_COMMIT_MIN_INTERVAL_MS = 900;
const SETTLEMENT_AUTO_COMMIT_FORCE_LAG_SEC = 448;
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
  const deathSec = Number.isFinite(currentVassal?.deathSec)
    ? Math.max(0, Math.floor(currentVassal.deathSec))
    : null;
  if (deathSec == null || deathSec <= frontierSec) return null;
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
    if (action?.kind !== ActionKinds.DEBUG_SET_SETTLEMENT_SLOT_OVERRIDES) continue;
    const tSec = Math.max(0, Math.floor(action?.tSec ?? 0));
    if (!seconds.includes(tSec)) seconds.push(tSec);
  }
  return seconds.sort((a, b) => a - b);
}

function getSettlementViewedSlotSummary() {
  const state = getSettlementViewedState();
  if (!state?.hub) return null;
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

function processSettlementPendingCommit() {
  settlementForecastController?.processPendingCommit?.({
    clearForecastRevealRestart: () =>
      settlementGraphView?.clearForecastRevealRestart?.(),
  });
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

function openNextSettlementVassalSelection() {
  settlementLastVassalSelectionResult = null;
  let frontierState = getSettlementFrontierState();
  let frontierSec = getSettlementFrontierSec();
  const forecastStatus = settlementForecastController?.getForecastStatus?.() ?? null;
  if (isSettlementStateRunComplete(frontierState)) {
    return { ok: false, reason: "runComplete" };
  }
  if (forecastStatus?.nextVassalEnabled !== true) {
    return { ok: false, reason: "currentVassalDeathUnresolved" };
  }
  const currentVassal = getSettlementCurrentVassal(frontierState);
  if (currentVassal && currentVassal.isDead !== true) {
    const deathSec = Number.isFinite(forecastStatus?.currentVassalDeathSec)
      ? Math.max(frontierSec, Math.floor(forecastStatus.currentVassalDeathSec))
      : null;
    if (deathSec == null || forecastStatus?.currentVassalDeathResolved !== true) {
      return { ok: false, reason: "currentVassalDeathUnresolved" };
    }
    const commitRes = runner.commitCursorSecond?.(deathSec);
    if (commitRes?.ok !== true) {
      return commitRes ?? { ok: false, reason: "commitFailed" };
    }
    clearSettlementPendingCommitJob();
    settlementGraphView?.clearForecastRevealRestart?.();
    runner.clearPreviewState?.();
    runner.browseCursorSecond?.(deathSec);
    invalidateSettlementProjectedLossCache();
    frontierState = getSettlementFrontierState();
    frontierSec = getSettlementFrontierSec();
  }
  settlementVassalSelectionResumeSpeed = shouldResumeAfterBlockingVassalSelection()
    ? getSettlementPlaybackTarget()
    : 0;
  requestPauseBeforeDrag();
  setSettlementViewedSecond(frontierSec);
  settlementGraphView?.resetForecastPreviewState?.();
  settlementPendingVassalSelection = buildSettlementVassalSelectionPool(frontierState, frontierSec);
  const result = settlementPendingVassalSelection
    ? { ok: true, poolId: settlementPendingVassalSelection.poolId }
    : { ok: false, reason: "poolFailed" };
  if (!result?.ok) settlementVassalSelectionResumeSpeed = 0;
  syncSettlementVassalSelectionPauseState();
  return result;
}

function selectSettlementVassal(candidateIndex) {
  const frontierSec = getSettlementFrontierSec();
  const selectionPool = settlementPendingVassalSelection;
  if (!selectionPool) {
    return { ok: false, reason: "missingSelectionPool" };
  }
  const selectionSec = Number.isFinite(selectionPool?.createdSec)
    ? Math.max(0, Math.floor(selectionPool.createdSec))
    : frontierSec;
  const isFirstVassalSelection =
    selectionSec === 0 && !getSettlementFirstSelectedVassal(getSettlementFrontierState());
  const moveRes = setSettlementViewedSecond(selectionSec);
  if (moveRes?.ok !== true) {
    settlementGraphView?.clearProjectionReplacementTransition?.();
    settlementVassalChooserView?.refresh?.();
    settlementLastVassalSelectionResult =
      moveRes ?? { ok: false, reason: "selectionSeekFailed" };
    return settlementLastVassalSelectionResult;
  }
  settlementGraphView?.resetForecastPreviewState?.();
  settlementGraphView?.stageProjectionReplacementTransition?.({
    truncationStartSec: selectionSec,
    transitionDurationMs: SETTLEMENT_VASSAL_GRAPH_REPLACE_TRANSITION_MS,
    flashDurationMs: SETTLEMENT_VASSAL_GRAPH_REPLACE_FLASH_MS,
    fadeStrength: SETTLEMENT_VASSAL_GRAPH_REPLACE_FADE_STRENGTH,
  });
  const actionPayload = {
    candidateIndex,
    expectedPoolHash: selectionPool?.expectedPoolHash ?? null,
    tSec: selectionSec,
  };
  const result = isFirstVassalSelection
    ? runner.dispatchActionAtSecond?.(
        ActionKinds.SETTLEMENT_SELECT_VASSAL,
        actionPayload,
        selectionSec,
        { reason: "settlementFirstVassalSelection" }
      )
    : runner.dispatchActionAtCurrentSecond?.(
        ActionKinds.SETTLEMENT_SELECT_VASSAL,
        actionPayload
      );
  settlementLastVassalSelectionResult = result ?? { ok: false, reason: "dispatchFailed" };
  if (result?.ok) {
    if (isFirstVassalSelection) {
      runner.browseCursorSecond?.(selectionSec);
    }
    settlementPendingVassalSelection = null;
    invalidateSettlementProjectedLossCache();
    const frontierState = getSettlementFrontierState();
    const currentVassal = getSettlementCurrentVassal(frontierState);
    scheduleSettlementPendingCommit(selectionSec, currentVassal);
    syncSettlementGraphHorizon();
    settlementGraphView?.restartForecastRevealFrom?.(selectionSec, {
      activateProjectionReplacementTransition: true,
      extraStartDelayMs: SETTLEMENT_VASSAL_GRAPH_REPLACE_TRANSITION_MS,
    });
    returnSettlementViewToPresent(selectionSec);
    settlementVassalSelectionResumeSpeed = 0;
    syncSettlementVassalSelectionPauseState();
  } else if (result?.reason === "selectionPoolMismatch") {
    settlementGraphView?.clearProjectionReplacementTransition?.();
    const latestFrontierSec = getSettlementFrontierSec();
    settlementPendingVassalSelection = buildSettlementVassalSelectionPool(
      getSettlementFrontierState(),
      latestFrontierSec
    );
    settlementVassalChooserView?.refresh?.();
  } else if (result?.reason === "currentVassalAlive") {
    settlementGraphView?.clearProjectionReplacementTransition?.();
    settlementPendingVassalSelection = null;
    syncSettlementVassalSelectionPauseState();
    settlementVassalChooserView?.refresh?.();
  } else {
    settlementGraphView?.clearProjectionReplacementTransition?.();
    settlementVassalChooserView?.refresh?.();
  }
  return result;
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
          ? buildSettlementVassalSelectionPool(frontierState, frontierSec)
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

function getSettlementJumpToDeathState() {
  const frontierState = getSettlementFrontierState();
  if (isSettlementStateRunComplete(frontierState)) {
    const endSec = Number.isFinite(frontierState?.runStatus?.tSec)
      ? Math.max(0, Math.floor(frontierState.runStatus.tSec))
      : getSettlementFrontierSec();
    const currentSec = getSettlementViewedSec();
    return {
      enabled: endSec > 0 && endSec !== currentSec,
      label: "Jump to End",
    };
  }
  const state = getSettlementViewedState();
  const currentVassal = getSettlementCurrentVassal(state);
  const deathSec = Math.max(0, Math.floor(currentVassal?.deathSec ?? 0));
  const currentSec = Math.max(0, Math.floor(state?.tSec ?? 0));
  const historyEndSec = getSettlementFrontierSec();
  return {
    enabled:
      !!currentVassal &&
      deathSec > 0 &&
      deathSec <= historyEndSec &&
      deathSec !== currentSec,
    label: "Jump to Death",
  };
}

function jumpCurrentVassalToDeath() {
  const frontierState = getSettlementFrontierState();
  if (isSettlementStateRunComplete(frontierState)) {
    const endSec = Number.isFinite(frontierState?.runStatus?.tSec)
      ? Math.max(0, Math.floor(frontierState.runStatus.tSec))
      : getSettlementFrontierSec();
    return setSettlementViewedSecond(endSec);
  }
  const state = getSettlementViewedState();
  const currentVassal = getSettlementCurrentVassal(state);
  const deathSec = Math.max(0, Math.floor(currentVassal?.deathSec ?? 0));
  if (!currentVassal || deathSec <= 0) return { ok: false, reason: "noCurrentVassalDeath" };
  return setSettlementViewedSecond(deathSec);
}

function getSettlementPrimaryVassalState() {
  const frontierState = getSettlementFrontierState();
  const forecastStatus = settlementForecastController?.getForecastStatus?.() ?? null;
  const hasPendingSelection = !!settlementPendingVassalSelection;
  const hasSelectedVassal = !!getSettlementFirstSelectedVassal(frontierState);
  const runComplete = isSettlementStateRunComplete(frontierState);
  const runCompleteEntry = getLatestRunCompleteEntry(frontierState);
  if (runComplete) {
    return {
      enabled: !!runCompleteEntry,
      label: "Gameover",
    };
  }
  return {
    enabled:
      hasPendingSelection !== true &&
      runComplete !== true &&
      forecastStatus?.nextVassalEnabled === true,
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

const runner = createSimRunner({
  setupId: BOOT_SETUP_ID,
  onInvalidate: (reason) => {
    if (shouldInvalidateSettlementTimelineForecast(reason)) {
      forecastWorkerService.handleTimelineInvalidation?.(reason);
      settlementGraphController?.handleInvalidate?.(reason);
    }
    invalidateSettlementProjectedLossCache();
    syncSettlementGraphHorizon();
    prototypeView?.refresh?.();
    settlementDebugMenu?.refresh?.();
  },
  onRebuildViews: () => {
    invalidateSettlementProjectedLossCache();
    syncSettlementGraphHorizon();
    prototypeView?.refresh?.();
    settlementDebugMenu?.refresh?.();
  },
});

settlementGraphController = createTimeGraphController({
  getTimeline: () => runner.getTimeline?.(),
  getCursorState: () => runner.getCursorState?.(),
  metric: GRAPH_METRICS.settlement,
  projectionCache: settlementProjectionCache,
  forecastWorkerService,
  forecastStepSec: SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
  horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
  nonFocusStablePrefixSpanSec: SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_SEC,
  nonFocusStablePrefixStrideSec:
    SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_STRIDE_SEC,
});
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
  graphWindowSec: SETTLEMENT_GRAPH_WINDOW_SEC,
  lossSearchCapacitySec: SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC,
  autoCommitBufferSec: SETTLEMENT_AUTO_COMMIT_BUFFER_SEC,
  autoCommitChunkSec: SETTLEMENT_AUTO_COMMIT_CHUNK_SEC,
  autoCommitMinIntervalMs: SETTLEMENT_AUTO_COMMIT_MIN_INTERVAL_MS,
  autoCommitForceLagSec: SETTLEMENT_AUTO_COMMIT_FORCE_LAG_SEC,
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
    if (typeof GRAPH_METRICS.settlement?.getSeries === "function") {
      return GRAPH_METRICS.settlement.getSeries(null, state);
    }
    return Array.isArray(GRAPH_METRICS.settlement?.series)
      ? GRAPH_METRICS.settlement.series
      : [];
  },
  getGraphScreenRect: () => settlementGraphView?.getScreenRect?.() ?? null,
  applySeriesSelection: (visibleSeries) =>
    settlementGraphController?.setSeries?.(visibleSeries),
  renderGraph: () => settlementGraphView?.render?.(),
  maxVisibleSeries: MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES,
  viewportWidth: VIEWPORT_DESIGN_WIDTH,
  viewportHeight: VIEWPORT_DESIGN_HEIGHT,
});
settlementGraphSeriesMenu.applySelection();

prototypeView = createSettlementPrototypeView({
  app,
  layer: playfieldLayer,
  getState: () => runner.getState?.(),
  getCivilizationLossInfo: () => getSettlementLossInfoForDisplay(),
  getSelectedPracticeClassId: () => selectedPracticeClassId,
  getVisibleVassalTimeSec: (state) => getSettlementVisibleVassalTimeSec(state),
  tooltipView,
  setSelectedPracticeClassId: (classId) => {
    selectedPracticeClassId = typeof classId === "string" && classId.length > 0 ? classId : "villager";
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
  getReturnToPresentState: () => ({ visible: false, enabled: false, targetSec: null }),
  onReturnToPresent: () => ({ ok: false, reason: "settlementNoReturnButton" }),
  getTimeScale: () => getSettlementPlaybackState(),
  setTimeScaleTarget: (speed, opts) => setSettlementPlaybackTarget(speed, opts),
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
      lineageStartSec: firstSelectedVassal?.birthSec ?? null,
      currentVassalStartSec: currentVassal?.birthSec ?? null,
      projectedLossSec: displayedLossInfo?.lossSec ?? null,
    });
  },
  openPosition: { x: 110, y: 884 },
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
settlementGraphView.setEventMarkerResolver?.(({ historyEndSec }) => {
  const frontierState = getSettlementFrontierState();
  const runComplete = isSettlementStateRunComplete(frontierState);
  const boundarySeconds = getSettlementVassalBoundarySeconds(frontierState, historyEndSec);
  const boundaryMarkers = boundarySeconds
    .filter((sec, index, arr) => arr.indexOf(sec) === index)
    .map((tSec) => ({
      tSec,
      severity: "critical",
      color: 0xe3c46c,
      lineWidth: tSec === historyEndSec && !runComplete ? 4 : 3,
      radius: tSec === historyEndSec && !runComplete ? 6 : 5,
      alpha: tSec === historyEndSec && !runComplete ? 0.92 : 0.78,
    }));
  const debugMarkers = getSettlementDebugOverrideMarkerSeconds().map((tSec) => ({
    tSec,
    severity: "critical",
    color: 0x7bdff2,
    lineWidth: 2,
    radius: 4,
    alpha: 0.9,
  }));
  return [...boundaryMarkers, ...debugMarkers];
});

settlementVassalControlsView = createSettlementVassalControlsView({
  app,
  layer: controlLayer,
  getJumpState: () => getSettlementJumpToDeathState(),
  onJump: () => jumpCurrentVassalToDeath(),
  getPrimaryState: () => getSettlementPrimaryVassalState(),
  onPrimary: () => {
    if (isSettlementStateRunComplete(getSettlementFrontierState())) {
      return openSettlementRunCompleteOverlay();
    }
    return openNextSettlementVassalSelection();
  },
});

settlementVassalChooserView = createSettlementVassalChooserView({
  app,
  layer: modalLayer,
  getSelectionPool: () => settlementPendingVassalSelection,
  isOpen: () => !!settlementPendingVassalSelection,
  onSelectCandidate: (candidateIndex) => selectSettlementVassal(candidateIndex),
  tooltipView,
});
runCompleteView = createRunCompleteView({
  app,
  layer: modalLayer,
});
settlementDebugMenu = createSettlementDebugMenuDom({
  getState: () => getSettlementViewedState(),
  getFrontierSec: () => getSettlementFrontierSec(),
  getViewedSec: () => getSettlementViewedSec(),
  getPreviewStatus: () => runner.getPreviewStatus?.(),
  applyOverrides: (overrides) => applySettlementDebugOverrides(overrides),
  getDebugSnapshot: () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.() ?? null,
  isInteractionBlocked: () => !!settlementPendingVassalSelection,
});

function requestPauseBeforeDrag() {
  setSettlementPlaybackTarget(0);
  ensureSettlementRunnerPaused();
}

function togglePause() {
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
    getGraphController: () => settlementGraphController,
    hasStateDataAt: (tSec) =>
      settlementGraphController?.getStateDataAt?.(tSec) != null,
    hasStateAt: (tSec) => settlementGraphController?.getStateAt?.(tSec) != null,
    applyOverrides: (overrides) => applySettlementDebugOverrides(overrides),
    openNextSelection: () => openNextSettlementVassalSelection(),
    selectCandidate: (candidateIndex) => selectSettlementVassal(candidateIndex),
    getLastVassalSelectionResult: () => settlementLastVassalSelectionResult,
    isVassalSelectionOpen: () => !!settlementPendingVassalSelection,
  });
}

runner.init();
requestPauseBeforeDrag();
syncSettlementGraphHorizon();
syncSettlementGraphRevealConfig();
syncSettlementVassalSelectionPauseState();
prototypeView.init();
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
  processSettlementPendingCommit();
  syncSettlementGraphRevealConfig();
  syncSettlementGraphHorizon();
  restoreSettlementPendingPreviewTarget();
  updateSettlementPreviewPlayback(frameDt);
  syncSettlementVassalSelectionPauseState();
  settlementGraphSeriesMenu?.syncSelection?.();
  prototypeView.update(frameDt);
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
