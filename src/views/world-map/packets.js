import { EDGE_TRANSFER_RESOURCE_COLOURS } from "./constants.js";

export function getEdgeTransferPacketGlyphSpec(resourceId, traits = []) {
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
    color: resourceId === 'stock' ? EDGE_TRANSFER_RESOURCE_COLOURS.stock : EDGE_TRANSFER_RESOURCE_COLOURS.food,
    circles: [],
    // One icon names the requested resource, rather than the donor's tableau.
    icons: [resourceId === 'food' ? 'Edible' : traits[0] ?? null],
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
  path,
} = {}) {
  if (path?.length > 1) {
    const lengths = path.slice(1).map((p,i)=>Math.hypot(p.x-path[i].x,p.y-path[i].y));
    const total=lengths.reduce((a,b)=>a+b,0);
    let distance=clamp01(progress)*total;
    for(let i=0;i<lengths.length;i++){
      if(distance<=lengths[i] || i===lengths.length-1) return sampleSegment(path[i],path[i+1],distance/Math.max(.0001,lengths[i]),laneOffset);
      distance-=lengths[i];
    }
  }
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

function sampleSegment(a,b,t,offset) {
 const angle=Math.atan2(b.y-a.y,b.x-a.x),directionX=Math.cos(angle),directionY=Math.sin(angle);
 return {x:a.x+(b.x-a.x)*t-directionY*offset,y:a.y+(b.y-a.y)*t+directionX*offset,directionX,directionY,angle,progress:t};
}
