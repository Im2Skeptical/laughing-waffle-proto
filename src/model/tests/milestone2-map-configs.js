import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  milestone2BlankDraft,
  milestone2SparseDraft,
} from "../../defs/world/milestone2-map-configs.js";
import { createInitialState } from "../init.js";
import {
  canonicalizeMapLabDraft,
  evaluateMapLabPractice,
  getMapLabConnectedComponents,
  getMapLabDiagnostics,
  validateMapLabDraft,
} from "../map-lab-draft.js";
import { worldMapDefs } from "../../defs/world/world-map-defs.js";
import {
  getConnectedRegionIds,
  getRegionState,
  isWorldConnectionCandidate,
} from "../world-state.js";

const PLAYER_REGION_IDS = ["west-levee", "upper-floodplain", "river-crown", "lake-country"];
const PRACTICE_IDS = ["cultivate", "store", "study", "mobilize", "administer", "exchange"];

const EXPECTED_BLANK_MATRIX = {
  cultivate: [2, 3, 2, 1],
  store: [1, 1, 1, 1],
  study: [1, 1, 1, 1],
  mobilize: [4, 1, 2, 4],
  administer: [1, 1, 1, 1],
  exchange: [5, 3, 4, 5],
};

const EXPECTED_SPARSE_MATRIX = {
  cultivate: [2, 3, 2, 1],
  store: [3, 1, 1, 2],
  study: [2, 3, 2, 3],
  mobilize: [4, 1, 2, 4],
  administer: [3, 2, 2, 3],
  exchange: [5, 3, 4, 5],
};

function matrixForDraft(draft) {
  return Object.fromEntries(PRACTICE_IDS.map((practiceId) => [
    practiceId,
    PLAYER_REGION_IDS.map((regionId) => evaluateMapLabPractice(draft, practiceId)
      .find((entry) => entry.regionId === regionId)?.evaluation?.score),
  ]));
}

function degree(draft, regionId) {
  return draft.connections.filter((entry) =>
    entry.regionAId === regionId || entry.regionBId === regionId
  ).length;
}

function neighbors(draft, regionId) {
  return draft.connections.flatMap((entry) => {
    if (entry.regionAId === regionId) return [entry.regionBId];
    if (entry.regionBId === regionId) return [entry.regionAId];
    return [];
  });
}

function testMechanicalShapeAndPolitics() {
  for (const draft of [milestone2BlankDraft, milestone2SparseDraft]) {
    assert.equal(validateMapLabDraft(draft).ok, true);
    assert.equal(getMapLabConnectedComponents(draft).length, 2);
    assert.equal(draft.regions.length, 15);
    assert.equal(draft.connections.length, 17);
    assert.equal(draft.regions.filter((entry) => entry.controller === "player").length, 4);
    assert.equal(draft.regions.filter((entry) => entry.controller === "frontier").length, 3);
    assert.equal(draft.regions.filter((entry) => entry.controller === "external-a").length, 4);
    assert.equal(draft.regions.filter((entry) => entry.controller === "external-b").length, 4);
    assert.deepEqual(new Set(draft.regions.map((entry) => entry.colour)), new Set(["red", "blue", "green", "black"]));
    assert.ok(draft.regions.every((entry) => entry.capacity >= 2 && entry.capacity <= 4));
    assert.ok(draft.regions.every((entry) => Object.keys(entry).sort().join("|")
      === "capacity|colour|controller|id|installedPracticeIds"));
    assert.ok(draft.connections.every((entry) => Object.keys(entry).sort().join("|")
      === "regionAId|regionBId"));
    assert.ok(draft.connections.every((entry) => isWorldConnectionCandidate(
      worldMapDefs.riverBasin01,
      entry.regionAId,
      entry.regionBId
    )), "every authored connection follows a shared polygon edge");
  }

  assert.ok(milestone2BlankDraft.regions.every((entry) => entry.installedPracticeIds.length === 0));
  assert.ok(milestone2SparseDraft.regions
    .filter((entry) => entry.controller === "player")
    .every((entry) => entry.installedPracticeIds.length === entry.capacity - 1));
  assert.equal(degree(milestone2BlankDraft, "lake-country"), 4, "Lake Country is a high-connectivity hub");
  assert.equal(degree(milestone2BlankDraft, "upper-floodplain"), 2);
  assert.ok(neighbors(milestone2BlankDraft, "upper-floodplain").every((id) => PLAYER_REGION_IDS.includes(id)),
    "Upper Floodplain is politically deep");
  assert.equal(degree(milestone2BlankDraft, "outer-isles"), 0, "Outer Isles has no shared polygon edge");
  assert.equal(degree(milestone2BlankDraft, "salt-coast"), 1, "Salt Coast is the peripheral mainland branch");
  assert.deepEqual(neighbors(milestone2BlankDraft, "high-pass").sort(), ["copper-basin", "iron-hills"]);

  const withoutBottleneck = canonicalizeMapLabDraft(milestone2BlankDraft);
  withoutBottleneck.connections = withoutBottleneck.connections.filter((entry) => !(
    [entry.regionAId, entry.regionBId].includes("black-marsh")
    && [entry.regionAId, entry.regionBId].includes("salt-coast")
  ));
  assert.equal(getMapLabConnectedComponents(withoutBottleneck).length, 3, "Black Marsh–Salt Coast is a bottleneck edge");

  const lakeNeighborColours = new Set(neighbors(milestone2BlankDraft, "lake-country")
    .map((id) => milestone2BlankDraft.regions.find((entry) => entry.id === id).colour));
  assert.deepEqual(lakeNeighborColours, new Set(["red", "blue", "green", "black"]));
  assert.equal(milestone2BlankDraft.regions.filter((entry) => entry.colour === "blue").length, 3);
  assert.ok(neighbors(milestone2BlankDraft, "lake-country").includes("black-marsh"));
  assert.equal(milestone2BlankDraft.regions.find((entry) => entry.id === "black-marsh").controller, "frontier");

  const externalLoopEdges = [
    ["copper-basin", "east-steppe"],
    ["east-steppe", "obsidian-ridge"],
    ["copper-basin", "obsidian-ridge"],
  ];
  assert.ok(externalLoopEdges.every(([left, right]) => neighbors(milestone2BlankDraft, left).includes(right)),
    "external territory contains a loop");
}

