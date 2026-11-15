import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const out = 'artifacts/perf-hillclimb/approved-hold-adoption-parent-r1-20261105';
const git = (...args) => execFileSync('git', args, { windowsHide:true, encoding:'utf8' });
const files = [...new Set(git('ls-files','-m','-o','--exclude-standard','-z').split('\0').filter(Boolean))].sort();
const entries=[];
for (const file of files) {
  assert.ok(!file.startsWith('../') && !file.startsWith('/'));
  const bytes=await readFile(file);
  const target=`${out}/before/files/${file}`;
  await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});
  await copyFile(file,target);
  entries.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const snapshot={at:new Date().toISOString(),head:git('rev-parse','HEAD').trim(),branch:git('branch','--show-current').trim(),approved:'83c0049710882fd182c6542892d77fb30cd12ce6',entries,scope:'All modified/untracked nonignored task files copied byte for byte; ignored raw evidence remains in place and is authenticated separately. No performance or Phase A acceptance.'};
await writeFile(`${out}/before/inventory.json`,JSON.stringify(snapshot,null,2));
await writeFile(`${out}/before/tracked.patch`,execFileSync('git',['diff','--binary','HEAD'],{windowsHide:true}));
await writeFile(`${out}/before/approved-main.patch`,execFileSync('git',['show','--format=fuller','--binary',snapshot.approved],{windowsHide:true}));
const original='artifacts/perf-hillclimb/feedback-native-build-r1-20261105/final-source-integrity.mjs';
const script=await readFile(original,'utf8');
await writeFile(`${out}/before/integrity-script-origin.json`,JSON.stringify({file:original,sha256:createHash('sha256').update(script).digest('hex'),transformation:'Output directory only; proof assertions and authority pins unchanged.'},null,2));
await writeFile(`${out}/before/source-integrity.mjs`,script.replace("const out='artifacts/perf-hillclimb/feedback-native-build-r1-20261105';",`const out='${out}/before';`));
console.log(JSON.stringify({preserved:entries.length,head:snapshot.head,branch:snapshot.branch,out}));
