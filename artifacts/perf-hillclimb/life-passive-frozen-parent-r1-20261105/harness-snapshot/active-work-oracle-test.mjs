import assert from 'node:assert/strict';
import {assertActiveWork} from './active-work-oracle.mjs';

const source={version:2,runner:{revision:3,frontierSec:20},
  graph:{asyncToken:'current-generation',projection:{signatureMatches:true,timelineToken:'current-generation'},asyncHistoryEndSec:20,pending:true,requestedSec:100,computedSec:32,asyncRequestedSec:100,asyncComputedSec:32},
  life:{processing:{jobActive:false,sourceMatches:false,requestId:null}}};
const reply={kind:'response',url:'timegraph-forecast-worker-HASH.js',time:25,message:'chunkResult',
  timelineToken:'current-generation',historyEndSec:20,resultOk:true,baseSec:32,endSec:48};
const sample=()=>({expectedBefore:structuredClone(source),after:structuredClone(source),timing:{started:10,finished:60,
  trustedInput:true,inputTimingReadStarted:12,inputTimingReadMs:.01,inputTimingSnapshot:structuredClone(source),workerEvents:[{...reply}]}});
assert.equal(assertActiveWork(sample()).graphReplies,1);
const progress=sample();progress.timing.workerEvents=[];progress.after.graph.computedSec=48;
assert.equal(assertActiveWork(progress).graphProgress,true);
for(const changed of [{timelineToken:'old-generation'},{historyEndSec:0},{time:9},{time:61},{resultOk:false},{endSec:32},{url:'unrelated-worker.js'}]){
  const wrong=sample();Object.assign(wrong.timing.workerEvents[0],changed);
  assert.throws(()=>assertActiveWork(wrong),/matching current-generation/,'wrong, stale, failed or out-of-window delivery cannot prove current work');
}
const beforeOnly=sample();beforeOnly.timing.workerEvents=[];beforeOnly.expectedBefore.graph.computedSec=16;
assert.throws(()=>assertActiveWork(beforeOnly),/matching current-generation/,'progress before the actual input does not count');
const idle=sample();Object.assign(idle.timing.inputTimingSnapshot.graph,{pending:false,requestedSec:32,asyncRequestedSec:32});
assert.throws(()=>assertActiveWork(idle),/in flight at input/,'an earlier active host snapshot cannot stand in for input-time work');
const terminalLoss=sample();terminalLoss.timing.inputTimingSnapshot.graph.pending=false;
assert.throws(()=>assertActiveWork(terminalLoss),/in flight at input/,'retained desired coverage beyond a terminal loss is not an active worker');
for(const changed of [{signatureMatches:false},{timelineToken:'new-source'},{signatureMatches:null}]){
  const stale=sample();Object.assign(stale.timing.inputTimingSnapshot.graph.projection,changed);
  assert.throws(()=>assertActiveWork(stale),/in flight at input/,'a matching reply for an old cached token cannot prove work for the actual timeline');
}
const staleProgress=sample();staleProgress.timing.workerEvents=[];Object.assign(staleProgress.after.graph,{asyncToken:'replacement',computedSec:48});
assert.throws(()=>assertActiveWork(staleProgress),/matching current-generation/);
const missing=sample();delete missing.timing.inputTimingSnapshot;assert.throws(()=>assertActiveWork(missing),/actual passive DTO/);
const early=sample();early.timing.inputTimingReadStarted=9;assert.throws(()=>assertActiveWork(early),/belongs to the measured operation/);
const foreign=sample();foreign.timing.inputTimingSnapshot.runner.revision=4;assert.throws(()=>assertActiveWork(foreign),/source revision/);

const life=sample();Object.assign(life.timing.inputTimingSnapshot.graph,{pending:false,requestedSec:32,asyncRequestedSec:32});
const job={jobActive:true,sourceMatches:true,workerActive:true,jobReady:false,ready:false,requestId:7,sourceRevision:3,sourceSec:20,targetSec:80,computedSec:32};
life.timing.inputTimingSnapshot.life.processing={...job};life.after.life.processing={...job};
life.timing.workerEvents=[{kind:'response',url:'life-decision-worker-HASH.js',time:30,message:'chunk',requestId:7,chunkOk:true,chunkEndSec:48}];
assert.equal(assertActiveWork(life).lifeReplies,1);
life.timing.workerEvents[0].requestId=6;assert.throws(()=>assertActiveWork(life),/matching current-generation/);
life.timing.workerEvents=[];life.after.life.processing.computedSec=48;assert.equal(assertActiveWork(life).lifeProgress,true);
life.timing.inputTimingSnapshot.life.processing.jobReady=true;
assert.throws(()=>assertActiveWork(life),/in flight at input/,'a retained completed worker object does not count as active compute');
life.timing.inputTimingSnapshot.life.processing.jobReady=false;
life.timing.inputTimingSnapshot.life.processing.sourceMatches=false;
assert.throws(()=>assertActiveWork(life),/in flight at input/,'a stale retained Life job cannot count as current');
console.log('[hillclimb-active-work] semantic controls pass: trusted input-time source, matching generation/progress, stale/unrelated/failed/out-of-window rejection; browser proof still required');
