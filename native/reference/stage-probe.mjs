import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { updateGame } from "../../src/model/game-model.js";
import { getMoonPhaseAtSecond } from "../../src/model/moon-phases.js";
import { DEFAULT_REPLAY_DT_STEP, TICKS_PER_REPLAY_SECOND } from "../../src/model/replay-second-runner.js";
import { attachRngHelpers } from "../../src/model/rng.js";
import { getCurrentSeasonKey, serializeGameState } from "../../src/model/state.js";
import { stepVassalLifeMapSecond } from "../../src/model/vassal-life-map.js";
import { stepSpatialPressure } from "../../src/model/detailed-settlements/external-world.js";
import { runBirthPhase } from "../../src/model/detailed-settlements/phases/birth.js";
import { runDeathPhase } from "../../src/model/detailed-settlements/phases/death.js";
import { runFaithPhase } from "../../src/model/detailed-settlements/phases/faith.js";
import { runFoodPhase } from "../../src/model/detailed-settlements/phases/food.js";
import { runHousingPhase } from "../../src/model/detailed-settlements/phases/housing.js";
import { runMigrationPhase } from "../../src/model/detailed-settlements/phases/migration.js";
import { resetEmptyStrangerCohort } from "../../src/model/detailed-settlements/phases/shared.js";
import { emitPracticeEvent } from "../../src/model/detailed-settlements/practice-events.js";
import { flushPracticeEvents, runPracticeActivation } from "../../src/model/detailed-settlements/practices.js";
import { getDetailedSettlementSites, refreshGreenAscendancy } from "../../src/model/detailed-settlements/queries.js";
import { payGarrisonUpkeep, resolveControl, stepUnrest } from "../../src/model/detailed-settlements/territory.js";
import { REPO_ROOT, sha256Value } from "./corpus-lib.mjs";
import { diffStates, formatStateDiff, HASHES_FILE, readHashes } from "./diff.mjs";
import { advance, applyActions, assertHash, createStart, groupReplayActions, loadScenario } from "./trace.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const artifactDir = join(REPO_ROOT, "artifacts", "native-reference", "stages");
const fixturesDir = join(here, "fixtures", "stages");
const clockFixture = ["before-advance_clock.json", "after-advance_clock.json"];
const tickCount = TICKS_PER_REPLAY_SECOND;
const dt = DEFAULT_REPLAY_DT_STEP;

const suite = {
  "seed-1": [1, 2, 3, 4, 5, 6, 7, 9, 17, 25, 33, 40, 400, 802, 1595, 1596, 1597, 1598, 1599, 1600],
  "seed-42-shops": [7, 12, 13, 70, 71, 80, 81, 132],
  "seed-2026-late": [3201, 3202, 3203, 3204, 3205, 3206, 3207, 3209, 3232, 3233, 3262, 3334],
  "seed-42-charge": [17, 41],
};

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function snapshot(state, chaosBefore, label) {
  const journal = state.civilization.practiceEvents;
  requireThat(!Object.hasOwn(journal, "activeRoot") && !Object.hasOwn(journal, "activeEvent"),
    label + ": boundary intersects an active Practice root");
  const { _seasonChanged, _boardDirty, ...body } = state;
  const sidecar = { _seasonChanged: _seasonChanged === true, _boardDirty: _boardDirty ?? null, chaosBefore };
  const serialized = serializeGameState(state);
  // Phase is derived from pause and RNG functions disappear in JSON. Reject
  // any other state lost or rewritten by the save codec at a probe boundary.
  body.phase = serialized.phase;
  const raw = JSON.stringify(body);
  if (raw !== JSON.stringify(serialized)) {
    const detail = diffStates(JSON.parse(raw), serialized);
    requireThat(detail.differingLeaves === 0, label + ": lossy serialization\n" + formatStateDiff(detail));
  }
  return { formatVersion: 1, state: serialized, sidecar };
}

function advanceClock(state) {
  for (let tick = 1; tick < tickCount; tick += 1) updateGame(dt, state);
  // The live scheduler reads this flag, while the clock/AP path does not.
  // Disable dispatch only for the official boundary tick and restore the flag
  // before observing the boundary or running a settlement function.
  const flags = state.variantFlags;
  const enabled = flags.settlementPrototypeEnabled;
  // The boundary tick clears the latch after dispatch even when disabled.
  // At entry to dispatch the latch is the previous latch OR a new rollover.
  const hadSeasonChange = state._seasonChanged === true;
  const seasonIndex = state.currentSeasonIndex;
  const year = state.year;
  try {
    flags.settlementPrototypeEnabled = false;
    updateGame(dt, state);
  } finally {
    flags.settlementPrototypeEnabled = enabled;
  }
  state._seasonChanged = hadSeasonChange || state.currentSeasonIndex !== seasonIndex || state.year !== year;
}

