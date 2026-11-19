import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionKinds, applyAction } from "../../actions.js";
import { selectFixtureVassal } from "../../dev-lab/fixtures.js";
import { getMoonPhaseAtSecond } from "../../moon-phases.js";
import { createNewGameState } from "../../new-game.js";
import { advanceReplayStateToSecond } from "../../replay-second-runner.js";
import { serializeGameState } from "../../state.js";
import { appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond } from "../../timeline/index.js";
import { createMoonRegionResult } from "../../detailed-settlements/helpers.js";

function createCampaignFixture() {
  const state = createNewGameState(1);
  const vassal = selectFixtureVassal(state, "warrior");
  const region = state.world.regions.find((entry) => entry.monster);
  const site = state.world.sites.find((entry) => entry.regionId === region.id);
  assert.equal(site.simulationMode, "ruin");
  // Start after clearing the Monster buildup, with a Campaign next on the map.
  region.monster.cleared = true;
  const node = vassal.lifeMap.graph.nodes.find((entry) => entry.family === "campaign");
  const nodeId = node.id;
  vassal.lifeMap.availableNodeIds = [nodeId];
  return {
    state, site, region, vassal, nodeId,
    actions: [
      { kind: ActionKinds.VASSAL_ENTER_LIFE_NODE, payload: { nodeId } },
      { kind: ActionKinds.VASSAL_SELECT_LIFE_OPTION, payload: { nodeId, optionId: `attack:${region.id}` } },
      { kind: ActionKinds.VASSAL_CONFIRM_LIFE_NODE, payload: { nodeId } },
    ],
  };
}

function advance(state, tSec) {
  assert.equal(advanceReplayStateToSecond(state, tSec).ok, true);
}

function commitCampaign({ state, site, region, vassal, nodeId, actions }, timeline = null) {
  assert.equal(state.civilization.currentMoonTurn.regions[site.regionId], undefined);
  state.paused = true;
  for (const action of actions) {
    const result = applyAction(state, action);
    assert.equal(result.ok, true, `${action.kind}: ${result.reason ?? ""}`);
    if (timeline) assert.equal(appendActionAtCursor(timeline, action, state).ok, true);
  }
  state.paused = false;
  const encounter = vassal.lifeMap.nodeStates[nodeId].campaign.lastResult;
  assert.equal(encounter.stage, "nest");
  assert.equal(encounter.success, true);
  assert.equal(site.simulationMode, "detailed");
  assert.equal(region.controller, "player");
}

for (const commitSec of [2, 1]) {
  test(`Campaign restoration at second ${commitSec} joins the current Moon report`, () => {
    const fixture = createCampaignFixture();
    const { state, site } = fixture;
    advance(state, commitSec);
    const turn = state.civilization.currentMoonTurn;
    commitCampaign(fixture);
    const rowAtCommit = structuredClone(turn.regions[site.regionId]);

    for (let tSec = commitSec + 1; tSec <= 6; tSec += 1) {
      const phase = getMoonPhaseAtSecond(state, tSec);
      advance(state, tSec);
      assert.equal(state.civilization.currentMoonTurn, turn);
      assert.equal(turn.regions[site.regionId][phase.id].tSec, tSec);
    }
    assert.deepEqual(rowAtCommit, createMoonRegionResult(site.regionId));
    assert.equal(turn.regions[site.regionId].birth, null);
    if (commitSec === 2) assert.equal(turn.regions[site.regionId].food, null);

    advance(state, 7);
    assert.deepEqual(site.detailedState.lastMoonResult, turn.regions[site.regionId]);
    assert.equal(state.civilization.currentMoonTurn.regions[site.regionId].birth.tSec, 7);
  });
}

test("authoritative replay crosses the Campaign restoration and Housing boundary", () => {
  const fixture = createCampaignFixture();
  const { state } = fixture;
  const timeline = createTimelineFromInitialState(state);
  advance(state, 2);
  commitCampaign(fixture, timeline);
  const rebuilt = rebuildStateAtSecond(timeline, 6);
  assert.equal(rebuilt.ok, true);
  advance(state, 6);
  assert.deepEqual(serializeGameState(rebuilt.state), serializeGameState(state));
});
