import { audioOffsetAtTime, sampleChronicleScore, SCORE_DURATION_SEC, loopPhase } from './timeline-presentation.js';

// Audio is a seekable rendering of the same transport as the picture. Browsers
// play a reversed PCM buffer at a positive rate, including browsers without
// negative AudioBufferSource playbackRate support. UI fades only prevent clicks.
export function createTimelineAudio({getTime, getRate, isSuspended, parent}) {
  const button=document.createElement('button');button.type='button';
  button.dataset.testid='chronicle-audio';button.className='chronicle-audio';
  button.setAttribute('aria-label','Enable timeline sound');button.setAttribute('aria-pressed','false');
  button.textContent='♪';button.title='Timeline sound';parent?.append(button);
  let context=null, buffers=null, active=null, enabled=false, disposed=false;
  let lastTime=null,lastRate=0,lastDirection=1;
  function stop(){
    if(!active)return;
    const entry=active;active=null;
    entry.gain.gain.cancelScheduledValues(context.currentTime);
    entry.gain.gain.setTargetAtTime(0,context.currentTime,.008);
    entry.source.stop(context.currentTime+.04);
  }
  function makeBuffers(){
    const length=Math.round(context.sampleRate*SCORE_DURATION_SEC);
    const forward=context.createBuffer(1,length,context.sampleRate);
    const backward=context.createBuffer(1,length,context.sampleRate);
    const a=forward.getChannelData(0),b=backward.getChannelData(0);
    for(let i=0;i<length;i++) a[i]=sampleChronicleScore(i/context.sampleRate);
    for(let i=0;i<length;i++) b[i]=a[(length-i)%length];
    return [forward,backward];
  }
  function start(time,rate){
    stop();
    const source=context.createBufferSource(),gain=context.createGain();
    const reversed=rate<0;source.buffer=buffers[reversed?1:0];source.loop=true;
    source.playbackRate.value=Math.abs(rate);
    gain.gain.value=0;gain.gain.setTargetAtTime(.7,context.currentTime,.015);
    source.connect(gain);gain.connect(context.destination);
    source.onended=()=>{source.disconnect();gain.disconnect();};
    source.start(0,audioOffsetAtTime(time,reversed));
    active={source,gain,time,at:context.currentTime,rate};
  }
  async function toggle(){
    enabled=!enabled;
    if(enabled){
      try{
        const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;
        if(!Audio)throw Error('Audio unavailable');
        context??=new Audio();await context.resume();
        if(disposed)return;
        buffers??=makeBuffers();
      }catch{enabled=false;button.title='Sound unavailable in this browser';}
    }
    button.setAttribute('aria-pressed',String(enabled));
    button.setAttribute('aria-label',enabled?'Mute timeline sound':'Enable timeline sound');
    if(!enabled)stop();
  }
  button.addEventListener('click',toggle);
  const visibility=()=>{if(document.hidden)stop();};
  document.addEventListener('visibilitychange',visibility);
  return {
    update(frameDt){
      const time=getTime();
      const movement=lastTime==null?0:time-lastTime;
      const requested=getRate();
      // The graph's forecast unveiling can also move the view while transport is
      // held. Small seek grains are audible; a stationary picture stays silent,
      // including when transport is pressed against a history/forecast boundary.
      const rate=movement===0?0:requested!==0?requested:
        Math.sign(movement)*Math.min(4,Math.abs(movement)/Math.max(.001,frameDt));
      if(rate!==0)lastDirection=Math.sign(rate);
      lastTime=time;lastRate=rate;
      if(!enabled||!buffers||isSuspended()||document.hidden||context.state!=='running'||rate===0){stop();return;}
      if(!active){start(time,rate);return;}
      const expected=active.time+(context.currentTime-active.at)*active.rate;
      const distance=Math.abs(loopPhase(time-expected+SCORE_DURATION_SEC/2,SCORE_DURATION_SEC)*SCORE_DURATION_SEC-SCORE_DURATION_SEC/2);
      if(Math.sign(rate)!==Math.sign(active.rate)||distance>.09)start(time,rate);
      else if(rate!==active.rate){
        active.time=expected;active.at=context.currentTime;active.rate=rate;
        active.source.playbackRate.setValueAtTime(Math.abs(rate),context.currentTime);
      }
    },
    getSnapshot:()=>({enabled,playing:!!active,rate:lastRate,direction:lastDirection,sourceTime:lastTime}),
    destroy(){disposed=true;stop();void context?.close();button.remove();document.removeEventListener('visibilitychange',visibility);},
  };
}
