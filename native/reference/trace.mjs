import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLabFixture } from "../../src/model/dev-lab/fixtures.js";
import { GAME_CONFIG_SCHEMA_VERSION } from "../../src/model/game-config.js";
import { secondsPerYear } from "../../src/model/detailed-settlements/unrest.js";
import { createNewGameState } from "../../src/model/new-game.js";
import { buildProjectionChunkFromStateData } from "../../src/model/projection-chunk.js";
import {
  advanceReplayStateOneSecond,
  applyReplayActionsAtSecond,
  TICKS_PER_REPLAY_SECOND,
} from "../../src/model/replay-second-runner.js";
import { setPaused } from "../../src/model/game-model.js";
import { deserializeGameState, serializeGameState } from "../../src/model/state.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../../src/model/timeline/index.js";
import { configIdentity, readRunnerSaveSchema, REPO_ROOT, sha256Value } from "./corpus-lib.mjs";
import { diffStates, formatStateDiff, HASHES_FILE, HASHES_HEADER, stateFile } from "./diff.mjs";
import { createFoodContention } from "./food-contention.mjs";
import { prepareTerritoryExhibit } from "./territory-exhibit.mjs";
import { prepareHousingExhibit } from "./housing-exhibit.mjs";
import { prepareVassalExhibit, vassalResolutionKinds } from "./vassal-exhibit.mjs";
import { prepareActionExhibit } from "./action-exhibit.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const scenariosDir = join(here, "scenarios");
const fixturesDir = join(here, "fixtures");
const artifactDir = join(REPO_ROOT, "artifacts", "native-reference");
const tracesDir = join(artifactDir, "traces");
const windowsDir = join(artifactDir, "windows");
const minLastContinuationSec = 60;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function integerInRange(value, min, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function loadScenario(id) {
  requireThat(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id), "Invalid scenario id " + id);
  const scenario = readJson(join(scenariosDir, id + ".json"));
  const { start, actions, horizonSec, keepSeconds, windows = [] } = scenario;
  requireThat(scenario.id === id, id + ": scenario id must match its file name");
  requireThat(start && integerInRange(start.seed, 1, 0xffffffff), id + ": expected a nonzero uint32 seed");
  requireThat(start.kind === "newGame" || start.kind === "chargeExhibit" || start.kind === "foodContention" ||
    start.kind === "territoryExhibit" || start.kind === "housingExhibit" || start.kind === "actionExhibit" ||
    (start.kind === "vassalExhibit" && vassalResolutionKinds.includes(start.variant)) ||
    (start.kind === "performanceAnchor" && integerInRange(start.anchorSec, 1)),
  id + ": expected a supported start kind and its required parameters");
  const startSec = start.kind === "performanceAnchor" ? start.anchorSec : 0;
  const endSec = startSec + horizonSec;
  requireThat(integerInRange(horizonSec, 1) && Number.isSafeInteger(endSec + minLastContinuationSec),
    id + ": expected a positive integer horizonSec within safe integer range");
  requireThat(Array.isArray(keepSeconds) && keepSeconds.length > 0 &&
    keepSeconds.every((sec, index) => integerInRange(sec, startSec, endSec) &&
      (index === 0 || sec > keepSeconds[index - 1])),
  id + ": keepSeconds must be nonempty, strictly ascending, and inside the trace");
  requireThat(Array.isArray(actions) &&
    actions.every((action, index) => action && integerInRange(action.tSec, startSec, endSec) &&
      (index === 0 || action.tSec >= actions[index - 1].tSec) &&
      typeof action.kind === "string" && action.kind.length > 0 &&
      action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)),
  id + ": actions need a kind, payload, and ascending tSec inside the trace");
  const windowIds = new Set();
  requireThat(Array.isArray(windows), id + ": windows must be an array");
  for (const window of windows) {
    requireThat(window && integerInRange(window.startSec, startSec, endSec) &&
      integerInRange(window.count, 2, endSec - window.startSec + 1) &&
      (!Object.hasOwn(window, "paused") || window.paused === true),
    id + ": windows need startSec and count inside the trace, with optional paused: true");
    const windowId = String(window.startSec) + (window.paused ? "-paused" : "");
    requireThat(!windowIds.has(windowId), id + ": duplicate window " + windowId);
    windowIds.add(windowId);
  }
  return { scenario, startSec, endSec };
}

