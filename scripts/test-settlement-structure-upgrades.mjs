import assert from "node:assert/strict";

import { DEFAULT_VARIANT_FLAGS } from "../src/defs/gamesettings/variant-flags-defs.js";
import { SEASON_DURATION_SEC } from "../src/defs/gamesettings/gamerules-defs.js";
import { createInitialState, updateGame } from "../src/model/game-model.js";
import { syncSettlementDerivedState } from "../src/model/settlement-exec.js";
import { deserializeGameState, serializeGameState } from "../src/model/state.js";
import {
  getSettlementPendingVassalSelection,
  getSettlementPracticeSlotsByClass,
  getSettlementStockpile,
  getSettlementTileBlueResource,
  getSettlementTileGreenResource,
} from "../src/model/settlement-state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../src/model/timeline/index.js";
import {
  advanceSettlementStructureUpgrade,
  findSettlementStructureByDefId,
  getSettlementStructureCapacityBonus,
  getSettlementStructureUpgradeProgress,
} from "../src/model/settlement-upgrades.js";

const YEAR_DURATION_SEC = Math.max(1, Math.floor(SEASON_DURATION_SEC * 4));

function createSettlementUpgradeState({
  tiles = ["tile_hinterland", "tile_hinterland", "tile_hinterland"],
  stockpiles = {
    food: 20,
    redResource: 0,
    greenResource: 0,
    blueResource: 0,
    blackResource: 0,
  },
  structures = [{ defId: "granary" }, { defId: "mudHouses" }, null, null, null, null],
  villagerAdults = 12,
  villagerYouth = 0,
  strangerAdults = 0,
  strangerYouth = 0,
  orderSlots = [null],
  villagerPracticeSlots = [null, null, null, null, null],
  strangerPracticeSlots = [null, null, null, null, null],
} = {}) {
  return createInitialState(
    {
      rngSeed: 123,
      variantFlags: {
        ...DEFAULT_VARIANT_FLAGS,
        settlementPrototypeEnabled: true,
      },
      resources: { gold: 0, grain: 0, food: 0, population: 0 },
      discovery: {
        envCols: new Array(tiles.length).fill(null).map(() => ({ exposed: true, revealed: true })),
        hubVisible: true,
        hubRenameUnlocked: true,
      },
      board: {
        cols: tiles.length,
        envStructures: [],
        tiles,
      },
      hub: {
        cols: 6,
        classOrder: ["villager", "stranger"],
        core: {
          systemState: {
            stockpiles,
            populationClasses: {
              villager: {
                adults: villagerAdults,
                youth: villagerYouth,
                commitments: [],
                faith: { tier: "gold" },
                happiness: {
                  status: "neutral",
                  fullFeedStreak: 0,
                  missedFeedStreak: 0,
                  partialFeedRatios: [],
                },
              },
              stranger: {
                adults: strangerAdults,
                youth: strangerYouth,
                commitments: [],
                faith: { tier: "gold" },
                happiness: {
                  status: "neutral",
                  fullFeedStreak: 0,
                  missedFeedStreak: 0,
                  partialFeedRatios: [],
                },
              },
            },
          },
        },
        zones: {
          order: {
            slots: orderSlots,
          },
          practiceByClass: {
            villager: { slots: villagerPracticeSlots },
            stranger: { slots: strangerPracticeSlots },
          },
          structures: {
            slots: structures,
          },
        },
      },
    },
    123
  );
}

function advanceToSecond(state, targetSec) {
  const safeTarget = Math.max(0, Math.floor(targetSec));
  while ((state?.tSec ?? 0) < safeTarget) {
    updateGame(1 / 60, state);
  }
}

function summarizeUpgrade(structure) {
  const progress = getSettlementStructureUpgradeProgress(structure);
  return {
    tier: structure?.tier ?? null,
    capacity: getSettlementStructureCapacityBonus(structure),
    progressCompleted: progress.completedCitizenYearsTowardNextTier,
    progressRequired: progress.requiredCitizenYearsForNextTier,
    progressRemaining: progress.remainingCitizenYearsForNextTier,
    nextTier: progress.nextTier,
  };
}

function getVillagerPracticeRuntime(state, slotIndex = 0) {
  return getSettlementPracticeSlotsByClass(state, "villager")[slotIndex]?.card?.props?.settlement ?? null;
}

