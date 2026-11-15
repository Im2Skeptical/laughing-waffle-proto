// Fresh diagnostic only. Never modifies the subject or prior attempt artifacts.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='artifacts/perf-hillclimb/native-observer-abba-r1-20261115';
const prior='artifacts/perf-hillclimb/native-preview-prefix-r1-20261115';
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
assert.ok(!existsSync(root+'/plan.json'),'Never overwrite a frozen batch');
const replaceOne=(text,from,to)=>{assert.equal(text.split(from).length,2,'unique source binding: '+from.slice(0,90));return text.replace(from,to);};
const trials=[];
for(const [index,mode]of ['A','B','B','A'].entries()){
  const id='trial-'+(index+1)+'-'+mode,cell=root+'/'+id;
  mkdirSync(cell,{recursive:true});
  writeFileSync(cell+'/prepare.mjs',readFileSync(prior+'/prepare.mjs','utf8').replaceAll(prior,cell));
  execFileSync(process.execPath,[cell+'/prepare.mjs'],{stdio:'pipe',windowsHide:true});
  let probe=readFileSync(cell+'/probe.mjs','utf8');
  probe=replaceOne(probe,'const diagnosticData={version:1,',"const diagnosticMode='"+mode+"',diagnosticPending=[];\nconst diagnosticData={mode:diagnosticMode,version:1,");
  const guard=`    const subject=diagnosticFs.readFileSync(path.join(cwd,'scripts/local-preview.mjs'),'utf8').replace(/\\r\\n/g,'\\n');
    assert.equal(subject,diagnosticSubject.replace('const firstPort = 5184;','const firstPort = '+fixturePort+';'),'actual copied subject only changes original test port');
    diagnosticSave('call-'+index+'-start',{index,stage,cwd,started:new Date().toISOString(),timeoutMs:40000,fixturePort,subjectNormalizedSha256:diagnosticHash('sha256').update(subject).digest('hex')});`;
  probe=replaceOne(probe,guard,`    const start={index,stage,cwd,started:new Date().toISOString(),timeoutMs:40000,fixturePort};
    if(diagnosticMode==='B')diagnosticFlushStart(start);else diagnosticPending.push({start});`);
  probe=replaceOne(probe,"  if(out)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'call-'+index+'-stdout.txt'),out,{flag:'wx'});\n  if(err)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'call-'+index+'-stderr.txt'),err,{flag:'wx'});",'');
  probe=replaceOne(probe,"  diagnosticSave('calls',diagnosticData.helperCalls);",`  if(diagnosticMode==='B')diagnosticFlushRaw(index,out,err);
  else Object.assign(diagnosticPending[index],{out,err});`);
  const functions=`
function diagnosticFlushStart(start){
  const expectedCwd=path.resolve(diagnosticData.fixture,start.stage==='main'?'':start.stage);
  assert.equal(path.resolve(start.cwd).toLowerCase(),expectedCwd.toLowerCase(),'registered exact fixture cwd');
  const subject=diagnosticFs.readFileSync(path.join(start.cwd,'scripts/local-preview.mjs'),'utf8').replace(/\\r\\n/g,'\\n');
  assert.equal(subject,diagnosticSubject.replace('const firstPort = 5184;','const firstPort = '+start.fixturePort+';'),'actual copied subject only changes original test port');
  diagnosticSave('call-'+start.index+'-start',{...start,subjectNormalizedSha256:diagnosticHash('sha256').update(subject).digest('hex')});
}
function diagnosticFlushRaw(index,out,err){
  if(out)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'call-'+index+'-stdout.txt'),out,{flag:'wx'});
  if(err)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'call-'+index+'-stderr.txt'),err,{flag:'wx'});
  diagnosticSave('calls',diagnosticData.helperCalls);
}
`;
  probe=replaceOne(probe,"import assert from 'node:assert/strict';",functions+"import assert from 'node:assert/strict';");
  probe=replaceOne(probe,'}finally{\n  const logCopies=[];',`}finally{
  diagnosticData.prefixClosed=new Date().toISOString();
  if(diagnosticMode==='A'){
    try{for(const [index,pending]of diagnosticPending.entries()){
      diagnosticFlushStart(pending.start);
      if(index<diagnosticData.helperCalls.length)diagnosticFlushRaw(index,pending.out,pending.err);
    }}catch(error){diagnosticData.flushError=error.stack??String(error);}
  }
  const logCopies=[];`);
  writeFileSync(cell+'/probe.mjs',probe);
  let driver=readFileSync(prior+'/driver.mjs','utf8').replaceAll(prior,cell);
  driver=replaceOne(driver,"requireEvidence(Array.isArray(probe?.helperCalls),'helperCalls must be an array');",`requireEvidence(Array.isArray(probe?.helperCalls),'helperCalls must be an array');
requireEvidence(probe?.mode==='${mode}'&&typeof probe?.prefixClosed==='string'&&!probe?.flushError,'arm identity or post-closure flush invalid');`);
  writeFileSync(cell+'/driver.mjs',driver);
  copyFileSync(prior+'/cleanup-owned.ps1',cell+'/cleanup-owned.ps1');
  copyFileSync(prior+'/source-authentication.json',cell+'/source-authentication.json');
  const files={};
  for(const name of ['prepare.mjs','probe.mjs','driver.mjs','cleanup-owned.ps1','source-authentication.json'])files[name]=sha(cell+'/'+name);
  trials.push({index,id,mode,root:cell,files});
}
const files={};for(const name of ['prepare.mjs','next.mjs'])files[name]=sha(root+'/'+name);
writeFileSync(root+'/plan.json',JSON.stringify({version:1,created:new Date().toISOString(),deadline:'2026-11-16T02:40:00Z',order:['A','B','B','A'],trials,files,node:'v24.15.0',helperTimeoutMs:40000,workLimitMs:300000,retries:0,scope:'One fixed observer discriminator. Prior evidence separate; not a native fix, complete preview-test pass, neutrality, product measurement or SOUND.'},null,2));
console.log('Four fresh A/B/B/A probes frozen; none executed.');
