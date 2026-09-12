import {
  SEASON_DURATION_SEC,
  SETTLEMENT_VISIBLE_WINDOW_YEARS,
} from "../../defs/gamesettings/gamerules-defs.js";
import { GRAPH_METRICS } from "../../model/graph-metrics.js";
import { getVassalPendingResolution } from "../../model/vassal-life-map.js";

export const SETTLEMENT_GRAPH_WINDOW_SEC =
  Math.max(1, Math.floor(SEASON_DURATION_SEC)) *
  4 *
  Math.max(1, Math.floor(SETTLEMENT_VISIBLE_WINDOW_YEARS));
export const MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES = 24;
export const SETTLEMENT_GRAPH_SNAPSHOT_BOUNDS_QUANTUM_SEC = 512;
export const SETTLEMENT_GRAPH_SNAPSHOT_LEAD_SEC = 1024;
export const SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_YEARS = 100;
export const SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_SEC =
  SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_YEARS * 32;
export const SETTLEMENT_GRAPH_STABLE_DETAIL_PREFIX_STRIDE_SEC = 16;
export const SETTLEMENT_GRAPH_BOOT_FADE_DURATION_MS = 1500;
export const SETTLEMENT_EXACT_LOSS_SEARCH_BUCKET_SEC = 16;
export const SETTLEMENT_HORIZON_UPDATE_QUANTUM_SEC = 16;
export const SETTLEMENT_HORIZON_LEAD_BUFFER_SEC = 256;
export const SETTLEMENT_UNRESOLVED_BROWSE_LEAD_SEC = 256;
export const SETTLEMENT_GRAPH_REVEAL_DEFAULT = Object.freeze({
  targetDurationSec: 14,
  minRateSecPerSec: 60,
  maxRateSecPerSec: 112,
  startDelayMs: 400,
  followGapSec: 36,
  followResponseSec: 1.1,
  accelerationSecPerSec2: 180,
  decelerationSecPerSec2: 260,
});
export const SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT = Object.freeze({
  targetDurationSec: 13,
  minRateSecPerSec: 72,
  maxRateSecPerSec: 132,
  startDelayMs: 250,
  followGapSec: 48,
  followResponseSec: 0.95,
  accelerationSecPerSec2: 220,
  decelerationSecPerSec2: 320,
});

export function getSettlementGraphMetric(scope) {
  return scope === "settlement"
    ? GRAPH_METRICS.settlement
    : GRAPH_METRICS.civilization;
}

export function getSettlementGraphRevealConfig(mode) {
  return mode === "pendingCommit"
    ? SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT
    : SETTLEMENT_GRAPH_REVEAL_DEFAULT;
}

export function resolveEffectiveSettlementGraphHorizonSec(overrideSec) {
  return overrideSec ?? SETTLEMENT_GRAPH_WINDOW_SEC;
}

