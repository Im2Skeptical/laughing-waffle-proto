import { mkdirSync, writeFileSync } from "node:fs";
import { ActionKinds, applyAction } from "../../src/model/actions.js";
import { createInitialState } from "../../src/model/init.js";
import { createConfiguredNewGameState, createNewGameState } from "../../src/model/new-game.js";
import { buildProjectionChunkFromStateData } from "../../src/model/projection-chunk.js";
import { createRegionalBootProfile } from "../../src/model/regional-map/boot-profile.js";
import { advanceReplayStateToSecond } from "../../src/model/replay-second-runner.js";
import { serializeGameState } from "../../src/model/state.js";
import { getCurrentLifeMapVassal } from "../../src/model/vassal-life-map.js";

const root = new URL("../../artifacts/native-schema/", import.meta.url);
const sustained = process.argv.includes("--sustained");
const queued = process.argv.includes("--queued");
const directory = new URL(sustained ? "sustained/" : queued ? "queued/" : "snapshots-v2/", root);
const worldSeeds = [0, 1, 2, 3, 4, 13, 42, 123, 1867, 99117, 424242, 2026];
const preparedSeeds = [123, 1867, 99117, 424242, 2026];
const records = [];
const families = {};
mkdirSync(directory, { recursive: true });

function save(label, data, seed, group) {
  writeFileSync(new URL(label + ".json", directory), JSON.stringify(data));
  records.push({ label, seed, group: data.runStatus?.complete ? group + "-terminal" : group, sec: data.tSec });
}

function atHorizons(state, seed, group, seconds) {
  for (const sec of seconds) {
    if (!advanceReplayStateToSecond(state, sec).ok) {
      save(`${group}-${seed}-terminal`, serializeGameState(state), seed, group);
      break;
    }
    save(`${group}-${seed}-${sec}`, serializeGameState(state), seed, group);
  }
}

function capturePrepared(seed) {
  const initial = serializeGameState(createNewGameState(seed));
  save(`prepared-${seed}-0`, initial, seed, "prepared");
  // Same model entry as scripts/performance-fixture-recipe.mjs. Seed 123 uses
  // the normal cache-sized 6,400 s window. The other seeds use shorter windows.
  const forecast = buildProjectionChunkFromStateData(initial, 0, seed === 123 ? 6400 : 320);
  if (!forecast.ok) throw Error(`prepared seed ${seed}: ${forecast.reason}`);
  const checkpoints = new Set([16, 32, 128, 320, forecast.endSec]);
  for (const [sec, data] of forecast.stateDataBySecond) {
    if (checkpoints.has(sec)) save(`prepared-${seed}-${sec}`, data, seed, "prepared");
  }
}

const act = (state, kind, payload = {}) => applyAction(state, { kind, payload }, { isReplay: true }).ok;

