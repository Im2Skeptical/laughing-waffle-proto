import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (!process.versions.node.startsWith("24.")) throw new Error("Generate these vectors with Node 24");

const bits = new DataView(new ArrayBuffer(8));
function toBits(value) {
  bits.setFloat64(0, value);
  return bits.getBigUint64(0);
}
function fromBits(value) {
  bits.setBigUint64(0, value);
  return bits.getFloat64(0);
}
function hex(value) {
  // ECMAScript has one NaN value. Keep every other bit pattern, including -0.
  return (Number.isNaN(value) ? 0x7ff8000000000000n : toBits(value)).toString(16).padStart(16, "0");
}

let word = 0x6bc491df;
function nextWord() {
  word ^= word << 13;
  word ^= word >>> 17;
  word ^= word << 5;
  return word >>> 0;
}
const unit = () => nextWord() / 0x100000000;
const randomBits = () => (BigInt(nextWord()) << 32n) | BigInt(nextWord());
const randomDouble = () => fromBits(randomBits());
const signed = (scale) => (2 * unit() - 1) * scale;
const count = 8192;
const sample = (make) => Array.from({ length: count }, (_, i) => make(i));
const adjacent = (x) => [-1n, 0n, 1n].map((offset) => fromBits(toBits(x) + offset));
const edges = [
  0, -0, Infinity, -Infinity, NaN,
  1, -1, 2, -2, 3, -3, 4, -4, 10, -10, 100, -100,
  0.5, -0.5, 1.5, -1.5, 2.5, -2.5,
  Number.MIN_VALUE, -Number.MIN_VALUE, 2 * Number.MIN_VALUE, -2 * Number.MIN_VALUE,
  fromBits(0x000fffffffffffffn), fromBits(0x800fffffffffffffn), 2 ** -1022, -(2 ** -1022),
  Number.MAX_VALUE, -Number.MAX_VALUE, 2 ** 31 - 1, 2 ** 31, 2 ** 32 - 1, 2 ** 32,
  2 ** 52 - 1, 2 ** 52, 2 ** 52 + 1, 2 ** 53 - 1, 2 ** 53, -(2 ** 53 - 1), -(2 ** 53),
  ...adjacent(1), ...adjacent(-1), ...adjacent(0.5), ...adjacent(-0.5),
];
const pairs = edges.flatMap((a) => edges.map((b) => [a, b]));

function powInputs() {
  return [
    ...pairs,
    ...sample(() => [randomDouble(), randomDouble()]),
    ...sample(() => [1 + 99 * unit(), 1000 * unit()]),
    ...sample((i) => [1 + unit() * (i % 2 ? 0.25 : 99), nextWord() % 1001]),
    ...sample((i) => [randomDouble(), i % 2 ? signed(4) : (nextWord() % 31) - 15]),
    ...sample(() => [1 + signed(2 ** -35), signed(2 ** 55)]),
  ];
}

// Run the same pow inputs with each V8 backend. The main process deliberately
// uses Node's default, while the child pins the portable fdlibm reference.
const power = powInputs();
function powerResult(a, b) {
  const expected = hex(Math.pow(a, b));
  if (hex(a ** b) !== expected) throw new Error(`Math.pow and ** differ for ${hex(a)} ${hex(b)}`);
  return expected;
}

if (process.argv[2] === "--legacy-pow") {
  process.stdout.write(power.map(([a, b]) => powerResult(a, b)).join("\n"));
} else {
  const legacy = execFileSync(process.execPath,
    ["--no-use-std-math-pow", fileURLToPath(import.meta.url), "--legacy-pow"],
    { encoding: "utf8" }).split("\n");
  if (legacy.length !== power.length) throw new Error("unexpected fdlibm pow vector count");

  const angles = [
    ...edges,
    ...[2 ** -27, Math.PI / 4, Math.PI / 2, Math.PI, 2 * Math.PI, 2 ** 19 * Math.PI / 2]
      .flatMap((x) => [...adjacent(x), ...adjacent(-x)]),
    ...sample(randomDouble),
    ...sample(() => signed(2 * Math.PI)),
    ...sample(() => signed(100)),
    ...sample(() => signed(2 ** 22)),
  ];
  const positiveInputs = [
    ...edges,
    ...Array.from({ length: 632 }, (_, i) => Number(`1e${i - 323}`))
      .flatMap((x) => adjacent(x)),
    ...sample(randomDouble),
    ...sample(() => fromBits(randomBits() & 0x7fffffffffffffffn)),
    ...sample(() => unit() * 10_000),
    ...sample(() => 1 + signed(2 ** -20)),
  ];
  const coordinates = [
    ...pairs,
    ...sample(() => [randomDouble(), randomDouble()]),
    ...sample(() => [signed(2), signed(2)]),
    ...sample((i) => {
      const scale = 2 ** ((i % 2098) - 1074);
      return [signed(scale), signed(scale)];
    }),
  ];
  const exponential = [
    ...edges,
    ...[Math.LN2 / 2, 1.5 * Math.LN2, 709.782712893384, -745.1332191019411]
      .flatMap((x) => [...adjacent(x), ...adjacent(-x)]),
    ...sample(randomDouble),
    ...sample(() => signed(1)),
    ...sample(() => signed(100)),
    ...sample(() => signed(750)),
  ];
  const entries = [
    ["pow", Math.pow, power, legacy],
    ["exp", Math.exp, exponential],
    ["log", Math.log, positiveInputs],
    ["log10", Math.log10, positiveInputs],
    ["sin", Math.sin, angles],
    ["cos", Math.cos, angles],
    ["atan2", Math.atan2, coordinates],
    ["hypot", Math.hypot, coordinates],
    ["sqrt", Math.sqrt, positiveInputs],
  ];
  const reference = `# ${process.version} V8 ${process.versions.v8} ${process.platform}-${process.arch}`;
  const sections = entries.map(([name, fn, inputs, alternative]) => {
    console.log(`${name} ${inputs.length}`);
    return [`${name} ${inputs.length}`, ...inputs.map((input, i) => {
      const args = Array.isArray(input) ? input : [input];
      const row = [...args.map(hex), alternative ? powerResult(...args) : hex(fn(...args))];
      if (alternative) row.push(alternative[i]);
      return row.join(" ");
    })].join("\n");
  });
  writeFileSync(new URL("js-math-vectors.txt", import.meta.url), [reference, ...sections, ""].join("\n"));
}
