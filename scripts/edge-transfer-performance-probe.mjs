import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNewGameState} from '../src/model/new-game.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {createProjectionStateRestorer} from '../src/model/timegraph/state-restorer.js';
import {serializeGameState} from '../src/model/state.js';
import {buildEdgeTransferBatchAtBoundary} from '../src/model/edge-transfers.js';

// Use a compatible gameplay/schema revision. Only the packet reconstructor is
// loaded from Git; its imports use the current model in both measurements.
const baselineRef=process.argv[2]??'12c67e1',output='artifacts/edge-transfer-performance';
let source=execFileSync('git',['show',`${baselineRef}:src/model/edge-transfers.js`],{encoding:'utf8',windowsHide:true});
source=source.replace(/from "([^"]+)"/g,(_,specifier)=>`from ${JSON.stringify(pathToFileURL(path.resolve('src/model',specifier)).href)}`);
const baseline=(await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).buildEdgeTransferBatchAtBoundary;
const fixtures=[];
for(const seed of [1867,42]){
  const timeline=createTimelineFromInitialState(createNewGameState(seed)),reader=createProjectionStateRestorer();
  for(const second of [1,2,17,33,65]){
    const state=rebuildStateAtSecond(timeline,second-1).state;
    fixtures.push({seed,second,state:reader.restore(serializeGameState(state),second-1)});
  }
}
let comparisons=0;
for(const {state,second} of [...fixtures,...fixtures.toReversed()]){
  const before=serializeGameState(state),expected=baseline(state,second);
  assert.deepEqual(buildEdgeTransferBatchAtBoundary(state,second),expected);comparisons++;
  assert.deepEqual(serializeGameState(state),before,'Packet replay leaves its input unchanged');
}
// Alternate implementations after warmup to avoid attributing JIT startup or
// machine-load order to the fix. Input configs match the frozen forecast path.
const samples={baseline:[],current:[]};
for(let round=0;round<12;round++)for(const fixture of fixtures){
  for(const [name,fn] of round%2?[['current',buildEdgeTransferBatchAtBoundary],['baseline',baseline]]
    :[['baseline',baseline],['current',buildEdgeTransferBatchAtBoundary]]){
    const start=performance.now();fn(fixture.state,fixture.second);
    samples[name].push(performance.now()-start);
  }
}
const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
const baselineMs=median(samples.baseline),currentMs=median(samples.current);
const result={baselineRef,comparisons,baselineMs,currentMs,ratio:currentMs/baselineMs,samples};
await mkdir(output,{recursive:true});await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({baselineRef,comparisons,baselineMs,currentMs,ratio:result.ratio,artifact:`${output}/result.json`}));
assert.ok(result.ratio<.6,'Packet reconstruction should take less than 60% of the full-config-copy baseline');
