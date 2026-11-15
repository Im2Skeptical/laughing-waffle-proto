import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const output='artifacts/perf-hillclimb/operator-resume-20261105-r1';
const pause='artifacts/perf-hillclimb/operator-pause-20261105-r1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const snapshot=JSON.parse(await readFile(`${pause}/snapshot.json`));
const sources=JSON.parse(await readFile(`${pause}/sources.json`));
const evidence=JSON.parse(await readFile(`${pause}/evidence-inventory.json`));
const sourceChanges=[],buildChanges=[],dirtyChanges=[],evidenceChanges=[];
async function compare(file,expected,list){try{const actual=hash(await readFile(file));if(actual!==expected)list.push({file,expected,actual});}catch(e){list.push({file,expected,error:e.code??e.message});}}
for(const [file,h]of Object.entries(sources))await compare(file,h,sourceChanges);
for(const [file,v]of Object.entries(snapshot.builds))await compare(file,v.sha256,buildChanges);
for(const v of snapshot.dirty)await compare(v.file,v.sha256,dirtyChanges);
for(const [file,v]of Object.entries(evidence))await compare(file,v.sha256,evidenceChanges);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const actualFiles=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/'));
actualFiles.push('package.json','package-lock.json','docs/performance/perf-hillclimb-20261104/HARNESS.md');
const added=actualFiles.filter(f=>!(f in sources)),missing=Object.keys(sources).filter(f=>!actualFiles.includes(f));
const result={at:new Date().toISOString(),operator:'Cam explicit resume',phaseA:'NOT SOUND',head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),sourceCount:Object.keys(sources).length,sourceChanges,added,missing,buildChanges,dirtyChanges,evidenceCount:Object.keys(evidence).length,evidenceChanges,node:{version:process.version,sha256:hash(await readFile(process.execPath))},scope:'Resume integrity only; retains prior acceptance/rejection/contention. No source modification, new score or complete Phase A acceptance.'};
await writeFile(`${output}/authentication.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({head:result.head,branch:result.branch,sources:result.sourceCount,sourceChanges:sourceChanges.length,added:added.length,missing:missing.length,buildChanges:buildChanges.length,dirtyChanges:dirtyChanges.length,evidence:result.evidenceCount,evidenceChanges:evidenceChanges.length,node:result.node.version}));
assert.equal(result.head,snapshot.head);assert.equal(result.branch,snapshot.branch);
assert.deepEqual(sourceChanges,[]);assert.deepEqual(added,[]);assert.deepEqual(missing,[]);assert.deepEqual(buildChanges,[]);
// Metadata/evidence differences are preserved for diagnosis, never normalized away.
