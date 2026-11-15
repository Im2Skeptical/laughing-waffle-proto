// Operator-requested preservation only: no test/build/audit/acceptance operation.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const output='artifacts/perf-hillclimb/operator-pause-20261105-r1';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const paths=[...new Set(git('ls-files','-m','-o','--exclude-standard','-z').split('\0').filter(Boolean))].sort();
const dirty=[];
for(const file of paths){
 const bytes=await readFile(file),target=`${output}/files/${file}`;
 await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});
 await copyFile(file,target);dirty.push({file,bytes:bytes.length,sha256:hash(bytes)});
}
await writeFile(`${output}/tracked.patch`,execFileSync('git',['diff','--binary','HEAD'],{windowsHide:true}));
const sourceFiles=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/'));
sourceFiles.push('package.json','package-lock.json','docs/performance/perf-hillclimb-20261104/HARNESS.md');
const sources={};for(const f of sourceFiles.sort())sources[f]=hash(await readFile(f));
await writeFile(`${output}/sources.json`,JSON.stringify(sources,null,2));
const manifest=JSON.parse(await readFile('dist/build-manifest.json'));
const buildFiles=[...['bundle','worker','saveLoadWorker','stylesheet'].map(k=>'dist/'+manifest[k]),'dist/images/dev-fixtures/performance-start.json.gz','dist/build-manifest.json','dist/build-info.json'];
const builds={};for(const file of buildFiles)builds[file]={bytes:(await readFile(file)).length,sha256:hash(await readFile(file))};
const evidenceRoots=['hold-adaptation-build-r1-20261105','hold-adaptation-controls-r1-20261105','hold-adaptation-controls-r2-20261105','hold-adaptation-controls-r3-20261105','hold-adaptation-controls-r4-20261105','hold-adaptation-reference-r1-20261105','hold-adaptation-negative-r1-20261105'];
const evidence={};
async function inventory(dir){
 let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
 for(const e of entries){const file=`${dir}/${e.name}`;if(e.isDirectory())await inventory(file);else if(e.isFile()){const b=await readFile(file);evidence[file]={bytes:b.length,sha256:hash(b)};}}
}
for(const name of evidenceRoots)await inventory(`artifacts/perf-hillclimb/${name}`);
// Also preserve the actual per-leaf source/observation/oracle bodies in the index.
for(const e of await readdir('artifacts/perf-hillclimb',{withFileTypes:true}))if(e.isDirectory()&&e.name.startsWith('hold-adaptation-reference-r1-20261105-'))await inventory(`artifacts/perf-hillclimb/${e.name}`);
await writeFile(`${output}/evidence-inventory.json`,JSON.stringify(evidence,null,2));
const snapshot={at:new Date().toISOString(),status:'PAUSED',phaseA:'NOT SOUND',head:git('rev-parse','HEAD').trim(),branch:git('branch','--show-current').trim(),gitStatus:git('status','--porcelain=v1'),dirty,sourcesCount:Object.keys(sources).length,sourcesInventorySha256:hash(await readFile(`${output}/sources.json`)),builds,evidenceCount:Object.keys(evidence).length,evidenceInventorySha256:hash(await readFile(`${output}/evidence-inventory.json`)),basePin:'406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000',lifePin:'6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8',scope:'Raw byte preservation and identity inventory; no new verification/audit/score/acceptance. Dirty files copied; ignored evidence remains in its original paths with hashes. No reset/stash/commit/push/merge/deploy.'};
await writeFile(`${output}/snapshot.json`,JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({status:snapshot.status,head:snapshot.head,branch:snapshot.branch,dirtyFiles:dirty.length,sources:snapshot.sourcesCount,evidence:snapshot.evidenceCount,out:output}));
