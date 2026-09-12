// Isolated two-revision loader + deterministic state comparison helpers.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PINNED = Object.freeze({
  baseline: "848078bfa46642a744aaaf42ec3251ada8b0b428",
  refactor: "ee6495f1839ff0b132d84179c628c1675df7da52",
});

export const DEFAULT_SETUP_ID = "devPlaytesting01";
export const DIFF_LIMIT = 16;
export const VALUE_PREVIEW_CHARS = 280;

const API_MODULES = Object.freeze({
  actions: "src/model/actions.js",
  init: "src/model/init.js",
  state: "src/model/state.js",
  timeline: "src/model/timeline/index.js",
  lifeMap: "src/model/vassal-life-map.js",
  settlements: "src/model/detailed-settlements.js",
  projection: "src/model/projection-chunk.js",
  rng: "src/model/rng.js",
  defs: "src/defs/gamepieces/vassal-life-map-defs.js",
});

export function resolveDefaultRoots(scriptDir) {
  const worktrees = path.resolve(scriptDir, "..", "..");
  return {
    baseline: process.env.NAV_BENCH_BASELINE
      || path.join(worktrees, "nav-bench-baseline"),
    refactor: process.env.NAV_BENCH_REFACTOR
      || path.join(worktrees, "nav-bench-refactor"),
  };
}