export function createStart({ start }, startSec) {
  if (start.kind === "chargeExhibit") return createLabFixture("charge", start.seed);
  const state = createNewGameState(start.seed);
  if (start.kind === "foodContention") return createFoodContention(state);
  if (start.kind === "housingExhibit") return prepareHousingExhibit(state);
  if (start.kind === "vassalExhibit") return prepareVassalExhibit(state, start.variant);
  if (start.kind === "actionExhibit") return prepareActionExhibit(state, start.variant);
  if (start.kind === "newGame") return state;
  if (start.kind === "territoryExhibit") return prepareTerritoryExhibit(state);

  // The prepared performance fixture bakes anchors from this model path.
  // Capture the requested anchor directly, without the UI's baked gzip.
  const forecast = buildProjectionChunkFromStateData(serializeGameState(state), 0, startSec, {
    stateAnchorStrideSec: startSec,
  });
  requireThat(forecast.ok && forecast.endSec === startSec && !forecast.terminal,
    "Performance anchor unavailable at second " + startSec + ": " +
    (forecast.reason ?? "run reached its terminal state at " + forecast.endSec));
  return deserializeGameState(forecast.lastStateData);
}

export function applyActions(state, actions, sec, label) {
  if (!actions) return;
  const result = applyReplayActionsAtSecond(state, actions, sec);
  requireThat(result.ok, label + " action failed at second " + sec + ": " +
    result.action?.kind + " (" + result.reason + ")");
}

export function advance(state, sec, label) {
  const result = advanceReplayStateOneSecond(state);
  requireThat(result.ok && result.currentSec === sec,
    label + " could not advance to second " + sec + ": " + (result.reason ?? result.currentSec));
}

export function assertHash(id, check, sec, expected, actual, expectedHash) {
  const actualHash = sha256Value(actual);
  if (expectedHash === actualHash) return;

  const diagnostic = join(artifactDir, "diagnostics", id);
  mkdirSync(diagnostic, { recursive: true });
  writeFileSync(join(diagnostic, "expected-" + stateFile(sec)), JSON.stringify(expected));
  writeFileSync(join(diagnostic, "actual-" + stateFile(sec)), JSON.stringify(actual));
  throw new Error(id + ": " + check + " diverged at second " + sec +
    "\nExpected " + expectedHash + "\nActual   " + actualHash +
    "\n" + formatStateDiff(diffStates(expected, actual)) + "\nStates: " + diagnostic);
}

function capturePausedWindow(snapshot, { startSec, count }) {
  const state = deserializeGameState(snapshot);
  requireThat(setPaused(state, true).ok, "Could not pause window at " + startSec);
  const anchor = serializeGameState(state);
  const hash = sha256Value(anchor);
  const files = new Map([[stateFile(startSec), JSON.stringify(anchor)]]);
  for (let offset = 1; offset < count; offset += 1) {
    const result = advanceReplayStateOneSecond(state);
    requireThat(!result.ok && result.currentSec === startSec, "Paused window advanced at " + startSec);
    const after = serializeGameState(state);
    requireThat(sha256Value(after) === hash, "Paused window mutated at " + startSec);
    files.set(stateFile(startSec + offset), JSON.stringify(after));
  }
  return files;
}

export function groupReplayActions(live, { id, actions }) {
  const timeline = createTimelineFromInitialState(live);
  const actionsBySecond = new Map();
  for (const action of actions) {
    const recorded = appendActionAtCursor(timeline, action, { tSec: action.tSec });
    requireThat(recorded.ok, id + ": could not record " + action.kind + ": " + recorded.reason);
  }
  for (const action of timeline.actions) {
    if (!actionsBySecond.has(action.tSec)) actionsBySecond.set(action.tSec, []);
    actionsBySecond.get(action.tSec).push(action);
  }
  return { timeline, actionsBySecond };
}