export function createSettlementGraphSession({
  getGraphController,
  getGraphView,
  getForecastController,
  getSeriesMenu,
  getSelectedWorldRegionId,
  getFrontierState,
  getFrontierSec,
  setWorldViewMode,
} = {}) {
  let settlementGraphScope = "civilization";
  let settlementGraphHorizonOverrideSec = null;
  let settlementGraphRevealMode = "";

  function getSettlementGraphScope() {
    return settlementGraphScope;
  }

  function getCurrentSettlementGraphMetric() {
    return getSettlementGraphMetric(settlementGraphScope);
  }

  function setSettlementGraphContext(scope, regionId) {
    const selectedWorldRegionId = getSelectedWorldRegionId?.() ?? "";
    const nextScope = scope === "settlement" ? "settlement" : "civilization";
    const nextRegionId =
      typeof regionId === "string" && regionId.length
        ? regionId
        : selectedWorldRegionId;
    const previousScope = settlementGraphScope;
    const previousSubjectKey =
      getGraphController?.()?.getData?.()?.subjectKey ?? null;
    const nextSubjectKey =
      nextScope === "settlement" ? nextRegionId : "civilization";
    const contextChanged =
      previousScope !== nextScope || previousSubjectKey !== nextSubjectKey;

    if (contextChanged && previousSubjectKey != null) {
      getGraphView?.()?.clearProjectionReplacementTransition?.();
    }

    settlementGraphScope = nextScope;
    const metric = getCurrentSettlementGraphMetric();
    const graphController = getGraphController?.();
    const seriesMenu = getSeriesMenu?.();
    const graphView = getGraphView?.();
    graphController?.setMetric?.(metric);
    graphController?.setSubject?.(
      nextScope === "settlement" ? { regionId: nextRegionId } : null,
      nextSubjectKey
    );
    seriesMenu?.setContext?.(nextScope);
    if (contextChanged && nextScope === "settlement") seriesMenu?.selectDefaultGroup?.();
    seriesMenu?.syncSelection?.();
    if (contextChanged) {
      graphController?.ensureCache?.();
      graphView?.resetDataContext?.();
    }
    graphView?.render?.();
    return contextChanged;
  }

  function getEffectiveSettlementGraphHorizonSec() {
    return resolveEffectiveSettlementGraphHorizonSec(
      settlementGraphHorizonOverrideSec
    );
  }

  function setSettlementGraphHorizonOverride(nextHorizonSec) {
    const normalized = Number.isFinite(nextHorizonSec)
      ? Math.max(1, Math.floor(nextHorizonSec))
      : null;
    if (normalized === settlementGraphHorizonOverrideSec) return;
    settlementGraphHorizonOverrideSec = normalized;
    getGraphController?.()?.setHorizonSecOverride?.(normalized);
  }

  function syncSettlementGraphRevealConfig() {
    const nextMode = getForecastController?.()?.getRevealMode?.() ?? "default";
    if (nextMode === settlementGraphRevealMode) return;
    settlementGraphRevealMode = nextMode;
    getGraphView?.()?.setForecastRevealConfig?.(
      getSettlementGraphRevealConfig(nextMode)
    );
  }

  function syncSettlementGraphHorizon() {
    getForecastController?.()?.syncHorizon?.();
  }

  function revealCivilizationAfterVassalEnd(
    vassalId,
    state = getFrontierState?.()
  ) {
    const endedVassal =
      state?.civilization?.vassalLineage?.vassalsById?.[vassalId] ?? null;
    if (
      !vassalId ||
      state?.civilization?.vassalLineage?.currentVassalId != null ||
      !["died", "retired"].includes(endedVassal?.endedReason)
    ) return false;
    // Changing screen pauses a reveal. Navigate first, then explicitly restart
    // the civilization reveal so a completed Vassal immediately exposes the
    // next forecast span rather than leaving it frozen at the boundary.
    setWorldViewMode?.("map");
    syncSettlementGraphHorizon();
    getGraphView?.()?.restartForecastRevealFrom?.(getFrontierSec?.(), {
      allowForecastStart: true,
    });
    return true;
  }

  function processSettlementPendingCommit() {
    const beforeState = getFrontierState?.();
    const beforeVassalId =
      beforeState?.civilization?.vassalLineage?.currentVassalId ?? null;
    const beforePendingResolution = getVassalPendingResolution(beforeState);
    getForecastController?.()?.processPendingCommit?.({
      clearForecastRevealRestart: () =>
        getGraphView?.()?.clearForecastRevealRestart?.(),
    });
    if (!beforeVassalId) return;
    const afterState = getFrontierState?.();
    const afterPendingResolution = getVassalPendingResolution(afterState);
    if (beforePendingResolution && !afterPendingResolution) {
      getGraphController?.()?.refreshAuthoritativeRangeFrom?.(
        beforePendingResolution.startSec
      );
      getGraphView?.()?.render?.();
    }
    revealCivilizationAfterVassalEnd(beforeVassalId, afterState);
  }

  return {
    getSettlementGraphScope,
    getSettlementGraphMetric: getCurrentSettlementGraphMetric,
    setSettlementGraphContext,
    getEffectiveSettlementGraphHorizonSec,
    setSettlementGraphHorizonOverride,
    syncSettlementGraphRevealConfig,
    syncSettlementGraphHorizon,
    revealCivilizationAfterVassalEnd,
    processSettlementPendingCommit,
  };
}
