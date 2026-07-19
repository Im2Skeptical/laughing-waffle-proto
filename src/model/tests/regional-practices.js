import assert from "node:assert/strict";
import { ActionKinds } from "../actions.js";
import { cmdInstallRegionalPractice } from "../commands/regional-practice-commands.js";
import { createInitialState } from "../init.js";
import { buildProjectionStateWindowFromTimeline } from "../projection.js";
import {
  evaluateRegionalPracticePlacement,
  validateRegionalPracticeInstallation,
} from "../regional-practices.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
  replaceActionsAtSecond,
} from "../timeline/index.js";
import { getRegionState } from "../world-state.js";

function freshState() {
  return createInitialState("devPlaytesting01", 314159);
}

function evaluateWithoutMutation(state, regionId, practiceId) {
  const before = serializeGameState(state);
  const result = evaluateRegionalPracticePlacement(state, { regionId, practiceId });
  assert.deepEqual(serializeGameState(state), before, `${practiceId} evaluator mutated state`);
  return result;
}

function testEvaluators() {
  const cultivateState = freshState();
  const cultivate = evaluateWithoutMutation(cultivateState, "river-crown", "cultivate");
  assert.equal(cultivate.score, 3);
  assert.equal(cultivate.uncappedScore, 3);
  assert.deepEqual(cultivate.diagnostics.matchingRegionIds, ["upper-floodplain", "lake-country"]);

  const storeState = freshState();
  const storeHost = getRegionState(storeState, "river-crown");
  storeHost.installedPracticeIds = ["store", "cultivate", "store"];
  const store = evaluateWithoutMutation(storeState, "river-crown", "store");
  assert.equal(store.score, 3);
  assert.equal(store.breakdown[1].amount, 2);

  const studyState = freshState();
  const studyHost = getRegionState(studyState, "river-crown");
  studyHost.capacity = 10;
  studyHost.installedPracticeIds = [
    "cultivate",
    "cultivate",
    "store",
    "exchange",
    "study",
    "mobilize",
  ];
  const study = evaluateWithoutMutation(studyState, "river-crown", "study");
  assert.equal(study.score, 4);
  assert.equal(study.uncappedScore, 5);
  assert.equal(study.capped, true);
  assert.deepEqual(study.diagnostics.distinctPracticeIds, ["cultivate", "store", "exchange", "mobilize"]);

  const mobilizeState = freshState();
  getRegionState(mobilizeState, "lake-country").controller = "external-a";
  getRegionState(mobilizeState, "southern-savanna").controller = "frontier";
  getRegionState(mobilizeState, "reed-delta").controller = "external-b";
  const mobilize = evaluateWithoutMutation(mobilizeState, "river-crown", "mobilize");
  assert.equal(mobilize.score, 4);
  assert.equal(mobilize.breakdown[1].amount, 3);

  const administerState = freshState();
  for (const regionId of ["upper-floodplain", "west-levee", "lake-country"]) {
    getRegionState(administerState, regionId).installedPracticeIds = ["administer"];
  }
  getRegionState(administerState, "outer-isles").controller = "player";
  getRegionState(administerState, "outer-isles").installedPracticeIds = ["administer"];
  const administer = evaluateWithoutMutation(administerState, "river-crown", "administer");
  assert.equal(administer.score, 4);
  assert.deepEqual(
    new Set(administer.diagnostics.componentRegionIds),
    new Set(["river-crown", "upper-floodplain", "west-levee", "lake-country"])
  );

  const exchange = evaluateWithoutMutation(freshState(), "river-crown", "exchange");
  assert.equal(exchange.score, 4);
  assert.equal(exchange.uncappedScore, 5);
  assert.equal(exchange.capped, true);
  assert.equal(exchange.diagnostics.connectedRegionIds.length, 4);

  assert.deepEqual(
    evaluateRegionalPracticePlacement(freshState(), { regionId: "river-crown", practiceId: "invalid" }),
    { ok: false, reason: "invalidPracticeId" }
  );
}

function testInstallationRulesAndOrdering() {
  const state = freshState();
  assert.deepEqual(
    validateRegionalPracticeInstallation(state, { regionId: "river-crown", practiceId: "invalid" }),
    { ok: false, reason: "invalidPracticeId" }
  );
  assert.deepEqual(
    validateRegionalPracticeInstallation(state, { regionId: "iron-hills", practiceId: "store" }),
    { ok: false, reason: "notPlayerControlled" }
  );
  const host = getRegionState(state, "west-levee");
  host.installedPracticeIds = ["store", "store"];
  assert.deepEqual(
    validateRegionalPracticeInstallation(state, { regionId: "west-levee", practiceId: "study" }),
    { ok: false, reason: "capacityFull" }
  );

  const installState = freshState();
  assert.equal(cmdInstallRegionalPractice(installState, { regionId: "river-crown", practiceId: "store" }).ok, true);
  assert.equal(cmdInstallRegionalPractice(installState, { regionId: "river-crown", practiceId: "cultivate" }).ok, true);
  assert.equal(cmdInstallRegionalPractice(installState, { regionId: "river-crown", practiceId: "store" }).ok, true);
  assert.deepEqual(
    getRegionState(installState, "river-crown").installedPracticeIds,
    ["store", "cultivate", "store"]
  );
}

function testTimelineReplayAndProjection() {
  const initial = freshState();
  const timeline = createTimelineFromInitialState(initial);
  const action = {
    kind: ActionKinds.REGION_INSTALL_PRACTICE,
    payload: { regionId: "river-crown", practiceId: "store" },
    apCost: 0,
  };
  assert.equal(replaceActionsAtSecond(timeline, 1, [action], { truncateFuture: true }).ok, true);
  timeline.historyEndSec = 1;
  timeline.cursorSec = 1;

  const first = rebuildStateAtSecond(timeline, 1);
  const second = rebuildStateAtSecond(timeline, 1);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(serializeGameState(first.state), serializeGameState(second.state));
  assert.deepEqual(getRegionState(first.state, "river-crown").installedPracticeIds, ["store"]);
  assert.deepEqual(first.state.rng, initial.rng);

  const projection = buildProjectionStateWindowFromTimeline(timeline, 0, { horizonSec: 1 });
  assert.equal(projection.ok, true);
  const projected = deserializeGameState(projection.stateDataBySecond.get(1));
  assert.deepEqual(serializeGameState(projected), serializeGameState(first.state));
}

export function runRegionalPracticeSuite() {
  testEvaluators();
  testInstallationRulesAndOrdering();
  testTimelineReplayAndProjection();
  return true;
}

runRegionalPracticeSuite();
console.log("[regional-practices] OK");
