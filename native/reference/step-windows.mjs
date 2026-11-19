import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./corpus-lib.mjs";
import { stateFile } from "./diff.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));

function main(args) {
  if (args.length !== 1) throw new Error("Usage: node native/reference/step-windows.mjs <waffle_parity>");
  const binary = resolve(args[0]);
  const masks = join(here, "parity-masks.json");
  const scenarios = join(here, "scenarios");
  const captures = join(REPO_ROOT, "artifacts", "native-reference", "windows");
  let windows = 0;
  let comparisons = 0;
  let gated = 0;
  for (const name of readdirSync(scenarios).filter(file => file.endsWith(".json")).sort()) {
    const scenario = JSON.parse(readFileSync(join(scenarios, name), "utf8"));
    for (const { startSec, count, paused } of scenario.windows ?? []) {
      const id = String(startSec) + (paused ? "-paused" : "");
      const directory = join(captures, scenario.id, id);
      const from = scenario.start.anchorSec ?? 0;
      const trace = join(REPO_ROOT, "artifacts", "native-reference", "traces", scenario.id);
      const actions = paused ? [] : scenario.actions.filter(action => action.tSec < startSec + count);
      const kinds = [...new Set(actions.map(action => action.kind))];
      console.log(scenario.id + "/" + id + (kinds.length ? " applies " + kinds.join(", ") : ""));
      const result = spawnSync(binary, [
        "step", "--from", actions.length ? join(trace, "initial.json") : join(directory, stateFile(startSec)),
        "--seconds", String(count - 1),
        ...(actions.length ? ["--warmup", String(startSec - from), "--actions", join(trace, "actions.json")] : []),
        "--expect-dir", directory, "--masks", masks,
      ], { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(scenario.id + "/" + id + " failed (" +
        (result.status ?? result.signal) + "). Generate missing captures with trace.mjs.");
      windows += 1;
      comparisons += count - 1;
      if (paused) gated += count - 1;
    }
  }
  if (!windows) throw new Error("No configured step windows");
  console.log(`${windows} windows passed, ${comparisons} comparisons (${comparisons - gated} advancing, ${gated} gated).`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