function dispatchSettlements(state, run) {
  if (state.variantFlags.settlementPrototypeEnabled !== true || state.runStatus?.complete === true) return;
  run("prelude", () => {
    stepUnrest(state);
    refreshGreenAscendancy(state);
    for (const site of getDetailedSettlementSites(state)) resetEmptyStrangerCohort(site.detailedState);
  });
  if (state._seasonChanged === true) {
    run("seasonal_practices", () => runPracticeActivation(state, "season"));
    if (state.runStatus?.complete) {
      run("final_flush", () => flushPracticeEvents(state));
      return;
    }
    if (getCurrentSeasonKey(state) === "spring") run("spring_death_baseline", () => {
      for (const { detailedState } of getDetailedSettlementSites(state)) {
        detailedState.history ??= { deaths: 0 };
        detailedState.history.springDeaths = detailedState.history.deaths;
      }
    });
  }

  const phase = getMoonPhaseAtSecond(state, state.tSec);
  if (phase.boundary) {
    const chaosBefore = state.civilization.chaos.chaosPower;
    switch (phase.id) {
      case "birth":
        run("birth", () => runBirthPhase(state, phase));
        break;
      case "food":
        run("food", () => runFoodPhase(state, phase));
        run("after_meals_practices", () => runPracticeActivation(state, "food", "afterMeals"));
        run("garrison_upkeep", () => payGarrisonUpkeep(state));
        break;
      case "housing":
        run("housing", () => runHousingPhase(state, phase));
        break;
      case "faith":
        run("faith", () => runFaithPhase(state, phase));
        break;
      case "migration":
        if (state.rulesetId) run("migration_practices", () => runPracticeActivation(state, "migration"));
        run("migration", () => runMigrationPhase(state, phase));
        break;
      case "death":
        run("death", () => runDeathPhase(state, phase));
        run("death_practices", () => runPracticeActivation(state, "death"));
        run("control_and_spatial_pressure", () => {
          resolveControl(state);
          stepSpatialPressure(state);
        });
        break;
      default:
        throw new Error("Unknown lunar phase " + phase.id);
    }
    run("phase_events_and_drain", () => {
      const chaosAfter = state.civilization.chaos.chaosPower;
      if (chaosAfter > chaosBefore) {
        emitPracticeEvent(state, { kind: "chaosIncreased", amount: chaosAfter - chaosBefore });
      }
      for (const site of getDetailedSettlementSites(state)) {
        emitPracticeEvent(state, { kind: "phaseResolved", regionId: site.regionId, phase: phase.id });
      }
      flushPracticeEvents(state);
    }, chaosBefore);
  }
  if (state.runStatus?.complete !== true) run("vassal_check", () => stepVassalLifeMapSecond(state, state.tSec));
  run("final_flush", () => flushPracticeEvents(state));
}

function dischargeCascades(state) {
  const cascades = [];
  for (const site of state.world.sites) {
    const byRoot = new Map();
    for (const entry of site.detailedState?.practiceActivationTrace ?? []) {
      if (entry.tSec !== state.tSec || entry.kind !== "discharged") continue;
      if (!byRoot.has(entry.rootId)) byRoot.set(entry.rootId, []);
      byRoot.get(entry.rootId).push(entry.targetPracticeId);
    }
    for (const [rootId, practices] of byRoot) {
      if (practices.length > 1) cascades.push({ regionId: site.regionId, rootId, practices });
    }
  }
  return cascades;
}

