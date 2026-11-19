import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stepSpatialPressure } from "../../../src/model/detailed-settlements/external-world.js";
import { resolveControl } from "../../../src/model/detailed-settlements/territory.js";
import { deserializeGameState, serializeGameState } from "../../../src/model/state.js";

const [parity, nativeDir, output] = process.argv.slice(2);
const opening = JSON.parse(readFileSync(join(nativeDir, "reference/fixtures/seed-1/state-0.json"), "utf8"));
mkdirSync(output, { recursive: true });

function checkTerminal(reason, arrange) {
  const state = deserializeGameState(opening);
  state.tSec = 6;
  arrange(state);
  const before = join(output, reason + "-before.json");
  const after = join(output, reason + "-after.json");
  const save = path => writeFileSync(path, JSON.stringify({
    formatVersion: 1,
    state: serializeGameState(state),
    sidecar: { _seasonChanged: false, _boardDirty: null, chaosBefore: null },
  }));
  save(before);
  resolveControl(state);
  stepSpatialPressure(state);
  assert.equal(state.runStatus.reason, reason);
  assert.equal(state.paused, true);
  save(after);
  const run = spawnSync(parity, ["stage", "--stage", "control_and_spatial_pressure",
    "--before", before, "--after", after], { encoding: "utf8" });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, reason + "\n" + run.stdout + run.stderr);
}

checkTerminal("territorialLoss", state => {
  for (const region of state.world.regions) if (region.controller === "player") region.controller = "frontier";
});

checkTerminal("monsterOverrun", state => {
  const lastHolding = state.world.regions.find(region => region.controller === "player");
  for (const region of state.world.regions) {
    delete region.monster;
    if (region !== lastHolding && region.controller === "player") region.controller = "frontier";
  }
  lastHolding.monster = { defense: 100 };
  state.civilization.chaos.monsterPressure = state.gameConfig.settings.values.monsterExpansionThreshold;
});
