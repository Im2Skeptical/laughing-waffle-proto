import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {makeOwnerFixture} from './owner-fixture-r1.mjs';import {parseEvidenceJson} from './strict-evidence-json.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export function changeOriginal(f,name,mutate){const data=parseEvidenceJson(f.originals.get(name),{maxBytes:8192});mutate(data);const bytes=Buffer.from(JSON.stringify(data));f.originals.set(name,bytes);const m=f.report.targetOriginals.find(x=>x.Name===name);m.Bytes=bytes.length;m.Sha256=createHash('sha256').update(bytes).digest('hex');m.Values=data;}
export function syncRawWaits(report){report.events.forEach((e,n)=>e.index=n);report.debugWaits=report.events.map(e=>({requestedMs:25,call:{Phase:'tree.WaitForDebugEventEx',Result:true,ErrorValid:false,Error:null,RawLastError:121},rawByteLength:176,rawHex:e.rawHex}));}
export function makeOwnerTargetFixture(mode='reuse'){
  const f=makeOwnerFixture();f.expected.mode=mode;f.originals=new Map();for(const m of f.report.targetOriginals)f.originals.set(m.Name,fs.readFileSync(path.join(root,'managed-report-io-r4',m.Name)));
  if(mode==='fail-after-first'){
    const r=f.report;r.mode=mode;r.classification='SYNTHETIC_FAILURE_AFTER_FIRST_RETURN_LINKED';r.processes=r.processes.filter(p=>p.pid!==4);r.events=r.events.filter(e=>e.pid!==4);
    const exit=r.events.find(e=>e.eventCode===5&&e.pid===1);exit.exitCode=23;const b=Buffer.from(exit.rawHex,'hex');b.writeUInt32LE(23,16);exit.rawHex=b.toString('hex');syncRawWaits(r);
    r.controller.budgetSteps=r.controller.budgetSteps.filter(s=>s.Phase!=='process-wait:4'&&s.Phase!=='binding-release:4');for(const s of r.controller.budgetSteps)s.WaitIndex=s.WaitIndex===15?11:12;
    const removed=new Set(['identity-4.json','start-helper-second.json','reuse-request.json','reuse-reply.json','helper-second-return.json']);for(const n of removed)f.originals.delete(n);r.targetOriginals=r.targetOriginals.filter(m=>!removed.has(m.Name));
    changeOriginal(f,'identity-1.json',v=>v.Role=mode);changeOriginal(f,'prefix-outcome.json',v=>{v.ExpectedExitCode=23;v.Completed=false;delete v.SecondHelperPid;});
    r.targetOutcome.Classification=r.classification;r.targetOutcome.SecondHelperPid=0;
  }
  return f;
}
