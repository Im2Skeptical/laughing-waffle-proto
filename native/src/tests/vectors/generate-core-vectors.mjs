import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attachRngHelpers, createRng } from "../../../../src/model/rng.js";
import {
  canonicalJson, CHECKPOINTS, corpusFile, evaluateSeed, SEEDS, sha256Text, sha256Value,
} from "../../../reference/corpus-lib.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const bits = new DataView(new ArrayBuffer(8));
function floatHex(value) {
  if (Number.isNaN(value)) return "7ff8000000000000";
  bits.setFloat64(0, value);
  return bits.getBigUint64(0).toString(16).padStart(16, "0");
}
function fromBits(value) {
  bits.setBigUint64(0, value);
  return bits.getFloat64(0);
}

const numberEdges = [
  0, -0, Infinity, -Infinity, NaN, 1, -1,
  0.49999999999999994, 0.5, 0.5000000000000001,
  -0.49999999999999994, -0.5, -0.5000000000000001,
  1.5, -1.5, 4503599627370495.5, -4503599627370495.5,
  -0.1, 1.05, 1e-6, 1e-7, 1e20, 1e21, 1000000000000000100,
  2 ** 31 - 0.5, -(2 ** 31) - 0.5, 2 ** 32 + 0.5, -(2 ** 32) - 0.5,
  Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 2 ** 53 + 2, 2 ** 84 + 2 ** 32,
  Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE, 2 ** -1022,
];
const randomDoubles = [];
let randomWord = 0x6bc491df;
function nextWord() {
  randomWord ^= randomWord << 13;
  randomWord ^= randomWord >>> 17;
  randomWord ^= randomWord << 5;
  return BigInt(randomWord >>> 0);
}
for (let i = 0; i < 4096; ++i) {
  randomDoubles.push(fromBits((nextWord() << 32n) | nextWord()));
}
const powers = [];
for (let exponent = -323; exponent <= 308; ++exponent) {
  const center = BigInt("0x" + floatHex(Number("1e" + exponent)));
  for (const delta of [-1n, 0n, 1n]) powers.push(fromBits(center + delta));
}
const numberFormat = [...new Map([...numberEdges, ...powers, ...randomDoubles]
  .map((value) => [floatHex(value), String(value)]))];

const operands = [...numberEdges, ...randomDoubles.slice(0, 256)];
const operandPairs = [
  ...operands.map((a, i) => [a, operands[(i * 17 + 1) % operands.length]]),
  [-4, 2], [-3.5, -2], [-0, Infinity], [1, Infinity], [1, -0], [1, NaN], [Infinity, -1],
  [-1, -1], [-1, 32], [-1, 33.5], [-1, 2 ** 53 + 2], [0xffffffff, 0xffffffff], [0x7fffffff, 2],
];
const numberOps = operandPairs.map(([a, b]) => [
  floatHex(a), floatHex(b), a | 0, a >>> 0, Math.imul(a, b), a >>> b,
  ...[Math.round(a), Math.floor(a), Math.ceil(a), Math.trunc(a), Math.sign(a), a % b].map(floatHex),
]);
const decimalParse = [
  "-0", "0e-99999999999999999999999999", "-0e+99999999999999999999999999",
  "1.00000000000000011102230246251565404236316680908203125",
  "1.00000000000000011102230246251565404236316680908203126",
  "1.00000000000000033306690738754696212708950042724609375",
  "1.7976931348623158e308", "1.7976931348623159e308",
  "2.4703282292062327e-324", "2.4703282292062328e-324", "-1e-325",
  "2.2250738585072011e-308", "2.2250738585072012e-308", "-1e+99999999999999999999999999",
  "1e-99999999999999999999999999", "0." + "0".repeat(400) + "1e99",
  "1" + "0".repeat(400) + "e-100",
].map((text) => [text, floatHex(JSON.parse(text))]);

const jsonCases = [
  " null ",
  "\t[ true,  false,\r\n null, -0, 1.0, 1e-7, 1e999 ]",
  '{"a":0,"4294967295":1,"10":2,"2":3,"01":4,"4294967294":5,"0":6,"-0":7,"1e0":8,"a":9}',
  '{"\uE000":"BMP","\u{10000}":"astral","\\uD800":"lone","\u{10001}":"astral-2","\\uDC00":"low","é":{"z":1,"a":2}}',
  '{"__proto__":{"own":"prototype"},"nested":{"__proto__":null,"b":2,"a":1},"constructor":0}',
  '{"10":{},"2":[],"00":"non-index","1":"index","1.0":"non-index","18446744073709551615":-1}',
  JSON.stringify(Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join("") + '"\\/'),
  '["\\/","\\uD83D\\uDE00","\\uD800","\\uD800\\uD800\\uDC00","\\uDFFF","\\u2028","\\u2029","é","日本語"]',
];
const json = jsonCases.map((input) => {
  const value = JSON.parse(input);
  return [input, JSON.stringify(value), canonicalJson(value), sha256Value(value)];
});
const malformed = [
  "", "  ", "+1", "01", "-01", "1.", "1e", "1e+", ".1", "-", "1_0", "0x10", "NaN", "Infinity",
  "[1,]", "[1 2]", "[,1]", "{a:1}", "{'a':1}", '{"a" 1}', '{"x":1,}', '{"x":1 "y":2}',
  '"no close', '"\n"', '"\u0000"', '"\\', '"\\x00"', '"\\u0ZE0"', '"\\u00"',
  "true false", "null1", "null\0", "\ufeff{}", "\u00a0{}", "/* comment */null",
].map((input) => {
  try { JSON.parse(input); } catch (error) {
    if (error instanceof SyntaxError) return input;
    throw error;
  }
  throw new Error("expected invalid JSON: " + JSON.stringify(input));
});
const textHashes = ["", "abc", "笑\0😀",
  ...[55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 10000].map((length) => "x".repeat(length)),
].map((input) => [input, sha256Text(input)]);

