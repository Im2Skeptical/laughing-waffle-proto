// All world motion is a pure sample of viewed simulation time. No accumulated
// emitter state, wall-clock lifetimes, or mutable random stream is involved.
export function loopPhase(timeSec, periodSec, offsetSec = 0) {
  if (!Number.isFinite(timeSec) || !Number.isFinite(periodSec) || periodSec <= 0) return 0;
  const value=(timeSec-offsetSec)/periodSec;
  return value-Math.floor(value);
}

export function sampleSpriteFrame(timeSec, {frameCount, framesPerSecond, startSec=0}) {
  if(!Number.isFinite(frameCount)||frameCount<1||!Number.isFinite(framesPerSecond)||framesPerSecond<=0) return 0;
  const count=Math.floor(frameCount);
  return Math.min(count-1,Math.floor(loopPhase(timeSec,count/framesPerSecond,startSec)*count));
}

export function sampleEventProgress(timeSec, startSec, durationSec) {
  if(![timeSec,startSec,durationSec].every(Number.isFinite)||durationSec<=0) return null;
  const age=(timeSec-startSec)/durationSec;
  return age>=0&&age<=1?age:null;
}

export function resolveVisualTime(viewedSec, playbackSec) {
  const viewed=Number.isFinite(viewedSec)?Math.max(0,viewedSec):0;
  // Never render a future fractional frame while its model snapshot is missing.
  return Number.isFinite(playbackSec)&&Math.floor(playbackSec)===Math.floor(viewed)
    ? Math.max(0,playbackSec):viewed;
}

export function sampleMote(timeSec, index, rect) {
  const phase=loopPhase(timeSec,9+(index%7),index*.71);
  return {
    x:rect.x+loopPhase(index*.618+timeSec*.003,1)*rect.width,
    y:rect.y+rect.height*(1-phase),
    alpha:Math.sin(phase*Math.PI)*(.12+(index%3)*.035),
    frame:sampleSpriteFrame(timeSec,{frameCount:4,framesPerSecond:6,startSec:index}),
  };
}

// One analytic score shared by the forward and reversed PCM buffers. Frequencies
// are whole cycles per score, so the loop seam is continuous in both directions.
export const SCORE_DURATION_SEC = 24;
export function sampleChronicleScore(timeSec) {
  const t=loopPhase(timeSec,SCORE_DURATION_SEC)*SCORE_DURATION_SEC;
  const tau=Math.PI*2;
  const bed=(Math.sin(t*tau*55)+.38*Math.sin(t*tau*82.5)+.22*Math.sin(t*tau*110))*.022;
  const breath=.6+.4*Math.sin(t*tau/SCORE_DURATION_SEC);
  const beat=loopPhase(t,3)*3;
  const bell=Math.exp(-beat*4)*(Math.sin(tau*220*beat)+.35*Math.sin(tau*327*beat))*.045*Math.min(1,beat*100);
  const wind=(Math.sin(t*tau*137.5)+Math.sin(t*tau*163.75)+Math.sin(t*tau*181.25))*.004*breath;
  return bed*breath+bell+wind;
}

export function audioOffsetAtTime(timeSec, reversed, durationSec=SCORE_DURATION_SEC) {
  const phase=loopPhase(timeSec,durationSec)*durationSec;
  return reversed?(durationSec-phase)%durationSec:phase;
}

export function layoutChronicleNodes(nodes, rect) {
  const columns=new Map();
  for(const node of nodes){
    const key=node.depth??node.position?.x??0;
    if(!columns.has(key))columns.set(key,[]);
    columns.get(key).push(node);
  }
  const result=new Map();
  for(const column of columns.values()){
    column.sort((a,b)=>(a.position?.y??0)-(b.position?.y??0)||String(a.id).localeCompare(String(b.id)));
    const gap = Math.min(84, rect.height / Math.max(1, column.length - 1));
    const ys = column.map(node => (node.position?.y ?? .5) * rect.height);
    // Keep the generated lanes; separate crowded icons without stretching
    // every depth into an identical full-height column.
    for(let i=1;i<ys.length;i++) ys[i]=Math.max(ys[i],ys[i-1]+gap);
    if(ys.length && ys.at(-1)>rect.height){
      ys[ys.length-1]=rect.height;
      for(let i=ys.length-2;i>=0;i--) ys[i]=Math.min(ys[i],ys[i+1]-gap);
    }
    column.forEach((node,i)=>{
      const x = (node.position?.x ?? 0) * rect.width;
      // A fixed lane/depth wave is cosmetic, stable across seeks, and consumes no RNG.
      const stagger = Math.sin((node.depth ?? 0)*2.4+(node.position?.y ?? .5)*9)*18;
      result.set(node.id,{
        x:rect.x+Math.max(0,Math.min(rect.width,x+stagger)),
        y:rect.y+ys[i],
      });
    });
  }
  return result;
}
