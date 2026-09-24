// Compare production projection output with an unchanged checkout of the same
// gameplay revision: node scripts/timegraph-differential-probe.mjs <checkout>
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createInitialState } from "../src/model/init.js";
import { serializeGameState } from "../src/model/state.js";
import { buildProjectionChunkFromStateData } from "../src/model/projection-chunk.js";

if (!process.argv[2]) throw new Error("Supply an unchanged checkout with the same gameplay/save schema");
const root = pathToFileURL(resolve(process.argv[2]) + "/");
const baseline = await import(new URL("src/model/projection-chunk.js", root));
const state = createInitialState("devPlaytesting01", 99117);
state.paused = false;
state.gameConfig.settings.values.monsterLossThreshold = 10_000_000;
state.civilization.chaos.monsterLossThreshold = 10_000_000;
const base = serializeGameState(state);
const report = { seconds: 6400, baselineMs: [], optimizedMs: [], matches: true };
for (let i = 0; i < 3; i++) {
  let expected;
  let actual;
  const runBaseline = () => {
    const start = performance.now();
    expected = baseline.buildProjectionChunkFromStateData(base, 0, report.seconds);
    report.baselineMs.push(performance.now() - start);
  };
  const runOptimized = () => {
    const start = performance.now();
    actual = buildProjectionChunkFromStateData(base, 0, report.seconds);
    report.optimizedMs.push(performance.now() - start);
  };
  if (i % 2) { runOptimized(); runBaseline(); }
  else { runBaseline(); runOptimized(); }
  if (!isDeepStrictEqual(expected, actual)) {
    report.matches = false;
    break;
  }
}
mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/timegraph-node-differential.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!report.matches) process.exitCode = 1;