function testMatricesAndDiagnostics() {
  assert.deepEqual(matrixForDraft(milestone2BlankDraft), EXPECTED_BLANK_MATRIX);
  assert.deepEqual(matrixForDraft(milestone2SparseDraft), EXPECTED_SPARSE_MATRIX);

  const sparseDiagnostics = getMapLabDiagnostics(milestone2SparseDraft);
  assert.equal(sparseDiagnostics.practices.some((entry) => entry.flat), false);
  assert.equal(sparseDiagnostics.practices.every((entry) => entry.eligibleRegionCount === 4), true);
  assert.deepEqual(
    sparseDiagnostics.practices.find((entry) => entry.practiceId === "store").bestRegionIds,
    ["west-levee"]
  );
  assert.deepEqual(
    sparseDiagnostics.practices.find((entry) => entry.practiceId === "study").bestRegionIds,
    ["upper-floodplain", "lake-country"]
  );
  assert.deepEqual(
    sparseDiagnostics.practices.find((entry) => entry.practiceId === "administer").bestRegionIds,
    ["west-levee", "lake-country"]
  );
  assert.ok(Math.max(...sparseDiagnostics.dominantRegions.map((entry) => entry.evaluatorCount)) < PRACTICE_IDS.length);
}

function testNamedScenariosAndExports() {
  const blankState = createInitialState("devMilestone2Blank01", 12345);
  const sparseState = createInitialState("devMilestone2Sparse01", 12345);
  assert.deepEqual(getRegionState(blankState, "west-levee").installedPracticeIds, []);
  assert.deepEqual(getRegionState(sparseState, "west-levee").installedPracticeIds, ["store", "store"]);
  assert.equal(getConnectedRegionIds(sparseState, "lake-country").length, 4);

  const blankExport = JSON.parse(readFileSync(
    new URL("../../../exports/milestone2-blank-01.json", import.meta.url), "utf8"
  ));
  const sparseExport = JSON.parse(readFileSync(
    new URL("../../../exports/milestone2-sparse-01.json", import.meta.url), "utf8"
  ));
  assert.deepEqual(blankExport, canonicalizeMapLabDraft(milestone2BlankDraft));
  assert.deepEqual(sparseExport, canonicalizeMapLabDraft(milestone2SparseDraft));
}

export function runMilestone2MapConfigSuite() {
  testMechanicalShapeAndPolitics();
  testMatricesAndDiagnostics();
  testNamedScenariosAndExports();
  return true;
}

runMilestone2MapConfigSuite();
console.log("[milestone2-map-configs] OK");
