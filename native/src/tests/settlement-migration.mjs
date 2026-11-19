import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMoonPhaseAtSecond } from "../../../src/model/moon-phases.js";
import { deserializeGameState, serializeGameState } from "../../../src/model/state.js";
import { getDetailedSettlement, getHousingCapacity, refreshGreenAscendancy } from "../../../src/model/detailed-settlements/queries.js";
import { populationBins, writePopulationBins } from "../../../src/model/detailed-settlements/population-ledger.js";
import { addMoonMigrationIntent, runMigrationPhase } from "../../../src/model/detailed-settlements/phases/migration.js";
import { createMoonTurn } from "../../../src/model/detailed-settlements/phases/moon-turn.js";
import { resetEmptyStrangerCohort } from "../../../src/model/detailed-settlements/phases/shared.js";
import { stepUnrest } from "../../../src/model/detailed-settlements/territory.js";

const [parity, nativeDir, output] = process.argv.slice(2);
const opening = JSON.parse(readFileSync(join(nativeDir, "reference/fixtures/seed-1/state-0.json"), "utf8"));
mkdirSync(output, { recursive: true });

function checkStage(label, stage, state, run) {
  const before = join(output, label + "-before.json");
  const after = join(output, label + "-after.json");
  const capture = file => writeFileSync(file, JSON.stringify({
    formatVersion: 1,
    state: serializeGameState(state),
    sidecar: { seasonChanged: false, _boardDirty: null, chaosBefore: null },
  }));
  capture(before);
  run();
  capture(after);
  const result = spawnSync(parity, ["stage", "--stage", stage, "--before", before, "--after", after],
    { encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, label + "\n" + result.stdout + result.stderr);
}

function prepare() {
  const state = deserializeGameState(opening);
  state.tSec = 4;
  state.civilization.currentMoonTurn = createMoonTurn(state, getMoonPhaseAtSecond(state));
  return state;
}

function setResidents(state, region, count) {
  const site = getDetailedSettlement(state, region);
  writePopulationBins(site, [{
    classId: "villager", allegiance: "neutral", specialty: "ordinary", kind: "adults", age: null, count,
  }]);
}

function reserve(state, region, requested) {
  const { villager } = getDetailedSettlement(state, region).populationByClass;
  addMoonMigrationIntent(state, state.civilization.currentMoonTurn, {
    reason: "overHousing",
    sourceId: region,
    sourceClassId: "villager",
    composition: { villager: { ...villager, adults: requested, joint: [{ ...villager.joint[0], count: requested }] } },
  });
}

const contested = prepare();
setResidents(contested, "R03", getHousingCapacity(contested, "R03") - 3);
for (const region of ["R11", "R10"]) {
  setResidents(contested, region, getHousingCapacity(contested, region) + 5);
  reserve(contested, region, 3);
}
contested.tSec = 5;
checkStage("contested", "migration", contested, () => {
  runMigrationPhase(contested, getMoonPhaseAtSecond(contested));
  assert.deepEqual(contested.civilization.currentMoonTurn.movements.map(move => [move.sourceRegionId, move.amount]),
    [["R11", 1], ["R10", 2]]);
});

// Expiry refunds pending bookings before reopening the storefront.
const { currentMoonTurn: turn } = contested.civilization;
const closing = contested.world.sites.find(site => site.regionId === "R03");
contested.world.regions.find(region => region.id === "R03").controller = "frontier";
closing.detailedState.control = {
  unrest: { startedSec: 0, untilSec: 6, previousController: "external-a" }, claimant: null, claimChecks: 0,
};
contested.tSec = 6;
checkStage("refund", "prelude", contested, () => {
  stepUnrest(contested);
  refreshGreenAscendancy(contested);
  for (const site of contested.world.sites) resetEmptyStrangerCohort(site.detailedState);
  assert.equal(turn.movements.length, 0);
  assert.equal(closing.detailedState.control.unrest, null);
  assert.ok(closing.neutral);
  assert.equal(contested.civilization.practiceEvents.pending.at(-1).kind, "unrestEnded");
  assert.deepEqual(turn.migrationIntentSummaries.map(item => [item.admitted, item.unresolved]), [[0, 3], [0, 3]]);
  for (const region of ["R10", "R11"]) {
    const source = getDetailedSettlement(contested, region);
    assert.equal(populationBins(source)[0].count, getHousingCapacity(contested, region) + 5);
  }
});

const legacy = prepare();
delete legacy.rulesetId;
setResidents(legacy, "R16", getHousingCapacity(legacy, "R16"));
for (const cohort of Object.values(getDetailedSettlement(legacy, "R09").populationByClass)) delete cohort.joint;
addMoonMigrationIntent(legacy, legacy.civilization.currentMoonTurn, {
  reason: "overHousing", sourceId: "R09", sourceClassId: "villager", composition: { villager: { adults: 3 } },
});
legacy.tSec = 5;
checkStage("external", "migration", legacy, () => {
  runMigrationPhase(legacy, getMoonPhaseAtSecond(legacy));
  const [movement] = legacy.civilization.currentMoonTurn.movements;
  assert.equal(movement.destinationRegionId, "R02");
  assert.equal(movement.external, true);
  assert.equal(legacy.civilization.chaos.pendingLosses.externalEmigrants, 3);
});