function runBronzeDefaultNormalizationAssertions() {
  const state = createSettlementUpgradeState({
    structures: [{ defId: "granary" }, { defId: "mudHouses" }, null, null, null, null],
  });
  const granary = findSettlementStructureByDefId(state, "granary");
  const mudHouses = findSettlementStructureByDefId(state, "mudHouses");
  assert.equal(granary?.tier, "bronze", "granary should default to bronze tier");
  assert.equal(mudHouses?.tier, "bronze", "mud houses should default to bronze tier");
  assert.equal(state?.hub?.core?.props?.foodCapacity, 200, "bronze granary should provide 200 food");
  assert.equal(
    state?.hub?.core?.props?.populationCapacity,
    100,
    "bronze mud houses should provide 100 population"
  );
}

function runTierCapacityAssertions() {
  const expectedByTier = {
    bronze: { granary: 200, mudHouses: 100 },
    silver: { granary: 600, mudHouses: 250 },
    gold: { granary: 1200, mudHouses: 400 },
    diamond: { granary: 2000, mudHouses: 600 },
  };

  for (const [tier, expected] of Object.entries(expectedByTier)) {
    const state = createSettlementUpgradeState({
      structures: [
        { defId: "granary", tier },
        { defId: "mudHouses", tier },
        null,
        null,
        null,
        null,
      ],
    });
    assert.equal(
      summarizeUpgrade(findSettlementStructureByDefId(state, "granary")).capacity,
      expected.granary,
      `${tier} granary should expose the configured capacity`
    );
    assert.equal(
      summarizeUpgrade(findSettlementStructureByDefId(state, "mudHouses")).capacity,
      expected.mudHouses,
      `${tier} mud houses should expose the configured capacity`
    );
  }
}

function runUpgradePracticeAssertions() {
  const state = createSettlementUpgradeState({
    stockpiles: {
      food: 20,
      redResource: 25,
      greenResource: 0,
      blueResource: 5,
      blackResource: 0,
    },
    villagerAdults: 30,
    structures: [{ defId: "granary" }, { defId: "mudHouses" }, null, null, null, null],
    villagerPracticeSlots: [{ defId: "upgradeFoodStorage" }, null, null, null, null],
  });

  advanceToSecond(state, 1);
  const villagerCommitments = state.hub.core.systemState.populationClasses.villager.commitments;
  const granary = findSettlementStructureByDefId(state, "granary");

  assert.equal(getSettlementStockpile(state, "redResource"), 0, "upgrade should spend red immediately");
  assert.equal(getSettlementStockpile(state, "blueResource"), 0, "upgrade should spend blue immediately");
  assert.deepEqual(
    villagerCommitments.map((commitment) => ({
      sourceId: commitment?.sourceId ?? null,
      amount: Math.floor(commitment?.amount ?? 0),
      startSec: Math.floor(commitment?.startSec ?? 0),
      releaseSec: Math.floor(commitment?.releaseSec ?? 0),
    })),
    [
      {
        sourceId: "upgradeFoodStorage",
        amount: 5,
        startSec: 1,
        releaseSec: 1 + YEAR_DURATION_SEC,
      },
    ],
    "upgrade should reserve five citizens for one year"
  );
  assert.equal(granary?.tier, "bronze", "upgrade should not complete before the yearly release");

  advanceToSecond(state, YEAR_DURATION_SEC);
  assert.equal(granary?.tier, "bronze", "upgrade should remain bronze before the release second");

  advanceToSecond(state, 1 + YEAR_DURATION_SEC);
  assert.equal(granary?.tier, "silver", "upgrade should complete exactly on release");
  assert.equal(
    summarizeUpgrade(granary).progressCompleted,
    0,
    "exact-threshold upgrade should clear progress after completion"
  );
}

function runOverflowCarryAssertions() {
  const state = createSettlementUpgradeState({
    structures: [
      {
        defId: "granary",
        tier: "bronze",
        systemState: {
          settlementUpgrade: {
            completedCitizenYearsTowardNextTier: 4,
          },
        },
      },
      { defId: "mudHouses" },
      null,
      null,
      null,
      null,
    ],
  });

  const granary = findSettlementStructureByDefId(state, "granary");
  advanceSettlementStructureUpgrade(granary, 3);
  const upgrade = summarizeUpgrade(granary);
  assert.equal(granary?.tier, "silver", "overflow batch should advance the granary tier");
  assert.equal(upgrade.progressCompleted, 2, "overflow should carry into the next tier");
  assert.equal(upgrade.progressRequired, 10, "silver tier should require 10 citizen-years");
  assert.equal(upgrade.progressRemaining, 8, "overflow carry should reduce remaining progress");
}

