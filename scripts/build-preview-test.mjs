import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const fixture = await mkdtemp(path.join(tmpdir(), 'civilization-build-preview-'));
let serverPid;
try {
  await mkdir(path.join(fixture, 'scripts'));
  await mkdir(path.join(fixture, 'ai'));
  await mkdir(path.join(fixture, 'src'));
  for (const file of ['build-info.mjs', 'local-preview.mjs', 'version-game.mjs']) {
    await copyFile(`scripts/${file}`, path.join(fixture, 'scripts', file));
  }
  const pkg = { version: '1.0.0' };
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify(pkg));
  await writeFile(path.join(fixture, 'package-lock.json'), JSON.stringify({ ...pkg, packages: { '': pkg } }));
  await writeFile(path.join(fixture, 'ai/ai-context.md'), 'Game build version: `1.0.0`.\n');
  await writeFile(path.join(fixture, 'index.html'), '<script id="game-build-info" type="application/json">null</script>');
  await writeFile(path.join(fixture, 'src/example.js'), 'export const value = 1;\n');
  const git = args => execFileSync('git', args, { cwd: fixture, stdio: 'pipe', windowsHide: true });
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Preview test', '-c', 'user.email=preview@example.invalid', 'commit', '-qm', 'Fixture']);
  const start = () => execFileSync(process.execPath, ['scripts/local-preview.mjs'], {
    cwd: fixture, encoding: 'utf8', timeout: 40_000, windowsHide: true,
  });
  const first = start();
  const address = first.match(/Local preview: (http:\/\/localhost:\d+\/)/)?.[1];
  assert.ok(address, `Startup must wait for readiness and print a URL; got ${JSON.stringify(first)}`);
  const status = await (await fetch(`${address}__preview__/status`)).json();
  serverPid = status.pid;
  assert.ok(Number.isInteger(serverPid));
  assert.ok(start().includes(address), 'Starting again must reuse the same server');
  assert.equal((await (await fetch(`${address}__preview__/status`)).json()).pid, serverPid);
  const response = await fetch(address);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  const original = await (await fetch(`${address}build-info.json`)).json();
  assert.ok(html.includes(JSON.stringify(original)), 'Page and metadata identities must agree');
  assert.equal(original.channel, 'local');
  assert.equal(original.version, '1.0.0');
  assert.equal((await fetch(`${address}src/example.js`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${address}.git/config`)).status, 404);
  assert.equal((await fetch(`${address}package.json`)).status, 404);
  assert.equal((await fetch(address, { method: 'POST' })).status, 405);
  await writeFile(path.join(fixture, 'src/example.js'), 'export const value = 1;\r\n');
  assert.equal((await (await fetch(`${address}build-info.json`)).json()).build, original.build, 'CRLF does not alter identity');
  await writeFile(path.join(fixture, 'src/added.js'), 'export const value = 2;\n');
  assert.deepEqual(await (await fetch(`${address}build-info.json`)).json(), original, 'Repeated polling reuses the cached identity');
  await delay(5_100);
  assert.notEqual((await (await fetch(`${address}build-info.json`)).json()).build, original.build, 'Untracked edits change identity after cache expiry');
  await rm(path.join(fixture, 'src/added.js'));
  await delay(5_100);
  assert.equal((await (await fetch(`${address}build-info.json`)).json()).build, original.build, 'Reverting restores identity after cache expiry');
  execFileSync(process.execPath, ['scripts/version-game.mjs', 'patch'], { cwd: fixture, windowsHide: true });
  await delay(5_100);
  const updated = await (await fetch(`${address}build-info.json`)).json();
  assert.equal(updated.version, '1.0.1');
  assert.notEqual(updated.build, original.build);
  assert.match(await readFile(path.join(fixture, 'ai/ai-context.md'), 'utf8'), /`1\.0\.1`/);
  const built = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  const manifest = JSON.parse(await readFile('dist/build-manifest.json', 'utf8'));
  const page = await readFile('dist/index.html', 'utf8');
  assert.equal(built.channel, 'pages');
  assert.equal(built.version, JSON.parse(await readFile('package.json', 'utf8')).version);
  assert.equal(built.build, manifest.build);
  assert.ok(page.includes(JSON.stringify(built)), 'Pages embeds the published build identity');
  console.log('[build-preview] OK: startup/reuse, no-cache, restricted serving, content identity, version sync, Pages metadata');
} finally {
  if (serverPid) process.kill(serverPid);
  // mkdtemp owns this exact child of the OS temporary directory.
  assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
  assert.ok(path.basename(fixture).startsWith('civilization-build-preview-'));
  await rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
