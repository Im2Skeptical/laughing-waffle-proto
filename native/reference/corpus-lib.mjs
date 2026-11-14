// Browser regression corpus for a future native slice. Not a C++ port.
// Determinism: createNewGameState and the official replay runner only. No Math.random.
// Serialization: serializeGameState / deserializeGameState. No schema change.
// Replay: every official 60-tick second. rebuildStateAtSecond is compared in full.
// Layering: model imports only. No view, controller, or gameplay edits.
// Passing these checks is regression to a frozen browser reference.
// Cross-language parity does not exist and is not claimed.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ActionKinds, applyAction } from "../../src/model/actions.js";
import { canonicalizeGameConfig } from "../../src/model/game-config.js";
import { getMoonPhaseAtSecond } from "../../src/model/moon-phases.js";
import { createNewGameState } from "../../src/model/new-game.js";
import {
  advanceReplayStateOneSecond,
  advanceReplayStateToSecond,
} from "../../src/model/replay-second-runner.js";
import { deserializeGameState, serializeGameState } from "../../src/model/state.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../../src/model/timeline/index.js";
import { getVassalCandidatePool } from "../../src/model/vassal-life-map.js";

export const BASELINE_COMMIT = "f0b1b1f720c19a1cbeda558da430a1ff636e6507";
export const SEEDS = Object.freeze([1, 42, 1867]);
export const CHECKPOINTS = Object.freeze([
  Object.freeze({ id: "initial", tSec: 0 }),
  Object.freeze({ id: "phases", tSec: 6 }),
  Object.freeze({ id: "action", tSec: 7 }),
]);

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "..", "..");
export const CORPUS_DIR = join(here, "corpus");
export const ARTIFACT_DIR = join(REPO_ROOT, "artifacts", "grok-nov14-spend", "reference-fixtures");

const JOINT_FIELDS = ["allegiance", "specialty", "kind", "age", "count"];
const PRACTICE_FIELDS = ["instanceId", "practiceId", "tier", "stock", "charge", "work", "allegiance"];

export function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalValue(value[key]);
    return sorted;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256Value(value) {
  return sha256Text(canonicalJson(value));
}

export function readRunnerSaveSchema() {
  const source = readFileSync(join(REPO_ROOT, "src", "controllers", "sim-runner", "save-slots.js"), "utf8");
  const match = source.match(/export const SAVE_SCHEMA_VERSION = (\d+);/);
  return match ? Number(match[1]) : null;
}