function capture({ scenario, startSec, endSec }, baseline) {
  const { id, keepSeconds } = scenario;
  const live = createStart(scenario, startSec);
  const config = configIdentity(serializeGameState(live));
  requireThat(config.gameStateSchemaVersion === baseline.gameStateSchemaVersion,
    id + ": GameState version differs from BASELINE");
  const { timeline, actionsBySecond } = groupReplayActions(live, scenario);

  const continuationWindows = keepSeconds.map((fromSec, index) => ({
    fromSec,
    throughSec: keepSeconds[index + 1] ?? fromSec + minLastContinuationSec,
  }));
  const validationEnd = Math.max(endSec, continuationWindows.at(-1).throughSec);
  const rows = [HASHES_HEADER];
  const files = new Map();
  const replayRows = [HASHES_HEADER];
  if (scenario.actions.length) {
    files.set("initial.json", JSON.stringify(serializeGameState(live)));
    files.set("actions.json", JSON.stringify(timeline.actions, null, 2) + "\n");
  }
  const rejectionsPath = join(fixturesDir, id, "rejections.json");
  if (existsSync(rejectionsPath)) {
    const raw = readFileSync(rejectionsPath, "utf8");
    const before = serializeGameState(live);
    const hash = sha256Value(before);
    for (const { action, reason } of JSON.parse(raw)) {
      requireThat(action.tSec === startSec, id + ": rejection fixture must use the initial second");
      const copy = deserializeGameState(before);
      const rejected = applyReplayActionsAtSecond(copy, [action], startSec);
      requireThat(!rejected.ok && rejected.reason === reason,
        id + ": expected " + action.kind + " to reject with " + reason + ", got " + rejected.reason);
      assertHash(id, "rejected " + action.kind, startSec, before, serializeGameState(copy), hash);
    }
    files.set("rejections.json", raw);
  }
  const windows = (scenario.windows ?? []).map(window => ({
    ...window,
    id: String(window.startSec) + (window.paused ? "-paused" : ""),
    files: new Map(),
  }));
  let checkpointIndex = 0;
  let continuation;
  for (let sec = startSec; sec <= validationEnd; sec += 1) {
    if (sec > startSec) advance(live, sec, id + " uninterrupted run");
    const boundaryActions = actionsBySecond.get(sec);
    applyActions(live, boundaryActions, sec, id + " uninterrupted run");
    const snapshot = serializeGameState(live);
    const hash = sha256Value(snapshot);
    if (sec <= endSec) rows.push(sec + "\t" + hash);
    for (const window of windows) {
      if (window.paused) {
        if (sec === window.startSec) window.files = capturePausedWindow(snapshot, window);
      } else if (sec >= window.startSec && sec < window.startSec + window.count) {
        window.files.set(stateFile(sec), JSON.stringify(snapshot));
      }
    }

    if (continuation) {
      const { state, fromSec, throughSec } = continuation;
      const check = "JSON continuation from second " + fromSec;
      try {
        advance(state, sec, check);
        applyActions(state, boundaryActions, sec, check);
      } catch (error) {
        assertHash(id, error.message, sec, snapshot, serializeGameState(state), hash);
        throw new Error(id + ": " + error.message, { cause: error });
      }
      assertHash(id, check, sec, snapshot, serializeGameState(state), hash);
      if (sec === throughSec) continuation = undefined;
    }

    if (sec === keepSeconds[checkpointIndex]) {
      replayRows.push(sec + "\t" + hash);
      const text = JSON.stringify(snapshot);
      files.set(stateFile(sec), text);
      let restored;
      try {
        restored = deserializeGameState(JSON.parse(text));
      } catch (error) {
        throw new Error(id + ": JSON restore failed at second " + sec + ": " + error.message, { cause: error });
      }
      assertHash(id, "JSON round-trip", sec, snapshot, serializeGameState(restored), hash);
      continuation = { state: restored, ...continuationWindows[checkpointIndex] };
      checkpointIndex += 1;
    }
  }

  for (const sec of keepSeconds) {
    const rebuilt = rebuildStateAtSecond(timeline, sec);
    requireThat(rebuilt.ok, id + ": rebuild failed at second " + sec + ": " + rebuilt.reason);
    const expected = JSON.parse(files.get(stateFile(sec)));
    assertHash(id, "rebuildStateAtSecond", sec, expected, serializeGameState(rebuilt.state), sha256Value(expected));
  }

  files.set(HASHES_FILE, rows.join("\n") + "\n");
  if (scenario.actions.length) files.set("replay-checkpoints.tsv", replayRows.join("\n") + "\n");
  files.set("manifest.json", JSON.stringify({
    formatVersion: 1,
    baseline,
    config,
    scenario,
    timing: { startSec, endSec, ticksPerSecond: TICKS_PER_REPLAY_SECOND, secondsPerYear: secondsPerYear(live) },
    validation: { continuationWindows, rebuildSeconds: keepSeconds },
  }, null, 2) + "\n");
  return { files, windows };
}

