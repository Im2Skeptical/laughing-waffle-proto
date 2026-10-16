import assert from 'node:assert/strict';
import { sampleAtmosphere,atmospherePhase } from './atmosphere.js';
import { cloudDistanceField } from './cloud-banks.js';
import { cloudDissolve,cloudBoundaryClearance } from './cloud-dissolve.js';
// Approved fog values from v1.0.23: cloud changes must not alter the fog.
for(const [x,y,t,expected] of [[-200,25,0,.3946422743699783],[321,117,60,.6061955230585269],[800,-200,997.125,.6185905813484168]])
  assert.equal(sampleAtmosphere(x,y,t,1867).fog,expected);
for(const t of [0,7.875,60,320,997,1600,4800,9600]) {
  for(let y=-200;y<600;y+=17)for(let x=-500;x<1200;x+=23) {
    const a=sampleAtmosphere(x,y,t,1867),b=sampleAtmosphere(x,y,t+.001,1867);
    assert.ok(a.fog>=0&&a.fog<=1);
    assert.ok(Math.abs(a.fog-b.fog)<.001);
    assert.deepEqual(sampleAtmosphere(x,y,t,1867),a);
  }
}
// One percent of a 300-year drag must not suddenly reshape the clearing.
let maximumScrubChange=0;
for(let t=0;t<=9600;t+=96)for(let x=-300;x<=900;x+=60) {
  const code=(35+256)/512;
  maximumScrubChange=Math.max(maximumScrubChange,Math.abs(
    cloudBoundaryClearance(code,x,80,t+96,1867)-cloudBoundaryClearance(code,x,80,t,1867)));
}
assert.ok(maximumScrubChange<.02,'Boundary is calm over a 300-year scrub');
assert.notDeepEqual(atmospherePhase(320,1867),atmospherePhase(320,1868));
const code=d=>(d+256)/512;
const ids=new Int16Array(360*240).fill(-1);
for(let y=20;y<220;y++)for(let x=60;x<300;x++)ids[y*360+x]=0;
const mask=cloudDistanceField(ids,360,240,360,240);
assert.ok(mask[120*360+180]<128,'Distance includes the playable interior');
assert.ok(mask[120*360+300]>=128,'Exterior distance is positive');
for(let x=300;x<359;x++)assert.ok(mask[120*360+x]<=mask[120*360+x+1]);
const fronts=[];let incursions=0;
// Inspect full boundary travel over the longer, slowed weather history.
for(const t of [0,320,1600,3200,6400,9600].map(t=>t/.18)) {
  let low=-65,high=200;
  for(let i=0;i<20;i++) {
    const d=(low+high)/2;
    if(cloudBoundaryClearance(code(d),40,80,t,1867)<.5)low=d;else high=d;
  }
  fronts.push((low+high)/2);
  for(let x=-300;x<900;x+=19) {
    const a=cloudBoundaryClearance(code(35),x,80,t,1867);
    assert.equal(cloudBoundaryClearance(code(35),x,80,t,1867),a,'Exact boundary restoration');
    assert.ok(Math.abs(a-cloudBoundaryClearance(code(35),x,80,t+.001,1867))<.0001,'Boundary moves continuously');
    assert.equal(cloudBoundaryClearance(code(-80),x,80,t,1867),0,'Deep interior stays readable');
    if(cloudBoundaryClearance(code(-5),x,80,t,1867)>.05)incursions++;
  }
}
assert.ok(Math.max(...fronts)-Math.min(...fronts)>15,'Boundary must travel, not just change cloud texture');
assert.ok(incursions>0,'Boundary occasionally crosses the map edge');
const motion=x=>cloudBoundaryClearance(code(35),x,80,1600,1867)-cloudBoundaryClearance(code(35),x,80,0,1867);
const localMotion=Array.from({length:21},(_,i)=>motion(i*60-300));
assert.ok(Math.max(...localMotion)-Math.min(...localMotion)>.05,'Separate boundary stretches move independently');
assert.notEqual(cloudBoundaryClearance(code(35),40,80,320,1867),cloudBoundaryClearance(code(35),40,80,320,1868));
// A half-dissolved cloud has intact pieces and holes, not a translucent sheet.
let holes=0,cores=0,fringes=0;
for(let y=-200;y<400;y+=7)for(let x=-300;x<500;x+=7) {
  const erosion=cloudDissolve(.78,.54,x,y,320,1867);
  if(erosion<.02)holes++;else if(erosion>.98)cores++;else fringes++;
  assert.equal(cloudDissolve(.78,0,x,y,320,1867),0,'Playable area fully cleared');
  assert.equal(cloudDissolve(.78,1,x,y,320,1867),1,'Clouds away from map retain density');
  assert.ok(Math.abs(erosion-cloudDissolve(.78,.54,x,y,320.001,1867))<.002,'Erosion evolves continuously');
  assert.ok(cloudDissolve(.78,.52,x,y,320,1867)<=erosion,'Approaching land erodes more cloud');
}
assert.ok(holes>500&&cores>500,'Dissolution must create holes and retain solid lobes');
assert.ok(fringes<holes+cores,'Only dissolving edges soften');
console.log(`Atmosphere: approved fog unchanged; deterministic wandering boundary, overhead banks and erosion pass (holes=${holes}, cores=${cores}, fringes=${fringes}, maxScrubChange=${maximumScrubChange.toFixed(4)}).`);