function plain(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function extras(source, known) {
  const extra = {};
  for (const key of Object.keys(source ?? {}).sort()) {
    if (!known.includes(key)) extra[key] = source[key];
  }
  return Object.keys(extra).length ? plain(extra) : null;
}

function projectPopulation(detailed) {
  const composition = detailed?.populationByClass;
  if (!composition || typeof composition !== "object") return null;
  const classes = [];
  for (const classId of Object.keys(composition).sort()) {
    const joint = composition[classId]?.joint;
    if (!Array.isArray(joint)) continue;
    classes.push({
      classId,
      cohorts: joint.map((bin, order) => {
        const row = { order, classId };
        for (const field of JOINT_FIELDS) row[field] = bin?.[field] ?? null;
        const extra = extras(bin, JOINT_FIELDS);
        if (extra) row.extra = extra;
        return row;
      }),
    });
  }
  return classes;
}

function projectPractices(detailed) {
  if (!detailed || !Array.isArray(detailed.practiceSlots)) return null;
  return detailed.practiceSlots.map((slot, order) => {
    if (!slot) {
      return {
        order,
        empty: true,
        instanceId: null,
        practiceId: null,
        tier: null,
        stock: null,
        charge: null,
        work: null,
        allegiance: null,
      };
    }
    const row = { order, empty: false };
    for (const field of PRACTICE_FIELDS) row[field] = Object.hasOwn(slot, field) ? slot[field] : null;
    const extra = extras(slot, PRACTICE_FIELDS);
    if (extra) row.extra = extra;
    return row;
  });
}

function projectBirthCredits(detailed) {
  const ledgers = detailed?.birthAllegianceCredits;
  if (!ledgers || typeof ledgers !== "object" || Array.isArray(ledgers)) return null;
  return Object.keys(ledgers).sort().map((key) => ({
    key,
    credits: Object.keys(ledgers[key] ?? {}).sort().map((allegiance) => ({
      allegiance,
      credit: ledgers[key][allegiance],
    })),
  }));
}

function projectCandidates(lineage) {
  return (lineage?.pendingCandidates ?? []).map((candidate, index) => ({
    index,
    candidateId: candidate.candidateId ?? null,
    classId: candidate.classId ?? null,
    founderClassId: candidate.founderClassId ?? null,
    archetype: candidate.archetype ?? null,
    age: candidate.age ?? null,
    prestige: candidate.prestige ?? null,
    locationRegionId: candidate.locationRegionId ?? null,
    originRegionId: candidate.originRegionId ?? null,
  }));
}

function projectSelectedVassal(lineage) {
  const id = lineage?.currentVassalId ?? null;
  if (!id) return null;
  const vassal = lineage?.vassalsById?.[id];
  if (!vassal) return { vassalId: id, missing: true };
  return {
    vassalId: id,
    classId: vassal.classId ?? null,
    founderClassId: vassal.founderClassId ?? null,
    archetype: vassal.archetype ?? null,
    prestige: vassal.prestige ?? null,
    locationRegionId: vassal.locationRegionId ?? null,
    originRegionId: vassal.originRegionId ?? null,
    selectedSec: vassal.selectedSec ?? null,
    stats: plain(vassal.stats),
  };
}

export function projectSemantic(snapshot) {
  const phase = getMoonPhaseAtSecond(snapshot, snapshot.tSec ?? 0);
  const lineage = snapshot.civilization?.vassalLineage ?? null;
  const sites = Array.isArray(snapshot.world?.sites) ? snapshot.world.sites : [];
  const regions = Array.isArray(snapshot.world?.regions) ? snapshot.world.regions : [];
  return {
    time: {
      tSec: snapshot.tSec ?? null,
      simStepIndex: snapshot.simStepIndex ?? null,
      year: snapshot.year ?? null,
      currentSeasonIndex: snapshot.currentSeasonIndex ?? null,
      seasonClockSec: snapshot.seasonClockSec ?? null,
      seasonTimeRemaining: snapshot.seasonTimeRemaining ?? null,
      paused: snapshot.paused ?? null,
      phase: snapshot.phase ?? null,
      moonPhaseId: phase.id,
      moonPhaseIndex: phase.phaseIndex,
      moonIndex: phase.moonIndex,
      moonBoundary: phase.boundary,
    },
    rng: {
      seed: snapshot.rng?.seed ?? null,
      baseSeed: snapshot.rng?.baseSeed ?? null,
      vassalSeed: snapshot.rng?.vassalSeed ?? null,
      vassalDevelopmentSeed: snapshot.rng?.vassalDevelopmentSeed ?? null,
      vassalLifeMapSeed: snapshot.rng?.vassalLifeMapSeed ?? null,
      vassalPortraitSeed: snapshot.rng?.vassalPortraitSeed ?? null,
    },
    economy: {
      prestige: snapshot.civilization?.prestige ?? null,
      treasury: plain(snapshot.civilization?.treasury),
      nextPracticeInstanceId: snapshot.civilization?.nextPracticeInstanceId ?? null,
    },
    chaos: {
      chaosPower: snapshot.civilization?.chaos?.chaosPower ?? null,
      monsterPressure: snapshot.civilization?.chaos?.monsterPressure ?? null,
      expansionEvents: snapshot.civilization?.chaos?.expansionEvents ?? null,
      spatialSpawns: snapshot.civilization?.chaos?.spatialSpawns ?? null,
      monsterCount: snapshot.civilization?.chaos?.monsterCount ?? null,
    },
    vassal: {
      currentVassalId: lineage?.currentVassalId ?? null,
      candidateRerollCount: lineage?.candidateRerollCount ?? null,
      candidates: projectCandidates(lineage),
      selected: projectSelectedVassal(lineage),
    },
    holdings: regions.map((region, order) => {
      const site = sites.find((entry) => entry.regionId === region.id) ?? null;
      const detailed = site?.detailedState ?? null;
      const control = detailed?.control ?? null;
      return {
        order,
        regionId: region.id ?? null,
        siteId: site?.id ?? null,
        simulationMode: site?.simulationMode ?? null,
        controller: region.controller ?? null,
        control: {
          unrest: plain(control?.unrest ?? null),
          claimant: control?.claimant ?? null,
          claimChecks: control?.claimChecks ?? null,
          supportTargetRegionId: detailed?.garrison?.supportTargetRegionId ?? null,
        },
        population: projectPopulation(detailed),
        birthCredits: projectBirthCredits(detailed),
        practices: projectPractices(detailed),
      };
    }),
  };
}

export function configIdentity(snapshot) {
  const config = canonicalizeGameConfig(snapshot.gameConfig);
  return {
    gameStateSchemaVersion: snapshot.gameStateSchemaVersion ?? null,
    gameConfigSchemaVersion: snapshot.gameConfig?.schemaVersion ?? null,
    rulesetId: snapshot.rulesetId ?? null,
    worldDefinitionId: snapshot.world?.definitionId ?? null,
    gameConfigSha256: sha256Value(config),
  };
}

function preview(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text == null) return String(value);
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

export function compareValues(expected, actual, limit = 8) {
  const diffs = [];
  function walk(path, left, right) {
    if (diffs.length >= limit) return;
    if (Object.is(left, right)) return;
    if (typeof left === "number" && typeof right === "number") {
      diffs.push({ path, expected: left, actual: right });
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) {
        diffs.push({ path, expected: preview(left), actual: preview(right) });
        return;
      }
      if (left.length !== right.length) {
        diffs.push({ path: `${path}.length`, expected: left.length, actual: right.length });
      }
      const count = Math.min(left.length, right.length);
      for (let index = 0; index < count; index += 1) walk(`${path}[${index}]`, left[index], right[index]);
      return;
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) walk(path ? `${path}.${key}` : key, left[key], right[key]);
      return;
    }
    diffs.push({ path: path || "$", expected: preview(left), actual: preview(right) });
  }
  walk("", expected, actual);
  return diffs;
}

