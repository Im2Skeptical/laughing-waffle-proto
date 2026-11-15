import assert from 'node:assert/strict';

// Attribution only: never shortens an operation latency or certifies that the
// remaining samples are observer-free. Keep the original telemetry alongside
// this result. An entire crossing interval is removed conservatively.
export function attributeObservationWindow(observed,diagnostics){
  assert.ok(observed&&Number.isFinite(observed.startMs)&&Number.isFinite(observed.endMs)
    &&observed.startMs>=0&&observed.endMs>observed.startMs,'positive document-clock observation window required');
  assert.equal(typeof observed.available,'boolean','frame availability is explicit');
  assert.equal(typeof observed.longTasksAvailable,'boolean','long-task availability is explicit');
  assert.ok(Array.isArray(observed.frames)&&Array.isArray(observed.longTasks)&&Array.isArray(diagnostics));
  const windows=diagnostics.map(window=>{
    assert.ok(typeof window.id==='string'&&window.id.length>0&&typeof window.label==='string');
    assert.ok(Number.isFinite(window.startMs)&&window.startMs>=0,'diagnostic start must be known');
    assert.ok(window.endMs===null||Number.isFinite(window.endMs)&&window.endMs>=window.startMs,
      'diagnostic end must be closed or explicitly unknown');
    return {...window};
  });
  assert.equal(new Set(windows.map(w=>w.id)).size,windows.length,'diagnostic identities must be unique');
  const overlaps=(start,end)=>windows.some(w=>(w.endMs===null||w.endMs>w.startMs)
    &&end>w.startMs&&start<(w.endMs??Infinity));
  const frames=observed.frames.map(frame=>{
    assert.ok(Number.isFinite(frame.time)&&Number.isFinite(frame.dt)&&frame.dt>0,'valid raw frame interval required');
    return {...frame};
  });
  const tasks=observed.longTasks.map(task=>{
    assert.ok(Number.isFinite(task.start)&&Number.isFinite(task.duration)&&task.duration>0,'valid raw long task required');
    return {...task};
  });
  const excludedFrameIntervals=frames.filter(f=>overlaps(f.time-f.dt,f.time));
  const outsideDiagnosticFrameIntervals=frames.filter(f=>!overlaps(f.time-f.dt,f.time));
  const excludedLongTasks=tasks.filter(t=>overlaps(t.start,t.start+t.duration));
  const outsideDiagnosticLongTasks=tasks.filter(t=>!overlaps(t.start,t.start+t.duration));
  const clipped=windows.map(w=>({startMs:Math.max(observed.startMs,w.startMs),
    endMs:Math.min(observed.endMs,w.endMs??Infinity),diagnosticIds:[w.id]}))
    .filter(w=>w.endMs>w.startMs).sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
  const observationGaps=[];
  for(const window of clipped){
    const previous=observationGaps.at(-1);
    if(previous&&window.startMs<=previous.endMs){
      previous.endMs=Math.max(previous.endMs,window.endMs);previous.diagnosticIds.push(...window.diagnosticIds);
    }else observationGaps.push({...window,diagnosticIds:[...window.diagnosticIds]});
  }
  return {available:observed.available,longTasksAvailable:observed.longTasksAvailable,
    startMs:observed.startMs,endMs:observed.endMs,diagnosticWindows:windows,observationGaps,
    diagnosticUnionMs:observationGaps.reduce((total,w)=>total+w.endMs-w.startMs,0),
    outsideDiagnosticFrameIntervals,outsideDiagnosticLongTasks,excludedFrameIntervals,excludedLongTasks,
    rawTrailingFrameRightCensored:observed.trailingFrameRightCensored,
    rawTrailingFrameLowerBoundMs:observed.trailingFrameLowerBoundMs,
    hasUnclosedDiagnostic:windows.some(w=>w.endMs===null&&w.startMs<observed.endMs),
    wholeWindowFrameEvidenceAvailable:observed.available&&observed.trailingFrameRightCensored===false
      &&observationGaps.length===0&&excludedFrameIntervals.length===0&&frames.length>0,
    scope:'attribution only; raw telemetry retained; crossing intervals excluded whole; gaps never establish smoothness; common sampling/hooks/driver overhead remain unproved'};
}