export function gitRevParse(root) {
  try {
    const sha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const subject = execFileSync(
      "git",
      ["-C", root, "log", "-1", "--format=%s"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    return { ok: true, sha, subject };
  } catch (error) {
    return {
      ok: false,
      sha: null,
      subject: null,
      error: error?.stderr?.toString?.().trim() || error?.message || String(error),
    };
  }
}

function moduleUrl(root, rel) {
  return pathToFileURL(path.join(root, rel)).href;
}

export async function loadRevision(root, role) {
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${role} root does not exist: ${resolved}`);
  }
  const loaded = {};
  for (const [key, rel] of Object.entries(API_MODULES)) {
    const abs = path.join(resolved, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`${role} missing public module ${rel}`);
    }
    loaded[key] = await import(moduleUrl(resolved, rel));
  }
  const ActionKinds = loaded.actions.ActionKinds || {};
  const kindValues = new Set(
    Object.values(ActionKinds).filter((value) => typeof value === "string")
  );
  return {
    role,
    root: resolved,
    ActionKinds,
    kindValues,
    hasKind(kind) {
      return kindValues.has(kind);
    },
    applyAction: loaded.actions.applyAction,
    createInitialState: loaded.init.createInitialState,
    serializeGameState: loaded.state.serializeGameState,
    deserializeGameState: loaded.state.deserializeGameState,
    createTimelineFromInitialState: loaded.timeline.createTimelineFromInitialState,
    appendActionAtCursor: loaded.timeline.appendActionAtCursor,
    rebuildStateAtSecond: loaded.timeline.rebuildStateAtSecond,
    getVassalCandidatePool: loaded.lifeMap.getVassalCandidatePool,
    getCurrentLifeMapVassal: loaded.lifeMap.getCurrentLifeMapVassal,
    getVassalLifeMapNodes: loaded.lifeMap.getVassalLifeMapNodes,
    getVassalNodeDecisionPresentation: loaded.lifeMap.getVassalNodeDecisionPresentation,
    stepDetailedSettlementsSecond: loaded.settlements.stepDetailedSettlementsSecond,
    getDetailedSettlement: loaded.settlements.getDetailedSettlement,
    buildProjectionChunkFromStateData: loaded.projection.buildProjectionChunkFromStateData,
    createRng: loaded.rng.createRng,
    VASSAL_LIFE_TUNING: loaded.defs.VASSAL_LIFE_TUNING,
    getVassalMortalityChance: loaded.defs.getVassalMortalityChance,
  };
}

export function kindSet(ActionKinds) {
  return new Set(
    Object.values(ActionKinds || {}).filter((value) => typeof value === "string")
  );
}

export function classifyActionKinds(baselineKinds, refactorKinds) {
  const baseline = kindSet(baselineKinds);
  const refactor = kindSet(refactorKinds);
  const shared = [...baseline].filter((kind) => refactor.has(kind)).sort();
  const baselineOnly = [...baseline].filter((kind) => !refactor.has(kind)).sort();
  const refactorOnly = [...refactor].filter((kind) => !baseline.has(kind)).sort();
  return { shared, baselineOnly, refactorOnly };
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function previewValue(value, limit = VALUE_PREVIEW_CHARS) {
  if (value === undefined) return { missing: true };
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.length > limit ? `${value.slice(0, limit)}…` : value;
  }
  try {
    const json = JSON.stringify(value);
    if (json == null) return String(value);
    if (json.length <= limit) return JSON.parse(json);
    return `${json.slice(0, limit)}…`;
  } catch {
    return String(value);
  }
}

function pushDiff(diffs, counted, path, expected, actual) {
  counted.count += 1;
  if (diffs.length < DIFF_LIMIT) {
    diffs.push({
      path: path || "$",
      expected: previewValue(expected),
      actual: previewValue(actual),
    });
  }
}

export function diffValues(expected, actual, path = "", diffs = [], counted = { count: 0 }) {
  if (Object.is(expected, actual)) return { diffs, count: counted.count };
  const expectedType = valueType(expected);
  const actualType = valueType(actual);
  if (expectedType !== actualType) {
    pushDiff(diffs, counted, path, expected, actual);
    return { diffs, count: counted.count };
  }
  if (expectedType === "array") {
    if (expected.length !== actual.length) {
      pushDiff(
        diffs,
        counted,
        path ? `${path}.length` : "length",
        expected.length,
        actual.length
      );
    }
    const n = Math.max(expected.length, actual.length);
    for (let i = 0; i < n; i += 1) {
      const child = `${path}[${i}]`;
      if (i >= expected.length) {
        pushDiff(diffs, counted, child, { missing: true }, actual[i]);
      } else if (i >= actual.length) {
        pushDiff(diffs, counted, child, expected[i], { missing: true });
      } else {
        diffValues(expected[i], actual[i], child, diffs, counted);
      }
    }
    return { diffs, count: counted.count };
  }
  if (expectedType === "object") {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) {
      const child = path ? `${path}.${key}` : key;
      const hasExpected = Object.prototype.hasOwnProperty.call(expected, key);
      const hasActual = Object.prototype.hasOwnProperty.call(actual, key);
      if (!hasExpected) {
        pushDiff(diffs, counted, child, { missing: true }, actual[key]);
      } else if (!hasActual) {
        pushDiff(diffs, counted, child, expected[key], { missing: true });
      } else {
        diffValues(expected[key], actual[key], child, diffs, counted);
      }
    }
    return { diffs, count: counted.count };
  }
  pushDiff(diffs, counted, path, expected, actual);
  return { diffs, count: counted.count };
}

export function statesEqual(expected, actual) {
  return diffValues(expected, actual).count === 0;
}

export function findRngSeed(api, predicate, limit = 10000) {
  for (let seed = 0; seed < limit; seed += 1) {
    if (predicate(api.createRng(seed).nextFloat(), seed)) return seed;
  }
  throw new Error("No deterministic RNG seed matched the predicate");
}

export function parseArgs(argv, scriptDir) {
  const defaults = resolveDefaultRoots(scriptDir);
  const args = {
    baseline: defaults.baseline,
    refactor: defaults.refactor,
    scenarios: [],
    seed: null,
    out: null,
    md: null,
    horizonSec: 24,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => {
      i += 1;
      return argv[i];
    };
    if (token === "--baseline") args.baseline = next();
    else if (token === "--refactor") args.refactor = next();
    else if (token === "--scenario") args.scenarios.push(next());
    else if (token === "--seed") args.seed = Number(next());
    else if (token === "--out") args.out = next();
    else if (token === "--md") args.md = next();
    else if (token === "--horizon") args.horizonSec = Number(next());
    else if (token === "--help" || token === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (args.seed != null && !Number.isFinite(args.seed)) {
    throw new Error("--seed must be a finite number");
  }
  if (!Number.isFinite(args.horizonSec) || args.horizonSec < 1) {
    args.horizonSec = 24;
  }
  args.horizonSec = Math.max(1, Math.floor(args.horizonSec));
  return args;
}

export function reproductionCommand(scriptRel, scenarioId, extra = {}) {
  const parts = ["node", scriptRel];
  if (scenarioId) parts.push("--scenario", scenarioId);
  if (Number.isFinite(extra.seed)) parts.push("--seed", String(extra.seed));
  return parts.join(" ");
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}
