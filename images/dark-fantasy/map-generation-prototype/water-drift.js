// Broad offshore colour movement, independent of the surface palette cycles.
// Absolute sampled time keeps reverse playback and arbitrary seeks reproducible.
export function waterDriftPhase(seconds) {
  return [seconds / 110 + .18 * Math.sin(seconds / 317),
    seconds / 197 + .25 * Math.sin(seconds / 941)];
}
export const waterDriftOffset = seed => (seed % 997) * .713;
export function waterDriftMask(body, distance) {
  if (body !== 1) return 0; // Marine only; never recolour lakes, peat or rivers.
  const t = Math.max(0, Math.min(1, (distance - 14) / 58));
  return t * t * (3 - 2 * t);
}
const mod = n => n - Math.floor(n / 289) * 289;
const permute = n => mod((n * 34 + 1) * n);
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a,b,t) => a + (b-a)*t;
// Integer polynomial hash stays exact in highp float on the GPU. No sine hash
// (which diverges between JS and GLSL), frame history, or simulation RNG.
function noise(x,y,z) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const fx=fade(x-ix),fy=fade(y-iy),fz=fade(z-iz);
  const h=(dx,dy,dz)=>permute(permute(permute(mod(ix+dx))+mod(iy+dy))+mod(iz+dz))/144-1;
  return mix(mix(mix(h(0,0,0),h(1,0,0),fx),mix(h(0,1,0),h(1,1,0),fx),fy),
    mix(mix(h(0,0,1),h(1,0,1),fx),mix(h(0,1,1),h(1,1,1),fx),fy),fz);
}
export function sampleWaterDrift(x, y, seconds) {
  const [p, q] = waterDriftPhase(seconds);
  // Local displacement changes direction across the field. Time evolves a
  // third noise dimension instead of translating a tiled sheet across the map.
  const wx=noise(x/260,y/260,p*.37),wy=noise(x/260+31,y/260-17,q*.41);
  const u=x/145+wx*1.15,v=y/145+wy*1.15;
  const a=.72*noise(u,v,p)+.28*noise((u*.8-v*.6)*2.1+19,(u*.6+v*.8)*2.1-43,q+11);
  const b=noise(u*.57+v*.49+73,-u*.49+v*.57-29,q+47);
  return [3 * a - 2 * b, 6 * a + 2 * b, -3 * a + 4 * b];
}
// Same field as the CPU/graph sampler; output is in 8-bit channel units.
export const WATER_DRIFT_GLSL = `
float driftMod(float x){return x-floor(x/289.0)*289.0;}
float driftPermute(float x){return driftMod((x*34.0+1.0)*x);}
float driftHash(vec3 p){
  p=p-floor(p/289.0)*289.0;
  return driftPermute(driftPermute(driftPermute(p.x)+p.y)+p.z)/144.0-1.0;
}
float driftNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(mix(driftHash(i),driftHash(i+vec3(1,0,0)),f.x),
    mix(driftHash(i+vec3(0,1,0)),driftHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(driftHash(i+vec3(0,0,1)),driftHash(i+vec3(1,0,1)),f.x),
    mix(driftHash(i+vec3(0,1,1)),driftHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 waterDrift(vec2 w, vec2 phase) {
  vec2 warp=vec2(driftNoise(vec3(w/260.0,phase.x*0.37)),
    driftNoise(vec3(w/260.0+vec2(31,-17),phase.y*0.41)));
  vec2 uv=w/145.0+warp*1.15;
  float a=0.72*driftNoise(vec3(uv,phase.x))+0.28*driftNoise(vec3(
    vec2(uv.x*0.8-uv.y*0.6,uv.x*0.6+uv.y*0.8)*2.1+vec2(19,-43),phase.y+11.0));
  float b=driftNoise(vec3(uv.x*0.57+uv.y*0.49+73.0,-uv.x*0.49+uv.y*0.57-29.0,phase.y+47.0));
  return vec3(3.0*a-2.0*b,6.0*a+2.0*b,-3.0*a+4.0*b)/255.0;
}`;
