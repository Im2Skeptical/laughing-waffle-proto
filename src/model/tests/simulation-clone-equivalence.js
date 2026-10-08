// The detailed-settlement hot paths copy data without a JSON or structured
// clone round trip. These copies must be indistinguishable from the round
// trips they replace, or replay/forecast determinism would drift.
import assert from "node:assert/strict";
import { clone } from "../detailed-settlements/helpers.js";
import { splitSpecialistCohorts } from "../detailed-settlements/cohorts.js";

const jsonRoundTrip = value => JSON.parse(JSON.stringify(value));
const sameJson = (actual, expected, label) => {
  assert.deepStrictEqual(actual, expected, label);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${label}: text`);
};

const shared = { a: 1 };
const protoKey = JSON.parse('{"__proto__":{"polluted":true},"x":1}');
const cases = [
  0, -0, 1.5, NaN, Infinity, -Infinity, "s", true, null,
  [1, -0, NaN, undefined, () => 1, Symbol("x"), null, [2, [3]]],
  // eslint-disable-next-line no-sparse-arrays
  [1, , 3],
  { b: 2, a: 1, 10: "n", 2: "m", u: undefined, f() {}, s: Symbol("y"), n: NaN, z: -0, i: -Infinity },
  { nested: { list: [{ x: 1.1 }, { y: [0.1 + 0.2] }] }, again: shared, same: shared },
  protoKey,
  Object.assign(Object.create(null), { k: 1 }),
  { date: new Date(0), map: new Map([[1, 2]]), set: new Set([1]) },
  { withToJSON: { toJSON: () => ({ replaced: true }) } },
  [new Uint8Array([1, 2])],
  { big: undefined, deeper: { arr: [undefined, { u: undefined }] } },
];
for (const [index, value] of cases.entries()) {
  const label = `clone case ${index}`;
  const actual = clone(value);
  sameJson(actual, jsonRoundTrip(value), label);
  if (actual && typeof actual === "object") assert.notEqual(actual, value, `${label}: fresh object`);
}
const cloned = clone(cases[12]);
assert.notEqual(cloned.again, cloned.same, "clone does not preserve aliasing (JSON semantics)");
assert.equal(Object.getPrototypeOf(clone(protoKey)), Object.prototype);
assert.equal(clone(protoKey).polluted, undefined, "__proto__ stays an own data key");
assert.deepStrictEqual(Object.keys(clone(protoKey)), ["__proto__", "x"]);
assert.throws(() => clone(undefined), SyntaxError, "top-level undefined still throws like the JSON round trip");
assert.throws(() => clone(1n), TypeError, "bigint still throws like JSON.stringify");
const cyclic = { a: 1 }; cyclic.self = cyclic;
assert.throws(() => clone(cyclic), TypeError, "cycles still throw like JSON.stringify");

// splitSpecialistCohorts replaced structuredClone with a plain-data copy.
const sharedElder = { age: 71, count: 1 };
// eslint-disable-next-line no-sparse-arrays
const sparse = [1, , 3];
const scholar = {
  children: 1, adults: 2,
  eldersByAge: [{ age: 70, count: 0.1 + 0.2, z: -0, n: NaN, missing: undefined }, sharedElder, sharedElder],
  extra: { sparse, again: sparse },
};
scholar.extra.self = scholar.extra;
const cohort = { children: 3, adults: 7, eldersByAge: [{ age: 60, count: 2 }, { age: 70, count: 5 }], specialists: { scholar } };
const split = splitSpecialistCohorts(cohort);
const expected = structuredClone(scholar);
assert.deepStrictEqual(split.scholar, expected);
const copy = split.scholar;
assert.ok(Object.is(copy.eldersByAge[0].z, -0), "-0 preserved like structuredClone");
assert.ok(Number.isNaN(copy.eldersByAge[0].n), "NaN preserved like structuredClone");
assert.ok("missing" in copy.eldersByAge[0], "undefined keys preserved like structuredClone");
assert.equal(1 in copy.extra.sparse, false, "holes preserved like structuredClone");
assert.equal(copy.eldersByAge[1], copy.eldersByAge[2], "shared references preserved like structuredClone");
assert.equal(copy.extra.sparse, copy.extra.again, "shared arrays preserved like structuredClone");
assert.equal(copy.extra.self, copy.extra, "cycles preserved like structuredClone");
assert.notEqual(copy, scholar);
assert.notEqual(copy.eldersByAge[1], sharedElder);
copy.eldersByAge[0].count = 99;
assert.equal(scholar.eldersByAge[0].count, 0.1 + 0.2, "split parts are independent of the source");
assert.notEqual(split.ordinary.eldersByAge, cohort.eldersByAge);
const plain = splitSpecialistCohorts({ children: 1, adults: 4, eldersByAge: [{ age: 66, count: 3 }] });
assert.deepStrictEqual(plain.ordinary, { children: 1, adults: 4, eldersByAge: [{ age: 66, count: 3 }] });
const exotic = splitSpecialistCohorts({ children: 0, adults: 0, eldersByAge: [], specialists: { scholar: { children: 0, adults: 0, eldersByAge: [], when: new Date(5) } } });
assert.ok(exotic.scholar.when instanceof Date, "non-plain values fall back to structuredClone");

console.log("simulation clone equivalence: ok");
