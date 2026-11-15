import {readFileSync,writeFileSync} from 'node:fs';
const base='artifacts/perf-hillclimb/';const plan=JSON.parse(readFileSync(base+'hold-adaptation-reference-r1-20261105/results.json'));
const groups={};let total=0;
for(const cell of plan){
 const rows=readFileSync(base+cell.runId+'/observations.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 for(const row of rows){total++;const key=cell.population+'/'+cell.job+'/'+row.step;const g=groups[key]??={population:cell.population,job:cell.job,step:row.step,n:0,passes:0,feedbackPhases:{},values:{}};g.n++;g.passes+=row.ok?1:0;
 const f=row.feedback?.record??row.feedback;const phase=f?.phase??'unavailable';g.feedbackPhases[phase]=(g.feedbackPhases[phase]??0)+1;
 const receiptFile=base+cell.runId+'/'+row.observationId.split(':').at(-1)+'-feedback.json';let receipt;try{receipt=JSON.parse(readFileSync(receiptFile));}catch{}
 const v={terminalElapsedMs:row.elapsedMs,firstFeedbackMs:f?.firstFeedbackMs,feedbackReadCpuMs:f?.readCpuMs,feedbackMaxReadCpuMs:f?.maxReadCpuMs,feedbackCollectionCpuMs:f?.collectionCpuMs,feedbackExportCpuMs:receipt?.export?.exportCostMs,feedbackHostRpcMs:receipt?.hostRpcMs,directTimingReadCpuMs:row.directTimingReadCpuMs,terminalProbeCpuMs:row.probeCpuMs,collectionWindowElapsedMs:row.feedbackCollectionWindow?.elapsedMs};
 for(const [k,value]of Object.entries(v)){const m=g.values[k]??={available:0,min:null,max:null};if(Number.isFinite(value)){m.available++;m.min=m.min===null?value:Math.min(m.min,value);m.max=m.max===null?value:Math.max(m.max,value);}}
 }
}
const output={created:new Date().toISOString(),scope:'Historical construction rows only. Ranges over heterogeneous steps/seeds; no tail or overhead-neutrality inference. No new timings. Original raw rows preserved.',sourceRun:'hold-adaptation-reference-r1-20261105',launches:plan.length,observations:total,groups:Object.values(groups)};
writeFileSync(base+'resume-authentication-20261115/reference-costs.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({launches:plan.length,observations:total,groups:output.groups.length,failedRows:output.groups.reduce((s,g)=>s+g.n-g.passes,0),maxFeedbackReadCpuMs:Math.max(...output.groups.map(g=>g.values.feedbackReadCpuMs.max??0)),maxFeedbackHostRpcMs:Math.max(...output.groups.map(g=>g.values.feedbackHostRpcMs.max??0)),artifact:base+'resume-authentication-20261115/reference-costs.json'}));
