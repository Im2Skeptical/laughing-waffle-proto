import {
  planDetailedAdministrationMovesAtBoundary,
} from "./detailed-settlements.js";
import { getGameSetting } from "./game-config.js";

export function getLatestEdgeTransferBoundarySec(tSec, state = null) {
  const sec = Math.max(0, Math.floor(tSec ?? 0));
  const cadence = Math.max(1, getGameSetting(state, "moonCycleSec"));
  return Math.floor(sec / cadence) * cadence;
}

export function buildEdgeTransferBatchAtBoundary(
  preBoundaryState,
  boundarySec
) {
  const sec = Math.max(0, Math.floor(boundarySec ?? 0));
  const cadence = Math.max(1, getGameSetting(preBoundaryState, "moonCycleSec"));
  const transfers =
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
  return {
    batchId: `edge-transfers:${sec}`,
    boundarySec: sec,
    transfers,
  };
}