function runBlockedPracticeAssertions() {
  const missingState = createSettlementUpgradeState({
    structures: [{ defId: "mudHouses" }, null, null, null, null, null],
    villagerPracticeSlots: [{ defId: "upgradeFoodStorage" }, null, null, null, null],
  });
  syncSettlementDerivedState(missingState, 0);
  assert.equal(
    getVillagerPracticeRuntime(missingState, 0)?.blockedReason,
    "upgradeTargetMissing:granary",
    "food storage upgrade should block when no granary exists"
  );

  const diamondState = createSettlementUpgradeState({
    structures: [{ defId: "granary", tier: "diamond" }, { defId: "mudHouses" }, null, null, null, null],
    villagerPracticeSlots: [{ defId: "upgradeFoodStorage" }, null, null, null, null],
  });
  syncSettlementDerivedState(diamondState, 0);
  assert.equal(
    getVillagerPracticeRuntime(diamondState, 0)?.blockedReason,
    "upgradeTier:diamond",
    "food storage upgrade should block once the target reaches diamond"
  );
}

function runSerializationReplayAssertions() {
  const live = createSettlementUpgradeState({
    stockpiles: {
      food: 20,
      redResource: 10,
      greenResource: 0,
      blueResource: 2,
      blackResource: 0,
    },
    structures: [
      {
        defId: "granary",
        tier: "silver",
        systemState: {
          settlementUpgrade: {
            completedCitizenYearsTowardNextTier: 3,
          },
        },
      },
      { defId: "mudHouses" },
      null,
      null,
      null,
      null,
    ],
    villagerPracticeSlots: [{ defId: "upgradeFoodStorage" }, null, null, null, null],
  });
  advanceToSecond(live, 1);

  const serialized = serializeGameState(live);
  const restored = deserializeGameState(serialized);
  assert.deepEqual(
    summarizeUpgrade(findSettlementStructureByDefId(restored, "granary")),
    summarizeUpgrade(findSettlementStructureByDefId(live, "granary")),
    "serialize/deserialize should preserve tier and partial upgrade progress"
  );
  assert.deepEqual(
    restored.hub.core.systemState.populationClasses.villager.commitments,
    live.hub.core.systemState.populationClasses.villager.commitments,
    "serialize/deserialize should preserve pending upgrade commitments"
  );

  const timeline = createTimelineFromInitialState(
    createSettlementUpgradeState({
      stockpiles: {
        food: 20,
        redResource: 10,
        greenResource: 0,
        blueResource: 2,
        blackResource: 0,
      },
      structures: [
        {
          defId: "granary",
          tier: "silver",
          systemState: {
            settlementUpgrade: {
              completedCitizenYearsTowardNextTier: 3,
            },
          },
        },
        { defId: "mudHouses" },
        null,
        null,
        null,
        null,
      ],
      villagerPracticeSlots: [{ defId: "upgradeFoodStorage" }, null, null, null, null],
    })
  );
  const rebuilt = rebuildStateAtSecond(timeline, 64);
  assert.equal(rebuilt?.ok, true, `rebuildStateAtSecond failed: ${JSON.stringify(rebuilt)}`);
  const replayLive = createSettlementUpgradeState({
    stockpiles: {
      food: 20,
      redResource: 10,
      greenResource: 0,
      blueResource: 2,
      blackResource: 0,
    },
    structures: [
      {
        defId: "granary",
        tier: "silver",
        systemState: {
          settlementUpgrade: {
            completedCitizenYearsTowardNextTier: 3,
          },
        },
      },
      { defId: "mudHouses" },
      null,
      null,
      null,
      null,
    ],
    villagerPracticeSlots: [{ defId: "upgradeFoodStorage" }, null, null, null, null],
  });
  advanceToSecond(replayLive, 64);
  assert.deepEqual(
    summarizeUpgrade(findSettlementStructureByDefId(rebuilt.state, "granary")),
    summarizeUpgrade(findSettlementStructureByDefId(replayLive, "granary")),
    "rebuild should match live partial progress state"
  );
  assert.deepEqual(
    rebuilt.state.hub.core.systemState.populationClasses.villager.commitments,
    replayLive.hub.core.systemState.populationClasses.villager.commitments,
    "rebuild should preserve pending upgrade commitments"
  );
}