function fail(failures, entry) {
  failures.push(entry);
}

function sameFull(bucket, label, expected, actual) {
  bucket.attempted += 1;
  const diffs = compareValues(expected, actual, 3);
  if (diffs.length) fail(bucket.failures, { label, diffs });
  else bucket.passed += 1;
  return diffs.length === 0;
}

function restore(snapshot) {
  return deserializeGameState(JSON.parse(JSON.stringify(snapshot)));
}

function selectOpeningVassal(state) {
  state.paused = true;
  const pool = getVassalCandidatePool(state);
  const action = {
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
    tSec: 7,
    payload: {
      candidateIndex: 0,
      expectedPoolHash: pool.expectedPoolHash,
    },
  };
  const applied = applyAction(state, action);
  state.paused = false;
  return { action, applied };
}

function playLive(seed, failures) {
  const state = createNewGameState(seed);
  const initial = serializeGameState(state);
  const toPhases = advanceReplayStateToSecond(state, 6);
  if (!toPhases?.ok || Math.floor(state.tSec) !== 6) {
    fail(failures, { label: "live-phases", diffs: [{ path: "tSec", expected: 6, actual: state.tSec ?? null }] });
    return null;
  }
  const phases = serializeGameState(state);
  const toAction = advanceReplayStateOneSecond(state);
  if (!toAction?.ok || Math.floor(state.tSec) !== 7) {
    fail(failures, { label: "live-action-second", diffs: [{ path: "tSec", expected: 7, actual: state.tSec ?? null }] });
    return null;
  }
  const { action, applied } = selectOpeningVassal(state);
  if (!applied?.ok) {
    fail(failures, {
      label: "live-select",
      diffs: [{ path: "applyAction", expected: "ok", actual: applied?.reason ?? "failed" }],
    });
    return null;
  }
  return { action, snapshots: { initial, phases, action: serializeGameState(state) } };
}

function continueHistory(snapshot, steps, action) {
  const state = restore(snapshot);
  if (steps > 0) {
    const advanced = advanceReplayStateToSecond(state, Math.floor(state.tSec ?? 0) + steps);
    if (!advanced?.ok) return { ok: false, reason: advanced?.reason ?? "advanceFailed" };
  }
  if (action) {
    state.paused = true;
    const applied = applyAction(state, action);
    state.paused = false;
    if (!applied?.ok) return { ok: false, reason: applied?.reason ?? "actionFailed" };
  }
  return { ok: true, snapshot: serializeGameState(state) };
}

