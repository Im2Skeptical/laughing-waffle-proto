import assert from 'node:assert/strict';
import {attributeObservationWindow} from './observation-windows.mjs';

const source={available:true,longTasksAvailable:true,startMs:10,endMs:100,
  frames:[{time:15,dt:15},{time:20,dt:5},{time:35,dt:15},{time:50,dt:15},{time:80,dt:30},{time:100,dt:20}],
  longTasks:[{start:0,duration:15},{start:15,duration:20},{start:50,duration:30},{start:80,duration:20}],
  trailingFrameRightCensored:false,trailingFrameLowerBoundMs:0};
const diagnostics=[{id:'a',label:'texture inspection',startMs:20,endMs:30},
  {id:'b',label:'nested drawing lookup',startMs:25,endMs:40},
  {id:'c',label:'screenshot',startMs:60,endMs:70}];
const before=JSON.stringify({source,diagnostics}),result=attributeObservationWindow(source,diagnostics);
assert.deepEqual(result.observationGaps,[{startMs:20,endMs:40,diagnosticIds:['a','b']},{startMs:60,endMs:70,diagnosticIds:['c']}]);
assert.equal(result.diagnosticUnionMs,30,'nested windows do not double-count removed time');
assert.deepEqual(result.outsideDiagnosticFrameIntervals.map(f=>f.time),[15,20,100],
  'positive overlaps remove whole intervals; exact endpoint contact does not');
assert.deepEqual(result.outsideDiagnosticLongTasks.map(t=>t.start),[0,80]);
assert.equal(result.excludedFrameIntervals.length,3);assert.equal(result.wholeWindowFrameEvidenceAvailable,false);
assert.equal(JSON.stringify({source,diagnostics}),before,'raw samples and windows remain untouched');
result.outsideDiagnosticFrameIntervals[0].dt=999;result.diagnosticWindows[0].startMs=999;
assert.equal(JSON.stringify({source,diagnostics}),before,'returned attribution cannot mutate raw inputs');
const open=attributeObservationWindow(source,[{id:'failed',label:'unfinished remote diagnostic',startMs:35,endMs:null}]);
assert.equal(open.hasUnclosedDiagnostic,true);assert.equal(open.diagnosticUnionMs,65);
assert.deepEqual(open.outsideDiagnosticFrameIntervals.map(f=>f.time),[15,20,35]);
const boundary=attributeObservationWindow(source,[{id:'before',label:'crosses initial frame',startMs:0,endMs:5}]);
assert.equal(boundary.observationGaps.length,0);assert.equal(boundary.excludedFrameIntervals.length,1,
  'diagnostic before declared window still excludes a crossing raw frame');
assert.equal(boundary.wholeWindowFrameEvidenceAvailable,false);
const clean=attributeObservationWindow(source,[]);assert.equal(clean.wholeWindowFrameEvidenceAvailable,true);
assert.equal(attributeObservationWindow(source,[{id:'zero',label:'zero duration',startMs:25,endMs:25}]).excludedFrameIntervals.length,0);
assert.equal(attributeObservationWindow({...source,trailingFrameRightCensored:true},[]).wholeWindowFrameEvidenceAvailable,false);
assert.equal(attributeObservationWindow({...source,available:false,frames:[],longTasks:[]},[]).wholeWindowFrameEvidenceAvailable,false);
assert.throws(()=>attributeObservationWindow(source,[...diagnostics,diagnostics[0]]),/unique/);
assert.throws(()=>attributeObservationWindow(source,[{id:'bad',label:'bad',startMs:5,endMs:4}]),/end/);
assert.throws(()=>attributeObservationWindow({...source,frames:[{time:20,dt:NaN}]},[]),/valid raw frame/);
assert.throws(()=>attributeObservationWindow({...source,longTasks:[{start:20,duration:-1}]},[]),/valid raw long task/);
assert.throws(()=>attributeObservationWindow({...source,endMs:source.startMs},[]),/positive/);
console.log('[observation-windows] exact edges, crossing samples, nested union, unclosed diagnostics, availability/censoring and raw-input isolation PASS');
