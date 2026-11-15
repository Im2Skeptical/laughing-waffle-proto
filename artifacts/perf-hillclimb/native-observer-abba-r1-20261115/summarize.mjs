import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='artifacts/perf-hillclimb/native-observer-abba-r1-20261115';
const json=f=>JSON.parse(readFileSync(f,'utf8')),sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const plan=json(root+'/plan.json');
const trials=plan.trials.map(t=>{
  const attempted=existsSync(root+'/slot-'+t.index+'-dispatch.json');
  const r=existsSync(t.root+'/result.json')?json(t.root+'/result.json'):null;
  const evidence={};
  for(const f of readdirSync(t.root).filter(f=>/\.(json|txt|log)$/.test(f)))evidence[f]=sha(t.root+'/'+f);
  return {index:t.index,id:t.id,mode:t.mode,attempted,resultAvailable:r!==null,classification:r?.classification??null,started:r?.started??null,finished:r?.finished??null,code:r?.code??null,signal:r?.signal??null,expired:r?.expired??null,cleanupVerified:r?.cleanupVerified??null,evidenceProblems:r?.evidenceProblems??null,sourceAssetChanges:r?.sourceAssetChanges??null,fixture:r?.probe?.fixture??null,calls:(r?.probe?.helperCalls??[]).map(c=>({index:c.index,stage:c.stage,status:c.status,signal:c.signal,pid:c.pid,stdoutBytes:c.stdoutBytes,stderrBytes:c.stderrBytes,stderrAvailable:c.stderrAvailable,exactPriorSignature:c.exactPriorSignature})),evidence};
});
const allComplete=trials.every(t=>t.attempted&&t.resultAvailable&&t.cleanupVerified&&t.evidenceProblems?.length===0&&t.sourceAssetChanges?.length===0&&['NO_REPRODUCTION_NOT_A_FIX','RED_PRIOR_NATIVE_SIGNATURE_REPRODUCED','OTHER_FAILURE_NOT_PRIOR_NATIVE_SIGNATURE'].includes(t.classification));
const priorLinkedNativeObserved=trials.some(t=>t.classification==='RED_PRIOR_NATIVE_SIGNATURE_REPRODUCED');
const nativeExitOccurrences=trials.flatMap(t=>t.calls.filter(c=>typeof c.status==='number'&&(c.status>>>0)===3221226505).map(c=>({trial:t.id,mode:t.mode,...c})));
const allNormal=allComplete&&trials.every(t=>t.classification==='NO_REPRODUCTION_NOT_A_FIX');
const result={created:new Date().toISOString(),planSha256:sha(root+'/plan.json'),allComplete,priorLinkedNativeObserved,nativeExitOccurrences,allNormal,trials,interpretation:!allComplete?'INCOMPLETE: preserve remaining slots; no replacement':allNormal?'ALL NORMAL: INCONCLUSIVE native cause, NOT A FIX':priorLinkedNativeObserved?'Prior native signature observed. Observer causality unresolved; no automatic extra trials.':'Other authenticated failure observed; preserve distinct from prior native signature.',scope:'Builder extraction pending independent actual-result review. No pooling with r1, full test PASS, product metric, neutrality, score or SOUND.'};
writeFileSync(root+'/summary.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({allComplete,priorLinkedNativeObserved,nativeExitCount:nativeExitOccurrences.length,allNormal,interpretation:result.interpretation,summarySha256:sha(root+'/summary.json')}));
