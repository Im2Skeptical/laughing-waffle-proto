// Source construction only; never refresh an attempted/admitted plan.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root='artifacts/perf-hillclimb/native-capture-controller-r2-20261115',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.ok(!fs.existsSync(root+'/admission.json')&&!fs.existsSync(root+'/plan-before-source-controls.json'));
const plan=JSON.parse(fs.readFileSync(root+'/plan.json','utf8'));
for(const slot of plan.slots)for(const name of ['attempt.marker','host-launch.json','result.json','control-check.json'])assert.ok(!fs.existsSync(slot.config.RunRoot+'/'+name),'Never refresh an attempted slot');
fs.copyFileSync(root+'/plan.json',root+'/plan-before-source-controls.json');
for(const f of fs.readdirSync(root).filter(f=>/\.(cs|ps1|mjs)$/.test(f)&&f!=='authenticate.mjs')){const full=path.resolve(root,f);plan.files[full]=hash(full);}
plan.batchWorkLimitMs=90000;plan.batchTotalLimitMs=108000;delete plan.batchWallLimitMs;
plan.sourceRefresh=new Date().toISOString();plan.scope+=' Source-only refresh before admission/attempt: shared90s work +18s maximum configured stop/check terminal allowance, total108s configured lifetime; native/OS completion unproved and incomplete closure never PASS.';
fs.writeFileSync(root+'/plan.json',JSON.stringify(plan,null,2));console.log(JSON.stringify({planSha256:hash(root+'/plan.json'),slots:plan.slots.length,attempted:false}));
