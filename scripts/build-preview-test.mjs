import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const fixture = await mkdtemp(path.join(tmpdir(), 'civilization-build-preview-'));
const serverPids = [];
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
  git(['init', '-q', '-b', 'main']); git(['add', '.']);
  git(['-c', 'user.name=Preview test', '-c', 'user.email=preview@example.invalid', 'commit', '-qm', 'Fixture']);
  const start = (cwd = fixture) => execFileSync(process.execPath, ['scripts/local-preview.mjs'], {
    cwd, encoding: 'utf8', timeout: 40_000, windowsHide: true,
  });
  const first = start();
  const address = first.match(/Local preview: (http:\/\/localhost:\d+\/)/)?.[1];
  assert.ok(address, `Startup must wait for readiness and print a URL; got ${JSON.stringify(first)}`);
  const status = await (await fetch(`${address}__preview__/status`)).json();
  const serverPid = status.pid;
  serverPids.push(serverPid);
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
  assert.equal(original.branch, 'main');
  assert.equal(original.preview, false, 'Clean main is the integrated version');
  assert.equal(original.previewLabel, null);
  assert.equal((await fetch(`${address}src/example.js`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${address}.git/config`)).status, 404);
  assert.equal((await fetch(`${address}package.json`)).status, 404);
  assert.equal((await fetch(address, { method: 'POST' })).status, 405);
  await writeFile(path.join(fixture, 'src/example.js'), 'export const value = 1;\r\n');
  assert.equal((await (await fetch(`${address}build-info.json`)).json()).build, original.build, 'CRLF does not alter identity');
  await writeFile(path.join(fixture, 'src/added.js'), 'export const value = 2;\n');
  assert.deepEqual(await (await fetch(`${address}build-info.json`)).json(), original, 'Repeated polling reuses the cached identity');
  await delay(5_100);
  const dirty = await (await fetch(`${address}build-info.json`)).json();
  assert.notEqual(dirty.build, original.build, 'Untracked edits change identity');
  assert.equal(dirty.preview, true, 'Uncommitted main changes must be marked as a preview');
  assert.equal(dirty.previewLabel, new URL(address).port);
  await rm(path.join(fixture, 'src/added.js'));
  await writeFile(path.join(fixture, 'src/example.js'), 'export const value = 1;\n');
  await delay(5_100);
  assert.equal((await (await fetch(`${address}build-info.json`)).json()).build, original.build, 'Reverting restores identity');

  // Exercise real linked worktrees: parallel tasks inherit a version and cannot
  // independently allocate the same next integrated version.
  const taskAddresses = [];
  for (const name of ['task-a', 'task-b']) {
    const cwd = path.join(fixture, 'worktrees', name);
    git(['worktree', 'add', '-q', '-b', name, cwd]);
    const output = start(cwd);
    const taskAddress = output.match(/Local preview: (http:\/\/localhost:\d+\/)/)?.[1];
    assert.ok(taskAddress);
    serverPids.push((await (await fetch(`${taskAddress}__preview__/status`)).json()).pid);
    const taskInfo = await (await fetch(`${taskAddress}build-info.json`)).json();
    assert.equal(taskInfo.preview, true, 'Even a clean task branch is a preview');
    assert.equal(taskInfo.branch, name);
    assert.equal(taskInfo.version, original.version);
    assert.equal(taskInfo.build, original.build, 'Branch metadata does not change the source fingerprint');
    const before = await Promise.all(['package.json', 'package-lock.json', 'ai/ai-context.md']
      .map(file => readFile(path.join(cwd, file), 'utf8')));
    assert.throws(() => execFileSync(process.execPath, ['scripts/version-game.mjs', 'patch'],
      { cwd, stdio: 'pipe', windowsHide: true }), error => /versions are assigned on main/.test(error.stderr.toString()));
    assert.deepEqual(await Promise.all(['package.json', 'package-lock.json', 'ai/ai-context.md']
      .map(file => readFile(path.join(cwd, file), 'utf8'))), before, 'Rejected worktree bumps change no files');
    await writeFile(path.join(cwd, 'src/task.js'), `export const task = '${name}';\n`);
    taskAddresses.push(taskAddress);
  }
  await delay(5_100);
  const tasks = await Promise.all(taskAddresses.map(async url => (await fetch(`${url}build-info.json`)).json()));
  assert.notEqual(tasks[0].previewLabel, tasks[1].previewLabel, 'Running previews have distinct compact labels');
  assert.notEqual(tasks[0].build, tasks[1].build, 'Different parallel changes have distinct fingerprints');
  assert.equal(tasks[0].version, tasks[1].version, 'Parallel tasks intentionally retain the inherited version');

  execFileSync(process.execPath, ['scripts/version-game.mjs', 'patch'], { cwd: fixture });
  await delay(5_100);
  const updated = await (await fetch(`${address}build-info.json`)).json();
  assert.equal(updated.version, '1.0.1');
  assert.notEqual(updated.build, original.build);
  assert.match(await readFile(path.join(fixture, 'ai/ai-context.md'), 'utf8'), /`1\.0\.1`/);
  assert.equal(updated.preview, true, 'A version bump is a preview until committed on main');
  git(['add', 'package.json', 'package-lock.json', 'ai/ai-context.md']);
  git(['-c', 'user.name=Preview test', '-c', 'user.email=preview@example.invalid', 'commit', '-qm', 'Integrated change']);
  assert.equal((await (await fetch(`${address}build-info.json`)).json()).preview, false);
  assert.throws(() => execFileSync(process.execPath, ['scripts/version-game.mjs', '1.0.0'],
    { cwd: fixture, stdio: 'pipe', windowsHide: true }), error => /must increase/.test(error.stderr.toString()));
  assert.throws(() => execFileSync(process.execPath, ['scripts/version-game.mjs', '1.0.1'],
    { cwd: fixture, stdio: 'pipe', windowsHide: true }), error => /must increase/.test(error.stderr.toString()));
  execFileSync(process.execPath, ['scripts/version-game.mjs', 'patch'], { cwd: fixture });
  assert.equal(JSON.parse(await readFile(path.join(fixture, 'package.json'), 'utf8')).version, '1.0.2');
  assert.equal((await (await fetch(`${taskAddresses[0]}build-info.json`)).json()).version, '1.0.0',
    'Main advances without relabeling an isolated task');
  const detached = path.join(fixture, 'worktrees/task-b');
  execFileSync('git', ['checkout', '-q', '--detach'], { cwd: detached });
  const detachedInfo = await (await fetch(`${taskAddresses[1]}build-info.json`)).json();
  assert.equal(detachedInfo.branch, null);
  assert.equal(detachedInfo.preview, true);
  const built = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  const manifest = JSON.parse(await readFile('dist/build-manifest.json', 'utf8'));
  const page = await readFile('dist/index.html', 'utf8');
  assert.equal(built.channel, 'pages');
  assert.equal(built.version, JSON.parse(await readFile('package.json', 'utf8')).version);
  assert.equal(built.build, manifest.build);
  assert.ok(page.includes(JSON.stringify(built)), 'Pages embeds the published build identity');
  console.log('[build-preview] OK: preview isolation, parallel worktrees, integration-only versions, content identity, Pages metadata');
} finally {
  for (const pid of serverPids) process.kill(pid);
  // mkdtemp owns this exact child of the OS temporary directory.
  assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
  assert.ok(path.basename(fixture).startsWith('civilization-build-preview-'));
  await rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
