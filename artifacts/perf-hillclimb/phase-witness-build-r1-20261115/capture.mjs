import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {instrumentArtworkBundle} from '../../../scripts/perf-hillclimb/artwork-bundle-controls.mjs';
const root='artifacts/perf-hillclimb/phase-witness-build-r1-20261115',sha=x=>createHash('sha256').update(x).digest('hex');
const before=JSON.parse(await readFile(path.join(root,'before.json'),'utf8'));
const owned=['scripts/perf-hillclimb/artwork-bundle-controls.mjs','scripts/perf-hillclimb/artwork-bundle-controls-test.mjs','scripts/perf-hillclimb/artwork-controls.mjs','docs/performance/perf-hillclimb-20261104/PHASE_WITNESS_IMPLEMENTATION_20261115.md'];
await mkdir(path.join(root,'after'));await writeFile(path.join(root,'empty-before-note'),'');
const receipt={at:new Date().toISOString(),phaseA:'NOT SOUND',independentReview:'PENDING',actualCases:'NOT RUN',files:{},assets:{},controls:{},processes:'All focused commands synchronous and completed; no browser/build/benchmark/server launched by Builder',scope:'Three harness files plus implementation note only; parent HARNESS addendum excluded from Builder ownership'};
for(const file of owned){
  const bytes=await readFile(file),flat=file.replaceAll('/','__');receipt.files[file]={sha256:sha(bytes),bytes:bytes.length,beforeSha256:before.files[file]??null};
  await copyFile(file,path.join(root,'after',flat));
  const baseline=before.files[file]?path.join(root,'before',flat):path.join(root,'empty-before-note');
  const result=spawnSync('git',['diff','--no-index','--',baseline,file],{encoding:'utf8'});
  if(![0,1].includes(result.status))throw Error(result.stderr);
  await writeFile(path.join(root,flat+'.diff'),result.stdout);
}
for(const [file,expected]of Object.entries(before.assets)){
  const bytes=await readFile(path.join('dist',file)),actual=sha(bytes);
  receipt.assets[file]={expected,actual,unchanged:actual===expected};if(actual!==expected)throw Error('built asset changed: '+file);
}
const build=JSON.parse(await readFile('dist/build-manifest.json','utf8')),body=await readFile(path.join('dist',build.bundle),'utf8');
const off=instrumentArtworkBundle(body),on=instrumentArtworkBundle(body,{phaseWitness:true});
receipt.variants={original:sha(body),defaultOff:sha(off.body),phaseOn:sha(on.body),phaseVersion:on.phaseWitnessVersion};
await writeFile(path.join(root,'phase-on-prefix.js'),on.prefix);
await writeFile(path.join(root,'phase-on-response.js'),on.body);
for(let n=1;n<=5;n++){
  const file=`focused-r${n}.log`,bytes=await readFile(path.join(root,file));
  receipt.controls[file]={sha256:sha(bytes),result:n===1?'FAIL: Script parser rejects actual ESM import.meta; corrected to module parser':'PASS'};
}
const check=spawnSync('git',['diff','--check','--',...owned],{encoding:'utf8'});
receipt.diffCheck={status:check.status,stderr:check.stderr};await writeFile(path.join(root,'diff-check.log'),check.stdout+check.stderr);
for(const file of owned.filter(x=>x.endsWith('.mjs'))){
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  receipt.files[file].syntaxCheck=checked.status;if(checked.status!==0)throw Error(checked.stderr);
}
receipt.currentContractSha256=sha(await readFile('docs/performance/perf-hillclimb-20261104/HARNESS.md'));
await writeFile(path.join(root,'after.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({files:receipt.files,assetsUnchanged:Object.values(receipt.assets).every(x=>x.unchanged),variants:receipt.variants,diffCheck:check.status,evidence:root+'/after.json'},null,2));
