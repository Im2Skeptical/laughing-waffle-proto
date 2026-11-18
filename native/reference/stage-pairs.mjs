import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO_ROOT } from "./corpus-lib.mjs";

function directories(path) {
  return readdirSync(path, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function main(args) {
  if (args.length < 2 || args.length > 3) {
    throw new Error("Usage: node native/reference/stage-pairs.mjs <waffle_parity> <stage> [masks.json]");
  }
  const [parity, stage, masks] = args;
  const binary = resolve(parity);
  const root = join(REPO_ROOT, "artifacts", "native-reference", "stages");
  if (!existsSync(root)) throw new Error("Generate stage pairs with node native/reference/stage-probe.mjs --all.");
  const maskArgs = masks ? ["--masks", masks] : [];
  let comparisons = 0;
  let passes = 0;
  for (const scenario of directories(root)) {
    for (const second of directories(join(root, scenario))) {
      const sample = join(root, scenario, second);
      const manifest = JSON.parse(readFileSync(join(sample, "manifest.json"), "utf8"));
      const span = manifest.stages.find(({ name }) => name === stage);
      if (!span) continue;
      const boundary = index => join(sample, manifest.boundaries[index].file);
      const result = spawnSync(binary, [
        "stage", "--stage", stage, "--before", boundary(span.before), "--after", boundary(span.after), ...maskArgs,
      ], { encoding: "utf8" });
      if (result.error) throw result.error;
      comparisons += 1;
      if (result.status === 0) {
        passes += 1;
      } else {
        const lines = (result.stdout || result.stderr).trim().split(/\r?\n/u);
        console.error(`${scenario}/${second}: ${lines.slice(0, 2).join(" ")} (exit ${result.status ?? result.signal})`);
      }
    }
  }
  if (!comparisons) throw new Error("No captured pairs for " + stage + ".");
  console.log(`${stage}: ${passes}/${comparisons} stage pairs passed.`);
  if (passes !== comparisons) process.exitCode = 1;
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
