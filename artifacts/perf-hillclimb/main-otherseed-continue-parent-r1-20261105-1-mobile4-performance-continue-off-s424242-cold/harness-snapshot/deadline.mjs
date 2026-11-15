// Liveness guard for harness-side waits. This does not substitute a host clock
// for application latency; browser timing records retain their own clock.
export async function withDeadline(promise,timeoutMs,label='harness wait') {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('positive finite deadline required');
  let timer;
  try {
    return await Promise.race([promise,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(`${label} timeout after ${timeoutMs}ms`)),timeoutMs);
    })]);
  }finally{clearTimeout(timer);}
}
