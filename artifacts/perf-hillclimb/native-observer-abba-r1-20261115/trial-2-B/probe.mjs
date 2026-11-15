import * as diagnosticFs from 'node:fs';
import {spawnSync as diagnosticSpawnSync} from 'node:child_process';
import {createHash as diagnosticHash} from 'node:crypto';
const diagnosticRoot=path.resolve('artifacts/perf-hillclimb/native-observer-abba-r1-20261115/trial-2-B'),diagnosticStarted=new Date().toISOString();
const diagnosticSubject=diagnosticFs.readFileSync('scripts/local-preview.mjs','utf8').replace(/\r\n/g,'\n');
if(diagnosticFs.existsSync(path.join(diagnosticRoot,'fixture-registration.json')))throw Error('Never rerun an attempted fixture');
const diagnosticMode='B',diagnosticPending=[];
const diagnosticData={mode:diagnosticMode,version:1,started:diagnosticStarted,fixture:null,helperCalls:[],prefixCompleted:false,originalError:null,cleanup:null};
function diagnosticSave(name,data){diagnosticFs.writeFileSync(path.join(diagnosticRoot,name+'.json'),JSON.stringify(data,null,2));}
function diagnosticRecord(index,stage,cwd,status,signal,pid,stdout,stderr){
  const out=stdout===null?null:Buffer.from(stdout),err=stderr===null?null:Buffer.from(stderr);

  const native=typeof status==='number'&&(status>>>0)===3221226505;
  const exactPriorSignature=native&&signal===null&&stage.startsWith('worktrees/')&&out?.length===0&&err?.length===0;
  diagnosticData.helperCalls.push({index,stage,cwd,finished:new Date().toISOString(),status,signal,pid,stdoutBytes:out?.length??null,stderrBytes:err?.length??null,stderrAvailable:err!==null,native,exactPriorSignature});
  if(diagnosticMode==='B')diagnosticFlushRaw(index,out,err);
  else Object.assign(diagnosticPending[index],{out,err});
}

function diagnosticFlushStart(start){
  const expectedCwd=path.resolve(diagnosticData.fixture,start.stage==='main'?'':start.stage);
  assert.equal(path.resolve(start.cwd).toLowerCase(),expectedCwd.toLowerCase(),'registered exact fixture cwd');
  const subject=diagnosticFs.readFileSync(path.join(start.cwd,'scripts/local-preview.mjs'),'utf8').replace(/\r\n/g,'\n');
  assert.equal(subject,diagnosticSubject.replace('const firstPort = 5184;','const firstPort = '+start.fixturePort+';'),'actual copied subject only changes original test port');
  diagnosticSave('call-'+start.index+'-start',{...start,subjectNormalizedSha256:diagnosticHash('sha256').update(subject).digest('hex')});
}
function diagnosticFlushRaw(index,out,err){
  if(out)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'call-'+index+'-stdout.txt'),out,{flag:'wx'});
  if(err)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'call-'+index+'-stderr.txt'),err,{flag:'wx'});
  diagnosticSave('calls',diagnosticData.helperCalls);
}
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';

