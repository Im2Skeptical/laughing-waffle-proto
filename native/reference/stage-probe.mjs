import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cmdTickSimulation } from "../../src/model/commands/simulation-commands.js";
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
import { checkFoodContention, checkSeasonalFoodBoost } from "./food-contention.mjs";
import { checkHousingExhibit, checkHousingFaithExhibit } from "./housing-exhibit.mjs";
import { deathExhibits } from "./scenarios/death-exhibits.mjs";
import { checkVassalExhibit, vassalResolutionKinds } from "./vassal-exhibit.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const artifactDir = join(REPO_ROOT, "artifacts", "native-reference", "stages");
const fixturesDir = join(here, "fixtures", "stages");
const clockFixture = ["before-advance_clock.json", "after-advance_clock.json"];
const tickCount = TICKS_PER_REPLAY_SECOND;
const dt = DEFAULT_REPLAY_DT_STEP;

const chargeCascadeSeconds = [16, 40];
const suite = {
  // Faith samples cover all six tier shifts, entry/re-entry into collapse,
  // ongoing collapse, a Resistance crossing and accrued Unrest income.
  "seed-1": [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 17, 19, 20, 21, 25, 26, 31, 32, 33, 37, 38, 40,
    82, 97, 184, 202, 220, 226, 292, 298, 310, 388, 400, 406, 412, 802, 880, 1595, 1596, 1597,
    1598, 1599, 1600],
  "seed-1-migration": [1715, 1716],
  "seed-1-food-contention": [2, 16],
  "seed-1-housing": [3, 4, 5, 7, 9, 10],
  "seed-1867": [58, 61, 76, 79, 82, 85],
  "seed-42-shops": [7, 12, 13, 52, 70, 71, 76, 80, 81, 82, 84, 85, 88, 132],
  "seed-2026-late": [3201, 3202, 3203, 3204, 3205, 3206, 3207, 3209, 3211, 3217, 3232, 3233, 3262,
    3334],
  // Both Charge Birth boundaries have no newborns. At Migration 2041 a child matures.
  "seed-42-charge": [1, 19, ...chargeCascadeSeconds].sort((a, b) => a - b),
  "seed-123-migration": [2033, 2034, 2039, 2041, 2123, 2124, 2129, 2130, 2675, 2676],
  "seed-1-territory": [6, 8, 16],
  ...Object.fromEntries(vassalResolutionKinds.map(kind => ["seed-1-vassal-" + kind,
    kind.startsWith("commission-") || kind === "scholar-founding" ? [1, 2] : [kind === "delve" ? 2 : 1]])),
};

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function snapshot(state, chaosBefore, label, seasonChanged = false) {
  const journal = state.civilization.practiceEvents;
  requireThat(!Object.hasOwn(journal, "activeRoot") && !Object.hasOwn(journal, "activeEvent"),
    label + ": boundary intersects an active Practice root");
  const { _boardDirty, ...body } = state;
  const sidecar = { seasonChanged, _boardDirty: _boardDirty ?? null, chaosBefore };
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
  try {
    flags.settlementPrototypeEnabled = false;
    return cmdTickSimulation(state).advancedSeason === true;
  } finally {
    flags.settlementPrototypeEnabled = enabled;
  }
}

