// Reuse byte-identical reviewed managed sources/binaries; no compiler/API/target invocation.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
const root='artifacts/perf-hillclimb/native-capture-controller-r3-20261115',prior='artifacts/perf-hillclimb/native-capture-controller-r2-20261115',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.ok(!fs.existsSync(root+'/inherited-build.json'));assert.equal(hash(prior+'/candidate-manifest.json'),'716dd4d96b15e16d556eadd77e302765bfc426f61b6b4c5d92ccc8df99e0ffc2');
const manifest=JSON.parse(fs.readFileSync(prior+'/candidate-manifest.json','utf8'));
for(const[name,h]of Object.entries(manifest.selected))assert.equal(hash(prior+'/'+name),h,'prior selected drift:'+name);
for(const[f,h]of Object.entries(manifest.pinnedSourceAndBinaryFiles))assert.equal(hash(f),h,'prior pin drift:'+f);
const files={};for(const name of fs.readdirSync(root).filter(f=>f.endsWith('.cs')).concat(['CaptureController-final.dll','SyntheticCaptureTarget-final.exe'])){assert.equal(hash(root+'/'+name),hash(prior+'/'+name),'reviewed managed input differs:'+name);files[name]=hash(root+'/'+name);}
const managed='artifacts/perf-hillclimb/auditor-native-capture-controller-r2-20261115/managed.json';assert.equal(hash(managed),'499f08cb87aceb34ed81727f1aa6191b54680e26676a563afcd348ef4f874617');
const result={at:new Date().toISOString(),priorRoot:prior,priorManifestSha256:hash(prior+'/candidate-manifest.json'),priorBuildReceiptSha256:hash(prior+'/build-pure-final.json'),priorIndependentManagedSha256:hash(managed),files,scope:'Byte-identical C# sources and selected binaries inherited from r2 compile0/0,47Builder+42independent managed checks. No new C# compilation/check rerun needed for checker-only repair. No native helper/API/Run/Main/target/control invocation.'};
fs.writeFileSync(root+'/inherited-build.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({unchangedManagedInputs:Object.keys(files).length,inheritedBuildSha256:hash(root+'/inherited-build.json')}));
