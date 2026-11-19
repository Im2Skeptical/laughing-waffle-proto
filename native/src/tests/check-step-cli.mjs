import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [binary, nativeDir, outputDir] = process.argv.slice(2);
const fixtures = join(nativeDir, "reference", "fixtures");
const input = join(fixtures, "seed-1", "state-0.json");
const expected = join(fixtures, "windows", "seed-1", "0", "state-1.json");
const masks = JSON.parse(readFileSync(join(nativeDir, "reference", "parity-masks.json"), "utf8"));
const spec = readFileSync(join(nativeDir, "spec", "tick-pipeline.md"), "utf8");
const cuts = new Set([...spec.matchAll(/^\| (N03e-\d+) /gmu)].map(match => match[1]));
for (const { owner, path } of masks.masks) assert.ok(cuts.has(owner), path + " has unknown owner " + owner);

mkdirSync(outputDir, { recursive: true });
const maskPath = join(outputDir, "masks.json");
const expectedPath = join(outputDir, "state-1.json");
const reportPath = join(outputDir, "report.json");
const write = (path, value) => writeFileSync(path, JSON.stringify(value));

function step(from, exitCode, extra = []) {
  const result = spawnSync(binary, ["step", "--from", from, "--seconds", "1",
    "--expect-dir", outputDir, "--masks", maskPath, "--report", reportPath, ...extra], { encoding: "utf8" });
  assert.equal(result.status, exitCode, result.error?.message ?? result.stdout + result.stderr);
  return result;
}

const state = JSON.parse(readFileSync(expected, "utf8"));
state.gameConfig.settings.values.phaseDurationSec += 1;
state.world.regions[0].id = "different";
const controls = [
  { path: "$.**.phaseDurationSec", owner: "N03e-1", reason: "recursive wildcard control" },
  { path: "$.world.regions.*.id", owner: "N03e-1", reason: "single wildcard control" },
];
write(expectedPath, state);
write(maskPath, { ...masks, masks: [...masks.masks, ...controls] });
step(input, 0);
assert.equal(JSON.parse(readFileSync(reportPath, "utf8")).compared, 1);

state.actionPoints += 1;
write(expectedPath, state);
const mismatch = step(input, 1);
assert.match(mismatch.stdout, /First divergent path: \$\.actionPoints/u);
assert.equal(JSON.parse(readFileSync(reportPath, "utf8")).firstPath, "$.actionPoints");

controls[0].owner = "N03e-99";
write(maskPath, { ...masks, masks: [...masks.masks, ...controls] });
assert.match(step(input, 2).stderr, /unknown cut N03e-99/u);

const gated = JSON.parse(readFileSync(input, "utf8"));
gated.paused = false;
gated.runStatus = { complete: true, reason: "territorialLoss", year: gated.year, tSec: gated.tSec };
const gatedPath = join(outputDir, "terminal.json");
write(gatedPath, gated);
write(expectedPath, gated);
write(maskPath, masks);
step(gatedPath, 0);
assert.equal(JSON.parse(readFileSync(reportPath, "utf8")).advanced, 0);
const alternateTopology = join(outputDir, "topology");
mkdirSync(alternateTopology, { recursive: true });
const alternateFile = "renamed-seed-1.json";
copyFileSync(join(nativeDir, "reference", "topology", "regional-v2_1.json"), join(alternateTopology, alternateFile));
write(join(alternateTopology, "manifest.json"), {
  formatVersion: 1,
  topologies: [{ definitionId: "regional-v2:1", generatorRevision: 2, file: alternateFile }],
});
step(gatedPath, 0, ["--topology-dir", alternateTopology]);
const unknownPath = join(outputDir, "unknown-definition.json");
const unknown = structuredClone(gated);
unknown.world.definitionId = "regional-v2:999999";
write(unknownPath, unknown);
assert.match(step(unknownPath, 2, ["--topology-dir", alternateTopology]).stderr,
  /world topology for regional-v2:999999: missing manifest entry/u);
write(expectedPath, unknown);
step(unknownPath, 0);
gated.runStatus.reason = "tenuresExhausted";
write(expectedPath, gated);
assert.match(step(gatedPath, 1).stdout, /First divergent path: \$\.runStatus\.reason/u);
