// Explicit regeneration. Refuses to write unless --write is present.
// Never called by verify.mjs. A failed replay/continuation check does not update goldens.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARTIFACT_DIR,
  BASELINE_COMMIT,
  CHECKPOINTS,
  CORPUS_DIR,
  SEEDS,
  corpusFile,
  evaluateSeed,
  readRunnerSaveSchema,
  sha256Value,
} from "./corpus-lib.mjs";

const write = process.argv.includes("--write");

function loadPrevious(seed) {
  try {
    return JSON.parse(readFileSync(corpusFile(seed), "utf8"));
  } catch {
    return null;
  }
}

function changedHashes(previous, next) {
  if (!previous) return ["new file"];
  const changes = [];
  for (const checkpoint of CHECKPOINTS) {
    const left = previous.checkpoints?.find((entry) => entry.id === checkpoint.id)?.fullStateSha256;
    const right = next.checkpoints.find((entry) => entry.id === checkpoint.id).fullStateSha256;
    if (left !== right) changes.push(`${checkpoint.id} ${left ?? "missing"} -> ${right}`);
  }
  if (previous.action?.payload?.expectedPoolHash !== next.action.payload.expectedPoolHash) {
    changes.push("action pool hash");
  }
  if (previous.config?.gameConfigSha256 !== next.config.gameConfigSha256) changes.push("gameConfig hash");
  return changes;
}

const results = SEEDS.map((seed) => evaluateSeed(seed));
const failed = results.filter((result) => !result.ok);
if (failed.length || !write) {
  for (const result of results) {
    const status = result.ok ? "ok" : "FAILED";
    console.log(`seed ${result.seed}: ${status}, failures ${result.failures.length}`);
    for (const failure of result.failures) {
      const diff = failure.diffs[0];
      console.log(`  ${failure.label} ${diff?.path ?? ""} expected ${diff?.expected ?? ""} actual ${diff?.actual ?? ""}`);
    }
  }
  if (failed.length) {
    console.log("capture refused: replay or continuation mismatch. golden files were not written.");
    process.exit(1);
  }
  console.log("refusing to write. Pass --write to regenerate native/reference/corpus.");
  process.exit(2);
}

mkdirSync(CORPUS_DIR, { recursive: true });
mkdirSync(join(ARTIFACT_DIR, "full"), { recursive: true });

const hashChanges = [];
const fullBytes = [];
for (const result of results) {
  const previous = loadPrevious(result.seed);
  const changes = changedHashes(previous, result.record);
  hashChanges.push({ seed: result.seed, changes });
  writeFileSync(corpusFile(result.seed), `${JSON.stringify(result.record, null, 2)}\n`);
  for (const checkpoint of CHECKPOINTS) {
    const snapshot = result.snapshots[checkpoint.id];
    const file = join(ARTIFACT_DIR, "full", `seed-${result.seed}-${checkpoint.id}.json`);
    const text = `${JSON.stringify(snapshot)}\n`;
    writeFileSync(file, text);
    fullBytes.push({ file: `full/seed-${result.seed}-${checkpoint.id}.json`, bytes: Buffer.byteLength(text), sha256: sha256Value(snapshot) });
  }
}

const configHashes = [...new Set(results.map((result) => result.record.config.gameConfigSha256))];
const manifest = {
  corpusKind: "browser-regression-reference",
  crossLanguageParity: false,
  n03: "preparatory capture only. This corpus does not implement or complete N03.",
  issue: "https://github.com/Im2Skeptical/laughing-waffle-proto/issues/96",
  baselineCommit: BASELINE_COMMIT,
  gates: {
    packageVersion: false,
    gitHead: false,
    silentRewrite: false,
  },
  schemasCaptured: {
    gameState: results[0].record.config.gameStateSchemaVersion,
    gameConfig: results[0].record.config.gameConfigSchemaVersion,
    runnerSaveSourceConstant: readRunnerSaveSchema(),
    runnerSaveIsEqualityGate: false,
  },
  seeds: SEEDS,
  checkpoints: CHECKPOINTS.map((checkpoint) => ({ id: checkpoint.id, tSec: checkpoint.tSec })),
  gameConfigSha256: configHashes.length === 1 ? configHashes[0] : configHashes,
  numericTreatment: "JSON numbers copied from serializeGameState. No corpus rounding. Object-key order is not significant in the semantic files. Array order is significant. The full-state pin sorts object keys only so its hash is stable; it removes no fields.",
  ordering: "Regions follow world.regions. Joint cohorts keep the stored joint-array order inside classId sorted A to Z. Practice slots keep slot index, including empty slots. Pending candidates keep pool order. Birth-credit keys and allegiance ids are sorted in the semantic projection only.",
  covered: [
    "ordinary New Game seeds 1, 42 and 1867",
    "initial serialized state",
    "official 60-tick advance through tSec 6 and tSec 7",
    "moon phase boundaries reached by that advance",
    "settlementSelectVassal of opening candidate 0 at tSec 7",
    "joint cohort identity, birth-credit ledgers, practice instance order, stock, charge and work",
    "region controller, Unrest field, claimant and claim checks",
    "civilization prestige, treasury and the six serialized RNG streams",
  ],
  excluded: [
    "C++ and Android parity",
    "Unrest episode entry, yearly Chaos and expiry",
    "node Prestige income and its per-node rounding",
    "garrison support assignment",
    "shop, life-node confirm, and practice install or removal",
    "season rollover and any year after the opening year",
    "Life Map graph, portraits and signature nodes in the semantic projection",
    "derived population summary caches in the semantic projection",
    "map polygons and the road list in the semantic projection",
    "the gameConfig document body, aside from its canonical hash",
    "IndexedDB save slots and forecast workers",
  ],
};

writeFileSync(join(CORPUS_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(ARTIFACT_DIR, "capture-result.json"), `${JSON.stringify({
  baselineCommit: BASELINE_COMMIT,
  wrote: true,
  hashChanges,
  fullBytes,
  configHashes,
}, null, 2)}\n`);

for (const entry of hashChanges) {
  console.log(`seed ${entry.seed}: ${entry.changes.length ? entry.changes.join("; ") : "unchanged hashes"}`);
}
console.log(`wrote ${SEEDS.length} seed files under native/reference/corpus`);
console.log(`raw snapshots: ${fullBytes.length} files, ${fullBytes.reduce((sum, entry) => sum + entry.bytes, 0)} bytes, gitignored`);
