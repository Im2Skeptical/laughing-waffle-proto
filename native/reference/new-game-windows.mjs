import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stateFile } from "./diff.mjs";
import { defaultDirectory, openings, windowId } from "./export-new-game.mjs";

function main(args) {
  if (args.length < 1 || args.length > 2)
    throw new Error("Usage: node native/reference/new-game-windows.mjs <waffle_parity> [<capture-directory>]");
  const binary = resolve(args[0]);
  const dir = resolve(args[1] ?? defaultDirectory);
  const masks = join(dir, "new-game-masks.json");
  // These action-free openings never enter the deferred Vassal resolutions.
  // Keep every serialized field visible in their comparison.
  mkdirSync(dir, { recursive: true });
  writeFileSync(masks, JSON.stringify({ formatVersion: 1, masks: [] }) + "\n");
  let starts = 0, windows = 0, comparisons = 0;
  const failures = [];
  function run(log, ...options) {
    const result = spawnSync(binary, options, { encoding: "utf8" });
    writeFileSync(log, result.stdout + result.stderr);
    if (result.error) throw result.error;
    if (result.status === 0) return true;
    const first = result.stdout.match(/First divergent path: .*$/mu)?.[0];
    failures.push(log + (first ? " (" + first + ")" : ""));
    return false;
  }
  for (const scenario of openings) {
    const { seed } = scenario.start;
    const nativeDir = join(dir, "native", String(seed));
    mkdirSync(nativeDir, { recursive: true });
    const nativeStart = join(nativeDir, stateFile(0));
    const browserDir = join(dir, "browser", String(seed));
    if (!run(join(nativeDir, "build.log"), "new-game", "--seed", String(seed), "--out", nativeStart)) continue;
    if (run(join(nativeDir, "second-zero.log"), "diff", join(browserDir, stateFile(0)), nativeStart)) starts++;
    for (const window of scenario.windows) {
      const { startSec, count, paused } = window;
      const id = windowId(window);
      const ok = run(join(nativeDir, id + ".log"), "step", "--from", nativeStart, "--warmup", String(startSec),
        "--seconds", String(count - 1), "--expect-dir", join(browserDir, id), "--masks", masks,
        "--report", join(nativeDir, id + ".report.json"), ...(paused ? ["--pause"] : []));
      if (ok) {
        windows++;
        comparisons += count - 1;
      }
    }
  }
  console.log(starts + " exact second-zero states, " + windows + " native-start windows, " + comparisons + " window comparisons.");
  if (failures.length) throw new Error("Parity failures:\n" + failures.join("\n"));
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