function runElderAgendaClearAssertions() {
  const state = createSettlementUpgradeState({
    stockpiles: {
      food: 20,
      redResource: 10,
      greenResource: 0,
      blueResource: 2,
      blackResource: 0,
    },
    villagerAdults: 30,
    orderSlots: [{ defId: "elderCouncil" }],
    villagerPracticeSlots: [{ defId: "upgradeFoodStorage" }, null, null, null, null],
  });
  const councilCard = state.hub.zones.order.slots[0]?.card ?? null;
  assert.ok(councilCard, "expected elder council card");
  for (const member of councilCard.systemState.elderCouncil.members) {
    member.agendaByClass.villager = ["upgradeFoodStorage", "rest"];
  }

  advanceToSecond(state, 1 + YEAR_DURATION_SEC);
  const granary = findSettlementStructureByDefId(state, "granary");
  assert.equal(
    granary?.tier,
    "bronze",
    "a completed partial upgrade batch should not need to finish the whole tier"
  );
  assert.equal(
    getSettlementStructureUpgradeProgress(granary).completedCitizenYearsTowardNextTier,
    2,
    "partial upgrade batches should still add progress before the agenda is cleared"
  );

  for (const member of councilCard.systemState.elderCouncil.members) {
    assert.equal(
      member.agendaByClass.villager.includes("upgradeFoodStorage"),
      false,
      "elders should clear the completed food-storage upgrade practice from their agendas"
    );
  }
  const villagerBoard = getSettlementPracticeSlotsByClass(state, "villager").map(
    (slot) => slot?.card?.defId ?? null
  );
  assert.ok(
    !villagerBoard.includes("upgradeFoodStorage"),
    "resolved villager board should drop the completed upgrade practice"
  );
}

function runVassalAgendaClearAssertions() {
  const state = createSettlementUpgradeState({
    stockpiles: {
      food: 20,
      redResource: 10,
      greenResource: 0,
      blueResource: 2,
      blackResource: 0,
    },
    villagerAdults: 30,
    villagerPracticeSlots: [{ defId: "upgradeFoodStorage" }, null, null, null, null],
  });
  const pendingSelection = getSettlementPendingVassalSelection(state);
  const candidates = Array.isArray(pendingSelection?.candidates) ? pendingSelection.candidates : [];
  assert.ok(candidates.length > 0, "expected a pending vassal selection pool");

  for (const candidate of candidates) {
    candidate.agendaByClass.villager = ["upgradeFoodStorage", "rest"];
  }

  advanceToSecond(state, 1 + YEAR_DURATION_SEC);

  for (const candidate of candidates) {
    assert.equal(
      candidate.agendaByClass.villager.includes("upgradeFoodStorage"),
      false,
      "pending vassal candidates should clear the completed food-storage upgrade practice from their agendas"
    );
  }
  for (const record of Object.values(state.hub.core.systemState.vassalLineage?.vassalsById ?? {})) {
    assert.equal(
      (record?.agendaByClass?.villager ?? []).includes("upgradeFoodStorage"),
      false,
      "stored vassal lineage records should clear the completed food-storage upgrade practice from their agendas"
    );
  }
}

function runBlueResourceAssertions() {
  const capState = createSettlementUpgradeState({
    tiles: new Array(12).fill("tile_hinterland"),
    structures: [{ defId: "granary" }, { defId: "mudHouses" }, null, null, null, null],
  });
  advanceToSecond(capState, 33);
  assert.equal(getSettlementStockpile(capState, "blueResource"), 10, "blue should cap at 10");
  for (let index = 0; index < 12; index += 1) {
    const tile = capState.board.layers.tile.anchors[index];
    const expected = index < 10 ? 1 : 0;
    assert.equal(
      getSettlementTileBlueResource(tile),
      expected,
      "blue should fill hinterlands left-to-right until the cap is reached"
    );
  }

  advanceToSecond(capState, 65);
  assert.equal(
    getSettlementStockpile(capState, "blueResource"),
    10,
    "blue should stop generating once the global cap is reached"
  );

  const floodState = createSettlementUpgradeState({
    tiles: ["tile_hinterland", "tile_floodplains", "tile_floodplains", "tile_hinterland"],
    structures: [{ defId: "granary" }, { defId: "mudHouses" }, null, null, null, null],
  });
  advanceToSecond(floodState, 129);
  assert.equal(
    getSettlementTileGreenResource(floodState.board.layers.tile.anchors[1]) +
      getSettlementTileGreenResource(floodState.board.layers.tile.anchors[2]),
    10,
    "spring floodplain green generation should remain unchanged"
  );
}

function run() {
  runBronzeDefaultNormalizationAssertions();
  runTierCapacityAssertions();
  runUpgradePracticeAssertions();
  runOverflowCarryAssertions();
  runBlockedPracticeAssertions();
  runSerializationReplayAssertions();
  runElderAgendaClearAssertions();
  runVassalAgendaClearAssertions();
  runBlueResourceAssertions();
  console.log("[test] settlement structure upgrades passed");
}

run();
