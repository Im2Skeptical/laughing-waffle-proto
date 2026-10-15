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
console.log('Water drift: marine/depth masks, restrained smooth movement, spatial variation and absolute-time restoration pass.');
