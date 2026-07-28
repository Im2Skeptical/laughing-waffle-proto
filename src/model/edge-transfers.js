import { MOON_CYCLE_SEC } from "../defs/gamesettings/gamerules-defs.js";
import {
  planDetailedAdministrationMovesAtBoundary,
} from "./detailed-settlements.js";

export function getLatestEdgeTransferBoundarySec(tSec) {
  const sec = Math.max(0, Math.floor(tSec ?? 0));
  const cadence = Math.max(1, Math.floor(MOON_CYCLE_SEC ?? 1));
  return Math.floor(sec / cadence) * cadence;
}

export function buildEdgeTransferBatchAtBoundary(
  preBoundaryState,
  boundarySec
) {
  const sec = Math.max(0, Math.floor(boundarySec ?? 0));
  const cadence = Math.max(1, Math.floor(MOON_CYCLE_SEC ?? 1));
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