function checkRebuild(seed, action, snapshots, bucket) {
  const timeline = createTimelineFromInitialState(createNewGameState(seed));
  const recorded = appendActionAtCursor(timeline, { ...action }, { tSec: action.tSec });
  if (!recorded?.ok) {
    fail(bucket.failures, { label: "record-action", diffs: [{ path: "append", expected: "ok", actual: recorded?.reason ?? "failed" }] });
    return;
  }
  for (const checkpoint of CHECKPOINTS) {
    const first = rebuildStateAtSecond(timeline, checkpoint.tSec);
    const second = rebuildStateAtSecond(timeline, checkpoint.tSec);
    if (!first?.ok || !second?.ok) {
      fail(bucket.failures, {
        label: `rebuild-${checkpoint.id}`,
        diffs: [{ path: "rebuild", expected: "ok", actual: first?.reason ?? second?.reason ?? "failed" }],
      });
      continue;
    }
    const expected = snapshots[checkpoint.id];
    sameFull(bucket, `rebuild-${checkpoint.id}`, expected, serializeGameState(first.state));
    sameFull(bucket, `rebuild-repeat-${checkpoint.id}`, expected, serializeGameState(second.state));
    if (first.state === second.state) {
      fail(bucket.failures, {
        label: `restore-identity-${checkpoint.id}`,
        diffs: [{ path: "state", expected: "distinct objects", actual: "same reference" }],
      });
    }
  }
  const mutable = rebuildStateAtSecond(timeline, 7);
  const untouched = rebuildStateAtSecond(timeline, 7);
  if (!mutable?.ok || !untouched?.ok) return;
  const cohort = mutable.state.world?.sites?.find((site) => site.detailedState?.populationByClass)?.detailedState;
  const joint = cohort ? Object.values(cohort.populationByClass).find((entry) => entry.joint?.length)?.joint[0] : null;
  const practice = mutable.state.world?.sites?.find((site) => site.detailedState?.practiceSlots?.some(Boolean))?.detailedState.practiceSlots.find(Boolean);
  if (!joint || !practice || !mutable.state.rng) {
    fail(bucket.failures, { label: "independence-setup", diffs: [{ path: "fixture", expected: "cohort, stock, rng", actual: "missing" }] });
    return;
  }
  const beforeUntouched = serializeGameState(untouched.state);
  joint.count += 1;
  practice.stock = (practice.stock ?? 0) + 1;
  mutable.state.rng.seed += 1;
  sameFull(bucket, "independence-sibling", beforeUntouched, serializeGameState(untouched.state));
  const fresh = rebuildStateAtSecond(timeline, 7);
  if (!fresh?.ok) {
    fail(bucket.failures, { label: "independence-fresh", diffs: [{ path: "rebuild", expected: "ok", actual: fresh?.reason ?? "failed" }] });
    return;
  }
  sameFull(bucket, "independence-fresh", snapshots.action, serializeGameState(fresh.state));
}

function checkContinuation(action, snapshots, bucket) {
  for (const checkpoint of CHECKPOINTS) {
    const roundTrip = continueHistory(snapshots[checkpoint.id], 0, null);
    if (!roundTrip.ok) {
      fail(bucket.failures, { label: `json-${checkpoint.id}`, diffs: [{ path: "roundTrip", expected: "ok", actual: roundTrip.reason }] });
      continue;
    }
    sameFull(bucket, `json-${checkpoint.id}`, snapshots[checkpoint.id], roundTrip.snapshot);
  }
  const fromStartToPhases = continueHistory(snapshots.initial, 6, null);
  const fromPhasesToAction = continueHistory(snapshots.phases, 1, action);
  const fromStartToAction = continueHistory(snapshots.initial, 7, action);
  if (!fromStartToPhases.ok) fail(bucket.failures, { label: "json-continue-phases", diffs: [{ path: "continue", expected: "ok", actual: fromStartToPhases.reason }] });
  else sameFull(bucket, "json-continue-phases", snapshots.phases, fromStartToPhases.snapshot);
  if (!fromPhasesToAction.ok) fail(bucket.failures, { label: "json-continue-action", diffs: [{ path: "continue", expected: "ok", actual: fromPhasesToAction.reason }] });
  else sameFull(bucket, "json-continue-action", snapshots.action, fromPhasesToAction.snapshot);
  if (!fromStartToAction.ok) fail(bucket.failures, { label: "json-continue-full", diffs: [{ path: "continue", expected: "ok", actual: fromStartToAction.reason }] });
  else sameFull(bucket, "json-continue-full", snapshots.action, fromStartToAction.snapshot);
}