const fixture = await mkdtemp(path.join(tmpdir(), 'civilization-build-preview-'));
diagnosticData.fixture=fixture;diagnosticSave('fixture-registration',{at:diagnosticStarted,fixture});
const serverPids = [];
try {
  await mkdir(path.join(fixture, 'scripts'));
  await mkdir(path.join(fixture, 'ai'));
  await mkdir(path.join(fixture, 'src'));
  for (const file of ['build-info.mjs', 'local-preview.mjs', 'version-game.mjs', 'performance-fixture.mjs', 'performance-fixture-recipe.mjs']) {
    await copyFile(`scripts/${file}`, path.join(fixture, 'scripts', file));
  }
  // Fixture servers must not compete with the user's running review previews.
  // Reserve an ephemeral candidate, then give only this copied preview its range.
  const probe=createServer();
  await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  const fixturePort=Math.min(probe.address().port,65_524);
  await new Promise(resolve=>probe.close(resolve));
  const previewPath=path.join(fixture,'scripts/local-preview.mjs');
  await writeFile(previewPath,(await readFile(previewPath,'utf8')).replace('const firstPort = 5184;',`const firstPort = ${fixturePort};`));
  await mkdir(path.join(fixture,'src/model'));
  await mkdir(path.join(fixture,'src/defs'));
  await writeFile(path.join(fixture,'src/model/example.js'),'export const rule = 1;');
  await writeFile(path.join(fixture,'src/defs/example.js'),'export const definition = 1;');
  await mkdir(path.join(fixture,'src/views/ui-root'),{recursive:true});
  await copyFile('src/views/ui-root/settlement-timegraph-window.js',path.join(fixture,'src/views/ui-root/settlement-timegraph-window.js'));
  const pkg = { version: '1.0.0' };
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify(pkg));
  await writeFile(path.join(fixture, 'package-lock.json'), JSON.stringify({ ...pkg, packages: { '': pkg } }));
  await writeFile(path.join(fixture, 'ai/ai-context.md'), 'Game build version: `1.0.0`.\n');
  await writeFile(path.join(fixture, 'index.html'), '<script id="game-build-info" type="application/json">null</script>');
  await writeFile(path.join(fixture, 'src/example.js'), 'export const value = 1;\n');
  const git = args => execFileSync('git', args, { cwd: fixture, stdio: 'pipe', windowsHide: true });
  git(['init', '-q', '-b', 'main']); git(['add', '.']);
  git(['-c', 'user.name=Preview test', '-c', 'user.email=preview@example.invalid', 'commit', '-qm', 'Fixture']);
  const start = (cwd = fixture) => {
    const index=diagnosticData.helperCalls.length,stage=path.relative(fixture,cwd).split(path.sep).join('/')||'main';
    const start={index,stage,cwd,started:new Date().toISOString(),timeoutMs:40000,fixturePort};
    if(diagnosticMode==='B')diagnosticFlushStart(start);else diagnosticPending.push({start});
    try{const out=execFileSync(process.execPath,['scripts/local-preview.mjs'],{cwd,encoding:'utf8',timeout:40000,windowsHide:true});
      diagnosticRecord(index,stage,cwd,0,null,null,out,null);return out;
    }catch(error){diagnosticRecord(index,stage,cwd,error.status,error.signal??null,error.pid??null,error.stdout??null,error.stderr??null);throw error;}
  };
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
  diagnosticData.prefixCompleted=true;
}catch(error){diagnosticData.originalError={name:error.name,message:error.message,status:error.status??null,signal:error.signal??null,pid:error.pid??null};
  diagnosticData.originalErrorStack=error.stack??String(error);
}finally{
  diagnosticData.prefixClosed=new Date().toISOString();
  if(diagnosticData.originalErrorStack)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'original-error.txt'),diagnosticData.originalErrorStack);
  if(diagnosticMode==='A'){
    try{for(const [index,pending]of diagnosticPending.entries()){
      diagnosticFlushStart(pending.start);
      if(index<diagnosticData.helperCalls.length)diagnosticFlushRaw(index,pending.out,pending.err);
    }}catch(error){diagnosticData.flushError=error.stack??String(error);}
  }
  const logCopies=[];
  for(const [label,relative]of [['main','artifacts/local-preview.log'],['task-a','worktrees/task-a/artifacts/local-preview.log'],['task-b','worktrees/task-b/artifacts/local-preview.log']]){
    const file=path.join(fixture,relative);if(!diagnosticFs.existsSync(file))continue;
    try{if(diagnosticFs.statSync(file).size>1048576)throw Error('bounded log capture');diagnosticFs.copyFileSync(file,path.join(diagnosticRoot,label+'-preview.log'));logCopies.push({label,available:true});}
    catch(error){logCopies.push({label,available:false,error:error.message});}
  }
  diagnosticData.logCopies=logCopies;
  const cleanupFile=path.join(diagnosticRoot,'cleanup-probe.json');
  const result=diagnosticSpawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(diagnosticRoot,'cleanup-owned.ps1'),'-FixtureRoot',fixture,'-SinceIso',diagnosticStarted,'-OutputPath',cleanupFile],{encoding:'utf8',windowsHide:true,timeout:20000});
  diagnosticData.cleanup={status:result.status,signal:result.signal,error:result.error?.message??null,receipt:diagnosticFs.existsSync(cleanupFile)?JSON.parse(diagnosticFs.readFileSync(cleanupFile,'utf8')):null};
  diagnosticData.finished=new Date().toISOString();diagnosticSave('probe-result',diagnosticData);
}
console.log(JSON.stringify({prefixCompleted:diagnosticData.prefixCompleted,helperCalls:diagnosticData.helperCalls.length,exactPriorSignature:diagnosticData.helperCalls.some(c=>c.exactPriorSignature),cleanupStatus:diagnosticData.cleanup?.status,scope:'Diagnostic original-prefix only; not full test pass or native fix'}));
if(diagnosticData.originalError||diagnosticData.cleanup?.status!==0)process.exitCode=1;
