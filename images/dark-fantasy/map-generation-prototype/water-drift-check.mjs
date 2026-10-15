import assert from 'node:assert/strict';
import { waterDriftMask,sampleWaterDrift } from './water-drift.js';
for(const body of [0,2,3,4]) assert.equal(waterDriftMask(body,200),0,'Non-marine material must remain unchanged');
assert.equal(waterDriftMask(1,10),0,'Shallow shore water must remain clear');
assert.ok(waterDriftMask(1,35)>0&&waterDriftMask(1,35)<waterDriftMask(1,65));
assert.equal(waterDriftMask(1,100),1);
for(let t=-1600;t<3200;t+=11.3) {
  const a=sampleWaterDrift(120,80,t),b=sampleWaterDrift(120,80,t+.01);
  a.forEach((c,i)=>{
    assert.ok(Math.abs(c)<=[5,8,7][i],'Colour drift must be restrained');
    assert.ok(Math.abs(c-b[i])<.02,'Continuous time must not jump colours');
  });
}
const at=sampleWaterDrift(120,80,997.25);
sampleWaterDrift(120,80,1600);
assert.deepEqual(sampleWaterDrift(120,80,997.25),at,'Arbitrary seeks must restore exactly');
assert.notDeepEqual(sampleWaterDrift(420,80,997.25),at,'Different ocean locations must not pulse in unison');
assert.notDeepEqual(sampleWaterDrift(120,80,1600),at);
// Regress the previous parallel strips: colour gradients over a large field
// should not share one dominant direction. Zero is isotropic, one is stripes.
for(const t of [0,60,997]) {
  let xx=0,xy=0,yy=0;
  for(let y=-400;y<1000;y+=30)for(let x=-700;x<1500;x+=30) {
    const gx=sampleWaterDrift(x+2,y,t)[1]-sampleWaterDrift(x-2,y,t)[1];
    const gy=sampleWaterDrift(x,y+2,t)[1]-sampleWaterDrift(x,y-2,t)[1];
    xx+=gx*gx;xy+=gx*gy;yy+=gy*gy;
  }
  assert.ok(Math.hypot(xx-yy,2*xy)/(xx+yy)<.4,'Drift must not collapse into aligned bands');
}
console.log('Water drift: marine/depth masks, restrained smooth movement, non-directional patches and absolute-time restoration pass.');
