import assert from 'node:assert/strict';
import { sampleAtmosphere,atmospherePhase } from './atmosphere.js';
const coverages=[];
for(const t of [0,7.875,60,320,997,1600]) {
  let covered=0,changed=0;
  for(let y=-200;y<600;y+=17)for(let x=-500;x<1200;x+=23) {
    const a=sampleAtmosphere(x,y,t,1867),b=sampleAtmosphere(x,y,t+.001,1867);
    for(const key of ['cloud','fog','tone']) {
      assert.ok(a[key]>=0&&a[key]<=1,`${key} outside bounded density`);
      assert.ok(Math.abs(a[key]-b[key])<.001,'No time steps or pop-in');
    }
    assert.deepEqual(sampleAtmosphere(x,y,t,1867),a,'Returning to a time restores the field');
    if(a.cloud>.1)covered++;
    if(Math.abs(a.cloud-sampleAtmosphere(x,y,t+320,1867).cloud)>.1)changed++;
  }
  assert.ok(covered>50&&covered<1800,'Cloud banks need both masses and clear gaps');
  assert.ok(changed>100,'Long scrubs must change cloud formations');
  coverages.push(covered);
}
assert.ok(Math.max(...coverages)-Math.min(...coverages)>100,'Multi-year coverage should vary');
assert.notDeepEqual(atmospherePhase(320,1867),atmospherePhase(320,1868),'Map seeds vary weather');
console.log('Atmosphere: bounded, continuous, seeded fields; changing long-span coverage; exact absolute-time restoration pass.');
