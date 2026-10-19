import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { advanceReplayStateOneSecond } from '../src/model/replay-second-runner.js';
import { getSeasonWheelPhase01, sampleDiskMomentum } from '../src/views/sunandmoon-disks-pixi.js';
import { createSettlementPlayback, getSettlementPlaybackRate } from '../src/views/ui-root/settlement-playback.js';

// Real per-second replay snapshots, sampled at the fractional times used by
// playback. Include all season seams, the year seam, and reverse playback.
const state = createNewGameState(123);
state.paused = false;
let previous = null;
const snapshots = [];
for (let second = 0; second <= 34; second++) {
  if (second) assert.equal(advanceReplayStateOneSecond(state).ok, true);
  snapshots.push({ tSec: state.tSec, simStepIndex: state.simStepIndex,
    currentSeasonIndex: state.currentSeasonIndex, seasonClockSec: state.seasonClockSec,
    seasonTimeRemaining: state.seasonTimeRemaining, seasonDurationSec: state.seasonDurationSec });
  if (!second) continue;
  const saved = JSON.stringify(state);
  for (const fraction of [0, .1, .5, .9]) {
    const time = second + fraction;
    const phase = getSeasonWheelPhase01(state, time, 4);
    if (previous) {
      const delta = (phase - previous.phase + 1) % 1;
      const expected = (time - previous.time) / 32;
      assert.ok(Math.abs(delta - expected) < 1e-9,
        `season motion at ${time}: expected ${expected}, actual ${delta}`);
    }
    previous = { time, phase };
  }
  assert.equal(JSON.stringify(state), saved, 'render sampling preserves state and RNG');
}
assert.equal(getSeasonWheelPhase01(snapshots[0], 0, 4), 0, 'opening clock starts at spring');
assert.ok(Math.abs(getSeasonWheelPhase01({ ...snapshots[9], simStepIndex: 570,
  seasonClockSec: 1.5 }, 9.5, 4) - 9.5 / 32) < 1e-9,
  'live subsecond ticks do not count their fraction twice');
for (const speed of [.1, .25, 1, 2, 4, 40, 400, -.25, -1, -4, -40, -400]) {
  const dt = speed / 60;
  let time = speed > 0 ? 1 : 33.9;
  let last = null;
  for (; time >= 1 && time < 34; time += dt) {
    const phase = getSeasonWheelPhase01(snapshots[Math.floor(time)], time, 4);
    if (last) {
      const delta = Math.atan2(Math.sin((phase - last.phase) * Math.PI * 2),
        Math.cos((phase - last.phase) * Math.PI * 2)) / (Math.PI * 2);
      assert.ok(Math.abs(delta - dt / 32) < 1e-9, `constant wheel motion at ${speed}x, second ${time}`);
    }
    last = { phase };
  }
}

// Pause and 1x stay absolute. The outer lever covers the displayed span in
// eight seconds, including after changing graph zoom while already playing.
for (const span of [32, 320, 6400]) {
  for (const speed of [-1, 0, 1]) assert.equal(getSettlementPlaybackRate(speed, span), speed);
  assert.equal(getSettlementPlaybackRate(4, span), span / 8);
  assert.equal(getSettlementPlaybackRate(-4, span), -span / 8);
}
let viewed = { tSec: 10, paused: true }, span = 320;
const playback = createSettlementPlayback({
  getRunner: () => ({
    getState: () => viewed, getCursorState: () => viewed,
    getTimeline: () => ({ historyEndSec: 10000 }),
    setTimeScaleTarget: () => ({ ok: true }),
    browseCursorSecond: sec => { viewed = { tSec: sec, paused: true }; return { ok: true }; },
  }),
  getPlaybackSpanSec: () => span,
});
playback.setSettlementPlaybackTarget(4);
playback.updateSettlementPreviewPlayback(.1);
assert.equal(playback.getSettlementVisualTime(), 14);
span = 640;
playback.updateSettlementPreviewPlayback(.1);
assert.equal(playback.getSettlementVisualTime(), 22, 'active playback responds to graph span');
playback.setSettlementPlaybackTarget(-4);
playback.updateSettlementPreviewPlayback(1);
assert.equal(playback.getSettlementVisualTime(), 0, 'reverse stops at history start');
assert.equal(playback.getSettlementPlaybackTarget(), 0);
viewed = { tSec: 10, paused: true };
playback.setSettlementVisualTime(10.7);
assert.equal(playback.getSettlementVisualTime(), 10.7, 'wheel coast retains its fractional resting angle');
playback.setSettlementPlaybackTarget(1);
playback.updateSettlementPreviewPlayback(.1);
assert.ok(Math.abs(playback.getSettlementVisualTime() - 10.8) < 1e-9,
  'resuming play continues from the wheel resting angle');

const once = sampleDiskMomentum(20, .5);
const first = sampleDiskMomentum(20, .2), second = sampleDiskMomentum(first.velocity, .3);
assert.ok(Math.abs(once.deltaSec - first.deltaSec - second.deltaSec) < 1e-9,
  'momentum travel is independent of frame rate');
assert.ok(Math.abs(sampleDiskMomentum(20, .18).velocity - 10) < 1e-9, 'gentle 180ms half-life');
assert.ok(sampleDiskMomentum(20, 2).deltaSec < 5.2, 'coast travel stays bounded');
assert.ok(sampleDiskMomentum(-20, .1).deltaSec < 0, 'reverse flicks coast backwards');
console.log('[time-controls] smooth forward/reverse boundaries, zoom-relative playback, bounded momentum');
