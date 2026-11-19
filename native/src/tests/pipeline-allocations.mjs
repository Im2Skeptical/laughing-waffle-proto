import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializeGameState } from "../../../src/model/state.js";
import { REPO_ROOT, sha256Value } from "../../reference/corpus-lib.mjs";
import { createStart, loadScenario } from "../../reference/trace.mjs";

const [test, lateCache] = process.argv.slice(2);
const reference = join(REPO_ROOT, "native/reference");
const id = "seed-2026-late";
const { scenario, startSec } = loadScenario(id);
const filename = `state-${startSec}.json`;
const [, firstHash] = readFileSync(join(reference, "fixtures", id, "hashes.tsv"), "utf8").split(/\r?\n/u);
const expectedHash = firstHash.split("\t")[1];
const artifacts = join(REPO_ROOT, "artifacts/native-reference/traces", id, filename);
const valid = path => existsSync(path) && sha256Value(JSON.parse(readFileSync(path, "utf8"))) === expectedHash;

let late = [artifacts, lateCache].find(valid);
if (!late) {
  const state = serializeGameState(createStart(scenario, startSec));
  if (sha256Value(state) !== expectedHash) throw new Error("Late allocation fixture hash changed");
  writeFileSync(lateCache, JSON.stringify(state));
  late = lateCache;
}
const result = spawnSync(test, [
  "--pipeline-allocations", join(reference, "fixtures/seed-1/state-0.json"), late,
  join(reference, "topology"),
], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
