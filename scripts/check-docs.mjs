import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detailedSettlementEffectOps } from "../src/defs/gamepieces/detailed-settlement-defs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.resolve(root, file), "utf8");
const scripts = JSON.parse(read("package.json")).scripts;
const documents = [...new Set(execFileSync("git", [
  "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md",
], { cwd: root, encoding: "utf8" }).split("\0"))]
  .filter((file) => file && !file.startsWith("ai/history/") && existsSync(path.resolve(root, file)));
const failures = [];
const fail = (file, line, message) => failures.push(`${file}:${line}: ${message}`);
const isHistorical = (file) => file.startsWith("docs/research/")
  || file === "docs/removed-legacy-view-stack.md";

function headingAnchors(text) {
  const anchors = new Set();
  const counts = new Map();
  let fence = null;
  for (const line of text.split(/\r?\n/u)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1]?.[0];
    if (marker) { fence = fence === marker ? null : fence ?? marker; continue; }
    if (fence) continue;
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/u)?.[1];
    if (!heading) continue;
    const slug = heading.toLowerCase().replace(/<[^>]*>/gu, "")
      .replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s/gu, "-");
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    anchors.add(count ? `${slug}-${count}` : slug);
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/gu)) anchors.add(match[1]);
  return anchors;
}

function checkLink(file, line, destination) {
  const target = destination.trim().replace(/^<([^>]+)>.*$/u, "$1")
    .replace(/\s+["'][\s\S]*$/u, "");
  if (!target || /^(?:[a-z][\w+.-]*:|\/\/)/iu.test(target)) return;
  const [location, fragment] = target.split("#");
  let decoded;
  try { decoded = decodeURIComponent(location.split("?")[0]); }
  catch { fail(file, line, `invalid link ${target}`); return; }
  const full = !decoded ? path.resolve(root, file)
    : decoded.startsWith("/") ? path.resolve(root, `.${decoded}`)
      : path.resolve(root, path.dirname(file), decoded);
  if (!existsSync(full)) { fail(file, line, `missing link target ${target}`); return; }
  if (fragment && full.endsWith(".md")) {
    let anchor;
    try { anchor = decodeURIComponent(fragment); }
    catch { fail(file, line, `invalid anchor ${target}`); return; }
    if (!headingAnchors(readFileSync(full, "utf8")).has(anchor)) fail(file, line, `missing heading ${target}`);
  }
}

for (const file of documents) {
  const text = read(file);
  let fence = null;
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    for (const command of line.matchAll(/\bnpm run ([\w:.-]+)/gu)) {
      if (!Object.hasOwn(scripts, command[1])) fail(file, index + 1, `unknown npm script ${command[1]}`);
    }
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1]?.[0];
    if (marker) { fence = fence === marker ? null : fence ?? marker; continue; }
    if (fence) continue;
    for (const match of line.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)/gu)) {
      checkLink(file, index + 1, match[1]);
    }
    const reference = line.match(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/u);
    if (reference) checkLink(file, index + 1, reference[1]);
    if (isHistorical(file)) continue;
    for (const match of line.matchAll(/`([^`]+)`/gu)) {
      const route = match[1];
      if (!/^(?:src|scripts|ai|docs|images|\.grok)\//u.test(route)
        || /[\s*<>=()#?]/u.test(route)) continue;
      if (!existsSync(path.resolve(root, route))) fail(file, index + 1, `missing repository route ${route}`);
    }
  }
}

// The invariants sheet is the one current schema reference. Read literals from
// source without importing the simulation, controllers or browser storage.
const schemas = [
  ["src/model/state.js", /gameStateSchemaVersion:\s*(\d+)/u, /Game state v(\d+)/u],
  ["src/controllers/sim-runner/save-slots.js", /SAVE_SCHEMA_VERSION\s*=\s*(\d+)/u, /runner saves v(\d+)/u],
  ["src/model/game-config.js", /GAME_CONFIG_SCHEMA_VERSION\s*=\s*(\d+)/u, /schema-v(\d+) Game Settings/u],
  ["src/model/map-lab-draft.js", /MAP_LAB_DRAFT_SCHEMA_VERSION\s*=\s*(\d+)/u, /Map Lab drafts v(\d+)/u],
  ["src/model/map-lab-scenarios.js", /MAP_LAB_SCENARIO_LIBRARY_SCHEMA_VERSION\s*=\s*(\d+)/u, /scenario libraries v(\d+)/u],
  ["src/model/vassal-debug-draft.js", /VASSAL_DEBUG_DRAFT_SCHEMA_VERSION\s*=\s*(\d+)/u, /Vassal Lab draft\/preset schema v(\d+)/u],
  ["src/model/life-map-lab-draft.js", /LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION\s*=\s*(\d+)/u, /Life Map Lab drafts v(\d+)/u],
  ["src/model/vassal-life-map-generator.js", /VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION\s*=\s*(\d+)/u, /Life Map generator settings v(\d+)/u],
  ["src/defs/gamepieces/vassal-life-map-defs.js", /VASSAL_LIFE_MAP_GRAPH_SCHEMA_VERSION\s*=\s*(\d+)/u, /serialized Life Map graph v(\d+)/u],
  ["src/model/debug-profile-library.js", /DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION\s*=\s*(\d+)/u, /Debug profile library\/export v(\d+)/u],
  ["src/model/debug-profile-library.js", /DEBUG_PROFILE_EXPORT_SCHEMA_VERSION\s*=\s*(\d+)/u, /Debug profile library\/export v(\d+)/u],
  ["src/model/debug-draft-library.js", /DEBUG_DRAFT_LIBRARY_SCHEMA_VERSION\s*=\s*(\d+)/u, /Named debug draft libraries v(\d+)/u],
];
const invariants = read("ai/ai-context.md");
for (const [source, sourcePattern, docPattern] of schemas) {
  const expected = read(source).match(sourcePattern)?.[1];
  const match = invariants.match(docPattern);
  if (!expected || match?.[1] !== expected) {
    const line = match ? invariants.slice(0, match.index).split("\n").length : 1;
    fail("ai/ai-context.md", line, `schema mismatch: ${source} expects ${expected ?? "a readable version"}, documented ${match?.[1] ?? "missing"}`);
  }
}

const dictionary = "Designer Docs/Effect-Op-Dictionary.md";
const documentedOps = [...read(dictionary).matchAll(/^\| `([^`]+)` \|/gmu)].map((match) => match[1]);
for (const op of new Set([...detailedSettlementEffectOps, ...documentedOps])) {
  if (!detailedSettlementEffectOps.includes(op) || documentedOps.filter((item) => item === op).length !== 1) {
    fail(dictionary, 1, `effect operation must match the runtime whitelist exactly once: ${op}`);
  }
}

if (failures.length) {
  console.error(`[docs] Failed (${failures.length})\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`[docs] OK: ${documents.length} current documents, local links/routes, npm commands, ${schemas.length} schema contracts and ${documentedOps.length} effect operations`);
}