function assertMatchingFile(directory, file, text) {
  const path = join(directory, file);
  requireThat(readFileSync(path).equals(Buffer.from(text)), path + ": differs from regenerated data");
}

function checkOutputs(directory, fixtureDir, files) {
  for (const [file, text] of files) assertMatchingFile(directory, file, text);
  for (const file of readdirSync(directory)) {
    requireThat(files.has(file), join(directory, file) + ": unexpected trace output");
  }
  if (!existsSync(fixtureDir)) return;
  for (const file of readdirSync(fixtureDir)) {
    requireThat(files.has(file), join(fixtureDir, file) + ": unknown fixture output");
    assertMatchingFile(fixtureDir, file, files.get(file));
  }
}

function writeOutputs(directory, files) {
  mkdirSync(directory, { recursive: true });
  for (const [file, text] of files) writeFileSync(join(directory, file), text);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^state-\d+\.json$/u.test(entry.name) && !files.has(entry.name)) {
      unlinkSync(join(directory, entry.name));
    }
  }
}

function main(args) {
  const baseline = readJson(join(here, "BASELINE"));
  requireThat(baseline.gameConfigSchemaVersion === GAME_CONFIG_SCHEMA_VERSION &&
    baseline.runnerSaveSchemaVersion === readRunnerSaveSchema(), "Source schema versions differ from BASELINE");
  const check = args[0] === "--check";
  const requestedIds = check ? args.slice(1) : args;
  const ids = requestedIds.length ? requestedIds : readdirSync(scenariosDir)
    .filter((file) => file.endsWith(".json")).sort().map((file) => basename(file, ".json"));
  const scenarios = ids.map(loadScenario);

  for (const recipe of scenarios) {
    const { scenario: { id, keepSeconds }, startSec, endSec } = recipe;
    const started = performance.now();
    const { files, windows } = capture(recipe, baseline);
    const directory = join(tracesDir, id);
    if (check) {
      checkOutputs(directory, join(fixturesDir, id), files);
    } else {
      writeOutputs(directory, files);
    }
    let windowStates = 0;
    for (const window of windows) {
      const path = join(windowsDir, id, window.id);
      if (check) {
        checkOutputs(path, join(fixturesDir, "windows", id, window.id), window.files);
      } else {
        writeOutputs(path, window.files);
      }
      windowStates += window.files.size;
    }
    const bytes = [...files.values()].reduce((total, text) => total + Buffer.byteLength(text), 0);
    console.log(id + " " + (check ? "checked" : "captured") +
      ": seconds " + startSec + "-" + endSec + ", " + keepSeconds.length + " states, " +
      bytes + " trace bytes, " + windowStates + " states in " + windows.length +
      " step windows in " + ((performance.now() - started) / 1000).toFixed(2) +
      " s; JSON continuation and rebuild matched.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
