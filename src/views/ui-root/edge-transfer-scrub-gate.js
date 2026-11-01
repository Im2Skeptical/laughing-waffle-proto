// View-only gate for goods-transfer packets during timegraph / wheel scrub.
// While a scrub is moving (the viewed second changed within `settleMs`), the
// map skips the extra previous-second restore that edge-transfer packets need.
// Once the scrub is released or held still for `settleMs`, packets rebuild
// exactly as at rest. Never changes the viewed state or time-travel data.
export const EDGE_TRANSFER_SCRUB_SETTLE_MS = 150;

export function createEdgeTransferScrubGate({
  isScrubActive,
  now = () => performance.now(),
  settleMs = EDGE_TRANSFER_SCRUB_SETTLE_MS,
} = {}) {
  let lastSec = null;
  let lastMotionMs = -Infinity;
  function isMoving(viewedSec) {
    const active = isScrubActive?.() === true;
    const sec = Number.isFinite(viewedSec) ? Math.floor(viewedSec) : null;
    const t = now();
    if (active && lastSec !== null && sec !== lastSec) lastMotionMs = t;
    lastSec = sec;
    if (!active) {
      lastMotionMs = -Infinity;
      return false;
    }
    return t - lastMotionMs < settleMs;
  }
  return {
    // True while packets should be skipped for this frame.
    shouldSkip: (viewedSec) => isMoving(viewedSec),
    reset() { lastSec = null; lastMotionMs = -Infinity; },
  };
}
