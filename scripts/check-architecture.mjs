import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  }));
  return nested.flat();
}

function displayPath(filePath) {
  return filePath.split(path.sep).join("/");
}

const LEFTOVER_MODULE_IMPORT_RULES = [
  {
    pattern: /(?:^|\/)settlement-exec\.js$/u,
    allowlist: new Set([
      "src/model/commands/debug-commands.js",
    ]),
    message: "imports leftover settlement-exec.js; new site sim belongs in detailed-settlements",
  },
  {
    pattern: /(?:^|\/)hub-structure-defs\.js$/u,
    allowlist: new Set([
      "src/model/commands/debug-commands.js",
      "src/model/settlement-upgrades.js",
      "src/model/settlement-exec.js",
      "src/model/state/board-legacy.js",
    ]),
    message: "imports leftover hub-structure-defs.js; live structures belong in detailed-settlement-defs.js",
  },
  {
    pattern: /(?:^|\/)settlement-practice-defs\.js$/u,
    allowlist: new Set([
      "src/model/commands/debug-commands.js",
      "src/model/settlement-exec.js",
      "src/model/settlement-leadership.js",
      "src/model/settlement-order-exec.js",
      "src/model/settlement-vassal-exec.js",
      "src/model/effects/ops/system/settlement-upgrade-ops.js",
    ]),
    message: "imports leftover settlement-practice-defs.js; live pieces belong in detailed-settlement-defs.js",
  },
  {
    pattern: /(?:^|\/)settlement-vassal-exec\.js$/u,
    allowlist: new Set([
      "src/model/settlement-exec.js",
      "src/model/effects/ops/system/settlement-practice-ops.js",
      "src/model/effects/ops/system/settlement-upgrade-ops.js",
    ]),
    message: "imports leftover settlement-vassal-exec.js; new Life Map rules belong in vassal-life-map.js",
  },
  {
    pattern: /(?:^|\/)settlement-order-exec\.js$/u,
    allowlist: new Set([
      "src/model/commands/debug-commands.js",
      "src/model/effects/ops/system/settlement-upgrade-ops.js",
      "src/model/effects/ops/system/settlement-practice-ops.js",
      "src/model/settlement-vassal-exec.js",
      "src/model/settlement-exec.js",
    ]),
    message: "imports leftover settlement-order-exec.js; new site sim belongs in detailed-settlements",
  },
  {
    pattern: /(?:^|\/)settlement-leadership\.js$/u,
    allowlist: new Set([
      "src/model/settlement-order-exec.js",
      "src/model/settlement-vassal-exec.js",
    ]),
    message: "imports leftover settlement-leadership.js; new site sim belongs in detailed-settlements",
  },
  {
    pattern: /(?:^|\/)settlement-upgrades\.js$/u,
    allowlist: new Set([
      "src/model/effects/ops/system/settlement-upgrade-ops.js",
      "src/model/settlement-exec.js",
      "src/model/state/board-legacy.js",
    ]),
    message: "imports leftover settlement-upgrades.js; new site sim belongs in detailed-settlements",
  },
];

const sourceFiles = await listJavaScriptFiles("src");
const failures = [];

for (const filePath of sourceFiles) {
  const source = await readFile(filePath, "utf8");
  if (/\bMath\.random\s*\(/u.test(source)) {
    failures.push(`${displayPath(filePath)} uses Math.random()`);
  }
  const normalizedPath = displayPath(filePath);
  if (
    !normalizedPath.startsWith("src/model/")
    || normalizedPath.startsWith("src/model/tests/")
  ) {
    continue;
  }

  const importPattern = /\b(?:from\s+|import\s*\()\s*["']([^"']+)["']/gu;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1].replaceAll("\\", "/");
    if (/(?:^|\/)(?:views|controllers)(?:\/|$)/u.test(specifier)) {
      failures.push(
        `${normalizedPath} imports UI/controller layer ${specifier}`,
      );
    }
    for (const rule of LEFTOVER_MODULE_IMPORT_RULES) {
      if (rule.pattern.test(specifier) && !rule.allowlist.has(normalizedPath)) {
        failures.push(`${normalizedPath} ${rule.message}`);
      }
    }
  }
}

if (failures.length) {
  console.error("[architecture] Failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[architecture] OK: ${sourceFiles.length} source modules`);
