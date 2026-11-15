// Post-run analysis only. Bound memory; ignore huge per-operation body arrays.
import {createReadStream,readFileSync,writeFileSync} from 'node:fs';
const root='artifacts/perf-hillclimb/j8-optional-abba-r1-20261115/';
const json=f=>JSON.parse(readFileSync(f));
async function headers(file){
  const rows=[];let head=Buffer.alloc(0),bodyBytes=0;
  const end=terminated=>{const text=head.toString('utf8');rows.push({step:/"step":"([^"]+)"/.exec(text)?.[1]??null,ok:/"ok":(true|false)/.exec(text)?.[1]==='true',terminated,bytes:bodyBytes});head=Buffer.alloc(0);bodyBytes=0;};
  for await(const chunk of createReadStream(file)){
    let start=0;
    while(start<chunk.length){const newline=chunk.indexOf(10,start),stop=newline<0?chunk.length:newline,part=chunk.subarray(start,stop);bodyBytes+=part.length;if(head.length<8192)head=Buffer.concat([head,part.subarray(0,8192-head.length)]);if(newline<0)break;end(true);start=newline+1;}
  }
  if(bodyBytes)end(false);return rows;
}
const results=json(root+'results.json'),cases=[];
for(const result of results){
  const leaf=`artifacts/perf-hillclimb/${result.id}/`,manifest=json(leaf+'manifest.json'),failure=json(leaf+'reference-failure.json');
  const operationHeaders=await headers(leaf+'observations.jsonl');
  cases.push({index:result.index,id:result.id,instrumentation:result.instrumentation,started:result.started,finished:result.finished,exitCode:result.exitCode,identityVerified:result.identityVerified,cleanupVerified:result.cleanupVerified,readinessGateMs:manifest.config.gateTimeoutMs,caseCapMs:manifest.config.caseTimeoutMs,failedStages:operationHeaders.filter(r=>!r.ok).map(r=>r.step),operationHeaders,error:result.caseFailures?.[0]?.error,mainPrepared:failure.passive?.map?.artPrepared,decisionPrepared:failure.passive?.life?.decisionArtPrepared,mainReady:failure.passive?.map?.artReady,decisionReady:failure.passive?.life?.decisionArtReady,pageErrors:failure.errors?.length,consoleErrors:failure.consoleErrors?.length,requestFailures:failure.requestFailures?.length,passiveKeys:Object.keys(failure.passive??{}),completedReadiness:false,censoring:'240s configured readiness timeout is not an observed completion time; actual ready latency unavailable'});
}
const summary={created:new Date().toISOString(),phaseA:'NOT SOUND',scope:'Four fixed diagnostic cells only; not tail/score/product gain or neutral-overhead evidence. All four original failures retained.',cases};
writeFileSync(root+'comparison-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(cases.map(({index,instrumentation,failedStages,mainPrepared,decisionPrepared,mainReady,decisionReady,pageErrors,consoleErrors,requestFailures,identityVerified,cleanupVerified})=>({index,instrumentation,failedStages,mainPrepared,decisionPrepared,mainReady,decisionReady,pageErrors,consoleErrors,requestFailures,identityVerified,cleanupVerified}))));
