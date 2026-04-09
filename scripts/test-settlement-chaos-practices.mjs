import assert from "node:assert/strict";

import { createInitialState, updateGame } from "../src/model/game-model.js";
import { DEFAULT_VARIANT_FLAGS } from "../src/defs/gamesettings/variant-flags-defs.js";
import { MOON_CYCLE_SEC } from "../src/defs/gamesettings/gamerules-defs.js";
import { getSettlementChaosGodState } from "../src/model/settlement-chaos.js";
import { syncSettlementDerivedState } from "../src/model/settlement-exec.js";

function buildPracticeState({
  practiceDefId,
  adults = 20,
  youth = 0,
  faithTier = "gold",
  food = 0,
  redResource = 0,
  chaosPower = 0,
  monsterCount = 0,
} = {}) {
  const state = createInitialState({
    rngSeed: 123,
    variantFlags: {
      ...DEFAULT_VARIANT_FLAGS,
      settlementPrototypeEnabled: true,
    },
    resources: { gold: 0, grain: 0, food: 0, population: 0 },
    locationNames: { hub: "Hub", region: "Region" },
    discovery: {
      envCols: new Array(5).fill(null).map(() => ({ exposed: true, revealed: true })),
      hubVisible: true,
      hubRenameUnlocked: true,
    },
    board: {
      cols: 5,
      envStructures: [],
      tiles: ["tile_hinterland", "tile_levee", "tile_floodplains", "tile_floodplains", "tile_river"],
    },
    hub: {
      cols: 6,
      classOrder: ["villager", "stranger"],
      core: {
        systemTiers: {
          faith: faithTier,
        },
        systemState: {
          stockpiles: {
            food,
            redResource,
            greenResource: 0,
            blueResource: 0,
            blackResource: 0,
          },
          chaosGods: {
            redGod: {
              enabled: true,
            },
          },
          populationClasses: {
            villager: {
              adults,
              youth,
              commitments: [],
              yearly: {},
              faith: { tier: faithTier },
              happiness: {},
            },
            stranger: {
              adults: 0,
              youth: 0,
              commitments: [],
              yearly: {},
              faith: { tier: "gold" },
              happiness: {},
            },
          },
        },
      },
      zones: {
        order: {
          slots: [null],
        },
        practiceByClass: {
          villager: {
            slots: [{ defId: practiceDefId }, null, null, null, null],
          },
          stranger: {
            slots: [null, null, null, null, null],
          },
        },
        structures: {
          slots: [
            null,
            { defId: "granary", tier: "diamond" },
            { defId: "mudHouses", tier: "diamond" },
            { defId: "riverTemple" },
            null,
            null,
          ],
        },
      },
    },
  });
  state.seasonDurationSec = 9999;
  state.seasonClockSec = 0;
  state.seasonTimeRemaining = state.seasonDurationSec;
  const redGod = state.hub.core.systemState.chaosGods.redGod;
  redGod.chaosPower = chaosPower;
  redGod.monsterCount = monsterCount;
  redGod.nextSpawnSec = 999999;
  syncSettlementDerivedState(state, state.tSec);
  return state;
}

function advanceToSecond(state, targetSec) {
  const safeTarget = Math.max(0, Math.floor(targetSec));
  while ((state?.tSec ?? 0) < safeTarget) {
    updateGame(1 / 60, state);
  }
}

function testMonsterHunt() {
  const state = buildPracticeState({
    practiceDefId: "monsterHunt",
    adults: 12,
    redResource: 12,
    monsterCount: 200,
  });

  advanceToSecond(state, 1);
  const villagerCommitments = state.hub.core.systemState.populationClasses.villager.commitments;
  assert.equal(villagerCommitments.length, 1, "monster hunt should reserve population once it starts");
  assert.equal(villagerCommitments[0]?.amount, 10, "monster hunt should cap reservation at 10 citizens");
  assert.equal(
    state.hub.core.systemState.stockpiles.redResource,
    2,
    "monster hunt should consume one red per committed citizen at start"
  );

  advanceToSecond(state, 1 + MOON_CYCLE_SEC);
  assert.equal(
    getSettlementChaosGodState(state, "redGod")?.monsterCount,
    100,
    "monster hunt should kill 10 monsters per committed citizen on return"
  );
}

function testMonsterWar() {
  const cadenceSec = MOON_CYCLE_SEC * 14;
  const state = buildPracticeState({
    practiceDefId: "monsterWar",
    adults: 25,
    food: 25,
    redResource: 25,
    chaosPower: 250,
    monsterCount: 250,
  });

  advanceToSecond(state, cadenceSec);
  const villagerCommitments = state.hub.core.systemState.populationClasses.villager.commitments;
  assert.equal(villagerCommitments.length, 1, "monster war should reserve population on its cadence");
  assert.equal(villagerCommitments[0]?.amount, 20, "monster war should cap reservation at 20 citizens");
  assert.equal(
    state.hub.core.systemState.stockpiles.food,
    5,
    "monster war should consume one food per committed citizen at start"
  );
  assert.equal(
    state.hub.core.systemState.stockpiles.redResource,
    5,
    "monster war should consume one red per committed citizen at start"
  );

  advanceToSecond(state, cadenceSec * 2);
  const redGod = getSettlementChaosGodState(state, "redGod");
  assert.equal(redGod?.monsterCount, 50, "monster war should kill 10 monsters per committed citizen on return");
  assert.equal(redGod?.chaosPower, 50, "monster war should reduce chaos power by 10 per committed citizen");
}

testMonsterHunt();
testMonsterWar();

console.log("[test] settlement chaos practices passed");
