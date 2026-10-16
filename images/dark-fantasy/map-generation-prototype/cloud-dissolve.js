// Erode cloud density into lobes and wisps; never lower the whole bank's opacity.
import { noise } from './water-drift.js';

export const cloudWind=seconds=>[seconds*.36+22*Math.sin(seconds/173),seconds*.09+19*Math.sin(seconds/269)];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

export function cloudDissolve(alpha,clearance,x,y,seconds,seed) {
  if(clearance<=0||alpha<=0)return 0;
  if(clearance>=1)return 1;
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
float cloudDissolve(float alpha,float clearance,vec2 w){
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
  float clearance=texture2D(uMask,uv).g;
  return bank*cloudDissolve(bank.a,clearance,uWorld.xy+uv*uWorld.zw);
}`;
