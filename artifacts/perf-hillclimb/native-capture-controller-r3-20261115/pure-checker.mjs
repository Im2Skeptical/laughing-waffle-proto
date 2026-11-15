import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {exportRva} from './pe-export.mjs';
const root='artifacts/perf-hillclimb/native-capture-controller-r3-20261115';
assert.ok(!fs.existsSync(root+'/pure-checker.json'),'Never overwrite virtual corpus');
const sha=b=>createHash('sha256').update(b).digest('hex'),plan=JSON.parse(fs.readFileSync(root+'/plan.json','utf8'));
const dllPath=Object.keys(plan.files).find(p=>p.toLowerCase().endsWith('ntdll.dll')),dll=fs.readFileSync(dllPath),rva=exportRva(dll,'DbgBreakPoint');
const source=fs.readFileSync(root+'/check-control.mjs','utf8'),body=source.replace(/^import .*?;\r?\n/gm,'');const norm=p=>path.resolve(p).toLowerCase();
function execute(mode,mutate){
 const index=plan.slots.findIndex(s=>s.config.Mode===mode),slot=plan.slots[index],dir=slot.config.RunRoot,pid=7001,tid=7002,childPid=7003;
 const f={Identity:true,AssignedBeforeResume:true,LoaderBreakpoint:true,ExitContinued:true,JobEmpty:true,StreamsComplete:true,HandlesClosed:true,SourceStable:true,TimedOut:false,Overflow:false,ObserverError:false,UnsafeRecovery:false,ExitCode:mode==='nonzero'?23:mode==='synthetic-native'?3221226505:0,MatchingFatalRecords:mode==='synthetic-native'?1:0};
 const common={pid,tid,continued:true,continueError:0,continuation:65538};const address='0x'+(0x100000000n+BigInt(rva)).toString(16).padStart(16,'0');
 const events=[{...common,eventCode:3,fileHandle:'0x0000000000000100',imageHandleClosed:true},{...common,eventCode:6,fileHandle:'0x0000000000000104',imageHandleClosed:true,imagePath:dllPath,imageBase:'0x0000000100000000'},{...common,eventCode:1,exceptionCode:2147483651,firstChance:1,exceptionFlags:0,exceptionAddress:address,parameterCount:0,parameters:[],continuation:65538}];
 if(mode==='synthetic-native')events.push({...common,eventCode:1,exceptionCode:3221226505,firstChance:0,exceptionFlags:1,exceptionAddress:'0x0000000200000100',parameterCount:2,parameters:['0x0000000050455246','0x0000000000000007'],continuation:2147549185});
 events.push({...common,eventCode:5,exitCode:f.ExitCode});
 const ready={Ready:true,WorkerLive:true,ThreadHandleOwned:true,Closing:false,DeadlineExpired:false,Errors:[],DroppedErrors:0,Succeeded:true};
 let stdout=Buffer.from(mode==='normal'?'capture-normal\n':''),stderr=Buffer.from(mode==='normal'?'capture-stderr\n':'');
 const registration={parentPid:pid,childPid,createdFileTimeUtc:'32'},child={pid:childPid,createdFileTimeUtc:'32',debuggerPresent:false},awaited={childPid,exitCode:0};
 const r={controlId:slot.config.Id,configSha256:slot.configSha256,classification:mode==='nonzero'?'NONZERO_EXIT_WITHOUT_MATCHED_EXCEPTION':mode==='synthetic-native'?'NATIVE_EXCEPTION_CAPTURED':['timeout','observer-failure'].includes(mode)?'INCOMPLETE':'NORMAL_EXIT',facts:f,errors:[],events,rollbackReceipts:[],stdoutAvailable:true,stderrAvailable:true,stdoutEof:true,stderrEof:true,stdoutResourcesReleased:true,stderrResourcesReleased:true,stdoutErrors:[],stderrErrors:[],stdoutDroppedErrors:0,stderrDroppedErrors:0,stdoutTotalBytes:String(stdout.length),stderrTotalBytes:String(stderr.length),stdoutStartup:{...ready},stderrStartup:{...ready},
 loaderIdentity:{path:dllPath,sha256:sha(dll),export:'DbgBreakPoint',rvaHex:'0x'+BigInt(rva).toString(16).padStart(16,'0'),baseHex:'0x0000000100000000',expectedAddressHex:address,moduleEventIndex:1},descendantVerified:true,descendantExitObserved:true,
 descendantObservation:{pid:childPid,reportedParentPid:pid,createdFileTimeHex:'0x0000000000000020',image:slot.config.Executable,jobMember:true,debuggerPresent:false,exitWaitResult:0,exitCodeRead:true,exitCodeError:0,exitCode:0,registrationSha256:sha(Buffer.from(JSON.stringify(registration))),identitySha256:sha(Buffer.from(JSON.stringify(child)))}};
 if(mode==='timeout')f.TimedOut=true;if(mode==='observer-failure'){f.ObserverError=true;r.errors=['CONTROL_ONLY_OBSERVER_FAILURE_AFTER_REGISTRATION'];r.phaseWitness={phase:'VERIFIED_DESCENDANT_BEFORE_WAIT',descendantPid:childPid,eventCount:3};}
 const launch={pid,primaryTid:tid,createdFileTimeHex:'0x0000000000000010',configSha256:slot.configSha256,image:slot.config.Executable};
 const identity={pid,createdFileTimeUtc:'16',debuggerPresent:true},host={expired:false,hostError:null,hostSignal:null,hostExitCode:['timeout','observer-failure'].includes(mode)?2:0};
 const data={r,launch,identity,host,stdout,stderr,dropChild:false};if(mutate)mutate(data);
 const files=new Map();files.set(norm(root+'/plan.json'),Buffer.from(JSON.stringify(plan)));files.set(norm(dllPath),dll);
 for(const[name,value]of Object.entries({'result.json':r,'launch.json':launch,'target-identity.json':identity,'supervisor-result.json':host}))files.set(norm(dir+'/'+name),Buffer.from(JSON.stringify(value)));
 files.set(norm(dir+'/stdout.raw'),data.stdout);files.set(norm(dir+'/stderr.raw'),data.stderr);
 if(!data.dropChild){for(const[name,value]of Object.entries({'descendant-registration.json':registration,'descendant-identity.json':child,'descendant-awaited.json':awaited}))files.set(norm(dir+'/'+name),Buffer.from(JSON.stringify(value)));files.set(norm(dir+'/descendant-verified.signal'),Buffer.from('1'));}
 const writes=[];const fakeProcess={argv:['node','checker',String(index)],exitCode:0};
 vm.runInNewContext(body,{assert,exportRva,readFileSync:(p,enc)=>{const b=files.get(norm(p));if(!b)throw Error('Virtual file absent:'+p);return enc?b.toString(enc):b;},writeFileSync:(p,value)=>writes.push(JSON.parse(value)),createHash,process:fakeProcess,console:{log(){}},Buffer},{timeout:2500});
 assert.equal(writes.length,1);return writes[0];
}
const cases=[];const check=(name,mode,mutate,expected)=>{const result=execute(mode,mutate);cases.push({name,mode,expected,actual:result.verdict,problems:result.problems,asExpected:expected===result.verdict});};
for(const mode of plan.slots.map(s=>s.config.Mode))check('self-consistent virtual '+mode,mode,null,'PASS');
check('missing loader event despite fact true','normal',d=>{d.r.events=d.r.events.filter(e=>e.eventCode!==1);},'FAIL_OR_INCOMPLETE');
check('only exit event despite facts true','normal',d=>{d.r.events=d.r.events.filter(e=>e.eventCode===5);},'FAIL_OR_INCOMPLETE');
check('arbitrary loader address swallowed','normal',d=>{d.r.events.find(e=>e.eventCode===1).exceptionAddress='0x00000000deadbeef';},'FAIL_OR_INCOMPLETE');
check('wrong loader continuation','normal',d=>{d.r.events.find(e=>e.eventCode===1).continuation=2147549185;},'FAIL_OR_INCOMPLETE');
check('native classification with fatal count zero','synthetic-native',d=>{d.r.facts.MatchingFatalRecords=0;},'FAIL_OR_INCOMPLETE');
check('normal classification with fatal count one','normal',d=>{d.r.facts.MatchingFatalRecords=1;},'FAIL_OR_INCOMPLETE');
check('normal with host incomplete code2','normal',d=>{d.host.hostExitCode=2;},'FAIL_OR_INCOMPLETE');
check('descendant missing all original child evidence','descendant',d=>{d.dropChild=true;},'FAIL_OR_INCOMPLETE');
check('missing exit event','normal',d=>{d.r.events=d.r.events.filter(e=>e.eventCode!==5);},'FAIL_OR_INCOMPLETE');
check('wrong event owner','normal',d=>{d.r.events[0].pid++;},'FAIL_OR_INCOMPLETE');
check('wrong raw byte length','normal',d=>{d.r.stdoutTotalBytes='999';},'FAIL_OR_INCOMPLETE');
check('stream error retained','normal',d=>{d.r.stdoutErrors=['io'];},'FAIL_OR_INCOMPLETE');
check('wrong synthetic parameter','synthetic-native',d=>{d.r.events.find(e=>e.exceptionCode===3221226505).parameters[0]='0x0000000000000000';},'FAIL_OR_INCOMPLETE');
check('wrong timeout error','timeout',d=>{d.r.facts.ObserverError=true;},'FAIL_OR_INCOMPLETE');
check('fatal record after continued EXIT','synthetic-native',d=>{const fatal=d.r.events.find(e=>e.exceptionCode===3221226505);d.r.events=d.r.events.filter(e=>e!==fatal);d.r.events.push(fatal);},'FAIL_OR_INCOMPLETE');
check('event after continued EXIT','normal',d=>{d.r.events.push({eventCode:2,pid:d.launch.pid,tid:7009,continued:true,continueError:0});},'FAIL_OR_INCOMPLETE');
check('failed module CloseHandle hidden by facts','normal',d=>{d.r.events[1].imageHandleClosed=false;},'FAIL_OR_INCOMPLETE');
check('failed rollback receipt hidden by facts','normal',d=>{d.r.rollbackReceipts=[{Resource:'job',State:'NATIVE_CLOSE_FAILED',DisposeReturned:true,Detail:'CloseHandle:6'}];},'FAIL_OR_INCOMPLETE');
for(const [name,handle]of [['null','0x0000000000000000'],['invalid','0xffffffffffffffff']])check(name+' image file handle is not owned','normal',d=>{d.r.events[0].fileHandle=handle;delete d.r.events[0].imageHandleClosed;},'PASS');
check('missing native image file handle identity','normal',d=>{delete d.r.events[1].fileHandle;},'FAIL_OR_INCOMPLETE');
check('owned native image file handle missing close','normal',d=>{delete d.r.events[1].imageHandleClosed;},'FAIL_OR_INCOMPLETE');
check('pending image handle close hidden by facts','normal',d=>{d.r.events[1].imageHandleClosed='PENDING';},'FAIL_OR_INCOMPLETE');
check('missing typed rollback array','normal',d=>{delete d.r.rollbackReceipts;},'FAIL_OR_INCOMPLETE');
const result={at:new Date().toISOString(),checkerSha256:sha(Buffer.from(source)),parentCorpusReceipt:'8449231ff3b66958f45d0335a1e4bd69eb4325eef3bd8e1e62f68d0dd393603e',caseCount:cases.length,allExpected:cases.every(c=>c.asExpected),cases,scope:'Builder adaptation of exact retained24case names/mutations, enriched coherent fixture with typed empty rollback and actual image close schema. Six affected null/invalid/missing/pending schema controls added before data. Actual newchecker body inVM+memoryFS; no actual root/native/control mutation. Not independent acceptance.'};
fs.writeFileSync(root+'/pure-checker.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({caseCount:cases.length,allExpected:result.allExpected,failed:cases.filter(c=>!c.asExpected).map(c=>c.name)}));if(!result.allExpected)process.exitCode=1;
