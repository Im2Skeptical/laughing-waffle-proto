import assert from "node:assert/strict";

import {
  RED_GOD_MONSTER_WIN_COUNT,
  RED_GOD_SPAWN_CADENCE_MOONS,
  MOON_CYCLE_SEC,
} from "../src/defs/gamesettings/gamerules-defs.js";
import { createInitialState, updateGame } from "../src/model/game-model.js";
import {
  getSettlementChaosGodState,
  getSettlementChaosGodSummary,
  stepSettlementChaosSecond,
} from "../src/model/settlement-chaos.js";
import { syncSettlementDerivedState } from "../src/model/settlement-exec.js";
import { deserializeGameState, serializeGameState } from "../src/model/state.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";

const RED_GOD_SPAWN_CADENCE_SEC = Math.max(
  1,
  Math.floor(RED_GOD_SPAWN_CADENCE_MOONS) * Math.max(1, Math.floor(MOON_CYCLE_SEC))
);

function buildChaosState(classSpecs, seed = 123) {
  const state = createInitialState("devPlaytesting01", seed);
  state.seasonDurationSec = 9999;
  state.seasonClockSec = 0;
  state.seasonTimeRemaining = state.seasonDurationSec;
  state.hub.classOrder = Object.keys(classSpecs);
  state.hub.core.systemState.populationClasses = {};
  for (const [classId, spec] of Object.entries(classSpecs)) {
    state.hub.core.systemState.populationClasses[classId] = {
      adults: Number.isFinite(spec?.adults) ? Math.max(0, Math.floor(spec.adults)) : 0,
      youth: Number.isFinite(spec?.youth) ? Math.max(0, Math.floor(spec.youth)) : 0,
      commitments: [],
      yearly: {},
      faith: {
        tier: typeof spec?.faithTier === "string" ? spec.faithTier : "gold",
      },
      happiness: {},
    };
  }
  syncSettlementDerivedState(state, state.tSec);
  return state;
}

function advanceToSecond(state, targetSec) {
  const safeTarget = Math.max(0, Math.floor(targetSec));
  while ((state?.tSec ?? 0) < safeTarget) {
    updateGame(1 / 60, state);
  }
}

function getLastEventByType(state, type) {
  const feed = Array.isArray(state?.gameEventFeed) ? state.gameEventFeed : [];
  for (let index = feed.length - 1; index >= 0; index -= 1) {
    if (feed[index]?.type === type) return feed[index];
  }
  return null;
}

function testPerSecondContributionBands() {
  const underTenSilver = buildChaosState({
    villager: { adults: 9, youth: 0, faithTier: "silver" },
  });
  stepSettlementChaosSecond(underTenSilver, 1);
  assert.equal(
    getSettlementChaosGodState(underTenSilver, "redGod")?.chaosPower,
    0,
    "silver class below 10 population should add zero chaos"
  );

  const tenSilver = buildChaosState({
    villager: { adults: 10, youth: 0, faithTier: "silver" },
  });
  stepSettlementChaosSecond(tenSilver, 1);
  assert.equal(
    getSettlementChaosGodState(tenSilver, "redGod")?.chaosPower,
    1,
    "silver 10-19 population should add one chaos per second"
  );

  const bronzeTwenty = buildChaosState({
    villager: { adults: 20, youth: 0, faithTier: "bronze" },
  });
  stepSettlementChaosSecond(bronzeTwenty, 1);
  assert.equal(
    getSettlementChaosGodState(bronzeTwenty, "redGod")?.chaosPower,
    4,
    "bronze 20-29 population should add four chaos per second"
  );
}

function testStackingAndFaithFiltering() {
  const state = buildChaosState({
    villager: { adults: 20, youth: 0, faithTier: "silver" },
    stranger: { adults: 10, youth: 0, faithTier: "bronze" },
    noble: { adults: 40, youth: 0, faithTier: "gold" },
    priest: { adults: 40, youth: 0, faithTier: "diamond" },
  });
  stepSettlementChaosSecond(state, 1);
  assert.equal(
    getSettlementChaosGodState(state, "redGod")?.chaosPower,
    4,
    "qualifying classes should stack while gold and diamond add zero"
  );
}

