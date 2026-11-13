import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

// Runtime files only: source paintings do not invalidate an unchanged packed page.
const groups = {
  cards: ['settlement-pieces', 'full-map-content-prototype', 'full-map-chaos-dictator', 'heirlooms'],
  regions: ['region-landmarks'],
  chrome: ['resource-language', 'piece-frames', 'chronicle-illustrations', 'vassal-portraits',
    'vassal-class', 'chronicle-gate', 'class-picker-frames', 'chronicle-hud-frames', 'timegraph-chronicle'],
};
const mapRoot = 'images/dark-fantasy/map-generation-prototype';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sibling = (file, reference) => path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
const target = (file, revision) => `artwork/${revision}/${path.posix.basename(file)}`;

export async function createArtworkSnapshot(root, output) {
  const registry = JSON.parse(await readFile(path.join(root, 'images/asset-manifest.json'), 'utf8'));
  const sources = new Map();
  async function add(file, category, atlas = false) {
    if (sources.has(file)) {
      if (sources.get(file).category !== category) throw new Error(`Artwork crosses categories: ${file}`);
      return;
    }
    if (!file.startsWith('images/') || file.includes('..')) throw new Error(`Invalid artwork path: ${file}`);
    const bytes = await readFile(path.join(root, file));
    const entry = { bytes, category, sourceHash: hash(bytes), atlas };
    sources.set(file, entry);
    if (atlas) {
      entry.data = JSON.parse(bytes);
      // Formatting/checkout line endings do not change the emitted JSON.
      entry.sourceHash = hash(JSON.stringify(entry.data));
      entry.links = (entry.data.meta.related_multi_packs ?? []).map(ref => sibling(file, ref));
      entry.image = sibling(file, entry.data.meta.image);
      await add(entry.image, category);
      for (const link of entry.links) await add(link, category, true);
    }
  }
  for (const [category, names] of Object.entries(groups)) {
    for (const name of names) {
      if (!registry.spriteSheets[name]) throw new Error(`Missing runtime atlas: ${name}`);
      for (const file of registry.spriteSheets[name].data) await add(file, category, true);
    }
  }
  for (const name of (await readdir(path.join(root, mapRoot, 'assets/runtime'))).sort()) {
    if (/\.(json|webp|png)$/.test(name)) await add(`${mapRoot}/assets/runtime/${name}`, 'regions');
  }
  for (const name of ['cloud-banks-v2.png', 'cloud-banks-v3.png', 'cloud-cumulus-v1.png']) await add(`${mapRoot}/${name}`, 'regions');

  // A multipack contains cycles. Name its JSONs by the dependency closure's
  // source hashes, then rewrite every edge. Images retain individual hashes.
  for (const [file, entry] of sources) {
    const dependencies = new Set();
    function visit(name) {
      if (dependencies.has(name)) return;
      dependencies.add(name);
      const part = sources.get(name);
      if (part.atlas) { visit(part.image); part.links.forEach(visit); }
    }
    visit(file);
    const revision = entry.atlas ? hash(JSON.stringify([...dependencies].sort().map(name => [name, sources.get(name).sourceHash]))) : entry.sourceHash;
    entry.url = target(file, revision);
  }
  const files = {};
  for (const [file, entry] of [...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    let bytes = entry.bytes;
    if (entry.atlas) {
      const data = structuredClone(entry.data);
      const relative = name => path.posix.relative(path.posix.dirname(entry.url), sources.get(name).url);
      data.meta.image = relative(entry.image);
      if (data.meta.related_multi_packs) data.meta.related_multi_packs = entry.links.map(relative);
      bytes = Buffer.from(JSON.stringify(data));
    }
    const full = path.join(output, entry.url);
    await mkdir(path.dirname(full), { recursive: true });
    try { await access(full); } catch { await writeFile(full, bytes); }
    files[file] = { url: entry.url, hash: hash(bytes), category: entry.category, bytes: bytes.length };
  }
  const categories = Object.fromEntries(Object.keys(groups).map(category => [category,
    hash(JSON.stringify(Object.entries(files).filter(([, value]) => value.category === category).map(([file, value]) => [file, value.hash])))]));
  return { schema: 1, categories, files };
}

export function stampArtworkManifest(html, manifest) {
  if (!html.includes('<head>')) throw new Error('Missing artwork manifest insertion point in HTML');
  const script = `<script id="game-artwork-manifest" type="application/json">${JSON.stringify(manifest).replace(/</g, '\\u003c')}</script>`;
  return html.replace('<head>', `<head>\n    ${script}`);
}
