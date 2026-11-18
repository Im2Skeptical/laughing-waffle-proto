import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tracePracticeEvent } from "../../../src/model/detailed-settlements/practice-events.js";

const [testExe, opening, expected] = process.argv.slice(2);
const state = JSON.parse(readFileSync(opening, "utf8"));
for (let i = 0; i < 250; i++) {
  tracePracticeEvent(state, {
    kind: "retention-test",
    regionId: state.world.sites[i % 2].regionId,
    rootId: i,
    parentId: null,
    reason: `sample-${i}`,
  });
}
writeFileSync(expected, JSON.stringify(state));
const result = spawnSync(testExe, ["history-retention", opening, expected], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
