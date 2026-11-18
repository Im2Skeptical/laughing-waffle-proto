import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const HASHES_FILE = "hashes.tsv";
export const HASHES_HEADER = "tSec\tsha256";
export const stateFile = (sec) => "state-" + sec + ".json";

const MISSING = Symbol("missing");
const DISPLAY_LIMIT = 8;

function type(value) {
  if (value === MISSING) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function preview(value) {
  if (value === MISSING) return "<missing>";
  const text = JSON.stringify(value);
  return text.length > 160 ? text.slice(0, 157) + "..." : text;
}

function leafCount(value) {
  if (value === MISSING) return 0;
  if (value === null || typeof value !== "object") return 1;
  // An empty container still represents a value at its path.
  return Object.values(value).reduce((count, child) => count + leafCount(child), 0) || 1;
}

function propertyPath(parent, key) {
  return /^[A-Za-z_$][\w$]*$/u.test(key)
    ? parent + "." + key
    : parent + "[" + JSON.stringify(key) + "]";
}

export function diffStates(expected, actual) {
  const entries = [];
  let differingLeaves = 0;

  function walk(path, parent, left, right) {
    // As in the hash, signed zero has one JSON representation.
    if (left === right) return;
    const leftType = type(left);
    if (leftType === "array" && leftType === type(right)) {
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        walk(path + "[" + index + "]", path,
          index < left.length ? left[index] : MISSING,
          index < right.length ? right[index] : MISSING);
      }
      return;
    }
    if (leftType === "object" && leftType === type(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        walk(propertyPath(path, key), path,
          Object.hasOwn(left, key) ? left[key] : MISSING,
          Object.hasOwn(right, key) ? right[key] : MISSING);
      }
      return;
    }
    differingLeaves += Math.max(leafCount(left), leafCount(right));
    if (entries.length < DISPLAY_LIMIT) {
      entries.push({ path, parent, expected: preview(left), actual: preview(right) });
    }
  }

  walk("$", null, expected, actual);
  return { differingLeaves, entries };
}

export function formatStateDiff({ differingLeaves, entries }) {
  if (!differingLeaves) return "State values match.";
  return [
    differingLeaves + " differing leaves (showing up to " + DISPLAY_LIMIT + " paths).",
    ...entries.map(({ path, parent, expected, actual }) =>
      path + (parent ? " in " + parent : "") + ": expected " + expected + ", actual " + actual),
  ].join("\n");
}

function readHashes(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  if (lines.shift() !== HASHES_HEADER || lines.pop() !== "" || !lines.length) {
    throw new Error(file + ": expected a header, data rows, and a final LF.");
  }
  let previous;
  return lines.map((line, index) => {
    const match = /^(0|[1-9]\d*)\t([0-9a-f]{64})$/u.exec(line);
    const sec = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(sec) || (previous !== undefined && sec !== previous + 1)) {
      throw new Error(file + ": invalid hash row at line " + (index + 2) + ".");
    }
    previous = sec;
    return { sec, hash: match[2] };
  });
}

function firstTraceDiff(leftRows, rightRows) {
  for (let index = 0; index < Math.max(leftRows.length, rightRows.length); index += 1) {
    const left = leftRows[index];
    const right = rightRows[index];
    if (left?.sec === right?.sec && left.hash === right.hash) continue;
    const sec = Math.min(left?.sec ?? Infinity, right?.sec ?? Infinity);
    return {
      sec,
      expected: left?.sec === sec ? left.hash : "<missing>",
      actual: right?.sec === sec ? right.hash : "<missing>",
    };
  }
  return null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function compareInputs(left, right) {
  const leftDir = statSync(left).isDirectory();
  const rightDir = statSync(right).isDirectory();
  if (!leftDir && !rightDir) {
    const diff = diffStates(readJson(left), readJson(right));
    console.log(formatStateDiff(diff));
    return diff.differingLeaves ? 1 : 0;
  }

  const leftRows = readHashes(leftDir ? join(left, HASHES_FILE) : left);
  const rightRows = readHashes(rightDir ? join(right, HASHES_FILE) : right);
  const mismatch = firstTraceDiff(leftRows, rightRows);
  if (!mismatch) {
    console.log("Trace hashes match at all " + leftRows.length + " seconds.");
    return 0;
  }
  const { sec, expected, actual } = mismatch;
  console.log("First divergent second " + sec + ": expected " + expected + ", actual " + actual);
  const name = stateFile(sec);
  if (leftDir && rightDir && existsSync(join(left, name)) && existsSync(join(right, name))) {
    console.log(formatStateDiff(diffStates(readJson(join(left, name)), readJson(join(right, name)))));
  } else {
    console.log("Path diff requires " + name + " from both traces.");
  }
  return 1;
}

function selfTest() {
  const state = { rng: { seed: 42 }, world: { slots: [{ stock: 3 }, { stock: 5 }], optional: null } };
  const cases = [
    ["RNG seed", (copy) => { copy.rng.seed += 1; }, "$.rng.seed", 1],
    ["nested number", (copy) => { copy.world.slots[0].stock += 1; }, "$.world.slots[0].stock", 1],
    ["array order", (copy) => { copy.world.slots.reverse(); }, "$.world.slots[0].stock", 2],
    ["key presence", (copy) => { delete copy.world.optional; }, "$.world.optional", 1],
  ];
  assert.equal(diffStates(state, { world: state.world, rng: state.rng }).differingLeaves, 0);
  for (const [label, inject, path, count] of cases) {
    const changed = structuredClone(state);
    inject(changed);
    const result = diffStates(state, changed);
    assert.equal(result.entries[0]?.path, path);
    assert.equal(result.differingLeaves, count);
    console.log(label + ": " + path + " (" + count + ")");
  }
  const capped = diffStates([], Array.from({ length: 20 }, (_, index) => index));
  assert.equal(capped.differingLeaves, 20);
  assert.equal(capped.entries.length, DISPLAY_LIMIT);
  assert.deepEqual(firstTraceDiff(
    [{ sec: 8, hash: "a" }, { sec: 9, hash: "b" }],
    [{ sec: 8, hash: "a" }, { sec: 9, hash: "c" }],
  ), { sec: 9, expected: "b", actual: "c" });
  console.log("Differ controls passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  try {
    if (args.length === 1 && args[0] === "--self-test") selfTest();
    else if (args.length === 2) process.exitCode = compareInputs(...args);
    else throw new Error("Usage: node native/reference/diff.mjs <expected> <actual> | --self-test");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