const streams = [
  ["seed", "rngNextFloat", "rngNextInt"],
  ["vassalSeed", "rngNextVassalFloat", "rngNextVassalInt"],
  ["vassalDevelopmentSeed", "rngNextVassalDevelopmentFloat", "rngNextVassalDevelopmentInt"],
  ["vassalLifeMapSeed", "rngNextVassalLifeMapFloat", "rngNextVassalLifeMapInt"],
  ["vassalPortraitSeed", "rngNextVassalPortraitFloat", "rngNextVassalPortraitInt"],
];
const rngBounds = [
  [-9, 32], [-4.75, 2.8], [5, 1], [-0, -0], [-0.9, -0.1], [-2147483648, 2147483647],
  [9007199254740985, 9007199254741000], [-1e308, 1e308], [-Infinity, 0], [NaN, Infinity],
  [0.2, 0.8], [-897.9, -896.1],
];
const batchSize = 1000;
const rng = [];
for (const seed of [0, 42, -100.875, 4294967295, 2 ** 53 - 10, 2 ** 65, NaN, Infinity, -0]) {
  for (const [stream, floatMethod, intMethod] of [...streams, ["standalone", "nextFloat", "nextInt"]]) {
    for (const [helper, method] of [["float", floatMethod], ["int", intMethod]]) {
      const state = { rng: {
        seed: 11, baseSeed: 1867, vassalSeed: 22, vassalDevelopmentSeed: 33,
        vassalLifeMapSeed: 44, vassalPortraitSeed: 55,
      } };
      let generator;
      if (stream === "standalone") {
        generator = createRng(seed);
      } else {
        state.rng[stream] = seed >>> 0;
        attachRngHelpers(state);
        generator = state;
      }
      const batches = [];
      for (let batch = 0; batch < 10; ++batch) {
        let output = "";
        for (let i = 0; i < batchSize; ++i) {
          const bounds = rngBounds[(batch * batchSize + i) % rngBounds.length];
          output += floatHex(helper === "float" ? generator[method]() : generator[method](...bounds));
        }
        batches.push([sha256Text(output), stream === "standalone" ? null : JSON.stringify(state.rng)]);
      }
      rng.push([stream, helper, floatHex(seed), floatHex(Math.floor(seed) >>> 0), batches]);
    }
  }
}

function writeVectors() {
  const sections = {
    numberFormat, numberOps, decimalParse, json, malformed, textHashes,
    rngBounds: rngBounds.map((bounds) => bounds.map(floatHex)), batchSize, rng,
  };
  const lines = Object.entries(sections).map(([name, value]) => Array.isArray(value)
    ? "  " + JSON.stringify(name) + ": [\n" + value.map((row) => "    " + JSON.stringify(row)).join(",\n") + "\n  ]"
    : "  " + JSON.stringify(name) + ": " + JSON.stringify(value));
  writeFileSync(join(here, "core-vectors.json"), "{\n" + lines.join(",\n") + "\n}\n");
}

function writeStates(outputDir, all) {
  mkdirSync(outputDir, { recursive: true });
  const entries = [];
  for (const seed of all ? SEEDS : SEEDS.slice(0, 1)) {
    const result = evaluateSeed(seed);
    if (!result.ok) throw new Error("browser replay or continuation failed for seed " + seed);
    const pinned = JSON.parse(readFileSync(corpusFile(seed), "utf8"));
    for (const checkpoint of all ? CHECKPOINTS : CHECKPOINTS.slice(0, 1)) {
      const { id } = checkpoint;
      const state = result.snapshots[id];
      const expected = sha256Value(state);
      const pinnedHash = pinned.checkpoints.find((entry) => entry.id === id).fullStateSha256;
      if (expected !== pinnedHash)
        throw new Error("seed " + seed + " " + id + " differs from corpus: " + expected + " vs " + pinnedHash);
      const file = "seed-" + seed + "-" + id + ".json";
      writeFileSync(join(outputDir, file), JSON.stringify(state));
      entries.push({ file, sha256: expected });
    }
  }
  writeFileSync(join(outputDir, "core-states.json"), JSON.stringify(entries, null, 2) + "\n");
  console.log("Captured " + entries.length + " state(s) matching the pinned corpus.");
}

const args = process.argv.slice(2);
if (args.length === 0) {
  writeStates(here, false);
  writeVectors();
} else if (args.length === 2 && args[0] === "--full") {
  writeStates(resolve(args[1]), true);
} else {
  throw new Error("usage: node generate-core-vectors.mjs [--full OUTPUT_DIRECTORY]");
}