function dispatchSettlements(state, run, seasonChanged) {
  if (state.variantFlags.settlementPrototypeEnabled !== true || state.runStatus?.complete === true) return;
  run("prelude", () => {
    stepUnrest(state);
    refreshGreenAscendancy(state);
    for (const site of getDetailedSettlementSites(state)) resetEmptyStrangerCohort(site.detailedState);
  });
  if (seasonChanged) {
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
  if (start.sidecar._boardDirty !== null) state._boardDirty = start.sidecar._boardDirty;

  const files = new Map();
  const seen = new Map();
  const boundaries = [];
  const stages = [];
  let tick = 0;
  let seasonChanged = false;
  function boundary(name, chaosBefore = null) {
    const data = snapshot(state, chaosBefore, label + " " + name, seasonChanged);
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
    if (name === "vassal_check" && id.startsWith("seed-1-vassal-"))
      checkVassalExhibit(state, id.slice("seed-1-vassal-".length));
    if (id === "seed-1-housing" && name === "housing") checkHousingExhibit(state);
    if (id === "seed-1-housing" && sec === 4 && name === "faith") checkHousingFaithExhibit(state);
    // Food on the same second can evict the seasonal events from the bounded journal.
    if (id === "seed-1-territory" && sec === 8 && name === "seasonal_practices") {
      const { trace } = state.civilization.practiceEvents;
      const spawn = trace.find(event => event.kind === "monsterSpawn" && event.tSec === sec);
      requireThat(spawn?.cause === "direct" && spawn.outcome === "intercepted" &&
        trace.some(event => event.kind === "discharged" && event.rootId === spawn.rootId &&
          event.targetPracticeId === "smelting"),
        label + ": need immediate Spawn, incoming garrison defense and a reaction in the original root");
    }
    tick = tickCount;
    const after = boundary("after-" + name, chaosBefore);
    stages.push({ name, firstTick, lastTick: tick, before, after });
  }

  run("advance_clock", () => { seasonChanged = advanceClock(state); });
  requireThat(state.tSec === sec && state.simStepIndex === sec * tickCount,
    label + ": expected the 60th tick to dispatch the second");
  dispatchSettlements(state, run, seasonChanged);
  if (id === "seed-1-food-contention" && sec === 2) checkFoodContention(state);
  if (id === "seed-1-food-contention" && sec === 16) checkSeasonalFoodBoost(state);
  seasonChanged = false;
  const end = boundary("second-end");
  const cascades = dischargeCascades(state);
  if (id === "seed-42-charge" && chargeCascadeSeconds.includes(sec)) {
    requireThat(cascades.some(({ practices }) => practices.join() === "smelting,toolmaking"),
      label + ": expected the Smelting-to-Toolmaking Discharge cascade");
  }
  if (id === "seed-1-territory" && sec === 6) {
    const site = id => state.world.sites.find(s => s.regionId === id);
    const spawn = state.civilization.chaos.lastMonsterSpawn;
    const lineage = state.civilization.vassalLineage;
    const vassal = lineage.vassalsById[lineage.currentVassalId];
    requireThat(site("R02").town.activated && !site("R02").neutral &&
      site("R08").simulationMode === "ruin" && spawn.cause === "creep" && spawn.outcome === "expanded" &&
      vassal.locationRegionId !== "R08" && vassal.lifeEvents.at(-1).kind === "evacuation",
      label + ": need a peaceful claim, town ruin and Vassal diversion from threshold Spawn");
  }
  if (id === "seed-1-territory" && sec === 16) {
    const { history, practiceEvents } = state.civilization;
    requireThat(history.monsterTrophies === 1 &&
      practiceEvents.trace.some(event => event.kind === "monsterDestroyed" && event.tSec === sec) &&
      !state.world.regions.find(region => region.id === "R09").monster,
      label + ": need successful external Hunt and player Trophy credit");
  }

  // The reference runner executes the same second on the untouched branch.
  // Trace rows include actions, so compare again after applying those actions
  // to both branches. Actions are outside the stage pairs.
  advance(live, sec, label);
  const expected = serializeGameState(live);
  const officialHash = sha256Value(expected);
  const orchestratedHash = boundaries[end].stateHash;
  assertHash(id, "stage probe vs. official tick", sec, expected, serializeGameState(state), officialHash);
  requireThat(live._boardDirty === state._boardDirty,
    label + ": final board flag differs from the official tick");
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

function captureDeathExhibits(id, second, files, check) {
  for (const exhibit of deathExhibits) {
    if (exhibit.source !== id || exhibit.second !== second) continue;
    const source = JSON.parse(files.get("manifest.json"));
    const from = source.stages.find(({ name }) => name === exhibit.from);
    const { state } = JSON.parse(files.get(source.boundaries[from.before].file));
    attachRngHelpers(state);
    const captures = new Map();
    const stages = [];
    const boundaries = [];
    const writeBoundary = (name, edge) => {
      const file = edge + "-" + name + ".json";
      const data = snapshot(state, null, exhibit.id + "/" + file);
      const index = boundaries.length;
      boundaries.push({ file, tick: tickCount, simStepIndex: state.simStepIndex, tSec: state.tSec,
        stateHash: sha256Value(data.state), sidecar: data.sidecar });
      captures.set(file, JSON.stringify(data));
      return index;
    };
    exhibit.execute(state, (name, step) => {
      const before = writeBoundary(name, "before");
      step();
      const after = writeBoundary(name, "after");
      stages.push({ name, firstTick: tickCount, lastTick: tickCount, before, after });
    }, requireThat, advanceClock);
    captures.set("manifest.json", JSON.stringify({
      formatVersion: 1, baseline: source.baseline, scenario: exhibit.id, second: state.tSec,
      ticksPerSecond: tickCount, stages, boundaries, end: boundaries.length - 1,
      preparedFrom: { scenario: id, second, stage: exhibit.from },
    }, null, 2) + "\n");
    writeOrCheck(exhibit.id, state.tSec, captures, check);
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
    const fixtureHashes = join(here, "fixtures", id, HASHES_FILE);
    const hashFile = existsSync(fixtureHashes) ? fixtureHashes : join(artifactDir, "..", "traces", id, HASHES_FILE);
    const hashes = new Map(readHashes(hashFile).map(({ sec, hash }) => [sec, hash]));
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
      captureDeathExhibits(id, sec, files, check);
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
