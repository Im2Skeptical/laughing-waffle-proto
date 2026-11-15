import assert from 'node:assert/strict';

// J3 input-time source, current matching work and progress are separate facts.
// A generic response from another job/generation cannot satisfy this oracle.
export function assertActiveWork({expectedBefore,after,timing}){
  assert.equal(timing.inputTimingError,undefined,'input-time passive reader must succeed');
  const before=timing.inputTimingSnapshot;
  assert.equal(before?.version,2,'J3 requires an actual passive DTO at the first real input');
  assert.ok(Number.isFinite(timing.inputTimingReadStarted)&&timing.inputTimingReadStarted>=timing.started
    &&timing.inputTimingReadStarted<=timing.finished,'input-time witness belongs to the measured operation');
  assert.equal(timing.trustedInput,true,'J3 input must be trusted');
  assert.equal(before.runner.revision,expectedBefore.runner.revision,'J3 remains on its declared source revision');
  assert.equal(before.runner.frontierSec,expectedBefore.runner.frontierSec,'J3 remains on its declared source frontier');
  assert.equal(after.runner.revision,before.runner.revision,'map/navigation input preserves source revision');
  assert.equal(after.runner.frontierSec,before.runner.frontierSec,'map/navigation input preserves authoritative frontier');
  assert.equal(after.runner.actionCount,before.runner.actionCount,'map/navigation input records no simulation action');
  const graphActive=before.graph.asyncToken!==null&&before.graph.asyncToken!==undefined
    &&before.graph.projection?.signatureMatches===true&&before.graph.projection.timelineToken===before.graph.asyncToken
    &&before.graph.asyncHistoryEndSec===before.runner.frontierSec
    &&before.graph.pending===true&&before.graph.requestedSec>before.graph.computedSec;
  const job=before.life.processing;
  const lifeActive=job.jobActive===true&&job.sourceMatches===true&&job.jobReady===false&&job.ready===false
    &&job.requestId!==null&&job.requestId!==undefined
    &&(job.workerActive===true||job.targetSec>job.computedSec);
  const graphProgress=graphActive&&after.graph.asyncToken===before.graph.asyncToken
    &&after.graph.asyncHistoryEndSec===before.graph.asyncHistoryEndSec&&after.graph.computedSec>before.graph.computedSec;
  const next=after.life.processing;
  const lifeProgress=lifeActive&&next.sourceMatches===true&&next.requestId===job.requestId
    &&next.sourceRevision===job.sourceRevision&&next.sourceSec===job.sourceSec&&next.computedSec>job.computedSec;
  const replies=(timing.workerEvents??[]).filter(e=>e.kind==='response'&&e.time>=timing.started&&e.time<=timing.finished);
  const graphReplies=graphActive?replies.filter(e=>/timegraph-forecast-worker/.test(e.url)&&e.message==='chunkResult'
    &&e.timelineToken===before.graph.asyncToken&&e.historyEndSec===before.graph.asyncHistoryEndSec
    &&e.resultOk===true&&e.endSec>e.baseSec&&e.endSec>before.graph.computedSec):[];
  const lifeReplies=lifeActive?replies.filter(e=>/life-decision-worker/.test(e.url)&&e.message==='chunk'
    &&e.requestId===job.requestId&&e.chunkOk===true&&e.chunkEndSec>job.computedSec):[];
  assert.ok(graphActive||lifeActive,'J3 requires real current work in flight at input, not idle cached reveal');
  assert.ok(graphReplies.length||lifeReplies.length||graphProgress||lifeProgress,
    'J3 requires matching current-generation work/progress within the measured operation');
  return {graphActive,lifeActive,graphProgress,lifeProgress,graphReplies:graphReplies.length,lifeReplies:lifeReplies.length,
    inputWitness:before,inputTimingReadMs:timing.inputTimingReadMs,after,
    scope:'current work in flight at trusted input plus corresponding progress/delivery; not worker CPU occupancy or physical presentation'};
}