function captureSecond(id, baseline, live, sec, actions, hashes) {
  const label = id + "/" + sec;
  requireThat(live.simStepIndex === (sec - 1) * tickCount && live.tSec === sec - 1 &&
    !live.paused && !live.runStatus?.complete, label + ": expected an advancing, tick-aligned second");
  const start = snapshot(live, null, label + " start");
  const state = start.state;
  attachRngHelpers(state);
  state._seasonChanged = start.sidecar._seasonChanged;
  if (start.sidecar._boardDirty !== null) state._boardDirty = start.sidecar._boardDirty;

  const files = new Map();
  const seen = new Map();
  const boundaries = [];
  const stages = [];
  let tick = 0;
  function boundary(name, chaosBefore = null) {
    const data = snapshot(state, chaosBefore, label + " " + name);
    const serialized = JSON.stringify(data);
    if (seen.has(serialized)) return seen.get(serialized);
    const file = name + ".json";
    const index = boundaries.length;
    files.set(file, serialized);
    seen.set(serialized, index);
    boundaries.push({ file, tick, simStepIndex: state.simStepIndex, tSec: state.tSec,
      stateHash: sha256Value(data.state), sidecar: data.sidecar });
    return index;
  }
  function run(name, execute, chaosBefore = null) {
    const firstTick = name === "advance_clock" ? 1 : tick;
    const before = boundary("before-" + name, chaosBefore);
    execute();
    tick = tickCount;
    const after = boundary("after-" + name, chaosBefore);
    stages.push({ name, firstTick, lastTick: tick, before, after });
  }

  run("advance_clock", () => advanceClock(state));
  requireThat(state.tSec === sec && state.simStepIndex === sec * tickCount,
    label + ": expected the 60th tick to dispatch the second");
  dispatchSettlements(state, run);
  state._seasonChanged = false;
  const end = boundary("second-end");
  const cascades = dischargeCascades(state);
  if (id === "seed-42-charge" && suite[id].includes(sec)) {
    requireThat(cascades.some(({ practices }) => practices.join() === "smelting,toolmaking"),
      label + ": expected the Smelting-to-Toolmaking Discharge cascade");
  }

  // The reference runner executes the same second on the untouched branch.
  // Trace rows include actions, so compare again after applying those actions
  // to both branches. Actions are outside the stage pairs.
  advance(live, sec, label);
  const expected = serializeGameState(live);
  const officialHash = sha256Value(expected);
  const orchestratedHash = boundaries[end].stateHash;
  assertHash(id, "stage probe vs. official tick", sec, expected, serializeGameState(state), officialHash);
  requireThat(live._seasonChanged === state._seasonChanged && live._boardDirty === state._boardDirty,
    label + ": final runtime latches differ from the official tick");
  applyActions(live, actions, sec, label + " official");
  applyActions(state, actions, sec, label + " staged");
  const expectedWithActions = serializeGameState(live);
  const afterActionsHash = sha256Value(expectedWithActions);
  const traceHash = hashes.get(sec);
  requireThat(afterActionsHash === traceHash,
    label + ": official trace hash differs\nExpected " + traceHash + "\nActual   " + afterActionsHash);
  if (actions?.length) {
    assertHash(id, "stage probe with actions", sec, expectedWithActions, serializeGameState(state), traceHash);
  }
  files.set("manifest.json", JSON.stringify({
    formatVersion: 1, baseline, scenario: id, second: sec, ticksPerSecond: tickCount,
    stages, boundaries, end, dischargeCascades: cascades,
    validation: { officialHash, orchestratedHash, afterActionsHash, traceHash,
      actions: (actions ?? []).map(action => action.kind) },
  }, null, 2) + "\n");
  return { files, stageCount: stages.length };
}

function checkFile(path, expected) {
  requireThat(existsSync(path) && readFileSync(path).equals(Buffer.from(expected)),
    path + ": missing or differs from regenerated data");
}

function writeOrCheck(id, sec, files, check) {
  const dir = join(artifactDir, id, String(sec));
  if (check) {
    const fixture = id === "seed-1" && sec === 1;
    if (fixture) {
      for (const file of clockFixture) checkFile(join(fixturesDir, id, String(sec), file), files.get(file));
      if (!existsSync(dir)) return;
    }
    for (const [file, data] of files) checkFile(join(dir, file), data);
    for (const file of readdirSync(dir)) requireThat(files.has(file), join(dir, file) + ": unexpected output");
  } else {
    mkdirSync(dir, { recursive: true });
    for (const [file, data] of files) writeFileSync(join(dir, file), data);
  }
}

function main(args) {
  const check = args.includes("--check");
  const positional = args.filter(arg => arg !== "--check");
  const [id, ...seconds] = positional;
  const usage = "Usage: node native/reference/stage-probe.mjs [--check] [--all | <scenario> <second> ...]";
  requireThat(args.length - positional.length <= 1, usage);
  requireThat(id === undefined || (id === "--all" ? seconds.length === 0 :
    !id.startsWith("-") && seconds.length > 0 && seconds.every(sec => /^[1-9]\d*$/u.test(sec))), usage);
  const selection = id === "--all" ? suite : id ? { [id]: seconds.map(Number) } : { "seed-1": [1] };
  const baseline = JSON.parse(readFileSync(join(here, "BASELINE"), "utf8"));

  for (const [id, seconds] of Object.entries(selection)) {
    const { scenario, startSec, endSec } = loadScenario(id);
    const wanted = new Set(seconds);
    requireThat(wanted.size === seconds.length && seconds.every(sec => sec > startSec && sec <= endSec),
      id + ": seconds must be unique and inside (" + startSec + ", " + endSec + "]");
    const hashes = new Map(readHashes(join(here, "fixtures", id, HASHES_FILE)).map(({ sec, hash }) => [sec, hash]));
    const live = createStart(scenario, startSec);
    const { actionsBySecond } = groupReplayActions(live, scenario);
    applyActions(live, actionsBySecond.get(startSec), startSec, id);
    let stages = 0;
    for (let sec = startSec + 1; sec <= Math.max(...seconds); sec += 1) {
      const actions = actionsBySecond.get(sec);
      if (!wanted.has(sec)) {
        advance(live, sec, id);
        applyActions(live, actions, sec, id);
        continue;
      }
      requireThat(sha256Value(serializeGameState(live)) === hashes.get(sec - 1),
        id + "/" + sec + ": start state differs from the preceding trace row");
      const { files, stageCount } = captureSecond(id, baseline, live, sec, actions, hashes);
      writeOrCheck(id, sec, files, check);
      stages += stageCount;
    }
    console.log(id + ": " + (check ? "checked " : "captured ") + seconds.length +
      " seconds and " + stages + " stage pairs; all official and trace hashes matched.");
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
