// Presentation-only wheel smoothing, independent of texture sampling.
export function createWheelZoom(camera, paint, { request = requestAnimationFrame, cancel = cancelAnimationFrame } = {}) {
  let frame = null, target = null, last = null;
  const stop = () => { if (frame !== null) cancel(frame); frame = target = last = null; };
  const tick = time => {
    const current = camera.snapshot(), dt = last === null ? 16 : Math.min(50, time-last);
    last = time;
    const amount = 1-Math.exp(-dt/65);
    const next = Object.fromEntries(['x','y','zoom'].map(k=>[k,current[k]+(target[k]-current[k])*amount]));
    if (Math.abs(next.zoom-target.zoom)<.0001) { camera.restore(target); stop(); paint(); return; }
    camera.restore(next); paint(); frame=request(tick);
  };
  return { cancel: stop, wheel(delta, point) {
    const current=camera.snapshot();
    const zoom=Math.max(Math.min(.35,current.zoom),Math.min(2.5,(target?.zoom??current.zoom)*Math.exp(-delta*.0015)));
    target={zoom,x:point.x-(point.x-current.x)*zoom/current.zoom,y:point.y-(point.y-current.y)*zoom/current.zoom};
    if(frame===null) frame=request(tick);
  } };
}
