import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const out='artifacts/perf-hillclimb/approved-hold-adoption-parent-r1-20261105/before';
const hash=b=>createHash('sha256').update(b).digest('hex');
const plan=JSON.parse(await readFile('artifacts/perf-hillclimb/feedback-final-j8-receipts-r1-20261105/plan.json'));
const changed=[];
const currentFiles=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/'));
currentFiles.push('package.json','package-lock.json','docs/performance/perf-hillclimb-20261104/HARNESS.md');
const added=currentFiles.filter(f=>!(f in plan.sources));
const missing=Object.keys(plan.sources).filter(f=>!currentFiles.includes(f));
for(const [file,expected] of Object.entries(plan.sources))if(hash(await readFile(file))!==expected)changed.push(file);
const after=JSON.parse(await readFile('dist/build-manifest.json'));
const assets={};
for(const name of ['bundle','worker','saveLoadWorker','stylesheet']){
 const actual=hash(await readFile('dist/'+after[name]));
 assets[name]={matrixPath:plan.build[name],actualPath:after[name],matrixSha256:plan.assets[plan.build[name]],actualSha256:actual,equal:actual===plan.assets[plan.build[name]]};
}
const fixture='images/dev-fixtures/performance-start.json.gz';
assets.fixture={actualSha256:hash(await readFile('dist/'+fixture)),matrixSha256:plan.assets[fixture]};
assets.fixture.equal=assets.fixture.actualSha256===assets.fixture.matrixSha256;
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8',windowsHide:true}).trim();
const result={verifiedAt:new Date().toISOString(),branch,node:process.version,execArgv:process.execArgv,
 sourceFileCount:Object.keys(plan.sources).length,added,missing,changed,assets,buildBefore:plan.build,buildAfter:after,
 scope:'declared executable/source/contract and built asset stability; excludes root metadata and makes no whole-worktree or uncontended timing claim'};
await writeFile(`${out}/final-source-integrity.json`,JSON.stringify(result,null,2));
assert.deepEqual(added,[]);assert.deepEqual(missing,[]);assert.deepEqual(changed,[]);assert.equal(branch,'perf/hillclimb-20261104');
assert.ok(Object.values(assets).every(x=>x.equal),'final rebuild executable/fixture bytes match measured build');
const {loadFrozenLifeOracle,BASE_PIN,DEFAULT_BASE}=await import(pathToFileURL(process.cwd()+'/scripts/perf-hillclimb/frozen-life-oracle.mjs'));
const frozen=await loadFrozenLifeOracle({baseManifest:DEFAULT_BASE,expectedBaseIdentity:BASE_PIN,
 manifest:'artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/addendum/manifest.json',
 expectedIdentity:'6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8'});
const integrity={verifiedAt:new Date().toISOString(),base:frozen.integrity,lifeIdentity:frozen.manifest.identity,
 sdk:frozen.manifest.files[frozen.manifest.sdk],browserRuntimeSha256:hash(await readFile('scripts/perf-hillclimb/browser-runtime.mjs')),
 phaseA:'NOT SOUND',scope:'strict frozen authority/source authentication; no acceptance/scoring'};
await writeFile(`${out}/frozen-authority-integrity.json`,JSON.stringify(integrity,null,2));
assert.equal(integrity.browserRuntimeSha256,'f81efb2accba8b8ae3b7c35db109835c8639aa91c87c7e3ec69541fc608714f1');
console.log(JSON.stringify({sourceFileCount:result.sourceFileCount,changed,assetsEqual:Object.values(assets).every(x=>x.equal),baseFiles:frozen.integrity.files,lifeSdk:integrity.sdk.sha256,browserRuntimeSha256:integrity.browserRuntimeSha256}));
