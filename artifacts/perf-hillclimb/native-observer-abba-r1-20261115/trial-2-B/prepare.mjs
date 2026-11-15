// Generate a bounded diagnostic parent around the unchanged original subject.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const root='artifacts/perf-hillclimb/native-observer-abba-r1-20261115/trial-2-B';
const original=readFileSync('scripts/build-preview-test.mjs','utf8').replace(/\r\n/g,'\n');
const end='\n  await delay(5_100);\n  const tasks =';
assert.equal(original.split(end).length,2);
let prefix=original.slice(0,original.indexOf(end));
const once=(a,b)=>{assert.equal(prefix.split(a).length,2,'unique original prefix binding');prefix=prefix.replace(a,b);};
once("const fixture = await mkdtemp(path.join(tmpdir(), 'civilization-build-preview-'));", "const fixture = await mkdtemp(path.join(tmpdir(), 'civilization-build-preview-'));\ndiagnosticData.fixture=fixture;diagnosticSave('fixture-registration',{at:diagnosticStarted,fixture});");
const start=`  const start = (cwd = fixture) => execFileSync(process.execPath, ['scripts/local-preview.mjs'], {
    cwd, encoding: 'utf8', timeout: 40_000, windowsHide: true,
  });`;
once(start,`  const start = (cwd = fixture) => {
    const index=diagnosticData.helperCalls.length,stage=path.relative(fixture,cwd).split(path.sep).join('/')||'main';
    const subject=diagnosticFs.readFileSync(path.join(cwd,'scripts/local-preview.mjs'),'utf8').replace(/\\r\\n/g,'\\n');
    assert.equal(subject,diagnosticSubject.replace('const firstPort = 5184;','const firstPort = '+fixturePort+';'),'actual copied subject only changes original test port');
    diagnosticSave('call-'+index+'-start',{index,stage,cwd,started:new Date().toISOString(),timeoutMs:40000,fixturePort,subjectNormalizedSha256:diagnosticHash('sha256').update(subject).digest('hex')});
    try{const out=execFileSync(process.execPath,['scripts/local-preview.mjs'],{cwd,encoding:'utf8',timeout:40000,windowsHide:true});
      diagnosticRecord(index,stage,cwd,0,null,null,out,null);return out;
    }catch(error){diagnosticRecord(index,stage,cwd,error.status,error.signal??null,error.pid??null,error.stdout??null,error.stderr??null);throw error;}
  };`);
const header=`import * as diagnosticFs from 'node:fs';
import {spawnSync as diagnosticSpawnSync} from 'node:child_process';
import {createHash as diagnosticHash} from 'node:crypto';
const diagnosticRoot=path.resolve('${root}'),diagnosticStarted=new Date().toISOString();
const diagnosticSubject=diagnosticFs.readFileSync('scripts/local-preview.mjs','utf8').replace(/\\r\\n/g,'\\n');
if(diagnosticFs.existsSync(path.join(diagnosticRoot,'fixture-registration.json')))throw Error('Never rerun an attempted fixture');
const diagnosticData={version:1,started:diagnosticStarted,fixture:null,helperCalls:[],prefixCompleted:false,originalError:null,cleanup:null};
function diagnosticSave(name,data){diagnosticFs.writeFileSync(path.join(diagnosticRoot,name+'.json'),JSON.stringify(data,null,2));}
function diagnosticRecord(index,stage,cwd,status,signal,pid,stdout,stderr){
  const out=stdout===null?null:Buffer.from(stdout),err=stderr===null?null:Buffer.from(stderr);
  if(out)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'call-'+index+'-stdout.txt'),out,{flag:'wx'});
  if(err)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'call-'+index+'-stderr.txt'),err,{flag:'wx'});
  const native=typeof status==='number'&&(status>>>0)===3221226505;
  const exactPriorSignature=native&&signal===null&&stage.startsWith('worktrees/')&&out?.length===0&&err?.length===0;
  diagnosticData.helperCalls.push({index,stage,cwd,finished:new Date().toISOString(),status,signal,pid,stdoutBytes:out?.length??null,stderrBytes:err?.length??null,stderrAvailable:err!==null,native,exactPriorSignature});
  diagnosticSave('calls',diagnosticData.helperCalls);
}
`;
const tail=`
  diagnosticData.prefixCompleted=true;
}catch(error){diagnosticData.originalError={name:error.name,message:error.message,status:error.status??null,signal:error.signal??null,pid:error.pid??null};
  diagnosticFs.writeFileSync(path.join(diagnosticRoot,'original-error.txt'),error.stack??String(error));
}finally{
  const logCopies=[];
  for(const [label,relative]of [['main','artifacts/local-preview.log'],['task-a','worktrees/task-a/artifacts/local-preview.log'],['task-b','worktrees/task-b/artifacts/local-preview.log']]){
    const file=path.join(fixture,relative);if(!diagnosticFs.existsSync(file))continue;
    try{if(diagnosticFs.statSync(file).size>1048576)throw Error('bounded log capture');diagnosticFs.copyFileSync(file,path.join(diagnosticRoot,label+'-preview.log'));logCopies.push({label,available:true});}
    catch(error){logCopies.push({label,available:false,error:error.message});}
  }
  diagnosticData.logCopies=logCopies;
  const cleanupFile=path.join(diagnosticRoot,'cleanup-probe.json');
  const result=diagnosticSpawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(diagnosticRoot,'cleanup-owned.ps1'),'-FixtureRoot',fixture,'-SinceIso',diagnosticStarted,'-OutputPath',cleanupFile],{encoding:'utf8',windowsHide:true,timeout:20000});
  diagnosticData.cleanup={status:result.status,signal:result.signal,error:result.error?.message??null,receipt:diagnosticFs.existsSync(cleanupFile)?JSON.parse(diagnosticFs.readFileSync(cleanupFile,'utf8')):null};
  diagnosticData.finished=new Date().toISOString();diagnosticSave('probe-result',diagnosticData);
}
console.log(JSON.stringify({prefixCompleted:diagnosticData.prefixCompleted,helperCalls:diagnosticData.helperCalls.length,exactPriorSignature:diagnosticData.helperCalls.some(c=>c.exactPriorSignature),cleanupStatus:diagnosticData.cleanup?.status,scope:'Diagnostic original-prefix only; not full test pass or native fix'}));
if(diagnosticData.originalError||diagnosticData.cleanup?.status!==0)process.exitCode=1;
`;
writeFileSync(root+'/probe.mjs',header+prefix+tail);
console.log('Diagnostic prefix generated; not executed');
