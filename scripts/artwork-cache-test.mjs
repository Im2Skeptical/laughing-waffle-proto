import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createArtworkSnapshot, stampArtworkManifest } from './artwork-manifest.mjs';
import { changedArtworkCategories, setArtworkReloadGuard, reloadForArtwork, saveGameForArtworkReload } from '../src/views/artwork-cache.js';

const fixture = await mkdtemp(path.join(tmpdir(), 'civilization-artwork-'));
const output = path.join(fixture, 'output');
const sheet = 'images/sprite-sheets/';
const regional = 'images/dark-fantasy/map-generation-prototype/';
async function put(file, bytes) {
  await mkdir(path.dirname(path.join(fixture, file)), { recursive: true });
  await writeFile(path.join(fixture, file), bytes);
}
const snapshot = () => createArtworkSnapshot(fixture, output);
try {
  const registry = JSON.parse(await readFile('images/asset-manifest.json', 'utf8'));
  Object.values(registry.spriteSheets).forEach(group => { group.data = []; });
  registry.spriteSheets['settlement-pieces'].data = [`${sheet}a.json`, `${sheet}b.json`];
  registry.spriteSheets['resource-language'].data = [`${sheet}icons.json`];
  await put('images/asset-manifest.json', JSON.stringify(registry));
  await mkdir(path.join(fixture, regional, 'assets/runtime'), { recursive: true });
  for (const name of ['cloud-banks-v2.png', 'cloud-banks-v3.png', 'cloud-cumulus-v1.png']) await put(regional + name, name);
  for (const [name, related] of [['a', ['b.json']], ['b', ['a.json']], ['icons', []]]) {
    await put(`${sheet}${name}.json`, JSON.stringify({ frames: {}, meta: { image: `${name}.png`, related_multi_packs: related } }));
    await put(`${sheet}${name}.png`, `original-${name}`);
  }
  const original = await snapshot();
  assert.deepEqual(await snapshot(), original, 'Warm snapshot identities are stable');
  await put('src/gameplay.js', 'a gameplay-only change');
  await put('images/dark-fantasy/settlement-pieces-v4/observation.webp', 'unpacked master change');
  assert.deepEqual(await snapshot(), original, 'Code and unpublished masters cannot invalidate runtime artwork');
  const atlas = JSON.parse(await readFile(path.join(fixture, `${sheet}a.json`), 'utf8'));
  await put(`${sheet}a.json`, JSON.stringify(atlas, null, 2).replace(/\n/g, '\r\n'));
  assert.deepEqual(await snapshot(), original, 'Atlas formatting cannot invalidate identical runtime JSON');

  await put(`${sheet}a.png`, 'edited card page');
  const card = await snapshot();
  assert.deepEqual(changedArtworkCategories(original, card), ['cards']);
  assert.notEqual(card.files[`${sheet}a.png`].url, original.files[`${sheet}a.png`].url);
  assert.equal(card.files[`${sheet}b.png`].url, original.files[`${sheet}b.png`].url, 'Unchanged multipack image is reused');
  assert.equal(card.files[`${sheet}icons.json`].url, original.files[`${sheet}icons.json`].url);
  for (const name of ['a', 'b']) {
    assert.notEqual(card.files[`${sheet}${name}.json`].url, original.files[`${sheet}${name}.json`].url);
    const url = card.files[`${sheet}${name}.json`].url;
    const json = JSON.parse(await readFile(path.join(output, url), 'utf8'));
    const resolve = ref => path.posix.normalize(path.posix.join(path.posix.dirname(url), ref));
    assert.equal(resolve(json.meta.image), card.files[`${sheet}${name}.png`].url);
    assert.equal(resolve(json.meta.related_multi_packs[0]), card.files[`${sheet}${name === 'a' ? 'b' : 'a'}.json`].url);
    assert.equal((await readFile(path.join(output, original.files[`${sheet}${name}.png`].url))).toString(), `original-${name}`,
      'Older local pages retain immutable bytes for progressive loads');
  }
  await put(regional + 'cloud-banks-v2.png', 'regional edit');
  const region = await snapshot();
  assert.deepEqual(changedArtworkCategories(card, region), ['regions']);
  assert.equal(region.categories.cards, card.categories.cards);
  await rm(path.join(fixture, regional, 'cloud-banks-v2.png'));
  await assert.rejects(snapshot(), /ENOENT/, 'A missing dependency cannot publish a partial snapshot');

  assert.ok(stampArtworkManifest('<head></head>', card).includes(JSON.stringify(card)));
  globalThis.document = { getElementById: () => ({ textContent: JSON.stringify(original) }) };
  const { artworkUrl } = await import('../src/views/artwork-cache.js');
  assert.equal(artworkUrl(`${sheet}a.png`), original.files[`${sheet}a.png`].url);
  document.getElementById = () => ({ textContent: JSON.stringify(card) });
  assert.equal(artworkUrl(`${sheet}a.png`), original.files[`${sheet}a.png`].url, 'Deferred loading remains pinned');
  let reloads = 0;
  setArtworkReloadGuard(async () => ({ ok: false }));
  assert.equal(await reloadForArtwork(() => reloads++), false);
  setArtworkReloadGuard(async () => ({ ok: true }));
  assert.equal(await reloadForArtwork(() => reloads++), true);
  assert.equal(reloads, 1, 'Reload requires a completed successful save');
  for (const deferredSave of [1, 2]) {
    for (const action of ['continue', 'continue-then-menu', 'replace', 'none', 'save-failure']) {
      let entry = 0, inMenu = false, currentTime = 0, savedTime = null, calls = 0, complete;
      const pending = new Promise(resolve => { complete = resolve; });
      const session = { isInMenu: () => inMenu, async save() {
        const capture = currentTime;
        if (++calls === deferredSave) await pending;
        savedTime = capture;
        return { ok: action !== 'save-failure' || calls !== deferredSave };
      } };
      const version = entry;
      setArtworkReloadGuard(() => saveGameForArtworkReload({ session,
        isCurrent: () => entry === version, pause: () => { inMenu = true; },
      }));
      let navigated = false;
      const reload = reloadForArtwork(() => { navigated = true; });
      // Reach the selected in-flight capture, rather than advancing timers.
      while (calls < deferredSave) await Promise.resolve();
      if (action !== 'none' && action !== 'save-failure') {
        entry++; inMenu = false; currentTime = 30;
        if (action === 'continue-then-menu') inMenu = true;
      }
      complete();
      assert.equal(await reload, action === 'none', `${action}, pending save ${deferredSave}: reload result`);
      assert.equal(navigated, action === 'none', `${action}, pending save ${deferredSave}: navigation`);
      if (action !== 'none' && action !== 'save-failure') {
        assert.equal(currentTime, 30);
        assert.equal(savedTime, 0, 'The older capture cannot authorize discarding newer progress');
      }
    }
  }
  console.log('[artwork-cache] OK: per-file identity, code/master isolation, changed pages, multipack coherence, categories, pinned loads and save-gated reload');
} finally {
  delete globalThis.document;
  assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
  assert.ok(path.basename(fixture).startsWith('civilization-artwork-'));
  await rm(fixture, { recursive: true, force: true });
}
