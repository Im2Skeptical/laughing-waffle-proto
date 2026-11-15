// Expected-data construction/loading only. No candidate model imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Kept as explicit constants, independent of mutable base metadata.
export const BASE_PIN='406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000';
export const BASE_SDK='8c163025e51f71818016c358c1f10055beaf343dfc249f3db6713965d5fc40b0';
export const SOURCE_ID='94afaa581ff65f0fdde91ef35bfea36e40129dc58e0ac39bc73a6d1dc9b87ea7';
export const DEFAULT_BASE='artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json';
export const OWNED=['frozen-life-oracle.mjs','frozen-life-expectations.mjs','frozen-life-oracle-test.mjs'];
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const ENTRY="export {applyAction,ActionKinds} from './src/model/actions.js';\nexport {getVassalNodeDecisionPresentation} from './src/model/vassal-life-map/presentation.js';\nexport {canonicalizeSnapshot} from './src/model/canonicalize.js';\n";
const OPTIONS={bundle:true,platform:'node',format:'esm',target:'node24',write:false,metafile:true,treeShaking:true,minify:false,logLevel:'silent',outfile:'life-sdk.mjs'};
const TOOLS={
  'node_modules/esbuild/lib/main.js':'0d1241812c443111d39475dfc66836003e9ef8b87e54d990dd67df29d20010e1',
  'node_modules/esbuild/package.json':'cb7d5b1fe478f8cbaae566a86031b6fdf5f7d444354f35d1cb3cba9adf6d2935',
  'node_modules/@esbuild/win32-x64/esbuild.exe':'cae1bbc86f4df800b01d99e28aea0a154b02243de6797e98f48a9b88a64a7be0',
  'node_modules/@esbuild/win32-x64/package.json':'5b41ac77d55bf2ae0de680d83a9095904e89523c6ef42460cffd0df5ef5a6947',
};
export const sha256=value=>createHash('sha256').update(typeof value==='string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');
export const identity=({identity:ignored,...body})=>sha256(body);
const json=v=>JSON.stringify(v,null,2)+'\n';
function pin(value,label){assert.match(value??'',/^[a-f0-9]{64}$/,`${label} requires an explicit SHA256 pin`);}
export function safeName(name){
  assert.equal(typeof name,'string','artifact path type');
  assert.ok(name.length>0&&!name.includes('\\')&&!name.includes(':')&&!name.startsWith('/')&&name.split('/').every(s=>s&&s!=='.'&&s!=='..'),`artifact path escape/noncanonical path: ${name}`);
  return name;
}
async function readInside(directory,name){
  safeName(name);
  const root=await realpath(directory),absolute=path.resolve(root,...name.split('/')),physical=await realpath(absolute);
  assert.equal(physical.toLowerCase(),absolute.toLowerCase(),`artifact symlink/path escape: ${name}`);
  assert.ok((await stat(physical)).isFile(),`artifact is not a file: ${name}`);
  return readFile(physical);
}
function match(bytes,record,label){
  assert.ok(record&&Number.isSafeInteger(record.bytes)&&record.bytes>=0,`missing size metadata: ${label}`);
  assert.equal(bytes.length,record.bytes,`file size: ${label}`);
  assert.equal(sha256(bytes),record.sha256,`file hash: ${label}`);
}
export function assertClosedBundle(meta,bundle,allowed=[]){
  assert.equal(Object.keys(meta.outputs).length,1,'SDK must have exactly one output');
  assert.ok(!/\bimport\s*\(/.test(bundle),'prohibited dynamic import');
  assert.ok(!/\b(?:require|__require)\s*\(/.test(bundle),'prohibited require');
  // esbuild's pinned ESM emitter writes external import/export statements at
  // line starts. Do not interpret incidental words inside error strings as
  // imports (the original SDK contains "from: ").
  const literal=[...bundle.matchAll(/^\s*(?:import\s+(?:[^;\n]*?\s+from\s*)?|export\s+[^;\n]*?\s+from\s*)["']([^"']+)["']/gm)].map(m=>m[1]);
  const listed=Object.values(meta.outputs).flatMap(o=>o.imports??[]);
  for(const item of listed)assert.ok(item.external&&allowed.includes(item.path),`prohibited external import: ${item.path}`);
  assert.deepEqual([...new Set(literal)].sort(),[...new Set(listed.map(i=>i.path))].sort(),'bundle imports must match metafile');
  assert.deepEqual([...new Set(literal)].sort(),[...allowed].sort(),'explicit minimal builtin allowlist');
  return literal;
}
// Import verified bytes, not a pathname that could change between validation and
// execution. Dynamic code imports INSIDE either SDK are prohibited above.
const importBytes=bytes=>import('data:text/javascript;base64,'+Buffer.from(bytes).toString('base64'));

export async function validateBase(filename,expectedBaseIdentity){
  pin(expectedBaseIdentity,'base');assert.equal(expectedBaseIdentity,BASE_PIN,'wrong base pin');
  const absolute=path.resolve(filename),directory=path.dirname(absolute),manifestBytes=await readFile(absolute),m=JSON.parse(manifestBytes);
  assert.equal(m.identity,expectedBaseIdentity,'base manifest pin');assert.equal(identity(m),expectedBaseIdentity,'base manifest identity');
  assert.equal(m.format,'hillclimb-frozen-corpus-v1');assert.equal(m.source.sourceId,SOURCE_ID,'captured source pin');
  assert.equal(sha256(m.source.inputs),SOURCE_ID,'captured source inventory identity');
  assert.equal(m.sdk.sha256,BASE_SDK,'base SDK pin');assert.equal(m.sdk.rebuiltFromCapturedSourceBytes,true);
  assert.equal(m.conformance.status,'PASS');assert.deepEqual(m.seeds,[123,424242,99117]);assert.equal(m.fixtures.length,15);
  const buffers=new Map();
  for(const [file,expected] of Object.entries(m.files)){const bytes=await readInside(directory,file);match(bytes,expected,file);buffers.set(file,bytes);}
  const sources=new Map();
  for(const [file,expected] of Object.entries(m.source.inputs)){
    safeName(file);const captured=buffers.get('sources/'+file);match(captured,expected,'captured '+file);
    assert.deepEqual(m.files['sources/'+file],expected,'captured file/source correspondence');sources.set(file,captured);
  }
  assert.equal(m.files[m.sdk.file].sha256,BASE_SDK);assert.equal(sha256(buffers.get(m.sdk.file)),BASE_SDK);
  assert.deepEqual(m.sdk.externalBuiltins,['node:assert/strict','node:crypto']);
  assertClosedBundle(JSON.parse(buffers.get(m.sdk.metafile)),buffers.get(m.sdk.file).toString(),m.sdk.externalBuiltins);
  assert.equal(new Set(m.fixtures.map(f=>`${f.seed}/${f.id}`)).size,15);
  for(const f of m.fixtures){
    assert.ok(m.seeds.includes(f.seed)&&['ordinary','selected','shop','history','later-history'].includes(f.id),'undeclared fixture');
    assert.equal(sha256(buffers.get(f.file)),f.sha256,'fixture text identity');
    const raw=JSON.parse(buffers.get(f.file)).state,expected=JSON.parse(buffers.get(f.expectedStateFile));
    assert.equal(sha256(raw),f.stateSha256);assert.deepEqual(raw,expected,'raw expected state correspondence');
  }
  return {manifest:m,manifestBytes,directory,sources,buffers,integrity:{manifestSha256:sha256(manifestBytes),identity:m.identity,sdk:BASE_SDK,sourceId:SOURCE_ID,files:Object.keys(m.files).length,inventorySha256:sha256(m.files)}};
}

// Both resolver AND loader are virtual: esbuild cannot fall back to disk,
// node_modules, a current source file, or an uncaptured transitive dependency.
export async function compileCaptured(build,sources,entry=ENTRY){
  const resolutions=[];
  const result=await build({...OPTIONS,absWorkingDir:ROOT,entryPoints:['life-entry.mjs'],plugins:[{name:'captured-only',setup(api){
    api.onResolve({filter:/.*/},args=>{
      let name;
      if(args.kind==='entry-point'){assert.equal(args.path,'life-entry.mjs');name=args.path;}
      else{
        assert.ok(args.path.startsWith('./')||args.path.startsWith('../'),`uncaptured/nonrelative import: ${args.path}`);
        name=path.posix.normalize(path.posix.join(path.posix.dirname(args.importer),args.path));safeName(name);
        assert.ok(sources.has(name),`uncaptured import: ${name}`);
      }
      resolutions.push({importer:args.importer,path:args.path,resolved:name,kind:args.kind});return {path:name,namespace:'captured'};
    });
    api.onLoad({filter:/.*/,namespace:'captured'},args=>{
      const bytes=args.path==='life-entry.mjs'?Buffer.from(entry):sources.get(args.path);assert.ok(bytes,`uncaptured source: ${args.path}`);
      return {contents:bytes,loader:args.path.endsWith('.json')?'json':'js'};
    });
  }}]});
  assert.equal(result.outputFiles.length,1);const bytes=result.outputFiles[0].contents;
  assertClosedBundle(result.metafile,Buffer.from(bytes).toString(),[]);
  return {bytes,metafile:result.metafile,resolutions};
}
export async function pinnedBuildTool(){
  assert.equal(process.platform,'win32','this construction tool pin is Windows x64 only');assert.equal(process.arch,'x64');
  assert.ok(!process.env.ESBUILD_BINARY_PATH,'external esbuild binary override prohibited');
  const files={};for(const [file,expected]of Object.entries(TOOLS)){
    const bytes=await readInside(ROOT,file);assert.equal(sha256(bytes),expected,`build tool pin: ${file}`);files[file]={bytes:bytes.length,sha256:expected};
  }
  const tool=await import(pathToFileURL(path.join(ROOT,'node_modules/esbuild/lib/main.js')).href);
  assert.equal(tool.version,'0.25.12');return {tool,files};
}

export async function buildFrozenLifeOracle({baseManifest=DEFAULT_BASE,expectedBaseIdentity,output}={}){
  assert.ok(output,'explicit new output directory required');const directory=path.resolve(output);await mkdir(directory,{recursive:false});
  const files={};const retain=async(name,bytes)=>{safeName(name);const target=path.join(directory,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});files[name]={bytes:Buffer.byteLength(bytes),sha256:sha256(bytes)};};
  try{
    const base=await validateBase(baseManifest,expectedBaseIdentity);
    for(const file of OWNED)await retain('construction/'+file,await readFile(new URL(file,import.meta.url)));
    const {tool,files:toolFiles}=await pinnedBuildTool();
    await retain('life-entry.mjs',ENTRY);await retain('build-options.json',json(OPTIONS));
    const built=await compileCaptured(tool.build,base.sources);
    await retain('life-sdk.mjs',built.bytes);await retain('metafile.json',json(built.metafile));await retain('resolutions.json',json(built.resolutions));
    const inputs={};for(const key of Object.keys(built.metafile.inputs).sort()){
      assert.ok(key.startsWith('captured:'),'noncaptured metafile input');const name=key.slice('captured:'.length);
      const bytes=name==='life-entry.mjs'?Buffer.from(ENTRY):base.sources.get(name);assert.ok(bytes,`noncaptured input ${name}`);
      inputs[name]={bytes:bytes.length,sha256:sha256(bytes)};
      if(name!=='life-entry.mjs')await retain('inputs/'+name,bytes);
    }
    const after=await validateBase(baseManifest,expectedBaseIdentity);assert.deepEqual(after.integrity,base.integrity,'original integrity recheck');
    await retain('original-integrity.json',json({status:'PASS',before:base.integrity,after:after.integrity}));
    // Re-read every executed source and build-tool byte at the end. No parent
    // runner or product working-tree source participates in this identity gate.
    for(const file of OWNED)match(await readFile(new URL(file,import.meta.url)),files['construction/'+file],`executed ${file}`);
    const afterTool=await pinnedBuildTool();assert.deepEqual(afterTool.files,toolFiles);
    const m={format:'hillclimb-frozen-life-oracle-v1',created:new Date().toISOString(),base:{identity:BASE_PIN,sdk:BASE_SDK,sourceId:SOURCE_ID,manifestSha256:sha256(base.manifestBytes)},
      entry:'life-entry.mjs',options:'build-options.json',sdk:'life-sdk.mjs',metafile:'metafile.json',resolutions:'resolutions.json',inputs,
      construction:OWNED.map(f=>'construction/'+f),tool:{version:tool.version,files:toolFiles},runtime:{node:process.version,versions:process.versions,platform:process.platform,arch:process.arch},
      policy:{candidateImports:false,createFixturesCalled:false,builtinAllowlist:[],phaseA:'NOT SOUND',conformance:'separate focused test required',independentAudit:'NOT ACCEPTED'},files};
    m.identity=identity(m);await writeFile(path.join(directory,'manifest.json'),json(m),{flag:'wx'});return m;
  }catch(error){await writeFile(path.join(directory,'BUILD_FAILED.json'),json({status:'FAILED',error:error.stack}),{flag:'wx'});throw error;}
}

export async function loadFrozenLifeOracle({manifest,expectedIdentity,baseManifest=DEFAULT_BASE,expectedBaseIdentity}={}){
  pin(expectedIdentity,'addendum');pin(expectedBaseIdentity,'base');
  const absolute=path.resolve(manifest),directory=path.dirname(absolute),m=JSON.parse(await readFile(absolute));
  assert.equal(m.identity,expectedIdentity,'addendum pin');assert.equal(identity(m),expectedIdentity,'addendum manifest identity');
  assert.equal(m.format,'hillclimb-frozen-life-oracle-v1');assert.equal(m.base.identity,expectedBaseIdentity,'addendum/base pin binding');
  assert.equal(m.base.sdk,BASE_SDK);assert.equal(m.base.sourceId,SOURCE_ID);
  const base=await validateBase(baseManifest,expectedBaseIdentity);assert.equal(sha256(base.manifestBytes),m.base.manifestSha256);
  const bytes=new Map();for(const [name,record]of Object.entries(m.files)){const b=await readInside(directory,name);match(b,record,name);bytes.set(name,b);}
  assert.equal(m.entry,'life-entry.mjs');assert.equal(m.sdk,'life-sdk.mjs');assert.equal(m.metafile,'metafile.json');assert.equal(m.options,'build-options.json');assert.equal(m.resolutions,'resolutions.json');
  assert.equal(bytes.get(m.entry).toString(),ENTRY,'exact extension entry');assert.deepEqual(JSON.parse(bytes.get(m.options)),OPTIONS,'exact build options');
  assert.deepEqual(m.construction,OWNED.map(f=>'construction/'+f));
  for(const file of OWNED)match(await readFile(new URL(file,import.meta.url)),m.files['construction/'+file],`executed source ${file}`);
  assert.equal(m.tool.version,'0.25.12');assert.deepEqual(Object.fromEntries(Object.entries(m.tool.files).map(([k,v])=>[k,v.sha256])),TOOLS,'recorded build tool identity');
  const meta=JSON.parse(bytes.get(m.metafile));assertClosedBundle(meta,bytes.get(m.sdk).toString(),[]);
  assert.deepEqual(m.policy.builtinAllowlist,[]);assert.equal(m.policy.candidateImports,false);assert.equal(m.policy.createFixturesCalled,false);
  const names=Object.keys(meta.inputs).sort().map(key=>{assert.ok(key.startsWith('captured:'),'noncaptured metafile input');return key.slice(9);});
  assert.deepEqual(Object.keys(m.inputs).sort(),[...names].sort(),'complete executed input inventory');
  for(const name of names){safeName(name);const b=name==='life-entry.mjs'?bytes.get(m.entry):bytes.get('inputs/'+name);
    match(b,m.inputs[name],`input ${name}`);if(name!=='life-entry.mjs'){assert.ok(base.sources.has(name),`uncaptured input ${name}`);assert.equal(sha256(b),sha256(base.sources.get(name)),`baseline source correspondence ${name}`);}}
  for(const item of JSON.parse(bytes.get(m.resolutions)))assert.ok(names.includes(item.resolved),'resolution is a captured executed input');
  const extension=await importBytes(bytes.get(m.sdk));assert.deepEqual(Object.keys(extension).sort(),['ActionKinds','applyAction','canonicalizeSnapshot','getVassalNodeDecisionPresentation'].sort());
  const sdk=await importBytes(base.buffers.get(base.manifest.sdk.file));
  // No fixture generation API is exposed or invoked by this loader.
  const oracle=Object.freeze(Object.fromEntries(['serializeGameState','deserializeGameState','rebuildStateAtSecond','createTimelineFromInitialState','initializeReplayClock','advanceReplayStateOneSecond','inspectSaveText'].map(n=>{assert.equal(typeof sdk[n],'function');return[n,sdk[n]];})));
  return {manifest:m,extension,oracle,integrity:base.integrity,fixturesFor(seed){
    assert.ok(base.manifest.seeds.includes(seed),'unknown frozen seed');
    return Object.fromEntries(base.manifest.fixtures.filter(f=>f.seed===seed).map(f=>[f.id,{...structuredClone(f),state:JSON.parse(base.buffers.get(f.expectedStateFile)),text:base.buffers.get(f.file).toString()}]));
  }};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>{const[k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')];}));
  try{const m=await buildFrozenLifeOracle({baseManifest:args.base??DEFAULT_BASE,expectedBaseIdentity:args['base-pin'],output:args.output});console.log(JSON.stringify({status:'BUILT; NOT ACCEPTED',identity:m.identity,sdk:m.files[m.sdk].sha256,output:args.output}));}
  catch(error){console.error(error.stack);process.exitCode=1;}
}
