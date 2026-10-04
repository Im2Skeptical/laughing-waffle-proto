// Bounded presentation timings. These never enter GameState or a save payload.
export function createNodeResolutionDiagnostics({ now = () => performance.now() } = {}) {
  const recent = [];
  let previousMs = null;
  let active = null;
  let wasOpen = false;
  return {
    sample({ recapOpen, resolutionSec }) {
      const time = now();
      if (recapOpen && !wasOpen) {
        active = { resolutionSec, openedAtMs: time, measuredFrames: 0, maxFrameGapMs: 0 };
        recent.push(active);
        if (recent.length > 3) recent.shift();
      }
      // Attribute the gap to the previously displayed popup. Include a long
      // gap crossing the window's end, so a multi-second freeze is captured.
      if (active && wasOpen && previousMs !== null && previousMs < active.openedAtMs + 3000) {
        active.maxFrameGapMs = Math.max(active.maxFrameGapMs, time - previousMs);
        active.measuredFrames++;
      }
      if (!recapOpen) active = null;
      wasOpen = recapOpen === true;
      previousMs = time;
    },
    suspend() {
      // Menu pauses, backgrounding and rotation are not rendering freezes.
      previousMs = null;
      wasOpen = false;
      active = null;
    },
    snapshot: () => recent.map(entry => ({ ...entry,
      openedAtMs: Math.round(entry.openedAtMs), maxFrameGapMs: Math.round(entry.maxFrameGapMs) })),
  };
}
