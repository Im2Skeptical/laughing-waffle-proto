import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./corpus-lib.mjs";
import { loadScenario } from "./trace.mjs";

function main([exe, ...ids]) {
  if (!exe) throw new Error("Usage: node native/reference/replay-windows.mjs <waffle_parity> [scenario...]");
  const scenarios = fileURLToPath(new URL("./scenarios", import.meta.url));
  const traces = join(REPO_ROOT, "artifacts", "native-reference", "traces");
  const output = join(REPO_ROOT, "artifacts", "native-reference", "replay");
  mkdirSync(output, { recursive: true });
  const names = ids.length ? ids : readdirSync(scenarios).filter(name => name.endsWith(".json"))
    .map(name => name.slice(0, -5)).sort();
  const kinds = new Set();
  let count = 0;
  let checkpoints = 0;
  for (const id of names) {
    const { scenario } = loadScenario(id);
    if (!scenario.actions.length) continue;
    const directory = join(traces, id);
    const actions = [...new Set(scenario.actions.map(action => action.kind))];
    actions.forEach(kind => kinds.add(kind));
    console.log(id + " applies " + actions.join(", "));
    const result = spawnSync(resolve(exe), [
      "run", "--from", join(directory, "initial.json"), "--seconds", String(scenario.horizonSec),
      "--actions", join(directory, "actions.json"), "--browser-checkpoints", join(directory, "replay-checkpoints.tsv"),
      "--anchors", "--hashes", join(output, id + ".tsv"),
    ], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(id + " replay failed. Generate captures with trace.mjs.");
    count += 1;
    checkpoints += scenario.keepSeconds.length;
  }
  if (!count) throw new Error("No action scenarios to replay.");
  console.log(`${count} journals, ${kinds.size} action kinds, ${checkpoints} browser checkpoints matched in three replay modes.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
