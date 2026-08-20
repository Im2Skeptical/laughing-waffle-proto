import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const SUPPORTED_ENTRY_POINTS = Object.freeze([
  { path: "src/views/ui-root-pixi.js", platform: "browser" },
  { path: "src/controllers/timegraph-forecast-worker.js", platform: "browser" },
  { path: "src/model/tests/world-state.js", platform: "node" },
  { path: "src/model/tests/detailed-settlements.js", platform: "node" },
  { path: "src/model/tests/vassal-life-map.js", platform: "node" },
  { path: "src/model/tests/debug-game-config.js", platform: "node" },
  { path: "src/model/tests/map-lab-draft.js", platform: "node" },
  { path: "src/model/tests/detailed-replay.js", platform: "node" },
]);

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  }));
  return nested.flat();
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

const reachable = new Set();
for (const entry of SUPPORTED_ENTRY_POINTS) {
  const result = await build({
    entryPoints: [entry.path],
    bundle: true,
    write: false,
    metafile: true,
    platform: entry.platform,
    format: "esm",
    target: "esnext",
    logLevel: "silent",
  });
  for (const inputPath of Object.keys(result.metafile.inputs)) {
    reachable.add(normalizePath(inputPath));
  }
}

const sourceFiles = (await listJavaScriptFiles("src")).map(normalizePath);
const unreachable = [];
for (const filePath of sourceFiles) {
  if (!reachable.has(filePath)) {
    const source = await readFile(filePath, "utf8");
    unreachable.push({
      path: filePath,
      lines: source.split(/\r?\n/u).length,
    });
  }
}

if (unreachable.length) {
  console.error("[source-reachability] Failed");
  console.error(
    `- ${unreachable.length} source modules are outside the app, worker, and supported tests`,
  );
  for (const entry of unreachable.slice(0, 20)) {
    console.error(`- ${entry.path} (${entry.lines} lines)`);
  }
  if (unreachable.length > 20) {
    console.error(`- ...and ${unreachable.length - 20} more`);
  }
  process.exit(1);
}

console.log(
  `[source-reachability] OK: ${sourceFiles.length} source modules are routed`,
);
