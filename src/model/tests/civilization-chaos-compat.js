import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../timeline/index.js";
import { getCivilizationChaosSummary } from "../civilization-chaos.js";
import { getRunCompleteInfo } from "../../views/run-complete-presentation.js";

const original = createInitialState("devPlaytesting01", 8877);
original.civilization.chaos.chaosPower = 17.25;
original.civilization.chaos.monsterCount = 4;
original.runStatus = { complete: true, reason: "redGodMonsterOverrun", year: 1, tSec: 0 };
original.paused = true;
const saved = serializeGameState(original);
const frozen = JSON.stringify(saved);
const loaded = deserializeGameState(saved);
const timeline = createTimelineFromInitialState(loaded);
const replayed = rebuildStateAtSecond(timeline, 0);
assert.equal(replayed.ok, true);
for (const state of [loaded, replayed.state]) {
  assert.equal(state.runStatus.reason, "redGodMonsterOverrun");
  assert.equal(getRunCompleteInfo(state).reason, "monsterOverrun");
  assert.equal(getRunCompleteInfo(state).cause, "Overrun by monsters");
  assert.equal(getCivilizationChaosSummary(state).chaosPower, 17.25);
  assert.equal(getCivilizationChaosSummary(state).monsterCount, 4);
}
assert.equal(JSON.stringify(saved), frozen, "loading and replay leave the saved snapshot untouched");
