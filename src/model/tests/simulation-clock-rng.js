import assert from "node:assert/strict";
import { test } from "node:test";
import { updateGame } from "../game-model.js";
import { createNewGameState } from "../new-game.js";
import { advanceReplayStateToSecond, DEFAULT_REPLAY_DT_STEP } from "../replay-second-runner.js";
import { attachRngHelpers, createRng } from "../rng.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../timeline/index.js";
import { exportSave, inspectSaveText } from "../../controllers/sim-runner/save-slots.js";

const SEED_STEP = 0x6d2b79f5;
const RNG_STREAMS = [
  ["seed", "rngNextFloat"],
  ["vassalSeed", "rngNextVassalFloat"],
  ["vassalDevelopmentSeed", "rngNextVassalDevelopmentFloat"],
  ["vassalLifeMapSeed", "rngNextVassalLifeMapFloat"],
  ["vassalPortraitSeed", "rngNextVassalPortraitFloat"],
];

function legacyDraw(seed) {
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

test("all stored streams wrap while matching the legacy exact-integer sequence", () => {
  const baseSeed = 0x1ffffffff;
  const state = { rng: { baseSeed } };
  RNG_STREAMS.forEach(([key], index) => { state.rng[key] = 0xffffffff - index; });
  attachRngHelpers(state);
  for (const [key, draw] of RNG_STREAMS) {
    let legacySeed = state.rng[key];
    for (let index = 0; index < 250_000; index++) {
      legacySeed += SEED_STEP;
      assert.equal(state[draw](), legacyDraw(legacySeed), key);
      assert.equal(state.rng[key], legacySeed >>> 0, key);
    }
  }
  assert.equal(state.rng.baseSeed, baseSeed);
});

test("standalone RNG passes the legacy Number precision limit", () => {
  const start = -123;
  const rng = createRng(start);
  let legacySeed = start;
  for (let index = 0; index < 250_000; index++) {
    legacySeed += SEED_STEP;
    assert.equal(rng.nextFloat(), legacyDraw(legacySeed));
  }
  const draws = 5_000_000;
  const exactSeed = BigInt(start) + BigInt(draws) * BigInt(SEED_STEP);
  assert.ok(exactSeed > BigInt(Number.MAX_SAFE_INTEGER));
  for (let index = 250_000; index < draws - 1; index++) rng.nextFloat();
  assert.equal(rng.nextFloat(), legacyDraw(Number(BigInt.asUintN(32, exactSeed))));
});

const tick = (state) => updateGame(DEFAULT_REPLAY_DT_STEP, state);
const roundTrip = (state) => deserializeGameState(JSON.stringify(serializeGameState(state)));
const seasonalEvents = (state, tSec) => state.world.sites
  .flatMap((site) => site.detailedState?.practiceActivationTrace ?? [])
  .filter((event) => event.tSec === tSec && event.activationType === "season");

test("snapshot validation keeps the run identity and rejects old or invalid RNG state", () => {
  const baseSeed = 0x1ffffffff;
  const snapshot = serializeGameState(createNewGameState(baseSeed));
  assert.equal(roundTrip(deserializeGameState(snapshot)).rng.baseSeed, baseSeed);
  for (const [key] of RNG_STREAMS) {
    assert.ok(snapshot.rng[key] === (snapshot.rng[key] >>> 0), key);
    const invalid = { ...snapshot, rng: { ...snapshot.rng, [key]: 0x100000000 } };
    assert.throws(() => deserializeGameState(invalid), /Invalid serialized RNG state/);
  }
  assert.throws(() => deserializeGameState({ ...snapshot, gameStateSchemaVersion: 52 }), /expected v53/);
});

test("season dispatch occurs once on the boundary tick across JSON restore and replay", () => {
  const live = createNewGameState(123);
  live.paused = false;
  const timeline = createTimelineFromInitialState(live);
  assert.ok(advanceReplayStateToSecond(live, 7).ok);
  for (let index = 0; index < 59; index++) tick(live);
  assert.equal(live.simStepIndex, 479);
  assert.equal(live.currentSeasonIndex, 0);
  assert.equal(live.simTime, 479 / 60);
  assert.equal(live.seasonTimeRemaining, 1 / 60);
  const before = roundTrip(live);
  tick(live);
  tick(before);
  assert.equal(live.tSec, 8);
  assert.equal(live.currentSeasonIndex, 1);
  assert.equal(live.seasonClockSec, 0);
  assert.equal(live.seasonTimeRemaining, 8);
  assert.equal(seasonalEvents(live, 8).length, 9);
  assert.deepEqual(serializeGameState(before), serializeGameState(live));
  const replayed = rebuildStateAtSecond(timeline, 8);
  assert.ok(replayed.ok);
  assert.deepEqual(seasonalEvents(replayed.state, 8), seasonalEvents(live, 8));

  tick(live);
  const after = roundTrip(live);
  // Desktop autosave may sample a mid-second cursor. Slot loading rebuilds
  // its integer timeline second rather than continuing from the raw snapshot.
  timeline.cursorSec = live.tSec;
  timeline.historyEndSec = live.tSec;
  const saved = exportSave({ state: live, timeline });
  assert.ok(saved.ok);
  const loaded = inspectSaveText(saved.text);
  assert.ok(loaded.ok);
  assert.equal(loaded.state.simStepIndex, 480);
  assert.deepEqual(seasonalEvents(loaded.state, 8), seasonalEvents(live, 8));
  for (let index = 0; index < 59; index++) {
    tick(live);
    tick(after);
  }
  assert.equal(live.tSec, 9);
  assert.equal(seasonalEvents(live, 9).length, 0);
  assert.deepEqual(serializeGameState(after), serializeGameState(live));
});

test("configured seasons and years roll over at exact seconds", () => {
  for (const duration of [1, 5, 8, 17, 120]) {
    const state = createNewGameState(123);
    state.seasonDurationSec = duration;
    state.paused = false;
    // Isolate the calendar across a 1,000-year horizon at the shortest setting.
    state.variantFlags.settlementPrototypeEnabled = false;
    const seasons = duration === 1 ? 4_000 : 5;
    for (let index = 1; index <= seasons; index++) {
      assert.ok(advanceReplayStateToSecond(state, index * duration).ok);
      assert.equal(state.simTime, index * duration);
      assert.equal(state.currentSeasonIndex, index % 4);
      assert.equal(state.year, 1 + Math.floor(index / 4));
      assert.equal(state.seasonClockSec, 0);
    }
  }
});
