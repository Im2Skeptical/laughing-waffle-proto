import { GRAPH_METRICS } from "./graph-metrics.js";
import {
  getSettlementCurrentVassal,
  getSettlementLatestSelectedVassalDeathSec,
} from "./settlement-state.js";

function clampSec(value, fallback = 0) {
  if (!Number.isFinite(value)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(value));
}

function clampYear(value, fallback = 1) {
  if (!Number.isFinite(value)) return Math.max(1, Math.floor(fallback));
  return Math.max(1, Math.floor(value));
}

function buildGraphValues(metric, state, subject = null) {
  const series =
    typeof metric?.getSeries === "function"
      ? metric.getSeries(subject, state)
      : Array.isArray(metric?.series)
        ? metric.series
        : [];
  const out = {};
  for (const seriesDef of series) {
    const seriesId = typeof seriesDef?.id === "string" ? seriesDef.id : "";
    if (!seriesId || typeof seriesDef?.getValueFromSnapshot !== "function") {
      continue;
    }
    const value = seriesDef.getValueFromSnapshot(state, subject);
    if (!Number.isFinite(value)) continue;
    out[seriesId] = Number(value);
  }
  return out;
}

export function buildProjectionSummaryFromState(state) {
  const currentVassal = getSettlementCurrentVassal(state);
  const latestSelectedVassalDeathSec = getSettlementLatestSelectedVassalDeathSec(state);
  const runComplete = state?.runStatus?.complete === true;
  const runLossSec = runComplete
    ? clampSec(state?.runStatus?.tSec, state?.tSec ?? 0)
    : null;
  const runLossYear = runComplete
    ? clampYear(state?.runStatus?.year, state?.year ?? 1)
    : null;

  return {
    tSec: clampSec(state?.tSec, 0),
    year: clampYear(state?.year, 1),
    runComplete,
    runLossSec,
    runLossYear,
    graphValues: {
      civilization: buildGraphValues(GRAPH_METRICS.civilization, state),
      settlementByRegion: Object.fromEntries(
        (state?.world?.sites ?? []).map((site) => [
          site.regionId,
          buildGraphValues(
            GRAPH_METRICS.settlement,
            state,
            { regionId: site.regionId }
          ),
        ])
      ),
    },
    settlement: {
      currentVassalId:
        typeof currentVassal?.vassalId === "string" && currentVassal.vassalId.length > 0
          ? currentVassal.vassalId
          : null,
      currentVassalDeathSec: Number.isFinite(currentVassal?.deathSec)
        ? clampSec(currentVassal.deathSec, 0)
        : null,
      latestSelectedVassalDeathSec: Number.isFinite(latestSelectedVassalDeathSec)
        ? clampSec(latestSelectedVassalDeathSec, 0)
        : null,
    },
  };
}

export function isProjectionSummaryRunComplete(summary) {
  return summary?.runComplete === true;
}
