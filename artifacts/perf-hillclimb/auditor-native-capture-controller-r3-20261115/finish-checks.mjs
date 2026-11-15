import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const o='artifacts/perf-hillclimb/auditor-native-capture-controller-r3-20261115',r='artifacts/perf-hillclimb/native-capture-controller-r3-20261115';const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const got=JSON.parse(fs.readFileSync(o+'/checker-controls.json','utf8')),prior=JSON.parse(fs.readFileSync('artifacts/perf-hillclimb/auditor-native-capture-controller-r2-20261115/checker-controls.json','utf8'));
assert.equal(got.caseCount,30);assert.ok(got.allExpected);assert.deepEqual(got.cases.slice(0,24).map(c=>[c.name,c.mode,c.expected]),prior.cases.map(c=>[c.name,c.mode,c.expected]));
const reasons={
 'fatal record after continued EXIT':'fatal record outside owned CREATE/EXIT lifetime',
 'event after continued EXIT':'continued EXIT must be terminal',
 'failed module CloseHandle hidden by facts':'explicit image handle close outcome is not success',
 'failed rollback receipt hidden by facts':'constructor rollback means declared control setup incomplete',
 'missing native image file handle identity':'native image file handle identity unavailable',
 'owned native image file handle missing close':'owned native image file handle release unconfirmed',
 'pending image handle close hidden by facts':'explicit image handle close outcome is not success',
 'missing typed rollback array':'constructor rollback means declared control setup incomplete'};
for(const[n,reason]of Object.entries(reasons)){const c=got.cases.find(c=>c.name===n);assert.equal(c.actual,'FAIL_OR_INCOMPLETE');assert.ok(c.problems.includes(reason),n);}
assert.equal(got.cases.filter(c=>c.actual==='PASS').length,8);assert.equal(got.cases.filter(c=>c.actual==='FAIL_OR_INCOMPLETE').length,22);
const plan=JSON.parse(fs.readFileSync(r+'/plan.json','utf8'));for(const[f,h]of Object.entries(plan.files))assert.equal(sha(f),h);for(const s of plan.slots)for(const f of ['attempt.marker','result.json','control-check.json'])assert.ok(!fs.existsSync(s.config.RunRoot+'/'+f));
const result={at:new Date().toISOString(),verdict:'AFFECTED_PURE_SOURCE_CHECKS_PASS',cases:30,accepted:8,rejected:22,prior24DefinitionsMatch:true,causalReasonsVerified:reasons,manifestSha256:sha(r+'/candidate-manifest.json'),planSha256:sha(r+'/plan.json'),authenticationSha256:sha(o+'/authentication.json'),checkerSha256:sha(r+'/check-control.mjs'),adapterSha256:sha(o+'/checker-controls.mjs'),checkerReceiptSha256:sha(o+'/checker-controls.json'),allPlanPinsUnchanged:true,allSixUnattempted:true,scope:'Actual selected checker VM, memory-only raw evidence; no native/helper/API/target/realroot calls. Scoped admission decision recorded separately.'};
fs.writeFileSync(o+'/review-receipt.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({...result,causalReasonsVerified:Object.keys(reasons).length,reviewReceiptSha256:sha(o+'/review-receipt.json')}));
