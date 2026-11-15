import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const id=process.argv[2];assert.ok(id,'unique report ID required');
const base='artifacts/perf-hillclimb',output=`${base}/${id}`;await mkdir(output);
const reports=[];
for(const name of (await readdir(base)).filter(n=>/^main-(j5-|matrix-|repair-|controls-)/.test(n)).sort()){
  const manifest=await readFile(`${base}/${name}/manifest.json`,'utf8').then(JSON.parse).catch(()=>null);
  if(!manifest)continue;
  const rows=(await readFile(`${base}/${name}/observations.jsonl`,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(JSON.parse);
  reports.push({runId:name,finished:manifest.finished??null,failed:manifest.failed??null,config:manifest.config,
    buildId:manifest.buildId,servedAssets:manifest.servedAssets,harnessId:manifest.harnessId,workload:manifest.workload,
    observations:rows.map(r=>({job:r.job,step:r.step,ok:r.ok,launchId:r.launchId,observationId:r.observationId,
      elapsedMs:r.elapsedMs,probeCpuMs:r.probeCpuMs,probes:r.probes,frameCount:r.frames?.length??null,
      longTaskCount:r.longTasks?.length??null,firstFeedbackMs:r.firstFeedbackMs??null,timeout:r.timeout,
      error:r.error?.split('\n')[0]??null,input:r.input,untimedOracleWindow:r.untimedOracleWindow,
      activeWork:r.untimedOracle?.graphActive!==undefined?{graphActive:r.untimedOracle.graphActive,graphProgress:r.untimedOracle.graphProgress,graphReplies:r.untimedOracle.graphReplies,lifeActive:r.untimedOracle.lifeActive,lifeProgress:r.untimedOracle.lifeProgress,lifeReplies:r.untimedOracle.lifeReplies}:null,
      offered:r.witness?.offered?.summary??null}))});
}
const hashes={};await mkdir(`${output}/sources`);
for(const file of ['run.mjs','offered-input.mjs','offered-input-test.mjs','active-work-oracle.mjs','active-work-oracle-test.mjs','save-state-oracle.mjs','save-state-oracle-test.mjs','main-discovery.mjs','main-controls.mjs','main-job-oracles.mjs','main-job-oracles-test.mjs','main-stage-report.mjs']){
  const bytes=await readFile(`scripts/perf-hillclimb/${file}`);hashes[file]=createHash('sha256').update(bytes).digest('hex');await writeFile(`${output}/sources/${file}`,bytes);
}
await writeFile(`${output}/source-hashes.json`,JSON.stringify(hashes,null,2));
await writeFile(`${output}/stage-results.json`,JSON.stringify({phaseA:'NOT SOUND',scope:'representative functional discovery; no baseline/scoring/tail inference',reports},null,2));
console.log(`[main-stage-report] retained=${reports.length} runs; ${output}`);
