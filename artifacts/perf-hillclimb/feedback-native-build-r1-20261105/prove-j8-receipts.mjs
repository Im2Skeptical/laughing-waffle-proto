import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const id='feedback-final-j8-receipts-r1-20261105',output=`artifacts/perf-hillclimb/${id}`;
await mkdir(output);
const hash=v=>createHash('sha256').update(v).digest('hex');
const save=(n,v)=>writeFile(`${output}/${n}.json`,JSON.stringify(v,null,2));
const old=JSON.parse(await readFile('artifacts/perf-hillclimb/feedback-final-matrix-r2-20261105/plan.json'));
assert.deepEqual(JSON.parse(await readFile('artifacts/perf-hillclimb/feedback-final-matrix-r2-20261105/provenance-after.json')).changed,[]);
const files=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/'));
files.push('package.json','package-lock.json','docs/performance/perf-hillclimb-20261104/HARNESS.md');
assert.deepEqual([...files].sort(),Object.keys(old.sources).sort());
const sources={};for(const f of files)sources[f]=hash(await readFile(f));
const transition=files.filter(f=>sources[f]!==old.sources[f]).sort();
assert.deepEqual(transition,['docs/performance/perf-hillclimb-20261104/HARNESS.md','scripts/perf-hillclimb/artwork-controls.mjs']);
const build=JSON.parse(await readFile('dist/build-manifest.json')),assets={};
for(const k of ['bundle','worker','saveLoadWorker','stylesheet'])assets[build[k]]=hash(await readFile('dist/'+build[k]));
const fixture='images/dev-fixtures/performance-start.json.gz';assets[fixture]=hash(await readFile('dist/'+fixture));
assert.deepEqual(assets,old.assets);
const plan=['desktop','mobile4'].flatMap(pop=>['reference','deferred','retry','exhausted'].map(caseId=>({population:pop,case:caseId,id:`${id}-${pop}-${caseId}`,
 argv:['--experimental-vm-modules','scripts/perf-hillclimb/artwork-controls.mjs',`--population=${pop}`,`--cases=${caseId}`,'--cycles=5',`--id=${id}-${pop}-${caseId}`]})));
await save('plan',{id,sources,build,assets,plan,transition,oldPlan:'feedback-final-matrix-r2-20261105/plan.json',
 runtime:{node:process.version,execArgv:process.execArgv,nodeExecutableSha256:hash(await readFile(process.execPath))},
 phaseA:'NOT SOUND',comparisonEligible:false,contention:'possibly contended diagnostic; no new acceptance or overhead batch',
 scope:'affected J8 raw-receipt persistence reproof; all678 other declared files and all app/assets/fixtures unchanged; no uniform post-change79-cell matrix is claimed; independent audit must assess staged composition'});
const check=async()=>{const changed=[];for(const f of files)if(hash(await readFile(f))!==sources[f])changed.push(f);for(const [f,h]of Object.entries(assets))if(hash(await readFile('dist/'+f))!==h)changed.push('dist/'+f);return changed;};
const results=[],receipts=[];
for(const cell of plan){
 assert.deepEqual(await check(),[]);
 const started=new Date().toISOString();
 const exit=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,cell.argv,{stdio:'inherit',windowsHide:true});p.once('error',reject);p.once('exit',resolve);});
 const dir=`artifacts/perf-hillclimb/${cell.id}`;
 const summary=JSON.parse(await readFile(`${dir}/summary.json`));
 const rows=(await readFile(`${dir}/observations.jsonl`,'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
 const validations=[];
 for(const row of rows){
  const receipt=row.feedbackReceipt;
  if(!receipt)continue;
  let error=null;
  try{
   assert.ok(receipt.record);assert.equal(receipt.record.operationId,row.id);
   assert.equal(receipt.export.records.length,1);assert.equal(receipt.export.records[0].operationId,row.id);
   assert.equal(receipt.export.status.active,false);assert.equal(receipt.export.status.retainedRecords,0);
   assert.ok(Number.isFinite(receipt.export.exportCpuMs)&&receipt.export.exportCpuMs>=0);
   assert.ok(Number.isFinite(receipt.hostRpcMs)&&receipt.hostRpcMs>=0);
  }catch(e){error=e.message;}
  validations.push({observationId:row.observationId,step:row.step,phase:receipt.record?.phase,error});
 }
 const boundRows=rows.filter(r=>(r.feedback?.record??r.feedback)?.binding);
 const missingReceipts=boundRows.filter(r=>!r.feedbackReceipt).map(r=>r.observationId);
 receipts.push({population:cell.population,rowCount:rows.length,boundRows:boundRows.length,receiptCount:validations.length,missingReceipts,validations});
 results.push({...cell,started,finished:new Date().toISOString(),exit,summary:{ok:summary.ok,requestedCases:summary.requestedCases,completedCases:summary.completedCases},
  receiptValidationOk:missingReceipts.length===0&&validations.every(v=>v.error===null)});
 await save('results',results);await save('receipt-controls',receipts);
}
const changed=await check();await save('provenance-after',{changed});assert.deepEqual(changed,[]);
process.exitCode=results.some(r=>r.exit!==0||!r.receiptValidationOk||r.summary.completedCases!==1)?1:0;
console.log(JSON.stringify({cases:results.reduce((n,r)=>n+r.summary.completedCases,0),receipts:receipts.reduce((n,r)=>n+r.receiptCount,0),changed,phaseA:'NOT SOUND'}));
