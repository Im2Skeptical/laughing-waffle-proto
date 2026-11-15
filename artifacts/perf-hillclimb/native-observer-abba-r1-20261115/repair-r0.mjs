import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root='artifacts/perf-hillclimb/native-observer-abba-r1-20261115';
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const plan=JSON.parse(readFileSync(root+'/plan.json','utf8'));
assert.ok(!existsSync(root+'/withheld-r0'),'Apply admission correction once');
for(const trial of plan.trials)assert.ok(!existsSync(trial.root+'/launch.json')&&!existsSync(root+'/slot-'+trial.index+'-dispatch.json'));
for(const [relative,hash]of [['plan.json',sha(root+'/plan.json')],...Object.entries(plan.files),...plan.trials.flatMap(t=>Object.entries(t.files).map(([f,h])=>[t.id+'/'+f,h]))]){
  assert.equal(sha(root+'/'+relative),hash);const target=root+'/withheld-r0/'+relative;mkdirSync(path.dirname(target),{recursive:true});copyFileSync(root+'/'+relative,target);
}
const replaceOne=(text,from,to)=>{assert.equal(text.split(from).length,2);return text.replace(from,to);};
const stackWrite="diagnosticFs.writeFileSync(path.join(diagnosticRoot,'original-error.txt'),error.stack??String(error));";
const capture="diagnosticData.originalErrorStack=error.stack??String(error);";
const closed="diagnosticData.prefixClosed=new Date().toISOString();";
const flush="\n  if(diagnosticData.originalErrorStack)diagnosticFs.writeFileSync(path.join(diagnosticRoot,'original-error.txt'),diagnosticData.originalErrorStack);";
let prepare=readFileSync(root+'/prepare.mjs','utf8');
prepare=replaceOne(prepare,"  writeFileSync(cell+'/probe.mjs',probe);",`  probe=replaceOne(probe,${JSON.stringify(stackWrite)},${JSON.stringify(capture)});\n  writeFileSync(cell+'/probe.mjs',probe);`);
prepare=replaceOne(prepare,closed,closed+flush);
writeFileSync(root+'/prepare.mjs',prepare);
for(const trial of plan.trials){
  let probe=readFileSync(trial.root+'/probe.mjs','utf8');probe=replaceOne(probe,stackWrite,capture);probe=replaceOne(probe,closed,closed+flush);writeFileSync(trial.root+'/probe.mjs',probe);
  trial.files['probe.mjs']=sha(trial.root+'/probe.mjs');
}
plan.files['prepare.mjs']=sha(root+'/prepare.mjs');plan.files['repair-r0.mjs']=sha(root+'/repair-r0.mjs');
plan.revision=1;plan.repairedAt=new Date().toISOString();plan.disposition='Withheld-r0 retained. Common error stack flush moved after explicit closure; no trial attempted.';
writeFileSync(root+'/plan.json',JSON.stringify(plan,null,2));
console.log(JSON.stringify({revision:1,planSha256:sha(root+'/plan.json'),scope:plan.disposition}));
