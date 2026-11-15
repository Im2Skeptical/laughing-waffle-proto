// One-time baseline construction plus read-only candidate loader. This script
// does not measure browser performance and cannot accept its own harness.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {builtinModules} from 'node:module';
import {isDeepStrictEqual} from 'node:util';
import {gunzipSync} from 'node:zlib';
import {build,version as esbuildVersion} from 'esbuild';
import * as current from './oracle-entry.mjs';

export const sha256=value=>createHash('sha256').update(typeof value==='string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');
const seeds=[123,424242,99117];
const ids=['ordinary','selected','shop','history','later-history'];
const builtinSet=new Set(builtinModules.flatMap(name=>[name,name.startsWith('node:')?name:`node:${name}`]));
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const json=value=>JSON.stringify(value,null,2)+'\n';
const manifestIdentity=manifest=>{const {identity,...body}=manifest;return sha256(body);};

function inside(directory,file){
  assert.equal(typeof file,'string','artifact path must be a string');
  const absolute=path.resolve(directory,file),rel=path.relative(directory,absolute);
  assert.ok(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel),'artifact path escapes frozen directory');
  return absolute;
}
function assertEqualState(actual,expected,label){
  assert.ok(isDeepStrictEqual(actual,expected),`${label}: full serialized state differs (actual=${sha256(actual)}, expected=${sha256(expected)})`);
}
export function assertSelfContained(metafile,bundle){
  const externals=[];
  for(const file of Object.values(metafile.outputs))for(const item of file.imports??[]){
    assert.ok(item.external,`SDK has another output/import: ${item.path}`);
    assert.ok(builtinSet.has(item.path),`SDK depends on mutable/non-builtin import: ${item.path}`);
    externals.push(item.path);
  }
  // No variable import()/require() can evade the literal import inventory.
  assert.ok(!/\bimport\s*\(/.test(bundle),'SDK contains a dynamic import');
  assert.ok(!/\brequire\s*\(/.test(bundle),'SDK contains a dynamic/CJS require');
  return [...new Set(externals)].sort();
}

export async function loadFrozenCorpus(filename,{expectedIdentity,seed}={}){
  assert.ok(typeof expectedIdentity==='string'&&/^[a-f0-9]{64}$/.test(expectedIdentity),
    '--fixture-manifest-id must pin the exact previously frozen manifest for A/B reuse');
  const absolute=path.resolve(filename),directory=path.dirname(absolute);
  const manifest=JSON.parse(await readFile(absolute,'utf8'));
  assert.equal(manifest.format,'hillclimb-frozen-corpus-v1');
  assert.equal(manifest.identity,manifestIdentity(manifest),'frozen manifest content identity');
  assert.equal(manifest.identity,expectedIdentity,'frozen workload/oracle identity differs from pinned A/B contract');
  assert.equal(manifest.conformance.status,'PASS','baseline construction conformance required');
  assert.deepEqual(manifest.seeds,seeds);assert.equal(manifest.fixtures.length,15);
  assert.equal(new Set(manifest.fixtures.map(f=>`${f.seed}/${f.id}`)).size,15,'all 15 seed/fixture pairs must be distinct');
  for(const [file,expected]of Object.entries(manifest.files)){
    const bytes=await readFile(inside(directory,file));
    assert.equal(bytes.length,expected.bytes,`frozen file size: ${file}`);
    assert.equal(sha256(bytes),expected.sha256,`frozen file hash: ${file}`);
  }
  assert.equal(manifest.files[manifest.sdk.file]?.sha256,manifest.sdk.sha256);
  const bundle=await readFile(inside(directory,manifest.sdk.file),'utf8');
  const externals=assertSelfContained(JSON.parse(await readFile(inside(directory,manifest.sdk.metafile),'utf8')),bundle);
  assert.deepEqual(externals,manifest.sdk.externalBuiltins);
  const oracle=await import(pathToFileURL(inside(directory,manifest.sdk.file)).href+`?sha256=${manifest.sdk.sha256}`);
  for(const name of ['createFixtures','inspectSaveText','serializeGameState','deserializeGameState','rebuildStateAtSecond',
    'initializeReplayClock','advanceReplayStateOneSecond','getDetailedCivilizationSummary','getDetailedSettlementViewModel'])
    assert.equal(typeof oracle[name],'function',`frozen SDK export ${name}`);
  const fixtures={};
  for(const entry of manifest.fixtures){
    assert.ok(seeds.includes(entry.seed)&&ids.includes(entry.id),'undeclared frozen fixture');
    const text=await readFile(inside(directory,entry.file),'utf8');
    assert.equal(sha256(text),entry.sha256,'frozen save text identity');
    const raw=JSON.parse(text).state;
    const expectedState=JSON.parse(await readFile(inside(directory,entry.expectedStateFile),'utf8'));
    assert.equal(sha256(raw),entry.stateSha256,'raw frozen save state identity');
    assertEqualState(raw,expectedState,'raw expected state is not a transformed source');
    if(entry.seed===seed){
      assert.ok(!Object.hasOwn(fixtures,entry.id),'duplicate frozen fixture');
      fixtures[entry.id]={...entry,text,expectedState};
    }
  }
  if(seed!==undefined)assert.deepEqual(Object.keys(fixtures).sort(),[...ids].sort(),'complete fixed seed fixture set');
  return {manifest,oracle,fixtures,absolute};
}

async function conformanceCheck(fixture,oracle){
  const evidence={seed:fixture.seed,id:fixture.id,textSha256:fixture.sha256,stateSha256:fixture.stateSha256,checks:[]};
  const raw=JSON.parse(fixture.text).state;
  const record=(label,a,b)=>{assertEqualState(a,b,`${fixture.seed}/${fixture.id} ${label}`);
    evidence.checks.push({label,sha256:sha256(a),rngSha256:sha256(a.rng)});};
  const a=current.serializeGameState(current.deserializeGameState(raw));
  const b=oracle.serializeGameState(oracle.deserializeGameState(raw));
  record('decoded current versus frozen',a,b);record('decoded versus raw immutable expected',a,raw);
  for(const target of [...new Set([0,16,17,fixture.seconds])]){
    const aa=current.inspectSaveText(fixture.text),bb=oracle.inspectSaveText(fixture.text);
    assert.equal(aa.ok,true);assert.equal(bb.ok,true);
    const ar=current.rebuildStateAtSecond(aa.nextTimeline,target),br=oracle.rebuildStateAtSecond(bb.nextTimeline,target);
    assert.equal(ar.ok,true,`current rebuild at ${target}`);assert.equal(br.ok,true,`frozen rebuild at ${target}`);
    record(`authoritative rebuild at ${target}`,current.serializeGameState(ar.state),oracle.serializeGameState(br.state));
    if(target===fixture.seconds)record('frontier rebuild versus raw immutable expected',current.serializeGameState(ar.state),raw);
  }
  // No mutation/action shortcut: each side starts from the same immutable raw
  // state and executes all 60 official ticks for each subsequent second.
  const aa=current.deserializeGameState(raw),bb=oracle.deserializeGameState(raw);
  current.initializeReplayClock(aa,fixture.seconds);oracle.initializeReplayClock(bb,fixture.seconds);
  for(let offset=1;offset<=3;offset++){
    const ar=current.advanceReplayStateOneSecond(aa),br=oracle.advanceReplayStateOneSecond(bb);
    assert.deepEqual(ar,br,'continuation result including normal terminal behavior');
    assert.equal(ar.ok,true,`legal continuation ${fixture.seed}/${fixture.id} +${offset}`);
    record(`official-second continuation +${offset}`,current.serializeGameState(aa),oracle.serializeGameState(bb));
  }
  return evidence;
}

export async function freezeCorpus({retained='artifacts/perf-hillclimb/fixture-corpus-d05bab3/manifest.json',output}={}){
  assert.ok(output,'an explicit new --output directory is required; never overwrite a baseline');
  const directory=path.resolve(output);await mkdir(directory,{recursive:false});
  const files={};
  const retain=async(file,bytes)=>{
    const absolute=inside(directory,file);await mkdir(path.dirname(absolute),{recursive:true});await writeFile(absolute,bytes,{flag:'wx'});
    const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);files[file]={bytes:buffer.length,sha256:sha256(buffer)};return files[file];
  };
  try{
    const retainedPath=path.resolve(retained),retainedBytes=await readFile(retainedPath);
    const old=JSON.parse(retainedBytes);assert.deepEqual(old.seeds,seeds);assert.deepEqual(old.failures,[]);assert.equal(old.fixtures.length,15);
    await retain('retained-manifest.json',retainedBytes);
    await retain('construction/freeze-corpus.mjs',await readFile(fileURLToPath(import.meta.url)));
    await retain('construction/freeze-corpus-test.mjs',await readFile(new URL('./freeze-corpus-test.mjs',import.meta.url)));
    const buildOptions={absWorkingDir:root,entryPoints:['scripts/perf-hillclimb/oracle-entry.mjs'],
      outfile:'baseline-sdk.mjs',bundle:true,platform:'node',format:'esm',target:'node24',write:false,metafile:true,
      treeShaking:true,minify:false,logLevel:'silent'};
    const built=await build(buildOptions);
    assert.equal(built.outputFiles.length,1,'SDK must be one self-contained output');
    const bundle=built.outputFiles[0].contents,bundleText=Buffer.from(bundle).toString('utf8');
    const externalBuiltins=assertSelfContained(built.metafile,bundleText);
    const sdkFile=`baseline-sdk-${sha256(bundle)}.mjs`;
    await retain(sdkFile,bundle);await retain('sdk-metafile.json',json(built.metafile));
    const sources={},sourceBytes=new Map();
    for(const filename of Object.keys(built.metafile.inputs).sort()){
      const absolute=path.resolve(root,filename),file=relative(absolute);
      assert.ok(!file.startsWith('../')&&!path.isAbsolute(file),'SDK input outside repository');
      const bytes=await readFile(absolute);sources[file]={...await retain(`sources/${file}`,bytes)};sourceBytes.set(file,bytes);
    }
    // Prove that the retained source bytes, rather than a concurrently changed
    // repository file, produce the exact SDK we will execute. All onLoad reads
    // in this second build are served solely from the captured byte map.
    const snapshotBuild=await build({...buildOptions,plugins:[{name:'immutable-source-snapshot',setup(api){
      api.onLoad({filter:/.*/},args=>{
        const file=relative(args.path),bytes=sourceBytes.get(file);
        assert.ok(bytes,`SDK snapshot build requested an uncaptured source: ${file}`);
        return {contents:bytes,loader:file.endsWith('.json')?'json':'js',resolveDir:path.dirname(args.path)};
      });
    }}]});
    assert.equal(snapshotBuild.outputFiles.length,1);
    assert.equal(sha256(snapshotBuild.outputFiles[0].contents),sha256(bundle),'retained source bytes must reproduce exact frozen SDK');
    const oracle=await import(pathToFileURL(path.join(directory,sdkFile)).href);
    const fixtures=[],conformance=[];
    for(const seed of seeds){
      const generated=current.createFixtures(seed),frozenGenerated=oracle.createFixtures(seed);
      for(const id of ids){
        const prior=old.fixtures.find(f=>f.seed===seed&&f.id===id);assert.ok(prior,`retained ${seed}/${id}`);
        const text=await readFile(inside(path.dirname(retainedPath),prior.file),'utf8');
        assert.equal(sha256(text),prior.sha256,'retained input text hash');
        for(const [name,candidate]of [['current',generated[id]],['frozen SDK',frozenGenerated[id]]]){
          assert.equal(candidate.text,text,`${name} ${seed}/${id} changed retained save text`);
          assert.equal(candidate.sha256,prior.sha256,`${name} ${seed}/${id} changed retained input identity`);
          assert.equal(candidate.stateSha256,prior.stateSha256,`${name} ${seed}/${id} changed retained expected state`);
        }
        const state=JSON.parse(text).state;assert.equal(sha256(state),prior.stateSha256,'retained raw state hash');
        const file=`fixtures/${seed}-${id}.json`,expectedStateFile=`expected/${seed}-${id}-state.json`;
        await retain(file,text);await retain(expectedStateFile,JSON.stringify(state));
        const entry={...prior,file,expectedStateFile};fixtures.push(entry);
        conformance.push(await conformanceCheck({...entry,text},oracle));
      }
      console.log(`[hillclimb-freeze] seed=${seed} exact fixtures=5 conformance=PASS`);
    }
    await retain('conformance.json',json({status:'PASS',policy:'full states and all RNG fields; no normalization; targets0/16/17/frontier; three official continued seconds',fixtures:conformance}));
    const preparedPath=path.resolve('dist/images/dev-fixtures/performance-start.json.gz');
    const prepared=await readFile(preparedPath);const buildManifest=JSON.parse(await readFile('dist/build-manifest.json','utf8'));
    const packet=JSON.parse(gunzipSync(prepared));
    assert.equal(packet.key,buildManifest.performanceFixtureKey,'prepared packet source key agrees with actual build manifest');
    assert.equal(packet.stateData.rng.baseSeed,123,'prepared packet actual seed');
    const ordinary=fixtures.find(f=>f.seed===123&&f.id==='ordinary');
    assert.equal(sha256(packet.stateData),ordinary.stateSha256,'prepared packet initial state equals immutable logical seed123 expected state');
    await retain('prepared-baseline.json.gz',prepared);
    const sourceId=sha256(sources);
    const manifest={format:'hillclimb-frozen-corpus-v1',created:new Date().toISOString(),
      purpose:'immutable baseline workload and expected model SDK; construction conformance only, independent acceptance still required',
      source:{head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
        dirty:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean),
        diffSha256:sha256(execFileSync('git',['diff','--binary'],{cwd:root})),sourceId,inputs:sources},
      runtime:{node:process.version,versions:process.versions,platform:process.platform,arch:process.arch,esbuild:esbuildVersion},
      retained:{file:'retained-manifest.json',sha256:sha256(retainedBytes),originalPath:relative(retainedPath)},
      sdk:{file:sdkFile,sha256:sha256(bundle),metafile:'sdk-metafile.json',externalBuiltins,dynamicImports:false,mutableRepositoryImports:false,
        rebuiltFromCapturedSourceBytes:true},
      seeds,fixtureIds:ids,policy:old.policy,fixtures,
      prepared:{logicalSeed:123,expectedOrdinaryState:ordinary.stateSha256,
        baselinePacketFile:'prepared-baseline.json.gz',baselinePacketSha256:sha256(prepared),baselineSourceKey:buildManifest.performanceFixtureKey,
        baselineLossSec:packet.lossSec,baselineRetainedForecastStates:packet.forecast.stateDataBySecond.length,
        rule:'actual candidate packet hash/source key recorded separately; logical seed123 and immutable expected state do not change'},
      conformance:{status:'PASS',file:'conformance.json',fixtureCount:conformance.length,independentAudit:'NOT ACCEPTED'},files};
    manifest.identity=manifestIdentity(manifest);
    await writeFile(path.join(directory,'manifest.json'),json(manifest),{flag:'wx'});
    await loadFrozenCorpus(path.join(directory,'manifest.json'),{expectedIdentity:manifest.identity,seed:123});
    console.log(`[hillclimb-freeze] PASS fixtures=15 manifest=${manifest.identity} sdk=${manifest.sdk.sha256} source=${sourceId}; ${directory}/manifest.json`);
    return manifest;
  }catch(error){
    await writeFile(path.join(directory,'FREEZE_FAILED.json'),json({status:'FAILED',error:error.stack}));throw error;
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [key,...value]=a.replace(/^--/,'').split('=');return[key,value.join('=')];}));
  try{await freezeCorpus({retained:args.retained,output:args.output});}
  catch(error){console.error(`[hillclimb-freeze] FAIL: ${error.message}`);process.exitCode=1;}
}
