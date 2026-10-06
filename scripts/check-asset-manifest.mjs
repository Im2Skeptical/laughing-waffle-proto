import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { detailedSettlementPracticeDefs, settlementStructureDefs } from '../src/defs/gamepieces/detailed-settlement-defs.js';
import { VASSAL_HEIRLOOM_DEFINITION_IDS } from '../src/defs/gamepieces/vassal-heirloom-defs.js';

const root = process.cwd();
const manifestPath = path.join(root, 'images', 'asset-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const failures = [];
const registeredHeirlooms = new Set(manifest.spriteSheets.heirlooms?.files ?? []);
for (const id of [...VASSAL_HEIRLOOM_DEFINITION_IDS, 'bag']) {
  if (!registeredHeirlooms.has(`${id}.png`)) failures.push(`heirloom has no dedicated registered art: ${id}`);
}

const settlementArt = manifest.spriteSheets['settlement-pieces'];
const registeredPieces = new Set(settlementArt.files);
for (const id of [...Object.keys(detailedSettlementPracticeDefs), ...Object.keys(settlementStructureDefs)]) {
  if (!registeredPieces.has(`${id}.webp`)) failures.push(`runtime gamepiece has no dedicated registered painting: ${id}`);
}

async function requireFile(relativePath) {
  try {
    await readFile(path.join(root, relativePath));
  } catch {
    failures.push(`missing file: ${relativePath}`);
  }
}

for (const file of manifest.standalone) {
  await requireFile(`${manifest.sourceRoot}/${file}`);
}

for (const [name, sheet] of Object.entries(manifest.spriteSheets)) {
  const atlasNames = new Set();
  for (const dataFile of sheet.data) {
    await requireFile(dataFile);
    const atlas = JSON.parse(await readFile(path.join(root, dataFile), 'utf8'));
    Object.keys(atlas.frames).forEach(file => atlasNames.add(file));
    await requireFile(path.join(path.dirname(dataFile), atlas.meta.image));
  }
  const missing = sheet.files.filter(file => !atlasNames.has(file));
  if (missing.length) failures.push(`${name}: packed atlases are missing ${missing.join(', ')}`);
  for (const file of sheet.files) await requireFile(`${manifest.sourceRoot}/${sheet.source}/${file}`);
}

if (failures.length) {
  console.error('[assets] FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[assets] OK: ${manifest.standalone.length} standalone files and ${Object.keys(manifest.spriteSheets).length} packed groups`);
