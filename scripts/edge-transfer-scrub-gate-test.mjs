import assert from "node:assert/strict";
import { createEdgeTransferScrubGate } from "../src/views/ui-root/edge-transfer-scrub-gate.js";

let t = 0;
let active = false;
const gate = createEdgeTransferScrubGate({ isScrubActive: () => active, now: () => t, settleMs: 150 });
const down = () => { active = true; gate.notePointerMove(); };
const move = (ms) => { t = ms; gate.notePointerMove(); };

assert.equal(gate.shouldSkip(10), false, "at rest packets build");
t = 5000; assert.equal(gate.shouldSkip(11), false, "playback (no scrub) never skips");

// Pointer down: skip for the whole drag, even across slow restores and pauses.
t = 6000; down();
assert.equal(gate.shouldSkip(11), true, "pressing skips immediately");
move(6060); t = 6860; assert.equal(gate.shouldSkip(14), true, "800 ms phone-speed restore stays skipped");
move(6920); t = 6980; assert.equal(gate.shouldSkip(14), true, "60 ms pause between moves stays skipped");
t = 9000; assert.equal(gate.shouldSkip(14), true, "finger held still but down stays skipped");
assert.equal(gate.isSkipping(), true, "isSkipping mirrors the last shouldSkip");

// Release: settle counts real time from the last pointer move.
move(9100); active = false;
t = 9150; assert.equal(gate.shouldSkip(15), true, "just released: still inside settle window");
t = 9249; assert.equal(gate.shouldSkip(15), true);
t = 9250; assert.equal(gate.shouldSkip(15), false, "settleMs after last move rebuilds exact packets");
assert.equal(gate.isSkipping(), false);

// Release after holding still settles immediately.
t = 10000; down(); t = 11000; active = false;
assert.equal(gate.shouldSkip(16), false, "release after holding still settles at once");

// Settle is independent of viewedSec changes.
t = 12000; down(); move(12010); active = false;
t = 12400; assert.equal(gate.shouldSkip(99), false, "viewed-second changes do not extend skipping");
console.log("[edge-transfer-scrub-gate] skip while pointer down, settle from last pointer move OK");
