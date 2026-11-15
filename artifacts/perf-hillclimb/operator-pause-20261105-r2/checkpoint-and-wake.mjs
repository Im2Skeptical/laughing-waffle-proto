import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const out='artifacts/perf-hillclimb/operator-pause-20261105-r2';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const files=[...new Set(git('ls-files','-m','-o','--exclude-standard','-z').split('\0').filter(Boolean))].sort();
const dirty=[];
for(const file of files){const b=await readFile(file),target=`${out}/files/${file}`;await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});await copyFile(file,target);dirty.push({file,bytes:b.length,sha256:hash(b)});}
await writeFile(`${out}/tracked.patch`,execFileSync('git',['diff','--binary','HEAD'],{windowsHide:true}));
const authFile='artifacts/perf-hillclimb/operator-resume-20261105-r1/authentication.json';
const auth=JSON.parse(await readFile(authFile));
const child=JSON.parse(await readFile(`${out}/child-status.json`));
const receipt={at:new Date().toISOString(),status:'PAUSED',phaseA:'NOT SOUND',nativeGoal:'paused',goalId:'01a1a5fb-32cf-7ff0-86a6-68448a1aa3e9',head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),dirty,child,
 integrity:{file:authFile,sha256:hash(await readFile(authFile)),sourceCount:auth.sourceCount,sourceChanges:auth.sourceChanges,added:auth.added,missing:auth.missing,buildChanges:auth.buildChanges,evidenceCount:auth.evidenceCount,evidenceChanges:auth.evidenceChanges},
 processes:'No owned test/browser/build workload. Sole matched process is inherited idle preview5184/PID4484; see processes.json. Metadata helper exits after this receipt.',
 schedules:[],newWorkSinceResume:'Read-only integrity inventory and operator pause metadata only; no test/negative cell/worker/new phase started.',
 hold:'Approved main83c00497 integrated as bebc4ead; later dirty harness proof/adoption completion still unfinished.',
 nextOnExplicitResume:'Read pause handoffs and authenticate identities, then three affected negative cells under a fresh ID. No automatic continuation from late messages.',
 sourceEvidencePolicy:'Original pause snapshot and all accepted/rejected/contended/incomplete identities preserved. This receipt copies dirty bytes including newly updated pause metadata. No commit/push/merge/deploy; thread is not settled.',notifications:[]};
await writeFile(`${out}/receipt.json`,JSON.stringify(receipt,null,2));
const url=process.env.T3_HOBBY_WAKE_URL,key=process.env.T3_HOBBY_WAKE_KEY;
const task='hillclimb PAUSED at next checkpoint — awaiting Cam resume';
function quoted(value){if(/[\r\n\0]/.test(value))throw Error('Invalid wake configuration');return '"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';}
for(const to of ['dispatcher','pm-notes']){
 const payload={to,task,t3_thread:'mcp:launch:5af258825e6de9d04e4b79ebf1a7833ca0b4dc2a63cf16061366fe48f4d23941'};
 const file=`${out}/${to}-payload.json`;await writeFile(file,JSON.stringify(payload));
 let result;
 if(!url||!key)result={to,sent:false,reason:'Required wake environment variables unavailable',missing:[...(!url?['T3_HOBBY_WAKE_URL']:[]),...(!key?['T3_HOBBY_WAKE_KEY']:[])]};
 else{
  try{
   // Secrets travel only through curl stdin, never argv, files, logs or stdout.
   const config=[`url = ${quoted(url)}`,'request = "POST"',`header = ${quoted('Authorization: Bearer '+key)}`,'header = "Content-Type: application/json"',`data-binary = ${quoted('@'+file)}`].join('\n');
   const r=spawnSync('curl.exe',['--config','-','--silent','--show-error','--fail','--output','NUL','--write-out','%{http_code}','--connect-timeout','10','--max-time','20'],{input:config,encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:65536});
   const httpCode=/^\d{3}$/.test((r.stdout??'').trim())?Number(r.stdout.trim()):null;
   result={to,sent:r.status===0&&httpCode>=200&&httpCode<300,httpCode,curlExit:r.status,errorCode:r.error?.code??null};
  }catch{result={to,sent:false,reason:'Wake configuration or transport failure; secret values suppressed'};}
 }
 receipt.notifications.push(result);await writeFile(`${out}/receipt.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(result));
}
console.log(JSON.stringify({status:receipt.status,phaseA:receipt.phaseA,head:receipt.head,dirtyFiles:dirty.length,childStatus:child.status,activeChildWork:child.hasPendingChildRuns,notifications:receipt.notifications.map(n=>({to:n.to,sent:n.sent,httpCode:n.httpCode}))}));
if(receipt.notifications.some(n=>!n.sent))process.exitCode=1;
