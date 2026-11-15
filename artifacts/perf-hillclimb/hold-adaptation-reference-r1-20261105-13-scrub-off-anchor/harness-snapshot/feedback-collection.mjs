// Serialized into the game realm. Collection may outlive the original HC marker;
// it never moves that marker or supplies a caller-invented completion timestamp.
export async function collectFeedback({postCompletionGraceMs=1000}={}) {
  if(globalThis.__HC__?.active)throw Error('feedback collection must follow original host completion/cancellation');
  if(!Number.isFinite(postCompletionGraceMs)||postCompletionGraceMs<0||postCompletionGraceMs>2000)throw Error('bounded feedback collection grace required');
  const began=performance.now(),initial=__HC_FEEDBACK__.status();
  const host=globalThis.__HC__?.operations?.at(-1);
  let expired=false,frame=null,timer=null;
  if(initial.active&&initial.phase==='observing'&&host&&host.error==null&&!host.timeout&&Number.isFinite(host.finished)&&postCompletionGraceMs>0){
    await new Promise(resolve=>{
      let ended=false;
      const done=()=>{if(ended)return;ended=true;if(frame!==null)cancelAnimationFrame(frame);clearTimeout(timer);resolve();};
      const poll=()=>{frame=null;const s=__HC_FEEDBACK__.status();if(!s.active||s.phase!=='observing')done();else frame=requestAnimationFrame(poll);};
      timer=setTimeout(()=>{expired=true;done();},postCompletionGraceMs);poll();
    });
  }
  const collectionWait={startMs:began,endMs:performance.now(),limitMs:postCompletionGraceMs,expired,
    scope:'bounded post-HC-marker observation; original latency/terminal fields unchanged; no physical first-pixel claim'};
  let record=__HC_FEEDBACK__.status().active?__HC_FEEDBACK__.finish():null;
  const batch=__HC_FEEDBACK__.drain();record??=batch.records.at(-1)??null;
  if(!record)throw Error('feedback record unavailable at collection');
  collectionWait.originalHostEndAtMs=record.hostEndAtMs;
  collectionWait.elapsedMs=collectionWait.endMs-collectionWait.startMs;
  collectionWait.overrun=collectionWait.elapsedMs>postCompletionGraceMs+1;
  return {record,export:batch,collectionWait};
}
