import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createNewGameState } from "../../src/model/new-game.js";
import { serializeGameState } from "../../src/model/state.js";
import { setPaused } from "../../src/model/game-model.js";
import { REPO_ROOT } from "./corpus-lib.mjs";
import { stateFile } from "./diff.mjs";
import { advance, loadScenario } from "./trace.mjs";

export const openings = ["seed-1", "seed-42", "seed-123-migration", "seed-1867", "seed-2026-late"]
  .map(id => loadScenario(id).scenario);
export const defaultDirectory = join(REPO_ROOT, "artifacts", "n03f-3");
export const windowId = ({ startSec, paused }) => String(startSec) + (paused ? "-paused" : "");

function capture(scenario, outDir, includeWindows) {
  const { seed } = scenario.start;
  const dir = join(outDir, "browser", String(seed));
  const state = createNewGameState(seed);
  const write = (path, snapshot) => writeFileSync(path, JSON.stringify(snapshot) + "\n");
  mkdirSync(dir, { recursive: true });
  write(join(dir, stateFile(0)), serializeGameState(state));

  if (!includeWindows) return;
  // Performance-anchor recipes start late, but this oracle always advances
  // from its own ordinary second zero, with no journal actions.
  assert.equal(scenario.actions.length, 0, scenario.id + ": ordinary windows must be action-free");
  const windows = scenario.windows.map(window => {
    const directory = join(dir, windowId(window));
    mkdirSync(directory, { recursive: true });
    return { ...window, directory };
  });
  const last = Math.max(0, ...windows.map(({ startSec, count, paused }) => startSec + (paused ? 0 : count - 1)));
  for (let second = 0; second <= last; second++) {
    const matching = windows.filter(({ startSec, count, paused }) =>
      second >= startSec && second < startSec + (paused ? 1 : count));
    for (const { startSec, count, paused, directory } of matching) {
      if (paused) {
        assert.ok(setPaused(state, true).ok);
        const snapshot = serializeGameState(state);
        for (let offset = 0; offset < count; offset++)
          write(join(directory, stateFile(startSec + offset)), snapshot);
        assert.ok(setPaused(state, false).ok);
      } else write(join(directory, stateFile(second)), serializeGameState(state));
    }
    if (second < last) {
      // A terminal state remains the comparison target for gated offsets.
      if (state.runStatus?.complete) continue;
      advance(state, second + 1, scenario.id);
    }
  }
}

function main(args) {
  const usage = "Usage: node native/reference/export-new-game.mjs [--out-dir <directory>] [--windows]";
  let outDir;
  let windows = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--windows" && !windows) windows = true;
    else if (args[i] === "--out-dir" && !outDir && args[i + 1] && !args[i + 1].startsWith("-"))
      outDir = resolve(args[++i]);
    else throw new Error(usage);
  }
  outDir ??= defaultDirectory;
  for (const scenario of openings) capture(scenario, outDir, windows);
  console.log("Exported " + openings.length + " ordinary browser starts" + (windows ? " and their step windows" : "") +
    " to " + outDir);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
