import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const r='artifacts/perf-hillclimb/native-capture-controller-r2-20261115',o='artifacts/perf-hillclimb/auditor-native-capture-controller-r2-20261115';const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(sha(r+'/candidate-manifest.json'),'716dd4d96b15e16d556eadd77e302765bfc426f61b6b4c5d92ccc8df99e0ffc2');assert.equal(sha(r+'/plan.json'),'d3ebf7a0ea5fcc0afe3c6088d5580d08623502bed64e43454717500e5e8e49a4');
const m=JSON.parse(fs.readFileSync(r+'/candidate-manifest.json','utf8')),p=JSON.parse(fs.readFileSync(r+'/plan.json','utf8'));const checked={};
for(const [f,h]of Object.entries(m.selected)){assert.equal(sha(r+'/'+f),h,f);checked[r+'/'+f]=h;}
for(const [f,h]of Object.entries(p.files)){assert.equal(sha(f),h,f);checked[f]=h;}
assert.equal(p.slots.length,6);for(const s of p.slots)for(const name of ['attempt.marker','result.json','control-check.json'])assert.ok(!fs.existsSync(s.config.RunRoot+'/'+name));assert.ok(!fs.existsSync(r+'/admission.json'));
fs.writeFileSync(o+'/authentication.json',JSON.stringify({at:new Date().toISOString(),manifestSha256:sha(r+'/candidate-manifest.json'),planSha256:sha(r+'/plan.json'),checked,allSixUnattempted:true,admissionAbsent:true},null,2),{flag:'wx'});console.log(JSON.stringify({checked:Object.keys(checked).length,receipt:sha(o+'/authentication.json')}));
