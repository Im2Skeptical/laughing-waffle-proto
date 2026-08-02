import {
  planDetailedAdministrationMovesAtBoundary,
} from "./detailed-settlements.js";
import { getGameSetting } from "./game-config.js";
import { advanceReplayStateOneSecond } from "./replay-second-runner.js";
import { deserializeGameState, serializeGameState } from "./state.js";

export function getLatestEdgeTransferBoundarySec(tSec, state = null) {
  const sec = Math.max(0, Math.floor(tSec ?? 0));
  const cadence = Math.max(1, getGameSetting(state, "moonCycleSec"));
  const fullMoonOffset = Math.floor(cadence / 2);
  const latestNewMoon = Math.floor(sec / cadence) * cadence;
  const latestFullMoon = sec >= fullMoonOffset
    ? Math.floor((sec - fullMoonOffset) / cadence) * cadence + fullMoonOffset
    : 0;
  const seasonCount = Array.isArray(state?.seasons) && state.seasons.length > 0
    ? state.seasons.length
    : 4;
  const seasonDurationSec = Math.max(1, Math.floor(
    state?.seasonDurationSec ?? getGameSetting(state, "seasonDurationSec")
  ));
  const yearDurationSec = seasonCount * seasonDurationSec;
  const latestAnnual = sec > yearDurationSec
    ? Math.floor((sec - 1) / yearDurationSec) * yearDurationSec + 1
    : 0;
  return Math.max(latestNewMoon, latestFullMoon, latestAnnual);
}

function collectMigrationTransfers(postBoundaryState, boundarySec) {
  const byTransferId = new Map();
  for (const site of postBoundaryState?.world?.sites ?? []) {
    const settlement = site?.detailedState;
    if (!settlement) continue;
    const summaries = [];
    if (settlement.lastMeal?.tSec === boundarySec) {
      summaries.push(settlement.lastMeal.migration);
    }
    if (settlement.lastAnnualResult?.tSec === boundarySec) {
      summaries.push(settlement.lastAnnualResult.migration);
    }
    for (const summary of summaries) {
      for (const movement of summary?.outbound ?? []) {
        if (!movement?.transferId || byTransferId.has(movement.transferId)) continue;
        byTransferId.set(movement.transferId, {
          transferId: movement.transferId,
          boundarySec,
          systemId: "migration",
          resourceId: "population",
          reason: movement.reason,
          sourceRegionId: movement.sourceRegionId,
          destinationRegionId: movement.destinationRegionId,
          amount: movement.amount,
          survivors: movement.survivors,
          arrivalDeaths: movement.arrivalDeaths,
        });
      }
    }
  }
  return [...byTransferId.values()];
}

export function buildEdgeTransferBatchAtBoundary(
  preBoundaryState,
  boundarySec
) {
  const sec = Math.max(0, Math.floor(boundarySec ?? 0));
  const cadence = Math.max(1, getGameSetting(preBoundaryState, "moonCycleSec"));
  const administrationTransfers =
    preBoundaryState?.runStatus?.complete !== true &&
    sec > 0 &&
    sec % cadence === 0
      ? planDetailedAdministrationMovesAtBoundary(
          preBoundaryState,
          sec
        ).map(
          (move, index) => ({
            transferId: `administrate:${sec}:${index}`,
            boundarySec: sec,
            systemId: "administrate",
            resourceId: "food",
            sourceRegionId: move.sourceId,
            destinationRegionId: move.destinationId,
            amount: move.amount,
          })
        )
      : [];
  let migrationTransfers = [];
  if (preBoundaryState?.runStatus?.complete !== true && sec > 0) {
    const replayState = deserializeGameState(serializeGameState(preBoundaryState));
    replayState.paused = false;
    const advanceResult = advanceReplayStateOneSecond(replayState);
    if (advanceResult?.ok && Math.floor(replayState.tSec ?? 0) === sec) {
      migrationTransfers = collectMigrationTransfers(replayState, sec);
    }
  }
  const transfers = [...administrationTransfers, ...migrationTransfers];
  return {
    batchId: `edge-transfers:${sec}`,
    boundarySec: sec,
    transfers,
  };
}
