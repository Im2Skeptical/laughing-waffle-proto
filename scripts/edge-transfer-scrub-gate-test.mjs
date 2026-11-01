import assert from "node:assert/strict";
import { createEdgeTransferScrubGate } from "../src/views/ui-root/edge-transfer-scrub-gate.js";

let t = 0;
let active = false;
const gate = createEdgeTransferScrubGate({ isScrubActive: () => active, now: () => t, settleMs: 150 });

assert.equal(gate.shouldSkip(10), false, "at rest packets build");
assert.equal(gate.shouldSkip(11), false, "playback (no scrub) never skips");
active = true;
assert.equal(gate.shouldSkip(11), false, "pressing without moving keeps exact packets");
t = 16; assert.equal(gate.shouldSkip(14), true, "moving scrub skips the previous-second restore");
t = 32; assert.equal(gate.shouldSkip(18), true);
t = 120; assert.equal(gate.shouldSkip(18), true, "still within the settle window");
t = 190; assert.equal(gate.shouldSkip(18), false, "held still for settleMs rebuilds exact packets");
t = 200; assert.equal(gate.shouldSkip(19), true, "moving again skips");
active = false;
t = 201; assert.equal(gate.shouldSkip(19), false, "release rebuilds immediately");
active = true;
t = 210; assert.equal(gate.shouldSkip(19), false, "a new press does not inherit old motion");
console.log("[edge-transfer-scrub-gate] skip while moving, exact on settle/release OK");
