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

// Named/from, dynamic import(), and side-effect `import "./x.js"`.
const IMPORT_SPECIFIER_PATTERN =
  /(?:\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\bimport\s+["']([^"']+)["'])/gu;

function extractImportSpecifiers(source) {
  const specifiers = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
    const specifier = (match[1] || match[2] || match[3] || "").replaceAll("\\", "/");
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function collectModelImportFailures(normalizedPath, source) {
  const failures = [];
  if (
    !normalizedPath.startsWith("src/model/")
    || normalizedPath.startsWith("src/model/tests/")
  ) {
    return failures;
  }

  for (const specifier of extractImportSpecifiers(source)) {
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
  return failures;
}

const ARCHITECTURE_FIXTURES = [
  {
    id: "negative-side-effect-leftover",
    relativePath: "scripts/architecture-fixtures/negative-side-effect-leftover.js",
    virtualPath: "src/model/architecture-fixture-side-effect.js",
    expectFailure: true,
    messageIncludes: "imports leftover settlement-exec.js",
  },
  {
    id: "negative-dynamic-leftover",
    relativePath: "scripts/architecture-fixtures/negative-dynamic-leftover.js",
    virtualPath: "src/model/architecture-fixture-dynamic.js",
    expectFailure: true,
    messageIncludes: "imports leftover settlement-exec.js",
  },
  {
    id: "positive-allowlisted-named",
    relativePath: "scripts/architecture-fixtures/positive-allowlisted-named.js",
    virtualPath: "src/model/commands/debug-commands.js",
    expectFailure: false,
  },
  {
    id: "positive-side-effect-non-leftover",
    relativePath: "scripts/architecture-fixtures/positive-side-effect-non-leftover.js",
    virtualPath: "src/model/architecture-fixture-ok.js",
    expectFailure: false,
  },
];

async function checkSourceTree() {
  const sourceFiles = await listJavaScriptFiles("src");
  const failures = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");
    const normalizedPath = displayPath(filePath);
    if (/\bMath\.random\s*\(/u.test(source)) {
      failures.push(`${normalizedPath} uses Math.random()`);
    }
    failures.push(...collectModelImportFailures(normalizedPath, source));
  }

  if (failures.length) {
    console.error("[architecture] Failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`[architecture] OK: ${sourceFiles.length} source modules`);
}

async function checkArchitectureFixtures() {
  const failures = [];

  for (const fixture of ARCHITECTURE_FIXTURES) {
    const source = await readFile(fixture.relativePath, "utf8");
    const leftoverFailures = collectModelImportFailures(fixture.virtualPath, source);
    const failed = leftoverFailures.length > 0;
    if (fixture.expectFailure) {
      if (!failed) {
        failures.push(
          `${fixture.id}: expected leftover failure for ${fixture.virtualPath}, got none`,
        );
        continue;
      }
      const matched = leftoverFailures.some((message) => (
        typeof fixture.messageIncludes === "string"
        && message.includes(fixture.messageIncludes)
      ));
      if (!matched) {
        failures.push(
          `${fixture.id}: expected a leftover message containing ${JSON.stringify(fixture.messageIncludes)}; got ${leftoverFailures.join("; ")}`,
        );
      }
      continue;
    }
    if (failed) {
      failures.push(
        `${fixture.id}: expected no leftover failures for ${fixture.virtualPath}; got ${leftoverFailures.join("; ")}`,
      );
    }
  }

  if (failures.length) {
    console.error("[architecture-fixtures] Failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `[architecture-fixtures] OK: ${ARCHITECTURE_FIXTURES.length} cases`,
  );
}

if (process.argv.includes("--fixtures")) {
  await checkArchitectureFixtures();
} else {
  await checkSourceTree();
}
