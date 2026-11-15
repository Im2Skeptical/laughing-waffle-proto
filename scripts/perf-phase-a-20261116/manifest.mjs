// Raw retention: every artifact file gets a sha256 manifest; small JSON files
// (<= 256 KiB) are also copied into the committed docs run folder so the
// Auditor can recompute from committed bytes. Large files and screenshots stay
// under artifacts/ (gitignored) and are pinned by hash in MANIFEST.json.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { REPO_ROOT, DOCS_RUNS_REL } from './identities.mjs';

export function finalizeRun(outDir, docsDir = path.join(REPO_ROOT, DOCS_RUNS_REL, path.basename(outDir))) {
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  mkdirSync(docsDir, { recursive: true });
  const files = walk(outDir).sort().map((p) => {
    const bytes = readFileSync(p);
    const rel = path.relative(outDir, p);
    const committed = rel.endsWith('.json') && bytes.length <= 256 * 1024;
    if (committed) {
      mkdirSync(path.dirname(path.join(docsDir, rel)), { recursive: true });
      copyFileSync(p, path.join(docsDir, rel));
    }
    return { path: rel, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), committed };
  });
  const manifest = { artifactDir: path.relative(REPO_ROOT, outDir), files, at: new Date().toISOString() };
  writeFileSync(path.join(docsDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
