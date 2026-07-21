import assert from "node:assert/strict";
import { setupDefs } from "../../defs/gamesettings/scenarios-defs.js";
import { createInitialState } from "../init.js";
import {
  addMapLabPractice,
  createAuthoredMapLabDraft,
  evaluateMapLabPractice,
  getMapLabConnectedComponents,
  getMapLabDiagnostics,
  moveMapLabPractice,
  parseMapLabDraftJson,
  removeMapLabPractice,
  serializeMapLabDraft,
  toggleMapLabConnection,
  updateMapLabRegion,
  validateMapLabDraft,
} from "../map-lab-draft.js";
import { evaluateRegionalPracticePlacement } from "../regional-practices.js";
import { buildProjectionStateWindowFromTimeline } from "../projection.js";
import { serializeGameState } from "../state.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../timeline/index.js";
import { getConnectedRegionIds, getRegionState, validateWorldState } from "../world-state.js";

function testDefaultAndJsonRoundTrip() {
  const draft = createAuthoredMapLabDraft();
  assert.equal(validateMapLabDraft(draft).ok, true);
  const text = serializeMapLabDraft(draft);
  assert.equal(text.includes("polygonVertexIds"), false);
  assert.equal(text.includes("labelPoint"), false);
  assert.equal(text.includes("sites"), false);
  const parsed = parseMapLabDraftJson(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.draft, draft);

  assert.match(parseMapLabDraftJson("{").errors[0], /^json:/);
  const bad = JSON.parse(text);
  bad.regions[0].installedPracticeIds = ["unknown"];
  bad.regions[0].capacity = 0;
  bad.connections.push({ regionAId: "river-crown", regionBId: "river-crown" });
  const validation = validateMapLabDraft(bad);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((entry) => entry.includes("exceed capacity")));
  assert.ok(validation.errors.some((entry) => entry.includes("invalid practice")));
  assert.ok(validation.errors.some((entry) => entry.includes("self-connections")));
}

function testEditingAndCapacity() {
  let draft = createAuthoredMapLabDraft();
  let result = updateMapLabRegion(draft, "west-levee", { capacity: 1 });
  assert.equal(result.ok, true); draft = result.draft;
  result = addMapLabPractice(draft, "west-levee", "store");
  assert.equal(result.ok, true); draft = result.draft;
  assert.equal(addMapLabPractice(draft, "west-levee", "store").reason, "capacityFull");
  assert.equal(updateMapLabRegion(draft, "west-levee", { capacity: 0 }).reason, "capacityBelowInstalled");
  draft = updateMapLabRegion(draft, "west-levee", { capacity: 3 }).draft;
  draft = addMapLabPractice(draft, "west-levee", "cultivate").draft;
  draft = addMapLabPractice(draft, "west-levee", "store").draft;
  assert.deepEqual(getRegionState({ world: { regions: draft.regions } }, "west-levee").installedPracticeIds, ["store", "cultivate", "store"]);
  draft = moveMapLabPractice(draft, "west-levee", 2, 0).draft;
  assert.deepEqual(draft.regions.find((entry) => entry.id === "west-levee").installedPracticeIds, ["store", "store", "cultivate"]);
  draft = removeMapLabPractice(draft, "west-levee", 1).draft;
  assert.deepEqual(draft.regions.find((entry) => entry.id === "west-levee").installedPracticeIds, ["store", "cultivate"]);
}

function testConnectionsAndComponents() {
  let draft = createAuthoredMapLabDraft();
  assert.equal(toggleMapLabConnection(draft, "river-crown", "river-crown").reason, "selfConnection");
  let result = toggleMapLabConnection(draft, "salt-coast", "outer-isles");
  assert.equal(result.connected, false); draft = result.draft;
  assert.equal(getMapLabConnectedComponents(draft).length, 2);
  result = toggleMapLabConnection(draft, "outer-isles", "salt-coast");
  assert.equal(result.connected, true); draft = result.draft;
  assert.equal(getMapLabConnectedComponents(draft).length, 1);
  assert.equal(draft.connections.filter((entry) => [entry.regionAId, entry.regionBId].includes("outer-isles")).length, 1);
}

