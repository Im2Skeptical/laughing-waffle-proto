// Erode cloud density into lobes and wisps; never lower the whole bank's opacity.
import { noise } from './water-drift.js';
import { cloudWeatherTime } from './cloud-cover.js';

export const cloudWind=seconds=>[seconds*.36+22*Math.sin(seconds/173),seconds*.09+19*Math.sin(seconds/269)];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

// Broad stretches and smaller bays wander on different, non-looping timescales.
// Geography stays fixed; this is only the weather clearance around its edge.
export function cloudBoundaryClearance(distanceCode,x,y,seconds,seed) {
  if(distanceCode<=0)return 0;
  if(distanceCode>=1)return 1;
  seconds=cloudWeatherTime(seconds);
  const distance=distanceCode*512-256,salt=(seed%997)*.0713;
  const broad=noise(x/220+salt,y/220-29,seconds/1200);
  const local=noise((x*.8-y*.6)/100-51,(x*.6+y*.8)/100+salt,seconds/2700+17);
  const centre=32+30*broad+12*local,halfWidth=56+6*local;
  return smooth(centre-halfWidth,centre+halfWidth,distance)*smooth(-65,-30,distance);
}

export function cloudDissolve(alpha,distanceCode,x,y,seconds,seed) {
  if(alpha<=0)return 0;
  const clearance=cloudBoundaryClearance(distanceCode,x,y,seconds,seed);
  if(clearance<=0||alpha<=0)return 0;
  if(clearance>=1)return 1;
  seconds=cloudWeatherTime(seconds);
  const wind=cloudWind(seconds),u=(x-wind[0])/26,v=(y-wind[1])/26;
  const z=seconds/347+(seed%997)*.0713;
  const warp=noise(u*.31+17,v*.31-39,z*.37);
  const broad=noise(u+warp*.8,v-warp*.6,z);
  const fine=noise(u*2.7-31,v*2.7+73,z*.71+19);
  const structure=.5+.5*(broad*.78+fine*.22);
  const resistance=.40*Math.min(1,alpha/.78)+.60*structure;
  const threshold=1.12*(1-clearance)-.06;
  return smooth(threshold-.045,threshold+.045,resistance);
}

// Uses driftNoise from WATER_DRIFT_GLSL. Evaluate identically at the cloud and
// the shadow's source position so holes cast matching broken shadows.
export const CLOUD_DISSOLVE_GLSL=`
float cloudBoundaryClearance(float distanceCode,vec2 w){
  if(distanceCode<=0.0)return 0.0;
  if(distanceCode>=1.0)return 1.0;
  float distance=distanceCode*512.0-256.0;
  float broad=driftNoise(vec3(w/220.0+vec2(uCloudSalt,-29),uCloudTime/1200.0));
  vec2 localUV=vec2(w.x*.8-w.y*.6,w.x*.6+w.y*.8)/100.0+vec2(-51,uCloudSalt);
  float local=driftNoise(vec3(localUV,uCloudTime/2700.0+17.0));
  float centre=32.0+30.0*broad+12.0*local,halfWidth=56.0+6.0*local;
  return smoothstep(centre-halfWidth,centre+halfWidth,distance)*smoothstep(-65.0,-30.0,distance);
}
float cloudDissolve(float alpha,float distanceCode,vec2 w){
  if(alpha<=0.0)return 0.0;
  float clearance=cloudBoundaryClearance(distanceCode,w);
  if(clearance<=0.0||alpha<=0.0)return 0.0;
  if(clearance>=1.0)return 1.0;
  vec2 uv=(w-uCloudWind)/26.0;
  float z=uCloudTime/347.0+uCloudSalt;
  float warp=driftNoise(vec3(uv*.31+vec2(17,-39),z*.37));
  float broad=driftNoise(vec3(uv+vec2(warp*.8,-warp*.6),z));
  float fine=driftNoise(vec3(uv*2.7+vec2(-31,73),z*.71+19.0));
  float structure=.5+.5*(broad*.78+fine*.22);
  float resistance=.40*min(1.0,alpha/.78)+.60*structure;
  float threshold=1.12*(1.0-clearance)-.06;
  return smoothstep(threshold-.045,threshold+.045,resistance);
}
vec4 dissolvedCloud(vec2 uv){
  vec4 bank=texture2D(uClouds,uv);
  float distanceCode=texture2D(uMask,uv).g;
  return bank*cloudDissolve(bank.a,distanceCode,uWorld.xy+uv*uWorld.zw);
}`;
