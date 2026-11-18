import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { advanceReplayStateOneSecond } from "../../../src/model/replay-second-runner.js";
import { deserializeGameState, serializeGameState } from "../../../src/model/state.js";
import { stateFile } from "../../reference/diff.mjs";

const [parity, nativeDir, output] = process.argv.slice(2);
const opening = JSON.parse(readFileSync(join(nativeDir, "reference/fixtures/seed-1/state-0.json"), "utf8"));
const masks = JSON.parse(readFileSync(join(nativeDir, "reference/parity-masks.json"), "utf8"));
const write = (path, value) => writeFileSync(path, JSON.stringify(value));

function window(name, state, count, expose, check) {
  const directory = join(output, name);
  mkdirSync(directory, { recursive: true });
  const first = join(directory, stateFile(state.tSec));
  write(first, serializeGameState(state));
  for (let i = 0; i < count; ++i) {
    assert.equal(advanceReplayStateOneSecond(state).ok, true);
    check(state);
    write(join(directory, stateFile(state.tSec)), serializeGameState(state));
  }
  const maskPath = join(directory, "masks.json");
  write(maskPath, { ...masks, masks: masks.masks.filter(({ path }) => !expose.some(field => path.endsWith(field))) });
  const result = spawnSync(parity, [
    "step", "--from", first, "--seconds", String(count), "--expect-dir", directory, "--masks", maskPath,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, name);
}

const anchor = deserializeGameState(opening);
Object.assign(anchor.gameConfig.settings.values, {
  phaseDurationSec: 40, greenAutomaticTier: true, greenCadenceYears: 2, unrestChaosPerYear: 1.3,
});
while (anchor.tSec < 30) assert.equal(advanceReplayStateOneSecond(anchor).ok, true);

const towns = anchor.world.sites.filter(site => site.town && !site.neutral).slice(0, 2);
assert.equal(towns.length, 2);
for (const [index, site] of towns.entries()) {
  const region = anchor.world.regions.find(region => region.id === site.regionId);
  const previousController = region.controller;
  region.controller = "frontier";
  site.detailedState.control = { unrest: { startedSec: 30, untilSec: 32 + 2 * index, previousController }, claimant: null, claimChecks: 0 };
}
delete anchor.civilization.chaos.pendingUnrestIncome;
const empty = anchor.world.sites.find(site => {
  const stranger = site.detailedState.populationByClass.stranger;
  return !stranger.children && !stranger.adults && !stranger.eldersByAge.length;
});
const stranger = empty.detailedState.populationByClass.stranger;
stranger.specialists.scholar.adults = 1;
stranger.faith = { tier: "bronze", trend: "down", streak: 3, collapseActive: true };
stranger.happiness = { status: "negative", fullFeedStreak: 0, missedFeedStreak: 2, partialFeedRatios: [0.5] };

let income = 0;
window("active-and-expired-unrest", anchor, 6, [
  ".pendingUnrestIncome", ".populationByClass.*.faith", ".populationByClass.*.happiness",
  ".populationByClass.*.specialists", ".detailedState.history",
], state => {
  const { tSec, civilization } = state;
  for (const until of [32, 34]) if (tSec <= until) income += 1.3 / 32;
  assert.equal(civilization.chaos.pendingUnrestIncome, income);
  assert.equal(civilization.green.tier, tSec < 33 ? 0 : 1);
  assert.deepEqual(stranger.faith, { tier: "gold", trend: null, streak: 0 });
  assert.equal(stranger.happiness.status, "neutral");
  assert.equal(stranger.specialists.scholar.adults, 0);
  if (tSec >= 32) assert.ok(towns[0].neutral, "browser should restore the market");
  if (tSec >= 34) assert.ok(towns[1].neutral, "browser should restore the second market");
});

const forced = deserializeGameState(opening);
Object.assign(forced.gameConfig.settings.values, {
  phaseDurationSec: 3, greenAutomaticTier: false, greenForcedTier: 3,
});
window("rollover-and-forced-green", forced, 20, [], state => {
  assert.equal(state.civilization.green.tier, 3);
  const turn = state.civilization.currentMoonTurn;
  const index = Math.floor((state.tSec - 1) / 3);
  assert.equal(turn.phaseIndex, index % 6);
  if (state.tSec >= 19) {
    assert.equal(turn.startedSec, 19);
    assert.equal(state.civilization.lastMoonTurn.phaseId, "death");
    assert.equal(state.world.sites[0].detailedState.lastMoonResult.regionId, state.world.sites[0].regionId);
  }
});