function captureActions(seed) {
  const profile = createRegionalBootProfile(seed);
  profile.gameSettings.values.primordialBasePressure = 0;
  if (seed === 405) {
    // The direct configured constructor accepts a finite fractional season
    // duration. The settings draft editor requires integer durations.
    profile.gameSettings.values.phaseDurationSec = 2;
    profile.gameSettings.values.seasonDurationSec = 7.25;
  }
  const state = createConfiguredNewGameState(seed, profile);
  const K = ActionKinds;
  let serial = 0;
  const snapshot = () => save(`play-${seed}-${serial++}`, serializeGameState(state), seed, "actions");
  if (act(state, K.DEBUG_SET_CAP, { cap: 71, points: 12 })) snapshot();

  for (let attempt = 0; attempt < 44 && !state.runStatus?.complete; attempt++) {
    const lineage = state.civilization.vassalLineage;
    if (lineage.pendingVaultOverflow?.length) {
      const keepInstanceIds = lineage.pendingVaultOverflow.slice(0, 6).map(item => item.instanceId);
      if (act(state, K.VASSAL_RESOLVE_VAULT_OVERFLOW, { keepInstanceIds })) snapshot();
    }
    if (!getCurrentLifeMapVassal(state)) {
      const candidateIndex = (seed + attempt) % lineage.pendingCandidates.length;
      if (!act(state, K.SETTLEMENT_SELECT_VASSAL, { candidateIndex })) break;
      snapshot();
    }
    const vassal = getCurrentLifeMapVassal(state);
    if (act(state, K.VASSAL_CONFIRM_HEIRLOOM_LOADOUT)) snapshot();
    if (vassal.commissionOffers?.length &&
        act(state, K.VASSAL_CHOOSE_COMMISSION, { offerId: vassal.commissionOffers[0].offerId })) snapshot();
    while (vassal.developmentChoiceQueue.length) {
      const { choiceId, offeredStatIds } = vassal.developmentChoiceQueue[0];
      if (!act(state, K.VASSAL_CHOOSE_DEVELOPMENT_STAT, { choiceId, statId: offeredStatIds[0] })) break;
      snapshot();
    }

    const map = vassal.lifeMap;
    const nodeId = map.currentNodeId ?? map.availableNodeIds[(seed + attempt) % map.availableNodeIds.length];
    if (!map.currentNodeId && !act(state, K.VASSAL_ENTER_LIFE_NODE, { nodeId })) break;
    const node = map.nodeStates[nodeId];
    families[node.family] = (families[node.family] ?? 0) + 1;
    snapshot();
    if (node.shopSelection && !node.shopSelection.selectedTag) {
      const choice = node.shopSelection.choices.find(entry => entry.enabled);
      if (choice && act(state, K.VASSAL_SELECT_LIFE_OPTION, { nodeId, optionId: choice.id })) snapshot();
    }
    if (node.contentMode === "shop") {
      for (const offer of node.inventory) {
        if (act(state, K.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: offer.offerId })) {
          snapshot();
          break;
        }
      }
    } else if (!node.selectedOptionId) {
      const choices = node.options.slice();
      choices.push(...choices.splice(0, (seed + attempt) % choices.length));
      for (const choice of choices) {
        if (act(state, K.VASSAL_SELECT_LIFE_OPTION, { nodeId, optionId: choice.id })) {
          snapshot();
          break;
        }
      }
    }
    if (!act(state, K.VASSAL_CONFIRM_LIFE_NODE, { nodeId, acquire: { destination: "carry" } }) &&
        !act(state, K.VASSAL_CONFIRM_LIFE_NODE, { nodeId })) break;
    snapshot();
    if (node.rewardAcquisition && !map.pendingResolution &&
        act(state, K.VASSAL_CONFIRM_LIFE_NODE, { nodeId, acquire: { destination: "equip" } })) snapshot();
    if (map.pendingResolution) {
      const result = advanceReplayStateToSecond(state, map.pendingResolution.resolveSec);
      snapshot();
      if (!result.ok) break;
    }
  }
}

if (queued) {
  const state = createNewGameState(123);
  if (!advanceReplayStateToSecond(state, 7).ok) throw Error("Failed to reach the action second");
  const regionId = state.world.regions.find(region => region.controller === "player").id;
  if (!act(state, ActionKinds.SETTLEMENT_ASSIGN_GARRISON, { regionId, targetRegionId: null })) {
    throw Error("Could not clear garrison support");
  }
  save("garrison-pending-7", serializeGameState(state), 123, "queued");
  atHorizons(state, 123, "queued", [8]);
} else if (sustained) {
  const profile = createRegionalBootProfile(123);
  Object.assign(profile.gameSettings.values, {
    primordialBasePressure: 0,
    monsterExpansionThreshold: 100000,
    monsterProgressPerChaosRatio: 0,
    partialFeedMinimumRatio: 0,
    bronzeCollapseLossRate: 0,
    adultToElderRate: 0,
    birthRateBronze: 0,
    birthRateSilver: 0,
    birthRateGold: 0,
    birthRateDiamond: 0,
  });
  const state = createConfiguredNewGameState(123, profile);
  const year = state.seasons.length * state.gameConfig.settings.values.seasonDurationSec;
  atHorizons(state, 123, "sustained", [1, 50, 200, 210, 1000].map(years => years * year));
} else {
  for (const seed of worldSeeds) {
    const state = createNewGameState(seed);
    const year = state.seasons.length * state.gameConfig.settings.values.seasonDurationSec;
    atHorizons(state, seed, "world", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, year, year + 1, year * 2, year * 5, year * 10, year * 20]);
  }
  preparedSeeds.forEach(capturePrepared);
  for (const seed of [1, 42, 1867]) {
    atHorizons(createInitialState("devPlaytesting01", seed), seed, "authored", [0, 6, 32, 160]);
  }
  for (const seed of [...worldSeeds, 405, 255, 399, 820]) captureActions(seed);
}
const manifest = new URL(sustained ? "manifest-sustained.json" : queued ? "manifest-queued.json" : "manifest-v2.json", root);
writeFileSync(manifest, JSON.stringify({ records, families }, null, 2));
console.log(JSON.stringify({ captured: records.length, families, directory: directory.pathname }, null, 2));
