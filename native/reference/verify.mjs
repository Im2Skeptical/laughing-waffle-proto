// Regression check against the frozen browser reference.
// Does not write corpus files. --write is rejected so validation cannot regenerate goldens.
// Verifier controls mutate an in-memory sample. They are not production mutants.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARTIFACT_DIR,
  BASELINE_COMMIT,
  CHECKPOINTS,
  SEEDS,
  compareRecord,
  corpusFile,
  evaluateSeed,
  readRunnerSaveSchema,
  runVerifierControls,
  sha256Value,
} from "./corpus-lib.mjs";

if (process.argv.includes("--write")) {
  console.log("verify does not write expectations. Use native/reference/generate.mjs --write.");
  process.exit(2);
}

const controls = runVerifierControls();
const failures = [];
const counts = {
  seeds: 0,
  checkpoints: 0,
  semanticComparisons: 0,
  fullStateHashComparisons: 0,
  engineEqualities: 0,
  rawSnapshotsMatched: 0,
};

function note(seed, failure) {
  const diff = failure.diffs[0];
  failures.push({
    seed,
    label: failure.label,
    path: diff?.path ?? "",
    expected: diff?.expected ?? null,
    actual: diff?.actual ?? null,
  });
}

for (const seed of SEEDS) {
  let expected;
  try {
    expected = JSON.parse(readFileSync(corpusFile(seed), "utf8"));
  } catch (error) {
    note(seed, { label: "read-corpus", diffs: [{ path: corpusFile(seed), expected: "seed file", actual: error.message }] });
    continue;
  }
  const actual = evaluateSeed(seed);
  counts.seeds += 1;
  counts.engineEqualities += actual.comparisons ?? 0;
  if (!actual.ok) {
    for (const failure of actual.failures) note(seed, failure);
  }
  for (const failure of compareRecord(expected, actual.record)) note(seed, failure);
  counts.checkpoints += CHECKPOINTS.length;
  counts.semanticComparisons += CHECKPOINTS.length;
  counts.fullStateHashComparisons += CHECKPOINTS.length;
  if (actual.snapshots) {
    for (const checkpoint of CHECKPOINTS) {
      const file = join(ARTIFACT_DIR, "full", `seed-${seed}-${checkpoint.id}.json`);
      try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        const expectedHash = expected.checkpoints.find((entry) => entry.id === checkpoint.id)?.fullStateSha256;
        const actualHash = sha256Value(raw);
        if (actualHash !== expectedHash) {
          note(seed, { label: `raw-snapshot-${checkpoint.id}`, diffs: [{ path: file, expected: expectedHash, actual: actualHash }] });
        } else counts.rawSnapshotsMatched += 1;
      } catch (error) {
        if (error.code !== "ENOENT") note(seed, { label: `raw-snapshot-${checkpoint.id}`, diffs: [{ path: file, expected: "readable snapshot or absence", actual: error.message }] });
      }
    }
  }
}

if (!controls.ok) {
  note("control", {
    label: "verifier-controls",
    diffs: [{ path: "controls", expected: "rng, cohort and stock detected", actual: JSON.stringify(controls.cases) }],
  });
}

let manifest = null;
try {
  manifest = JSON.parse(readFileSync(join(corpusFile(1), "..", "manifest.json"), "utf8"));
} catch {
  manifest = null;
}
if (!manifest || manifest.baselineCommit !== BASELINE_COMMIT || manifest.crossLanguageParity !== false) {
  note("manifest", {
    label: "manifest",
    diffs: [{ path: "baseline-or-parity-flag", expected: BASELINE_COMMIT, actual: manifest?.baselineCommit ?? "missing" }],
  });
}

const summary = {
  kind: "browser-regression-reference",
  crossLanguageParity: false,
  baselineCommit: BASELINE_COMMIT,
  gitHeadIsGate: false,
  packageVersionIsGate: false,
  runnerSaveSourceConstant: readRunnerSaveSchema(),
  runnerSaveRecorded: manifest?.schemasCaptured?.runnerSaveSourceConstant ?? null,
  counts,
  verifierControls: controls,
  failures,
  ok: failures.length === 0,
};

try {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, "verify-result.json"), `${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  console.log(`verify log was not written: ${error.message}`);
}

console.log(`browser regression reference: ${summary.ok ? "pass" : "FAIL"}`);
console.log(`seeds ${counts.seeds}, checkpoints ${counts.checkpoints}, semantic ${counts.semanticComparisons}, full-state hashes ${counts.fullStateHashComparisons}, engine full-state equalities ${counts.engineEqualities}, raw snapshots matched ${counts.rawSnapshotsMatched}`);
console.log(`verifier controls: ${controls.cases.filter((entry) => entry.detected).length}/${controls.cases.length} detected, unchanged diffs ${controls.unchangedDiffs}, production mutants 0`);
console.log("cross-language parity: not claimed");
if (!summary.ok) {
  for (const failure of failures.slice(0, 12)) {
    console.log(`${failure.seed} ${failure.label} ${failure.path} expected ${failure.expected} actual ${failure.actual}`);
  }
  process.exit(1);
}
