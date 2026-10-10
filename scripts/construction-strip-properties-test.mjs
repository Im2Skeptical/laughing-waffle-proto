// Pure strip geometry only: no GameState, RNG, ticks, or replay.
// Public names are occupiedCells, validateStructureLayout, canPlace,
// applyBuild, applyDemolish, and projectStructureDraft (no applyMove).
// Expectations use authored intervals, not occupiedCells. node scripts/construction-strip-properties-test.mjs
import fs from "node:fs";
import path from "node:path";
import { applyBuild, applyDemolish, canPlace, occupiedCells, projectStructureDraft, validateStructureLayout } from "../src/model/structure-layout.js";

const ARTIFACT = path.resolve("artifacts/construction-strip-properties/first-difference.json");
const REPRO = "node scripts/construction-strip-properties-test.mjs";
const CAPACITIES = [5, 6, 7, 8];
let cases = 0;
let failures = 0;
let first = null;

function preview(value) {
  const text = JSON.stringify(value);
  if (typeof text !== "string") return String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function firstDifference(actual, expected, pathName = "$") {
  if (Object.is(actual, expected)) return null;
  const objects = actual != null && expected != null && typeof actual === "object" && typeof expected === "object";
  if (!objects) return { path: pathName, actual: preview(actual), expected: preview(expected) };
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      return { path: pathName, actual: preview(actual), expected: preview(expected) };
    }
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstDifference(actual[index], expected[index], `${pathName}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  for (const key of [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort()) {
    const next = `${pathName}.${key}`;
    if (!Object.prototype.hasOwnProperty.call(actual, key)) return { path: next, actual: "missing", expected: preview(expected[key]) };
    if (!Object.prototype.hasOwnProperty.call(expected, key)) return { path: next, actual: preview(actual[key]), expected: "missing" };
    const difference = firstDifference(actual[key], expected[key], next);
    if (difference) return difference;
  }
  return null;
}

function record(label, difference) {
  failures += 1;
  if (first) return;
  first = { label, difference, repro: REPRO, scope: "pure placement geometry; no GameState replay" };
  fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  fs.writeFileSync(ARTIFACT, JSON.stringify(first, null, 2));
}

function scenario(label, fn) {
  cases += 1;
  try {
    fn((actual, expected) => {
      const difference = firstDifference(actual, expected);
      if (!difference) return;
      record(label, difference);
      throw new Error("mismatch");
    });
  } catch (error) {
    if (error.message !== "mismatch") record(label, { path: "$throw", actual: preview(error.message), expected: "no throw" });
  }
}

function blank(capacity) {
  return Object.freeze(Array.from({ length: capacity }, () => null));
}

function piece(capacity, origin, width, salt, construction = true) {
  const placement = {
    structureId: "storehouse",
    placementId: `c${capacity}-o${origin}-w${width}-${salt}`,
    origin, width,
    qualityBonus: width - 1,
  };
  if (construction) placement.construction = Object.freeze({ completedCycles: origin + width });
  return Object.freeze(placement);
}

function overlaps(a, b) {
  return a.origin < b.origin + b.width && b.origin < a.origin + a.width;
}

function inStrip(capacity, origin, width) {
  return Number.isInteger(origin) && Number.isInteger(width) && width >= 1 && width <= 3 && origin >= 0 && origin + width <= capacity;
}

function expectedSlots(capacity, placements) {
  const slots = Array.from({ length: capacity }, () => null);
  for (const placement of placements) {
    slots[placement.origin] = {
      structureId: placement.structureId, placementId: placement.placementId,
      origin: placement.origin, width: placement.width, qualityBonus: placement.qualityBonus,
      ...(placement.construction ? { construction: { completedCycles: placement.construction.completedCycles } } : {}),
    };
  }
  return slots;
}
function expectedCellIds(capacity, placements) {
  const ids = Array.from({ length: capacity }, () => null);
  for (const placement of placements) {
    for (let cell = placement.origin; cell < placement.origin + placement.width; cell += 1) ids[cell] = placement.placementId;
  }
  return ids;
}

function cellIds(slots) {
  return occupiedCells(slots).map((placement) => placement?.placementId ?? null);
}

function unchanged(eq, slots, json, identities) {
  eq(JSON.parse(JSON.stringify(slots)), JSON.parse(json));
  eq(slots.slice(), identities);
}

function acceptBoard(eq, capacity, placements, slots) {
  eq(slots, expectedSlots(capacity, placements));
  eq(cellIds(slots), expectedCellIds(capacity, placements));
  eq(validateStructureLayout(slots, capacity), { ok: true, errors: [] });
  eq(JSON.parse(JSON.stringify(slots)), slots);
}

const shapes = new Map(CAPACITIES.map((capacity) => {
  const list = [];
  for (let width = 1; width <= 3; width += 1) {
    for (let origin = 0; origin <= capacity - width; origin += 1) list.push({ origin, width });
  }
  return [capacity, list];
}));

scenario("comparator sees construction and extra fields", (eq) => {
  eq(firstDifference({ placementId: "a", construction: { completedCycles: 1 } }, { placementId: "a", construction: { completedCycles: 2 } })?.path, "$.construction.completedCycles");
  eq(firstDifference({ placementId: "a", qualityBonus: 1 }, { placementId: "a" })?.path, "$.qualityBonus");
});

for (const capacity of CAPACITIES) {
  scenario(`empty c${capacity}`, (eq) => {
    const slots = blank(capacity);
    eq(validateStructureLayout(slots, capacity), { ok: true, errors: [] });
    eq(cellIds(slots), expectedCellIds(capacity, []));
  });

  for (const shape of shapes.get(capacity)) {
    const placement = piece(capacity, shape.origin, shape.width, "one");
    scenario(`build c${capacity} o${shape.origin} w${shape.width}`, (eq) => {
      const slots = blank(capacity);
      const before = JSON.stringify(slots);
      const ids = slots.map((entry) => entry);
      eq(canPlace(slots, placement.width, placement.origin), { ok: true, demolished: [] });
      const built = applyBuild(slots, placement);
      eq(built, { ok: true, slots: expectedSlots(capacity, [placement]), demolished: [] });
      acceptBoard(eq, capacity, [placement], built.slots);
      unchanged(eq, slots, before, ids);
      eq(placement.construction.completedCycles, shape.origin + shape.width);
    });
  }

  for (const origin of [-1, 0, capacity - 1, capacity, 1.5]) {
    for (const width of [0, 1, 2, 3, 4, 1.5]) {
      if (inStrip(capacity, origin, width)) continue;
      scenario(`reject c${capacity} o${origin} w${width}`, (eq) => {
        const slots = blank(capacity);
        const before = JSON.stringify(slots);
        const placement = { structureId: "storehouse", placementId: "bad-range", origin, width, qualityBonus: 0 };
        eq(canPlace(slots, width, origin), { ok: false, reason: "outsideConstructionStrip" });
        eq(applyBuild(slots, placement), { ok: false, reason: "outsideConstructionStrip" });
        unchanged(eq, slots, before, slots.map((entry) => entry));
      });
    }
  }
}

for (const capacity of CAPACITIES) {
  const list = shapes.get(capacity);
  for (let i = 0; i < list.length; i += 1) {
    for (let j = 0; j < list.length; j += 1) {
      if (i === j) continue;
      const firstPiece = piece(capacity, list[i].origin, list[i].width, "a");
      const secondPiece = piece(capacity, list[j].origin, list[j].width, "b");
      scenario(`pair c${capacity} ${i}-${j}`, (eq) => {
        const start = blank(capacity);
        const built = applyBuild(start, firstPiece);
        const mid = built.slots;
        const midJson = JSON.stringify(mid);
        const midIds = mid.map((entry) => entry);
        if (overlaps(firstPiece, secondPiece)) {
          eq(canPlace(mid, secondPiece.width, secondPiece.origin), { ok: false, reason: "structureOccupied" });
          eq(applyBuild(mid, secondPiece), { ok: false, reason: "structureOccupied" });
          unchanged(eq, mid, midJson, midIds);
          return;
        }
        const both = applyBuild(mid, secondPiece);
        eq(both.ok, true);
        acceptBoard(eq, capacity, [firstPiece, secondPiece], both.slots);
        eq(both.slots.filter(Boolean).map((entry) => entry.structureId), ["storehouse", "storehouse"]);
        unchanged(eq, mid, midJson, midIds);
        unchanged(eq, start, JSON.stringify(start), start.map((entry) => entry));
      });
    }
  }
}

const triples = {
  5: [[0, 1], [1, 1], [2, 3]],
  6: [[0, 2], [2, 2], [4, 2]],
  7: [[0, 3], [3, 1], [4, 3]],
  8: [[0, 1], [1, 3], [5, 3]],
};

for (const capacity of CAPACITIES) {
  const placements = triples[capacity].map(([origin, width], index) => piece(capacity, origin, width, `t${index}`));
  scenario(`triple c${capacity}`, (eq) => {
    let slots = blank(capacity);
    for (const placement of placements) {
      const built = applyBuild(slots, placement);
      eq(built.ok, true);
      slots = built.slots;
    }
    acceptBoard(eq, capacity, placements, slots);
    const removed = applyDemolish(slots, [placements[1].placementId]);
    const kept = [placements[0], placements[2]];
    acceptBoard(eq, capacity, kept, removed);
    eq(JSON.parse(JSON.stringify(slots)), expectedSlots(capacity, placements));
    const draft = projectStructureDraft(slots, [], [{ placementId: placements[1].placementId, origin: null }]);
    eq(draft, { ok: true, slots: expectedSlots(capacity, kept), stagedIds: [], demolished: [placements[1]] });
  });

  scenario(`triple overlap rejected c${capacity}`, (eq) => {
    const left = piece(capacity, 0, 2, "ov-a");
    const clash = piece(capacity, 1, 2, "ov-b");
    const tailOrigin = capacity - 1;
    const tail = piece(capacity, tailOrigin, 1, "ov-c");
    const firstBuilt = applyBuild(blank(capacity), left);
    const midJson = JSON.stringify(firstBuilt.slots);
    eq(applyBuild(firstBuilt.slots, clash), { ok: false, reason: "structureOccupied" });
    eq(JSON.parse(midJson), expectedSlots(capacity, [left]));
    const withTail = applyBuild(firstBuilt.slots, tail);
    eq(withTail.ok, true);
    acceptBoard(eq, capacity, [left, tail], withTail.slots);
  });

  scenario(`move and remove c${capacity}`, (eq) => {
    const left = piece(capacity, 0, 2, "L");
    const right = piece(capacity, capacity - 1, 1, "R");
    const confirmed = applyBuild(applyBuild(blank(capacity), left).slots, right).slots;
    const confirmedJson = JSON.stringify(confirmed);
    const confirmedIds = confirmed.map((entry) => entry);
    for (let origin = 0; origin <= capacity - left.width; origin += 1) {
      const trial = { ...left, origin };
      if (overlaps(trial, right)) continue;
      const moved = projectStructureDraft(confirmed, [], [{ placementId: left.placementId, origin }]);
      const movedLeft = { ...left, origin };
      eq(moved, { ok: true, slots: expectedSlots(capacity, [movedLeft, right]), stagedIds: [], demolished: [] });
      eq(moved.slots[origin].placementId, left.placementId);
      eq(moved.slots[origin].qualityBonus, left.qualityBonus);
      eq(moved.slots[origin].construction, { completedCycles: left.construction.completedCycles });
      eq(moved.slots[right.origin], expectedSlots(capacity, [right])[right.origin]);
    }
    const cleared = applyDemolish(confirmed, [left.placementId]);
    acceptBoard(eq, capacity, [right], cleared);
    eq(applyDemolish(confirmed, ["missing-placement"]), expectedSlots(capacity, [left, right]));
    unchanged(eq, confirmed, confirmedJson, confirmedIds);
  });
}

function patched(capacity, placement, fields) {
  const slots = expectedSlots(capacity, [placement]);
  slots[placement.origin] = { ...slots[placement.origin], ...fields };
  return slots;
}

scenario("identity, footprint, and construction negatives", (eq) => {
  const capacity = 6;
  const good = piece(capacity, 0, 1, "neg");
  const other = piece(capacity, 2, 1, "neg2");
  const same = [{ ...good, placementId: "same" }, { ...other, placementId: "same" }];
  eq(validateStructureLayout(expectedSlots(capacity, same), capacity), { ok: false, errors: ["invalidPlacementIdentity"] });
  eq(validateStructureLayout(patched(capacity, good, { placementId: "" }), capacity), { ok: false, errors: ["invalidPlacementIdentity"] });
  eq(validateStructureLayout(patched(capacity, good, { width: 4 }), capacity), { ok: false, errors: ["invalidFootprint"] });
  eq(validateStructureLayout(patched(capacity, good, { origin: 1 }), capacity), { ok: false, errors: ["invalidFootprint"] });
  eq(validateStructureLayout(expectedSlots(capacity, [piece(capacity, 0, 2, "cover"), piece(capacity, 1, 1, "under")]), capacity), { ok: false, errors: ["overlap"] });
  for (const construction of [{ completedCycles: -1 }, { completedCycles: 1.5 }, {}]) {
    eq(validateStructureLayout(patched(capacity, good, { construction }), capacity), { ok: false, errors: ["invalidConstructionProgress"] });
  }
  eq(validateStructureLayout(blank(5), 6), { ok: false, errors: ["capacityMismatch"] });
  eq(validateStructureLayout(expectedSlots(capacity, [piece(capacity, 3, 2, "opt", false)]), capacity), { ok: true, errors: [] });
  const slots = blank(capacity);
  eq(applyBuild(slots, { ...good, placementId: "" }), { ok: false, reason: "duplicatePlacementIdentity" });
  eq(applyBuild(applyBuild(slots, good).slots, { ...other, placementId: good.placementId }), { ok: false, reason: "duplicatePlacementIdentity" });
  unchanged(eq, slots, JSON.stringify(slots), slots.map((entry) => entry));
});

const summary = failures
  ? `construction-strip-properties FAIL cases=${cases} failures=${failures} field=${first.difference.path} expected=${first.difference.expected} actual=${first.difference.actual} repro=${REPRO} artifact=artifacts/construction-strip-properties/first-difference.json`
  : `construction-strip-properties OK cases=${cases} failures=0 scope=pure-placement-geometry`;
console.log(summary);
if (failures || cases >= 2000) process.exit(1);
