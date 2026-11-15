// Predeclared before the single case. No observation selected by outcome.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,statSync} from 'node:fs';import {createHash} from 'node:crypto';
const root='artifacts/perf-hillclimb/j8-paired-wait-progress-r1-20261115';
const sha=x=>createHash('sha256').update(x).digest('hex');
const plan=JSON.parse(readFileSync(root+'/plan.json')),results=JSON.parse(readFileSync(root+'/results.json'));
assert.equal(results.length,1);assert.ok(results[0].identityVerified&&results[0].cleanupVerified&&results[0].phaseDataAvailable);
const file='artifacts/perf-hillclimb/'+plan.cases[0].id+'/observations.jsonl';assert.ok(statSync(file).size<=2*1024*1024);
const bytes=readFileSync(file),rows=bytes.toString().trim().split('\n').map(x=>JSON.parse(x));
const matches=rows.filter(r=>r.step==='remaining-background-wait-to-prepared');assert.equal(matches.length,1);
const r=matches[0],p=r.phaseWitness,c=p?.cooperative,problems=[];const finite=x=>typeof x==='number'&&Number.isFinite(x);
const valid=(ok,why)=>{if(!ok)problems.push(why);};
valid(p?.version===1&&c?.version===1,'missing/wrong version');valid(p?.collectedAt===c?.collectedAt&&finite(c?.collectedAt),'invalid collection boundary');
valid(p?.loaders?.length===1&&c?.loaders?.length===1&&p?.droppedLoaders===0,'one linked loader required');
valid(c?.invalid===0&&c?.unlinkedJobs===0,'invalid or unlinked accounting');
const l=c?.loaders?.[0],phase=p?.loaders?.[0],start=l?.phaseStarted?.main,end=c?.collectedAt;
valid(l?.id===phase?.id&&l?.id===1&&start===phase?.sites?.['main-enter']?.lastAt,'main/loader marker mismatch');
valid(r.ok===false&&!phase?.sites?.['main-return']&&l?.phase==='main','pending-main population not retained; changed outcome is observer-perturbed diagnostic');
valid(finite(r.finished)&&finite(start)&&finite(end)&&start<r.finished&&r.finished<=end,'invalid original cancel or main window');
let completedWaitMs=0,completedWaitCount=0,openObservedMs=0;
for(const [key,w]of Object.entries(l?.waits??{}))if(w.phase==='main'){
  valid(['main:idle','main:denied-delay'].includes(key)&&['idle','denied-delay'].includes(w.kind),'unknown wait kind');
  valid(Number.isInteger(w.count)&&w.count>0&&w.count<=2147483647&&finite(w.totalMs)&&w.totalMs>=0&&finite(w.maxMs)&&w.maxMs>=0&&w.maxMs<=w.totalMs&&finite(w.lastReturned)&&w.lastReturned>=start&&w.lastReturned<=end,'invalid completed span aggregate');
  completedWaitMs+=w.totalMs;completedWaitCount+=w.count;
}
const open=l?.open;if(open){valid(open.phase==='main'&&!open.ambiguous&&['idle','denied-delay'].includes(open.kind)&&finite(open.started)&&open.started>=start&&open.started<=end,'invalid open/right-censored span');openObservedMs=end-open.started;}
const jobs=(l?.jobs??[]).filter(j=>j.phase==='main');valid(jobs.length>=1&&jobs.length<=2,'missing main job');
for(const j of jobs)valid(['bake','regional'].includes(j.name)&&finite(j.started)&&finite(j.updatedAt)&&j.started>=start&&j.updatedAt>=j.started&&j.updatedAt<=end&&Number.isInteger(j.steps)&&j.steps>=0&&j.steps<=2147483647&&Number.isInteger(j.yields)&&j.yields>=0&&j.yields<=2147483647&&finite(j.longestStepMs)&&j.longestStepMs>=0,'invalid progress snapshot');
valid(jobs.some(j=>j.steps>0),'no matched generator progress');
const windowMs=end-start,accountedWaitMs=completedWaitMs+openObservedMs;valid(finite(windowMs)&&windowMs>0&&finite(accountedWaitMs)&&accountedWaitMs>=0&&accountedWaitMs<=windowMs+0.001,'overlapping or out-of-window totals');
const fraction=problems.length?null:accountedWaitMs/windowMs;
const output={at:new Date().toISOString(),phaseA:'NOT SOUND',inputFile:file,inputSha256:sha(bytes),analysisSha256:sha(readFileSync(new URL(import.meta.url))),
  caseId:plan.cases[0].id,operation:{step:r.step,ok:r.ok,started:r.started,cancel:r.finished,elapsedMs:r.elapsedMs,error:r.error},
  boundary:{mainEntered:start,collectedAt:end,postCancelMs:end-r.finished,scope:'Through explicit post-clock collection. No exact gate state or exact wait total at original deadline inferred.'},
  accounting:{windowMs,completedWaitMs,completedWaitCount,openObservedMs,openRightCensored:!!open,open:open??null,accountedWaitMs,otherWorkOrWaitMs:windowMs-accountedWaitMs,accountedWaitFraction:fraction},
  jobs,invalid:c?.invalid,unlinkedJobs:c?.unlinkedJobs,droppedEvents:p?.droppedEvents,problems,
  hypothesis:'Existing cooperative waits account for at least80% of observed pending-main wall window while matched job advances.',
  verdict:problems.length?'INCONCLUSIVE':fraction>=0.8?'SUPPORTED for this diagnostic population':'FALSIFIED for this diagnostic population',
  limits:'One new intrusive diagnostic population; longestStepMs is shared cumulative stats. Residual is other work/waits, not pure CPU. No neutrality/product cause/fix/speed/P95/scoring acceptance. No extra case/retry.'};
writeFileSync(root+'/accounting.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