export function evaluateSeed(seed) {
  const failures = [];
  const bucket = { failures, attempted: 0, passed: 0 };
  const live = playLive(seed, failures);
  if (!live) return { seed, ok: false, failures, comparisons: bucket.passed, record: null, snapshots: null };
  checkRebuild(seed, live.action, live.snapshots, bucket);
  checkContinuation(live.action, live.snapshots, bucket);
  const record = {
    seed,
    reachability: "normal-play",
    action: {
      kind: live.action.kind,
      tSec: live.action.tSec,
      payload: {
        candidateIndex: live.action.payload.candidateIndex,
        expectedPoolHash: live.action.payload.expectedPoolHash,
      },
    },
    config: configIdentity(live.snapshots.initial),
    checkpoints: CHECKPOINTS.map((checkpoint) => {
      const snapshot = live.snapshots[checkpoint.id];
      return {
        id: checkpoint.id,
        tSec: checkpoint.tSec,
        fullStateSha256: sha256Value(snapshot),
        semantic: projectSemantic(snapshot),
      };
    }),
  };
  return { seed, ok: failures.length === 0, failures, comparisons: bucket.passed, record, snapshots: live.snapshots };
}

export function corpusFile(seed) {
  return join(CORPUS_DIR, `seed-${seed}.json`);
}

export function compareRecord(expected, actual) {
  const failures = [];
  if (!expected || !actual) {
    fail(failures, { label: "record", diffs: [{ path: "record", expected: Boolean(expected), actual: Boolean(actual) }] });
    return failures;
  }
  const configDiffs = compareValues(expected.config, actual.config, 6);
  if (configDiffs.length) fail(failures, { label: "config", diffs: configDiffs });
  const actionDiffs = compareValues(expected.action, actual.action, 4);
  if (actionDiffs.length) fail(failures, { label: "action", diffs: actionDiffs });
  if (expected.reachability !== actual.reachability) {
    fail(failures, { label: "reachability", diffs: [{ path: "reachability", expected: expected.reachability, actual: actual.reachability }] });
  }
  for (const checkpoint of CHECKPOINTS) {
    const left = expected.checkpoints.find((entry) => entry.id === checkpoint.id);
    const right = actual.checkpoints.find((entry) => entry.id === checkpoint.id);
    if (!left || !right) {
      fail(failures, { label: `missing-${checkpoint.id}`, diffs: [{ path: "checkpoint", expected: checkpoint.id, actual: right?.id ?? null }] });
      continue;
    }
    if (left.fullStateSha256 !== right.fullStateSha256) {
      fail(failures, {
        label: `hash-${checkpoint.id}`,
        diffs: [{ path: "fullStateSha256", expected: left.fullStateSha256, actual: right.fullStateSha256 }],
      });
    }
    const semanticDiffs = compareValues(left.semantic, right.semantic, 8);
    if (semanticDiffs.length) fail(failures, { label: `semantic-${checkpoint.id}`, diffs: semanticDiffs });
  }
  return failures;
}

function controlCase(name, mutate) {
  const expected = {
    rng: { seed: 11, baseSeed: 11, vassalSeed: 4 },
    holdings: [{
      regionId: "R01",
      population: [{ classId: "villager", cohorts: [{ order: 0, count: 4, allegiance: "player" }] }],
      practices: [{ order: 0, empty: false, stock: 3, charge: 1, work: 0 }],
    }],
  };
  const actual = JSON.parse(JSON.stringify(expected));
  mutate(actual);
  const diffs = compareValues(expected, actual, 4);
  return { name, detected: diffs.length > 0, paths: diffs.map((diff) => diff.path) };
}

export function runVerifierControls() {
  const same = compareValues({ rng: { seed: 1 }, stock: 2 }, { rng: { seed: 1 }, stock: 2 }, 4);
  const cases = [
    controlCase("rng", (actual) => { actual.rng.seed = 12; }),
    controlCase("cohort", (actual) => { actual.holdings[0].population[0].cohorts[0].count = 5; }),
    controlCase("stock", (actual) => { actual.holdings[0].practices[0].stock = 9; }),
  ];
  return {
    kind: "verifier-controls",
    productionMutants: false,
    unchangedDiffs: same.length,
    cases,
    ok: same.length === 0 && cases.every((entry) => entry.detected),
  };
}
