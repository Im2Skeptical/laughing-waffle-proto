// Decorative cloud time is a fixed function of simulation time, never scrub
// speed or the selected timeline span. Reverse and return-to-date stay exact.
import { noise } from './water-drift.js';

export const cloudWeatherTime=seconds=>seconds*.18;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

// World-sized openings, shared by every bank. Dense clouds erode here while
// small cumulus remains: this is a sparse weather patch, not an empty cutout.
export function cloudOpening(x,y,time,seed) {
  const salt=(seed%997)*.0713;
  const u=(x-time*.025)/720+salt,v=(y-time*.008)/470-19;
  const warp=noise(u*.63+31,v*.63-11,time/5000);
  const field=noise(u+warp*.3,v-warp*.25,time/4000+7);
  const opening=smooth(-.06,.30,field);
  const edge=noise(x/85+salt,y/85+37,time/1800);
  return Math.max(0,Math.min(1,opening+.30*edge*4*opening*(1-opening)));
}

export const CLOUD_COVER_GLSL=`
float cloudOpening(vec2 w,float time,float salt){
  vec2 uv=(w-time*vec2(.025,.008))/vec2(720.0,470.0)+vec2(salt,-19);
  float warp=driftNoise(vec3(uv*.63+vec2(31,-11),time/5000.0));
  float field=driftNoise(vec3(uv+vec2(warp*.3,-warp*.25),time/4000.0+7.0));
  float opening=smoothstep(-.06,.30,field);
  float edge=driftNoise(vec3(w/85.0+vec2(salt,37),time/1800.0));
  return clamp(opening+.30*edge*4.0*opening*(1.0-opening),0.0,1.0);
}`;
