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
  }
}

if (failures.length) {
  console.error("[architecture] Failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[architecture] OK: ${sourceFiles.length} source modules`);
