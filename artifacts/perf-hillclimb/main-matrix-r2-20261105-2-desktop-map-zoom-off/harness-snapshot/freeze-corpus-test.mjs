// Focused guards for SDK isolation and frozen identity loading. With arguments,
// run tamper controls against an existing frozen corpus without modifying it.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,link,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assertSelfContained,loadFrozenCorpus,sha256} from './freeze-corpus.mjs';

const meta=imports=>({outputs:{'baseline.mjs':{imports}}});
assert.deepEqual(assertSelfContained(meta([{path:'node:assert/strict',external:true}]),'export const x=1;'),['node:assert/strict']);
assert.throws(()=>assertSelfContained(meta([{path:'../../src/model/state.js',external:true}]),''),/mutable\/non-builtin/);
assert.throws(()=>assertSelfContained(meta([{path:'next-output.mjs',external:false}]),''),/another output/);
assert.throws(()=>assertSelfContained(meta([]),'const load = name => import(name);'),/dynamic import/);
assert.throws(()=>assertSelfContained(meta([]),'const load = name => require(name);'),/dynamic\/CJS require/);
await assert.rejects(()=>loadFrozenCorpus('irrelevant.json'),/must pin/);

const [filename,identity,evidenceFile]=process.argv.slice(2);
let groups=6;
if(filename){
  const loaded=await loadFrozenCorpus(filename,{expectedIdentity:identity,seed:99117});
  assert.equal(Object.keys(loaded.fixtures).length,5);
  await assert.rejects(()=>loadFrozenCorpus(filename,{expectedIdentity:'0'.repeat(64),seed:123}),/differs from pinned/);
  const directory=await mkdtemp(path.join(os.tmpdir(),'hillclimb-frozen-controls-'));
  try{
    const original=JSON.parse(await readFile(filename,'utf8'));
    const copy=structuredClone(original),source=path.dirname(path.resolve(filename));
    for(const file of Object.keys(copy.files)){
      const target=path.join(directory,file);await mkdir(path.dirname(target),{recursive:true});
      await link(path.join(source,file),target);
    }
    const copyManifest=path.join(directory,'manifest.json');
    await writeFile(copyManifest,JSON.stringify(copy));
    await loadFrozenCorpus(copyManifest,{expectedIdentity:identity,seed:123});
    // Replace a hardlink, never write through it into the immutable source.
    const victim=Object.keys(copy.files)[0],victimPath=path.join(directory,victim);
    await rm(victimPath);await writeFile(victimPath,'tampered bytes');
    await assert.rejects(()=>loadFrozenCorpus(copyManifest,{expectedIdentity:identity,seed:123}),/frozen file size|frozen file hash/);
    copy.source.sourceId='f'.repeat(64);
    await writeFile(copyManifest,JSON.stringify(copy));
    await assert.rejects(()=>loadFrozenCorpus(copyManifest,{expectedIdentity:identity,seed:123}),/manifest content identity/);
    const duplicate=structuredClone(original);duplicate.fixtures[14]=duplicate.fixtures[13];
    const {identity:ignored,...body}=duplicate;duplicate.identity=sha256(body);
    await writeFile(copyManifest,JSON.stringify(duplicate));
    await assert.rejects(()=>loadFrozenCorpus(copyManifest,{expectedIdentity:duplicate.identity,seed:123}),/must be distinct/);
    groups+=5;
  }finally{
    const absolute=path.resolve(directory),base=path.resolve(os.tmpdir());
    assert.ok(absolute.startsWith(base+path.sep)&&path.basename(absolute).startsWith('hillclimb-frozen-controls-'));
    await rm(absolute,{recursive:true,force:true});
  }
}
if(evidenceFile){
  const hashes={};
  for(const file of ['freeze-corpus-test.mjs','freeze-corpus.mjs','oracle-entry.mjs'])
    hashes[file]=sha256(await readFile(new URL(file,import.meta.url)));
  await mkdir(path.dirname(path.resolve(evidenceFile)),{recursive:true});
  await writeFile(evidenceFile,JSON.stringify({status:'PASS',groups,created:new Date().toISOString(),node:process.version,
    frozenManifest:filename?path.resolve(filename):null,frozenManifestIdentity:identity??null,harnessFiles:hashes,
    checks:['builtin imports allowed','mutable external import rejected','split output rejected','dynamic import rejected',
      'dynamic require rejected','unpinned loading rejected',...(filename?['all frozen corpus bytes loaded',
        'wrong pin rejected','tampered frozen file rejected','altered manifest rejected','duplicate fixture pair rejected']:[])],
    scope:'construction/loader mechanism controls only; no independent acceptance or browser timing claim'},null,2));
}
console.log(`[hillclimb-freeze-controls] PASS groups=${groups}; SDK isolation${filename?', pinned identity, all hashes, tamper and duplicate fixture rejection':''}`);
