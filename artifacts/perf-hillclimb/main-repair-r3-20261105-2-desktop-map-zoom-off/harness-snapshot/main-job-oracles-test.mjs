import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scrubComplete} from './main-job-oracles.mjs';

const directory='artifacts/perf-hillclimb/main-j5-desktop-r1-20261105';
const rows=(await readFile(`${directory}/observations.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
for(const row of rows){
  const s=row.witness;
  const expected={second:row.input.sec,frontier:s.runner.frontierSec,revealed:row.input.cap,
    target:s.graph.targetSec,token:s.graph.asyncToken,subject:s.graph.subjectKey,
    revision:s.runner.revision,actions:s.runner.actionCount};
  assert.ok(scrubComplete(s,expected),'recorded actual product scrub satisfies exact terminal');
  for(const [label,change] of [
    ['wrong target',x=>{x.runner.viewedSec++;}],
    ['stale generation',x=>{x.graph.asyncToken='stale';}],
    ['stale projection signature',x=>{x.graph.projection.signatureMatches=false;}],
    ['clamp bypass',x=>{x.graph.browseCapSec=x.runner.viewedSec-1;}],
    ['changed frontier',x=>{x.runner.frontierSec++;}],
    ['no reveal progress',x=>{x.graph.revealedSec=expected.revealed;}],
  ]){
    const wrong=structuredClone(s);change(wrong);assert.equal(!!scrubComplete(wrong,expected),false,label);
  }
}
console.log('[main-job-oracles] recorded actual J5 positives and six rejection classes pass; browser fault controls remain separate');
