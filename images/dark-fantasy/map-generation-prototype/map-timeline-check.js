// Browser check against the displayed canvas, including both water resolutions.
export function verifyMapTimeline() {
  const before = mapWorkbench.timeline, terrain = mapWorkbench.pixelRendering;
  const source = document.querySelector('canvas'), capture = document.createElement('canvas');
  capture.width = 900; capture.height = 210;
  const ctx = capture.getContext('2d', { willReadFrequently: true });
  const at = seconds => {
    mapWorkbench.seekTime(seconds);
    ctx.drawImage(source, source.width * 494 / 2424, source.height * 238 / 1080,
      source.width * 1896 / 2424, source.height * 410 / 1080, 0, 0, 900, 210);
    if (mapWorkbench.pixelRendering.waterStudy.phaseSeconds !== seconds) throw new Error('Water did not sample the viewed time');
    if (mapWorkbench.atmosphere.stats.phaseSeconds !== seconds) throw new Error('Atmosphere did not sample the viewed time');
    return ctx.getImageData(0, 0, 900, 210).data;
  };
  try {
    mapWorkbench.setPlayback({spanYears:300,playing:false});
    const a = at(997.125), b = at(9600), restored = at(997.125);
    let changed = 0, drift = 0, maxError = 0;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 1) changed++;
      // Same tolerance as LOD persistence: canvas/GPU colour readback can round by 1/255.
      const error = Math.abs(a[i] - restored[i]); maxError = Math.max(maxError, error);
      if (error > 1) drift++;
    }
    if (!changed || drift) throw new Error(`Time seek image failure: changed=${changed}, restored drift=${drift}`);
    if (mapWorkbench.timeline.currentSec !== before.currentSec) throw new Error('Preview advanced the current frontier');
    if (mapWorkbench.pixelRendering !== terrain) throw new Error('Scrubbing regenerated terrain');
    mapWorkbench.seekTime(1e6);
    if (mapWorkbench.timeline.displaySec !== mapWorkbench.timeline.revealCapSec) throw new Error('Seek exceeded revealed coverage');
    mapWorkbench.setPlayback({ now: true, playing: false });
    if (mapWorkbench.timeline.displaySec !== before.currentSec) throw new Error('Now failed to restore the frontier');
    return { pass: true, changedChannels: changed, restoredDrift: drift, maxReadbackError: maxError, terrainRebaked: false };
  } finally {
    mapWorkbench.setPlayback({spanYears:before.spanYears});
    mapWorkbench.seekTime(before.displaySec);
    mapWorkbench.setPlayback({ now: before.followingNow, rate: before.rate, playing: before.playing });
  }
}
