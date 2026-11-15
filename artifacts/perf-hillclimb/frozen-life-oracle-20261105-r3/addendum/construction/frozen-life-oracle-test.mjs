import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BASE_PIN,DEFAULT_BASE,OWNED,sha256,identity,validateBase,buildFrozenLifeOracle,loadFrozenLifeOracle,pinnedBuildTool,compileCaptured,assertClosedBundle} from './frozen-life-oracle.mjs';
import {createLifeExpectations,assertExact,assertExactState,assertFiveSlots,planningPause} from './frozen-life-expectations.mjs';

const copy=structuredClone,json=v=>JSON.stringify(v,null,2)+'\n';
export async function run({output,baseManifest=DEFAULT_BASE,manifest,expectedIdentity}={}){
  assert.ok(output,'new explicit --output required');const directory=path.resolve(output);await mkdir(directory,{recursive:false});
  const report={status:'RUNNING',phaseA:'NOT SOUND',kind:'Node expected-data functional proof only',conformance:[],controls:[],failures:[]},files={};
  const retain=async(name,value,raw=false)=>{const bytes=raw?value:json(value);await mkdir(path.dirname(path.join(directory,name)),{recursive:true});await writeFile(path.join(directory,name),bytes,{flag:'wx'});files[name]={bytes:Buffer.byteLength(bytes),sha256:sha256(bytes)};};
  async function negative(name,fn,pattern){
    let error;try{await fn();}catch(e){error=e;}
    assert.ok(error,`${name}: required rejection missing`);assert.match(error.message,pattern,`${name}: wrong failure gate`);
    const evidence={name,status:'PASS expected rejection',expected:String(pattern),error:error.stack};report.controls.push(evidence);await retain('controls/'+name+'.json',evidence);
  }
  try{
    const before=await validateBase(baseManifest,BASE_PIN);await retain('original-integrity-before.json',before.integrity);
    if(!manifest){const m=await buildFrozenLifeOracle({baseManifest,expectedBaseIdentity:BASE_PIN,output:path.join(directory,'addendum')});manifest=path.join(directory,'addendum/manifest.json');expectedIdentity=m.identity;}
    report.manifest=path.relative(directory,path.resolve(manifest)).replaceAll('\\','/');report.pin=expectedIdentity;
    const options={manifest,expectedIdentity,baseManifest,expectedBaseIdentity:BASE_PIN};
    const loaded=await loadFrozenLifeOracle(options);report.sdk=loaded.manifest.files[loaded.manifest.sdk];report.base=loaded.integrity;
    const sourcesBefore={};for(const file of OWNED)sourcesBefore[file]=sha256(await readFile(new URL(file,import.meta.url)));
    for(const seed of [123,424242,99117]){
      const e=createLifeExpectations(loaded,seed),checks=[];
      const record=async(label,state)=>{assertFiveSlots(state);await retain(`conformance/${seed}/${label}.json`,state);checks.push({label,stateSha256:sha256(state),rngSha256:sha256(state.rng),tSec:state.tSec});};
      for(let n=0;n<=5;n++)await record('logical-prefix'+n,e.logical[n]);
      for(const name of ['enteredPaused','staged','accepted','adopted','history','committed'])await record(name,e[name]);
      await retain(`conformance/${seed}/itinerary.json`,{trace:e.trace,nodeId:e.nodeId,offerId:e.offerId,offerIndex:e.offerIndex,offer:e.offer,targetSec:e.targetSec,presentationArgs:e.presentationArgs});
      await retain(`conformance/${seed}/staged-decision.json`,e.stagedDecision);
      // Full hover/drag DTOs, from independent fresh prefix states with explicit
      // arguments; no actual modal state or current model data is an input.
      const hoverArgs={nodeId:e.nodeId,preview:{previewOptionId:e.category.optionId,previewOfferId:e.offerId}};
      const hoverA=e.presentation(planningPause(loaded.oracle,e.replayPrefix(3)),hoverArgs);
      assertExact(hoverA,e.presentation(planningPause(loaded.oracle,e.replayPrefix(3)),hoverArgs),'independent hover DTO');
      await retain(`conformance/${seed}/hover-decision.json`,{args:hoverArgs,decision:hoverA});
      const shop=e.replayPrefix(3),lin=shop.civilization.vassalLineage,v=lin.vassalsById[lin.currentVassalId],site=shop.world.sites.find(s=>s.regionId===v.locationRegionId);
      const free=site.detailedState.practiceSlots.findIndex(s=>s===null);assert.ok(free>=0,'frozen free slot');
      const dragArgs={nodeId:e.nodeId,preview:{draftMove:{fromOffer:true,kind:'practice',id:e.offerId,toIndex:free,origin:null}}};
      const drag=e.presentation(planningPause(loaded.oracle,shop),dragArgs);assert.equal(drag.draftPreview.ok,true,'captured drag succeeds');
      assertExact(drag,e.presentation(planningPause(loaded.oracle,e.replayPrefix(3)),dragArgs),'independent drag DTO');
      await retain(`conformance/${seed}/drag-decision.json`,{args:dragArgs,decision:drag});
      // Replay all official seconds from accepted prefix5, checking the final
      // recorded target and three further seconds against fresh authoritative
      // histories. The original SDK owns the 60-tick-second operation.
      const continued=loaded.oracle.deserializeGameState(e.adopted);loaded.oracle.initializeReplayClock(continued,0);
      for(let sec=1;sec<=e.targetSec+3;sec++){
        assert.equal(loaded.oracle.advanceReplayStateOneSecond(continued).ok,true,'official continuation success');
        if(sec===e.targetSec||sec>e.targetSec){
          const state=loaded.oracle.serializeGameState(continued),expected=e.replayPrefix(5,sec);
          assertExactState(state,expected,{targetSec:sec,label:'direct accepted official seconds versus full authoritative history'});
          if(sec===e.targetSec)assertExactState(state,e.history,{label:'direct target versus immutable history'});
          await record('official-'+sec,state);
        }
      }
      // Historical cursor targets proposed for later real UI inspection.
      for(const sec of [16,17])await record('committed-history-'+sec,planningPause(loaded.oracle,e.replayPrefix(5,sec)));
      const stateBad=mutate=>{const bad=copy(e.staged);mutate(bad);assertExactState(bad,e.staged);};
      await negative(`${seed}-wrong-target`,()=>stateBad(s=>s.tSec++),/wrong actual target/);
      await negative(`${seed}-wrong-RNG`,()=>stateBad(s=>s.rng.vassalSeed++),/strict full result differs/);
      await negative(`${seed}-wrong-known-field`,()=>stateBad(s=>s.year++),/strict full result differs/);
      await negative(`${seed}-extra-field`,()=>stateBad(s=>s.unexpectedOracleField=true),/strict full result differs/);
      await negative(`${seed}-wrong-purchase`,()=>stateBad(s=>{const l=s.civilization.vassalLineage;l.vassalsById[l.currentVassalId].lifeMap.nodeStates[e.nodeId].purchasedOffers[0].offerId='WRONG';}),/strict full result differs/);
      await negative(`${seed}-wrong-slot`,()=>stateBad(s=>s.world.sites.find(x=>x.detailedState).detailedState.practiceSlots.pop()),/strict full result differs/);
      await negative(`${seed}-wrong-tableau`,()=>{const bad=copy(e.stagedDecision);bad.settlement.practiceSlots.find(Boolean).practiceId='WRONG';assertExact(bad,e.stagedDecision,'full tableau');},/strict full result differs/);
      await negative(`${seed}-extra-DTO-field`,()=>assertExact({...copy(e.stagedDecision),extra:true},e.stagedDecision),/strict full result differs/);
      await negative(`${seed}-fractional-target`,()=>e.replayPrefix(4,0.5),/assertion|false|true/i);
      await negative(`${seed}-implicit-presentation-arguments`,()=>e.presentation(e.staged,{nodeId:e.nodeId}),/explicit hover\/drag/);
      // Mutating returned copies must not alter retained corpus, future replay,
      // or a subsequently derived DTO. These are purity/isolation checks, not
      // the parent's pending actual private-draft mutation control.
      const a=e.replayPrefix(4);a.rng.vassalSeed++;a.world.sites.find(s=>s.detailedState).detailedState.practiceSlots.pop();
      assertExactState(e.replayPrefix(4),e.logical[4],{label:'independent replay output mutation isolation'});
      const dto=e.presentation(e.staged,e.presentationArgs);dto.settlement.practiceSlots.find(Boolean).practiceId='MUTATED';dto.nodeState.purchasedOffers[0].offerId='MUTATED';
      assertExact(e.presentation(e.staged,e.presentationArgs),e.stagedDecision,'presentation output mutation isolation');
      const f=loaded.fixturesFor(seed);f.shop.state.rng.baseSeed=-1;f.history.trace[3].payload.offerId='MUTATED';
      assert.equal(loaded.fixturesFor(seed).shop.state.rng.baseSeed,seed);assert.equal(loaded.fixturesFor(seed).history.trace[3].payload.offerId,e.offerId);
      report.conformance.push({seed,status:'PASS',checks,purity:'PASS input and returned-copy isolation',fullPresentation:'PASS staged/hover/drag; explicit args',officialSeconds:e.targetSec+3});
      await retain(`conformance/${seed}/checks.json`,report.conformance.at(-1));console.log(`[frozen-life] seed=${seed} full prefix/direct/DTO/official-second conformance PASS`);
    }
    await negative('wrong-base-pin',()=>loadFrozenLifeOracle({...options,expectedBaseIdentity:'0'.repeat(64)}),/base pin/);
    await negative('wrong-addendum-pin',()=>loadFrozenLifeOracle({...options,expectedIdentity:'0'.repeat(64)}),/addendum pin/);
    await negative('missing-addendum-pin',()=>loadFrozenLifeOracle({...options,expectedIdentity:undefined}),/explicit SHA256 pin/);
    await negative('reused-output',()=>buildFrozenLifeOracle({baseManifest,expectedBaseIdentity:BASE_PIN,output:path.dirname(manifest)}),/EEXIST/);
    // Each addendum control owns its complete copy. Repin deliberately in some
    // tests to get past the outer digest and exercise the deeper gate.
    async function mutant(name,change,{repin=false,pattern}={}){
      const dir=path.join(directory,'copies',name);await mkdir(path.dirname(dir),{recursive:true});await cp(path.dirname(manifest),dir,{recursive:true,errorOnExist:true,force:false});
      const m=JSON.parse(await readFile(path.join(dir,'manifest.json')));
      await change(m,dir);if(repin)m.identity=identity(m);await writeFile(path.join(dir,'manifest.json'),json(m));
      await negative(name,()=>loadFrozenLifeOracle({...options,manifest:path.join(dir,'manifest.json'),expectedIdentity:repin?m.identity:expectedIdentity}),pattern);
    }
    async function changeFile(m,dir,name,bytes){await writeFile(path.join(dir,name),bytes);m.files[name]={bytes:Buffer.byteLength(bytes),sha256:sha256(bytes)};}
    await mutant('corrupt-entry',async(m,d)=>{await writeFile(path.join(d,m.entry),'// corrupt\n');},{pattern:/file size|file hash/});
    await mutant('corrupt-sdk',async(m,d)=>{await writeFile(path.join(d,m.sdk),'throw Error("UNVALIDATED SDK EXECUTED");\n');},{pattern:/file size|file hash/});
    await mutant('corrupt-metadata',async m=>{m.runtime.node='changed';},{pattern:/manifest identity/});
    await mutant('repinned-wrong-entry',async(m,d)=>{await changeFile(m,d,m.entry,'// unapproved entry\n');},{repin:true,pattern:/exact extension entry/});
    await mutant('repinned-wrong-options',async(m,d)=>{const o=JSON.parse(await readFile(path.join(d,m.options)));o.treeShaking=false;await changeFile(m,d,m.options,json(o));},{repin:true,pattern:/exact build options/});
    const sourceName=Object.keys(loaded.manifest.inputs).find(n=>n==='src/model/actions.js');assert.ok(sourceName);
    await mutant('repinned-corrupt-captured-source',async(m,d)=>{const name='inputs/'+sourceName;const bytes=(await readFile(path.join(d,name))).toString()+'\n// modified source\n';await changeFile(m,d,name,bytes);m.inputs[sourceName]=m.files[name];},{repin:true,pattern:/baseline source correspondence/});
    await mutant('repinned-path-escape',async m=>{m.files['../escape.mjs']={bytes:1,sha256:'0'.repeat(64)};},{repin:true,pattern:/path escape/});
    await mutant('repinned-absolute-path',async m=>{m.files['C:/escape.mjs']={bytes:1,sha256:'0'.repeat(64)};},{repin:true,pattern:/path escape/});
    await mutant('repinned-tool-metadata',async m=>{m.tool.files['node_modules/esbuild/lib/main.js'].sha256='0'.repeat(64);},{repin:true,pattern:/recorded build tool identity/});
    await mutant('repinned-uncaptured-input',async(m,d)=>{
      const name='src/model/vassal-life-map/decision-preparation.js',bytes='export const uncaptured = true;\n';
      await changeFile(m,d,'inputs/'+name,bytes);m.inputs[name]=m.files['inputs/'+name];
      const meta=JSON.parse(await readFile(path.join(d,m.metafile)));meta.inputs['captured:'+name]={bytes:bytes.length,imports:[]};await changeFile(m,d,m.metafile,json(meta));
    },{repin:true,pattern:/uncaptured input/});
    for(const [name,code,imports,pattern]of [
      ['dynamic-import','export const x=()=>import("node:fs");',[],/dynamic import/],
      ['dynamic-require','export const x=()=>require("node:fs");',[],/prohibited require/],
      ['mutable-package-import','import x from "esbuild";',[{path:'esbuild',external:true}],/prohibited external/],
      ['unnecessary-builtin','import x from "node:fs";',[{path:'node:fs',external:true}],/prohibited external/],
    ])await mutant('repinned-'+name,async(m,d)=>{
      await changeFile(m,d,m.sdk,code);const meta=JSON.parse(await readFile(path.join(d,m.metafile)));Object.values(meta.outputs)[0].imports=imports;await changeFile(m,d,m.metafile,json(meta));
    },{repin:true,pattern});
    // Base controls use a complete owned copy, retained with its corrupt bytes.
    // One full copy per control is deliberately explicit; never alter originals.
    for(const [name,kind]of [['base-corrupt-source','source'],['base-corrupt-sdk','sdk'],['base-corrupt-manifest','manifest'],['base-path-escape','path']]){
      const dir=path.join(directory,'copies',name);await cp(path.dirname(baseManifest),dir,{recursive:true,errorOnExist:true,force:false});
      const m=JSON.parse(await readFile(path.join(dir,'manifest.json')));
      if(kind==='source')await writeFile(path.join(dir,'sources/src/model/actions.js'),'// corrupt baseline source\n');
      if(kind==='sdk')await writeFile(path.join(dir,m.sdk.file),'throw Error("BASE SDK EXECUTED BEFORE VALIDATION");\n');
      if(kind==='manifest'){m.source.sourceId='0'.repeat(64);await writeFile(path.join(dir,'manifest.json'),json(m));}
      if(kind==='path'){m.files['../escape.js']={bytes:0,sha256:sha256('')};m.identity=identity(m);await writeFile(path.join(dir,'manifest.json'),json(m));}
      await negative(name,()=>validateBase(path.join(dir,'manifest.json'),BASE_PIN),kind==='source'||kind==='sdk'?/file size|file hash/:/base manifest (pin|identity)/);
    }
    const {tool}=await pinnedBuildTool();
    // The resolver itself must fail even with real current bytes available on
    // disk. This exercises plugin resolution, rather than a metadata-only check.
    for(const [name,request,pattern]of [
      ['resolver-decision-preparation','./src/model/vassal-life-map/decision-preparation.js',/uncaptured import/],
      ['resolver-projection-chunk','./src/model/projection-chunk.js',/uncaptured import/],
      ['resolver-current-absolute',path.resolve('src/model/actions.js').replaceAll('\\','/'),/uncaptured\/nonrelative/],
      ['resolver-package','esbuild',/uncaptured\/nonrelative/],
      ['resolver-path-escape','../src/model/actions.js',/path escape/],
    ])await negative(name,()=>compileCaptured(tool.build,before.sources,`export * from ${JSON.stringify(request)};\n`),pattern);
    await negative('bundle-hidden-static-import',()=>assertClosedBundle({outputs:{'x':{imports:[]}}},'import x from "node:fs";',[]),/imports must match metafile/);
    const after=await validateBase(baseManifest,BASE_PIN);assertExact(after.integrity,before.integrity,'original base final integrity');
    for(const file of OWNED)assert.equal(sha256(await readFile(new URL(file,import.meta.url))),sourcesBefore[file],`executed dependency unchanged ${file}`);
    // Revalidate pinned addendum after controls; originals and immutable addendum
    // must both still load. Do not waive any earlier parent's failed gate.
    const final=await loadFrozenLifeOracle(options);assert.equal(final.manifest.identity,expectedIdentity);
    await retain('original-integrity-after.json',{status:'PASS',before:before.integrity,after:after.integrity});
    report.executedSources=sourcesBefore;report.status='PASS';report.integrity='PASS';report.limitations=['Independent audit pending; Phase A NOT SOUND','No candidate or browser/private Life inspector exercised','No device latency or performance claim','Knowledge overlay requires independent facts and caller-proven trigger; helper does not infer or copy knowledge from actual output','Original failed provenance gates remain unchanged'];
  }catch(error){report.status='FAILED';report.failures.push({error:error.stack});process.exitCode=1;}
  report.files=files;await writeFile(path.join(directory,'results.json'),json(report),{flag:'wx'});
  console.log(`[frozen-life] ${report.status} seeds=${report.conformance.length} controls=${report.controls.length} results=${path.join(directory,'results.json')}`);
  if(report.failures.length)console.error(report.failures[0].error);
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>{const[k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')];}));
  await run({output:args.output,baseManifest:args.base??DEFAULT_BASE,manifest:args.manifest,expectedIdentity:args.pin});
}