function testEvaluationAndDiagnostics() {
  const draft = createAuthoredMapLabDraft();
  const before = serializeMapLabDraft(draft);
  const exchange = evaluateMapLabPractice(draft, "exchange");
  assert.equal(exchange.find((entry) => entry.regionId === "river-crown").evaluation.score, 5);
  assert.equal(exchange.find((entry) => entry.regionId === "iron-hills").eligible, false);
  assert.equal(serializeMapLabDraft(draft), before, "evaluation mutated the draft");
  const diagnostics = getMapLabDiagnostics(draft);
  assert.equal(diagnostics.practices.length, 6);
  assert.equal(diagnostics.practices.find((entry) => entry.practiceId === "store").flat, true);
  assert.deepEqual(diagnostics.practices.find((entry) => entry.practiceId === "cultivate").bestRegionIds, ["upper-floodplain"]);
  assert.ok(diagnostics.dominantRegions.some((entry) => entry.regionId === "river-crown"));

  const sharedWinnerDraft = createAuthoredMapLabDraft();
  const river = sharedWinnerDraft.regions.find((entry) => entry.id === "river-crown");
  river.capacity = 10;
  river.installedPracticeIds = ["store", "store", "cultivate", "exchange"];
  const shared = getMapLabDiagnostics(sharedWinnerDraft).sharedSoleBestRegions
    .find((entry) => entry.regionId === "river-crown");
  assert.ok(shared?.practiceIds.includes("store"));
  assert.ok(shared?.practiceIds.includes("study"));

  const noEligible = createAuthoredMapLabDraft();
  for (const region of noEligible.regions) region.controller = "frontier";
  const noEligibleStore = getMapLabDiagnostics(noEligible).practices.find((entry) => entry.practiceId === "store");
  assert.equal(noEligibleStore.eligibleRegionCount, 0);
  assert.equal(noEligibleStore.flat, false);
  assert.equal(noEligibleStore.comparisonStatus, "insufficient");
}

function testFreshScenarioReplayParity() {
  let draft = createAuthoredMapLabDraft();
  draft = toggleMapLabConnection(draft, "salt-coast", "outer-isles").draft;
  draft = updateMapLabRegion(draft, "river-crown", { colour: "blue", capacity: 5 }).draft;
  draft = addMapLabPractice(draft, "river-crown", "exchange").draft;
  const state = createInitialState({
    ...createInitialSetup(),
    worldDraft: draft,
  }, 12345);
  assert.equal(validateWorldState(state).ok, true);
  assert.equal(state.tSec, 0);
  assert.equal(getConnectedRegionIds(state, "outer-isles").length, 0);
  assert.equal(getRegionState(state, "river-crown").colour, "blue");
  draft.regions.find((entry) => entry.id === "river-crown").colour = "red";
  assert.equal(getRegionState(state, "river-crown").colour, "blue", "applied state shares draft references");
  const score = evaluateRegionalPracticePlacement(state, { regionId: "river-crown", practiceId: "exchange" });
  assert.equal(score.score, 5);
  const timeline = createTimelineFromInitialState(state);
  const first = rebuildStateAtSecond(timeline, 8);
  const second = rebuildStateAtSecond(timeline, 8);
  assert.equal(first.ok, true); assert.equal(second.ok, true);
  assert.deepEqual(serializeGameState(first.state), serializeGameState(second.state));
  const projection = buildProjectionStateWindowFromTimeline(timeline, 0, { horizonSec: 8 });
  assert.equal(projection.ok, true);
  assert.deepEqual(projection.stateDataBySecond.get(8), serializeGameState(first.state));
}

function createInitialSetup() {
  // Preserve the complete authored settlement while replacing only world mechanics.
  return JSON.parse(JSON.stringify(globalSetup));
}

const globalSetup = setupDefs.devPlaytesting01;

export function runMapLabDraftSuite() {
  testDefaultAndJsonRoundTrip();
  testEditingAndCapacity();
  testConnectionsAndComponents();
  testEvaluationAndDiagnostics();
  testFreshScenarioReplayParity();
  return true;
}

runMapLabDraftSuite();
console.log("[map-lab-draft] OK");
