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