function testSpawnCadenceAndPersistentChaos() {
  const state = buildChaosState({
    villager: { adults: 10, youth: 0, faithTier: "silver" },
  });
  advanceToSecond(state, RED_GOD_SPAWN_CADENCE_SEC);

  const redGod = getSettlementChaosGodState(state, "redGod");
  assert.equal(state.tSec, RED_GOD_SPAWN_CADENCE_SEC, "expected to reach first redGod spawn second");
  assert.equal(redGod?.chaosPower, RED_GOD_SPAWN_CADENCE_SEC, "chaos should accumulate once per second");
  assert.equal(redGod?.monsterCount, 4, "first spawn should use floor(chaosPower / 10)");
  assert.equal(redGod?.lastSpawnSec, RED_GOD_SPAWN_CADENCE_SEC, "first spawn should occur at cadence second");
  assert.equal(redGod?.lastSpawnCount, 4, "last spawn count should record the pulse amount");
  assert.equal(
    redGod?.nextSpawnSec,
    RED_GOD_SPAWN_CADENCE_SEC * 2,
    "next spawn second should advance by the full cadence"
  );

  const spawnEvent = getLastEventByType(state, "redGodSpawn");
  assert.ok(spawnEvent, "spawn event should be emitted when monsters are spawned");
  assert.equal(spawnEvent?.data?.spawnCount, 4, "spawn event should report pulse count");
  assert.equal(
    spawnEvent?.data?.chaosPower,
    RED_GOD_SPAWN_CADENCE_SEC,
    "spawn should not spend chaosPower"
  );
}

function testMonsterAccumulationAcrossPulses() {
  const state = buildChaosState({
    villager: { adults: 20, youth: 0, faithTier: "silver" },
  });
  advanceToSecond(state, RED_GOD_SPAWN_CADENCE_SEC * 2);
  const redGod = getSettlementChaosGodState(state, "redGod");
  assert.equal(redGod?.chaosPower, RED_GOD_SPAWN_CADENCE_SEC * 2 * 2, "chaos should keep growing across pulses");
  assert.equal(redGod?.monsterCount, 24, "monster total should accumulate across spawn pulses");
}

function testRunCompleteOnMonsterOverrun() {
  const state = buildChaosState({
    villager: { adults: 250, youth: 0, faithTier: "bronze" },
  });
  advanceToSecond(state, RED_GOD_SPAWN_CADENCE_SEC);

  assert.equal(state?.runStatus?.complete, true, "run should complete once redGod hits the monster threshold");
  assert.equal(state?.runStatus?.reason, "redGodMonsterOverrun", "run complete reason should be the redGod defeat");
  assert.equal(state?.paused, true, "redGod defeat should pause the simulation");
  assert.equal(
    getSettlementChaosGodState(state, "redGod")?.monsterCount >= RED_GOD_MONSTER_WIN_COUNT,
    true,
    "monster count should meet or exceed the win threshold"
  );

  const runCompleteEntry = getLastEventByType(state, "runComplete");
  assert.ok(runCompleteEntry, "runComplete event should be emitted");
  assert.equal(
    runCompleteEntry?.data?.reason,
    "redGodMonsterOverrun",
    "runComplete event should report the redGod defeat reason"
  );
}

function testSerializationPreservesChaosState() {
  const state = buildChaosState({
    villager: { adults: 10, youth: 0, faithTier: "silver" },
  });
  advanceToSecond(state, RED_GOD_SPAWN_CADENCE_SEC);

  const restored = deserializeGameState(serializeGameState(state));
  assert.deepEqual(
    getSettlementChaosGodState(restored, "redGod"),
    getSettlementChaosGodState(state, "redGod"),
    "serialize/deserialize should preserve the redGod chaos state"
  );
}

function testReplayParity() {
  const initial = buildChaosState({
    villager: { adults: 10, youth: 0, faithTier: "silver" },
    stranger: { adults: 20, youth: 0, faithTier: "bronze" },
  });
  const live = deserializeGameState(serializeGameState(initial));
  advanceToSecond(live, RED_GOD_SPAWN_CADENCE_SEC);

  const timeline = createTimelineFromInitialState(initial);
  const rebuilt = rebuildStateAtSecond(timeline, RED_GOD_SPAWN_CADENCE_SEC);
  assert.equal(rebuilt?.ok, true, `rebuildStateAtSecond failed: ${JSON.stringify(rebuilt)}`);
  assert.deepEqual(
    getSettlementChaosGodState(rebuilt.state, "redGod"),
    getSettlementChaosGodState(live, "redGod"),
    "replay rebuild should match live redGod state"
  );
  assert.deepEqual(
    getSettlementChaosGodSummary(rebuilt.state, "redGod"),
    getSettlementChaosGodSummary(live, "redGod"),
    "replay rebuild should match the derived redGod HUD summary"
  );
  assert.equal(
    rebuilt.state?.runStatus?.reason ?? null,
    live?.runStatus?.reason ?? null,
    "replay rebuild should match redGod defeat timing"
  );
}

testPerSecondContributionBands();
testStackingAndFaithFiltering();
testSpawnCadenceAndPersistentChaos();
testMonsterAccumulationAcrossPulses();
testRunCompleteOnMonsterOverrun();
testSerializationPreservesChaosState();
testReplayParity();

console.log("[test] settlement chaos red god passed");
