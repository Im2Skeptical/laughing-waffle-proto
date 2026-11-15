import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {createServer} from 'node:net';
import { createHash } from 'node:crypto';
import { requestPreview as fetch } from './preview-http.mjs';

const fixture = await mkdtemp(path.join(tmpdir(), 'civilization-build-preview-'));
const serverPids = [];
const blockers = [];
const exec = promisify(execFile);
async function stopOwnedServer(pid) {
  try { process.kill(pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  for (let attempt = 0; attempt < 100; attempt++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await delay(20);
  }
  throw new Error(`Fixture server ${pid} did not exit`);
}
try {
  await mkdir(path.join(fixture, 'scripts'));
  await mkdir(path.join(fixture, 'ai'));
  await mkdir(path.join(fixture, 'src'));
  for (const file of ['artwork-manifest.mjs', 'build-info.mjs', 'local-preview.mjs', 'preview-http.mjs', 'version-game.mjs', 'performance-fixture.mjs', 'performance-fixture-recipe.mjs']) {
    await copyFile(`scripts/${file}`, path.join(fixture, 'scripts', file));
  }
  const registry = JSON.parse(await readFile('images/asset-manifest.json', 'utf8'));
  Object.values(registry.spriteSheets).forEach(group => { group.data = []; });
  await mkdir(path.join(fixture, 'images/dark-fantasy/map-generation-prototype/assets/runtime'), {recursive:true});
  await writeFile(path.join(fixture, 'images/asset-manifest.json'), JSON.stringify(registry));
  for (const name of ['cloud-banks-v2.png', 'cloud-banks-v3.png', 'cloud-cumulus-v1.png'])
    await writeFile(path.join(fixture, 'images/dark-fantasy/map-generation-prototype', name), 'fixture');
  // Fixture servers must not compete with the user's running review previews.
  // Reserve an ephemeral candidate, then give only this copied preview its range.
  const probe=createServer();
  await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  const fixturePort=Math.min(probe.address().port,65_524);
  await new Promise(resolve=>probe.close(resolve));
  const previewPath=path.join(fixture,'scripts/local-preview.mjs');
  await writeFile(previewPath,(await readFile(previewPath,'utf8')).replace('const firstPort = 5184;',`const firstPort = ${fixturePort};`));
  const legacyPreviewPath=path.join(fixture,'scripts/legacy-preview.mjs');
  await writeFile(legacyPreviewPath,(await readFile(previewPath,'utf8')).replace(/const protocol = \d+;/,'const protocol = 2;'));
  await mkdir(path.join(fixture,'src/model'));
  await mkdir(path.join(fixture,'src/defs'));
  await mkdir(path.join(fixture,'src/controllers'));
  await copyFile('src/controllers/performance-start-seeds.js',path.join(fixture,'src/controllers/performance-start-seeds.js'));
  await writeFile(path.join(fixture,'src/model/example.js'),'export const rule = 1;');
  await writeFile(path.join(fixture,'src/defs/example.js'),'export const definition = 1;');
  await mkdir(path.join(fixture,'src/views/ui-root'),{recursive:true});
  await copyFile('src/views/ui-root/settlement-timegraph-window.js',path.join(fixture,'src/views/ui-root/settlement-timegraph-window.js'));
  const pkg = { version: '1.0.0', type: 'module' };
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify(pkg));
  await writeFile(path.join(fixture, 'package-lock.json'), JSON.stringify({ ...pkg, packages: { '': pkg } }));
  await writeFile(path.join(fixture, 'ai/ai-context.md'), 'Game build version: `1.0.0`.\n');
  await writeFile(path.join(fixture, 'index.html'), '<head></head><script id="game-build-info" type="application/json">null</script>');
  await writeFile(path.join(fixture, 'src/example.js'), 'export const value = 1;\n');
  const git = args => execFileSync('git', args, { cwd: fixture, stdio: 'pipe', windowsHide: true });
  git(['init', '-q', '-b', 'main']); git(['add', '.']);
  git(['-c', 'user.name=Preview test', '-c', 'user.email=preview@example.invalid', 'commit', '-qm', 'Fixture']);
  const start = async (cwd = fixture) => (await exec(process.execPath, ['scripts/local-preview.mjs'], {
    cwd, encoding: 'utf8', timeout: 40_000, windowsHide: true,
  })).stdout;
  // Saturate exactly this fixture's preferred range, never the user's ports.
  // Respond promptly: timeouts alone miss the Windows fetch/exit assertion.
  for (let offset = 0; offset < 12; offset++) {
    const blocker = http.createServer((request, response) => {
      if (offset === 1) return; // No headers: bounded probe deadline.
      response.setHeader('Content-Type', 'application/json');
      if (offset === 2) { response.writeHead(200); response.write('{'); return; } // Stalled body.
      if (offset === 3) { response.statusCode = 404; response.end('not a preview'); return; }
      if (offset === 4) { response.end('{invalid JSON'); return; }
      response.end(JSON.stringify({ protocol: 5, workspaceId: 'another-checkout', pid: process.pid }));
    });
    blockers.push(blocker);
    await new Promise((resolve, reject) => {
      blocker.once('error', reject); blocker.listen(fixturePort + offset, '0.0.0.0', resolve);
    });
  }
  // Exercise the Windows failure boundary in an external process, including an
  // intentional uncaught error after concurrent successful HTTP probes.
  const clientScript = path.join(fixture, 'scripts/client-failure.mjs');
  await writeFile(clientScript, `import { requestPreview } from ${JSON.stringify(pathToFileURL(path.join(fixture, 'scripts/preview-http.mjs')).href)};
    await Promise.all(Array.from({length:12},()=>requestPreview('http://127.0.0.1:${fixturePort}/')));
    throw new Error('intentional client failure');`);
  for (let repeat = 0; repeat < 3; repeat++) {
    await assert.rejects(exec(process.execPath, [clientScript], { windowsHide: true, timeout: 5_000 }), error => {
      assert.equal(error.code, 1, 'HTTP failure must exit 1 rather than Windows native abort 0xC0000409');
      assert.match(error.stderr, /intentional client failure/);
      assert.doesNotMatch(error.stderr, /UV_HANDLE_CLOSING/);
      return true;
    });
  }
  await rm(clientScript);
  const recordPath = path.join(fixture, 'artifacts/local-preview.json');
  await mkdir(path.dirname(recordPath), { recursive: true });
  await writeFile(recordPath, 'null');
  const overflowOutput = await start();
  const overflowAddress = overflowOutput.match(/Local preview: (http:\/\/localhost:\d+\/)/)?.[1];
  assert.ok(overflowAddress, 'A saturated preferred range must allocate a ready fallback');
  assert.ok(Number(new URL(overflowAddress).port) < fixturePort || Number(new URL(overflowAddress).port) > fixturePort + 11);
  const overflowStatus = await (await fetch(`${overflowAddress}__preview__/status`)).json();
  serverPids.push(overflowStatus.pid);
  assert.ok((await start()).includes(overflowAddress), 'Fallback must be rediscovered for this checkout');
  assert.equal((await (await fetch(`${overflowAddress}__preview__/status`)).json()).pid, overflowStatus.pid);
  // Only this test's server is stopped. Leave foreign listeners alive until checked.
  await stopOwnedServer(overflowStatus.pid);
  serverPids.splice(serverPids.indexOf(overflowStatus.pid), 1);
  assert.ok(blockers.every(server => server.listening), 'Fallback must preserve all occupied listeners');
  await Promise.all(blockers.map(server => new Promise(resolve => server.close(resolve))));
  blockers.length = 0;
  // A stale record must not confer ownership, even if it points at this port.
  await writeFile(recordPath, JSON.stringify({ protocol: 5, workspaceId: overflowStatus.workspaceId, port: fixturePort }));
  const failingScript = path.join(fixture, 'scripts/failing-preview.mjs');
  await writeFile(failingScript, (await readFile(previewPath, 'utf8')).replace('await serve(port);', "throw new Error('intentional startup failure');"));
  await assert.rejects(exec(process.execPath, [failingScript], { cwd: fixture, windowsHide: true, timeout: 10_000 }), error => {
    assert.equal(error.code, 1, 'A child startup failure remains a real nonzero failure');
    assert.match(error.stderr, /exited before readiness/);
    assert.doesNotMatch(error.stdout, /Local preview:/);
    return true;
  });
  await rm(failingScript);
  // A protocol-2 process keeps the old fixture-key algorithm in memory after an
  // upgrade. It must not be reused even when it belongs to the same checkout.
  const legacy=spawn(process.execPath,[legacyPreviewPath,'--serve',String(fixturePort)],{
    cwd:fixture,windowsHide:true,stdio:'ignore',
  });
  serverPids.push(legacy.pid);
  let legacyStatus=null;
  for(let attempt=0;attempt<80;attempt++){
    try{legacyStatus=await(await fetch(`http://127.0.0.1:${fixturePort}/__preview__/status`,{timeout:250})).json();break;}catch{}
    await delay(50);
  }
  assert.equal(legacyStatus?.protocol,2,'legacy fixture must be serving before the new launcher runs');
  const first = await start();
  const address = first.match(/Local preview: (http:\/\/localhost:\d+\/)/)?.[1];
  assert.ok(address, `Startup must wait for readiness and print a URL; got ${JSON.stringify(first)}`);
  assert.notEqual(new URL(address).port,String(fixturePort),'the old server must be left alone and replaced by a compatible preview');
  const status = await (await fetch(`${address}__preview__/status`)).json();
  assert.equal(status.protocol,5);
  const serverPid = status.pid;
  serverPids.push(serverPid);
  assert.ok(Number.isInteger(serverPid));
  assert.ok((await start()).includes(address), 'Starting again must reuse the same server');
  assert.equal((await (await fetch(`${address}__preview__/status`)).json()).pid, serverPid);
  const response = await fetch(address);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  const original = await (await fetch(`${address}build-info.json`)).json();
  const artwork = await (await fetch(`${address}artwork-manifest.json`)).json();
  assert.ok(html.includes(JSON.stringify(artwork)), 'Local HTML pins its artwork snapshot');
  const artUrl = Object.values(artwork.files)[0].url;
  const artResponse = await fetch(`${address}${artUrl}`);
  assert.equal(artResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await fetch(`${address}${artUrl}`, { headers: { 'If-None-Match': artResponse.headers.get('etag') } })).status, 304);
  assert.equal((await fetch(`${address}artwork-manifest.json`)).headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${address}src/example.js`)).headers.get('cache-control'), 'no-store');
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
    const output = await start(cwd);
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

  execFileSync(process.execPath, ['scripts/version-game.mjs', 'patch'], { cwd: fixture, windowsHide: true });
  await delay(5_100);
  const updated = await (await fetch(`${address}build-info.json`)).json();
  assert.equal(updated.version, '1.0.1');
  assert.notEqual(updated.build, original.build);
  assert.match(await readFile(path.join(fixture, 'ai/ai-context.md'), 'utf8'), /`1\.0\.1`/);
  assert.equal(updated.preview, true, 'A version bump is a preview until committed on main');
  git(['add', 'package.json', 'package-lock.json', 'ai/ai-context.md']);
  git(['-c', 'user.name=Preview test', '-c', 'user.email=preview@example.invalid', 'commit', '-qm', 'Integrated change']);
  await delay(5_100);
  assert.equal((await (await fetch(`${address}build-info.json`)).json()).preview, false);
  assert.throws(() => execFileSync(process.execPath, ['scripts/version-game.mjs', '1.0.0'],
    { cwd: fixture, stdio: 'pipe', windowsHide: true }), error => /must increase/.test(error.stderr.toString()));
  assert.throws(() => execFileSync(process.execPath, ['scripts/version-game.mjs', '1.0.1'],
    { cwd: fixture, stdio: 'pipe', windowsHide: true }), error => /must increase/.test(error.stderr.toString()));
  execFileSync(process.execPath, ['scripts/version-game.mjs', 'patch'], { cwd: fixture, windowsHide: true });
  assert.equal(JSON.parse(await readFile(path.join(fixture, 'package.json'), 'utf8')).version, '1.0.2');
  assert.equal((await (await fetch(`${taskAddresses[0]}build-info.json`)).json()).version, '1.0.0',
    'Main advances without relabeling an isolated task');
  const detached = path.join(fixture, 'worktrees/task-b');
  execFileSync('git', ['checkout', '-q', '--detach'], { cwd: detached, windowsHide: true });
  await delay(5_100);
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
  const deployedArt = JSON.parse(await readFile('dist/artwork-manifest.json', 'utf8'));
  assert.ok(page.includes(JSON.stringify(deployedArt)), 'Pages pins its exact artwork manifest before preloads');
  const deployedUrls = new Set(Object.values(deployedArt.files).map(file => file.url));
  for (const [source, file] of Object.entries(deployedArt.files)) {
    const bytes = await readFile(path.join('dist', file.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.hash, `Published bytes match the manifest: ${source}`);
    if (!source.startsWith('images/sprite-sheets/') || !source.endsWith('.json')) continue;
    const json = JSON.parse(bytes);
    for (const ref of [json.meta.image, ...(json.meta.related_multi_packs ?? [])]) {
      assert.ok(deployedUrls.has(path.posix.normalize(path.posix.join(path.posix.dirname(file.url), ref))),
        `Every published atlas reference uses the same snapshot: ${source} -> ${ref}`);
    }
  }
  console.log('[build-preview] OK: saturated ports, bounded probes, Windows failure exits, startup failure, old-server rejection, preview isolation, parallel worktrees, integration-only versions, content identity, Pages metadata');
} finally {
  await Promise.all(blockers.map(server => new Promise(resolve => server.close(resolve))));
  const stopped = await Promise.allSettled(serverPids.map(stopOwnedServer));
  // mkdtemp owns this exact child of the OS temporary directory.
  assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
  assert.ok(path.basename(fixture).startsWith('civilization-build-preview-'));
  await rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  for (const result of stopped) if (result.status === 'rejected') throw result.reason;
}
