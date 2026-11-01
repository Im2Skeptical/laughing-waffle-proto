// View-only gate for goods-transfer packets during timegraph / wheel scrub.
// While the scrub pointer is down (timegraph scrub or wheel drag/coast), the
// map skips the extra previous-second restore that edge-transfer packets need,
// however slow each restore is. After release, packets rebuild exactly as at
// rest once `settleMs` of real time has passed since the last pointer move.
// The settle clock follows pointer input, never viewed-second frames, so a slow
// warm restore cannot flip the gate to settled mid-drag. Never changes the
// viewed state or time-travel data.
export const EDGE_TRANSFER_SCRUB_SETTLE_MS = 150;

export function createEdgeTransferScrubGate({
  isScrubActive,
  now = () => performance.now(),
  settleMs = EDGE_TRANSFER_SCRUB_SETTLE_MS,
} = {}) {
  let lastPointerMoveMs = -Infinity;
  let lastSkip = false;
  function evaluate() {
    if (isScrubActive?.() === true) return true;
    return now() - lastPointerMoveMs < settleMs;
  }
  return {
    // Call on every pointer move while a scrub drag is active.
    notePointerMove() { lastPointerMoveMs = now(); },
    // True while packets should be skipped for this frame. viewedSec is
    // accepted for call-site compatibility; settling ignores it.
    shouldSkip: (_viewedSec) => (lastSkip = evaluate()),
    // Last shouldSkip result, without advancing the gate (for view layers).
    isSkipping: () => lastSkip,
    reset() { lastPointerMoveMs = -Infinity; lastSkip = false; },
  };
}
