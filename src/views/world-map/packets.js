import { EDGE_TRANSFER_RESOURCE_COLOURS } from "./constants.js";

export function getEdgeTransferPacketGlyphSpec(resourceId) {
  if (resourceId === "population") {
    return {
      color: EDGE_TRANSFER_RESOURCE_COLOURS.population,
      circles: [
        { forward: -0.1, side: 0, radius: 0.34 },
        { forward: -0.52, side: -0.34, radius: 0.3 },
        { forward: -0.52, side: 0.34, radius: 0.3 },
      ],
      triangleScale: 0.48,
    };
  }
  return {
    color: EDGE_TRANSFER_RESOURCE_COLOURS.food,
    circles: [
      { forward: -0.08, side: 0, radius: 0.32 },
      { forward: -0.48, side: -0.3, radius: 0.28 },
      { forward: -0.48, side: 0.3, radius: 0.28 },
    ],
    triangleScale: 0.44,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value ?? 0)));
}

export function resolveEdgeTransferPlaybackDirection(
  previousViewedSec,
  viewedSec
) {
  if (
    !Number.isFinite(previousViewedSec) ||
    !Number.isFinite(viewedSec)
  ) {
    return 1;
  }
  if (Math.floor(previousViewedSec) === Math.floor(viewedSec)) return 0;
  return Math.floor(viewedSec) < Math.floor(previousViewedSec) ? -1 : 1;
}

export function getEdgeTransferPacketPose({
  from,
  to,
  progress,
  laneOffset = 0,
} = {}) {
  const start = {
    x: Number(from?.x ?? 0),
    y: Number(from?.y ?? 0),
  };
  const end = {
    x: Number(to?.x ?? start.x),
    y: Number(to?.y ?? start.y),
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  const directionX = dx / length;
  const directionY = dy / length;
  const easedProgress = (() => {
    const t = clamp01(progress);
    return t * t * (3 - 2 * t);
  })();
  const offset = Number(laneOffset ?? 0);
  return {
    x:
      start.x +
      dx * easedProgress -
      directionY * offset,
    y:
      start.y +
      dy * easedProgress +
      directionX * offset,
    directionX,
    directionY,
    angle: Math.atan2(directionY, directionX),
    progress: easedProgress,
  };
}

export function getEdgeTransferPacketFacing(from, to) {
  const dx = Number(to?.x ?? from?.x ?? 0) - Number(from?.x ?? 0);
  const dy = Number(to?.y ?? from?.y ?? 0) - Number(from?.y ?? 0);
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  const directionX = dx / length;
  const directionY = dy / length;
  return {
    directionX,
    directionY,
    angle: Math.atan2(directionY, directionX),
  };
}

export function getEdgeTransferPacketVisualSpec({
  sourcePoint,
  destinationPoint,
  reversed = false,
  laneOffset = 0,
} = {}) {
  const isReversed = reversed === true;
  const authoredLaneOffset = Number(laneOffset ?? 0);
  return {
    from: isReversed ? destinationPoint : sourcePoint,
    to: isReversed ? sourcePoint : destinationPoint,
    facingFrom: sourcePoint,
    facingTo: destinationPoint,
    laneOffset: isReversed ? -authoredLaneOffset : authoredLaneOffset,
  };
}
